import { BOOKS, COVERAGE, TOPICS, type Row } from "./data";
import { t95, type Effect } from "./analytics";

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const variance = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
};
const r1 = (x: number) => Math.round(x * 10) / 10;

// ---------- Natural experiment: schools that switched textbook between years ----------

export type SchoolTopic = { school: string; textbook: string; topic: string; mean: number };

/** Current-year school × topic means from student rows. */
export function schoolTopicMeans(rows: Row[]): SchoolTopic[] {
  const m = new Map<string, { s: SchoolTopic; sum: number; n: number }>();
  for (const r of rows) {
    const k = `${r.school}|${r.topic}`;
    const e = m.get(k) ?? { s: { school: r.school, textbook: r.textbook, topic: r.topic, mean: 0 }, sum: 0, n: 0 };
    e.sum += r.score; e.n++; m.set(k, e);
  }
  return [...m.values()].map((e) => ({ ...e.s, mean: e.sum / e.n }));
}

export type DiD = { topic: string; from: string; to: string; switchers: number; controls: number; did: number; lo: number; hi: number; significant: boolean };

/**
 * Difference-in-differences per topic: (change in switching schools) − (change in schools that kept their textbook).
 * Each school is its own control for level; the control group removes the year-wide shift.
 * 95% CI: Welch, t with conservative df = min(n1, n2) − 1. Needs ≥ 3 schools in each group.
 */
export function differenceInDifferences(prev: SchoolTopic[], cur: SchoolTopic[], from: string, to: string): DiD[] {
  const prevBook = new Map(prev.map((p) => [p.school, p.textbook]));
  const prevMean = new Map(prev.map((p) => [`${p.school}|${p.topic}`, p.mean]));
  const topics = [...new Set(cur.map((c) => c.topic))];
  const out: DiD[] = [];
  for (const topic of topics) {
    const sw: number[] = [], ctl: number[] = [];
    for (const c of cur.filter((x) => x.topic === topic)) {
      const pm = prevMean.get(`${c.school}|${topic}`);
      const pb = prevBook.get(c.school);
      if (pm == null || pb == null) continue;
      const delta = c.mean - pm;
      if (pb === from && c.textbook === to) sw.push(delta);
      else if (pb === c.textbook) ctl.push(delta);
    }
    if (sw.length < 3 || ctl.length < 3) continue;
    const did = mean(sw) - mean(ctl);
    const se = Math.sqrt(variance(sw) / sw.length + variance(ctl) / ctl.length);
    const q = t95(Math.min(sw.length, ctl.length) - 1);
    const lo = did - q * se, hi = did + q * se;
    out.push({ topic, from, to, switchers: sw.length, controls: ctl.length, did: r1(did), lo: r1(lo), hi: r1(hi), significant: lo > 0 || hi < 0 });
  }
  return out.sort((a, b) => Math.abs(b.did) - Math.abs(a.did));
}

// ---------- Money: tenge per percentage point, procurement simulator ----------

// DEMO ASSUMPTION: textbook prices per copy, ₸. Not real publisher prices.
export const PRICES: Record<string, number> = { "Учебник А (демо)": 2800, "Учебник Б (демо)": 2400, "Учебник В (демо)": 3600 };

export type Procurement = { textbook: string; price: number; students: number; cost: number; effect: number; lo: number; hi: number; proven: boolean; extraCost: number; perPoint: number | null };

/**
 * Cost of equipping `students` with each textbook vs the cheapest one, and what the extra money buys:
 * tenge per +1 p.p. of expected score = extra cost per student / (effect − cheapest effect). Only when the
 * effect gap is positive AND the textbook's own effect is proven (CI above 0); otherwise "nothing proven to buy".
 */
export function procurement(overall: Effect[], students: number): Procurement[] {
  const rows = overall.filter((e) => PRICES[e.textbook] != null);
  if (!rows.length) return [];
  const cheapest = rows.reduce((a, b) => (PRICES[a.textbook] <= PRICES[b.textbook] ? a : b));
  return rows.map((e) => {
    const price = PRICES[e.textbook];
    const extraPerStudent = price - PRICES[cheapest.textbook];
    const gain = e.effect - cheapest.effect;
    const proven = e.verdict === "better";
    return {
      textbook: e.textbook, price, students, cost: price * students, effect: e.effect, lo: e.lo, hi: e.hi, proven,
      extraCost: extraPerStudent * students,
      perPoint: proven && gain > 0 && extraPerStudent > 0 ? Math.round(extraPerStudent / gain) : null,
    };
  });
}

// ---------- Publisher report ----------

export type ChapterIssue = { textbook: string; topic: string; pages: number; effect: number; lo: number; hi: number; medianPages: number };

/** Chapters whose classes do worse than expected, with their length vs the median chapter for that topic. */
export function publisherIssues(cells: Effect[]): ChapterIssue[] {
  return cells.filter((c) => c.verdict === "worse" && c.topic).map((c) => {
    const ti = TOPICS.findIndex((t) => t.name === c.topic);
    const pages = ti >= 0 && COVERAGE[c.textbook] ? COVERAGE[c.textbook][ti] : 0;
    const all = BOOKS.map((b) => COVERAGE[b]?.[ti] ?? 0).sort((a, b) => a - b);
    return { textbook: c.textbook, topic: c.topic!, pages, effect: c.effect, lo: c.lo, hi: c.hi, medianPages: all[Math.floor(all.length / 2)] };
  });
}

// ---------- Action card for a hard topic ----------

export type Action = { hours: number; days: string[] };

/** Template remedial week (no AI): diagnostics → worked examples → practice → mixed → re-test. */
export function remedialWeek(gap: number): Action {
  const hours = gap > 15 ? 3 : gap > 8 ? 2 : 1;
  return { hours, days: ["diag", "examples", "practice", "mixed", "retest"] };
}
