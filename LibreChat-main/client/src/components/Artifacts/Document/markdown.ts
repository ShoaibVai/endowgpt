import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/** Markdown ↔ TipTap HTML bridge (PLAN.md §7.4). Both converters are created
 *  once: `marked` parses strings synchronously and `turndown` has no async
 *  surface, so a document round-trip never races the editor. */

marked.use({ gfm: true, breaks: false });

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  hr: '---',
});
turndown.use(gfm);

/** Markdown → HTML for TipTap import. */
export function mdToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

/** TipTap HTML → Markdown for the artifact content and exports. */
export function htmlToMd(html: string): string {
  return turndown.turndown(html);
}
