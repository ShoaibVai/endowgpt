#!/usr/bin/env node
/**
 * endowGPT web-search benchmark.
 *
 * Measures, with real numbers from this machine:
 *   - SearXNG search latency (20 queries)
 *   - scraper latency and success (20 URLs across 8 categories)
 *   - LibreChat time-to-first-answer-token end to end (optional, 3 samples)
 *
 * Usage:
 *   node scripts/bench-websearch.js
 *   node scripts/bench-websearch.js --assert
 *
 * Local dev (ports published on 127.0.0.1):
 *   node scripts/bench-websearch.js
 *
 * VPS (no published web-search ports), run on the websearch network:
 *   docker run --rm --network endowgpt_websearch \
 *     -v "$PWD/scripts:/scripts:ro" -v "$PWD:/work:ro" -w /work \
 *     -e SEARXNG_URL=http://searxng:8080 \
 *     -e SCRAPER_URL=http://scraper:3002 \
 *     -e SCRAPER_KEY="$SCRAPER_API_KEY" \
 *     node:22-alpine node /scripts/bench-websearch.js --assert
 *
 * Environment:
 *   SEARXNG_URL, SCRAPER_URL, SCRAPER_KEY (or FIRECRAWL_API_KEY /
 *   SCRAPER_API_KEY from .env), SEARXNG_ENGINES, BENCH_OUT.
 *   LIBRECHAT_BASE_URL, LIBRECHAT_EMAIL, LIBRECHAT_PASSWORD or
 *   LIBRECHAT_TOKEN, LIBRECHAT_MODEL, TTFT_SAMPLES.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function readDotenv() {
  const values = {};
  try {
    const text = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match) {
        values[match[1]] = match[2].trim();
      }
    }
  } catch {
    // No .env: environment variables are enough.
  }
  return values;
}

const dotenv = readDotenv();
const env = (name, fallback = '') => process.env[name] ?? dotenv[name] ?? fallback;
const stripSlash = (value) => value.replace(/\/+$/, '');

const SEARXNG_URL = stripSlash(env('SEARXNG_URL', 'http://127.0.0.1:8080'));
const SCRAPER_URL = stripSlash(env('SCRAPER_URL', 'http://127.0.0.1:3002'));
const SCRAPER_KEY = env(
  'SCRAPER_KEY',
  env('FIRECRAWL_API_KEY', env('SCRAPER_API_KEY')),
);
const SEARXNG_ENGINES = env(
  'SEARXNG_ENGINES',
  'google,brave,duckduckgo,yandex,wikipedia',
);
const BENCH_OUT = env('BENCH_OUT', 'bench-results.json');

const LIBRECHAT_BASE_URL = stripSlash(env('LIBRECHAT_BASE_URL', 'http://127.0.0.1:3080'));
const LIBRECHAT_EMAIL = env('LIBRECHAT_EMAIL');
const LIBRECHAT_PASSWORD = env('LIBRECHAT_PASSWORD');
const LIBRECHAT_TOKEN = env('LIBRECHAT_TOKEN');
const LIBRECHAT_MODEL = env('LIBRECHAT_MODEL', 'deepseek-v4.1-flash');
const TTFT_SAMPLES = Math.max(0, Number(env('TTFT_SAMPLES', '3')) || 0);

const QUERIES = [
  'latest AI news today',
  'OpenAI announcement this week',
  'Anthropic IPO news',
  'Nvidia earnings latest',
  'EU AI Act enforcement 2026',
  'best self-hosted search engine',
  'Rust web scraper benchmark',
  'LibreChat web search configuration',
  'SearXNG Docker setup',
  'PostgreSQL 18 release notes',
  'Cloudflare Workers AI pricing',
  'DeepSeek model release',
  'GLM model benchmark',
  'Hostinger KVM 4 specs',
  'Ubuntu 24.04 UFW fail2ban',
  'Caddy reverse proxy Docker',
  'Docker log rotation json-file',
  'Meilisearch release notes',
  'MongoDB memory usage',
  'pgvector performance benchmark',
];

const URLS = [
  { category: 'static-article', url: 'https://example.com/', marker: 'documentation examples' },
  {
    category: 'long-article',
    url: 'https://en.wikipedia.org/wiki/Web_scraping',
    marker: 'Web scraping',
  },
  { category: 'js-spa', url: 'https://quotes.toscrape.com/js/', marker: 'Albert Einstein' },
  {
    category: 'js-delayed',
    url: 'https://quotes.toscrape.com/js-delayed/',
    marker: 'Albert Einstein',
  },
  {
    category: 'pdf',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    marker: 'PDF',
  },
  {
    category: 'table-heavy',
    url: 'https://en.wikipedia.org/wiki/List_of_countries_by_population_(2023)',
    marker: 'population',
  },
  { category: 'paywalled-blocked', url: 'https://www.wsj.com/' },
  { category: 'redirect-chain', url: 'https://httpbingo.org/redirect/3' },
  { category: 'non-english', url: 'https://ja.wikipedia.org/wiki/人工知能', marker: '人工知能' },
  { category: 'docs', url: 'https://www.postgresql.org/docs/current/', marker: 'PostgreSQL' },
  { category: 'github-repo', url: 'https://github.com/YOLOW92/pagesift', marker: 'pagesift' },
  { category: 'news', url: 'https://www.reuters.com/technology/' },
  { category: 'product', url: 'https://www.apple.com/', marker: 'Apple' },
  { category: 'forum', url: 'https://stackoverflow.com/questions' },
  { category: 'blog', url: 'https://blog.cloudflare.com/', marker: 'Cloudflare' },
  {
    category: 'api-docs',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API',
    marker: 'Fetch',
  },
  { category: 'long-pdf', url: 'https://arxiv.org/pdf/1706.03762', marker: 'Attention' },
  { category: 'spa-app', url: 'https://tailwindcss.com/', marker: 'Tailwind' },
  {
    category: 'static-table',
    url: 'https://www.w3schools.com/html/html_tables.asp',
    marker: 'table',
  },
  { category: 'non-english-news', url: 'https://www.lemonde.fr/', marker: 'Le Monde' },
];

const JS_CATEGORIES = new Set(['js-spa', 'js-delayed', 'spa-app']);

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function stats(values) {
  if (values.length === 0) return { n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0],
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    max: sorted[sorted.length - 1],
    mean: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function timedFetch(url, options, timeoutMs) {
  const started = performance.now();
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { response, ms: Math.round(performance.now() - started) };
}

async function runSearch(query) {
  const url = new URL(`${SEARXNG_URL}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('categories', 'general');
  url.searchParams.set('safesearch', '1');
  url.searchParams.set('engines', SEARXNG_ENGINES);
  try {
    const { response, ms } = await timedFetch(url, {}, 15000);
    const body = await response.json();
    const results = Array.isArray(body.results) ? body.results : [];
    return {
      query,
      ms,
      ok: response.ok && results.length > 0,
      results: results.length,
      unresponsive: body.unresponsive_engines ?? [],
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      query,
      ms: null,
      ok: false,
      results: 0,
      unresponsive: [],
      error: String(error?.message ?? error),
    };
  }
}

async function runScrape(target) {
  if (!SCRAPER_KEY) {
    return {
      ...target,
      ms: null,
      ok: false,
      error: 'SCRAPER_KEY / FIRECRAWL_API_KEY is not set',
    };
  }
  try {
    const { response, ms } = await timedFetch(
      `${SCRAPER_URL}/v1/scrape`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SCRAPER_KEY}`,
        },
        body: JSON.stringify({
          url: target.url,
          formats: ['markdown'],
          onlyMainContent: true,
        }),
      },
      30000,
    );
    const body = await response.json();
    const markdown = body?.data?.markdown ?? '';
    const text = typeof markdown === 'string' ? markdown : '';
    const markerOk = target.marker ? text.toLowerCase().includes(target.marker.toLowerCase()) : true;
    return {
      ...target,
      ms,
      ok: response.ok && body?.success === true && typeof markdown === 'string' && markerOk,
      markerOk,
      length: text.length,
      engine:
        body?.data?.metadata?.pagesift?.engine ??
        body?.data?.metadata?.renderedWith ??
        null,
      error: body?.error ?? (response.ok ? null : `HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      ...target,
      ms: null,
      ok: false,
      length: 0,
      error: String(error?.message ?? error),
    };
  }
}

async function login() {
  if (LIBRECHAT_TOKEN) return LIBRECHAT_TOKEN;
  if (!LIBRECHAT_EMAIL || !LIBRECHAT_PASSWORD) return null;
  const response = await fetch(`${LIBRECHAT_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ email: LIBRECHAT_EMAIL, password: LIBRECHAT_PASSWORD }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`login failed: HTTP ${response.status}`);
  }
  const body = await response.json();
  return body.token ?? null;
}

async function runTtft(token, sample) {
  const body = {
    text:
      'What is one current AI news headline today? Run one web search and cite the source. ' +
      'Keep the answer short.',
    conversationId: 'new',
    parentMessageId: '00000000-0000-0000-0000-000000000000',
    messageId: crypto.randomUUID(),
    endpoint: 'endowGPT',
    endpointType: 'custom',
    model: LIBRECHAT_MODEL,
    spec: LIBRECHAT_MODEL,
    ephemeralAgent: { web_search: true },
  };

  const started = performance.now();
  const startResponse = await fetch(`${LIBRECHAT_BASE_URL}/api/agents/chat/endowGPT`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': UA,
      Origin: LIBRECHAT_BASE_URL,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const start = await startResponse.json();
  if (!start.streamId) {
    return { sample, ok: false, error: JSON.stringify(start).slice(0, 300) };
  }

  const streamUrl =
    `${LIBRECHAT_BASE_URL}/api/agents/chat/stream/${start.streamId}` +
    `?resume=true&generationCreatedAt=${start.generationCreatedAt}`;
  const streamResponse = await fetch(streamUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': UA,
      Accept: 'text/event-stream',
    },
    signal: AbortSignal.timeout(120000),
  });
  if (!streamResponse.ok || !streamResponse.body) {
    return { sample, ok: false, error: `stream HTTP ${streamResponse.status}` };
  }

  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let firstAnswer = null;
  let firstReasoning = null;
  let final = null;
  let answer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;
      let payload;
      try {
        payload = JSON.parse(dataLine.slice(6));
      } catch {
        continue;
      }
      if (payload.event === 'on_reasoning_delta' && firstReasoning == null) {
        firstReasoning = Math.round(performance.now() - started);
      }
      if (payload.event === 'on_message_delta') {
        if (firstAnswer == null) {
          firstAnswer = Math.round(performance.now() - started);
        }
        for (const part of payload.data?.delta?.content ?? []) {
          if (part.type === 'text' && part.text) answer += part.text;
        }
      }
      if (frame.includes('"final":true')) {
        final = Math.round(performance.now() - started);
        reader.cancel().catch(() => {});
        return {
          sample,
          ok: firstAnswer != null,
          firstAnswerMs: firstAnswer,
          firstReasoningMs: firstReasoning,
          finalMs: final,
          answerChars: answer.length,
          answer: answer.slice(0, 240),
        };
      }
    }
  }
  return {
    sample,
    ok: firstAnswer != null,
    firstAnswerMs: firstAnswer,
    firstReasoningMs: firstReasoning,
    finalMs: final,
    answerChars: answer.length,
    error: 'stream ended without a final event',
  };
}

function printStats(label, value) {
  if (value.n === 0) {
    console.log(`${label}: no samples`);
    return;
  }
  console.log(
    `${label}: n=${value.n} p50=${value.p50}ms p90=${value.p90}ms ` +
      `min=${value.min}ms max=${value.max}ms mean=${value.mean}ms`,
  );
}

async function main() {
  console.log('endowGPT web-search benchmark');
  console.log(`  SearXNG: ${SEARXNG_URL} (engines=${SEARXNG_ENGINES})`);
  console.log(`  Scraper: ${SCRAPER_URL}`);
  console.log(`  LibreChat: ${LIBRECHAT_BASE_URL}`);
  console.log('');

  const searchRows = [];
  for (const [index, query] of QUERIES.entries()) {
    const row = await runSearch(query);
    searchRows.push(row);
    console.log(
      `search ${String(index + 1).padStart(2, '0')}/${QUERIES.length} ` +
        `${row.ms == null ? 'ERR' : `${row.ms}ms`} results=${row.results} ${row.ok ? 'OK' : 'FAIL'} ` +
        `${row.error ?? ''}`.trim(),
    );
    if (!row.ok && row.unresponsive.length > 0) {
      console.log(`  unresponsive: ${JSON.stringify(row.unresponsive)}`);
    }
    await sleep(250);
  }

  const scrapeRows = [];
  for (const [index, target] of URLS.entries()) {
    const row = await runScrape(target);
    scrapeRows.push(row);
    console.log(
      `scrape ${String(index + 1).padStart(2, '0')}/${URLS.length} ` +
        `${target.category.padEnd(18)} ${row.ms == null ? 'ERR' : `${row.ms}ms`} ` +
        `len=${row.length} marker=${row.markerOk === false ? 'n' : 'Y'} ` +
        `${row.ok ? 'OK' : 'FAIL'} ${row.engine ?? '-'} ${row.error ?? ''}`.trim(),
    );
  }

  const searchMs = searchRows
    .filter((row) => row.ok && row.ms != null)
    .map((row) => row.ms);
  const scrapeMs = scrapeRows.filter((row) => row.ms != null).map((row) => row.ms);
  const scrapeOk = scrapeRows.filter((row) => row.ok);
  const jsRows = scrapeRows.filter((row) => JS_CATEGORIES.has(row.category) && row.ms != null);
  const nonJsRows = scrapeRows.filter(
    (row) => !JS_CATEGORIES.has(row.category) && row.ms != null,
  );

  console.log('');
  printStats('Search', stats(searchMs));
  console.log(
    `Search success: ${searchRows.filter((row) => row.ok).length}/${searchRows.length}`,
  );
  printStats('Scrape (all)', stats(scrapeMs));
  printStats('Scrape (non-JS)', stats(nonJsRows.map((row) => row.ms)));
  printStats('Scrape (JS)', stats(jsRows.map((row) => row.ms)));
  console.log(`Scrape success: ${scrapeOk.length}/${scrapeRows.length}`);

  const ttftRows = [];
  let ttftToken = null;
  try {
    ttftToken = await login();
  } catch (error) {
    console.log(`TTFT login failed: ${error.message}`);
  }
  if (!ttftToken) {
    console.log('TTFT: SKIP (set LIBRECHAT_EMAIL/LIBRECHAT_PASSWORD or LIBRECHAT_TOKEN)');
  } else {
    for (let sample = 1; sample <= TTFT_SAMPLES; sample++) {
      try {
        const row = await runTtft(ttftToken, sample);
        ttftRows.push(row);
        console.log(
          `ttft ${sample}/${TTFT_SAMPLES} firstAnswer=${row.firstAnswerMs ?? 'ERR'}ms ` +
            `firstReasoning=${row.firstReasoningMs ?? '-'}ms final=${row.finalMs ?? 'ERR'}ms ` +
            `${row.ok ? 'OK' : 'FAIL'} ${row.error ?? ''}`.trim(),
        );
      } catch (error) {
        ttftRows.push({ sample, ok: false, error: String(error?.message ?? error) });
        console.log(`ttft ${sample}/${TTFT_SAMPLES} FAIL ${error.message}`);
      }
      await sleep(500);
    }
    printStats(
      'TTFT (first answer token)',
      stats(
        ttftRows
          .map((row) => row.firstAnswerMs)
          .filter((value) => typeof value === 'number'),
      ),
    );
    printStats(
      'TTFT (final)',
      stats(ttftRows.map((row) => row.finalMs).filter((value) => typeof value === 'number')),
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      searxngUrl: SEARXNG_URL,
      scraperUrl: SCRAPER_URL,
      searxngEngines: SEARXNG_ENGINES,
      librechatUrl: LIBRECHAT_BASE_URL,
      librechatModel: LIBRECHAT_MODEL,
      ttftSamples: TTFT_SAMPLES,
    },
    search: { stats: stats(searchMs), rows: searchRows },
    scrape: {
      stats: stats(scrapeMs),
      nonJs: stats(nonJsRows.map((row) => row.ms)),
      js: stats(jsRows.map((row) => row.ms)),
      success: `${scrapeOk.length}/${scrapeRows.length}`,
      rows: scrapeRows,
    },
    ttft: {
      stats: stats(
        ttftRows
          .map((row) => row.firstAnswerMs)
          .filter((value) => typeof value === 'number'),
      ),
      rows: ttftRows,
    },
  };
  fs.writeFileSync(path.resolve(process.cwd(), BENCH_OUT), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nWrote ${BENCH_OUT}`);

  if (process.argv.includes('--assert')) {
    const failures = [];
    const searchP50 = report.search.stats.p50;
    const nonJsP50 = report.scrape.nonJs.p50;
    if (searchP50 == null || searchP50 >= 1500) {
      failures.push(`SearXNG p50 ${searchP50}ms is not under 1500ms`);
    }
    if (nonJsP50 == null || nonJsP50 >= 2000) {
      failures.push(`scrape non-JS p50 ${nonJsP50}ms is not under 2000ms`);
    }
    if (failures.length > 0) {
      console.error('\nTargets missed:');
      for (const failure of failures) console.error(` - ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log('\nTargets met.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
