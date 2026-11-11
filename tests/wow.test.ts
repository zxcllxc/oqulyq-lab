import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDemo, generatePrevYear, TOPICS } from "../src/lib/data";
import { classTopics, textbookEffects } from "../src/lib/analytics";
import { differenceInDifferences, procurement, publisherIssues, schoolTopicMeans, type SchoolTopic } from "../src/lib/wow";

test("DiD on a hand-made example: switchers gain 6 more than controls", () => {
  const prev: SchoolTopic[] = [], cur: SchoolTopic[] = [];
  for (let s = 0; s < 8; s++) {
    const sw = s < 4;
    prev.push({ school: `S${s}`, textbook: sw ? "Б" : "А", topic: "T", mean: 50 + s });
    cur.push({ school: `S${s}`, textbook: sw ? "В" : "А", topic: "T", mean: 50 + s + 2 + (sw ? 6 : 0) + (s % 2 ? 0.5 : -0.5) });
  }
  const [d] = differenceInDifferences(prev, cur, "Б", "В");
  assert.equal(d.switchers, 4);
  assert.equal(d.controls, 4);
  assert.ok(Math.abs(d.did - 6) < 0.01, String(d.did));
  assert.ok(d.significant);
});

test("DiD on demo: Б→В switch shows a big gain on 'Формулы сокращённого умножения'", () => {
  const { rows } = generateDemo();
  const did = differenceInDifferences(generatePrevYear(rows), schoolTopicMeans(rows), "Учебник Б (демо)", "Учебник В (демо)");
  const fsu = did.find((d) => d.topic === TOPICS[3].name)!;
  assert.ok(fsu.did > 5 && fsu.significant, JSON.stringify(fsu));
  const sys = did.find((d) => d.topic === TOPICS[8].name)!;
  assert.ok(sys.did < -5 && sys.significant, JSON.stringify(sys)); // В is weak on systems: switching hurt there
});

test("procurement: no proven effect → no tenge-per-point, extra cost still shown", () => {
  const { rows } = generateDemo();
  const e = textbookEffects(classTopics(rows), TOPICS.map((t) => t.name));
  const p = procurement(e.overall, 1000);
  const v = p.find((x) => x.textbook === "Учебник В (демо)")!;
  assert.equal(v.perPoint, null);
  assert.equal(v.extraCost, (3600 - 2400) * 1000);
});

test("procurement: proven better textbook gets a price per point", () => {
  const overall = [
    { textbook: "Учебник Б (демо)", topic: null, effect: -2, lo: -3, hi: -1, k: 30, verdict: "same" as const },
    { textbook: "Учебник В (демо)", topic: null, effect: 4, lo: 3, hi: 5, k: 30, verdict: "better" as const },
  ];
  const v = procurement(overall, 100).find((x) => x.textbook === "Учебник В (демо)")!;
  assert.equal(v.perPoint, Math.round(1200 / 6));
});

test("publisher issues list weak chapters with their length", () => {
  const { rows } = generateDemo();
  const e = textbookEffects(classTopics(rows), TOPICS.map((t) => t.name));
  const issues = publisherIssues(e.cells);
  const b = issues.find((i) => i.textbook === "Учебник Б (демо)" && i.topic === TOPICS[3].name)!;
  assert.equal(b.pages, 8);
  assert.ok(b.pages < b.medianPages);
});
