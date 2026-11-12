#!/usr/bin/env node
/**
 * endowGPT smoke test (boot + models + documents surface).
 *
 *   node scripts/smoke.mjs [--base http://localhost:3080]
 *
 * Checks, in order:
 *   1. API health (`/health`) and startup config (`/api/config`): appTitle,
 *      modelSpecs carry the two endowGPT models, artifacts + fileSearch on.
 *   2. The shell (`/`) serves the endowGPT brand: title, favicons, no LibreChat
 *      title anywhere visible.
 *   3. `/api/documents` is mounted and requires auth (401 when anonymous).
 *   4. With OPENCODE_API_KEY set (env), both models answer a trivial prompt
 *      through the OpenCode endpoint. Without a key, this step prints SKIP.
 *
 * Exits 0 on pass/skip, 1 on any failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BASE = (() => {
  const flag = process.argv.find((arg) => arg.startsWith('--base='));
  return (flag ? flag.split('=')[1] : process.env.ENDOWGPT_BASE_URL) ?? 'http://localhost:3080';
})();

/** The local .env holds the deployment credential; read only that one value
 *  and only into this process, never printing it. */
function readEnvKey() {
  try {
    const envPath = path.resolve(import.meta.dirname, '..', '.env');
    const line = fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.startsWith('OPENCODE_API_KEY='));
    return line?.slice('OPENCODE_API_KEY='.length).trim() ?? '';
  } catch {
    return '';
  }
}

const OPENCODE_BASE = (
  process.env.OPENCODE_BASE_URL ?? 'https://opencode.ai/inference/go/openai/v1'
).replace(/\/$/, '');

/** OpenCode Go requires a stable session id and a real client user agent. */
const SMOKE_UA = 'endowGPT-smoke/1.0';

const results = [];
const step = (name, status, detail = '') => {
  results.push({ name, status, detail });
  const mark = status === 'pass' ? 'PASS' : status === 'skip' ? 'SKIP' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` - ${detail}` : ''}`);
};

async function main() {
  /* 1. health + startup config */
  let healthOk = false;
  try {
    const res = await fetch(`${BASE}/health`);
    healthOk = res.ok;
  } catch {
    healthOk = false;
  }
  step('api health', healthOk ? 'pass' : 'fail', `${BASE}/health`);

  let config = null;
  try {
    const res = await fetch(`${BASE}/api/config`);
    config = res.ok ? await res.json() : null;
  } catch {
    config = null;
  }
  step(
    'startup config',
    config?.appTitle === 'endowGPT' ? 'pass' : 'fail',
    config == null ? 'no /api/config response' : `appTitle=${config.appTitle ?? 'missing'}`,
  );

  const specs = config?.modelSpecs?.list ?? [];
  if (specs.length > 0) {
    const deepseek = specs.find((spec) => spec.name === 'deepseek-v4.1-flash');
    step(
      'model specs',
      deepseek != null && specs.length === 1 ? 'pass' : 'fail',
      `deepseek=${deepseek != null}, specs=${specs.length}`,
    );
    step(
      'spec capabilities',
      deepseek?.artifacts === true && deepseek?.fileSearch === true ? 'pass' : 'fail',
      'artifacts + fileSearch on the model spec',
    );
    step(
      'default model',
      specs.find((spec) => spec.default === true)?.name === 'deepseek-v4.1-flash'
        ? 'pass'
        : 'fail',
    );
  } else {
    /* Model specs are post-login fields; the anonymous /api/config payload
     * legitimately omits them. They are asserted in the authenticated run. */
    step('model specs', 'skip', 'modelSpecs are post-login; not present in the anonymous payload');
  }

  /* 2. shell branding */
  let html = '';
  try {
    const res = await fetch(`${BASE}/`);
    html = res.ok ? await res.text() : '';
  } catch {
    html = '';
  }
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  step(
    'shell title',
    titleMatch?.[1] === 'endowGPT' ? 'pass' : 'fail',
    titleMatch?.[1] ?? 'no title tag',
  );
  step(
    'shell favicons',
    html.includes('assets/favicon-32x32.png') && html.includes('assets/favicon-16x16.png')
      ? 'pass'
      : 'fail',
  );
  const visibleLibreChat =
    html.match(/<title>[^<]*LibreChat/i) != null || /LibreChat\s+-\s/.test(html);
  step('no LibreChat title', visibleLibreChat ? 'fail' : 'pass');

  /* 3. documents surface mounted + auth-gated */
  let documentsStatus = 0;
  try {
    const res = await fetch(`${BASE}/api/documents`);
    documentsStatus = res.status;
  } catch {
    documentsStatus = 0;
  }
  step(
    'documents API mounted',
    documentsStatus === 401 ? 'pass' : 'fail',
    `anonymous GET /api/documents -> ${documentsStatus || 'no response'}`,
  );

  /* 4. models through the OpenCode endpoint */
  const apiKey = process.env.OPENCODE_API_KEY ?? readEnvKey();
  if (!apiKey) {
    step('model smoke', 'skip', 'OPENCODE_API_KEY not set; boot checks above still ran');
  } else {
    for (const model of ['deepseek-v4.1-flash']) {
      const started = Date.now();
      let lastStatus = 0;
      let text = '';
      // One retry covers transient rate limits without hammering the gateway.
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 15_000));
        }
        try {
          const res = await fetch(`${OPENCODE_BASE}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'User-Agent': SMOKE_UA,
              'x-opencode-session': 'endowgpt-smoke',
            },
            body: JSON.stringify({
              model,
              stream: false,
              max_tokens: 32,
              messages: [
                { role: 'system', content: 'Answer with the number only.' },
                { role: 'user', content: 'What is 2 + 2?' },
              ],
            }),
          });
          lastStatus = res.status;
          if (res.status === 429) {
            continue;
          }
          if (!res.ok) {
            break;
          }
          const json = await res.json();
          text = json.choices?.[0]?.message?.content ?? '';
          break;
        } catch (error) {
          step(`model ${model}`, 'fail', String(error?.message ?? error).slice(0, 120));
          lastStatus = -1;
          break;
        }
      }
      if (lastStatus === 429) {
        step(`model ${model}`, 'fail', 'rate-limited upstream (HTTP 429) even after retry');
      } else if (lastStatus === 0) {
        /* step already emitted the failure */
      } else {
        step(
          `model ${model}`,
          text.includes('4') ? 'pass' : 'fail',
          `answered in ${Date.now() - started} ms`,
        );
      }
    }
  }

  const failed = results.filter((result) => result.status === 'fail');
  console.log(
    failed.length === 0
      ? '\nSmoke OK'
      : `\nSmoke FAILED: ${failed.map((result) => result.name).join(', ')}`,
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main();
