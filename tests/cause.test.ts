import { test } from "node:test";
import assert from "node:assert/strict";
import type { Row } from "../src/lib/data";
import { generateDemo, TOPICS } from "../src/lib/data";
import { classTopics, textbookEffects, topicStats } from "../src/lib/analytics";
import { truthCheck, whereIsCause } from "../src/lib/cause";

// 3 textbooks × 8 classes each, two topics; varied baselines so the model is adjusted
function world(badClasses: number, bookGap: number): Row[] {
  const rows: Row[] = [];
  const books = ["X", "Y", "Z"];
  for (let b = 0; b < 3; b++)
    for (let c = 0; c < 8; c++) {
      const baseline = 50 + ((c * 7 + b * 3) % 20);
      for (const topic of ["T", "U"]) {
        let mean = 10 + 0.8 * baseline + ((c + b) % 3) - 1;
        if (topic === "T" && b === 0 && c < badClasses) mean -= 20; // a few weak classes with book X
        if (topic === "T" && b === 0) mean -= bookGap; // the whole book X weaker on T
        for (let s = 0; s < 10; s++) rows.push({ district: "D", school: `S${b}-${c}`, cls: "7A", textbook: books[b], topic, quarter: 1, score: mean + ((s % 5) - 2), baseline });
      }
    }
  return rows;
}

test("one weak class does not condemn its textbook: verdict 'local', cause 'class'", () => {
  const rows = world(1, 0);
  const cts = classTopics(rows);
  const e = textbookEffects(cts, ["T", "U"]);
  const cell = e.cells.find((c) => c.textbook === "X" && c.topic === "T")!;
  assert.notEqual(cell.verdict, "worse", JSON.stringify(cell));
  const st = topicStats(rows, ["T"])[0];
  const cause = whereIsCause(cts, e.cells, "T", 75); // topic itself at target: the problem is local
  assert.equal(cause.level, "class");
  assert.equal(cause.worst!.textbook, "X");
  assert.equal(cause.others!.n, 7);
  assert.ok(Math.abs(cause.others!.mean) < 4, `others mean ${cause.others!.mean}`);
  assert.ok(st.n > 0);
});

test("two weak classes still do not blame the textbook", () => {
  const cts = classTopics(world(2, 0));
  const e = textbookEffects(cts, ["T", "U"]);
  assert.notEqual(e.cells.find((c) => c.textbook === "X" && c.topic === "T")!.verdict, "worse");
});

test("a textbook weak across all its classes is blamed", () => {
  const cts = classTopics(world(0, 9));
  const e = textbookEffects(cts, ["T", "U"]);
  assert.equal(e.cells.find((c) => c.textbook === "X" && c.topic === "T")!.verdict, "worse");
  assert.equal(whereIsCause(cts, e.cells, "T", 60).level, "textbook");
});

test("honesty check: the method recovers the effects injected into the demo generator", () => {
  const { rows } = generateDemo();
  const cts = classTopics(rows);
  const e = textbookEffects(cts, TOPICS.map((t) => t.name));
  const tc = truthCheck(cts, e.cells);
  assert.ok(tc.mae < 1.5, `MAE ${tc.mae}`);
  assert.ok(tc.inCI >= 80, `in CI ${tc.inCI}%`);
});

test("'better' also needs to survive dropping its 2 strongest classes", () => {
  const rows: Row[] = [];
  const books = ["X", "Y", "Z"];
  for (let b = 0; b < 3; b++) for (let c = 0; c < 8; c++) {
    const baseline = 50 + ((c * 7 + b * 3) % 20);
    let mean = 10 + 0.8 * baseline + ((c + b) % 3) - 1;
    if (b === 0 && c < 2) mean += 20; // two star classes with book X
    for (let s = 0; s < 10; s++) rows.push({ district: "D", school: `S${b}-${c}`, cls: "7A", textbook: books[b], topic: "T", quarter: 1, score: mean + ((s % 5) - 2), baseline });
  }
  const e = textbookEffects(classTopics(rows), ["T"]);
  assert.notEqual(e.cells.find((x) => x.textbook === "X")!.verdict, "better");
});
