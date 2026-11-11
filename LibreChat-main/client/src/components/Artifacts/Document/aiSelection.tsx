import { useCallback, useEffect, useState } from 'react';
import { Button, useToastContext } from '@librechat/client';
import { Check, Languages, Sparkles, SpellCheck, X } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import { useAiEditDocumentMutation } from '~/data-provider';
import type { TAiEditRequest } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { compactSpans, isMeaningfulDiff, wordDiff, type DiffSpan } from './diff';
import './suggestion.css';

/** Inline AI selection edits (PLAN.md §7.1): each action sends the exact
 *  selected text to `/api/documents/ai-edit`, renders the replacement as an
 *  endowInsert/endowDelete diff inside the selection, and offers
 *  Accept/Reject. Deterministic REST call — no tool calling involved. */

export interface SelectionActionsProps {
  editor: Editor;
  model: string;
}

const ACTIONS: Array<{
  mode: TAiEditRequest['mode'];
  labelKey: string;
  icon: React.ReactNode;
}> = [
  { mode: 'improve', labelKey: 'com_ui_selection_improve', icon: <Sparkles className="size-4" /> },
  { mode: 'shorten', labelKey: 'com_ui_selection_shorten', icon: <X className="size-4" /> },
  { mode: 'expand', labelKey: 'com_ui_selection_expand', icon: <Sparkles className="size-4" /> },
  { mode: 'fix_grammar', labelKey: 'com_ui_selection_fix_grammar', icon: <SpellCheck className="size-4" /> },
  { mode: 'translate', labelKey: 'com_ui_selection_translate', icon: <Languages className="size-4" /> },
  { mode: 'tone', labelKey: 'com_ui_selection_tone', icon: <Languages className="size-4" /> },
];

export default function SelectionActions({ editor, model }: SelectionActionsProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const aiEdit = useAiEditDocumentMutation();
  const [hasSelection, setHasSelection] = useState(false);
  const [isSingleLine, setIsSingleLine] = useState(true);

  useEffect(() => {
    const refresh = () => {
      const { from, to, empty } = editor.state.selection;
      const hasText = !empty && editor.state.doc.textBetween(from, to, '\n').trim().length > 0;
      setHasSelection(hasText);
      // Suggestions are inline: a selection spanning paragraphs would need a
      // block-level rebuild, so multi-block ranges stay out of scope here.
      const $from = editor.state.selection.$from;
      const $to = editor.state.selection.$to;
      setIsSingleLine($from.sameParent($to));
    };
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    refresh();
    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
    };
  }, [editor]);

  const applySuggestion = useCallback(
    (originalText: string, suggestedText: string) => {
      const { from, to } = editor.state.selection;
      const spans = compactSpans(wordDiff(originalText, suggestedText)) as DiffSpan[];
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
      const tr = editor.state.tr.replaceWith(from, to, nodes);
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
    ) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, '\n');
      if (!text.trim()) {
        return;
      }
      try {
        const result = await aiEdit.mutateAsync({
          text,
          instruction,
          model,
          mode,
          ...extras,
        });
        if (!isMeaningfulDiff(text, result.text)) {
          showToast({ status: 'info', message: localize('com_ai_edit_failed') });
          return;
        }
        applySuggestion(text, result.text);
      } catch {
        const code = (aiEdit.error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error;
        const key =
          code === 'ai_edit_rate_limited'
            ? 'com_ai_edit_error_rate_limited'
            : code === 'ai_edit_auth'
              ? 'com_ai_edit_error_auth'
              : 'com_ai_edit_error_unavailable';
        showToast({ status: 'error', message: localize(key) });
      }
    },
    [aiEdit, applySuggestion, editor, localize, model, showToast],
  );

  if (!hasSelection || !isSingleLine) {
    return null;
  }

  return (
    <div
      className="border-border-light flex flex-wrap items-center gap-0.5 border-t px-2 py-1"
      data-testid="endow-selection-actions"
    >
      {ACTIONS.map(({ mode, labelKey, icon }) => (
        <Button
          key={mode}
          size="sm"
          variant="ghost"
          disabled={aiEdit.isLoading}
          onClick={() =>
            runAction(
              mode,
              localize(labelKey as never),
              mode === 'translate' ? { language: 'English' } : {},
            )
          }
          className="h-7 gap-1.5 px-2 text-xs"
        >
          {icon}
          {localize(labelKey as never)}
        </Button>
      ))}
      <Button
        size="sm"
        variant="ghost"
        disabled={aiEdit.isLoading}
        onClick={() => {
          const instruction = window.prompt(localize('com_ui_selection_custom')) ?? '';
          if (instruction.trim()) {
            void runAction('custom', instruction);
          }
        }}
        className="h-7 px-2 text-xs"
      >
        {localize('com_ui_selection_custom')}
      </Button>
    </div>
  );
}
