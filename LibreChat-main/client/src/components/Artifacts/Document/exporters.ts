import { marked } from 'marked';
import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { jsPDF } from 'jspdf';

/** Client-side exports from a Markdown source (PLAN.md §7.4): DOCX via docx,
 *  PDF via jspdf, rich text via the clipboard with an HTML flavor. All run
 *  locally — no server round-trip, and nothing sends user content anywhere. */

/** Local token shapes: marked's exported `Tokens` namespace does not carry the
 *  inline union, and the exports only need these few members. The lexer nests
 *  inline tokens inside blocks, so one structural shape covers both. */
interface Token {
  type: string;
  raw?: string;
  text?: string;
  href?: string;
  depth?: number;
  items?: Token[];
  tokens?: Token[];
  rows?: Token[];
  header?: Token[];
}

/** Collapse character escapes (Turndown/marked insert them for literal punctuation). */
function normalizeText(raw: string): string {
  return raw.replace(/\\([[\]()~`*_.\\-])/g, '$1');
}

function docxInlineRuns(
  inline: Token[] | undefined,
  base: { bold?: boolean; italics?: boolean; code?: boolean } = {},
): TextRun[] {
  const runs: TextRun[] = [];
  for (const token of inline ?? []) {
    switch (token.type) {
      case 'text':
        runs.push(
          new TextRun({
            text: normalizeText(token.text ?? ''),
            bold: base.bold,
            italics: base.italics,
            font: base.code ? 'Courier New' : undefined,
          }),
        );
        break;
      case 'strong':
        runs.push(...docxInlineRuns(token.tokens, { ...base, bold: true }));
        break;
      case 'em':
        runs.push(...docxInlineRuns(token.tokens, { ...base, italics: true }));
        break;
      case 'codespan':
        runs.push(
          new TextRun({
            text: normalizeText(token.text ?? ''),
            font: 'Courier New',
            bold: base.bold,
          }),
        );
        break;
      case 'link':
        runs.push(
          new TextRun({
            text: normalizeText(token.text ?? ''),
            bold: base.bold,
            italics: base.italics,
            style: 'Hyperlink',
          }),
        );
        break;
      case 'br':
        runs.push(new TextRun({ break: 1 }));
        break;
      case 'image':
        runs.push(
          new TextRun({ text: `[image: ${token.text || token.href}]`, italics: true }),
        );
        break;
      default: {
        if (Array.isArray(token.tokens)) {
          runs.push(...docxInlineRuns(token.tokens, base));
        } else if (typeof token.raw === 'string') {
          runs.push(
            new TextRun({
              text: normalizeText(token.raw),
              bold: base.bold,
              italics: base.italics,
            }),
          );
        }
      }
    }
  }
  return runs;
}

function headingLevel(depth: number) {
  switch (depth) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    case 5:
      return HeadingLevel.HEADING_5;
    default:
      return HeadingLevel.HEADING_6;
  }
}

function listIndent(depth: number) {
  return depth > 0 ? { left: Math.min(depth, 6) * 480 } : undefined;
}

/** Strips the fence lines from a fenced code token's raw text. */
function codeText(token: Token): string[] {
  const raw = token.raw ?? '';
  const lines = raw.split('\n');
  if (lines.length > 0 && lines[0].trimStart().startsWith('```')) {
    lines.shift();
  }
  if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
    lines.pop();
  }
  return lines;
}

function markdownToDocxBlocks(
  tokens: Token[],
  listDepth: number,
  add: (block: Paragraph | Table) => void,
): void {
  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        add(
          new Paragraph({
            text: normalizeText(token.text ?? ''),
            heading: headingLevel(token.depth ?? 1),
          }),
        );
        break;
      case 'paragraph':
        add(new Paragraph({ children: docxInlineRuns(token.tokens) }));
        break;
      case 'blockquote': {
        for (const child of token.tokens ?? []) {
          if (child.type === 'paragraph') {
            add(
              new Paragraph({
                children: docxInlineRuns(child.tokens),
                indent: listIndent(1),
                border: {
                  left: { style: BorderStyle.SINGLE, size: 12, color: 'b4b4b4' },
                },
              }),
            );
          }
        }
        break;
      }
      case 'list':
        for (const child of token.items ?? []) {
          markdownToDocxBlocks([child], listDepth + 1, add);
        }
        break;
      case 'list_item': {
        for (const child of token.tokens ?? []) {
          if (child.type === 'paragraph') {
            add(
              new Paragraph({
                children: [new TextRun({ text: '- ' }), ...docxInlineRuns(child.tokens)],
                indent: listIndent(Math.max(listDepth - 1, 0)),
              }),
            );
          } else if (child.type === 'space') {
            continue;
          } else {
            markdownToDocxBlocks([child], listDepth + 1, add);
          }
        }
        break;
      }
      case 'code':
        add(
          new Paragraph({
            children: codeText(token).map(
              (line) => new TextRun({ text: line, font: 'Courier New' }),
            ),
          }),
        );
        break;
      case 'table': {
        const cellsOf = (row?: Token[]) =>
          (row ?? []).map(
            (cell) =>
              new TableCell({
                children: [new Paragraph({ children: docxInlineRuns(cell.tokens) })],
              }),
          );
        add(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: cellsOf(token.header) }),
              ...(token.rows ?? []).map((row) => new TableRow({ children: cellsOf([row]) })),
            ],
          }),
        );
        break;
      }
      case 'hr':
        add(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'b4b4b4' } },
            children: [],
          }),
        );
        break;
      case 'space':
        break;
      default: {
        const raw = token.raw?.trim();
        if (raw) {
          add(new Paragraph({ text: normalizeText(raw) }));
        }
      }
    }
  }
}

/** Word export (.docx); resolves with the packaged Blob. */
export async function markdownToDocxBlob(
  markdown: string,
  title: string,
): Promise<Blob> {
  const children: Array<Paragraph | Table> = [];
  markdownToDocxBlocks(tokenize(markdown), 0, (block) => children.push(block));
  return Packer.toBlob(new Document({ title, sections: [{ children }] }));
}

/** Flatten the token list a renderer walks in document order. */
export function tokenize(markdown: string): Token[] {
  return marked.lexer(markdown) as unknown as Token[];
}

/** Text-layout PDF export via jspdf (headings sized, lists bulleted). */
export function markdownToPdfBlob(markdown: string): Blob {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 56;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const writeLines = (
    text: string,
    size: number,
    style: 'normal' | 'bold' | 'italic' = 'normal',
  ) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(size * 1.45);
      y += size * 1.45;
      pdf.text(line, margin, y);
    }
  };

  for (const token of tokenize(markdown)) {
    switch (token.type) {
      case 'heading':
        ensureSpace(48);
        y += 10;
        writeLines(normalizeText(token.text ?? ''), 22 - (token.depth ?? 1) * 2, 'bold');
        break;
      case 'paragraph':
        writeLines(normalizeText(token.text ?? ''), 11);
        break;
      case 'blockquote':
        writeLines(
          normalizeText((token.tokens ?? []).map((child) => child.raw ?? '').join(' ')),
          11,
          'italic',
        );
        break;
      case 'code': {
        pdf.setFont('courier', 'normal');
        pdf.setFontSize(9.5);
        for (const line of codeText(token)) {
          ensureSpace(13);
          y += 13;
          pdf.text(line.slice(0, 96), margin, y);
        }
        break;
      }
      case 'list':
        for (const item of token.items ?? []) {
          writeLines(`•  ${normalizeText(item.text ?? '')}`, 11);
        }
        break;
      case 'table': {
        const rows: Token[][] = [token.header ?? [], ...(token.rows ?? [])];
        for (const row of rows) {
          const cells = row.map(
            (cell) => (cell.tokens ?? []).map((c) => c.raw ?? '').join(''),
          );
          writeLines(cells.join('   |   '), 10);
        }
        break;
      }
      case 'hr':
        ensureSpace(14);
        y += 8;
        pdf.setDrawColor(180, 180, 180);
        pdf.line(margin, y, pageWidth - margin, y);
        break;
      default:
        break;
    }
  }

  return pdf.output('blob');
}

/** Copy prose as rich text (HTML + plain text in one clipboard item). Returns
 *  false when the browser refuses ClipboardItem writes, so the caller can use
 *  its existing plain-text path instead of showing a failure. */
export async function copyAsRichText(html: string, plainText: string): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return false;
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}
