import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import type { editor as monacoEditor } from 'monaco-editor';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { Button, useToastContext } from '@librechat/client';
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import type { Artifact } from '~/common';
import { TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import { ArtifactCodeEditor } from '../ArtifactCodeEditor';
import { useEditArtifact } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { htmlToMd, mdToHtml } from './markdown';
import { copyAsRichText } from './exporters';
import { EndowDeleteMark, EndowInsertMark } from './tiptapMarks';
import './document.css';

/* Editor toolbar rounds common writing actions first; the mark edit route
 * (`heading`, lists, table, link, undo/redo) sits in the same row and stays
 * keyboard-reachable. */

const BASE_EXTENSIONS = [
  StarterKit.configure({ codeBlock: { HTMLAttributes: { class: 'endow-code' } } }),
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
  }),
  Placeholder.configure({ placeholder: '' }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  EndowInsertMark,
  EndowDeleteMark,
];

export default function DocumentArtifactTabs({
  artifact,
  isSharedConvo,
}: {
  artifact: Artifact;
  isSharedConvo?: boolean;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const readOnly = isSharedConvo === true || artifact.index == null;
  const monacoRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);

  /** Markdown the editor currently renders; used to detect external model
   *  updates (a model edit or a version switch) vs. a user's own keystrokes. */
  const importedMarkdownRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Saves serialize: while one save is in flight the next candidate content
   *  waits here, so the request chain never sends a stale `original` (the
   *  artifact edit endpoint matches on it). */
  const pendingSaveRef = useRef<string | null>(null);
  const savingRef = useRef(false);

  const editArtifact = useEditArtifact();

  const sourceMarkdown = useMemo(
    () => artifact.content ?? '',
    [artifact.content],
  );

  const flushSave = useCallback(
    (markdown: string) => {
      if (savingRef.current) {
        // A save is in flight; the newest content queues and flushes after it.
        pendingSaveRef.current = markdown;
        return;
      }
      const target = getArtifactEditTarget(artifact);
      if (target == null) {
        return;
      }
      savingRef.current = true;
      setIsSaving(true);
      editArtifact.mutate(
        {
          messageId: target.messageId,
          index: target.index,
          original: importedMarkdownRef.current ?? sourceMarkdown,
          updated: markdown,
        },
        {
          onSuccess: (_data, vars) => {
            importedMarkdownRef.current = vars.updated;
            savingRef.current = false;
            setIsSaving(false);
            const queued = pendingSaveRef.current;
            pendingSaveRef.current = null;
            if (queued != null && queued !== vars.updated) {
              flushSave(queued);
            }
          },
          onError: () => {
            savingRef.current = false;
            setIsSaving(false);
            showToast({
              status: 'error',
              message: localize('com_error_document_save_failed'),
            });
          },
        },
      );
    },
    [artifact, editArtifact, localize, showToast, sourceMarkdown],
  );

  const editor = useEditor({
    extensions: BASE_EXTENSIONS,
    content: mdToHtml(sourceMarkdown),
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => {
      if (readOnly || importedMarkdownRef.current == null) {
        return;
      }
      const nextMarkdown = htmlToMd(current.getHTML());
      if (nextMarkdown === importedMarkdownRef.current) {
        return;
      }
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        flushSave(nextMarkdown);
      }, 800);
    },
  });

  /* An external update (model re-emitted the artifact, or the user switched
   * versions) re-imports, so the editor tracks the artifact it was handed. */
  useEffect(() => {
    if (importedMarkdownRef.current == null || sourceMarkdown === importedMarkdownRef.current) {
      /* first import, or the artifact already matches what we imported */
      if (importedMarkdownRef.current == null) {
        importedMarkdownRef.current = sourceMarkdown;
      }
      return;
    }
    importedMarkdownRef.current = sourceMarkdown;
    editor?.commands.setContent(mdToHtml(sourceMarkdown), false);
  }, [sourceMarkdown, editor]);

  useEffect(() => () => clearTimeout(autosaveTimer.current), []);

  const handleCopyRich = useCallback(async () => {
    if (!editor) {
      return;
    }
    const html = editor.getHTML();
    const plain = htmlToMd(html);
    const copied = await copyAsRichText(html, plain);
    if (!copied) {
      /* Some hardened browsers refuse ClipboardItem writes; the plain-text
       * fallback keeps copy useful instead of failing outright. */
      await navigator.clipboard?.writeText(plain).catch(() => undefined);
    }
  }, [editor]);

  if (!editor) {
    return <div className="flex h-16 items-center justify-center" aria-busy="true" />;
  }

  return (
    <div className="flex h-full w-full flex-col">
      {!readOnly && (
        <div className="border-border-light bg-surface-primary-alt flex shrink-0 flex-wrap items-center gap-0.5 border-b px-2 py-1">
          <ToolbarButton
            name="bold"
            label={localize('com_ui_bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            icon={<Bold className="size-4" />}
          />
          <ToolbarButton
            name="italic"
            label={localize('com_ui_italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            icon={<Italic className="size-4" />}
          />
          <ToolbarButton
            name="underline"
            label={localize('com_ui_underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            icon={<UnderlineIcon className="size-4" />}
          />
          <ToolbarButton
            name="strike"
            label={localize('com_ui_strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            icon={<Strikethrough className="size-4" />}
          />
          <Divider />
          <ToolbarButton
            name="h1"
            label={localize('com_ui_heading')}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            icon={<Heading1 className="size-4" />}
          />
          <ToolbarButton
            name="h2"
            label={localize('com_ui_heading')}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            icon={<Heading2 className="size-4" />}
          />
          <ToolbarButton
            name="h3"
            label={localize('com_ui_heading')}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            icon={<Heading3 className="size-4" />}
          />
          <Divider />
          <ToolbarButton
            name="bullet-list"
            label={localize('com_ui_list')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            icon={<List className="size-4" />}
          />
          <ToolbarButton
            name="ordered-list"
            label={localize('com_ui_list')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            icon={<ListOrdered className="size-4" />}
          />
          <ToolbarButton
            name="code-block"
            label={localize('com_ui_code')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive('codeBlock')}
            icon={<Code2 className="size-4" />}
          />
          <ToolbarButton
            name="table"
            label={localize('com_ui_artifact_format_table')}
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 2, cols: 3, withHeaderRow: true })
                .run()
            }
            active={editor.isActive('table')}
            icon={<TableIcon className="size-4" />}
          />
          <Divider />
          <ToolbarButton
            name="link"
            label={localize('com_ui_link')}
            onClick={() => {
              const previous = editor.getAttributes('link').href as string | undefined;
              const href = window.prompt(localize('com_ui_link_url'), previous ?? '')?.trim();
              if (href == null) {
                return;
              }
              if (href === '') {
                editor.chain().focus().unsetLink().run();
                return;
              }
              editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
            }}
            active={editor.isActive('link')}
            icon={<Link2 className="size-4" />}
          />
          <Divider />
          <ToolbarButton
            name="undo"
            label={localize('com_ui_undo')}
            onClick={() => editor.chain().focus().undo().run()}
            active={false}
            icon={<Undo2 className="size-4" />}
            disabled={!editor.can().undo()}
          />
          <ToolbarButton
            name="redo"
            label={localize('com_ui_redo')}
            onClick={() => editor.chain().focus().redo().run()}
            active={false}
            icon={<Redo2 className="size-4" />}
            disabled={!editor.can().redo()}
          />
          <div className="ml-auto px-1 text-xs opacity-60">
            {isSaving ? localize('com_ui_saving') : localize('com_ui_saved')}
          </div>
        </div>
      )}
      <Tabs.Content
        value="preview"
        id="artifacts-preview"
        className="h-full w-full grow overflow-auto"
        tabIndex={-1}
      >
        <div className="prose prose-sm sm:prose-base max-w-none bg-surface-primary text-text-primary px-8 py-6">
          <EditorContent editor={editor} />
        </div>
        <div className="sr-only">
          <button type="button" onClick={handleCopyRich}>
            {localize('com_ui_copy')}
          </button>
        </div>
      </Tabs.Content>
      <Tabs.Content
        value="code"
        id="artifacts-markdown-source"
        className="min-h-0 w-full flex-1 overflow-hidden"
        tabIndex={-1}
      >
        <ArtifactCodeEditor artifact={artifact} monacoRef={monacoRef} readOnly={readOnly} />
      </Tabs.Content>
    </div>
  );
}

function getArtifactEditTarget(artifact: Artifact) {
  if (artifact.index == null) {
    return null;
  }
  return {
    messageId: artifact.messageId ?? '',
    index: artifact.index,
  };
}

function Divider() {
  return (
    <span
      className="bg-border-light mx-1 h-5 w-px shrink-0"
      role="presentation"
      aria-hidden="true"
    />
  );
}

function ToolbarButton({
  name,
  label,
  onClick,
  active,
  icon,
  disabled,
}: {
  name: string;
  label: string;
  onClick: () => void;
  active: boolean;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      data-tool={name}
      disabled={disabled}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={active ? 'text-accent-primary h-8 w-8' : 'h-8 w-8'}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  );
}

/* keep the imported artifact type honest with the panel's expectations */
export const DOCUMENT_TYPE = TOOL_ARTIFACT_TYPES.DOCUMENT;
