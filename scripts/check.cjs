'use strict';
// Release checklist: BASE_URL=<url> PW_PATH=<playwright> node scripts/check.cjs
const { chromium } = require(process.env.PW_PATH);
const BASE = process.env.BASE_URL || 'http://localhost:3100';

(async () => {
  const b = await chromium.launch({ headless: true });
  const fails = [];
  const errs = [];
  // 1. every tab at a real 375 px viewport: no horizontal scroll, no page errors
  const m = await (await b.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  m.on('pageerror', (e) => errs.push(e.message));
  m.on('console', (c) => { if (c.type() === 'error') errs.push(c.text()); });
  const bad = (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) errs.push(`${r.status()} ${r.url()}`); };
  m.on('response', bad);
  await m.goto(BASE);
  await m.evaluate(() => { localStorage.setItem('oq-welcomed', '1'); localStorage.setItem('oq-lang', 'ru'); });
  await m.reload(); await m.waitForTimeout(800);
  const tabs = (await m.locator('nav button').allInnerTexts()).filter((t) => !/Объясни|Түсіндір|Explain/.test(t));
  const widths = {};
  for (const t of tabs) {
    await m.locator('nav button', { hasText: t }).first().click();
    await m.waitForTimeout(300);
    widths[t] = await m.evaluate(() => document.documentElement.scrollWidth);
    if (widths[t] > 375) fails.push(`375 overflow on ${t}: ${widths[t]}`);
  }
  // 2. demo path on desktop: overview → textbooks → hours → justification
  const d = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  d.on('pageerror', (e) => errs.push(e.message));
  d.on('console', (c) => { if (c.type() === 'error') errs.push(c.text()); });
  d.on('response', bad);
  await d.goto(BASE);
  await d.evaluate(() => localStorage.setItem('oq-welcomed', '1'));
  await d.reload(); await d.waitForTimeout(800);
  for (const [tab, mustSee] of [['Обзор', 'Главное'], ['Учебники', 'Где причина'], ['Часы', 'Итого'], ['Обоснование', 'Естественный эксперимент']]) {
    await d.locator('nav button', { hasText: tab }).first().click();
    await d.waitForTimeout(300);
    if (!(await d.locator('main').innerText()).includes(mustSee)) fails.push(`demo path: "${mustSee}" missing on ${tab}`);
  }
  // open Explain and ask a question: with AI off this must not produce any failed request
  await d.locator('button:visible', { hasText: 'Объясни мне' }).first().click();
  await d.waitForTimeout(800);
  await d.locator('aside[role=dialog] button', { hasText: 'Закрыть' }).first().click();
  await d.locator('nav button', { hasText: 'Обзор' }).first().click();
  await d.waitForTimeout(300);
  await d.locator('input[name=ask]').fill('Какие темы самые трудные?');
  await d.locator('input[name=ask]').press('Enter');
  await d.waitForTimeout(800);
  // 3. language persists across reload
  await d.locator('header button', { hasText: 'Eng' }).click();
  await d.reload(); await d.waitForTimeout(800);
  if ((await d.locator('nav button').first().innerText()) !== 'Overview') fails.push('language not persisted');
  // 4. other routes
  for (const path of ['/how', '/api', '/api/v1/districts', '/api/v1/openapi.json']) {
    const r = await d.request.get(BASE + path);
    if (r.status() !== 200) fails.push(`${path} → ${r.status()}`);
  }
  const ai = await d.request.post(BASE + '/api/ai', { data: { mode: 'explain', facts: [{ id: 'T1', text: 'x 1' }] } });
  if (![200, 429].includes(ai.status())) fails.push(`/api/ai → ${ai.status()}`);
  const st = await d.request.get(BASE + '/api/ai/status');
  if (st.status() !== 200) fails.push(`/api/ai/status → ${st.status()}`);
  console.log(JSON.stringify({ widths, aiStatus: ai.status(), errors: errs.slice(0, 5) }));
  if (errs.length) fails.push(`${errs.length} console/page errors`);
  console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'PASS');
  await b.close();
  process.exitCode = fails.length ? 1 : 0;
})();
