import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDemo, TOPICS, type Row } from "../src/lib/data";
import { classTopics, hourRecs, textbookEffects, topicStats } from "../src/lib/analytics";

const topics = TOPICS.map((t) => t.name);
const hours = Object.fromEntries(TOPICS.map((t) => [t.name, t.hours]));

test("hours: total stays the same and no topic below 75% of plan", () => {
  const rows = generateDemo().rows;
  const stats = topicStats(rows, topics);
  const eff = textbookEffects(classTopics(rows), topics);
  const recs = hourRecs(stats, hours, eff.cells, "ru", (x) => x);
  assert.equal(recs.reduce((s, r) => s + r.rec, 0), recs.reduce((s, r) => s + r.plan, 0));
  for (const r of recs) assert.ok(r.rec >= Math.ceil(r.plan * 0.75), r.topic);
  for (const r of recs) assert.ok(r.why.length > 20, `why for ${r.topic}`);
});

test("fair comparison removes entry-level bias: equal books in schools of different level", () => {
  // Two textbooks with identical true effect; book X in strong classes, book Y in weak ones.
  const rows: Row[] = [];
  for (let c = 0; c < 6; c++) {
    const strong = c < 3, baseline = strong ? 80 : 50;
    for (let s = 0; s < 20; s++)
      rows.push({ district: "D", quarter: 1, school: `S${c}`, cls: "7A", textbook: strong ? "X" : "Y", topic: "T", score: baseline + ((s % 5) - 2), baseline });
  }
  // add same-level classes for both books so the slope is identifiable
  for (let c = 6; c < 10; c++) for (let s = 0; s < 20; s++)
    rows.push({ district: "D", quarter: 1, school: `S${c}`, cls: "7A", textbook: c % 2 ? "X" : "Y", topic: "T", score: 65 + ((s % 5) - 2) + (c % 2 ? 0 : 0), baseline: 65 });
  const eff = textbookEffects(classTopics(rows), ["T"]);
  const x = eff.overall.find((e) => e.textbook === "X")!, y = eff.overall.find((e) => e.textbook === "Y")!;
  assert.ok(x.naive - y.naive > 15, "naive gap is big");
  assert.ok(Math.abs(x.effect - y.effect) < 1, `fair gap ~0, got ${x.effect} vs ${y.effect}`);
});

test("few classes -> verdict 'few'", () => {
  const rows: Row[] = [0, 1].flatMap((c) => Array.from({ length: 10 }, (_, s) => ({ district: "D", quarter: 1, school: `S${c}`, cls: "7A", textbook: "Z", topic: "T", score: 60 + s, baseline: 60 })));
  const eff = textbookEffects(classTopics(rows), ["T"]);
  assert.equal(eff.overall[0].verdict, "few");
});

test("demo: book B is significantly weak on 'Формулы сокращённого умножения'", () => {
  const rows = generateDemo().rows;
  const eff = textbookEffects(classTopics(rows), topics);
  const c = eff.cells.find((c) => c.textbook === "Учебник Б (демо)" && c.topic === "Формулы сокращённого умножения")!;
  assert.equal(c.verdict, "worse");
});
