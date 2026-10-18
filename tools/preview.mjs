#!/usr/bin/env node
/**
 * Zero-dependency preview + layout self-check for this static landing page.
 *
 *   node tools/preview.mjs          -> screenshots + report in preview-checks/
 *   node tools/preview.mjs --og     -> also regenerate assets/og.jpg (1200x630)
 *
 * Requires Node 22+ (global fetch/WebSocket) and a locally installed
 * Chrome / Edge / Chromium. No npm dependencies.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'preview-checks');
const MAKE_OG = process.argv.includes('--og');
const PORT = 9333 + Math.floor(Math.random() * 300);
const PROFILE = path.join(ROOT, 'preview-checks', '.chrome-profile');
const PAGE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];
const CHROME = process.env.CHROME_PATH || CANDIDATES.find(p => fs.existsSync(p));
if (!CHROME) {
  console.error('No Chrome/Edge/Chromium found. Set CHROME_PATH to the executable.');
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--force-color-profile=srgb',
  '--window-size=1440,900', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', 'about:blank',
], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} };
process.on('exit', cleanup);

async function waitForTarget() {
  for (let i = 0; i < 120; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(150);
  }
  throw new Error('Chrome did not expose a page target');
}

const target = await waitForTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method) events.push(msg);
});
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise, userGesture: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');

async function viewport(width, height, mobile = width < 600) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await evaluate('window.dispatchEvent(new Event("resize"))');
  await sleep(300);
}
async function open() {
  await send('Page.navigate', { url: PAGE });
  await sleep(3200);
  await evaluate('document.documentElement.style.scrollBehavior="auto"');
}
async function scrollTo(selector, offset = 0) {
  const y = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const top = el.getBoundingClientRect().top + window.scrollY - ${offset};
    window.scrollTo(0, top);
    return Math.round(window.scrollY);
  })()`);
  await sleep(1800);
  return y;
}
async function shot(name, { format = 'png', quality, clip, scale } = {}) {
  const params = { format, fromSurface: true };
  if (quality) params.quality = quality;
  if (clip) { params.clip = { ...clip, scale: scale || 1 }; params.captureBeyondViewport = true; }
  const r = await send('Page.captureScreenshot', params);
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  return `preview-checks/${name}`;
}

const report = { chrome: CHROME, checkedAt: new Date().toISOString(), viewports: {}, consoleErrors: [], checks: {} };

await viewport(1440, 900, false);
await open();
report.title = await evaluate('document.title');
report.meta = await evaluate(`(() => {
  const q = s => document.querySelector(s);
  const attr = (s, a) => q(s)?.getAttribute(a) || null;
  return {
    description: attr('meta[name="description"]', 'content'),
    canonical: attr('link[rel="canonical"]', 'href'),
    ogImage: attr('meta[property="og:image"]', 'content'),
    ogTitle: attr('meta[property="og:title"]', 'content'),
    twitterCard: attr('meta[name="twitter:card"]', 'content'),
    lang: document.documentElement.lang,
    h1Count: document.querySelectorAll('h1').length,
    missingAlt: [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length,
  };
})()`);
// warm-up so every reveal / lazy screenshot is loaded
const pageHeight = await evaluate('document.documentElement.scrollHeight');
for (let y = 0; y <= pageHeight; y += 550) { await evaluate(`window.scrollTo(0, ${y})`); await sleep(60); }
await evaluate('window.scrollTo(0, 0)');
await sleep(1200);

// ---- desktop fold check ----
report.viewports['1440x900'] = await evaluate(`(() => {
  const cta = document.querySelector('#heroCta').getBoundingClientRect();
  const media = document.querySelector('.hero-media').getBoundingClientRect();
  return {
    innerWidth, innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    ctaTop: Math.round(cta.top), ctaBottom: Math.round(cta.bottom),
    ctaInFirstScreen: cta.top < innerHeight,
    mediaTop: Math.round(media.top), mediaBottom: Math.round(media.bottom),
  };
})()`);
await shot('desktop-hero.png');
report.checks.appScreens = await (async () => {
  await evaluate('document.querySelector("#tab-windows").click()');
  await scrollTo('#app', 40);
  return shot('desktop-app.png');
})();
await scrollTo('#highlights', 8);
await shot('desktop-highlights.png');
await scrollTo('#modes', 40);
await evaluate('document.querySelectorAll(".mseg button")[0].click()');
await sleep(1400);
await shot('desktop-modes.png');
await scrollTo('#download', 40);
await shot('desktop-download.png');
await evaluate('window.scrollTo(0,0)');
await sleep(600);
await shot('desktop-full.png', { clip: { x: 0, y: 0, width: 1440, height: pageHeight }, scale: 0.15 });

// ---- overflow audit at a few widths ----
report.checks.overflow = {};
for (const w of [1440, 1024, 390, 320]) {
  await viewport(w, w < 600 ? 844 : 768, w < 600);
  await evaluate('window.scrollTo(0,0)');
  await sleep(400);
  report.checks.overflow[w] = await evaluate(`(() => {
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.hl-scroller, .gallery, .cmp-scroll, .xlabels, .xviz, .seq')) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.right > innerWidth + 1.5) bad.push(el.tagName + '.' + String(el.className).slice(0, 30));
    }
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth, offenders: [...new Set(bad)].slice(0, 8) };
  })()`);
}

// ---- mobile ----
await viewport(390, 844);
await open();
report.viewports['390x844'] = await evaluate(`(() => {
  const cta = document.querySelector('#heroCta').getBoundingClientRect();
  return { innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth, ctaTop: Math.round(cta.top), ctaBottom: Math.round(cta.bottom), ctaInFirstScreen: cta.bottom <= innerHeight };
})()`);
await shot('mobile-hero.png');
await scrollTo('#app', 20);
await shot('mobile-app.png');
await evaluate('window.scrollTo(0,0)');
await sleep(500);
const mobileHeight = await evaluate('document.documentElement.scrollHeight');
await shot('mobile-full.png', { clip: { x: 0, y: 0, width: 390, height: mobileHeight }, scale: 0.3 });

// ---- reduced motion ----
await viewport(1440, 900, false);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await open();
report.checks.reducedMotion = await evaluate(`(() => {
  const media = document.querySelector('.seq-media').getBoundingClientRect();
  const frame = document.querySelector('.seq-frame').getBoundingClientRect();
  return {
    reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
    seqHeight: document.querySelector('#seq').offsetHeight,
    seqMediaWidth: Math.round(media.width),
    seqMediaOffset: Math.round(media.left - frame.left),
    seqMediaRightGap: Math.round(frame.right - media.right),
    captionsVisible: getComputedStyle(document.querySelector('.cap')).opacity,
  };
})()`);
await scrollTo('#seq', 0);
await shot('reduced-seq.png');
await send('Emulation.setEmulatedMedia', { features: [] });

// ---- optional OG image (1200x630) ----
if (MAKE_OG) {
  await viewport(1200, 630, false);
  await open();
  await evaluate(`(() => {
    const style = document.createElement('style');
    style.textContent = '.ribbon,.nav{display:none!important}.hero{padding-top:34px!important}';
    document.head.appendChild(style);
  })()`);
  await sleep(800);
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true });
  fs.writeFileSync(path.join(ROOT, 'assets', 'og.jpg'), Buffer.from(r.data, 'base64'));
  report.checks.ogWritten = `assets/og.jpg (${Math.round(fs.statSync(path.join(ROOT, 'assets', 'og.jpg')).size / 1024)} KB)`;
}

// ---- console / exceptions ----
report.consoleErrors = events
  .filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
  .map(e => e.method === 'Log.entryAdded'
    ? e.params.entry.text.slice(0, 200)
    : (e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text || '').slice(0, 200))
  .filter(t => !/github\.com\/repos\/.*releases\/latest/.test(t));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
ws.close();
process.exit(0);
