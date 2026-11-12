#!/usr/bin/env node
/**
 * Native file-generation smoke test.
 *
 *   ENDOWGPT_SMOKE_EMAIL=you@example.com \
 *   ENDOWGPT_SMOKE_PASSWORD=... \
 *   node scripts/smoke-files.mjs
 *
 * Or point it at another deployment with `--base=http://host:3080`, a custom
 * prompt with `--prompt="make me an Excel sheet of 20 students"`, and the
 * expected extensions with `--expect=xlsx` (comma-separated, default md,docx,xlsx).
 *
 * It logs in, sends the prompt through the real chat route, waits for the
 * assistant turn, and asserts that the turn carries real .md/.docx/.xlsx
 * attachments rather than an HTML/artifact answer. Pass ENDOWGPT_SMOKE_TOKEN
 * to reuse an unexpired JWT and skip the login rate limit. Without credentials
 * or a token it prints SKIP and exits 0, matching scripts/smoke.mjs.
 */

import { randomUUID } from 'node:crypto';
import process from 'node:process';

const BASE = (() => {
  const flag = process.argv.find((arg) => arg.startsWith('--base='));
  return (flag ? flag.split('=')[1] : process.env.ENDOWGPT_BASE_URL) ?? 'http://localhost:3080';
})();

const PROMPT = (() => {
  const flag = process.argv.find((arg) => arg.startsWith('--prompt='));
  return (
    flag?.slice('--prompt='.length) ??
    'generate a .md and a docx and an xlsx file of students information out of dummy data'
  );
})();

const EXPECTED = (() => {
  const flag = process.argv.find((arg) => arg.startsWith('--expect='));
  const raw = flag ? flag.slice('--expect='.length) : 'md,docx,xlsx';
  return raw
    .split(',')
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean)
    .map((extension) => (extension.startsWith('.') ? extension : `.${extension}`));
})();

const EMAIL = process.env.ENDOWGPT_SMOKE_EMAIL;
const PASSWORD = process.env.ENDOWGPT_SMOKE_PASSWORD;
const TOKEN = process.env.ENDOWGPT_SMOKE_TOKEN;
const ZERO_PARENT = '00000000-0000-0000-0000-000000000000';
const POLL_INTERVAL_MS = 2000;
const POLL_ATTEMPTS = 90;
/** The chat routes reject a non-browser User-Agent before it reaches the controller. */
const SMOKE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 endowGPT-smoke/1.0';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message, detail) {
  console.error(`[FAIL] ${message}${detail ? ` - ${detail}` : ''}`);
  process.exitCode = 1;
}

async function json(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function login() {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': SMOKE_UA },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await json(response);
  if (!response.ok) {
    throw new Error(`login failed (${response.status}): ${body?.message ?? 'no response body'}`);
  }
  const cookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie().map((cookie) => cookie.split(';')[0])
      : [response.headers.get('set-cookie') ?? ''];
  const cookie = cookies.filter(Boolean).join('; ');
  if (body?.token) {
    return { token: body.token, cookie };
  }
  const refresh = await fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': SMOKE_UA,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: '{}',
  });
  const refreshed = await json(refresh);
  if (!refresh.ok || !refreshed?.token) {
    throw new Error(`refresh failed (${refresh.status})`);
  }
  return { token: refreshed.token, cookie };
}

async function sendMessage(auth) {
  const payload = {
    text: PROMPT,
    messageId: randomUUID(),
    parentMessageId: ZERO_PARENT,
    conversationId: null,
    endpoint: 'endowGPT',
    endpointType: 'custom',
    model: 'deepseek-v4.1-flash',
    spec: 'deepseek-v4.1-flash',
    isCreatedByUser: true,
    sender: 'User',
    ephemeralAgent: { file_search: true },
    clientRequestId: randomUUID(),
  };
  const response = await fetch(`${BASE}/api/agents/chat/endowGPT`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': SMOKE_UA,
      Authorization: `Bearer ${auth.token}`,
      ...(auth.cookie ? { Cookie: auth.cookie } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await json(response);
  if (!response.ok) {
    throw new Error(`chat start failed (${response.status}): ${body?.error ?? 'no response body'}`);
  }
  if (!body?.conversationId || body.conversationId === 'new') {
    throw new Error(`chat start did not return a conversation id: ${JSON.stringify(body)}`);
  }
  return body.conversationId;
}

async function waitForAnswer(auth, conversationId) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const response = await fetch(`${BASE}/api/messages/${encodeURIComponent(conversationId)}`, {
      headers: {
        'User-Agent': SMOKE_UA,
        Authorization: `Bearer ${auth.token}`,
        ...(auth.cookie ? { Cookie: auth.cookie } : {}),
      },
    });
    if (response.ok) {
      const messages = await json(response);
      const assistant = [...(messages ?? [])]
        .reverse()
        .find((message) => message?.isCreatedByUser === false && message?.messageId);
      if (assistant?.error) {
        throw new Error(`assistant turn failed: ${JSON.stringify(assistant.error)}`);
      }
      if (assistant?.attachments?.length) {
        return assistant;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`timed out after ${(POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`);
}

function readText(part) {
  if (typeof part?.text === 'string') {
    return part.text;
  }
  if (typeof part?.text?.value === 'string') {
    return part.text.value;
  }
  return '';
}

function checkAttachments(assistant) {
  const filenames = (assistant.attachments ?? [])
    .map((attachment) => attachment?.filename ?? '')
    .filter(Boolean);
  console.log(`         prompt: ${PROMPT}`);
  console.log(`         attachments: ${filenames.join(', ') || '(none)'}`);
  const has = (extension) =>
    filenames.some((filename) => filename.toLowerCase().endsWith(extension));
  const missing = EXPECTED.filter((extension) => !has(extension));
  if (missing.length > 0) {
    fail('missing generated files', `expected ${missing.join(', ')}`);
  }
  const parts = assistant.content ?? [];
  const reply = [typeof assistant.text === 'string' ? assistant.text : '']
    .concat(parts.filter((part) => part?.type === 'text').map(readText))
    .filter(Boolean)
    .join('\n')
    .trim();
  console.log(`         reply: ${reply || '(empty)'}`);
  const serialized = JSON.stringify(parts);
  if (/:::artifact|text\/html|<!doctype html|<html/i.test(`${reply}\n${serialized}`)) {
    fail('assistant answered with HTML or an artifact instead of files');
  }
  if (reply.length > 600) {
    fail('reply is not short', `${reply.length} characters`);
  }
}

async function main() {
  if (!TOKEN && (!EMAIL || !PASSWORD)) {
    console.log(
      '[SKIP] set ENDOWGPT_SMOKE_EMAIL and ENDOWGPT_SMOKE_PASSWORD (or ENDOWGPT_SMOKE_TOKEN) to run the file-generation smoke',
    );
    return;
  }
  try {
    const auth = TOKEN ? { token: TOKEN, cookie: '' } : await login();
    console.log(TOKEN ? '[PASS] using supplied token' : `[PASS] login as ${EMAIL}`);
    const conversationId = await sendMessage(auth);
    console.log(`[PASS] chat admitted ${conversationId}`);
    const assistant = await waitForAnswer(auth, conversationId);
    checkAttachments(assistant);
    if (process.exitCode !== 1) {
      console.log('[PASS] native file generation');
      console.log('\nSmoke files OK');
    }
  } catch (error) {
    fail('native file generation', error instanceof Error ? error.message : String(error));
  }
}

main();
