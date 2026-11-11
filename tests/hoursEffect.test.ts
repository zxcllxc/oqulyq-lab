import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDemo, HOURS_GAIN, TOPICS, type Row } from "../src/lib/data";
import { classTopics } from "../src/lib/analytics";
import { estimateHoursEffect, forecast, hoursToClose } from "../src/lib/hoursEffect";

const plan = Object.fromEntries(TOPICS.map((t) => [t.name, t.hours]));

test("demo: hours effect recovered from between-school variation (truth inside the CI)", () => {
  const { rows } = generateDemo();
  const m = estimateHoursEffect(rows, classTopics(rows), plan)!;
  assert.ok(m, "model");
  assert.ok(m.lo <= HOURS_GAIN && HOURS_GAIN <= m.hi, JSON.stringify(m));
  const f = forecast(m, 10, 2);
  assert.ok(f.gain > 0 && f.lo <= f.gain && f.gain <= f.hi);
  assert.ok(forecast(m, 10, 4).gain < 2 * forecast(m, 10, 2).gain); // diminishing returns
});

test("no hours in data → no forecast (honest null)", () => {
  const rows: Row[] = generateDemo().rows.map(({ hours, ...r }) => r);
  assert.equal(estimateHoursEffect(rows, classTopics(rows), plan), null);
});

test("hoursToClose: small gap needs a few hours, a huge gap cannot be closed by hours", () => {
  const m = { beta: 6, se: 1, n: 100, lo: 4, hi: 8 };
  assert.equal(hoursToClose(m, 10, 1), 2);
  assert.equal(hoursToClose(m, 10, 20), null);
});
