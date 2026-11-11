import type { Editor } from '@tiptap/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { Fragment, Slice } from '@tiptap/pm/model';

/** Accept/reject machinery for inline suggestions (PLAN.md §7.1). The whole
 *  suggestion lives inside one contiguous inline range, marked endowInsert /
 *  endowDelete; both verdicts rebuild that range in a single transaction, so
 *  the document never shows an intermediate state. */

export interface SuggestionRange {
  from: number;
  to: number;
}

const INSERT = 'endowInsert';
const DELETE = 'endowDelete';

function hasSuggestionMarks(node: ProseNode, types: Array<string>): boolean {
  return node.marks.some((mark) => types.includes(mark.type.name));
}

/** The contiguous range the marks cover, or null when none remain. */
export function findSuggestionRange(editor: Editor): SuggestionRange | null {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) {
      return true;
    }
    if (hasSuggestionMarks(node, [INSERT, DELETE])) {
      from = Math.min(from, pos);
      to = Math.max(to, pos + node.nodeSize);
    }
    return true;
  });
  if (from === Number.POSITIVE_INFINITY) {
    return null;
  }
  return { from, to };
}

/**
 * Rebuilds the marked range keeping only nodes whose marks match `keep`
 * (with the suggestion marks stripped). One replacement, one transaction.
 */
function rebuildRange(
  editor: Editor,
  range: SuggestionRange,
  keep: Array<'plain' | 'endowInsert' | 'endowDelete'>,
): void {
  const { state } = editor;
  const slice = state.doc.slice(range.from, range.to);
  const kept: ProseNode[] = [];

  slice.content.descendants((node) => {
    if (!node.isText) {
      return true;
    }
    const isInsert = node.marks.some((mark) => mark.type.name === INSERT);
    const isDelete = node.marks.some((mark) => mark.type.name === DELETE);
    const wanted =
      (isInsert && keep.includes(INSERT)) ||
      (isDelete && keep.includes(DELETE)) ||
      (!isInsert && !isDelete && keep.includes('plain'));
    if (!wanted) {
      return true;
    }
    // Strip only the suggestion marks; formatting that rode along (bold, …)
    // stays on the kept text.
    const marks = node.marks.filter((mark) => ![INSERT, DELETE].includes(mark.type.name));
    kept.push(state.schema.text(node.textContent, marks));
    return true;
  });

  const tr = state.tr.replaceWith(range.from, range.to, Fragment.fromArray(kept));
  editor.view.dispatch(tr);
}

export function acceptSuggestion(editor: Editor, range: SuggestionRange): void {
  // Keep untouched text and insertions (marks stripped); drop deletions.
  rebuildRange(editor, range, ['plain', INSERT]);
}

export function rejectSuggestion(editor: Editor, range: SuggestionRange): void {
  // Keep untouched text and the original words (deletions unmarked); drop insertions.
  rebuildRange(editor, range, ['plain', DELETE]);
}

export function hasPendingSuggestion(editor: Editor): boolean {
  return findSuggestionRange(editor) != null;
}

/** Exported for the diff applier in aiSelection.tsx. */
export { Fragment, Slice };
