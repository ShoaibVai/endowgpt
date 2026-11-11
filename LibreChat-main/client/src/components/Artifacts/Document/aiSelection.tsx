import { useCallback, useEffect, useRef, useState } from 'react';
import { BubbleMenu } from '@tiptap/react';
import { Button, useToastContext } from '@librechat/client';
import { ChevronDown, Languages, Sparkles, SpellCheck, X } from 'lucide-react';
import type { TAiEditRequest } from 'librechat-data-provider';
import type { Editor } from '@tiptap/core';
import type { ReactNode } from 'react';
import { compactSpans, isMeaningfulDiff, wordDiff, type DiffSpan } from './diff';
import { useAiEditDocumentMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import './suggestion.css';

/** Inline AI selection edits (PLAN.md §7.1): each action sends the exact
 *  selected text to `/api/documents/ai-edit`, renders the replacement as an
 *  endowInsert/endowDelete diff inside the selection, and offers
 *  Accept/Reject. Deterministic REST call — no tool calling involved. */

export interface SelectionActionsProps {
  editor: Editor;
  model: string;
  /** Selection cap resolved from `startupConfig.documents.aiEditMaxChars`. */
  maxChars?: number;
}

type SelectionSnapshot = {
  from: number;
  to: number;
  text: string;
};

const ACTIONS: Array<{
  mode: TAiEditRequest['mode'];
  labelKey: string;
  icon: ReactNode;
}> = [
  {
    mode: 'improve',
    labelKey: 'com_ui_selection_rewrite',
    icon: <Sparkles className="size-3.5" />,
  },
  { mode: 'expand', labelKey: 'com_ui_selection_expand', icon: <Sparkles className="size-3.5" /> },
  { mode: 'shorten', labelKey: 'com_ui_selection_shorten', icon: <X className="size-3.5" /> },
  {
    mode: 'fix_grammar',
    labelKey: 'com_ui_selection_fix_grammar',
    icon: <SpellCheck className="size-3.5" />,
  },
  {
    mode: 'translate',
    labelKey: 'com_ui_selection_translate',
    icon: <Languages className="size-3.5" />,
  },
];

const TONES = [
  { value: 'Professional', labelKey: 'com_ui_selection_tone_professional' },
  { value: 'Casual', labelKey: 'com_ui_selection_tone_casual' },
  { value: 'Persuasive', labelKey: 'com_ui_selection_tone_persuasive' },
];

const AI_EDIT_ERROR_KEYS: Record<string, string> = {
  ai_edit_rate_limited: 'com_ai_edit_error_rate_limited',
  ai_edit_auth: 'com_ai_edit_error_auth',
  ai_edit_selection_too_large: 'com_ai_edit_selection_too_large',
};

export default function SelectionActions({ editor, model, maxChars }: SelectionActionsProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const aiEdit = useAiEditDocumentMutation();
  const [toneOpen, setToneOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [toneSnapshot, setToneSnapshot] = useState<SelectionSnapshot | null>(null);
  const [customSnapshot, setCustomSnapshot] = useState<SelectionSnapshot | null>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (customOpen) {
      customInputRef.current?.focus();
    }
  }, [customOpen]);

  const snapshotSelection = useCallback((): SelectionSnapshot | null => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n');
    if (!text.trim()) {
      return null;
    }
    return { from, to, text };
  }, [editor]);

  const applySuggestion = useCallback(
    (selection: SelectionSnapshot, suggestedText: string) => {
      const spans = compactSpans(wordDiff(selection.text, suggestedText)) as DiffSpan[];
      const insertType = editor.state.schema.marks.endowInsert;
      const deleteType = editor.state.schema.marks.endowDelete;
      const nodes = spans.map((span) => {
        if (span.kind === 'insert' && insertType) {
          return editor.state.schema.text(span.text, [insertType.create()]);
        }
        if (span.kind === 'delete' && deleteType) {
          return editor.state.schema.text(span.text, [deleteType.create()]);
        }
        return editor.state.schema.text(span.text);
      });
      const tr = editor.state.tr.replaceWith(selection.from, selection.to, nodes);
      editor.view.dispatch(tr);
      editor.commands.focus();
    },
    [editor],
  );

  const runAction = useCallback(
    async (
      mode: TAiEditRequest['mode'],
      instruction: string,
      extras: { language?: string; tone?: string } = {},
      snapshot?: SelectionSnapshot | null,
    ) => {
      const selection = snapshot ?? snapshotSelection();
      if (selection == null) {
        return;
      }
      if (maxChars != null && selection.text.length > maxChars) {
        showToast({ status: 'info', message: localize('com_ai_edit_selection_too_large') });
        return;
      }
      setToneOpen(false);
      setCustomOpen(false);
      setCustomValue('');
      try {
        const result = await aiEdit.mutateAsync({
          text: selection.text,
          instruction,
          model,
          mode,
          ...extras,
        });
        /* The request is async: the user may have moved on before it lands.
         * Only apply the replacement over the exact text it was generated for. */
        const current = editor.state.doc.textBetween(selection.from, selection.to, '\n');
        if (current !== selection.text) {
          showToast({ status: 'info', message: localize('com_ai_edit_selection_changed') });
          return;
        }
        if (!isMeaningfulDiff(selection.text, result.text)) {
          showToast({ status: 'info', message: localize('com_ai_edit_failed') });
          return;
        }
        applySuggestion(selection, result.text);
      } catch {
        const code = (aiEdit.error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error;
        const key = AI_EDIT_ERROR_KEYS[code ?? ''] ?? 'com_ai_edit_error_unavailable';
        showToast({ status: 'error', message: localize(key as never) });
      }
    },
    [aiEdit, applySuggestion, editor, localize, maxChars, model, showToast, snapshotSelection],
  );

  const shouldShow = useCallback(({ editor: current }: { editor: Editor }) => {
    if (!current.isEditable) {
      return false;
    }
    const { from, to, empty } = current.state.selection;
    if (empty || !current.state.doc.textBetween(from, to, '\n').trim()) {
      return false;
    }
    /* A suggestion replaces one inline range; a selection spanning
     * paragraphs would need a block-level rebuild. */
    return current.state.selection.$from.sameParent(current.state.selection.$to);
  }, []);

  const submitCustom = useCallback(() => {
    const instruction = customValue.trim();
    if (!instruction) {
      return;
    }
    void runAction('custom', instruction, {}, customSnapshot);
  }, [customSnapshot, customValue, runAction]);

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100, placement: 'top' }}
      shouldShow={shouldShow}
    >
      <div
        className="border-border-light bg-surface-primary-alt text-text-primary flex flex-col gap-1 rounded-lg border p-1 shadow-lg"
        data-testid="endow-selection-actions"
      >
        <div
          className="flex flex-wrap items-center gap-0.5"
          onMouseDown={(e) => e.preventDefault()}
        >
          {ACTIONS.map(({ mode, labelKey, icon }) => (
            <Button
              key={mode}
              size="sm"
              variant="ghost"
              disabled={aiEdit.isLoading}
              onClick={() =>
                void runAction(
                  mode,
                  localize(labelKey as never),
                  mode === 'translate' ? { language: 'English' } : {},
                )
              }
            >
              <span className="flex items-center gap-1">
                {icon}
                {localize(labelKey as never)}
              </span>
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            disabled={aiEdit.isLoading}
            aria-haspopup="menu"
            aria-expanded={toneOpen}
            onClick={() => {
              setToneSnapshot(snapshotSelection());
              setToneOpen((open) => !open);
              setCustomOpen(false);
            }}
          >
            <span className="flex items-center gap-1">
              {localize('com_ui_selection_tone')}
              <ChevronDown className="size-3" aria-hidden="true" />
            </span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={aiEdit.isLoading}
            onClick={() => {
              setCustomSnapshot(snapshotSelection());
              setCustomOpen((open) => !open);
              setToneOpen(false);
            }}
          >
            {localize('com_ui_selection_ask_ai')}
          </Button>
        </div>

        {toneOpen && (
          <div
            className="border-border-light flex flex-wrap items-center gap-0.5 border-t pt-1"
            role="menu"
            onMouseDown={(e) => e.preventDefault()}
          >
            {TONES.map(({ value, labelKey }) => (
              <Button
                key={value}
                size="sm"
                variant="ghost"
                role="menuitem"
                disabled={aiEdit.isLoading}
                onClick={() =>
                  void runAction(
                    'tone',
                    localize('com_ui_selection_tone_instruction', {
                      tone: localize(labelKey as never),
                    }),
                    { tone: value },
                    toneSnapshot,
                  )
                }
              >
                {localize(labelKey as never)}
              </Button>
            ))}
          </div>
        )}

        {customOpen && (
          <form
            className="border-border-light flex items-center gap-1 border-t pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              submitCustom();
            }}
          >
            <input
              ref={customInputRef}
              value={customValue}
              onChange={(event) => setCustomValue(event.target.value)}
              placeholder={localize('com_ui_selection_ai_placeholder')}
              aria-label={localize('com_ui_selection_ai_placeholder')}
              className="border-border-light bg-surface-primary text-text-primary h-7 min-w-56 grow rounded-md border px-2 text-xs outline-none"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setCustomOpen(false);
                  setCustomValue('');
                }
              }}
            />
            <Button
              type="submit"
              size="sm"
              variant="submit"
              disabled={aiEdit.isLoading || !customValue.trim()}
            >
              {localize('com_ui_selection_ai_run')}
            </Button>
          </form>
        )}
      </div>
    </BubbleMenu>
  );
}
