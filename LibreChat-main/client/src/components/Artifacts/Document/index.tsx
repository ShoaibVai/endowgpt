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
  FileDown,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  History,
  Italic,
  Link2,
  List,
  ListOrdered,
  Copy,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
  X,
} from 'lucide-react';
import type { Artifact } from '~/common';
import { TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import { ArtifactCodeEditor } from '../ArtifactCodeEditor';
import { useEditArtifact, useGetStartupConfig, useSaveDocumentMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { useArtifactsContext } from '~/Providers';
import { htmlToMd, mdToHtml } from './markdown';
import { copyAsRichText, markdownToDocxBlob, markdownToPdfBlob } from './exporters';
import { acceptSuggestion, findSuggestionRange, rejectSuggestion, type SuggestionRange } from './suggestionActions';
import SelectionActions from './aiSelection';
import VersionsDrawer from './versions';
import { EndowDeleteMark, EndowInsertMark } from './tiptapMarks';
import './document.css';
import './suggestion.css';

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
  conversationId: conversationIdProp,
}: {
  artifact: Artifact;
  isSharedConvo?: boolean;
  /** Set by the standalone /documents route, which sits outside the chat
   *  layout's ArtifactsProvider. */
  conversationId?: string | null;
}) {
  const artifactsContext = useArtifactsContext();
  const conversationId = conversationIdProp ?? artifactsContext.conversationId;
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();
  /** Shared transcripts render read-only; a missing message index is fine for
   *  store-backed documents (the /documents route has no message to edit). */
  const readOnly = isSharedConvo === true;
  const monacoRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  /** The selection edits ride the deployment's default model (allow-listed
   *  server-side); falling back to the first spec when none is marked default. */
  const aiEditModel = useMemo(() => {
    const specs = startupConfig?.modelSpecs?.list ?? [];
    const preferred = specs.find((spec) => spec.default === true) ?? specs[0];
    return preferred?.preset?.model ?? 'deepseek-v4.1-flash-free';
  }, [startupConfig?.modelSpecs?.list]);
  const [showVersions, setShowVersions] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<SuggestionRange | null>(null);
  /** Editor-local markdown mirror, so the docx/pdf exports and the save path
   *  agree on what the user is looking at. */
  const [currentMarkdown, setCurrentMarkdown] = useState<string | null>(null);
  /** Newest /api/documents version id this editor has written; the next save
   *  sends it as `baseVersionId`, so a rival session's write surfaces as a 409. */
  const lastVersionIdRef = useRef<string | null>(null);
  /** Editor artifactId: the artifact id doubles as the document store key. */
  const documentArtifactId = artifact.id;
  /** The 409 carries the current store state; the user can keep editing after
   *  a reload instead of losing work. */
  const saveDocumentMutation = useSaveDocumentMutation(
    conversationId ?? '',
    documentArtifactId,
    {
      onError: (error) => {
        savingRef.current = false;
        setIsSaving(false);
        const status = (error as { response?: { status?: number } })?.response?.status ?? 0;
        showToast({
          status: 'error',
          message:
            status === 409
              ? localize('com_ui_document_conflict')
              : localize('com_error_document_save_failed'),
        });
      },
    },
  );

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
      savingRef.current = true;
      setIsSaving(true);

      /** The store write is the source of truth (versions + conflict
       *  detection); the message artifact follows when this document lives
       *  inside a conversation message. */
      saveDocumentMutation.mutate(
        {
          title: artifact.title?.trim() || 'Untitled document',
          content: markdown,
          baseVersionId: lastVersionIdRef.current ?? undefined,
          versionSource: 'user',
        },
        {
          onSuccess: (data) => {
            importedMarkdownRef.current = data.content;
            lastVersionIdRef.current = data.versionId;
            savingRef.current = false;
            setIsSaving(false);
            const queued = pendingSaveRef.current;
            pendingSaveRef.current = null;
            if (queued != null && queued !== data.content) {
              flushSave(queued);
              return;
            }
            const target = getArtifactEditTarget(artifact);
            if (target != null && target.messageId) {
              editArtifact.mutate({
                messageId: target.messageId,
                index: target.index,
                original: importedMarkdownRef.current ?? sourceMarkdown,
                updated: data.content,
              });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artifact, localize, showToast, sourceMarkdown],
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
      setCurrentMarkdown(nextMarkdown);
      if (nextMarkdown === importedMarkdownRef.current) {
        return;
      }
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        flushSave(nextMarkdown);
      }, 800);
    },
    onTransaction: ({ editor: current }) => {
      setPendingSuggestion(findSuggestionRange(current));
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

  const handleAcceptSuggestion = useCallback(() => {
    if (pendingSuggestion != null && editor) {
      acceptSuggestion(editor, pendingSuggestion);
      setPendingSuggestion(null);
    }
  }, [editor, pendingSuggestion]);

  const handleRejectSuggestion = useCallback(() => {
    if (pendingSuggestion != null && editor) {
      rejectSuggestion(editor, pendingSuggestion);
      setPendingSuggestion(null);
    }
  }, [editor, pendingSuggestion]);

  const downloadBlob = useCallback((blob: Blob, filename: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([blob], { type: mime }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportBaseName = useCallback(
    () => (artifact.title?.trim() || 'document').replace(/[\\/:*?"<>|]/g, '-'),
    [artifact.title],
  );

  const handleExportPdf = useCallback(async () => {
    const markdown = currentMarkdown ?? importedMarkdownRef.current ?? sourceMarkdown;
    downloadBlob(markdownToPdfBlob(markdown), `${exportBaseName()}.pdf`, 'application/pdf');
  }, [currentMarkdown, downloadBlob, exportBaseName, sourceMarkdown]);

  const handleExportDocx = useCallback(async () => {
    const markdown = currentMarkdown ?? importedMarkdownRef.current ?? sourceMarkdown;
    const blob = await markdownToDocxBlob(markdown, artifact.title ?? 'endowGPT document');
    downloadBlob(blob, `${exportBaseName()}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }, [artifact.title, currentMarkdown, downloadBlob, exportBaseName, sourceMarkdown]);

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
          <Divider />
          <ToolbarButton
            name="copy-rich"
            label={localize('com_ui_copy_rich_text')}
            onClick={() => void handleCopyRich()}
            active={false}
            icon={<Copy className="size-4" />}
          />
          <ToolbarButton
            name="export-docx"
            label={localize('com_ui_export_docx')}
            onClick={() => void handleExportDocx()}
            active={false}
            icon={<FileText className="size-4" />}
          />
          <ToolbarButton
            name="export-pdf"
            label={localize('com_ui_export_pdf')}
            onClick={() => void handleExportPdf()}
            active={false}
            icon={<FileDown className="size-4" />}
          />
          <ToolbarButton
            name="versions"
            label={localize('com_ui_document_versions')}
            onClick={() => setShowVersions((open) => !open)}
            active={showVersions}
            icon={<History className="size-4" />}
            disabled={conversationId == null}
          />
          <div className="ml-auto px-1 text-xs opacity-60">
            {isSaving ? localize('com_ui_saving') : localize('com_ui_saved')}
          </div>
        </div>
      )}
      {!readOnly && (
        <SelectionActions editor={editor} model={aiEditModel} />
      )}
      {pendingSuggestion != null && !readOnly && (
        <div
          className="endow-suggestion-review border-border-light bg-surface-primary-alt flex items-center gap-1 border-b px-2 py-1"
          data-testid="endow-suggestion-review"
        >
          <span className="text-text-secondary px-1 text-xs">
            {localize('com_ui_suggestion_review')}
          </span>
          <Button
            size="sm"
            variant="submit"
            className="h-7 px-2 text-xs"
            onClick={handleAcceptSuggestion}
          >
            {localize('com_ui_suggestion_accept')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={handleRejectSuggestion}
          >
            {localize('com_ui_suggestion_reject')}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={handleRejectSuggestion}
            aria-label={localize('com_ui_close')}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
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
      </Tabs.Content>
      <Tabs.Content
        value="code"
        id="artifacts-markdown-source"
        className="min-h-0 w-full flex-1 overflow-hidden"
        tabIndex={-1}
      >
        <ArtifactCodeEditor artifact={artifact} monacoRef={monacoRef} readOnly={readOnly} />
      </Tabs.Content>
      {showVersions && conversationId != null && (
        <VersionsDrawer
          conversationId={conversationId}
          artifactId={artifact.id}
          onClose={() => setShowVersions(false)}
          onRestored={(markdown) => {
            importedMarkdownRef.current = markdown;
            editor?.commands.setContent(mdToHtml(markdown), false);
            setCurrentMarkdown(markdown);
          }}
        />
      )}
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
