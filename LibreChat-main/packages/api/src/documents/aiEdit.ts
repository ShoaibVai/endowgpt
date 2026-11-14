/** endowGPT selection edits: one bounded, non-streaming completion per request.
 *  Direct REST call rather than an artifact round-trip: the model only has to
 *  return replacement prose, and both configured models serve plain text
 *  reliably where tool-calling fidelity varies. */

/** The OpenAI-compatible provider for endowGPT models; the credential comes
 *  from the environment only and is never logged or echoed. */
const DEFAULT_BASE_URL = 'https://opencode.ai/zen/v1';
/** One provider call may not hold an Express request (and its socket) open
 *  indefinitely; a timeout maps to the same stable outage code. */
const AI_EDIT_TIMEOUT_MS = 20_000;

export type AiEditErrorCode =
  | 'ai_edit_rate_limited'
  | 'ai_edit_auth'
  | 'ai_edit_unavailable'
  | 'ai_edit_empty_response'
  | 'ai_edit_model_not_allowed';

export type AiEditResult =
  | { ok: true; text: string }
  | { ok: false; code: AiEditErrorCode; status: number };

export interface AiEditInput {
  request: {
    text: string;
    instruction: string;
    model: string;
    mode: 'improve' | 'shorten' | 'expand' | 'fix_grammar' | 'translate' | 'tone' | 'custom';
    language?: string;
    tone?: string;
  };
  /** Overrides for tests; production leaves these unset. */
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

const MODE_GUIDANCE: Record<AiEditInput['request']['mode'], string> = {
  improve:
    'Return an improved version of the text: clearer and more polished, same meaning and length.',
  shorten: 'Return a shorter version that keeps every essential point.',
  expand: 'Return an expanded version that develops the same point in more depth.',
  fix_grammar: 'Return the text with grammar and spelling corrected. Change as little as possible.',
  translate: 'Return the text translated faithfully.',
  tone: 'Return the text rewritten with the requested tone.',
  custom: 'Follow the user instruction exactly.',
};

const SYSTEM_PROMPT = [
  'You edit one passage of a larger document. Output ONLY the replacement text, nothing else.',
  'No preamble, no quotes around the answer, no explanation.',
  'Preserve the passage language and any Markdown formatting the passage uses.',
  'Match the tone, person, and terminology of the passage unless instructed otherwise.',
].join(' ');

function buildUserPrompt({ request }: AiEditInput): string {
  const parts: string[] = [MODE_GUIDANCE[request.mode]];
  if (request.mode === 'translate' && request.language) {
    parts.push(`Target language: ${request.language}.`);
  }
  if (request.mode === 'tone' && request.tone) {
    parts.push(`Requested tone: ${request.tone}.`);
  }
  parts.push(`Instruction: ${request.instruction}`);
  parts.push('--- Passage ---');
  parts.push(request.text);
  return parts.join('\n\n');
}

export async function aiEditDocumentText(input: AiEditInput): Promise<AiEditResult> {
  const baseUrl = (input.baseUrl ?? process.env.OPENCODE_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/$/,
    '',
  );
  const apiKey = input.apiKey ?? process.env.OPENCODE_API_KEY ?? '';
  const doFetch = input.fetchImpl ?? fetch;

  if (!apiKey) {
    // Missing deployment credential is a server configuration problem; the
    // client sees the same unavailable code as an outage, nothing more.
    return { ok: false, code: 'ai_edit_auth', status: 502 };
  }

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_EDIT_TIMEOUT_MS);
  try {
    response = await doFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.request.model,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(input) },
        ],
      }),
    });
  } catch {
    return { ok: false, code: 'ai_edit_unavailable', status: 502 };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 429) {
      return { ok: false, code: 'ai_edit_rate_limited', status: 429 };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, code: 'ai_edit_auth', status: 502 };
    }
    return { ok: false, code: 'ai_edit_unavailable', status: 502 };
  }

  let text = '';
  try {
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    text = json.choices?.[0]?.message?.content ?? '';
  } catch {
    return { ok: false, code: 'ai_edit_unavailable', status: 502 };
  }

  text = text.trim();
  if (!text) {
    return { ok: false, code: 'ai_edit_empty_response', status: 502 };
  }
  // Some models answer with a one-line preamble despite the system prompt;
  // strip matching quotes only when the whole payload is wrapped.
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length > 2) ||
    (text.startsWith('“') && text.endsWith('”') && text.length > 2)
  ) {
    text = text.slice(1, -1);
  }
  return { ok: true, text };
}
