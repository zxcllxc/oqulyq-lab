import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImport } from "../src/lib/importer";

const base = { School: "S1", class: "7A", textbook: "X", topic: "Одночлены", baseline: 60 };

test("rejects bad rows by reason and keeps good ones", () => {
  const { rows, quality } = parseImport([
    { ...base, score: 80, student: "1" },
    { ...base, score: "75,5", student: "2" }, // comma decimal is fine
    { ...base, score: 120, student: "3" }, // out of range
    { ...base, score: "abc", student: "4" }, // not a number
    { ...base, score: 50, student: "1" }, // duplicate student+topic
    { ...base, textbook: "", score: 40, student: "5" }, // missing field
    { ...base, score: 60, student: "6", name: "Иванов Иван" }, // name ignored
  ]);
  assert.equal(quality.total, 7);
  assert.equal(quality.ok, 3);
  assert.deepEqual(quality.rejected, { missing: 1, range: 1, nan: 1, dup: 1 });
  assert.equal(rows[1].score, 75.5);
  assert.equal(rows[0].quarter, 1); // known topic → quarter from program
  assert.ok(!JSON.stringify(rows).includes("Иванов"));
});

test("missing required column throws", () => {
  assert.throws(() => parseImport([{ school: "S", class: "7A", topic: "T", score: 1 }]), /columns/);
});

test("no baseline column is reported", () => {
  const { quality, rows } = parseImport([{ school: "S", class: "7A", textbook: "X", topic: "T", score: 50 }]);
  assert.equal(quality.noBaseline, true);
  assert.equal(rows[0].baseline, 60);
});
