import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDemo, ITEMS, TOPICS } from "../src/lib/data";
import { classTopics } from "../src/lib/analytics";
import { earlyWarnings, itemAnalysis, quarterDynamics } from "../src/lib/diagnostics";
import type { Response } from "../src/lib/data";

const demo = generateDemo();
const keys = ITEMS.map((i) => i.key);

test("demo size: >= 50 schools and >= 20k results", () => {
  assert.ok(new Set(demo.rows.map((r) => r.school)).size >= 50);
  assert.ok(demo.rows.length >= 20000, String(demo.rows.length));
  assert.equal(new Set(demo.rows.map((r) => r.topic)).size, TOPICS.length);
});

test("item analysis on a hand-made example", () => {
  // 4 students; item 0 answered right only by the two strongest → positive discrimination
  const mk = (student: number, item: number, answer: string, total: number): Response => ({ school: "S", cls: "7A", student, item, answer, correct: answer === keys[item], total });
  const rs: Response[] = [mk(0, 0, "A", 3), mk(1, 0, "A", 3), mk(2, 0, "B", 1), mk(3, 0, "C", 0)];
  const [s] = itemAnalysis(rs, ["A"]);
  assert.equal(s.p, 0.5);
  assert.ok(s.rpb > 0.8, String(s.rpb));
});

test("demo: broken item 7 flagged bad, item 5 shows the distractor trap", () => {
  const stats = itemAnalysis(demo.responses, keys);
  assert.ok(stats[6].flags.includes("bad"), JSON.stringify(stats[6]));
  assert.ok(stats[4].flags.includes("trap") && stats[4].trap === "C", JSON.stringify(stats[4]));
  for (const i of [0, 1, 2, 3, 7, 9]) assert.ok(!stats[i].flags.includes("bad"), `item ${i + 1}`);
});

test("early warning catches sliding classes and not most of the rest", () => {
  const cts = classTopics(demo.rows);
  const warn = earlyWarnings(cts);
  const classes = new Set(cts.map((c) => c.key)).size;
  assert.ok(warn.length >= 2, `warnings ${warn.length}`);
  assert.ok(warn.length <= classes * 0.15, `too many: ${warn.length}/${classes}`);
  for (const w of warn) assert.ok(w.hi < 0 && w.drop <= -4);
});

test("quarter dynamics returns 4 quarters", () => {
  const q = quarterDynamics(classTopics(demo.rows));
  assert.deepEqual(q.map((x) => x.quarter), [1, 2, 3, 4]);
});

test("deviation by unit: regional model, a sliding class shows a negative Q3–Q4", async () => {
  const { deviationByUnit, earlyWarnings } = await import("../src/lib/diagnostics");
  const cts = classTopics(demo.rows);
  const w = earlyWarnings(cts)[0];
  const rows = deviationByUnit(cts, (c) => c.key, (c) => c.key === w.key);
  assert.equal(rows.length, 1);
  const [q1, q2, q3, q4] = rows[0].q as number[];
  assert.ok((q3 + q4) / 2 < (q1 + q2) / 2, JSON.stringify(rows[0]));
});
