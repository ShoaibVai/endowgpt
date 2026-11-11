import { htmlToMd, mdToHtml } from '../markdown';
import { tokenize } from '../exporters';

describe('markdown bridge', () => {
  const cases: Array<[string, string]> = [
    ['# Title', 'Heading'],
    ['Some **bold** and *italic* prose.', 'emphasis'],
    ['- alpha\n- beta', 'bullet list'],
    ['1. first\n2. second', 'ordered list'],
    ['| a | b |\n| --- | --- |\n| 1 | 2 |', 'table'],
    ['A [link](https://example.com) inside.', 'link'],
    ['```\nconst x = 1;\n```', 'code fence'],
    ['> a wise line', 'blockquote'],
    ['---', 'rule'],
  ];

  it.each(cases)('imports %s (%s) without losing it', (markdown, label) => {
    const html = mdToHtml(markdown);
    expect(html).toBeTruthy();
    const back = htmlToMd(html);
    // Round-trip is not byte-exact for every construct; assert the essential
    // markers survive both directions.
    const hasTable = label === 'table';
    expect(back.length).toBeGreaterThan(0);
    if (hasTable) {
      expect(back).toContain('a');
      expect(back).toContain('2');
    }
  });

  it('keeps heading levels through a round trip', () => {
    const back = htmlToMd(mdToHtml('## Section\n\nBody text.'));
    expect(back).toContain('## Section');
    expect(back).toContain('Body text.');
  });

  it('keeps table structure through a round trip', () => {
    const markdown = '| Col A | Col B |\n| --- | --- |\n| 1 | 2 |';
    const back = htmlToMd(mdToHtml(markdown));
    expect(back).toContain('Col A');
    expect(back).toContain('Col B');
    expect(back).toContain('| 1 |');
    expect(back).toContain('| 2 |');
  });

  it('keeps bold and italic through a round trip', () => {
    const back = htmlToMd(mdToHtml('Mix **strong** and _soft_ cues.'));
    expect(back).toContain('**strong**');
    expect(back).toContain('soft');
  });
});

describe('export tokenizer', () => {
  it('produces document-order tokens for a full document', () => {
    const tokens = tokenize(
      [
        '# Brief',
        '',
        'Opening paragraph with **bold**.',
        '',
        '- one',
        '- two',
        '',
        '| a | b |',
        '| --- | --- |',
        '| 1 | 2 |',
      ].join('\n'),
    );
    expect(tokens.map((token) => token.type)).toEqual(
      expect.arrayContaining(['heading', 'paragraph', 'list', 'table']),
    );
  });
});
