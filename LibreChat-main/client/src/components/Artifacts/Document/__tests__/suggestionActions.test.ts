import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EndowDeleteMark, EndowInsertMark } from '../tiptapMarks';
import { acceptSuggestion, findSuggestionRange, rejectSuggestion } from '../suggestionActions';

/** Accept/reject semantics (PLAN.md §7.1): accept keeps untouched text and
 *  insertions, reject keeps untouched text and the original words, both
 *  rebuild the marked range in one transaction and strip the marks. The
 *  suggestion is applied the same way `aiSelection.applySuggestion` does it:
 *  the replacement text marked `endowInsert` followed by the original marked
 *  `endowDelete`. */

const editors: Editor[] = [];

function createEditor(html: string): Editor {
  const editor = new Editor({
    extensions: [StarterKit, EndowInsertMark, EndowDeleteMark],
    content: html,
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

/** Replaces [from, to) with `replacement` (insert-marked) plus the original
 *  text (delete-marked), mirroring the diff applier in aiSelection.tsx. */
function applySuggestion(editor: Editor, from: number, to: number, replacement: string) {
  const original = editor.state.doc.textBetween(from, to, '\n');
  const nodes = [
    editor.state.schema.text(replacement, [editor.state.schema.marks.endowInsert.create()]),
    editor.state.schema.text(original, [editor.state.schema.marks.endowDelete.create()]),
  ];
  editor.view.dispatch(editor.state.tr.replaceWith(from, to, nodes));
}

describe('findSuggestionRange', () => {
  test('covers the contiguous marked range or reports none', () => {
    const marked = createEditor('<p>aaaa bbbb cccc</p>');
    applySuggestion(marked, 6, 10, 'XXXX');

    const plain = createEditor('<p>aaaa bbbb cccc</p>');

    // "XXXX" (insert) and "bbbb" (delete) now sit at 6-14.
    expect(findSuggestionRange(marked)).toEqual({ from: 6, to: 14 });
    expect(findSuggestionRange(plain)).toBeNull();
  });
});

describe('acceptSuggestion', () => {
  test('keeps untouched text and the insertion, drops the original, clears marks', () => {
    const editor = createEditor('<p>aaaa bbbb cccc</p>');
    applySuggestion(editor, 6, 10, 'XXXX');

    acceptSuggestion(editor, findSuggestionRange(editor) ?? { from: 0, to: 0 });

    expect(editor.getText()).toBe('aaaa XXXX cccc');
    expect(findSuggestionRange(editor)).toBeNull();
  });

  test('preserves formatting the user added on top of a pending suggestion', () => {
    const editor = createEditor('<p>aaaa bbbb</p>');
    applySuggestion(editor, 6, 10, 'XXXX');
    // The user bolds the pending replacement before deciding.
    editor.view.dispatch(editor.state.tr.addMark(6, 10, editor.state.schema.marks.bold.create()));

    acceptSuggestion(editor, findSuggestionRange(editor) ?? { from: 0, to: 0 });

    expect(editor.getHTML()).toContain('<strong>XXXX</strong>');
    expect(editor.getText()).toBe('aaaa XXXX');
  });
});

describe('rejectSuggestion', () => {
  test('keeps untouched text and the original words, drops the insertion', () => {
    const editor = createEditor('<p>aaaa bbbb cccc</p>');
    applySuggestion(editor, 6, 10, 'XXXX');

    rejectSuggestion(editor, findSuggestionRange(editor) ?? { from: 0, to: 0 });

    expect(editor.getText()).toBe('aaaa bbbb cccc');
    expect(findSuggestionRange(editor)).toBeNull();
  });
});
