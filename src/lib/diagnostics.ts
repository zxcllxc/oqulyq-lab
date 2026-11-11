import type { Response } from "./data";
import { fairModel, type ClassTopic } from "./analytics";

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const variance = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
};
const r2 = (x: number) => Math.round(x * 100) / 100;

export type ItemStat = {
  item: number; key: string; n: number;
  p: number; // difficulty index: share of correct answers
  rpb: number; // discrimination: point-biserial correlation of item vs rest-score
  choices: Record<string, number>; // share of each option, all students
  topChoices: Record<string, number>; // share of each option in the top 27% by total
  flags: ("bad" | "hard" | "easy" | "trap")[];
  trap?: string; // distractor strong students pick
};

/** Classical item analysis. rpb uses the rest-score (total minus this item) so the item does not correlate with itself. */
export function itemAnalysis(responses: Response[], keys: string[]): ItemStat[] {
  const byItem = new Map<number, Response[]>();
  for (const r of responses) byItem.set(r.item, [...(byItem.get(r.item) ?? []), r]);
  return [...byItem.entries()].sort((a, b) => a[0] - b[0]).map(([item, rs]) => {
    const x: number[] = rs.map((r) => (r.correct ? 1 : 0));
    const y = rs.map((r) => r.total - (r.correct ? 1 : 0));
    const mx = mean(x), my = mean(y);
    const cov = x.reduce((s, xi, i) => s + (xi - mx) * (y[i] - my), 0) / Math.max(1, x.length - 1);
    const sx = Math.sqrt(variance(x)), sy = Math.sqrt(variance(y));
    const rpb = sx > 0 && sy > 0 ? cov / (sx * sy) : 0;
    const share = (list: Response[]) => {
      const out: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
      for (const r of list) out[r.answer] = (out[r.answer] ?? 0) + 1;
      for (const k in out) out[k] = r2(out[k] / (list.length || 1));
      return out;
    };
    const sorted = [...rs].sort((a, b) => b.total - a.total);
    const top = sorted.slice(0, Math.max(1, Math.round(rs.length * 0.27)));
    const topChoices = share(top);
    const key = keys[item];
    const flags: ItemStat["flags"] = [];
    if (rpb < 0.15) flags.push("bad");
    if (mx < 0.2) flags.push("hard");
    if (mx > 0.95) flags.push("easy");
    const trap = Object.entries(topChoices).filter(([k]) => k !== key).sort((a, b) => b[1] - a[1])[0];
    if (trap && trap[1] >= 0.25) flags.push("trap");
    return { item, key, n: rs.length, p: r2(mx), rpb: r2(rpb), choices: share(rs), topChoices, flags, trap: trap && trap[1] >= 0.25 ? trap[0] : undefined };
  });
}

export type Warning = { key: string; district: string; school: string; cls: string; textbook: string; first: number; second: number; drop: number; lo: number; hi: number };

/**
 * Early warning: compare a class's residual (fact − expectation from the fair model) in Q1–Q2 vs Q3–Q4.
 * Flag when the drop is ≥ 4 p.p. and its 95% CI (Welch) is entirely below zero.
 */
export function earlyWarnings(cts: ClassTopic[]): Warning[] {
  const { resid } = fairModel(cts);
  const byClass = new Map<string, typeof resid>();
  for (const r of resid) byClass.set(r.key, [...(byClass.get(r.key) ?? []), r]);
  const out: Warning[] = [];
  for (const [key, list] of byClass) {
    const a = list.filter((r) => r.quarter <= 2).map((r) => r.resid);
    const b = list.filter((r) => r.quarter >= 3).map((r) => r.resid);
    if (a.length < 2 || b.length < 2) continue;
    const drop = mean(b) - mean(a);
    const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
    const lo = drop - 1.96 * se, hi = drop + 1.96 * se;
    if (drop <= -4 && hi < 0) {
      const c = list[0];
      out.push({ key, district: c.district, school: c.school, cls: c.cls, textbook: c.textbook, first: Math.round(mean(a) * 10) / 10, second: Math.round(mean(b) * 10) / 10, drop: Math.round(drop * 10) / 10, lo: Math.round(lo * 10) / 10, hi: Math.round(hi * 10) / 10 });
    }
  }
  return out.sort((x, y) => x.drop - y.drop);
}

/** Mean class residual per quarter for a set of classes (dynamics line). */
export function quarterDynamics(cts: ClassTopic[]) {
  const { resid } = fairModel(cts);
  return [1, 2, 3, 4].map((q) => {
    const rs = cts.filter((c) => c.quarter === q);
    return { quarter: q, mean: Math.round(mean(rs.map((c) => c.mean)) * 10) / 10, resid: Math.round(mean(resid.filter((r) => r.quarter === q).map((r) => r.resid)) * 10) / 10, n: rs.length };
  });
}
