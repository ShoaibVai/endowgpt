import { webSearchPrompt } from './webSearch';

describe('web search prompt', () => {
  it('tells the model when to search and to cite what it finds', () => {
    expect(webSearchPrompt).toContain('call web_search');
    expect(webSearchPrompt).toContain('current, live, recent, or time-sensitive information');
    expect(webSearchPrompt).toContain('Markdown links');
    expect(webSearchPrompt).toContain('never invent live facts');
  });
});
