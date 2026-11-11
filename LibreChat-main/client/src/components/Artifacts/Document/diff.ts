import { diffWordsWithSpace } from 'diff';

/** Word-level diff for inline AI suggestions (PLAN.md §7.1). The suggestion
 *  renders as `endowInsert` (additions) over `endowDelete` (removals) spans so
 *  accept/reject map to one mark strip each. Pure logic; unit-tested. */

export interface DiffSpan {
  text: string;
  kind: 'same' | 'insert' | 'delete';
}

export function wordDiff(original: string, suggested: string): DiffSpan[] {
  return diffWordsWithSpace(original, suggested).map((part) => ({
    text: part.value,
    kind: part.added === true ? 'insert' : part.removed === true ? 'delete' : 'same',
  }));
}

/** Merge adjacent spans of the same kind so the mark ranges stay coarse. */
export function compactSpans(spans: DiffSpan[]): DiffSpan[] {
  const merged: DiffSpan[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous != null && previous.kind === span.kind) {
      previous.text += span.text;
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
}

/** Whitespace-collapsed equality: a suggestion that only reflowed spaces is a
 *  no-op and the review bar should not offer it. */
export function isMeaningfulDiff(original: string, suggested: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  return normalize(original) !== normalize(suggested);
}
