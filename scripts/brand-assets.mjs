#!/usr/bin/env node
/**
 * endowGPT brand asset pipeline.
 *
 * Reads the source brand assets from the repo root and derives ALL
 * deployment-facing assets into LibreChat-main/client/public/assets/.
 *
 * Source files (brand pack):
 *   endowgpt-logo-2.svg     monochrome (near-white/gray) tone-on-tone lockup
 *   endowgpt-logo-dark.svg  white wordmark + red mark  -> DARK backgrounds
 *   endowgpt-logo-white.svg black wordmark + red mark  -> LIGHT backgrounds
 *   logo-reveal.mp4         splash reveal (1440x1440, white background)
 *
 * How it works: Chrome (headless, file://, inlined SVG) rasterizes each full
 * square SVG reliably; per-file artwork pixel bounds are then measured from the
 * RGBA output, and every derived asset (crop, resize, plate, ico) is produced
 * with pixel ops. Served SVGs keep the original full square canvas — cropping
 * (a viewBox edit) triggers a Chromium viewport bug (lossy top-left strip),
 * so in-app crops are CSS (object-fit/object-position) executed by
 * client/src/components/Brand/logos.ts.
 *
 * Usage: node scripts/brand-assets.mjs
 */

import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_ASSETS = path.join(ROOT, 'LibreChat-main', 'client', 'public', 'assets');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'endowgpt-assets-'));
const CANVAS = 1500; // source square render size, user units = pixels

const CHROME = findChrome();
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const INDIGO = { r: 0x53, g: 0x4c, b: 0xd6 }; // brand indigo #534cd6

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c));
}

// ----------------------------------------------------------------- PNG tools
function decodePng(file) {
  const b = fs.readFileSync(file);
  let pos = 8;
  let w, h, idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString('latin1', pos + 4, pos + 8);
    const data = b.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const bb = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += bb;
      else if (filter === 3) v += (a + bb) >> 1;
      else if (filter === 4) {
        const p = a + bb - c;
        const pa = Math.abs(p - a),
          pb = Math.abs(p - bb),
          pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, data: out };
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlibCrc(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function zlibCrc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c;
}

function encodePng({ w, h, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- image helpers
/** Crop with float-pad edges clamped (RGBA). */
function crop(img, x0, y0, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.w - 1, Math.max(0, x0 + x));
      const sy = Math.min(img.h - 1, Math.max(0, y0 + y));
      const si = (sy * img.w + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = img.data[si];
      out[di + 1] = img.data[si + 1];
      out[di + 2] = img.data[si + 2];
      out[di + 3] = img.data[si + 3];
    }
  }
  return { w, h, data: out };
}

/** Bilinear resize (premultiplied in-place for correctness). */
function resize(img, w, h) {
  const out = Buffer.alloc(w * h * 4);
  const inv = { x: img.w / w, y: img.h / h };
  for (let y = 0; y < h; y++) {
    const fy = Math.min(img.h - 1.001, Math.max(0, (y + 0.5) * inv.y - 0.5));
    const y0 = Math.floor(fy);
    const yf = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(img.w - 1.001, Math.max(0, (x + 0.5) * inv.x - 0.5));
      const x0 = Math.floor(fx);
      const xf = fx - x0;
      const i00 = (y0 * img.w + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + img.w * 4;
      const i11 = i01 + 4;
      const di = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = img.data[i00 + c] * (1 - xf) + img.data[i10 + c] * xf;
        const bot = img.data[i01 + c] * (1 - xf) + img.data[i11 + c] * xf;
        out[di + c] = Math.round(top * (1 - yf) + bot * yf);
      }
    }
  }
  return { w, h, data: out };
}

/** Compose src over dst at (dx, dy) (RGBA, clamped). */
function over(src, dst, dx = 0, dy = 0) {
  const data = Buffer.from(dst.data);
  for (let y = 0; y < src.h; y++) {
    const ry = y + dy;
    if (ry < 0 || ry >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const rx = x + dx;
      if (rx < 0 || rx >= dst.w) continue;
      const si = (y * src.w + x) * 4;
      const di = (ry * dst.w + rx) * 4;
      const sa = src.data[si + 3] / 255;
      const da = data[di + 3] / 255;
      const oa = sa + da * (1 - sa);
      if (oa === 0) continue;
      for (let c = 0; c < 3; c++) {
        data[di + c] = Math.round(
          (src.data[si + c] * sa + data[di + c] * da * (1 - sa)) / oa,
        );
      }
      data[di + 3] = Math.round(oa * 255);
    }
  }
  return { w: dst.w, h: dst.h, data };
}

/** Solid plate. */
function plate(w, h, { r, g, b }) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { w, h, data };
}

/** Fit art (converted to a square tile) centered on a plate. */
function onPlate(art, size, plateColor, scale) {
  const markSize = Math.round(size * scale);
  const src = cropToSquare(art, markSize);
  const tile = resize(src, markSize, markSize);
  const offset = Math.round((size - markSize) / 2);
  return over(tile, plate(size, size, plateColor), offset, offset);
}

/** Make a square RGBA image carrying art with margin, keeping aspect. */
function cropToSquare(art, size) {
  const long = Math.max(art.w, art.h);
  const tile = { w: long, h: long, data: Buffer.alloc(long * long * 4) };
  const dx = Math.round((long - art.w) / 2);
  const dy = Math.round((long - art.h) / 2);
  for (let y = 0; y < art.h; y++) {
    for (let x = 0; x < art.w; x++) {
      const si = (y * art.w + x) * 4;
      const di = ((y + dy) * long + (x + dx)) * 4;
      tile.data[di] = art.data[si];
      tile.data[di + 1] = art.data[si + 1];
      tile.data[di + 2] = art.data[si + 2];
      tile.data[di + 3] = art.data[si + 3];
    }
  }
  const square = Math.max(tile.w, tile.h);
  return crop(tile, 0, 0, square, square);
}

function savePng(img, outName) {
  const out = path.join(CLIENT_ASSETS, outName);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePng(img));
  console.log(`png: ${out} ${img.w}x${img.h}`);
  return out;
}

// ---------------------------------------------------------------- rasterize
/** Render an SVG through headless Chrome on a `size` square transparent page. */
function rasterizeSvgInline(svgText, size) {
  const file = path.join(TMP, `raster-${size}.html`);
  const end = svgText.indexOf('>', svgText.indexOf('<svg'));
  const styled =
    svgText.slice(0, end) + ` style="width:${size}px;height:${size}px"` + svgText.slice(end);
  fs.writeFileSync(
    file,
    `<!doctype html><html style="height:100%"><body style="margin:0;overflow:hidden;width:100%;height:100%;background:transparent">${styled}</body></html>`,
  );
  const outPng = path.join(TMP, `raster-${size}.png`);
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${size},${size}`,
      '--default-background-color=00000000',
      `--screenshot=${outPng}`,
      `file:///${file.split(path.sep).join('/')}`,
    ],
    { stdio: 'ignore', timeout: 120_000 },
  );
  if (!fs.existsSync(outPng)) throw new Error(`screenshot failed for ${outPng}`);
  return decodePng(outPng);
}

/** Minimal .ico container with PNG-compressed entries. */
function writeIco(pngPaths, outPath) {
  const entries = pngPaths.map((p) => {
    const bytes = fs.readFileSync(p);
    return { bytes, w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
  });
  const dataStart = 6 + entries.length * 16;
  const out = Buffer.alloc(dataStart + entries.reduce((sum, e) => sum + e.bytes.length, 0));
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(entries.length, 4);
  let pos = 6;
  let offset = dataStart;
  entries.forEach((e) => {
    out.writeUInt8(e.w >= 256 ? 0 : e.w, pos);
    out.writeUInt8(e.h >= 256 ? 0 : e.h, pos + 1);
    out.writeUInt8(0, pos + 2);
    out.writeUInt8(0, pos + 3);
    out.writeUInt16LE(1, pos + 4);
    out.writeUInt16LE(32, pos + 6);
    out.writeUInt32LE(e.bytes.length, pos + 8);
    out.writeUInt32LE(offset, pos + 12);
    e.bytes.copy(out, offset);
    offset += e.bytes.length;
    pos += 16;
  });
  fs.writeFileSync(outPath, out);
}

function ffmpeg(args, out) {
  execFileSync(FFMPEG, ['-y', ...args, out], { stdio: 'ignore', timeout: 300_000 });
}

// ------------------------------------------------------------------- run
console.log(`temp dir: ${TMP}`);
fs.mkdirSync(CLIENT_ASSETS, { recursive: true });

// 0. rasterize each source SVG once, full square canvas (renders reliably)
const sources = {
  onlight: rasterizeSvgInline(fs.readFileSync(path.join(ROOT, 'endowgpt-logo-white.svg'), 'utf8'), CANVAS),
  ondark: rasterizeSvgInline(fs.readFileSync(path.join(ROOT, 'endowgpt-logo-dark.svg'), 'utf8'), CANVAS),
  mono: rasterizeSvgInline(fs.readFileSync(path.join(ROOT, 'endowgpt-logo-2.svg'), 'utf8'), CANVAS),
};

// 1. measure the lockup bounds in each raster (alpha > 32)
function measure(img) {
  let minX = img.w,
    maxX = -1,
    minY = img.h,
    maxY = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.data[y * img.w * 4 + x * 4 + 3] > 32) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  return { minX, maxX, minY, maxY };
}

// 2. derive raster crops; find the mark's right edge via the first wide gap
function columnGaps(img, minGap = 8) {
  const cols = new Array(img.w).fill(0);
  for (let x = 0; x < img.w; x++)
    for (let y = 0; y < img.h; y++)
      if (img.data[(y * img.w + x) * 4 + 3] > 32) cols[x]++;
  const gaps = [];
  let start = -1;
  for (let x = 0; x < img.w; x++) {
    if (cols[x] === 0) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      if (x - start >= minGap) gaps.push([start, x - 1]);
      start = -1;
    }
  }
  if (start >= 0) gaps.push([start, img.w - 1]);
  return gaps;
}

const lockupBounds = measure(sources.onlight);
const gaps = columnGaps(sources.onlight);
console.log('onlight lockup bounds:', JSON.stringify(lockupBounds), 'gaps:', JSON.stringify(gaps));
// interior gaps only (skip the empty left margin and right margin)
const interiorGaps = gaps.filter(([a, b]) => a > lockupBounds.minX && b < lockupBounds.maxX);
const markRight = interiorGaps.length
  ? interiorGaps[0][0] - 1
  : Math.round(lockupBounds.minX + (lockupBounds.maxX - lockupBounds.minX) * 0.25);
const markLeft = lockupBounds.minX;
const markTop = lockupBounds.minY;
const markHeight = lockupBounds.maxY - markTop + 1;

const markImg = crop(sources.onlight, markLeft, markTop, markRight - markLeft + 1, markHeight);
const monoBounds = measure(sources.mono);
const monoMark = crop(sources.mono, monoBounds.minX, monoBounds.minY,
  monoBounds.maxX - monoBounds.minX + 1, monoBounds.maxY - monoBounds.minY + 1);
const lockupLight = crop(sources.onlight, markLeft, markTop, sources.onlight.w - markLeft - 4, markHeight);
const lockupDark = crop(sources.ondark, markLeft, markTop, sources.onlight.w - markLeft - 4, markHeight);
const lockupMono = crop(sources.mono, markLeft, markTop, sources.onlight.w - markLeft - 4, markHeight);

// 3. favicon PNGs (transparent red mark)
const fav16 = savePng(resize(markImg, 16, 16), 'favicon-16x16.png');
const fav32 = savePng(resize(markImg, 32, 32), 'favicon-32x32.png');

// 4. PWA icons: indigo plate + red mark, maskable keeps the safe zone
savePng(onPlate(markImg, 180, INDIGO, 0.8), 'apple-touch-icon-180x180.png');
savePng(onPlate(markImg, 192, INDIGO, 0.8), 'icon-192x192.png');
savePng(onPlate(markImg, 512, INDIGO, 0.8), 'icon-512x512.png');
savePng(onPlate(markImg, 512, INDIGO, 0.55), 'maskable-icon.png');

// 5. UI mark used by client components (raster: deterministic everywhere,
//    unlike viewBox-cropped SVG variants of this artwork, which Chromium mangles)
savePng(resize(markImg, 286, 286), 'endowgpt-mark.png');
savePng(resize(markImg, 572, 572), 'endowgpt-mark@2x.png');
savePng(resize(monoMark, 286, 286), 'endowgpt-mark-mono.png');

// 6. favicon.ico
const icoOut = path.join(CLIENT_ASSETS, 'favicon.ico');
writeIco([fav16, fav32], icoOut);
console.log(`ico: ${icoOut}`);

// 7. serve the original square SVGs untouched (CSS crops happen in the app;
//    Chromium mangles viewBox-cropped variants of this artwork)
const served = {
  'endowgpt-logo-onlight.svg': path.join(ROOT, 'endowgpt-logo-white.svg'),
  'endowgpt-logo-ondark.svg': path.join(ROOT, 'endowgpt-logo-dark.svg'),
  'endowgpt-logo-mono.svg': path.join(ROOT, 'endowgpt-logo-2.svg'),
};
for (const [out, src] of Object.entries(served)) {
  const dest = path.join(CLIENT_ASSETS, out);
  fs.copyFileSync(src, dest);
  console.log(`svg: ${dest}`);
}

// 7. splash video: compressed H.264 mp4 + VP9 webm, both muted
const sourceVideo = path.join(ROOT, 'logo-reveal.mp4');
const outMp4 = path.join(CLIENT_ASSETS, 'logo-reveal.mp4');
const outWebm = path.join(CLIENT_ASSETS, 'logo-reveal.webm');
const padFilter = 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2:';
ffmpeg(
['-i', sourceVideo, '-vf', padFilter + 'white', '-c:v', 'libx264', '-crf', '26', '-preset', 'medium', '-an', '-movflags', '+faststart'],
  outMp4,
);
ffmpeg(
  ['-i', sourceVideo, '-vf', padFilter + 'black', '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-an'],
  outWebm,
);
console.log(`video: ${outMp4} ${fs.statSync(outMp4).size} bytes`);
console.log(`video: ${outWebm} ${fs.statSync(outWebm).size} bytes`);

// 8. keep the intermediate high-res crops for any future derivative work
const derived = path.join(ROOT, 'scripts', '.brand-derived');
fs.mkdirSync(derived, { recursive: true });
fs.writeFileSync(path.join(derived, 'mark-primary.png'), encodePng(markImg));
fs.writeFileSync(path.join(derived, 'source-onlight-full.png'), encodePng(sources.onlight));
fs.writeFileSync(path.join(derived, 'source-ondark-full.png'), encodePng(sources.ondark));
fs.writeFileSync(path.join(derived, 'source-mono-full.png'), encodePng(sources.mono));
fs.writeFileSync(path.join(derived, 'mark-mono.png'), encodePng(monoMark));
fs.writeFileSync(path.join(derived, 'lockup-onlight.png'), encodePng(lockupLight));
fs.writeFileSync(path.join(derived, 'lockup-ondark.png'), encodePng(lockupDark));
fs.writeFileSync(path.join(derived, 'lockup-mono.png'), encodePng(lockupMono));
console.log(`derived: ${derived}`);

fs.rmSync(TMP, { recursive: true, force: true });
console.log('done.');
