// "Smart import" without AI: recognise messy teacher spreadsheets and propose a column mapping
// the methodologist confirms before anything is loaded. Student names never leave this function un-coded.

export type Field = "school" | "class" | "textbook" | "topic" | "score" | "baseline" | "district" | "quarter" | "hours" | "student";
export type Mapping = { column: string; field: Field | "topicColumn" | null; sure: boolean };
export type SmartResult = { mapping: Mapping[]; records: Record<string, unknown>[]; wide: boolean; filled: number; anonymized: number; missing: Field[] };

const ALIASES: [Field, RegExp][] = [
  ["student", /^(ученик|фио|ф\.и\.о|оқушы|аты|name|student|pupil)/i],
  ["school", /^(школа|мектеп|school|организация|оо$)/i],
  ["class", /^(класс|сынып|class|группа|параллель)/i],
  ["textbook", /^(учебник|оқулық|textbook|book|умк)/i],
  ["topic", /^(тема|тақырып|topic|раздел|бөлім|section)/i],
  ["baseline", /(прошл|итог.*год|входн|baseline|өткен|бастапқы)/i],
  ["score", /^(балл|оценка|результат|score|ұпай|нәтиже|%|процент)/i],
  ["district", /^(район|аудан|district)/i],
  ["quarter", /^(четверть|тоқсан|quarter|четв)/i],
  ["hours", /^(час|сағат|hours)/i],
];
const REQUIRED: Field[] = ["school", "class", "textbook", "topic", "score"];
const FILL_DOWN: Field[] = ["district", "school", "class", "textbook"]; // merged cells come in as blanks below the first row

function guess(column: string): Field | null {
  const c = column.trim();
  for (const [f, re] of ALIASES) if (re.test(c)) return f;
  return null;
}

const isNum = (v: unknown) => v !== "" && v != null && Number.isFinite(Number(String(v).replace(",", ".")));

/** Hash-free stable code: S001, S002… in order of first appearance; the name itself is dropped. */
function coder() {
  const m = new Map<string, string>();
  return (name: string) => {
    if (!m.has(name)) m.set(name, `S${String(m.size + 1).padStart(3, "0")}`);
    return m.get(name)!;
  };
}

export function smartMap(raw: Record<string, unknown>[], overrides: Record<string, Mapping["field"]> = {}): SmartResult {
  const columns = [...new Set(raw.flatMap((r) => Object.keys(r)))].filter((c) => !/^__EMPTY/.test(c) || raw.some((r) => r[c] != null && r[c] !== ""));
  const mapping: Mapping[] = columns.map((column) => {
    const f = guess(column);
    return { column, field: f, sure: f != null };
  });
  const has = (f: Field) => mapping.some((m) => m.field === f);
  const applyOverrides = () => { for (const m of mapping) if (m.column in overrides) { m.field = overrides[m.column]; m.sure = true; } };
  applyOverrides();
  // wide journal: no topic/score columns, but several numeric unmapped columns → each such column is a topic
  let wide = false;
  if (!has("topic") && !has("score")) {
    const numericCols = mapping.filter((m) => m.field == null && raw.filter((r) => isNum(r[m.column])).length >= raw.length * 0.6);
    if (numericCols.length >= 2) {
      wide = true;
      for (const m of numericCols) { m.field = "topicColumn"; m.sure = false; }
    }
  }
  applyOverrides();
  wide = mapping.some((m) => m.field === "topicColumn");
  const code = coder();
  let filled = 0, anonymized = 0;
  const last: Partial<Record<Field, unknown>> = {};
  const records: Record<string, unknown>[] = [];
  for (const r of raw) {
    const base: Record<string, unknown> = {};
    for (const m of mapping) {
      if (!m.field || m.field === "topicColumn") continue;
      let v = r[m.column];
      if (m.field === "student") { if (v != null && v !== "") { v = code(String(v).trim()); anonymized++; } }
      if (FILL_DOWN.includes(m.field as Field)) {
        if (v == null || v === "") { if (last[m.field as Field] != null) { v = last[m.field as Field]; filled++; } }
        else last[m.field as Field] = v;
      }
      base[m.field] = v;
    }
    if (wide) {
      for (const m of mapping.filter((x) => x.field === "topicColumn")) records.push({ ...base, topic: m.column, score: r[m.column] });
    } else records.push(base);
  }
  const present = new Set(mapping.map((m) => (m.field === "topicColumn" ? ["topic", "score"] : [m.field])).flat());
  const missing = REQUIRED.filter((f) => !present.has(f));
  return { mapping, records, wide, filled, anonymized, missing };
}
