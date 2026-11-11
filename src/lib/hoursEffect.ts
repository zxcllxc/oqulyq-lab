import { fairModel, t95, type ClassTopic } from "./analytics";
import type { Row } from "./data";

export type HoursModel = { beta: number; se: number; n: number; lo: number; hi: number };

/**
 * Data-based "what if": how much do extra hours help? Across schools, classes taught a topic for different numbers of
 * hours. Regress the class residual (fact − expected from entry level) on x = ln(taught / plan): diminishing returns.
 * Returns null when hours do not vary (then there is no honest forecast).
 */
export function estimateHoursEffect(rows: Row[], cts: ClassTopic[], plan: Record<string, number>): HoursModel | null {
  const taught = new Map<string, number[]>();
  for (const r of rows) if (r.hours != null) {
    const k = `${r.school}|${r.cls}|${r.topic}`;
    taught.set(k, [...(taught.get(k) ?? []), r.hours]);
  }
  if (!taught.size) return null;
  const { resid } = fairModel(cts);
  const xs: number[] = [], ys: number[] = [];
  for (const c of resid) {
    const h = taught.get(`${c.school}|${c.cls}|${c.topic}`);
    const p = plan[c.topic];
    if (!h || !p) continue;
    xs.push(Math.log(h.reduce((s, x) => s + x, 0) / h.length / p));
    ys.push(c.resid);
  }
  const n = xs.length;
  if (n < 10) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (sxx < 1e-6) return null;
  const beta = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
  const sse = ys.reduce((s, y, i) => s + (y - my - beta * (xs[i] - mx)) ** 2, 0);
  const se = Math.sqrt(sse / (n - 2) / sxx);
  const q = t95(n - 2);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { beta: r2(beta), se: r2(se), n, lo: r2(beta - q * se), hi: r2(beta + q * se) };
}

/** Forecast gain (p.p.) and its interval for changing a topic's plan by `delta` hours. */
export function forecast(m: HoursModel, plan: number, delta: number) {
  const x = Math.log(Math.max(1, plan + delta) / plan);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const a = m.lo * x, b = m.hi * x;
  return { gain: r1(m.beta * x), lo: r1(Math.min(a, b)), hi: r1(Math.max(a, b)) };
}

/** Hours needed to close a gap at the point estimate; null if hours cannot close it (≤ 0 effect or > 10 h). */
export function hoursToClose(m: HoursModel, plan: number, gap: number): number | null {
  if (m.beta <= 0 || gap <= 0) return gap <= 0 ? 0 : null;
  const need = Math.ceil(plan * (Math.exp(gap / m.beta) - 1));
  return need > 10 ? null : need;
}
