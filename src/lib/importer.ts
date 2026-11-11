import { TOPICS, type Row } from "./data";

export type Quality = { total: number; ok: number; rejected: { missing: number; range: number; nan: number; dup: number }; noBaseline: boolean };
const REQUIRED = ["school", "class", "textbook", "topic", "score"];
const QUARTER = Object.fromEntries(TOPICS.map((t) => [t.name, t.quarter]));

/**
 * Validate methodologist records (already parsed from CSV/XLSX). Trust boundary: every field is checked,
 * bad rows are counted by reason instead of silently dropped. Name/ФИО columns are never read.
 * Throws "columns" when a required column is missing entirely.
 */
export function parseImport(records: Record<string, unknown>[]): { rows: Row[]; quality: Quality; hours: Record<string, number> } {
  const lower = records.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v])));
  const cols = new Set(lower.flatMap((r) => Object.keys(r)));
  if (!lower.length || !REQUIRED.every((k) => cols.has(k))) throw new Error("columns");
  const hours: Record<string, number> = {};
  const rejected = { missing: 0, range: 0, nan: 0, dup: 0 };
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const r of lower) {
    const s = (k: string) => (r[k] == null ? "" : String(r[k]).trim());
    if (REQUIRED.some((k) => s(k) === "")) { rejected.missing++; continue; }
    const score = Number(s("score").replace(",", "."));
    if (!Number.isFinite(score)) { rejected.nan++; continue; }
    if (score < 0 || score > 100) { rejected.range++; continue; }
    if (s("student")) {
      const k = `${s("school")}|${s("class")}|${s("student")}|${s("topic")}`;
      if (seen.has(k)) { rejected.dup++; continue; }
      seen.add(k);
    }
    const h = Number(s("hours"));
    if (s("hours") && Number.isFinite(h) && h > 0 && h < 200) hours[s("topic")] = h;
    const q = Number(s("quarter"));
    const b = Number(s("baseline").replace(",", "."));
    rows.push({
      district: s("district") || "—", school: s("school"), cls: s("class"), textbook: s("textbook"), topic: s("topic"),
      quarter: q >= 1 && q <= 4 ? q : QUARTER[s("topic")] ?? 1,
      score, baseline: Number.isFinite(b) && b > 0 && b <= 100 ? b : 60,
    });
  }
  return { rows, quality: { total: lower.length, ok: rows.length, rejected, noBaseline: !cols.has("baseline") }, hours };
}
