// Deterministic "facts" layer. Every number shown by "Explain", "Ask the data" or the AI comes from here:
// code computes, language (template or AI) only explains. Facts carry ids so answers can cite them.
import type { Effect, HourRec, TopicStat } from "./analytics";
import type { ItemStat, Warning } from "./diagnostics";
import type { DiD } from "./wow";

export type Fact = { id: string; tab: number; text: string; verdict?: string };
export type FactInput = {
  stats: TopicStat[];
  overall: (Effect & { naive: number; baseline: number })[];
  cells: Effect[];
  recs: HourRec[];
  items: ItemStat[];
  warns: Warning[];
  did: DiD[];
  label: (t: string) => string;
  fmt: (x: number) => string;
};

export function buildFacts(x: FactInput): Fact[] {
  const f: Fact[] = [];
  const sorted = [...x.stats].sort((a, b) => a.mean - b.mean);
  sorted.slice(0, 3).forEach((s, i) => f.push({ id: `T${i + 1}`, tab: 0, text: `Тема «${x.label(s.topic)}»: средний балл ${s.mean}%, усвоили ${s.mastery}% учеников (цель 70%).` }));
  for (const o of x.overall) f.push({ id: `B${f.filter((q) => q.id.startsWith("B")).length + 1}`, tab: 1, verdict: o.verdict, text: `«${o.textbook}»: средний ${o.naive}%, уровень классов на входе ${o.baseline}%, честный эффект ${x.fmt(o.effect)} п.п. [${x.fmt(o.lo)}; ${x.fmt(o.hi)}], ${o.k} классов.` });
  for (const c of x.cells.filter((c) => c.verdict === "worse" || c.verdict === "local")) f.push({ id: `C${f.filter((q) => q.id.startsWith("C")).length + 1}`, tab: 1, text: `«${c.textbook}», тема «${x.label(c.topic!)}»: ${x.fmt(c.effect)} п.п. к ожидаемому [${x.fmt(c.lo)}; ${x.fmt(c.hi)}]${c.verdict === "local" ? ", но отставание дают 1–2 класса" : ""}.` });
  const moved = x.recs.filter((r) => r.delta > 0);
  if (moved.length) f.push({ id: "H1", tab: 2, text: `План часов: ${moved.map((r) => `«${x.label(r.topic)}» ${r.plan}→${r.rec} ч`).join(", ")}; общий объём ${x.recs.reduce((s, r) => s + r.plan, 0)} ч не меняется.` });
  x.items.filter((i) => i.flags.length).forEach((i) => f.push({ id: `Q${i.item + 1}`, tab: 3, text: `Вопрос ${i.item + 1}: решили ${Math.round(i.p * 100)}%, различающая способность r = ${i.rpb}${i.trap ? `, сильные ученики выбирают «${i.trap}»` : ""}.` }));
  x.warns.forEach((w, i) => f.push({ id: `W${i + 1}`, tab: 4, text: `${w.school}, ${w.cls}: во 2-м полугодии хуже ожидаемого на ${x.fmt(w.drop)} п.п. [${x.fmt(w.lo)}; ${x.fmt(w.hi)}].` }));
  x.did.filter((d) => d.significant).slice(0, 3).forEach((d, i) => f.push({ id: `E${i + 1}`, tab: 6, text: `Смена учебника ${d.from.replace(" (демо)", "")} → ${d.to.replace(" (демо)", "")}, тема «${x.label(d.topic)}»: ${x.fmt(d.did)} п.п. [${x.fmt(d.lo)}; ${x.fmt(d.hi)}] относительно школ без смены.` }));
  return f;
}

/** Template explanation (works without AI): what is happening, why, and 3 steps for this week, each tied to fact ids. */
export function explainTemplate(facts: Fact[]): { summary: { text: string; refs: string[] }[]; steps: { text: string; refs: string[] }[] } {
  const has = (p: string) => facts.filter((f) => f.id.startsWith(p)).map((f) => f.id);
  const summary: { text: string; refs: string[] }[] = [];
  const steps: { text: string; refs: string[] }[] = [];
  if (has("T").length) summary.push({ text: "Ученики не дотягивают в нескольких темах — сначала смотрим на самые слабые.", refs: has("T") });
  const books = facts.filter((f) => f.id.startsWith("B"));
  const comparable = books.filter((f) => f.verdict && f.verdict !== "few" && f.verdict !== "noadj");
  if (books.length && !comparable.length) summary.push({ text: "Для честного сравнения учебников данных пока мало: нужно минимум 3 класса на учебник и уровень классов на входе.", refs: has("B") });
  else if (comparable.some((f) => f.verdict === "better" || f.verdict === "worse")) summary.push({ text: "С учётом уровня классов на входе один из учебников заметно отличается от остальных — см. цифры.", refs: has("B") });
  else if (comparable.length) summary.push({ text: "Если учесть, с каким уровнем классы пришли, учебники в целом дают похожий результат: различия в отдельных главах, а не во всём учебнике.", refs: has("B") });
  if (has("C").length) summary.push({ text: "Есть главы, где классы с определённым учебником учатся хуже ожидаемого.", refs: has("C") });
  if (has("E").length) summary.push({ text: "Это подтверждает естественный эксперимент: школы, сменившие учебник, изменились именно в этих темах.", refs: has("E") });
  if (has("H").length) steps.push({ text: "Утвердить перенос часов в трудные темы на методобъединении (объём не меняется).", refs: has("H") });
  if (has("C").length) steps.push({ text: "Для слабых глав подобрать дополнительные задания и разбор типичных ошибок.", refs: has("C") });
  if (has("Q").length) steps.push({ text: "Проверить ключ и формулировку плохих вопросов СОР до выставления оценок.", refs: has("Q") });
  if (has("W").length) steps.push({ text: "Связаться со школами, где классы просели: выяснить причину (учитель, больничный).", refs: has("W") });
  return { summary, steps: steps.slice(0, 3) };
}

/** "Ask the data" without AI: keyword intents over the facts; honest "don't know" otherwise. */
export function askTemplate(q: string, facts: Fact[]): { answer: string; refs: string[] } {
  const s = q.toLowerCase();
  const pick = (p: string[]) => facts.filter((f) => p.some((x) => f.id.startsWith(x)));
  const intents: [RegExp, string[], string][] = [
    [/(трудн|сложн|слаб.*тем|қиын|hard|difficult|тема|тақырып)/, ["T"], "Самые трудные темы:"],
    [/(учебник|оқулық|textbook|книг)/, ["B", "C", "E"], "По учебникам:"],
    [/(час|сағат|hour|ктп)/, ["H"], "По часам:"],
    [/(вопрос|задани|сор|сұрақ|тапсырма|item|question)/, ["Q"], "По заданиям:"],
    [/(просел|упал|предупрежд|сынып|класс|warning|class)/, ["W"], "Классы, которые просели:"],
    [/(смен|эксперимент|ауыс|switch|experiment)/, ["E"], "Естественный эксперимент:"],
  ];
  for (const [re, prefixes, head] of intents) {
    if (!re.test(s)) continue;
    const fs = pick(prefixes);
    if (!fs.length) continue;
    return { answer: `${head}\n${fs.map((f) => `• ${f.text} [${f.id}]`).join("\n")}`, refs: fs.map((f) => f.id) };
  }
  return { answer: "Не знаю: в загруженных данных нет ответа на этот вопрос. Спросите о трудных темах, учебниках, часах, заданиях СОР или классах, которые просели.", refs: [] };
}

/** Editable plan for the methodologist: term plan changes, correction plan per hard topic, agenda of the methodical meeting. */
export function planTemplate(x: FactInput, days: string[]): string {
  const hard = [...x.stats].filter((s) => s.difficult).sort((a, b) => a.mean - b.mean);
  const lines: string[] = [];
  lines.push("ПЛАН МЕТОДИСТА (черновик — отредактируйте перед выгрузкой)", "");
  lines.push("1. Изменения в КТП (общий объём не меняется)");
  for (const r of x.recs) lines.push(`   • ${x.label(r.topic)}: ${r.plan} → ${r.rec} ч. ${r.why}`);
  lines.push("", "2. План коррекции по трудным темам");
  for (const s of hard) {
    const trap = x.items.find((i) => i.trap);
    lines.push(`   ${x.label(s.topic)} (средний ${s.mean}%, усвоили ${s.mastery}%):`);
    for (const d of days) lines.push(`     – ${d}`);
    if (trap && x.label(s.topic).includes("дроб")) lines.push(`     – Типичная ошибка из СОР: в вопросе ${trap.item + 1} сильные ученики выбирают «${trap.trap}» — разобрать отдельно.`);
  }
  lines.push("", "3. Повестка методобъединения");
  lines.push("   1) Итоги тестирования по темам: трудные темы и доля усвоивших.");
  lines.push("   2) Сравнение учебников с учётом уровня классов — решение о дополнительных материалах к слабым главам.");
  lines.push("   3) Утверждение переноса часов в КТП.");
  if (x.items.some((i) => i.flags.includes("bad"))) lines.push("   4) Плохие вопросы СОР: проверить ключи, заменить формулировки.");
  if (x.warns.length) lines.push(`   ${x.items.some((i) => i.flags.includes("bad")) ? 5 : 4}) Классы с ранним предупреждением: ${x.warns.map((w) => `${w.school} ${w.cls}`).join("; ")}.`);
  return lines.join("\n");
}
