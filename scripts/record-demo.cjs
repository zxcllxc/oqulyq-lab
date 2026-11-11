'use strict';
// Oqulyq Lab demo recorder (ui-demo skill). Usage:
//   PW_PATH=<path to node_modules/playwright> OUT_DIR=<dir> node scripts/record-demo.cjs [--rehearse]
const { chromium } = require(process.env.PW_PATH);
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';
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
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator.first();
  if (!(await el.isVisible().catch(() => false))) { console.error(`WARNING: not visible "${label}"`); return false; }
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const box = await el.boundingBox();
  if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 }); await page.waitForTimeout(300); }
  await el.click();
  await page.waitForTimeout(postClickDelay);
  return true;
}
async function smoothScroll(page, top, wait = 1500) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), top);
  await page.waitForTimeout(wait);
}
const tab = (page, name) => page.locator('nav button', { hasText: name });
const PASTE = ['Школа\tКласс\tУчебник\tФИО\tИтог прошлого года\tДроби\tФункция']
  .concat(Array.from({ length: 36 }, (_, i) => {
    const s = Math.floor(i / 6), k = i % 6;
    return [k ? '' : `Школа ${s + 1}`, k ? '' : '7А', k ? '' : ['А', 'Б', 'В'][s % 3], `Ученик ${s}-${k}`, 50 + s * 3, 40 + ((s * 7 + k) % 30), 55 + ((s * 3 + k) % 25)].join('\t');
  })).join('\n');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctxOpts = { viewport: { width: 1280, height: 720 }, colorScheme: 'light' };
  const context = await browser.newContext(REHEARSAL ? ctxOpts : { ...ctxOpts, recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } } });
  const page = await context.newPage();
  let ok = true;
  try {
    await page.goto(BASE_URL);
    await page.evaluate(() => { try { localStorage.setItem('oq-theme', 'light'); localStorage.setItem('oq-lang', 'ru'); localStorage.removeItem('oq-welcomed'); } catch {} });
    await page.reload();
    await page.waitForTimeout(900);
    await injectCursor(page); await injectSubtitleBar(page);

    await showSubtitle(page, '1 — Кто вы? Методист выбирает роль');
    await page.waitForTimeout(900);
    ok = (await moveAndClick(page, page.locator('[role=dialog] button', { hasText: 'Методист области' }), 'role region', 900)) && ok;

    await showSubtitle(page, '2 — Обзор: главное и «спроси данные»');
    await smoothScroll(page, 300, 1400);
    const ask = page.locator('input[name=ask]');
    await ask.scrollIntoViewIfNeeded();
    ok = (await moveAndClick(page, ask, 'ask', 200)) && ok;
    await ask.pressSequentially('Какой учебник слабее?', { delay: 35 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2600);

    await showSubtitle(page, '3 — Учебники: где причина — класс, учебник или часы');
    await smoothScroll(page, 0, 500);
    ok = (await moveAndClick(page, tab(page, 'Учебники'), 'tab books', 1200)) && ok;
    await page.mouse.move(700, 450, { steps: 10 });
    await page.waitForTimeout(2600);
    await smoothScroll(page, 900, 2200);

    await showSubtitle(page, '4 — Часы: план 102 ч, «что если» по данным, план методиста');
    await smoothScroll(page, 0, 500);
    ok = (await moveAndClick(page, tab(page, 'Часы'), 'tab hours', 1000)) && ok;
    ok = (await moveAndClick(page, page.locator('button', { hasText: 'План методиста' }), 'plan', 1800)) && ok;

    await showSubtitle(page, '5 — Обоснование: школы, сменившие учебник');
    ok = (await moveAndClick(page, tab(page, 'Обоснование'), 'tab justification', 1200)) && ok;
    await page.mouse.move(600, 500, { steps: 10 });
    await page.waitForTimeout(2400);

    await showSubtitle(page, '6 — «Объясни мне»: цифры считает код, текст объясняет');
    ok = (await moveAndClick(page, page.locator('button:visible', { hasText: 'Объясни мне' }), 'explain', 2800)) && ok;
    await page.locator('aside[role=dialog] button', { hasText: 'Закрыть' }).first().click();
    await page.waitForTimeout(500);
    await showSubtitle(page, '7 — Умный импорт: кривая ведомость, ФИО кодируются');
    ok = (await moveAndClick(page, tab(page, 'Данные'), 'tab data', 900)) && ok;
    const ta = page.locator('textarea[name=paste]');
    await ta.scrollIntoViewIfNeeded();
    await ta.fill(PASTE);
    await page.waitForTimeout(600);
    ok = (await moveAndClick(page, page.locator('button', { hasText: 'Разобрать вставленное' }), 'parse', 1800)) && ok;
    await page.mouse.move(400, 450, { steps: 10 });
    await page.waitForTimeout(1500);
    ok = (await moveAndClick(page, page.locator('button', { hasText: /^Загрузить \d+ строк/ }), 'load', 1600)) && ok;

    await showSubtitle(page, 'Oqulyq Lab — решения об учебниках и часах по данным');
    await page.waitForTimeout(2200);
  } catch (err) {
    console.error('DEMO ERROR:', err.message);
    ok = false;
  } finally {
    await context.close();
    if (!REHEARSAL) {
      const src = await page.video().path();
      fs.renameSync(src, path.join(OUT_DIR, 'oqulyq-demo.webm'));
      console.log('Video saved');
    }
    await browser.close();
    console.log(ok ? 'ALL STEPS OK' : 'SOME STEPS FAILED');
    process.exitCode = ok ? 0 : 1;
  }
})();
