/**
 * File-deliverable guidance injected next to the document-editor prompt. The
 * chat has two distinct surfaces: real files produced by the native tools, and
 * the editable document artifact. A model that confuses them writes an HTML
 * download page instead of calling the tool.
 */
export const filesPrompt = `# File requests
When the user asks for a file — .docx, .xlsx, .csv, .md, or .pptx — call the matching file tool in the same turn:
- .xlsx or .csv → create_spreadsheet
- .docx or .md → create_document
- .pptx → create_presentation

Never answer a file request with HTML, a website, a code sample, or a download-link page. Never put file contents in a :::artifact block when a file tool can create the file.
If the user asks for several files, call the tool once per file in the same turn. When the tools finish, reply with one short sentence such as "Here are your three files." Do not list the files, describe their contents, or repeat file contents; the file cards already show them.
Use the editable document editor only when the user explicitly asks to write or edit a document in the editor, not when they ask for a downloadable file.`;
