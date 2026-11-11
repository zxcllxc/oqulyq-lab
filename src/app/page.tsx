"use client";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { BOOKS, COVERAGE, DISTRICTS, generateDemo, generatePrevYear, ITEMS, ITEM_TOPIC, TOPICS, type Response, type Row } from "@/lib/data";
import { classTopics, hourRecs, PASS, TARGET, textbookEffects, topicStats } from "@/lib/analytics";
import { deviationByUnit, earlyWarnings, itemAnalysis, quarterDynamics } from "@/lib/diagnostics";
import { differenceInDifferences, publisherIssues, remedialWeek, schoolTopicMeans } from "@/lib/wow";
import { truthCheck, whereIsCause } from "@/lib/cause";
import { askTemplate, buildFacts, explainTemplate, planTemplate } from "@/lib/explain";
import { estimateHoursEffect, forecast, hoursToClose } from "@/lib/hoursEffect";
import { T, type Lang } from "@/lib/i18n";
import { parseImport, type Quality } from "@/lib/importer";
import { smartMap, type Mapping } from "@/lib/smartImport";

const DEMO = generateDemo();
const PREV = generatePrevYear(DEMO.rows);
const DEMO_HOURS = Object.fromEntries(TOPICS.map((t) => [t.name, t.hours]));
const TOPIC_BY_NAME = Object.fromEntries(TOPICS.map((t) => [t.name, t]));
const KEYS = ITEMS.map((i) => i.key);
type Role = "region" | "district" | "school" | "admin";

export default function Home() {
  const [lang, setLang] = useState<Lang>("ru");
  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState(0);
  const [rows, setRows] = useState<Row[]>(DEMO.rows);
  const [responses, setResponses] = useState<Response[]>(DEMO.responses);
  const [hours, setHours] = useState<Record<string, number>>(DEMO_HOURS);
  const [isDemo, setIsDemo] = useState(true);
  const [err, setErr] = useState("");
  const [quality, setQuality] = useState<Quality | null>(null);
  const [role, setRole] = useState<Role>("region");
  const [scope, setScope] = useState("all");
  const [wiTopic, setWiTopic] = useState("");
  const [wiDelta, setWiDelta] = useState(2);
  const [all, setAll] = useState(false);
  const [notified, setNotified] = useState<string[]>([]);
  const [mapTopic, setMapTopic] = useState("");
  const [openAction, setOpenAction] = useState("");
  const [showTruth, setShowTruth] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [askQ, setAskQ] = useState("");
  const [askA, setAskA] = useState<{ answer: string; refs: string[] } | null>(null);
  const [planText, setPlanText] = useState<string | null>(null);
  const [rawImport, setRawImport] = useState<Record<string, unknown>[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Mapping["field"]>>({});
  const [pasted, setPasted] = useState("");
  const smart = useMemo(() => (rawImport ? smartMap(rawImport, overrides) : null), [rawImport, overrides]);
  const t = T[lang];
  const show = (i: number) => tab === i || all;
  const label = (topic: string) => (lang === "kk" ? TOPIC_BY_NAME[topic]?.kk : lang === "en" ? TOPIC_BY_NAME[topic]?.en : undefined) || topic;
  const distLabel = (d: string) => (lang === "kk" && DISTRICTS.find((x) => x.name === d)?.kk) || d;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("oq-theme");
      if (saved === "dark" || (!saved && matchMedia("(prefers-color-scheme: dark)").matches)) setDark(true);
      if (!localStorage.getItem("oq-welcomed")) setWelcome(true);
      const l = localStorage.getItem("oq-lang");
      if (l === "ru" || l === "kk" || l === "en") setLang(l);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.lang = lang === "kk" ? "kk" : lang;
    try { localStorage.setItem("oq-theme", dark ? "dark" : "light"); localStorage.setItem("oq-lang", lang); } catch {}
  }, [dark, lang]);

  const districts = useMemo(() => [...new Set(rows.map((r) => r.district))], [rows]);
  const schools = useMemo(() => [...new Set(rows.map((r) => r.school))], [rows]);
  function changeRole(r: Role) {
    setRole(r);
    setScope(r === "district" ? districts[0] : r === "school" ? schools[0] : "all");
  }

  const view = useMemo(() => {
    const inScope = (x: { school: string }, district?: string) =>
      scope === "all" || (role === "district" ? district === scope : x.school === scope);
    const rs = rows.filter((r) => inScope(r, r.district));
    const schoolSet = new Set(rs.map((r) => r.school));
    const resp = responses.filter((r) => schoolSet.has(r.school));
    return { rs, resp, cts: classTopics(rs) };
  }, [rows, responses, role, scope]);

  const allCts = useMemo(() => classTopics(rows), [rows]);
  const a = useMemo(() => {
    const { rs, resp } = view;
    const topics = TOPICS.map((x) => x.name).filter((n) => rs.some((r) => r.topic === n)).concat([...new Set(rs.map((r) => r.topic))].filter((n) => !TOPIC_BY_NAME[n]));
    const cts = classTopics(rs);
    const stats = topicStats(rs, topics);
    const eff = textbookEffects(cts, topics);
    const recs = hourRecs(stats, hours, eff.cells, lang, label);
    const items = resp.length ? itemAnalysis(resp, KEYS) : [];
    const warns = earlyWarnings(cts);
    const dyn = quarterDynamics(cts);
    // deviation vs the REGIONAL model, by district (region) / school (district) / class (school)
    const unitCt = (c: { district: string; school: string; cls: string }) => (scope === "all" ? c.district : role === "district" ? c.school : `${c.cls}`);
    const inScopeCt = (c: { district: string; school: string }) => scope === "all" || (role === "district" ? c.district === scope : c.school === scope);
    const dev = deviationByUnit(allCts, unitCt, inScopeCt).sort((x, y) => (x.q[2] ?? 0) + (x.q[3] ?? 0) - (y.q[2] ?? 0) - (y.q[3] ?? 0));
    // heatmap unit follows the level: region → districts, district → schools, school → classes
    const unitOf = (r: Row) => (scope === "all" ? r.district : role === "district" ? r.school : r.cls);
    const units = [...new Set(rs.map(unitOf))];
    const cell = new Map<string, [number, number]>();
    for (const r of rs) { const k = `${unitOf(r)}|${r.topic}`; const c = cell.get(k) ?? [0, 0]; c[0] += r.score; c[1]++; cell.set(k, c); }
    const heat = (u: string, tp: string) => { const c = cell.get(`${u}|${tp}`); return c ? Math.round(c[0] / c[1]) : null; };
    return {
      topics, stats, eff, recs, items, warns, dyn, dev, units, heat,
      schools: new Set(rs.map((r) => r.school)).size,
      classes: new Set(rs.map((r) => `${r.school}|${r.cls}`)).size,
    };
    // label depends only on lang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, allCts, hours, lang, role, scope]);

  const w = useMemo(() => {
    const topicsAll = [...new Set(rows.map((r) => r.topic))];
    const eff = textbookEffects(allCts, topicsAll);
    const did = isDemo ? differenceInDifferences(PREV, schoolTopicMeans(rows), "Учебник Б (демо)", "Учебник В (демо)") : [];
    const distMean = (d: string) => {
      const rs = rows.filter((r) => r.district === d && (!mapTopic || r.topic === mapTopic));
      return rs.length ? Math.round((rs.reduce((x, r) => x + r.score, 0) / rs.length) * 10) / 10 : null;
    };
    const issues = publisherIssues(eff.cells);
    return { eff, did, distMean, issues };
  }, [rows, allCts, isDemo, mapTopic]);
  const hoursModel = useMemo(() => estimateHoursEffect(rows, allCts, hours), [rows, allCts, hours]);
  const causes = a.stats.map((st) => whereIsCause(view.cts, a.eff.cells, st.topic, st.mean));
  const factInput = { stats: a.stats, overall: a.eff.overall, cells: a.eff.cells, recs: a.recs, items: a.items, warns: a.warns, did: w.did, label, fmt };
  const facts = buildFacts(factInput);
  const ownFacts = facts.filter((f) => f.tab === tab);
  const tabFacts = tab === 0 || ownFacts.length === 0 ? facts : ownFacts; // a tab without its own facts gets the overall picture
  const explained = explainTemplate(tabFacts);
  const goFact = (id: string) => { const f = facts.find((x) => x.id === id); if (f) { setTab(f.tab); setExplainOpen(false); window.scrollTo({ top: 0 }); } };
  const RefChip = ({ id }: { id: string }) => <button onClick={() => goFact(id)} className="ml-1 rounded-sm border border-accent px-1 font-mono text-[11px] text-accent hover:bg-accent hover:text-paper">{id}</button>;
  const truth = isDemo && showTruth ? truthCheck(allCts, w.eff.cells) : null;

  const sorted = [...a.stats].sort((x, y) => x.mean - y.mean);
  const naiveBest = [...a.eff.overall].sort((x, y) => y.naive - x.naive)[0];
  const worstCell = [...a.eff.cells].filter((c) => c.verdict === "worse").sort((x, y) => x.effect - y.effect)[0];
  const hourWin = a.recs.filter((r) => r.delta > 0);
  const moved = hourWin.reduce((s, r) => s + r.delta, 0);
  const badItems = a.items.filter((i) => i.flags.includes("bad"));
  const fmtList = (xs: string[]) => xs.map((x) => `«${x}»`).join(", ");

  const findings: { text: string; tab: number }[] = [];
  if (sorted[0]) findings.push({ tab: 0, text: lang === "en" ? `Hardest topic: “${label(sorted[0].topic)}” — ${sorted[0].mean}%, mastered by ${sorted[0].mastery}% of students.` : lang === "kk" ? `Ең қиын тақырып — «${label(sorted[0].topic)}»: ${sorted[0].mean}%, меңгергені ${sorted[0].mastery}%.` : `Самая трудная тема — «${label(sorted[0].topic)}»: ${sorted[0].mean}%, усвоили ${sorted[0].mastery}% учеников.` });
  if (naiveBest && a.eff.overall.length > 1) findings.push({ tab: 1, text: lang === "en" ? `“${naiveBest.textbook}” looks best by mean (${naiveBest.naive}%), but after adjusting for class level its effect is ${fmt(naiveBest.effect)} p.p. — ${t.v[naiveBest.verdict]}.` : lang === "kk" ? `«${naiveBest.textbook}» орташа бойынша ең үздік сияқты (${naiveBest.naive}%), бірақ сынып деңгейін ескергенде әсері ${fmt(naiveBest.effect)} п.п. — ${t.v[naiveBest.verdict]}.` : `«${naiveBest.textbook}» выглядит лучшим по среднему (${naiveBest.naive}%), но после учёта уровня классов его эффект ${fmt(naiveBest.effect)} п.п. — ${t.v[naiveBest.verdict]}.` });
  if (worstCell) findings.push({ tab: 1, text: lang === "en" ? `Weak chapter: “${worstCell.textbook}”, “${label(worstCell.topic!)}” — ${fmt(worstCell.effect)} p.p. vs expected.` : lang === "kk" ? `Оқулықтың әлсіз жері: «${worstCell.textbook}», «${label(worstCell.topic!)}» — күтілгенге ${fmt(worstCell.effect)} п.п.` : `Слабое место учебника: «${worstCell.textbook}», тема «${label(worstCell.topic!)}» — ${fmt(worstCell.effect)} п.п. к ожидаемому.` });
  if (moved > 0) findings.push({ tab: 2, text: lang === "en" ? `Move ${moved} h to ${fmtList(hourWin.map((r) => label(r.topic)))} without raising the total load.` : lang === "kk" ? `${moved} сағатты мына тақырыптарға ауыстыру: ${fmtList(hourWin.map((r) => label(r.topic)))} — жүктемені арттырмай.` : `Перенести ${moved} ч в темы: ${fmtList(hourWin.map((r) => label(r.topic)))} — без увеличения нагрузки.` });
  if (a.warns.length) findings.push({ tab: 4, text: lang === "en" ? `${a.warns.length} classes slid in the second half-year — first: ${a.warns[0].school}, ${a.warns[0].cls} (${fmt(a.warns[0].drop)} p.p.).` : lang === "kk" ? `${a.warns.length} сынып 2-жартыжылдықта төмендеді — біріншісі: ${a.warns[0].school}, ${a.warns[0].cls} (${fmt(a.warns[0].drop)} п.п.).` : `Просели во 2-м полугодии классов: ${a.warns.length}. Первый: ${a.warns[0].school}, ${a.warns[0].cls} (${fmt(a.warns[0].drop)} п.п.).` });
  if (badItems.length) findings.push({ tab: 3, text: lang === "en" ? `Test item(s) ${badItems.map((i) => i.item + 1).join(", ")} do not work (r = ${badItems[0].rpb}): check the key before grading.` : lang === "kk" ? `${badItems.map((i) => i.item + 1).join(", ")}-сұрақ жұмыс істемейді (r = ${badItems[0].rpb}): бағалау алдында кілтті тексеріңіз.` : `${badItems.length > 1 ? "Вопросы" : "Вопрос"} ${badItems.map((i) => i.item + 1).join(", ")} в СОР ${badItems.length > 1 ? "не работают" : "не работает"} (r = ${badItems.map((i) => i.rpb).join("; ")}): проверьте ключ до выставления оценок.` });

  async function onFile(f: File) {
    setErr("");
    setQuality(null);
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error("too big"); // 10 MB ≈ 300k rows; bigger files go through the server import queue
      const wb = XLSX.read(await f.arrayBuffer());
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!json.length) throw new Error("empty");
      setOverrides({});
      setRawImport(json);
    } catch {
      setErr(t.err);
    }
  }

  function parsePasted() {
    setErr("");
    try {
      const wb = XLSX.read(pasted, { type: "string" });
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!json.length) throw new Error("empty");
      setOverrides({});
      setRawImport(json);
    } catch {
      setErr(t.err);
    }
  }

  function confirmImport() {
    if (!smart) return;
    setErr("");
    setQuality(null);
    try {
      const { rows: parsed, quality: qr, hours: h } = parseImport(smart.records);
      setQuality(qr);
      if (!parsed.length) throw new Error("empty");
      setRows(parsed);
      setResponses([]);
      setHours({ ...DEMO_HOURS, ...h });
      setIsDemo(false);
      setRole("region");
      setScope("all");
      setRawImport(null);
    } catch {
      setErr(t.err);
    }
  }

  function download(name: string, data: Record<string, unknown>[]) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Oqulyq");
    XLSX.writeFile(wb, name);
  }
  const downloadTemplate = () => download("oqulyq-demo.xlsx", DEMO.rows.slice(0, 3000).map((r) => ({ district: r.district, school: r.school, class: r.cls, textbook: r.textbook, topic: r.topic, quarter: r.quarter, score: r.score, baseline: r.baseline, hours: DEMO_HOURS[r.topic] })));
  const downloadKtp = () => download("oqulyq-ktp.xlsx", a.recs.map((r, i) => ({ "№": i + 1, [t.topics]: label(r.topic), [t.quarter]: TOPIC_BY_NAME[r.topic]?.quarter ?? "", [t.plan]: r.plan, [t.rec]: r.rec, "Δ": r.delta, [t.why]: r.why })));
  function saveDoc(name: string, title: string, body: string) {
    const html = `<html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:'Times New Roman',serif;font-size:14pt;line-height:1.4">${body}</body></html>`;
    const url = URL.createObjectURL(new Blob(["\ufeff" + html], { type: "application/msword" }));
    const el = document.createElement("a");
    el.href = url; el.download = name; el.click();
    URL.revokeObjectURL(url);
  }
  const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  function downloadMemo() {
    const today = new Date().toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU");
    const books = w.eff.overall.map((e) => `<tr><td>${esc(e.textbook)}</td><td>${e.naive}%</td><td>${fmt(e.effect)} [${fmt(e.lo)}; ${fmt(e.hi)}]</td><td>${esc(t.v[e.verdict])}</td></tr>`).join("");
    const did = w.did.filter((d) => d.significant).slice(0, 3).map((d) => `<li>${esc(label(d.topic))}: ${fmt(d.did)} п.п. [${fmt(d.lo)}; ${fmt(d.hi)}]</li>`).join("");
    const hrs = a.recs.filter((r) => r.delta !== 0).map((r) => `<li>${esc(label(r.topic))}: ${r.plan} → ${r.rec} ч</li>`).join("");
    const body = lang === "kk"
      ? `<p style="text-align:right">Білім басқармасының басшысына (демо)</p><h2 style="text-align:center">${t.memoTitle}</h2><p>Тақырып: 7-сыныптың алгебра оқулықтарын таңдау және сағаттарды бөлу. Күні: ${today}.</p><p>Тестілеу деректері (${rows.length} нәтиже) Oqulyq Lab-та талданды. Оқулықтарды әділ салыстыру (сыныптың бастапқы деңгейін ескере отырып):</p><table border="1" cellpadding="4" style="border-collapse:collapse"><tr><th>Оқулық</th><th>Орташа</th><th>Әділ әсер, п.п.</th><th>Қорытынды</th></tr>${books}</table>${did ? `<p>Табиғи эксперимент (Б → В ауысқан мектептер):</p><ul>${did}</ul>` : ""}<p><b>Ұсыныс:</b> оқулықты орташа балл бойынша ауыстырмау; әлсіз тарауларды қосымша материалмен толықтыру; сағаттарды қайта бөлу:</p><ul>${hrs}</ul><p>Деректер — демо. Әдістеме: docs/method.md.</p><p>Әдіскер ____________</p>`
      : lang === "en"
      ? `<p style="text-align:right">To the head of the education department (demo)</p><h2 style="text-align:center">${t.memoTitle}</h2><p>Subject: choice of grade-7 algebra textbooks and allocation of hours. Date: ${today}.</p><p>Test data (${rows.length} results) were analysed in Oqulyq Lab. Fair textbook comparison (adjusted for class entry level):</p><table border="1" cellpadding="4" style="border-collapse:collapse"><tr><th>Textbook</th><th>Mean</th><th>Fair effect, p.p.</th><th>Verdict</th></tr>${books}</table>${did ? `<p>Natural experiment (schools that switched Б → В):</p><ul>${did}</ul>` : ""}<p><b>Recommendation:</b> do not switch textbooks based on mean scores; supplement weak chapters; reallocate hours:</p><ul>${hrs}</ul><p>Demo data. Method: docs/method.md.</p><p>Methodologist ____________</p>`
      : `<p style="text-align:right">Руководителю управления образования (демо)</p><h2 style="text-align:center">${t.memoTitle}</h2><p>О выборе учебников алгебры для 7 класса и распределении учебных часов. Дата: ${today}.</p><p>Результаты тестирования (${rows.length} результатов) проанализированы в Oqulyq Lab. Честное сравнение учебников (с учётом уровня класса на входе):</p><table border="1" cellpadding="4" style="border-collapse:collapse"><tr><th>Учебник</th><th>Средний балл</th><th>Честный эффект, п.п. (95% ДИ)</th><th>Вывод</th></tr>${books}</table>${did ? `<p>Естественный эксперимент (школы, сменившие учебник Б на В):</p><ul>${did}</ul>` : ""}<p><b>Рекомендация:</b> не менять учебник по среднему баллу; закупать самый доступный учебник, если доказанной разницы нет; дополнить слабые главы материалами; перераспределить часы в пределах годового объёма:</p><ul>${hrs}</ul><p>Данные демонстрационные. Методика: docs/method.md.</p><p>Методист ____________</p>`;
    saveDoc("oqulyq-zapiska.doc", t.memoTitle, body);
  }
  function downloadPublisher() {
    const rowsHtml = w.issues.map((i) => `<tr><td>${esc(i.textbook)}</td><td>${esc(label(i.topic))}</td><td>${i.pages}</td><td>${i.medianPages}</td><td>${fmt(i.effect)} [${fmt(i.lo)}; ${fmt(i.hi)}]</td></tr>`).join("");
    saveDoc("oqulyq-publisher.doc", t.publisherTitle, `<h2>${t.publisherTitle}</h2><p>${esc(t.publisherNote)}</p><table border="1" cellpadding="4" style="border-collapse:collapse"><tr><th>${t.book}</th><th>${t.topics}</th><th>${t.pages}</th><th>${t.median}</th><th>${esc(t.fair)}</th></tr>${rowsHtml}</table><p>Oqulyq Lab · демо</p>`);
  }
  function printReport() {
    setAll(true);
    setTimeout(() => { window.print(); setAll(false); }, 300);
  }

  const scopeOptions = role === "district" ? districts : role === "school" ? schools : [];
  const tabBtn = (i: number) => (
    <button key={i} onClick={() => setTab(i)} aria-current={tab === i ? "page" : undefined} className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${tab === i ? "bg-ink text-paper" : "hover:bg-line"}`}>{i === 6 ? t.tab6 : t.tabs[i]}</button>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      {welcome && (
        <div className="print:hidden fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
          <div className="w-full max-w-md rounded-md bg-paper p-6 shadow-xl">
            <h2 id="welcome-title" className="font-display text-2xl">{t.welcomeTitle}</h2>
            <p className="mt-2 text-sm text-muted">{t.welcomeNote}</p>
            <div className="mt-4 grid gap-2">
              {(Object.keys(t.welcomeRoles) as Role[]).map((r) => (
                <button key={r} onClick={() => { changeRole(r); setWelcome(false); try { localStorage.setItem("oq-welcomed", "1"); } catch {} }} className="rounded-md border border-line bg-card px-3 py-2 text-left text-[15px] hover:border-ink">{t.welcomeRoles[r]}</button>
              ))}
            </div>
            <button onClick={() => { setWelcome(false); try { localStorage.setItem("oq-welcomed", "1"); } catch {} }} className="mt-3 text-sm text-accent underline underline-offset-2">{t.welcomeSkip}</button>
          </div>
        </div>
      )}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pt-8 pb-5">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted">Data-Driven Curriculum</div>
          <h1 className="font-display mt-1 text-4xl leading-none sm:text-5xl">Oqulyq&nbsp;Lab</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted">{t.tagline}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-ink text-sm" role="group" aria-label="language">
              {(["ru", "kk", "en"] as Lang[]).map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`px-3 py-1 ${lang === l ? "bg-ink text-paper" : ""}`} aria-pressed={lang === l}>
                  {l === "ru" ? "Рус" : l === "kk" ? "Қаз" : "Eng"}
                </button>
              ))}
            </div>
            <button onClick={() => setDark(!dark)} aria-label={t.theme} title={t.theme} className="print:hidden rounded-full border border-ink px-3 py-1 text-sm">{dark ? "☀" : "☾"}</button>
            <button onClick={printReport} className="print:hidden rounded-full border border-ink px-3 py-1 text-sm hover:bg-ink hover:text-paper">{t.report}</button>
          </div>
          <span className={`rounded-sm px-2 py-0.5 font-mono text-[11px] ${isDemo ? "bg-amber text-[#1c1b17]" : "bg-good text-paper"}`}>{isDemo ? t.demo : `${t.imported}: ${rows.length} ${t.rows}`}</span>
        </div>
      </header>

      <div className="print:hidden mt-4 flex flex-wrap items-center gap-2 rounded-md border border-line bg-card px-3 py-2 text-sm">
        <span className="text-muted">{t.role}</span>
        <select name="role" value={role} onChange={(e) => changeRole(e.target.value as Role)} className="rounded-sm border border-line bg-paper px-2 py-1" aria-label={t.role}>
          {(Object.keys(t.roles) as Role[]).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
        </select>
        {scopeOptions.length > 0 && (
          <select name="scope" value={scope} onChange={(e) => setScope(e.target.value)} className="max-w-full rounded-sm border border-line bg-paper px-2 py-1" aria-label="scope">
            {scopeOptions.map((s) => <option key={s} value={s}>{role === "district" ? distLabel(s) : s}</option>)}
          </select>
        )}
        {scope === "all" && <span className="font-medium">{t.allRegion}</span>}
        <span className="ml-auto font-mono text-[11px] text-muted">{t.roleNote}</span>
      </div>

      <nav className="print:hidden sticky top-0 z-10 -mx-4 flex items-center gap-1 overflow-x-auto bg-paper/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
        <span className="mr-1 shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted">{t.groups[0]}</span>
        {[0, 1, 2, 6].map(tabBtn)}
        <span className="mx-2 h-5 w-px shrink-0 bg-line" />
        <span className="mr-1 shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted">{t.groups[1]}</span>
        {[3, 4, 5].map(tabBtn)}
        <button onClick={() => setExplainOpen(true)} className="ml-auto hidden shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm text-paper sm:inline-block">{t.explainBtn}</button>
      </nav>
      <button onClick={() => setExplainOpen(true)} className="print:hidden fixed right-4 bottom-4 z-30 rounded-full bg-accent px-5 py-3 text-sm text-paper shadow-lg sm:hidden">{t.explainBtn}</button>
      {explainOpen && (
        <div className="print:hidden fixed inset-0 z-40 flex justify-end bg-ink/30" onClick={() => setExplainOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-label={t.explainTitle} onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-md overflow-y-auto bg-paper p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-2xl">{t.explainTitle}: {tab === 6 ? t.tab6 : t.tabs[tab]}</h2>
              <button onClick={() => setExplainOpen(false)} className="text-sm underline">{t.close}</button>
            </div>
            <p className="mt-2 rounded-md border-l-4 border-good bg-card p-2 text-sm">{t.trustRule}</p>
            <p className="mt-1 font-mono text-[11px] text-muted">{t.aiOff}</p>
            {explained.summary.length > 0 && <h3 className="mt-4 font-medium">{t.whatHappens}</h3>}
            <ul className="mt-1 grid gap-2 text-[15px]">{explained.summary.map((s, i) => <li key={i}>{s.text}{s.refs.map((r) => <RefChip key={r} id={r} />)}</li>)}</ul>
            {explained.steps.length > 0 && <h3 className="mt-4 font-medium">{t.thisWeek}</h3>}
            <ol className="mt-1 grid list-decimal gap-2 pl-5 text-[15px]">{explained.steps.map((s, i) => <li key={i}>{s.text}{s.refs.map((r) => <RefChip key={r} id={r} />)}</li>)}</ol>
            <h3 className="mt-4 font-medium">{t.facts}</h3>
            <ul className="mt-1 grid gap-1 text-sm">{tabFacts.map((f) => <li key={f.id}><span className="font-mono text-accent">[{f.id}]</span> {f.text}</li>)}</ul>
          </aside>
        </div>
      )}

      {show(0) && (
        <section className="mt-4 grid grid-cols-1 gap-10 [&>*]:min-w-0">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
            {([[view.rs.length, t.students], [a.classes, t.classes], [a.schools, t.schools], [a.topics.length, t.topics]] as const).map(([n, l]) => (
              <div key={l} className="bg-paper p-4">
                <div className="font-mono text-3xl tabular-nums">{n.toLocaleString("ru")}</div>
                <div className="text-sm text-muted">{l}</div>
              </div>
            ))}
          </div>

          <div>
            <h2 className="font-display text-2xl">{t.findings}</h2>
            {isDemo && <p className="text-sm text-muted">{t.subject}</p>}
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {findings.map((f, i) => (
                <li key={i} className="flex gap-3 rounded-md border border-line bg-card p-4 text-[15px] leading-snug">
                  <span className="font-mono text-accent">0{i + 1}</span>
                  <span className="flex-1">{f.text}</span>
                  {f.tab !== 0 && <button onClick={() => { setTab(f.tab); window.scrollTo({ top: 0 }); }} className="print:hidden self-start whitespace-nowrap text-sm text-accent underline underline-offset-2">{t.open} →</button>}
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-md border border-ink p-4">
            <h2 className="font-display text-2xl">{t.askTitle}</h2>
            <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setAskA(askTemplate(askQ, facts)); }}>
              <input name="ask" value={askQ} onChange={(e) => setAskQ(e.target.value)} placeholder={t.askPh} className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-[15px]" />
              <button type="submit" className="rounded-full bg-ink px-4 py-1.5 text-sm text-paper">{t.askBtn}</button>
            </form>
            <p className="mt-1 font-mono text-[11px] text-muted">{t.aiOff} {t.trustRule}</p>
            {askA && <div className="mt-3 whitespace-pre-line text-[15px]">{askA.answer}{askA.refs.length > 0 && <div className="mt-1">{askA.refs.map((r) => <RefChip key={r} id={r} />)}</div>}</div>}
          </div>

          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="font-display text-2xl">{t.mapTitle}</h2>
              <select name="map-topic" value={mapTopic} onChange={(e) => setMapTopic(e.target.value)} className="max-w-full rounded-sm border border-line bg-paper px-2 py-1 text-sm" aria-label={t.topics}>
                <option value="">{t.allTopics}</option>
                {a.topics.map((tp) => <option key={tp} value={tp}>{label(tp)}</option>)}
              </select>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted">{t.mapNote}</p>
            {(() => {
              const shapes: Record<string, { d?: string; c?: [number, number, number]; lx: number; ly: number }> = {
                "Байзакский район": { d: "M20,60 L180,30 L210,150 L160,250 L30,220 Z", lx: 85, ly: 225 },
                "Шуский район": { d: "M180,30 L380,40 L400,150 L210,150 Z", lx: 290, ly: 95 },
                "Кордайский район": { d: "M210,150 L400,150 L410,260 L160,250 Z", lx: 300, ly: 210 },
                "г. Тараз": { c: [115, 120, 30], lx: 115, ly: 168 },
              };
              const known = districts.filter((d) => shapes[d]);
              if (!known.length) return null;
              // relative scale: the weakest district is the darkest, so differences of a few points stay visible
              const vals = known.map((d) => w.distMean(d)).filter((v): v is number => v != null);
              const lo = Math.min(...vals), hi = Math.max(...vals);
              return (
                <svg viewBox="0 0 430 280" className="mt-4 w-full max-w-xl" role="img" aria-label={t.mapTitle}>
                  {known.map((d) => {
                    const sh = shapes[d], v = w.distMean(d);
                    const alpha = v == null ? 0.05 : hi > lo ? 0.12 + 0.7 * ((hi - v) / (hi - lo)) : 0.4;
                    const props = { fill: `rgba(180,68,44,${alpha})`, stroke: "currentColor", strokeWidth: 1.5, className: "cursor-pointer text-ink hover:opacity-80", onClick: () => { setRole("district"); setScope(d); }, tabIndex: 0, role: "button", "aria-label": `${distLabel(d)}: ${v ?? "—"}%`, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") { setRole("district"); setScope(d); } } };
                    return (
                      <g key={d}>
                        {sh.d ? <path d={sh.d} {...props} /> : <circle cx={sh.c![0]} cy={sh.c![1]} r={sh.c![2]} {...props} />}
                        <text x={sh.lx} y={sh.ly} textAnchor="middle" className="pointer-events-none fill-current font-mono text-[11px]">{distLabel(d).replace(" район", "").replace(" ауданы", "")} {v ?? "—"}%</text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>

          <div>
            <h2 className="font-display text-2xl">{t.topicsTitle}</h2>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-4 bg-ink" /> {t.mean}</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-4 bg-ink/20" /> {t.mastery}</span>
              <span className="flex items-center gap-1"><i className="inline-block h-3 w-px bg-bad" /> {t.target} {TARGET}%</span>
            </div>
            <ul className="mt-4 grid gap-4 sm:gap-3">
              {sorted.map((s) => (
                <li key={s.topic} className="grid gap-1 sm:grid-cols-[minmax(0,300px)_1fr_120px] sm:items-center sm:gap-4">
                  <span className="text-[15px]">
                    {label(s.topic)} {s.difficult && <span className="ml-1 rounded-sm bg-bad px-1.5 py-0.5 font-mono text-[11px] text-paper">{t.difficult}</span>}
                  </span>
                  <div className="relative h-5 rounded-sm bg-line/60">
                    <div className="absolute inset-y-0 left-0 rounded-sm bg-ink/20" style={{ width: `${s.mastery}%` }} />
                    <div className="absolute top-1.5 bottom-1.5 left-0 rounded-sm bg-ink" style={{ width: `${s.mean}%` }} />
                    <div className="absolute -top-1 -bottom-1 w-px bg-bad" style={{ left: `${TARGET}%` }} />
                  </div>
                  <span className="font-mono text-sm tabular-nums sm:text-right">{s.mean}% · {s.mastery}%</span>
                  {s.difficult && (
                    <button onClick={() => setOpenAction(openAction === s.topic ? "" : s.topic)} aria-expanded={openAction === s.topic} className="print:hidden justify-self-start text-sm text-accent underline underline-offset-2 sm:col-span-3">{t.showAction}</button>
                  )}
                  {openAction === s.topic && (() => {
                    const act = remedialWeek(TARGET - s.mean);
                    return (
                      <div className="rounded-md border border-line bg-card p-4 text-[15px] sm:col-span-3">
                        <div className="font-medium">{t.actionTitle}: {label(s.topic)}</div>
                        <p className="mt-1">{t.actionHours(act.hours)}</p>
                        <ol className="mt-2 grid gap-1 text-sm">{act.days.map((d) => <li key={d}>{t.days[d as keyof typeof t.days]}</li>)}</ol>
                      </div>
                    );
                  })()}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-display text-2xl">{t.heatSchool}</h2>
            <p className="mt-2 text-sm text-muted">{t.heatSchoolNote}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-[2px] text-xs">
                <thead><tr><th scope="col" className="text-left font-normal text-muted" />{a.topics.map((tp, i) => <th scope="col" key={tp} title={label(tp)} className="w-12 font-mono font-normal text-muted">T{i + 1}</th>)}</tr></thead>
                <tbody>
                  {a.units.map((u) => (
                    <tr key={u}>
                      <th scope="row" className="pr-2 text-left text-[13px] font-normal whitespace-nowrap">{scope === "all" ? distLabel(u) : u}</th>
                      {a.topics.map((tp) => {
                        const v = a.heat(u, tp);
                        const alpha = v == null ? 0 : Math.max(0.06, Math.min(1, (90 - v) / 50));
                        return <td key={tp} title={`${label(tp)}: ${v ?? "—"}%`} className="h-8 rounded-sm text-center font-mono tabular-nums" style={{ background: `rgba(180,68,44,${alpha})`, color: alpha > 0.55 ? "#f5f2ea" : undefined }}>{v ?? "—"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 font-mono text-[11px] text-muted">{a.topics.map((tp, i) => `T${i + 1} ${label(tp)}`).join(" · ")}</p>
            </div>
          </div>
        </section>
      )}

      {show(1) && (
        <section className="mt-4 grid grid-cols-1 gap-10 [&>*]:min-w-0">
          {naiveBest && <p className="mt-1 rounded-md border-l-4 border-accent bg-card px-3 py-2 text-[15px] font-medium">{t.keyBooks(naiveBest.textbook, String(naiveBest.naive), fmt(naiveBest.effect))}</p>}
          <div>
            <h2 className="font-display text-2xl">{t.causeTitle}</h2>
            <p className="mt-2 max-w-3xl text-[15px] text-muted">{t.causeNote}</p>
            <p className="mt-1 max-w-3xl text-sm"><b>{t.howToRead}:</b> {t.causeHow}</p>
            <ul className="mt-4 grid gap-3">
              {causes.filter((c) => c.level !== "none").map((c) => {
                const text = c.level === "program" ? t.causeText.program : c.level === "textbook" ? t.causeText.textbook(c.textbook!) : c.level === "school" ? t.causeText.school(c.worst!.school) : t.causeText.class(c.worst!.cls, c.worst!.school, c.others!.n, c.worst!.textbook, fmt(c.others!.mean));
                return (
                  <li key={c.topic} className="grid gap-2 rounded-md border border-line bg-card p-4 sm:grid-cols-[minmax(0,240px)_1fr] sm:gap-6">
                    <div>
                      <div className="font-medium">{label(c.topic)}</div>
                      <span className={`mt-1 inline-block rounded-sm px-1.5 py-0.5 font-mono text-[11px] ${c.level === "textbook" ? "bg-bad text-paper" : c.level === "program" ? "bg-accent text-paper" : "border border-ink"}`}>{t.levels[c.level]}</span>
                      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-sm" title={t.causeHow}>
                        <span className="bg-bad" style={{ width: `${c.shares.textbook}%` }} />
                        <span className="bg-accent" style={{ width: `${c.shares.school}%` }} />
                        <span className="bg-ink/30" style={{ width: `${c.shares.class}%` }} />
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-muted">{t.shareLabels[0]} {c.shares.textbook}% · {t.shareLabels[1]} {c.shares.school}% · {t.shareLabels[2]} {c.shares.class}%</div>
                    </div>
                    <div className="text-[15px] leading-snug">
                      <p>{text}</p>
                      {(c.level === "program" || c.level === "textbook") && c.worst && <p className="mt-1 text-sm text-muted">{t.causeText.local(c.worst.cls, c.worst.school, fmt(c.worst.resid))}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-2xl">{t.booksTitle}</h2>
            <p className="mt-2 max-w-3xl text-[15px] text-muted">{t.booksNote}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-ink text-muted">
                  <tr><th className="py-2 pr-3 font-normal">{t.book}</th><th className="pr-3 font-normal">{t.entry}</th><th className="pr-3 font-normal">{t.naive}</th><th className="pr-3 font-normal">{t.fair}</th><th className="font-normal">{t.verdict}</th></tr>
                </thead>
                <tbody>
                  {a.eff.overall.map((e) => (
                    <tr key={e.textbook} className="border-b border-line">
                      <td className="py-3 pr-3 font-medium">{e.textbook}<div className="font-mono text-xs font-normal text-muted">k = {e.k} ({t.k})</div></td>
                      <td className="pr-3 font-mono tabular-nums">{e.baseline}%</td>
                      <td className="pr-3 font-mono tabular-nums">{e.naive}%</td>
                      <td className="pr-3 font-mono tabular-nums">{fmt(e.effect)} <span className="text-muted">[{fmt(e.lo)}; {fmt(e.hi)}]</span></td>
                      <td><Verdict v={e.verdict} text={t.v[e.verdict]} />{e.verdict === "few" && <div className="text-xs text-muted">{t.fewHelp(e.k)}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h2 className="font-display text-2xl">{t.heatTitle}</h2>
            <p className="mt-2 text-sm text-muted">{t.heatNote}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-ink text-muted"><th className="py-2 text-left font-normal">{t.topics}</th>{a.eff.books.map((b) => <th key={b} className="px-2 font-normal">{b.replace(" (демо)", "")}</th>)}</tr></thead>
                <tbody>
                  {a.topics.map((tp) => (
                    <tr key={tp} className="border-b border-line">
                      <td className="py-2 pr-3">{label(tp)}</td>
                      {a.eff.books.map((b) => {
                        const c = a.eff.cells.find((c) => c.textbook === b && c.topic === tp);
                        if (!c) return <td key={b} />;
                        const cls = c.verdict === "worse" ? "bg-bad text-paper" : c.verdict === "better" ? "bg-good text-paper" : "text-muted";
                        return (
                          <td key={b} className="px-1 py-1 text-center">
                            <span title={`95%: [${fmt(c.lo)}; ${fmt(c.hi)}], k=${c.k}`} className={`block rounded-sm px-2 py-1 font-mono tabular-nums ${cls}`}>{c.verdict === "few" ? "—" : fmt(c.effect)}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {isDemo && (
            <div>
              <h2 className="font-display text-2xl">{t.coverTitle}</h2>
              <p className="mt-2 text-sm text-muted">{t.coverNote}</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="border-b border-ink text-muted"><th className="py-2 text-left font-normal">{t.topics}</th>{BOOKS.map((b) => <th key={b} className="px-2 font-normal">{b.replace(" (демо)", "")}</th>)}</tr></thead>
                  <tbody>
                    {TOPICS.map((tp, i) => (
                      <tr key={tp.name} className="border-b border-line">
                        <td className="py-2 pr-3">{label(tp.name)}</td>
                        {BOOKS.map((b) => {
                          const pages = COVERAGE[b][i];
                          return <td key={b} className="px-2 text-center font-mono tabular-nums">{pages === 0 ? <span className="rounded-sm bg-bad px-2 py-0.5 text-paper">{t.gap}</span> : <span className={pages < 10 ? "text-bad" : ""}>{pages}</span>}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="font-display text-2xl">{t.publisherTitle}</h2>
              {w.issues.length > 0 && <button onClick={downloadPublisher} className="print:hidden rounded-full border border-ink px-4 py-1.5 text-sm hover:bg-ink hover:text-paper">{t.publisherBtn}</button>}
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted">{t.publisherNote}</p>
            {w.issues.length === 0 ? <p className="mt-3">{t.noIssues}</p> : (
              <ul className="mt-3 grid gap-2">
                {w.issues.map((i) => (
                  <li key={i.textbook + i.topic} className="rounded-md border border-line bg-card p-3 text-[15px]">
                    <b>{i.textbook}</b> · {label(i.topic)} — <span className="font-mono">{i.pages} {t.pages}</span> <span className="text-muted">({t.median}: {i.medianPages})</span>, <span className="font-mono text-bad">{fmt(i.effect)} [{fmt(i.lo)}; {fmt(i.hi)}]</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {show(2) && (
        <section className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              {moved > 0 && <p className="mb-3 rounded-md border-l-4 border-accent bg-card px-3 py-2 text-[15px] font-medium">{t.keyHours(moved)}</p>}
              <h2 className="font-display text-2xl">{t.hoursTitle}</h2>
              <p className="mt-2 max-w-3xl text-[15px] text-muted">{t.hoursNote}</p>
            </div>
            <div className="print:hidden flex flex-wrap gap-2">
              <button onClick={() => setPlanText(planTemplate(factInput, Object.values(t.days)))} className="rounded-full bg-accent px-4 py-1.5 text-sm text-paper">{t.planBtn}</button>
              <button onClick={downloadKtp} className="rounded-full border border-ink px-4 py-1.5 text-sm hover:bg-ink hover:text-paper">{t.ktp}</button>
            </div>
          </div>
          {planText != null && (
            <div className="print:hidden mt-4 rounded-md border border-ink p-4">
              <h3 className="font-display text-xl">{t.planTitle}</h3>
              <textarea name="plan" value={planText} onChange={(e) => setPlanText(e.target.value)} rows={14} className="mt-2 w-full rounded-md border border-line bg-paper p-2 font-mono text-xs" />
              <div className="mt-2 flex gap-2">
                <button onClick={() => saveDoc("oqulyq-plan.doc", t.planBtn, `<pre style="font-family:'Times New Roman',serif;white-space:pre-wrap">${esc(planText)}</pre>`)} className="rounded-full bg-ink px-4 py-1.5 text-sm text-paper">{t.planDoc}</button>
                <button onClick={() => setPlanText(null)} className="rounded-full px-4 py-1.5 text-sm hover:bg-line">{t.close}</button>
              </div>
            </div>
          )}
          <div className="mt-4 grid gap-3">
            {a.recs.map((r) => (
              <article key={r.topic} className="grid gap-2 rounded-md border border-line bg-card p-4 sm:grid-cols-[minmax(0,260px)_150px_1fr] sm:gap-6">
                <div>
                  <div className="font-medium">{label(r.topic)}</div>
                  <span className={`mt-1 inline-block rounded-sm px-1.5 py-0.5 font-mono text-[11px] ${r.cause === "hours" ? "bg-accent text-paper" : r.cause === "textbook" ? "bg-bad text-paper" : "bg-line text-muted"}`}>{t.cause[r.cause]}</span>
                </div>
                <div className="font-mono tabular-nums">
                  <span className="text-muted">{r.plan}</span> → <span className="text-xl">{r.rec}</span>{" "}
                  <span className={r.delta > 0 ? "text-good" : r.delta < 0 ? "text-bad" : "text-muted"}>{r.delta > 0 ? `+${r.delta}` : r.delta < 0 ? r.delta : "±0"}</span>
                </div>
                <p className="text-[15px] leading-snug">{r.why}</p>
              </article>
            ))}
            <div className="print:hidden rounded-md border border-ink p-4">
              <h3 className="font-display text-xl">{t.whatIf}</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <select name="whatif-topic" value={wiTopic || sorted[0]?.topic} onChange={(e) => setWiTopic(e.target.value)} className="max-w-full rounded-sm border border-line bg-paper px-2 py-1" aria-label={t.topics}>
                  {a.stats.map((s) => <option key={s.topic} value={s.topic}>{label(s.topic)}</option>)}
                </select>
                <input name="whatif-hours" type="range" min={-3} max={4} value={wiDelta} onChange={(e) => setWiDelta(Number(e.target.value))} aria-label={t.h} />
                <span className="font-mono">{wiDelta > 0 ? "+" : ""}{wiDelta} {t.h}</span>
              </div>
              {(() => {
                const s = a.stats.find((x) => x.topic === (wiTopic || sorted[0]?.topic));
                if (!s) return null;
                if (!hoursModel) return <p className="mt-3 text-[15px] text-muted">{t.noHoursData}</p>;
                const plan = hours[s.topic] ?? 6;
                const f = forecast(hoursModel, plan, wiDelta);
                const pred = Math.max(0, Math.min(100, s.mean + f.gain));
                const need = hoursToClose(hoursModel, plan, TARGET - s.mean);
                return (
                  <p className="mt-3 text-[15px]">
                    {label(s.topic)}: <span className="font-mono">{s.mean}% → {pred.toFixed(1)}% <span className="text-muted">({fmt(f.gain)} [{fmt(f.lo)}; {fmt(f.hi)}] п.п.)</span></span>{" "}
                    {pred >= TARGET ? `✓ ${t.reach}` : need == null ? `· ${t.cantClose}` : `· ${t.toTarget} ${need} ${t.h}`}
                    <span className="mt-1 block text-xs text-muted">{t.whatIfData(hoursModel.n, fmt(hoursModel.beta), fmt(hoursModel.lo), fmt(hoursModel.hi))}</span>
                  </p>
                );
              })()}
            </div>
            <div className="flex justify-end border-t border-ink pt-3 font-mono text-sm">
              {t.total}: {a.recs.reduce((s, r) => s + r.plan, 0)} → {a.recs.reduce((s, r) => s + r.rec, 0)}
            </div>
          </div>
        </section>
      )}

      {show(6) && (
        <section className="mt-4 grid grid-cols-1 gap-10 [&>*]:min-w-0">
          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              {w.did[0]?.significant && <p className="mb-3 w-full rounded-md border-l-4 border-accent bg-card px-3 py-2 text-[15px] font-medium">{t.keyJust(label(w.did[0].topic), fmt(w.did[0].did))}</p>}
              <h2 className="font-display text-2xl">{t.didTitle}</h2>
              <button onClick={downloadMemo} className="print:hidden rounded-full border border-ink px-4 py-1.5 text-sm hover:bg-ink hover:text-paper">{t.memo}</button>
            </div>
            <p className="mt-2 max-w-3xl text-[15px] text-muted">{t.didNote}</p>
            <p className="mt-1 max-w-3xl text-sm"><b>{t.howToRead}:</b> {t.didHow.replace(/^[^:]+: /, "")}</p>
            {w.did.length === 0 ? <p className="mt-3 text-muted">—</p> : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-ink text-muted"><tr>{t.didCols.map((c) => <th key={c} className="py-2 pr-3 font-normal">{c}</th>)}</tr></thead>
                  <tbody>
                    {w.did.map((d) => (
                      <tr key={d.topic} className="border-b border-line">
                        <td className="py-2 pr-3">{label(d.topic)}</td>
                        <td className={`pr-3 font-mono tabular-nums ${d.significant ? (d.did > 0 ? "text-good" : "text-bad") : "text-muted"}`}>{fmt(d.did)} [{fmt(d.lo)}; {fmt(d.hi)}]</td>
                        <td className="font-mono text-muted">{d.switchers} / {d.controls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 font-mono text-[11px] text-muted">{t.didFrom}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {show(3) && (
        <section className="mt-4">
          {badItems.length > 0 && <p className="mb-3 rounded-md border-l-4 border-accent bg-card px-3 py-2 text-[15px] font-medium">{t.keyItems(badItems.length)}</p>}
          <h2 className="font-display text-2xl">{t.itemsTitle}</h2>
          <p className="mt-2 max-w-3xl text-[15px] text-muted">{t.itemsNote}</p>
          {a.items.length === 0 ? <p className="mt-4 text-muted">—</p> : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-ink text-muted"><tr><th className="py-2 pr-3 font-normal">{t.q}</th><th className="pr-3 font-normal">{t.key}</th><th className="pr-3 font-normal">{t.p}</th><th className="pr-3 font-normal">{t.r}</th><th className="pr-3 font-normal">{t.choices}</th><th className="font-normal">{t.flag}</th></tr></thead>
                <tbody>
                  {a.items.map((it) => (
                    <tr key={it.item} className={`border-b border-line ${it.flags.includes("bad") ? "bg-bad/5" : ""}`}>
                      <td className="py-2 pr-3 font-mono">#{it.item + 1}</td>
                      <td className="pr-3 font-mono">{it.key}</td>
                      <td className="pr-3 font-mono tabular-nums">{it.p.toFixed(2)}</td>
                      <td className={`pr-3 font-mono tabular-nums ${it.rpb < 0.15 ? "text-bad" : ""}`}>{it.rpb.toFixed(2)}</td>
                      <td className="pr-3">
                        <div className="flex gap-1">
                          {(["A", "B", "C", "D"] as const).map((o) => (
                            <div key={o} className="w-14 text-center" title={`${o}: ${Math.round(it.choices[o] * 100)}% / ${Math.round(it.topChoices[o] * 100)}%`}>
                              <div className="relative h-6 rounded-sm bg-line/60">
                                <div className={`absolute inset-y-0 left-0 rounded-sm ${o === it.key ? "bg-good/70" : o === it.trap ? "bg-bad/70" : "bg-ink/25"}`} style={{ width: `${it.choices[o] * 100}%` }} />
                                <span className="relative font-mono text-[11px] leading-6">{o} {Math.round(it.choices[o] * 100)}/{Math.round(it.topChoices[o] * 100)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="text-[13px]">
                        {it.flags.map((f) => <span key={f} className={`mr-1 inline-block rounded-sm px-1.5 py-0.5 font-mono text-[11px] ${f === "bad" ? "bg-bad text-paper" : "border border-bad text-bad"}`}>{t.flags[f]}</span>)}
                        {it.trap && <div className="mt-1 text-muted">{t.trapText(it.trap)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 font-mono text-[11px] text-muted">n = {a.items[0].n} · {label(ITEM_TOPIC)}</p>
            </div>
          )}
        </section>
      )}

      {show(4) && (
        <section className="mt-4 grid grid-cols-1 gap-10 [&>*]:min-w-0">
          <div>
            {a.warns.length > 0 && <p className="mb-3 rounded-md border-l-4 border-accent bg-card px-3 py-2 text-[15px] font-medium">{t.keyDyn(a.warns.length)}</p>}
            <h2 className="font-display text-2xl">{t.dynTitle}</h2>
            <p className="mt-2 max-w-3xl text-[15px] text-muted">{t.dynNote}</p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-sm text-muted">{t.mean}</h3>
                <div className="mt-2 flex h-40 items-end gap-3 border-b border-ink">
                  {a.dyn.map((d) => (
                    <div key={d.quarter} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <span className="font-mono text-xs tabular-nums">{d.n ? d.mean : "—"}</span>
                      <div className="w-full rounded-t-sm bg-ink/70" style={{ height: `${d.n ? d.mean * 1.2 : 0}px` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex gap-3">{a.dyn.map((d) => <span key={d.quarter} className="flex-1 text-center font-mono text-xs text-muted">{t.quarter} {d.quarter}</span>)}</div>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm text-muted">{t.devTitle}</h3>
                <div className="mt-2 max-h-64 overflow-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-muted"><th className="text-left font-normal" />{[1, 2, 3, 4].map((q) => <th key={q} className="w-14 font-mono font-normal">Q{q}</th>)}</tr></thead>
                    <tbody>
                      {a.dev.map((r) => (
                        <tr key={r.unit} className="border-b border-line">
                          <td className="py-1 pr-2 text-[13px] whitespace-nowrap">{scope === "all" ? distLabel(r.unit) : r.unit}</td>
                          {r.q.map((v, i) => (
                            <td key={i} className={`text-center font-mono text-xs tabular-nums ${v == null ? "text-muted" : v <= -3 ? "bg-bad/20 text-bad" : v >= 3 ? "bg-good/15 text-good" : ""}`}>{v == null ? "—" : fmt(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div>
            <h2 className="font-display text-2xl">{t.warnTitle}</h2>
            <p className="mt-2 max-w-3xl text-[15px] text-muted">{t.warnNote}</p>
            {a.warns.length === 0 ? <p className="mt-4">{t.noWarn}</p> : (
              <div className="mt-4 grid gap-3">
                {a.warns.map((w) => (
                  <article key={w.key} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-line bg-card p-4">
                    <div className="min-w-[220px] flex-1">
                      <div className="font-medium">{w.school}, {w.cls}</div>
                      <div className="text-sm text-muted">{distLabel(w.district)} · {w.textbook}</div>
                    </div>
                    <div className="font-mono text-sm tabular-nums">{t.first}: {fmt(w.first)} → {t.second}: {fmt(w.second)}</div>
                    <div className="font-mono text-sm tabular-nums text-bad">{t.drop}: {fmt(w.drop)} <span className="text-muted">[{fmt(w.lo)}; {fmt(w.hi)}]</span></div>
                    {notified.includes(w.key)
                      ? <span className="text-sm text-good">✓ {t.notified}</span>
                      : <button onClick={() => setNotified([...notified, w.key])} className="print:hidden rounded-full border border-ink px-3 py-1 text-sm hover:bg-ink hover:text-paper">{t.notify}</button>}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {show(5) && (
        <section className="mt-4 grid grid-cols-1 gap-10 [&>*]:min-w-0 lg:grid-cols-2">
          <div className="print:hidden">
            <h2 className="font-display text-2xl">{t.smartTitle}</h2>
            <p className="mt-2 text-[15px] text-muted">{t.smartNote}</p>
            <p className="mt-2 rounded-md border-l-4 border-good bg-card p-2 text-sm">{t.privacy}</p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-ink/30 p-8 text-center hover:border-ink">
              <span className="font-mono text-sm">.csv · .xlsx</span>
              <span className="text-sm">{t.upload}</span>
              <input name="import-file" type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <textarea name="paste" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={t.paste} rows={3} className="mt-3 w-full rounded-md border border-line bg-paper p-2 font-mono text-xs" />
            {pasted.trim() && <button onClick={parsePasted} className="mt-1 rounded-full border border-ink px-4 py-1.5 text-sm hover:bg-ink hover:text-paper">{t.parsePaste}</button>}
            {err && <p className="mt-2 text-sm text-bad" role="alert">{err}</p>}
            {smart && (
              <div className="mt-4 rounded-md border border-ink p-4">
                <h3 className="font-display text-xl">{t.confirmTitle}</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-ink text-muted"><tr>{t.colHeader.map((c) => <th key={c} className="py-1 pr-2 font-normal">{c}</th>)}</tr></thead>
                    <tbody>
                      {smart.mapping.map((m) => (
                        <tr key={m.column} className={`border-b border-line ${m.sure ? "" : "bg-amber/30"}`}>
                          <td className="py-1 pr-2 font-mono text-xs">{m.column}</td>
                          <td className="pr-2">
                            <select name={`map-${m.column}`} aria-label={m.column} value={m.field ?? ""} onChange={(e) => setOverrides({ ...overrides, [m.column]: (e.target.value || null) as Mapping["field"] })} className="rounded-sm border border-line bg-paper px-1 py-0.5">
                              <option value="">{t.fields.none}</option>
                              {(["school", "class", "textbook", "topic", "score", "baseline", "district", "quarter", "hours", "student", "topicColumn"] as const).map((f) => <option key={f} value={f}>{t.fields[f]}</option>)}
                            </select>
                          </td>
                          <td className={m.sure ? "text-good" : "text-[#7a5a00]"}>{m.field == null ? "—" : m.sure ? t.sure : t.unsure}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 font-mono text-xs">{t.smartStats(smart.records.length, smart.filled, smart.anonymized, smart.wide)}</p>
                {smart.missing.length > 0 && <p className="mt-1 text-sm text-bad">{t.missingF(smart.missing.map((f) => t.fields[f]).join(", "))}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={confirmImport} disabled={smart.missing.length > 0} className="rounded-full bg-ink px-4 py-1.5 text-sm text-paper disabled:opacity-40">{t.load(smart.records.length)}</button>
                  <button onClick={() => setRawImport(null)} className="rounded-full px-4 py-1.5 text-sm hover:bg-line">{t.cancel}</button>
                </div>
              </div>
            )}
            {quality && (
              <div className="mt-4 rounded-md border border-line bg-card p-4 text-sm">
                <h3 className="font-medium">{t.quality}</h3>
                <p className="mt-1 font-mono">{quality.ok} / {quality.total} {t.accepted}</p>
                {Object.entries(quality.rejected).filter(([, n]) => n > 0).map(([k, n]) => <p key={k} className="font-mono text-bad">{t.rejectedRows}: {n} — {t.reasons[k as keyof typeof t.reasons]}</p>)}
                {quality.noBaseline && <p className="mt-1 text-bad">{t.noBaseline}</p>}
                {!quality.noBaseline && quality.tooManyImputed && <p className="mt-1 text-bad">{t.tooManyImputed(quality.imputedBaseline)}</p>}
                {!quality.noBaseline && !quality.tooManyImputed && quality.imputedBaseline > 0 && <p className="mt-1 text-bad">{t.imputed(quality.imputedBaseline)}</p>}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={downloadTemplate} className="rounded-full border border-ink px-4 py-1.5 text-sm hover:bg-ink hover:text-paper">{t.template}</button>
              {!isDemo && <button onClick={() => { setRows(DEMO.rows); setResponses(DEMO.responses); setHours(DEMO_HOURS); setIsDemo(true); setQuality(null); }} className="rounded-full px-4 py-1.5 text-sm hover:bg-line">{t.reset}</button>}
              <a href="/api" className="rounded-full px-4 py-1.5 text-sm text-accent underline underline-offset-2">{t.api} →</a>
            </div>
          </div>
          <div>
            <div className="mb-6 rounded-md border border-line bg-card p-4 text-sm">
              <h3 className="font-medium">{t.passport}</h3>
              <p className="mt-1">{t.passportRows(isDemo ? t.demoSource : t.importSource, rows.length, schools.length, new Set(rows.map((r) => `${r.school}|${r.cls}`)).size, [...new Set(rows.map((r) => r.quarter))].sort().join(", "), quality ? String(quality.total - quality.ok) : "0")}</p>
            </div>
            <h2 className="font-display text-2xl">{t.method}</h2>
            <ol className="mt-3 grid gap-3 text-[15px] leading-snug">
              {t.methodItems.map((m, i) => (
                <li key={i} className="flex gap-3"><span className="font-mono text-accent">{i + 1}</span><span>{m.replace("{b}", String(a.eff.b))}</span></li>
              ))}
            </ol>
            <p className="mt-4 font-mono text-xs text-muted">PASS = {PASS} · TARGET = {TARGET} · CI = 95%</p>
            <div className="mt-6">
              <h3 className="font-display text-xl">{t.whyTitle}</h3>
              <ul className="mt-2 grid gap-2 text-[15px] leading-snug">{t.whyItems.map((x, i) => <li key={i} className="flex gap-2"><span className="font-mono text-accent">✓</span><span>{x}</span></li>)}</ul>
            </div>
            {isDemo && (
              <div className="mt-6 rounded-md border border-ink p-4">
                <h3 className="font-display text-xl">{t.truthTitle}</h3>
                <p className="mt-1 text-sm text-muted">{t.truthNote}</p>
                <button onClick={() => setShowTruth(!showTruth)} aria-expanded={showTruth} className="print:hidden mt-3 rounded-full border border-ink px-4 py-1.5 text-sm hover:bg-ink hover:text-paper">{showTruth ? t.truthHide : t.truthBtn}</button>
                {truth && (
                  <>
                    <p className="mt-3 font-medium">{t.truthSummary(truth.mae, truth.inCI, truth.rows.length)}</p>
                    <div className="mt-2 max-h-80 overflow-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-ink text-muted"><tr>{t.truthCols.map((c) => <th key={c} className="py-1 pr-2 font-normal">{c}</th>)}</tr></thead>
                        <tbody>
                          {truth.rows.filter((r) => Math.abs(r.truth) >= 2 || Math.abs(r.estimate) >= 3).map((r) => (
                            <tr key={r.textbook + r.topic} className="border-b border-line">
                              <td className="py-1 pr-2">{r.textbook.replace(" (демо)", "")}</td>
                              <td className="pr-2">{label(r.topic)}</td>
                              <td className="pr-2 font-mono">{fmt(r.truth)}</td>
                              <td className="pr-2 font-mono">{fmt(r.estimate)} <span className="text-muted">[{fmt(r.lo)}; {fmt(r.hi)}]</span></td>
                              <td className={r.inCI ? "text-good" : "text-bad"}>{r.inCI ? t.yes : t.no}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function fmt(x: number) {
  if (!Number.isFinite(x)) return "—";
  return (x > 0 ? "+" : "") + x.toFixed(1);
}

function Verdict({ v, text }: { v: string; text: string }) {
  const c = v === "better" ? "text-good" : v === "worse" ? "text-bad" : "text-muted";
  return <span className={`font-medium ${c}`}>{text}</span>;
}
