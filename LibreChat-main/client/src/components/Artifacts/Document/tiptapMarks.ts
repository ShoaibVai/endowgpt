import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * endowInsert / endowDelete — the AI-suggestion marks (PLAN.md §7.1). A
 * suggestion lands as a word-level diff split across these two marks:
 * additions are wrapped in `endowInsert`, the replaced words in `endowDelete`.
 * Accepting unwraps the insertions and drops the deletions; rejecting removes
 * the additions and restores the deletions. Both unwrap cheaply, so a
 * suggestion never touches document structure.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    endowSuggestion: {
      /** Wrap the current selection in the named suggestion mark. */
      setEndowSuggestion: (kind: 'insert' | 'delete') => ReturnType;
      /** Strip every suggestion mark in the document (keeps insert content). */
      clearEndowSuggestions: () => ReturnType;
    };
  }
}

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
    addCommands() {
      return {
        setEndowSuggestion:
          () =>
          ({ commands }) =>
            commands.setMark(this.name),
        clearEndowSuggestions:
          () =>
          ({ tr, state }) => {
            const types = [
              state.schema.marks.endowInsert,
              state.schema.marks.endowDelete,
            ].filter(Boolean);
            if (types.length === 0) {
              return false;
            }
            state.doc.descendants((node, pos) => {
              if (!node.isText) {
                return true;
              }
              for (const type of types) {
                if (node.marks.some((mark) => mark.type === type)) {
                  tr.removeMark(pos, pos + node.nodeSize, type);
                }
              }
              return true;
            });
            return true;
          },
      };
    },
  });
}

export const EndowInsertMark = createSuggestionMark('insert');
export const EndowDeleteMark = createSuggestionMark('delete');
