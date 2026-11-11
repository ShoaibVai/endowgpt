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

import process from 'node:process';

const BASE = (() => {
  const flag = process.argv.find((arg) => arg.startsWith('--base='));
  return (flag ? flag.split('=')[1] : process.env.ENDOWGPT_BASE_URL) ?? 'http://localhost:3080';
})();

const OPENCODE_BASE = (
  process.env.OPENCODE_BASE_URL ?? 'https://opencode.ai/zen/v1'
).replace(/\/$/, '');

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
  const deepseek = specs.find((spec) => spec.name === 'deepseek-v4.1-flash-free');
  const glm = specs.find((spec) => spec.name === 'glm-5.3-flash-free');
  step(
    'model specs',
    deepseek != null && glm != null ? 'pass' : 'fail',
    `deepseek=${deepseek != null}, glm=${glm != null}`,
  );
  step(
    'spec capabilities',
    deepseek?.artifacts === true &&
      glm?.artifacts === true &&
      deepseek?.fileSearch === true &&
      glm?.fileSearch === true
      ? 'pass'
      : 'fail',
    'artifacts + fileSearch on both specs',
  );
  step(
    'default model',
    specs.find((spec) => spec.default === true)?.name === 'deepseek-v4.1-flash-free'
      ? 'pass'
      : 'fail',
  );

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
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) {
    step('model smoke', 'skip', 'OPENCODE_API_KEY not set; boot checks above still ran');
  } else {
    for (const model of ['deepseek-v4.1-flash-free', 'glm-5.3-flash-free']) {
      const started = Date.now();
      try {
        const res = await fetch(`${OPENCODE_BASE}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
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
        if (!res.ok) {
          step(`model ${model}`, 'fail', `HTTP ${res.status}`);
          continue;
        }
        const json = await res.json();
        const text = json.choices?.[0]?.message?.content ?? '';
        step(
          `model ${model}`,
          text.includes('4') ? 'pass' : 'fail',
          `answered in ${Date.now() - started} ms`,
        );
      } catch (error) {
        step(`model ${model}`, 'fail', String(error?.message ?? error).slice(0, 120));
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
