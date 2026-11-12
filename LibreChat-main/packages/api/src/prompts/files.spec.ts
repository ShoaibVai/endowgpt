import { documentsPrompt } from './documents';
import { filesPrompt } from './files';

describe('file and document prompts', () => {
  it('sends file requests to the native tools and forbids HTML artifacts', () => {
    expect(filesPrompt).toContain('call the matching file tool');
    expect(filesPrompt).toContain('create_spreadsheet');
    expect(filesPrompt).toContain('create_document');
    expect(filesPrompt).toContain('create_presentation');
    expect(filesPrompt).toContain('Never answer a file request with HTML');
    expect(filesPrompt).toContain('call the tool once per file');
    expect(filesPrompt).not.toContain('text/html');
  });

  it('keeps the editor prompt separate from downloadable file requests', () => {
    expect(documentsPrompt).toContain('Do not use the document editor for file requests');
    expect(documentsPrompt).not.toContain('text/html');
  });
});
