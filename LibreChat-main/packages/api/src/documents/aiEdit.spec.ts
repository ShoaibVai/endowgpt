import { aiEditDocumentText } from './aiEdit';
import type { AiEditInput } from './aiEdit';

/** Provider boundary for selection edits (PLAN.md §7.1): one bounded
 *  completion, safe error codes, and no request body or provider text in the
 *  result. The fetch implementation is injected so no network is involved. */

const request: AiEditInput['request'] = {
  text: 'the quick brown fox',
  instruction: 'make it clearer',
  model: 'model-a',
  mode: 'improve',
};

function recordingFetch(responder: (init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = async (url: string, init: RequestInit = {}): Promise<Response> => {
    calls.push({ url, init });
    return responder(init);
  };
  return { calls, fetchImpl: impl as unknown as typeof fetch };
}

function completion(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function userPrompt(call: { init: RequestInit }): string {
  const body = JSON.parse(String(call.init.body)) as {
    messages: Array<{ role: string; content: string }>;
  };
  return body.messages[1].content;
}

describe('aiEditDocumentText', () => {
  test('returns the trimmed replacement and strips wrapping quotes', async () => {
    const { calls, fetchImpl } = recordingFetch(async () =>
      completion('  "A clearer sentence."  '),
    );

    const result = await aiEditDocumentText({
      request,
      apiKey: 'test-key',
      baseUrl: 'https://provider.test/v1/',
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, text: 'A clearer sentence.' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://provider.test/v1/chat/completions');
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    const body = JSON.parse(String(calls[0].init.body)) as {
      model: string;
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body).toMatchObject({ model: 'model-a', stream: false });
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1].content).toContain('the quick brown fox');
    expect(body.messages[1].content).toContain('make it clearer');
  });

  test('includes tone and language guidance in the user prompt', async () => {
    const { calls, fetchImpl } = recordingFetch(async () => completion('ok'));

    await aiEditDocumentText({
      request: { ...request, mode: 'tone', tone: 'professional' },
      apiKey: 'test-key',
      fetchImpl,
    });
    await aiEditDocumentText({
      request: { ...request, mode: 'translate', language: 'French' },
      apiKey: 'test-key',
      fetchImpl,
    });

    expect(userPrompt(calls[0])).toContain('Requested tone: professional');
    expect(userPrompt(calls[1])).toContain('Target language: French');
  });

  test('fails closed without a deployment credential', async () => {
    const { calls, fetchImpl } = recordingFetch(async () => completion('unused'));

    const result = await aiEditDocumentText({ request, apiKey: '', fetchImpl });

    expect(result).toEqual({ ok: false, code: 'ai_edit_auth', status: 502 });
    expect(calls).toHaveLength(0);
  });

  test.each([
    [429, 'ai_edit_rate_limited', 429],
    [401, 'ai_edit_auth', 502],
    [403, 'ai_edit_auth', 502],
    [500, 'ai_edit_unavailable', 502],
  ])('maps upstream %i to %s', async (status, code, mappedStatus) => {
    const { fetchImpl } = recordingFetch(async () => new Response('{}', { status }));

    const result = await aiEditDocumentText({ request, apiKey: 'test-key', fetchImpl });

    expect(result).toEqual({ ok: false, code, status: mappedStatus });
  });

  test('treats an empty or unreadable answer as unavailable', async () => {
    const empty = await aiEditDocumentText({
      request,
      apiKey: 'test-key',
      fetchImpl: recordingFetch(async () => completion('   ')).fetchImpl,
    });
    const malformed = await aiEditDocumentText({
      request,
      apiKey: 'test-key',
      fetchImpl: recordingFetch(async () => new Response('not json', { status: 200 })).fetchImpl,
    });

    expect(empty).toEqual({ ok: false, code: 'ai_edit_empty_response', status: 502 });
    expect(malformed).toEqual({ ok: false, code: 'ai_edit_unavailable', status: 502 });
  });

  test('maps a network failure to unavailable without echoing it', async () => {
    const { fetchImpl } = recordingFetch(async () => {
      throw new Error('connect ECONNREFUSED provider.test');
    });

    const result = await aiEditDocumentText({ request, apiKey: 'test-key', fetchImpl });

    expect(result).toEqual({ ok: false, code: 'ai_edit_unavailable', status: 502 });
  });
});
