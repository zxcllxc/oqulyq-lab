import type { Row } from "./data";

export const TARGET = 70; // target mean score for a topic, %
export const PASS = 60; // student "mastered" the topic if score >= PASS
const Z = 1.96;

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const r1 = (x: number) => Math.round(x * 10) / 10;

export type ClassTopic = { key: string; school: string; cls: string; textbook: string; topic: string; baseline: number; mean: number; n: number };

export function classTopics(rows: Row[]): ClassTopic[] {
  const m = new Map<string, ClassTopic & { sum: number }>();
  for (const r of rows) {
    const key = `${r.school}|${r.cls}`;
    const k = `${key}|${r.topic}`;
    const e = m.get(k) ?? { key, school: r.school, cls: r.cls, textbook: r.textbook, topic: r.topic, baseline: r.baseline, mean: 0, n: 0, sum: 0 };
    e.sum += r.score;
    e.n++;
    m.set(k, e);
  }
  return [...m.values()].map(({ sum, ...e }) => ({ ...e, mean: sum / e.n }));
}

export type TopicStat = { topic: string; mean: number; mastery: number; n: number; classes: number; difficult: boolean };

export function topicStats(rows: Row[], topics: string[]): TopicStat[] {
  return topics.map((t) => {
    const rs = rows.filter((r) => r.topic === t);
    const m = mean(rs.map((r) => r.score));
    const mastery = (rs.filter((r) => r.score >= PASS).length / (rs.length || 1)) * 100;
    const classes = new Set(rs.map((r) => `${r.school}|${r.cls}`)).size;
    return { topic: t, mean: r1(m), mastery: r1(mastery), n: rs.length, classes, difficult: m < TARGET - 5 };
  });
}

/**
 * Fair textbook comparison. Unit of analysis = class (not student), so big schools don't dominate.
 * Expected class score = a_topic + b * baseline (pooled OLS slope b, per-topic intercept).
 * Effect = mean residual of classes using the textbook, 95% CI = mean ± 1.96·sd/√k.
 */
export type Effect = { textbook: string; topic: string | null; effect: number; lo: number; hi: number; k: number; verdict: "better" | "worse" | "same" | "few" };

export function fairModel(cts: ClassTopic[]) {
  const byTopic = new Map<string, ClassTopic[]>();
  for (const c of cts) byTopic.set(c.topic, [...(byTopic.get(c.topic) ?? []), c]);
  // pooled within-topic slope
  let sxy = 0, sxx = 0;
  for (const list of byTopic.values()) {
    const mx = mean(list.map((c) => c.baseline)), my = mean(list.map((c) => c.mean));
    for (const c of list) { sxy += (c.baseline - mx) * (c.mean - my); sxx += (c.baseline - mx) ** 2; }
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = new Map<string, number>();
  for (const [t, list] of byTopic) a.set(t, mean(list.map((c) => c.mean)) - b * mean(list.map((c) => c.baseline)));
  const resid = cts.map((c) => ({ ...c, expected: (a.get(c.topic) ?? 0) + b * c.baseline, resid: c.mean - ((a.get(c.topic) ?? 0) + b * c.baseline) }));
  return { b: r1(b), resid };
}

function effectOf(textbook: string, topic: string | null, vals: number[]): Effect {
  const k = vals.length, m = mean(vals), half = k > 1 ? (Z * sd(vals)) / Math.sqrt(k) : Infinity;
  const lo = m - half, hi = m + half;
  const verdict = k < 3 ? "few" : lo > 0 ? "better" : hi < 0 ? "worse" : "same";
  return { textbook, topic, effect: r1(m), lo: r1(lo), hi: r1(hi), k, verdict };
}

export function textbookEffects(cts: ClassTopic[], topics: string[]) {
  const { b, resid } = fairModel(cts);
  const books = [...new Set(cts.map((c) => c.textbook))].sort();
  const overall = books.map((bk) => {
    const classes = new Map<string, number[]>();
    for (const r of resid.filter((r) => r.textbook === bk)) classes.set(r.key, [...(classes.get(r.key) ?? []), r.resid]);
    const e = effectOf(bk, null, [...classes.values()].map(mean));
    const naive = mean(cts.filter((c) => c.textbook === bk).map((c) => c.mean));
    const base = mean([...new Set(cts.filter((c) => c.textbook === bk).map((c) => c.key))].map((k) => cts.find((c) => c.key === k)!.baseline));
    return { ...e, naive: r1(naive), baseline: r1(base) };
  });
  const cells = books.flatMap((bk) => topics.map((t) => effectOf(bk, t, resid.filter((r) => r.textbook === bk && r.topic === t).map((r) => r.resid))));
  return { b, books, overall, cells };
}

export type HourRec = { topic: string; plan: number; rec: number; delta: number; mean: number; cause: "hours" | "textbook" | "ok" | "surplus"; weakBook?: string; why: string };

/**
 * Hours: total stays the same. Topics below TARGET get +1h per 7 p.p. gap (max +3),
 * unless the gap is explained by one textbook (then fix the textbook chapter, not the hours).
 * Hours are taken from topics at or above TARGET, never below 75% of plan.
 */
export function hourRecs(stats: TopicStat[], hours: Record<string, number>, cells: Effect[], lang: "ru" | "kk", label: (t: string) => string): HourRec[] {
  const recs: HourRec[] = stats.map((s) => {
    const plan = hours[s.topic] ?? 6;
    const worst = cells.filter((c) => c.topic === s.topic && c.verdict === "worse").sort((x, y) => x.effect - y.effect)[0];
    const gap = TARGET - s.mean;
    let cause: HourRec["cause"] = "ok";
    let want = 0;
    if (gap > 0 && worst && worst.effect <= -gap / 2) cause = "textbook";
    else if (gap > 0) { cause = "hours"; want = Math.min(3, Math.max(1, Math.round(gap / 7))); }
    else if (s.mean >= TARGET) cause = "surplus";
    return { topic: s.topic, plan, rec: plan, delta: 0, mean: s.mean, cause, weakBook: worst?.textbook, why: "", want } as HourRec & { want: number };
  });
  const donors = recs.filter((r) => r.cause === "surplus").sort((x, y) => y.mean - x.mean);
  let supply = donors.reduce((s, d) => s + d.plan - Math.ceil(d.plan * 0.75), 0);
  // round-robin by largest gap: every deficit topic gets its 1st hour before anyone gets a 2nd
  const receivers = recs.filter((r) => r.cause === "hours").sort((x, y) => x.mean - y.mean) as (HourRec & { want: number })[];
  let given = 0;
  for (let round = 1; round <= 3 && supply > 0; round++)
    for (const r of receivers) if (supply > 0 && r.want >= round) { r.delta++; r.rec++; supply--; given++; }
  while (given > 0)
    for (const d of donors) if (given > 0 && d.rec - 1 >= Math.ceil(d.plan * 0.75)) { d.rec--; d.delta--; given--; }
  const donorNames = donors.filter((d) => d.delta < 0).map((d) => `«${label(d.topic)}» (${d.mean}%)`).join(", ");
  for (const r of recs) {
    const gap = r1(TARGET - r.mean);
    if (lang === "ru") {
      r.why =
        r.cause === "hours" && r.delta === 0 ? `Средний балл ${r.mean}% ниже цели на ${gap} п.п., но свободные часы ушли темам с бо́льшим отставанием. Следующий кандидат на часы.` :
        r.cause === "hours" ? `Средний балл ${r.mean}% ниже цели ${TARGET}% на ${gap} п.п. во всех учебниках — это дефицит времени, а не учебника. +${r.delta} ч из тем: ${donorNames || "резерв"}.` :
        r.cause === "textbook" ? `Отставание ${gap} п.п. объясняется главой «${r.weakBook}»: её классы ниже ожидаемого. Часы не добавляем — заменить/дополнить главу.` :
        r.cause === "surplus" ? (r.delta < 0 ? `Балл ${r.mean}% выше цели на ${r1(-gap)} п.п. Можно отдать ${-r.delta} ч, не опускаясь ниже 75% плана.` : `Балл ${r.mean}% выше цели, запас есть, но часы не потребовались.`) :
        `Балл ${r.mean}% около цели — оставить как есть.`;
    } else {
      r.why =
        r.cause === "hours" && r.delta === 0 ? `Орташа балл ${r.mean}%, мақсаттан ${gap} п.п. төмен, бірақ бос сағаттар артта қалуы көбірек тақырыптарға берілді. Келесі кандидат.` :
        r.cause === "hours" ? `Орташа балл ${r.mean}%, мақсаттан (${TARGET}%) ${gap} п.п. төмен, барлық оқулықта — бұл уақыт тапшылығы. +${r.delta} сағ мына тақырыптардан: ${donorNames || "резерв"}.` :
        r.cause === "textbook" ? `${gap} п.п. артта қалу «${r.weakBook}» тарауына байланысты. Сағат қоспаймыз — тарауды ауыстыру/толықтыру керек.` :
        r.cause === "surplus" ? (r.delta < 0 ? `Балл ${r.mean}%, мақсаттан ${r1(-gap)} п.п. жоғары. ${-r.delta} сағ беруге болады (жоспардың 75%-нан төмен емес).` : `Балл ${r.mean}% мақсаттан жоғары, сағат қажет болмады.`) :
        `Балл ${r.mean}% мақсатқа жақын — өзгеріссіз.`;
    }
  }
  return recs;
}
