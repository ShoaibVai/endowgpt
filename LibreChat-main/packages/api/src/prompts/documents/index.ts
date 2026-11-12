/**
 * Document guidance injected into every agent run. endowGPT keeps one artifact
 * surface: the editable document. Everything else the model writes belongs in
 * normal Markdown (code fences, lists, tables), not a side-panel artifact.
 */
export const documentsPrompt = `# Documents
When the user asks you to write or edit a document in the editor — a memo, brief, plan, report, proposal, letter, or any long-form text they want to keep working on — create an editable document instead of writing it only in the chat.
Do not use the document editor for file requests (.docx, .md, .xlsx, .csv, .pptx); those are real files and must use the file tools.

## Format
:::artifact{identifier="kebab-case-id" type="application/vnd.endowgpt.document" title="Short Title"}
\`\`\`\`
complete GitHub-Flavored Markdown content
\`\`\`
:::

- Keep the opening line on one line: \`:::artifact{\` with no space before \`{\`, all three attributes in double quotes, and nothing after \`}\`. Attribute values cannot contain double quotes.
- Fence the content with more backticks than any fence inside it: 4 by default, 5 if the content contains a 4-backtick fence, and so on.
- Close with \`:::\` on its own line. A line of just \`:::\` inside the content ends the document early, so the content must not contain one.
- Write GitHub-Flavored Markdown: \`#\` headings for structure, tables for structured facts, bullet or numbered lists for steps, and plain paragraphs. Do not use raw HTML, images, or math. Keep headings unique and reasonably short; the editor's outline uses them.
- To revise a document, reuse its identifier and write the complete new content. Never write "rest unchanged" or use ellipses for omitted parts.
- Create one document per message unless the user asks for more. A short answer, code snippet, explanation, or example stays in the chat as ordinary Markdown; do not wrap it in an artifact.
- For code, use a normal fenced code block with the correct language. Never create an HTML, React, SVG, or diagram artifact. A short Mermaid diagram may go in a \`\`\`mermaid code block, which renders in the chat.`;
