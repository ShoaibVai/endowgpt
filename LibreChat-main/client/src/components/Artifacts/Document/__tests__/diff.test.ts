import { compactSpans, isMeaningfulDiff, wordDiff } from '../diff';

describe('word diff', () => {
  it('marks only the changed words', () => {
    const spans = wordDiff('The quick fox', 'The fast fox');
    const kinds = spans.map((span) => span.kind);
    expect(kinds).toContain('insert');
    expect(kinds).toContain('delete');
    const inserts = spans.filter((span) => span.kind === 'insert');
    const deletes = spans.filter((span) => span.kind === 'delete');
    expect(inserts.map((span) => span.text).join('')).toContain('fast');
    expect(deletes.map((span) => span.text).join('')).toContain('quick');
  });

  it('keeps surrounding prose as same', () => {
    const spans = wordDiff('Keep this line as is', 'Keep this line as is!');
    const same = spans.filter((span) => span.kind === 'same');
    expect(same.join('').length).toBeGreaterThan(0);
    const changed = spans.filter((span) => span.kind !== 'same');
    expect(changed.map((span) => span.text).join('')).toBe('!');
  });

  it('compacts adjacent spans of the same kind', () => {
    const spans = [
      { text: 'a', kind: 'delete' as const },
      { text: 'b', kind: 'delete' as const },
      { text: 'c', kind: 'same' as const },
      { text: 'd', kind: 'insert' as const },
      { text: 'e', kind: 'insert' as const },
    ];
    const compacted = compactSpans(spans);
    expect(compacted).toHaveLength(3);
    expect(compacted[0]).toEqual({ text: 'ab', kind: 'delete' });
    expect(compacted[1]).toEqual({ text: 'c', kind: 'same' });
    expect(compacted[2]).toEqual({ text: 'de', kind: 'insert' });
  });

  it('treats whitespace-only rewrites as meaningless', () => {
    expect(isMeaningfulDiff('same  text', 'same text')).toBe(false);
    expect(isMeaningfulDiff('same text', 'changed text')).toBe(true);
  });

  it('returns an empty diff for identical text', () => {
    const spans = wordDiff('identical text', 'identical text');
    expect(spans.every((span) => span.kind === 'same')).toBe(true);
  });
});
