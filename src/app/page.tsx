"use client";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { BOOKS, COVERAGE, DISTRICTS, generateDemo, ITEMS, ITEM_TOPIC, TOPICS, type Response, type Row } from "@/lib/data";
import { classTopics, hourRecs, PASS, TARGET, textbookEffects, topicStats } from "@/lib/analytics";
import { earlyWarnings, itemAnalysis, quarterDynamics } from "@/lib/diagnostics";
import { T, type Lang } from "@/lib/i18n";
import { parseImport, type Quality } from "@/lib/importer";

const DEMO = generateDemo();
// shortcut: assumed +2.5 p.p. per extra hour (demo assumption), estimate from real hour variation between schools when data has it
const ELASTICITY = 2.5;
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
  const t = T[lang];
  const show = (i: number) => tab === i || all;
  const label = (topic: string) => (lang === "kk" ? TOPIC_BY_NAME[topic]?.kk : lang === "en" ? TOPIC_BY_NAME[topic]?.en : undefined) || topic;
  const distLabel = (d: string) => (lang === "kk" && DISTRICTS.find((x) => x.name === d)?.kk) || d;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("oq-theme");
      if (saved === "dark" || (!saved && matchMedia("(prefers-color-scheme: dark)").matches)) setDark(true);
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
    return { rs, resp };
  }, [rows, responses, role, scope]);

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
    // heatmap unit follows the level: region → districts, district → schools, school → classes
    const unitOf = (r: Row) => (scope === "all" ? r.district : role === "district" ? r.school : r.cls);
    const units = [...new Set(rs.map(unitOf))];
    const cell = new Map<string, [number, number]>();
    for (const r of rs) { const k = `${unitOf(r)}|${r.topic}`; const c = cell.get(k) ?? [0, 0]; c[0] += r.score; c[1]++; cell.set(k, c); }
    const heat = (u: string, tp: string) => { const c = cell.get(`${u}|${tp}`); return c ? Math.round(c[0] / c[1]) : null; };
    return {
      topics, stats, eff, recs, items, warns, dyn, units, heat,
      schools: new Set(rs.map((r) => r.school)).size,
      classes: new Set(rs.map((r) => `${r.school}|${r.cls}`)).size,
    };
    // label depends only on lang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, hours, lang, role, scope]);

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
  if (a.warns.length) findings.push({ tab: 4, text: lang === "en" ? `${a.warns.length} classes slid in the second half-year — first: ${a.warns[0].school}, ${a.warns[0].cls} (${fmt(a.warns[0].drop)} p.p.).` : lang === "kk" ? `${a.warns.length} сынып 2-жартыжылдықта төмендеді — біріншісі: ${a.warns[0].school}, ${a.warns[0].cls} (${fmt(a.warns[0].drop)} п.п.).` : `${a.warns.length} классов просели во 2-м полугодии — первый: ${a.warns[0].school}, ${a.warns[0].cls} (${fmt(a.warns[0].drop)} п.п.).` });
  if (badItems.length) findings.push({ tab: 3, text: lang === "en" ? `Test item ${badItems.map((i) => i.item + 1).join(", ")} does not work (r = ${badItems[0].rpb}): check the key before grading.` : lang === "kk" ? `${badItems.map((i) => i.item + 1).join(", ")}-сұрақ жұмыс істемейді (r = ${badItems[0].rpb}): бағалау алдында кілтті тексеріңіз.` : `Вопрос ${badItems.map((i) => i.item + 1).join(", ")} в СОР не работает (r = ${badItems[0].rpb}): проверьте ключ до выставления оценок.` });

  async function onFile(f: File) {
    setErr("");
    setQuality(null);
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error("too big"); // 10 MB ≈ 300k rows; bigger files go through the server import queue
      const wb = XLSX.read(await f.arrayBuffer());
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      const { rows: parsed, quality: qr, hours: h } = parseImport(json);
      setQuality(qr);
      if (!parsed.length) throw new Error("empty");
      setRows(parsed);
      setResponses([]);
      setHours({ ...DEMO_HOURS, ...h });
      setIsDemo(false);
      setRole("region");
      setScope("all");
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
  function printReport() {
    setAll(true);
    setTimeout(() => { window.print(); setAll(false); }, 300);
  }

  const scopeOptions = role === "district" ? districts : role === "school" ? schools : [];
  const tabBtn = (i: number) => (
    <button key={i} onClick={() => setTab(i)} aria-current={tab === i ? "page" : undefined} className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${tab === i ? "bg-ink text-paper" : "hover:bg-line"}`}>{t.tabs[i]}</button>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
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
        <select value={role} onChange={(e) => changeRole(e.target.value as Role)} className="rounded-sm border border-line bg-paper px-2 py-1" aria-label={t.role}>
          {(Object.keys(t.roles) as Role[]).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
        </select>
        {scopeOptions.length > 0 && (
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="max-w-full rounded-sm border border-line bg-paper px-2 py-1" aria-label="scope">
            {scopeOptions.map((s) => <option key={s} value={s}>{role === "district" ? distLabel(s) : s}</option>)}
          </select>
        )}
        {scope === "all" && <span className="font-medium">{t.allRegion}</span>}
        <span className="ml-auto font-mono text-[11px] text-muted">{t.roleNote}</span>
      </div>

      <nav className="print:hidden sticky top-0 z-10 -mx-4 flex items-center gap-1 overflow-x-auto bg-paper/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
        <span className="mr-1 shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted">{t.groups[0]}</span>
        {[0, 1, 2].map(tabBtn)}
        <span className="mx-2 h-5 w-px shrink-0 bg-line" />
        <span className="mr-1 shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted">{t.groups[1]}</span>
        {[3, 4, 5].map(tabBtn)}
      </nav>

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
                    {label(s.topic)} {s.difficult && <span className="ml-1 rounded-sm bg-bad/10 px-1.5 py-0.5 font-mono text-[11px] text-bad">{t.difficult}</span>}
                  </span>
                  <div className="relative h-5 rounded-sm bg-line/60">
                    <div className="absolute inset-y-0 left-0 rounded-sm bg-ink/20" style={{ width: `${s.mastery}%` }} />
                    <div className="absolute top-1.5 bottom-1.5 left-0 rounded-sm bg-ink" style={{ width: `${s.mean}%` }} />
                    <div className="absolute -top-1 -bottom-1 w-px bg-bad" style={{ left: `${TARGET}%` }} />
                  </div>
                  <span className="font-mono text-sm tabular-nums sm:text-right">{s.mean}% · {s.mastery}%</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-display text-2xl">{t.heatSchool}</h2>
            <p className="mt-2 text-sm text-muted">{t.heatSchoolNote}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-[2px] text-xs">
                <thead><tr><th className="text-left font-normal text-muted" />{a.topics.map((tp, i) => <th key={tp} title={label(tp)} className="w-12 font-mono font-normal text-muted">T{i + 1}</th>)}</tr></thead>
                <tbody>
                  {a.units.map((u) => (
                    <tr key={u}>
                      <td className="pr-2 text-[13px] whitespace-nowrap">{scope === "all" ? distLabel(u) : u}</td>
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
                      <td><Verdict v={e.verdict} text={t.v[e.verdict]} /></td>
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
                          return <td key={b} className="px-2 text-center font-mono tabular-nums">{pages === 0 ? <span className="rounded-sm bg-bad/15 px-2 py-0.5 text-bad">{t.gap}</span> : <span className={pages < 10 ? "text-bad" : ""}>{pages}</span>}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {show(2) && (
        <section className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">{t.hoursTitle}</h2>
              <p className="mt-2 max-w-3xl text-[15px] text-muted">{t.hoursNote}</p>
            </div>
            <button onClick={downloadKtp} className="print:hidden rounded-full border border-ink px-4 py-1.5 text-sm hover:bg-ink hover:text-paper">{t.ktp}</button>
          </div>
          <div className="mt-4 grid gap-3">
            {a.recs.map((r) => (
              <article key={r.topic} className="grid gap-2 rounded-md border border-line bg-card p-4 sm:grid-cols-[minmax(0,260px)_150px_1fr] sm:gap-6">
                <div>
                  <div className="font-medium">{label(r.topic)}</div>
                  <span className={`mt-1 inline-block rounded-sm px-1.5 py-0.5 font-mono text-[11px] ${r.cause === "hours" ? "bg-accent text-paper" : r.cause === "textbook" ? "bg-bad/10 text-bad" : "bg-line text-muted"}`}>{t.cause[r.cause]}</span>
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
                <select value={wiTopic || sorted[0]?.topic} onChange={(e) => setWiTopic(e.target.value)} className="max-w-full rounded-sm border border-line bg-paper px-2 py-1" aria-label={t.topics}>
                  {a.stats.map((s) => <option key={s.topic} value={s.topic}>{label(s.topic)}</option>)}
                </select>
                <input type="range" min={-3} max={4} value={wiDelta} onChange={(e) => setWiDelta(Number(e.target.value))} aria-label={t.h} />
                <span className="font-mono">{wiDelta > 0 ? "+" : ""}{wiDelta} {t.h}</span>
              </div>
              {(() => {
                const s = a.stats.find((x) => x.topic === (wiTopic || sorted[0]?.topic));
                if (!s) return null;
                const pred = Math.max(0, Math.min(95, s.mean + ELASTICITY * wiDelta));
                return (
                  <p className="mt-3 text-[15px]">
                    {label(s.topic)}: <span className="font-mono">{s.mean}% → {pred.toFixed(1)}%</span> {pred >= TARGET ? `✓ ${t.reach}` : `· ${t.toTarget} ${Math.ceil((TARGET - s.mean) / ELASTICITY)} ${t.h}`}
                    <span className="mt-1 block text-xs text-muted">{t.whatIfNote}</span>
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

      {show(3) && (
        <section className="mt-4">
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
                        {it.flags.map((f) => <span key={f} className={`mr-1 inline-block rounded-sm px-1.5 py-0.5 font-mono text-[11px] ${f === "bad" ? "bg-bad text-paper" : "bg-bad/10 text-bad"}`}>{t.flags[f]}</span>)}
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
              <div>
                <h3 className="text-sm text-muted">{t.devTitle}</h3>
                <div className="relative mt-2 flex h-40 items-center gap-3">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-ink" />
                  {a.dyn.map((d) => {
                    const h = Math.min(70, Math.abs(d.resid) * 14);
                    return (
                      <div key={d.quarter} className="relative flex h-full flex-1 flex-col items-center">
                        <div className={`absolute w-full rounded-sm ${d.resid >= 0 ? "bg-good" : "bg-bad"}`} style={d.resid >= 0 ? { bottom: "50%", height: h } : { top: "50%", height: h }} />
                        <span className="absolute font-mono text-xs tabular-nums" style={d.resid >= 0 ? { bottom: `calc(50% + ${h + 2}px)` } : { top: `calc(50% + ${h + 2}px)` }}>{d.n ? fmt(d.resid) : "—"}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 flex gap-3">{a.dyn.map((d) => <span key={d.quarter} className="flex-1 text-center font-mono text-xs text-muted">{t.quarter} {d.quarter}</span>)}</div>
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
            <h2 className="font-display text-2xl">{t.upload}</h2>
            <p className="mt-2 text-sm text-muted">{t.uploadHint}</p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-ink/30 p-8 text-center hover:border-ink">
              <span className="font-mono text-sm">.csv · .xlsx</span>
              <span className="text-sm">{t.upload}</span>
              <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            {err && <p className="mt-2 text-sm text-bad" role="alert">{err}</p>}
            {quality && (
              <div className="mt-4 rounded-md border border-line bg-card p-4 text-sm">
                <h3 className="font-medium">{t.quality}</h3>
                <p className="mt-1 font-mono">{quality.ok} / {quality.total} {t.accepted}</p>
                {Object.entries(quality.rejected).filter(([, n]) => n > 0).map(([k, n]) => <p key={k} className="font-mono text-bad">{t.rejectedRows}: {n} — {t.reasons[k as keyof typeof t.reasons]}</p>)}
                {quality.noBaseline && <p className="mt-1 text-bad">{t.noBaseline}</p>}
                {!quality.noBaseline && quality.imputedBaseline > 0 && <p className="mt-1 text-bad">{t.imputed(quality.imputedBaseline)}</p>}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={downloadTemplate} className="rounded-full border border-ink px-4 py-1.5 text-sm hover:bg-ink hover:text-paper">{t.template}</button>
              {!isDemo && <button onClick={() => { setRows(DEMO.rows); setResponses(DEMO.responses); setHours(DEMO_HOURS); setIsDemo(true); setQuality(null); }} className="rounded-full px-4 py-1.5 text-sm hover:bg-line">{t.reset}</button>}
              <a href="/api" className="rounded-full px-4 py-1.5 text-sm text-accent underline underline-offset-2">{t.api} →</a>
            </div>
          </div>
          <div>
            <h2 className="font-display text-2xl">{t.method}</h2>
            <ol className="mt-3 grid gap-3 text-[15px] leading-snug">
              {t.methodItems.map((m, i) => (
                <li key={i} className="flex gap-3"><span className="font-mono text-accent">{i + 1}</span><span>{m.replace("{b}", String(a.eff.b))}</span></li>
              ))}
            </ol>
            <p className="mt-4 font-mono text-xs text-muted">PASS = {PASS} · TARGET = {TARGET} · CI = 95%</p>
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
