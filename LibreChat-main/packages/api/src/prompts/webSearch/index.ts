/**
 * Web-search guidance injected into every run. The tool itself is always
 * available through the model spec, so the prompt only has to say when it is
 * expected and how to report what it found.
 */
export const webSearchPrompt = `# Web search
When the user asks for current, live, recent, or time-sensitive information — news, prices, weather, schedules, releases, standings, or anything that may have changed after your knowledge cutoff — call web_search before answering.
Cite the sources you used with Markdown links. If the search fails or finds nothing useful, say so plainly; never invent live facts.`;
