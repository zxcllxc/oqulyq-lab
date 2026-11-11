// Deterministic "facts" layer. Every number shown by "Explain", "Ask the data" or the AI comes from here:
// code computes, language (template or AI) only explains. Facts carry ids so answers can cite them.
import type { Effect, HourRec, TopicStat } from "./analytics";
import type { ItemStat, Warning } from "./diagnostics";
import type { DiD } from "./wow";
import { ITEM_TOPIC } from "./data";

export type Lang = "ru" | "kk" | "en";
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
  lang?: Lang;
  name?: (s: string) => string; // display name for demo textbooks/schools in the chosen language
  causes?: { topic: string; level: string; textbook?: string; worst?: { school: string; cls: string; textbook: string; resid: number }; others?: { n: number; mean: number } }[];
};

// topic stems for "ask about a specific topic" (RU/KK/EN), mapped to the program topic order
const TOPIC_STEMS = [/(степен|дәреже|power)/, /(одночлен|бірмүше|monomial)/, /(многочлен|көпмүше|polynomial)/, /(формул|сокращ|көбейту формул|special product)/, /(разлож|множител|жіктеу|factor)/, /(дроб|бөлшек|fraction)/, /(функц|function)/, /(линейн.*уравн(?!.*систем)|^(?!.*систем).*уравнен|сызықтық теңдеу(?!лер жүйе)|linear equation)/, /(систем|жүйе|system)/, /(статист|statistic)/];

const L = {
  ru: {
    topic: (t: string, m: number, p: number) => `Тема «${t}»: средний балл ${m}%, усвоили ${p}% учеников (цель 70%).`,
    book: (b: string, n: number, base: number, e: string, lo: string, hi: string, k: number) => `«${b}»: средний ${n}%, уровень классов на входе ${base}%, честный эффект ${e} п.п. [${lo}; ${hi}], ${k} классов.`,
    cell: (b: string, t: string, e: string, lo: string, hi: string, local: boolean) => `«${b}», тема «${t}»: ${e} п.п. к ожидаемому [${lo}; ${hi}]${local ? ", но разницу дают 1–2 класса" : ""}.`,
    hours: (list: string, total: number) => `План часов: ${list}; общий объём ${total} ч не меняется.`,
    h: "ч",
    item: (n: number, p: number, r: number, trap?: string) => `Вопрос ${n}: решили ${p}%, различающая способность r = ${r}${trap ? `, сильные ученики выбирают «${trap}»` : ""}.`,
    warn: (s: string, c: string, d: string, lo: string, hi: string) => `${s}, ${c}: во 2-м полугодии хуже ожидаемого на ${d} п.п. [${lo}; ${hi}].`,
    did: (from: string, to: string, t: string, d: string, lo: string, hi: string) => `Смена учебника ${from} → ${to}, тема «${t}»: ${d} п.п. [${lo}; ${hi}] относительно школ без смены.`,
    sT: "Ученики не дотягивают в нескольких темах — сначала смотрим на самые слабые.",
    sFew: "Для честного сравнения учебников данных пока мало: нужно минимум 3 класса на учебник и уровень классов на входе.",
    sDiff: "С учётом уровня классов на входе один из учебников заметно отличается от остальных — см. цифры.",
    sSame: "Если учесть, с каким уровнем классы пришли, учебники в целом дают похожий результат: различия в отдельных главах, а не во всём учебнике.",
    sC: "Есть главы, где классы с определённым учебником учатся хуже ожидаемого.",
    sE: "Это подтверждает естественный эксперимент: школы, сменившие учебник, изменились именно в этих темах.",
    stH: "Утвердить перенос часов в трудные темы на методобъединении (объём не меняется).",
    stC: "Для слабых глав подобрать дополнительные задания и разбор типичных ошибок.",
    stQ: "Проверить ключ и формулировку плохих вопросов СОР до выставления оценок.",
    stW: "Связаться со школами, где классы просели: выяснить причину (учитель, больничный).",
    heads: ["Самые трудные темы:", "По учебникам:", "По часам:", "По заданиям:", "Классы, которые просели:", "Естественный эксперимент:", "Где причина:"],
    cause: (t: string, lvl: string, extra: string) => `Где причина по теме «${t}»: ${lvl}${extra}.`,
    lvl: { program: "программа и часы — тема проседает у всех учебников", textbook: "учебник", school: "школа", class: "один класс", none: "в норме" } as Record<string, string>,
    causeBook: (b: string) => ` «${b}» — его классы ниже ожидаемого`,
    causeClass: (c: string, s: string, n: number, m: string) => ` ${c}, ${s}; остальные ${n} классов с этим учебником в норме (${m} п.п.)`,
    noPrice: "Не знаю: цен учебников в данных нет. Платформа сравнивает результаты, а не стоимость.",
    topicHead: (t: string) => `По теме «${t}»:`,
    dontKnow: "Не знаю: в загруженных данных нет ответа на этот вопрос. Спросите о трудных темах, учебниках, часах, заданиях СОР или классах, которые просели.",
    plan: ["ПЛАН МЕТОДИСТА (черновик — отредактируйте перед выгрузкой)", "1. Изменения в КТП (общий объём не меняется)", "2. План коррекции по трудным темам", "3. Повестка методобъединения"],
    planTopic: (t: string, m: number, p: number) => `${t} (средний ${m}%, усвоили ${p}%):`,
    planTrap: (n: number, x: string) => `Типичная ошибка из СОР: в вопросе ${n} сильные ученики выбирают «${x}» — разобрать отдельно.`,
    agenda: ["Итоги тестирования по темам: трудные темы и доля усвоивших.", "Сравнение учебников с учётом уровня классов — решение о дополнительных материалах к слабым главам.", "Утверждение переноса часов в КТП.", "Плохие вопросы СОР: проверить ключи, заменить формулировки.", "Классы с ранним предупреждением:"],
  },
  kk: {
    topic: (t: string, m: number, p: number) => `«${t}» тақырыбы: орташа балл ${m}%, меңгерген оқушылар ${p}% (мақсат 70%).`,
    book: (b: string, n: number, base: number, e: string, lo: string, hi: string, k: number) => `«${b}»: орташа ${n}%, сыныптардың бастапқы деңгейі ${base}%, әділ әсер ${e} п.п. [${lo}; ${hi}], ${k} сынып.`,
    cell: (b: string, t: string, e: string, lo: string, hi: string, local: boolean) => `«${b}», «${t}» тақырыбы: күтілгенге ${e} п.п. [${lo}; ${hi}]${local ? ", бірақ айырманы 1–2 сынып береді" : ""}.`,
    hours: (list: string, total: number) => `Сағат жоспары: ${list}; жалпы көлем ${total} сағ өзгермейді.`,
    h: "сағ",
    item: (n: number, p: number, r: number, trap?: string) => `${n}-сұрақ: шешкендер ${p}%, ажырату қабілеті r = ${r}${trap ? `, күшті оқушылар «${trap}» таңдайды` : ""}.`,
    warn: (s: string, c: string, d: string, lo: string, hi: string) => `${s}, ${c}: 2-жартыжылдықта күтілгеннен ${d} п.п. төмен [${lo}; ${hi}].`,
    did: (from: string, to: string, t: string, d: string, lo: string, hi: string) => `Оқулық ауыстыру ${from} → ${to}, «${t}» тақырыбы: ауыстырмаған мектептерге қарағанда ${d} п.п. [${lo}; ${hi}].`,
    sT: "Оқушылар бірнеше тақырыпта жетпей жатыр — алдымен ең әлсіздеріне қараймыз.",
    sFew: "Оқулықтарды әділ салыстыруға деректер әзірге аз: бір оқулыққа кемінде 3 сынып және бастапқы деңгей керек.",
    sDiff: "Бастапқы деңгейді ескергенде оқулықтардың бірі басқалардан айтарлықтай ерекшеленеді — сандарды қараңыз.",
    sSame: "Сыныптардың бастапқы деңгейін ескерсек, оқулықтар жалпы ұқсас нәтиже береді: айырма бүкіл оқулықта емес, жеке тарауларда.",
    sC: "Белгілі бір оқулықпен оқитын сыныптар күтілгеннен нашар оқитын тараулар бар.",
    sE: "Мұны табиғи эксперимент растайды: оқулығын ауыстырған мектептер дәл осы тақырыптарда өзгерді.",
    stH: "Әдістемелік бірлестікте сағаттарды қиын тақырыптарға ауыстыруды бекіту (көлем өзгермейді).",
    stC: "Әлсіз тарауларға қосымша тапсырмалар мен типтік қателерді талдау дайындау.",
    stQ: "Бағалау алдында БЖБ-ның нашар сұрақтарының кілті мен тұжырымын тексеру.",
    stW: "Сыныптары төмендеген мектептермен байланысып, себебін анықтау (мұғалім, ауру).",
    heads: ["Ең қиын тақырыптар:", "Оқулықтар бойынша:", "Сағаттар бойынша:", "Тапсырмалар бойынша:", "Төмендеген сыныптар:", "Табиғи эксперимент:", "Себеп қайда:"],
    cause: (t: string, lvl: string, extra: string) => `«${t}» бойынша себеп: ${lvl}${extra}.`,
    lvl: { program: "бағдарлама мен сағат — тақырып барлық оқулықта төмен", textbook: "оқулық", school: "мектеп", class: "бір сынып", none: "қалыпты" } as Record<string, string>,
    causeBook: (b: string) => ` «${b}» — оның сыныптары күтілгеннен төмен`,
    causeClass: (c: string, s: string, n: number, m: string) => ` ${c}, ${s}; осы оқулықпен оқитын қалған ${n} сынып қалыпты (${m} п.п.)`,
    noPrice: "Білмеймін: деректерде оқулық бағасы жоқ. Платформа құнды емес, нәтижені салыстырады.",
    topicHead: (t: string) => `«${t}» тақырыбы бойынша:`,
    dontKnow: "Білмеймін: жүктелген деректерде бұл сұраққа жауап жоқ. Қиын тақырыптар, оқулықтар, сағаттар, БЖБ тапсырмалары немесе төмендеген сыныптар туралы сұраңыз.",
    plan: ["ӘДІСКЕР ЖОСПАРЫ (жоба — жүктер алдында түзетіңіз)", "1. КТЖ өзгерістері (жалпы көлем өзгермейді)", "2. Қиын тақырыптар бойынша түзету жоспары", "3. Әдістемелік бірлестік күн тәртібі"],
    planTopic: (t: string, m: number, p: number) => `${t} (орташа ${m}%, меңгерді ${p}%):`,
    planTrap: (n: number, x: string) => `БЖБ-дағы типтік қате: ${n}-сұрақта күшті оқушылар «${x}» таңдайды — бөлек талдау.`,
    agenda: ["Тақырыптар бойынша тестілеу қорытындысы: қиын тақырыптар және меңгеру үлесі.", "Сынып деңгейін ескеріп оқулықтарды салыстыру — әлсіз тарауларға қосымша материал туралы шешім.", "КТЖ-дағы сағат ауыстыруды бекіту.", "БЖБ-ның нашар сұрақтары: кілттерді тексеру, тұжырымды ауыстыру.", "Ерте ескертуі бар сыныптар:"],
  },
  en: {
    topic: (t: string, m: number, p: number) => `Topic “${t}”: mean ${m}%, mastered by ${p}% of students (target 70%).`,
    book: (b: string, n: number, base: number, e: string, lo: string, hi: string, k: number) => `“${b}”: mean ${n}%, class entry level ${base}%, fair effect ${e} p.p. [${lo}; ${hi}], ${k} classes.`,
    cell: (b: string, t: string, e: string, lo: string, hi: string, local: boolean) => `“${b}”, topic “${t}”: ${e} p.p. vs expected [${lo}; ${hi}]${local ? ", but 1–2 classes drive the difference" : ""}.`,
    hours: (list: string, total: number) => `Hours plan: ${list}; total ${total} h unchanged.`,
    h: "h",
    item: (n: number, p: number, r: number, trap?: string) => `Item ${n}: solved by ${p}%, discrimination r = ${r}${trap ? `, strong students pick “${trap}”` : ""}.`,
    warn: (s: string, c: string, d: string, lo: string, hi: string) => `${s}, ${c}: ${d} p.p. below expected in the second half-year [${lo}; ${hi}].`,
    did: (from: string, to: string, t: string, d: string, lo: string, hi: string) => `Textbook switch ${from} → ${to}, topic “${t}”: ${d} p.p. [${lo}; ${hi}] vs schools that kept theirs.`,
    sT: "Students fall short in several topics — start with the weakest.",
    sFew: "Too little data for a fair textbook comparison yet: at least 3 classes per textbook and class entry levels are needed.",
    sDiff: "Adjusted for entry level, one textbook clearly differs from the others — see the numbers.",
    sSame: "Adjusted for entry level, textbooks give similar results overall: the differences are in single chapters, not whole books.",
    sC: "Some chapters make classes with a given textbook learn worse than expected.",
    sE: "The natural experiment confirms it: schools that switched textbooks changed exactly in these topics.",
    stH: "Approve moving hours to hard topics at the methodical meeting (total unchanged).",
    stC: "Pick extra exercises and a walkthrough of typical mistakes for the weak chapters.",
    stQ: "Check the key and wording of broken test questions before grading.",
    stW: "Contact schools whose classes slid and find out why (teacher change, sick leave).",
    heads: ["Hardest topics:", "Textbooks:", "Hours:", "Test items:", "Classes that slid:", "Natural experiment:", "Where the cause is:"],
    cause: (t: string, lvl: string, extra: string) => `Cause for “${t}”: ${lvl}${extra}.`,
    lvl: { program: "programme and hours — the topic is low with every textbook", textbook: "textbook", school: "school", class: "one class", none: "on track" } as Record<string, string>,
    causeBook: (b: string) => ` “${b}” — its classes are below expected`,
    causeClass: (c: string, s: string, n: number, m: string) => ` ${c}, ${s}; the other ${n} classes with this textbook are fine (${m} p.p.)`,
    noPrice: "I don't know: the data has no textbook prices. The platform compares results, not cost.",
    topicHead: (t: string) => `On “${t}”:`,
    dontKnow: "I don't know: the loaded data has no answer to this. Ask about hard topics, textbooks, hours, test items or classes that slid.",
    plan: ["METHODOLOGIST PLAN (draft — edit before export)", "1. Term plan changes (total unchanged)", "2. Correction plan for hard topics", "3. Methodical meeting agenda"],
    planTopic: (t: string, m: number, p: number) => `${t} (mean ${m}%, mastered ${p}%):`,
    planTrap: (n: number, x: string) => `Typical mistake from the test: on item ${n} strong students pick “${x}” — address separately.`,
    agenda: ["Topic test results: hard topics and mastery.", "Textbook comparison adjusted for class level — decision on extra materials for weak chapters.", "Approve moving hours in the term plan.", "Broken test questions: check keys, rewrite wording.", "Classes with early warnings:"],
  },
};

export function buildFacts(x: FactInput): Fact[] {
  const T = L[x.lang ?? "ru"];
  const nm = x.name ?? ((s: string) => s);
  const f: Fact[] = [];
  const sorted = [...x.stats].sort((a, b) => a.mean - b.mean);
  sorted.slice(0, 3).forEach((s, i) => f.push({ id: `T${i + 1}`, tab: 0, text: T.topic(x.label(s.topic), s.mean, s.mastery) }));
  for (const o of x.overall) f.push({ id: `B${f.filter((q) => q.id.startsWith("B")).length + 1}`, tab: 1, verdict: o.verdict, text: T.book(nm(o.textbook), o.naive, o.baseline, x.fmt(o.effect), x.fmt(o.lo), x.fmt(o.hi), o.k) });
  for (const c of x.cells.filter((c) => c.verdict === "worse" || c.verdict === "local")) f.push({ id: `C${f.filter((q) => q.id.startsWith("C")).length + 1}`, tab: 1, text: T.cell(nm(c.textbook), x.label(c.topic!), x.fmt(c.effect), x.fmt(c.lo), x.fmt(c.hi), c.verdict === "local") });
  const moved = x.recs.filter((r) => r.delta > 0);
  if (moved.length) f.push({ id: "H1", tab: 2, text: T.hours(moved.map((r) => `«${x.label(r.topic)}» ${r.plan}→${r.rec} ${T.h}`).join(", "), x.recs.reduce((s, r) => s + r.plan, 0)) });
  x.items.filter((i) => i.flags.length).forEach((i) => f.push({ id: `Q${i.item + 1}`, tab: 3, text: T.item(i.item + 1, Math.round(i.p * 100), i.rpb, i.trap) }));
  x.warns.forEach((w, i) => f.push({ id: `W${i + 1}`, tab: 4, text: T.warn(nm(w.school), w.cls, x.fmt(w.drop), x.fmt(w.lo), x.fmt(w.hi)) }));
  (x.causes ?? []).filter((c) => c.level !== "none").forEach((c, i) => {
    const extra = c.level === "textbook" && c.textbook ? T.causeBook(nm(c.textbook)) : (c.level === "class" || c.level === "school") && c.worst && c.others ? T.causeClass(c.worst.cls, nm(c.worst.school), c.others.n, x.fmt(c.others.mean)) : "";
    f.push({ id: `R${i + 1}`, tab: 1, text: T.cause(x.label(c.topic), T.lvl[c.level] ?? c.level, extra) });
  });
  x.did.filter((d) => d.significant).slice(0, 3).forEach((d, i) => f.push({ id: `E${i + 1}`, tab: 6, text: T.did(nm(d.from), nm(d.to), x.label(d.topic), x.fmt(d.did), x.fmt(d.lo), x.fmt(d.hi)) }));
  return f;
}

/** Template explanation (works without AI): what is happening, why, and 3 steps for this week, each tied to fact ids. */
export function explainTemplate(facts: Fact[], lang: Lang = "ru"): { summary: { text: string; refs: string[] }[]; steps: { text: string; refs: string[] }[] } {
  const T = L[lang];
  const has = (p: string) => facts.filter((f) => f.id.startsWith(p)).map((f) => f.id);
  const summary: { text: string; refs: string[] }[] = [];
  const steps: { text: string; refs: string[] }[] = [];
  if (has("T").length) summary.push({ text: T.sT, refs: has("T") });
  const books = facts.filter((f) => f.id.startsWith("B"));
  const comparable = books.filter((f) => f.verdict && f.verdict !== "few" && f.verdict !== "noadj");
  if (books.length && !comparable.length) summary.push({ text: T.sFew, refs: has("B") });
  else if (comparable.some((f) => f.verdict === "better" || f.verdict === "worse")) summary.push({ text: T.sDiff, refs: has("B") });
  else if (comparable.length) summary.push({ text: T.sSame, refs: has("B") });
  if (has("C").length) summary.push({ text: T.sC, refs: has("C") });
  if (has("E").length) summary.push({ text: T.sE, refs: has("E") });
  if (has("H").length) steps.push({ text: T.stH, refs: has("H") });
  if (has("C").length) steps.push({ text: T.stC, refs: has("C") });
  if (has("Q").length) steps.push({ text: T.stQ, refs: has("Q") });
  if (has("W").length) steps.push({ text: T.stW, refs: has("W") });
  return { summary, steps: steps.slice(0, 3) };
}

/** "Ask the data" without AI: keyword intents (RU/KK/EN) over the facts; honest "don't know" otherwise. */
export function askTemplate(q: string, facts: Fact[], lang: Lang = "ru", topicNames: string[] = []): { answer: string; refs: string[] } {
  const T = L[lang];
  const s = q.toLowerCase();
  if (/(цен|стоит|стоимост|бағас|құны|price|cost)/.test(s)) return { answer: T.noPrice, refs: [] };
  // a question about one topic: everything we know about it (score, cause, chapters, hours, experiment)
  const ti = TOPIC_STEMS.findIndex((re) => re.test(s));
  if (ti >= 0 && topicNames[ti]) {
    const name = topicNames[ti];
    const fs = facts.filter((f) => f.text.includes(`«${name}»`) || f.text.includes(`“${name}”`) || f.text.includes(name));
    if (fs.length) return { answer: `${T.topicHead(name)}\n${fs.map((f) => `• ${f.text} [${f.id}]`).join("\n")}`, refs: fs.map((f) => f.id) };
  }
  const pick = (p: string[]) => p.flatMap((x) => facts.filter((f) => f.id.startsWith(x))); // in priority order
  // order matters: specific intents (switch, items, hours, classes) before the broad "topic" one
  const intents: [RegExp, string[], number][] = [
    [/(смен|эксперимент|перешл|перешед|ауыс|switch|experiment)/, ["E"], 5],
    [/(вопрос|задани|сор|соч|ключ|сұрақ|тапсырма|бжб|item|question)/, ["Q"], 3],
    [/(час|сағат|hour|ктп|ктж|time)/, ["H"], 2],
    [/(просел|упал|снизил|предупрежд|төмендеген|төмендеді|ескерту|slid|warning|drop)/, ["W"], 4],
    [/(учебник|оқулық|textbook|книг|издател|баспа)/, ["C", "B", "E"], 1],
    [/(почему|причин|неге|себеп|why|cause)/, ["R"], 6],
    [/(трудн|сложн|слаб|не усвоил|қиын|әлсіз|hard|difficult|weak|тема|тақырып|topic)/, ["T"], 0],
  ];
  for (const [re, prefixes, head] of intents) {
    if (!re.test(s)) continue;
    const fs = pick(prefixes);
    if (!fs.length) continue;
    return { answer: `${T.heads[head]}\n${fs.map((f) => `• ${f.text} [${f.id}]`).join("\n")}`, refs: fs.map((f) => f.id) };
  }
  return { answer: T.dontKnow, refs: [] };
}

/** Editable plan for the methodologist: term plan changes, correction plan per hard topic, agenda of the methodical meeting. */
export function planTemplate(x: FactInput, days: string[]): string {
  const T = L[x.lang ?? "ru"];
  const nm = x.name ?? ((s: string) => s);
  const hard = [...x.stats].filter((s) => s.difficult).sort((a, b) => a.mean - b.mean);
  const lines: string[] = [];
  lines.push(T.plan[0], "", T.plan[1]);
  for (const r of x.recs) lines.push(`   • ${x.label(r.topic)}: ${r.plan} → ${r.rec} ${T.h}. ${nm(r.why)}`);
  lines.push("", T.plan[2]);
  const trap = x.items.find((i) => i.trap);
  for (const s of hard) {
    lines.push(`   ${T.planTopic(x.label(s.topic), s.mean, s.mastery)}`);
    for (const d of days) lines.push(`     – ${d}`);
    if (trap && s.topic === ITEM_TOPIC) lines.push(`     – ${T.planTrap(trap.item + 1, trap.trap!)}`);
  }
  lines.push("", T.plan[3]);
  const bad = x.items.some((i) => i.flags.includes("bad"));
  const agenda = T.agenda.slice(0, 3);
  if (bad) agenda.push(T.agenda[3]);
  if (x.warns.length) agenda.push(`${T.agenda[4]} ${x.warns.map((w) => `${nm(w.school)} ${w.cls}`).join("; ")}.`);
  agenda.forEach((a, i) => lines.push(`   ${i + 1}) ${a}`));
  return lines.join("\n");
}
