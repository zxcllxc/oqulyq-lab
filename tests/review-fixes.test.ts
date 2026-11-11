// Regression tests for the independent review (santa-method, reviewer A).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Response, Row } from "../src/lib/data";
import { classTopics, hourRecs, t95, textbookEffects, topicStats, type TopicStat } from "../src/lib/analytics";
import { itemAnalysis } from "../src/lib/diagnostics";
import { parseImport } from "../src/lib/importer";

const stat = (topic: string, mean: number): TopicStat => ({ topic, mean, mastery: 50, n: 100, classes: 10, difficult: mean < 65 });

test("#1 fractional donor hours do not hang and the total is kept", () => {
  const recs = hourRecs([stat("A", 50), stat("C", 85)], { A: 6, C: 5.5 }, [], "ru", (x) => x);
  const sum = (k: "plan" | "rec") => recs.reduce((s, r) => s + r[k], 0);
  assert.equal(sum("rec"), sum("plan"));
});

test("#1 importer accepts whole hours only", () => {
  const { hours } = parseImport([{ school: "S", class: "7A", textbook: "X", topic: "T", score: 50, baseline: 60, hours: "5.5" }, { school: "S", class: "7A", textbook: "X", topic: "U", score: 50, baseline: 60, hours: 6 }]);
  assert.deepEqual(hours, { U: 6 });
});

function mkRows(f: (c: number) => { book: string; baseline: number; mean: number }, classes = 60): Row[] {
  const rows: Row[] = [];
  for (let c = 0; c < classes; c++) {
    const { book, baseline, mean } = f(c);
    for (let s = 0; s < 10; s++) rows.push({ district: "D", school: `S${c}`, cls: "7A", textbook: book, topic: "T", quarter: 1, score: mean + ((s % 5) - 2), baseline });
  }
  return rows;
}

test("#2 without baseline variation there are no better/worse verdicts", () => {
  const rows = mkRows((c) => ({ book: c % 2 ? "X" : "Y", baseline: 60, mean: c % 2 ? 70 : 52 }), 20);
  const e = textbookEffects(classTopics(rows), ["T"]);
  assert.equal(e.adjusted, false);
  for (const o of [...e.overall, ...e.cells]) assert.equal(o.verdict, "noadj");
  const recs = hourRecs(topicStats(rows, ["T"]), { T: 8 }, e.cells, "ru", (x) => x);
  assert.notEqual(recs[0].cause, "textbook");
});

test("#3 missing or invalid baseline is counted as imputed; 0 is valid", () => {
  const base = { school: "S", class: "7A", textbook: "X", topic: "T", score: 50 };
  const { quality, rows } = parseImport([{ ...base, baseline: "" }, { ...base, baseline: "abc" }, { ...base, baseline: 0 }, { ...base, baseline: 70 }]);
  assert.equal(quality.imputedBaseline, 2);
  assert.equal(rows[2].baseline, 0);
});

test("#4 ANCOVA slope: textbook chosen by strong classes keeps its true effect", () => {
  // true slope 0.6, true X−Y = 6; X mostly in strong classes (selection), deterministic spread
  const rows = mkRows((c) => {
    const strong = c < 30;
    const book = strong ? (c % 5 === 0 ? "Y" : "X") : (c % 5 === 0 ? "X" : "Y");
    const baseline = (strong ? 70 : 50) + ((c * 7) % 11) - 5;
    const mean = 20 + 0.6 * baseline + (book === "X" ? 6 : 0);
    return { book, baseline, mean };
  });
  const e = textbookEffects(classTopics(rows), ["T"]);
  const x = e.overall.find((o) => o.textbook === "X")!, y = e.overall.find((o) => o.textbook === "Y")!;
  assert.ok(Math.abs(e.b - 0.6) < 0.05, `b = ${e.b}`);
  assert.ok(Math.abs(x.effect - y.effect - 6) < 0.6, `X−Y = ${x.effect - y.effect}`);
});

test("#7 dead zone: a topic within ±2 p.p. of target is left alone", () => {
  const recs = hourRecs([stat("A", 69), stat("B", 71), stat("C", 50), stat("D", 85)], { A: 8, B: 8, C: 8, D: 8 }, [], "ru", (x) => x);
  assert.equal(recs[0].cause, "ok");
  assert.equal(recs[1].cause, "ok");
  assert.equal(recs[0].delta + recs[1].delta, 0);
});

test("#8 small samples use Student t, not z", () => {
  assert.equal(t95(2), 4.3);
  assert.equal(t95(500), 1.96);
});

test("#11/#12 items: all-correct item is not 'bad'; tiny samples get no flags", () => {
  const all: Response[] = Array.from({ length: 40 }, (_, i) => ({ school: "S", cls: "7A", student: i, item: 0, answer: "A", correct: true, total: i % 10 }));
  assert.ok(!itemAnalysis(all, ["A"])[0].flags.includes("bad"));
  const tiny: Response[] = [0, 1, 2].map((i) => ({ school: "S", cls: "7A", student: i, item: 0, answer: i === 0 ? "B" : "A", correct: i !== 0, total: 3 - i }));
  assert.deepEqual(itemAnalysis(tiny, ["A"])[0].flags, []);
});
