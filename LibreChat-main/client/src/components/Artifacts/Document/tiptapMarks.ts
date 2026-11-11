import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * endowInsert / endowDelete — the AI-suggestion marks (PLAN.md §7.1). A
 * suggestion lands as a word-level diff split across these two marks:
 * additions are wrapped in `endowInsert`, the replaced words in `endowDelete`.
 * Accepting unwraps the insertions and drops the deletions; rejecting removes
 * the additions and restores the deletions. Both unwrap cheaply, so a
 * suggestion never touches document structure.
 */

const colors = {
  insert: {
    class: 'endow-suggestion-insert',
    style:
      'text-decoration: underline; text-decoration-color: #24d5d0; text-decoration-thickness: 2px; text-underline-offset: 3px;',
  },
  delete: {
    class: 'endow-suggestion-delete',
    style:
      'text-decoration: line-through; text-decoration-color: #f1352a; text-decoration-thickness: 2px; opacity: 0.6;',
  },
} as const;

function createSuggestionMark(kind: 'insert' | 'delete') {
  const spec = colors[kind];
  return Mark.create({
    name: `endow${kind === 'insert' ? 'Insert' : 'Delete'}`,
    inclusive: false,
    renderHTML({ HTMLAttributes }) {
      return [
        kind === 'insert' ? 'ins' : 'del',
        mergeAttributes(HTMLAttributes, {
          class: spec.class,
          style: spec.style,
          'data-endow-suggestion': kind,
        }),
      ];
    },
  });
}

export const EndowInsertMark = createSuggestionMark('insert');
export const EndowDeleteMark = createSuggestionMark('delete');
