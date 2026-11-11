import { DEAD_ZONE, fairModel, TARGET, type ClassTopic, type Effect } from "./analytics";
import { BOOK_EFFECT } from "./data";

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const r1 = (x: number) => Math.round(x * 10) / 10;
export const LOW_CLASS = -8; // p.p. below expected: a class in trouble on this topic

export type CauseLevel = "program" | "textbook" | "school" | "class" | "none";
export type Cause = {
  topic: string;
  level: CauseLevel;
  shares: { textbook: number; school: number; class: number }; // % of class-level variance
  textbook?: string;
  worst?: { school: string; cls: string; textbook: string; resid: number };
  others?: { n: number; mean: number }; // same textbook, same topic, excluding the worst class
  lowClasses: number;
};

/**
 * Where does the problem live? Variance of class residuals on a topic is split into
 * between-textbook, between-school (within textbook) and within-school (class) parts, then a rule picks the level:
 * a textbook only when its cell is "worse" AND survives dropping its 2 weakest classes (verdict "worse", not "local").
 */
export function whereIsCause(cts: ClassTopic[], cells: Effect[], topic: string, topicMean: number): Cause {
  const { resid } = fairModel(cts);
  const rs = resid.filter((r) => r.topic === topic);
  const m = mean(rs.map((r) => r.resid));
  const by = <K extends string>(f: (r: (typeof rs)[number]) => K) => {
    const g = new Map<K, number[]>();
    for (const r of rs) g.set(f(r), [...(g.get(f(r)) ?? []), r.resid]);
    return g;
  };
  const books = by((r) => r.textbook);
  const schools = by((r) => `${r.textbook}|${r.school}`);
  let ssB = 0, ssS = 0, ssC = 0;
  for (const v of books.values()) ssB += v.length * (mean(v) - m) ** 2;
  for (const [k, v] of schools) { const mb = mean(books.get(k.split("|")[0] as string)!); ssS += v.length * (mean(v) - mb) ** 2; ssC += v.reduce((s, x) => s + (x - mean(v)) ** 2, 0); }
  const tot = ssB + ssS + ssC || 1;
  const shares = { textbook: Math.round((ssB / tot) * 100), school: Math.round((ssS / tot) * 100), class: Math.round((ssC / tot) * 100) };

  const low = rs.filter((r) => r.resid <= LOW_CLASS).sort((a, b) => a.resid - b.resid);
  const topicCells = cells.filter((c) => c.topic === topic);
  const robust = topicCells.filter((c) => c.verdict === "worse").sort((a, b) => a.effect - b.effect)[0];
  // the weakest class is always reported as local context; the PRIMARY level follows the priority textbook → program → school/class
  const local = low.length
    ? (() => {
        const w = low[0];
        const others = rs.filter((r) => r.textbook === w.textbook && r.key !== w.key).map((r) => r.resid);
        return { worst: { school: w.school, cls: w.cls, textbook: w.textbook, resid: r1(w.resid) }, others: { n: others.length, mean: r1(mean(others)) } };
      })()
    : {};
  const base = { topic, shares, lowClasses: low.length, ...local };
  if (robust) return { ...base, level: "textbook", textbook: robust.textbook };
  if (TARGET - topicMean > DEAD_ZONE) return { ...base, level: "program" };
  if (low.length) return { ...base, level: low.filter((r) => r.school === low[0].school).length >= 2 ? "school" : "class" };
  return { ...base, level: "none" };
}

export type TruthRow = { textbook: string; topic: string; truth: number; estimate: number; lo: number; hi: number; inCI: boolean };

/**
 * Honesty check (demo only): compare the recovered textbook×topic effects with the effects the generator injected.
 * Truth is relative to the class-weighted average of textbooks on the topic, exactly what the method estimates.
 */
export function truthCheck(cts: ClassTopic[], cells: Effect[]): { rows: TruthRow[]; mae: number; inCI: number } {
  const rows: TruthRow[] = [];
  const topics = [...new Set(cts.map((c) => c.topic))];
  for (const topic of topics) {
    const cs = cts.filter((c) => c.topic === topic);
    const ti = cs.length ? topicIndex(topic) : -1;
    if (ti < 0) continue;
    const books = [...new Set(cs.map((c) => c.textbook))].filter((b) => BOOK_EFFECT[b]);
    const avg = books.reduce((s, b) => s + BOOK_EFFECT[b][ti] * cs.filter((c) => c.textbook === b).length, 0) / cs.length;
    for (const b of books) {
      const e = cells.find((c) => c.textbook === b && c.topic === topic);
      if (!e || !Number.isFinite(e.lo)) continue;
      const truth = r1(BOOK_EFFECT[b][ti] - avg);
      rows.push({ textbook: b, topic, truth, estimate: e.effect, lo: e.lo, hi: e.hi, inCI: e.lo <= truth && truth <= e.hi });
    }
  }
  return { rows, mae: r1(mean(rows.map((r) => Math.abs(r.estimate - r.truth)))), inCI: Math.round((rows.filter((r) => r.inCI).length / (rows.length || 1)) * 100) };
}

import { TOPICS } from "./data";
const topicIndex = (name: string) => TOPICS.findIndex((t) => t.name === name);
