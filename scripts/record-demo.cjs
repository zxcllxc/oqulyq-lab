'use strict';
// Oqulyq Lab demo recorder (ui-demo skill). Uses an existing playwright install via PW_PATH.
const { chromium } = require(process.env.PW_PATH);
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3100';
const OUT_DIR = process.env.OUT_DIR;
const REHEARSAL = process.argv.includes('--rehearse');

async function injectCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    c.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    c.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;width:24px;height:24px;transition:left .1s,top .1s;filter:drop-shadow(1px 1px 2px rgba(0,0,0,.3));left:0;top:0';
    document.body.appendChild(c);
    document.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; });
  });
}
async function injectSubtitleBar(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-subtitle')) return;
    const b = document.createElement('div');
    b.id = 'demo-subtitle';
    b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:999998;text-align:center;padding:12px 24px;background:rgba(0,0,0,.78);color:#fff;font-family:"Segoe UI",sans-serif;font-size:18px;font-weight:500;transition:opacity .3s;pointer-events:none;opacity:0';
    document.body.appendChild(b);
  });
}
async function showSubtitle(page, t) {
  await page.evaluate((x) => { const b = document.getElementById('demo-subtitle'); if (!b) return; b.textContent = x; b.style.opacity = x ? '1' : '0'; }, t);
  if (t) await page.waitForTimeout(700);
}
async function moveAndClick(page, locator, label, postClickDelay = 900) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  if (!(await el.isVisible().catch(() => false))) { console.error(`WARNING: not visible "${label}"`); return false; }
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const box = await el.boundingBox();
  if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 }); await page.waitForTimeout(350); }
  await el.click();
  await page.waitForTimeout(postClickDelay);
  return true;
}
async function smoothScroll(page, top, wait = 1600) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), top);
  await page.waitForTimeout(wait);
}
const tab = (page, name) => page.locator('nav button', { hasText: name }).first();

(async () => {
  const browser = await chromium.launch({ headless: true });
  if (REHEARSAL) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await page.goto(BASE_URL);
    let ok = true;
    for (const [label, loc] of [
      ['tab Учебники', tab(page, 'Учебники')], ['tab Часы', tab(page, 'Часы')], ['tab Задания', tab(page, 'Задания')],
      ['tab Динамика', tab(page, 'Динамика')], ['role select', page.locator('select[aria-label="Я —"]')],
      ['lang KZ', page.locator('button', { hasText: 'Қаз' })], ['KTP button', page.locator('button', { hasText: 'КТП' })],
    ]) {
      const v = await loc.first().isVisible().catch(() => false);
      // КТП lives on the Часы tab
      if (!v && label === 'KTP button') { await tab(page, 'Часы').click(); }
      const v2 = v || (await loc.first().isVisible().catch(() => false));
      console.log(`${v2 ? 'REHEARSAL OK' : 'REHEARSAL FAIL'}: ${label}`);
      ok = ok && v2;
    }
    await browser.close();
    process.exit(ok ? 0 : 1);
  }

  const context = await browser.newContext({ recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } }, viewport: { width: 1280, height: 720 }, colorScheme: 'light' });
  const page = await context.newPage();
  try {
    await page.goto(BASE_URL);
    await page.evaluate(() => { try { localStorage.setItem('oq-theme', 'light'); localStorage.setItem('oq-lang', 'ru'); } catch {} });
    await page.reload();
    await page.waitForTimeout(800);
    await injectCursor(page); await injectSubtitleBar(page);

    await showSubtitle(page, '1 — Обзор: 54 школы, 23 120 результатов, главные выводы');
    await page.mouse.move(640, 360, { steps: 8 });
    await page.waitForTimeout(1500);
    await smoothScroll(page, 330, 2600);
    await smoothScroll(page, 0, 800);

    await showSubtitle(page, '2 — Учебники: по среднему В «лучше», честно — разницы нет');
    await moveAndClick(page, tab(page, 'Учебники'), 'Учебники', 1200);
    await page.mouse.move(700, 470, { steps: 12 });
    await page.waitForTimeout(3200);
    await smoothScroll(page, 520, 2600);

    await showSubtitle(page, '3 — Часы: 5 часов в трудные темы, у каждой строки «почему»');
    await smoothScroll(page, 0, 500);
    await moveAndClick(page, tab(page, 'Часы'), 'Часы', 1200);
    await page.mouse.move(900, 450, { steps: 12 });
    await page.waitForTimeout(2600);
    await moveAndClick(page, page.locator('button', { hasText: 'КТП' }), 'КТП', 1200);

    await showSubtitle(page, '4 — Задания СОР: вопрос 7 не работает, вопрос 5 — ловушка');
    await moveAndClick(page, tab(page, 'Задания'), 'Задания', 1200);
    await page.mouse.move(700, 520, { steps: 12 });
    await page.waitForTimeout(3000);

    await showSubtitle(page, '5 — Раннее предупреждение: классы, которые просели');
    await moveAndClick(page, tab(page, 'Динамика'), 'Динамика', 1000);
    await smoothScroll(page, 420, 2800);

    await showSubtitle(page, '6 — Роль: методист района видит свой срез');
    await smoothScroll(page, 0, 600);
    await moveAndClick(page, page.locator('select[aria-label="Я —"]'), 'role', 300);
    await page.locator('select[aria-label="Я —"]').selectOption('district');
    await page.waitForTimeout(600);
    await page.locator('select[aria-label="scope"]').selectOption({ index: 1 });
    await moveAndClick(page, tab(page, 'Обзор'), 'Обзор', 2200);

    await showSubtitle(page, '7 — Қазақ тілінде де');
    await moveAndClick(page, page.locator('button', { hasText: 'Қаз' }), 'Қаз', 2400);
    await showSubtitle(page, 'Oqulyq Lab — решения об учебниках и часах по данным');
    await page.waitForTimeout(2500);
  } catch (err) {
    console.error('DEMO ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    await context.close();
    const src = await page.video().path();
    const dest = path.join(OUT_DIR, 'oqulyq-demo.webm');
    fs.renameSync(src, dest); // overwrite the stable name, no stray page@<hash>.webm left behind
    console.log('Video saved:', dest);
    await browser.close();
  }
})();
