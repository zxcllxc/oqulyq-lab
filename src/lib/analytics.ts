import type { Row } from "./data";

export const TARGET = 70; // target mean score for a topic, %
export const PASS = 60; // student "mastered" the topic if score >= PASS
export const DEAD_ZONE = 2; // p.p. around TARGET where hours are left alone: no moves driven by noise
// two-sided 95% Student t quantiles; small samples need wider intervals than z = 1.96
const T95: [number, number][] = [[1, 12.71], [2, 4.3], [3, 3.18], [4, 2.78], [5, 2.57], [6, 2.45], [7, 2.36], [8, 2.31], [9, 2.26], [10, 2.23], [12, 2.18], [15, 2.13], [20, 2.09], [25, 2.06], [30, 2.04], [60, 2.0], [120, 1.98]];
export function t95(df: number) {
  if (df < 1) return Infinity;
  if (df > 120) return 1.96;
  let q = 12.71;
  for (const [d, v] of T95) if (df >= d) q = v;
  return q;
}
export const MIN_EFFECT = 3; // p.p.: smaller differences are not worth a textbook decision even if statistically significant

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const r1 = (x: number) => Math.round(x * 10) / 10;

export type ClassTopic = { key: string; district: string; quarter: number; school: string; cls: string; textbook: string; topic: string; baseline: number; mean: number; n: number };

export function classTopics(rows: Row[]): ClassTopic[] {
  const m = new Map<string, ClassTopic & { sum: number }>();
  for (const r of rows) {
    const key = `${r.school}|${r.cls}`;
    const k = `${key}|${r.topic}`;
    const e = m.get(k) ?? { key, district: r.district, quarter: r.quarter, school: r.school, cls: r.cls, textbook: r.textbook, topic: r.topic, baseline: r.baseline, mean: 0, n: 0, sum: 0 };
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
    return { topic: t, mean: r1(m), mastery: r1(mastery), n: rs.length, classes, difficult: rs.length > 0 && m < TARGET - 5 };
  });
}

/**
 * Fair textbook comparison. Unit of analysis = class (not student), so big schools don't dominate.
 * Expected class score = a_topic + b * baseline. b is pooled WITHIN topic×textbook groups (ANCOVA), so a textbook
 * popular with strong classes does not leak its effect into the slope; a_topic is the topic intercept across textbooks.
 * Effect = mean residual of classes using the textbook, 95% CI = mean ± t(k−1)·sd/√k.
 * adjusted=false when baselines do not vary (e.g. import without baseline): no better/worse verdicts then.
 */
export type Verdict = "better" | "worse" | "same" | "few" | "noadj" | "local";
export type Effect = { textbook: string; topic: string | null; effect: number; lo: number; hi: number; k: number; verdict: Verdict };

export function fairModel(cts: ClassTopic[]) {
  const byTopic = new Map<string, ClassTopic[]>();
  const byGroup = new Map<string, ClassTopic[]>();
  for (const c of cts) {
    byTopic.set(c.topic, [...(byTopic.get(c.topic) ?? []), c]);
    const g = `${c.topic}|${c.textbook}`;
    byGroup.set(g, [...(byGroup.get(g) ?? []), c]);
  }
  // pooled within-(topic × textbook) slope
  let sxy = 0, sxx = 0;
  for (const list of byGroup.values()) {
    const mx = mean(list.map((c) => c.baseline)), my = mean(list.map((c) => c.mean));
    for (const c of list) { sxy += (c.baseline - mx) * (c.mean - my); sxx += (c.baseline - mx) ** 2; }
  }
  const adjusted = sxx > 1e-9;
  const b = adjusted ? sxy / sxx : 0;
  const a = new Map<string, number>();
  for (const [t, list] of byTopic) a.set(t, mean(list.map((c) => c.mean)) - b * mean(list.map((c) => c.baseline)));
  const resid = cts.map((c) => ({ ...c, expected: (a.get(c.topic) ?? 0) + b * c.baseline, resid: c.mean - ((a.get(c.topic) ?? 0) + b * c.baseline) }));
  return { b: r1(b), adjusted, resid };
}

function effectOf(textbook: string, topic: string | null, vals: number[], adjusted: boolean): Effect {
  const k = vals.length, m = mean(vals), half = k > 1 ? (t95(k - 1) * sd(vals)) / Math.sqrt(k) : Infinity;
  const lo = m - half, hi = m + half;
  let verdict: Verdict = k < 3 ? "few" : !adjusted ? "noadj" : lo > 0 && m >= MIN_EFFECT ? "better" : hi < 0 && m <= -MIN_EFFECT ? "worse" : "same";
  // a textbook is blamed only if the gap survives dropping its 2 weakest classes; otherwise 1–2 classes drive it
  // symmetric: "better" must also survive dropping its 2 strongest classes (k >= 5 needed for either verdict)
  if (verdict === "worse" || verdict === "better") {
    const sorted = [...vals].sort((a, b) => a - b);
    const rest = verdict === "worse" ? sorted.slice(2) : sorted.slice(0, -2);
    const k2 = rest.length, m2 = mean(rest), h2 = k2 > 1 ? (t95(k2 - 1) * sd(rest)) / Math.sqrt(k2) : Infinity;
    const holds = verdict === "worse" ? m2 + h2 < 0 && m2 <= -MIN_EFFECT : m2 - h2 > 0 && m2 >= MIN_EFFECT;
    if (k2 < 3 || !holds) verdict = "local";
  }
  return { textbook, topic, effect: r1(m), lo: r1(lo), hi: r1(hi), k, verdict };
}

export function textbookEffects(cts: ClassTopic[], topics: string[]) {
  const { b, adjusted, resid } = fairModel(cts);
  const books = [...new Set(cts.map((c) => c.textbook))].sort();
  const overall = books.map((bk) => {
    const classes = new Map<string, number[]>();
    for (const r of resid.filter((r) => r.textbook === bk)) classes.set(r.key, [...(classes.get(r.key) ?? []), r.resid]);
    const e = effectOf(bk, null, [...classes.values()].map(mean), adjusted);
    const naive = mean(cts.filter((c) => c.textbook === bk).map((c) => c.mean));
    const base = mean([...new Set(cts.filter((c) => c.textbook === bk).map((c) => c.key))].map((k) => cts.find((c) => c.key === k)!.baseline));
    return { ...e, naive: r1(naive), baseline: r1(base) };
  });
  const cells = books.flatMap((bk) => topics.map((t) => effectOf(bk, t, resid.filter((r) => r.textbook === bk && r.topic === t).map((r) => r.resid), adjusted)));
  return { b, adjusted, books, overall, cells };
}

export type HourRec = { topic: string; plan: number; rec: number; delta: number; mean: number; cause: "hours" | "textbook" | "ok" | "surplus"; weakBook?: string; bookChecked: boolean; why: string };

/**
 * Hours: total stays the same. Topics below TARGET get +1h per 7 p.p. gap (max +3),
 * unless the gap is explained by one textbook (then fix the textbook chapter, not the hours).
 * Hours are taken from topics at or above TARGET, never below 75% of plan.
 */
export function hourRecs(stats: TopicStat[], hours: Record<string, number>, cells: Effect[], lang: "ru" | "kk" | "en", label: (t: string) => string): HourRec[] {
  const recs: HourRec[] = stats.map((s) => {
    const plan = hours[s.topic] ?? 6;
    const topicCells = cells.filter((c) => c.topic === s.topic);
    const worst = topicCells.filter((c) => c.verdict === "worse").sort((x, y) => x.effect - y.effect)[0];
    const bookChecked = topicCells.some((c) => c.verdict === "better" || c.verdict === "worse" || c.verdict === "same" || c.verdict === "local");
    const gap = TARGET - s.mean;
    let cause: HourRec["cause"] = "ok";
    let want = 0;
    if (gap > DEAD_ZONE && worst && worst.effect <= -gap / 2) cause = "textbook";
    else if (gap > DEAD_ZONE) { cause = "hours"; want = Math.min(3, Math.max(1, Math.round(gap / 7))); }
    else if (s.mean >= TARGET + DEAD_ZONE) cause = "surplus";
    return { topic: s.topic, plan, rec: plan, delta: 0, mean: s.mean, cause, weakBook: worst?.textbook, bookChecked, why: "", want } as HourRec & { want: number };
  });
  const donors = recs.filter((r) => r.cause === "surplus").sort((x, y) => y.mean - x.mean);
  const floorOf = (d: HourRec) => Math.ceil(d.plan * 0.75);
  let supply = donors.reduce((s, d) => s + Math.max(0, Math.floor(d.plan - floorOf(d))), 0);
  // round-robin by largest gap: every deficit topic gets its 1st hour before anyone gets a 2nd
  const receivers = recs.filter((r) => r.cause === "hours").sort((x, y) => x.mean - y.mean) as (HourRec & { want: number })[];
  let given = 0;
  for (let round = 1; round <= 3 && supply > 0; round++)
    for (const r of receivers) if (supply > 0 && r.want >= round) { r.delta++; r.rec++; supply--; given++; }
  // supply counts whole hours each donor can give, so this ends; the progress guard rules out any infinite loop
  for (let progress = true; given > 0 && progress; ) {
    progress = false;
    for (const d of donors) if (given > 0 && d.rec - 1 >= floorOf(d)) { d.rec--; d.delta--; given--; progress = true; }
  }
  const noReserve = donors.reduce((s, d) => s + Math.max(0, Math.floor(d.plan - floorOf(d))), 0) === 0;
  const donorNames = donors.filter((d) => d.delta < 0).map((d) => `«${label(d.topic)}» (${d.mean}%)`).join(", ");
  for (const r of recs) {
    const gap = r1(TARGET - r.mean);
    if (lang === "ru") {
      r.why =
        r.cause === "hours" && r.delta === 0 && noReserve ? `Средний балл ${r.mean}% ниже цели на ${gap} п.п., но взять часы не у кого: нет тем выше цели с запасом. Нужен пересмотр годового объёма.` :
        r.cause === "hours" && r.delta === 0 ? `Средний балл ${r.mean}% ниже цели на ${gap} п.п., но свободные часы ушли темам с бо́льшим отставанием. Следующий кандидат на часы.` :
        r.cause === "hours" && !r.bookChecked ? `Средний балл ${r.mean}% ниже цели ${TARGET}% на ${gap} п.п. Влияние учебника не проверено (мало классов или нет baseline). +${r.delta} ч из тем: ${donorNames || "резерв"}.` :
        r.cause === "hours" ? `Средний балл ${r.mean}% ниже цели ${TARGET}% на ${gap} п.п. во всех учебниках — это дефицит времени, а не учебника. +${r.delta} ч из тем: ${donorNames || "резерв"}.` :
        r.cause === "textbook" ? `Отставание ${gap} п.п. объясняется главой «${r.weakBook}»: её классы ниже ожидаемого. Часы не добавляем — заменить/дополнить главу.` :
        r.cause === "surplus" ? (r.delta < 0 ? `Балл ${r.mean}% выше цели на ${r1(-gap)} п.п. Можно отдать ${-r.delta} ч, не опускаясь ниже 75% плана.` : `Балл ${r.mean}% выше цели, запас есть, но часы не потребовались.`) :
        `Балл ${r.mean}% около цели — оставить как есть.`;
    } else if (lang === "en") {
      r.why =
        r.cause === "hours" && r.delta === 0 && noReserve ? `Mean ${r.mean}% is ${gap} p.p. below target, but no topic above target has hours to spare. The yearly volume needs review.` :
        r.cause === "hours" && r.delta === 0 ? `Mean ${r.mean}% is ${gap} p.p. below target, but the free hours went to topics with bigger gaps. Next in line for hours.` :
        r.cause === "hours" && !r.bookChecked ? `Mean ${r.mean}% is ${gap} p.p. below the ${TARGET}% target. Textbook influence not checked (too few classes or no baseline). +${r.delta} h taken from: ${donorNames || "reserve"}.` :
        r.cause === "hours" ? `Mean ${r.mean}% is ${gap} p.p. below the ${TARGET}% target with every textbook: a time deficit, not a textbook problem. +${r.delta} h taken from: ${donorNames || "reserve"}.` :
        r.cause === "textbook" ? `The ${gap} p.p. gap comes from the “${r.weakBook}” chapter: its classes are below expected. No extra hours: replace or supplement the chapter.` :
        r.cause === "surplus" ? (r.delta < 0 ? `Mean ${r.mean}% is ${r1(-gap)} p.p. above target. Can give ${-r.delta} h, staying at ≥ 75% of plan.` : `Mean ${r.mean}% is above target; hours were not needed.`) :
        `Mean ${r.mean}% is near target — keep as is.`;
    } else {
      r.why =
        r.cause === "hours" && r.delta === 0 && noReserve ? `Орташа балл ${r.mean}%, мақсаттан ${gap} п.п. төмен, бірақ сағат алатын тақырып жоқ. Жылдық көлемді қайта қарау керек.` :
        r.cause === "hours" && r.delta === 0 ? `Орташа балл ${r.mean}%, мақсаттан ${gap} п.п. төмен, бірақ бос сағаттар артта қалуы көбірек тақырыптарға берілді. Келесі кандидат.` :
        r.cause === "hours" && !r.bookChecked ? `Орташа балл ${r.mean}%, мақсаттан (${TARGET}%) ${gap} п.п. төмен. Оқулық әсері тексерілмеген (сынып аз не baseline жоқ). +${r.delta} сағ мына тақырыптардан: ${donorNames || "резерв"}.` :
        r.cause === "hours" ? `Орташа балл ${r.mean}%, мақсаттан (${TARGET}%) ${gap} п.п. төмен, барлық оқулықта — бұл уақыт тапшылығы. +${r.delta} сағ мына тақырыптардан: ${donorNames || "резерв"}.` :
        r.cause === "textbook" ? `${gap} п.п. артта қалу «${r.weakBook}» тарауына байланысты. Сағат қоспаймыз — тарауды ауыстыру/толықтыру керек.` :
        r.cause === "surplus" ? (r.delta < 0 ? `Балл ${r.mean}%, мақсаттан ${r1(-gap)} п.п. жоғары. ${-r.delta} сағ беруге болады (жоспардың 75%-нан төмен емес).` : `Балл ${r.mean}% мақсаттан жоғары, сағат қажет болмады.`) :
        `Балл ${r.mean}% мақсатқа жақын — өзгеріссіз.`;
    }
  }
  return recs;
}
