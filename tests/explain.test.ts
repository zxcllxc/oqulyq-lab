import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDemo, generatePrevYear, ITEMS, TOPICS } from "../src/lib/data";
import { classTopics, hourRecs, textbookEffects, topicStats } from "../src/lib/analytics";
import { earlyWarnings, itemAnalysis } from "../src/lib/diagnostics";
import { differenceInDifferences, schoolTopicMeans } from "../src/lib/wow";
import { askTemplate, buildFacts, explainTemplate, planTemplate } from "../src/lib/explain";

const d = generateDemo();
const topics = TOPICS.map((t) => t.name);
const cts = classTopics(d.rows);
const eff = textbookEffects(cts, topics);
const stats = topicStats(d.rows, topics);
const input = {
  stats, overall: eff.overall, cells: eff.cells,
  recs: hourRecs(stats, Object.fromEntries(TOPICS.map((t) => [t.name, t.hours])), eff.cells, "ru", (x) => x),
  items: itemAnalysis(d.responses, ITEMS.map((i) => i.key)), warns: earlyWarnings(cts),
  did: differenceInDifferences(generatePrevYear(d.rows), schoolTopicMeans(d.rows), "Учебник Б (демо)", "Учебник В (демо)"),
  label: (x: string) => x, fmt: (x: number) => (x > 0 ? "+" : "") + x.toFixed(1),
};
const facts = buildFacts(input);

test("facts have unique ids and every explanation cites existing facts", () => {
  assert.equal(new Set(facts.map((f) => f.id)).size, facts.length);
  const ex = explainTemplate(facts);
  assert.ok(ex.steps.length >= 1 && ex.steps.length <= 3);
  for (const part of [...ex.summary, ...ex.steps]) for (const r of part.refs) assert.ok(facts.some((f) => f.id === r), r);
});

test("ask: known intent answers with numbers and fact ids; unknown → honest 'не знаю'", () => {
  const a = askTemplate("Какие темы самые трудные?", facts);
  assert.ok(a.refs.length > 0 && /\d/.test(a.answer));
  assert.match(askTemplate("Какая завтра погода?", facts).answer, /^Не знаю/);
  assert.ok(askTemplate("Қай тақырып қиын?", facts).refs.length > 0); // Kazakh
});

test("plan contains the term plan, correction plan and meeting agenda", () => {
  const p = planTemplate(input, ["Пн — диагностика"]);
  assert.match(p, /Изменения в КТП/);
  assert.match(p, /План коррекции/);
  assert.match(p, /Повестка методобъединения/);
});

test("explain does not claim 'similar textbooks' when there is too little data", () => {
  const few = buildFacts({ ...input, overall: input.overall.map((o) => ({ ...o, verdict: "few" as const, k: 2 })) });
  const ex = explainTemplate(few);
  assert.ok(ex.summary.some((x) => /данных пока мало/.test(x.text)));
  assert.ok(!ex.summary.some((x) => /похожий результат/.test(x.text)));
});

test("ask: price → honest no data; topic question → that topic's facts; weakest textbook leads with chapters", () => {
  const names = TOPICS.map((t) => t.name);
  assert.match(askTemplate("Сколько стоит учебник?", facts, "ru", names).answer, /цен учебников в данных нет/);
  const fr = askTemplate("Почему дроби не усваиваются?", facts, "ru", names);
  assert.match(fr.answer, /Алгебраические дроби/);
  assert.ok(fr.refs.includes("T1"));
  const b = askTemplate("Какой учебник слабее?", facts, "ru", names);
  assert.ok(b.refs[0].startsWith("C"), b.refs.join(","));
});
