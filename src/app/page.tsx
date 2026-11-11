"use client";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { generateDemo, TOPICS, type Row } from "@/lib/data";
import { classTopics, hourRecs, PASS, TARGET, textbookEffects, topicStats } from "@/lib/analytics";
import { T, type Lang } from "@/lib/i18n";

const DEMO = generateDemo();
// shortcut: assumed +2.5 p.p. per extra hour (demo assumption), estimate from real hour variation between schools when data has it
const ELASTICITY = 2.5;
const DEMO_HOURS = Object.fromEntries(TOPICS.map((t) => [t.name, t.hours]));
const KK = Object.fromEntries(TOPICS.map((t) => [t.name, t.kk]));

export default function Home() {
  const [lang, setLang] = useState<Lang>("ru");
  const [tab, setTab] = useState(0);
  const [rows, setRows] = useState<Row[]>(DEMO);
  const [hours, setHours] = useState<Record<string, number>>(DEMO_HOURS);
  const [isDemo, setIsDemo] = useState(true);
  const [err, setErr] = useState("");
  const [wiTopic, setWiTopic] = useState("");
  const [wiDelta, setWiDelta] = useState(2);
  const [all, setAll] = useState(false);
  const show = (i: number) => tab === i || all;
  function printReport() {
    setAll(true);
    setTimeout(() => { window.print(); setAll(false); }, 300);
  }
  const t = T[lang];
  const label = (topic: string) => (lang === "kk" && KK[topic]) || topic;

  const a = useMemo(() => {
    const topics = [...new Set(rows.map((r) => r.topic))];
    const cts = classTopics(rows);
    const stats = topicStats(rows, topics);
    const eff = textbookEffects(cts, topics);
    const recs = hourRecs(stats, hours, eff.cells, lang, (x) => (lang === "kk" && KK[x]) || x);
    const schools = new Set(rows.map((r) => r.school)).size;
    const classes = new Set(rows.map((r) => `${r.school}|${r.cls}`)).size;
    const schoolList = [...new Set(rows.map((r) => r.school))];
    const cell = new Map<string, [number, number]>();
    for (const r of rows) { const k = `${r.school}|${r.topic}`; const c = cell.get(k) ?? [0, 0]; c[0] += r.score; c[1]++; cell.set(k, c); }
    const heat = (sc: string, tp: string) => { const c = cell.get(`${sc}|${tp}`); return c ? Math.round(c[0] / c[1]) : null; };
    return { topics, stats, eff, recs, schools, classes, schoolList, heat };
  }, [rows, hours, lang]);

  const sorted = [...a.stats].sort((x, y) => x.mean - y.mean);
  const naiveBest = [...a.eff.overall].sort((x, y) => y.naive - x.naive)[0];
  const worstCell = [...a.eff.cells].filter((c) => c.verdict === "worse").sort((x, y) => x.effect - y.effect)[0];
  const hourWin = a.recs.filter((r) => r.delta > 0);
  const moved = hourWin.reduce((s, r) => s + r.delta, 0);

  const findings =
    lang === "ru"
      ? [
          sorted[0] && `Самая трудная тема — «${label(sorted[0].topic)}»: ${sorted[0].mean}%, усвоили ${sorted[0].mastery}% учеников.`,
          naiveBest && `«${naiveBest.textbook}» выглядит лучшим по среднему (${naiveBest.naive}%), но после учёта уровня классов его эффект ${fmt(naiveBest.effect)} п.п. — ${t.v[naiveBest.verdict]}.`,
          worstCell && `Слабое место учебника: «${worstCell.textbook}», тема «${label(worstCell.topic!)}» — ${fmt(worstCell.effect)} п.п. к ожидаемому.`,
          moved > 0 && `Перенести ${moved} ч в темы: ${hourWin.map((r) => `«${label(r.topic)}»`).join(", ")} — без увеличения нагрузки.`,
        ]
      : [
          sorted[0] && `Ең қиын тақырып — «${label(sorted[0].topic)}»: ${sorted[0].mean}%, меңгергені ${sorted[0].mastery}%.`,
          naiveBest && `«${naiveBest.textbook}» орташа бойынша ең үздік сияқты (${naiveBest.naive}%), бірақ сынып деңгейін ескергенде әсері ${fmt(naiveBest.effect)} п.п. — ${t.v[naiveBest.verdict]}.`,
          worstCell && `Оқулықтың әлсіз жері: «${worstCell.textbook}», «${label(worstCell.topic!)}» — күтілгенге ${fmt(worstCell.effect)} п.п.`,
          moved > 0 && `${moved} сағатты мына тақырыптарға ауыстыру: ${hourWin.map((r) => `«${label(r.topic)}»`).join(", ")} — жүктемені арттырмай.`,
        ];

  async function onFile(f: File) {
    setErr("");
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      const h: Record<string, number> = {};
      const parsed: Row[] = json
        .map((r) => {
          const g = (k: string) => r[k] ?? r[k.toUpperCase()] ?? r[k[0].toUpperCase() + k.slice(1)];
          if (g("hours") != null && g("topic") != null) h[String(g("topic"))] = Number(g("hours"));
          return { school: String(g("school") ?? ""), cls: String(g("class") ?? ""), textbook: String(g("textbook") ?? ""), topic: String(g("topic") ?? ""), score: Number(g("score")), baseline: Number(g("baseline") ?? 60) };
        })
        .filter((r) => r.school && r.topic && r.textbook && Number.isFinite(r.score) && r.score >= 0 && r.score <= 100);
      if (parsed.length === 0) throw new Error("empty");
      setRows(parsed);
      setHours({ ...DEMO_HOURS, ...h });
      setIsDemo(false);
      setTab(0);
    } catch {
      setErr(t.err);
    }
  }

  function downloadTemplate() {
    const data = DEMO.map((r) => ({ school: r.school, class: r.cls, textbook: r.textbook, topic: r.topic, score: r.score, baseline: r.baseline, hours: DEMO_HOURS[r.topic] }));
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(data));
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const el = document.createElement("a");
    el.href = url;
    el.download = "oqulyq-demo.csv";
    el.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pt-8 pb-5">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted">Data-Driven Curriculum</div>
          <h1 className="font-display mt-1 text-4xl leading-none sm:text-5xl">Oqulyq&nbsp;Lab</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted">{t.tagline}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex overflow-hidden rounded-full border border-ink text-sm">
            {(["ru", "kk"] as Lang[]).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={`px-3 py-1 ${lang === l ? "bg-ink text-paper" : ""}`} aria-pressed={lang === l}>
                {l === "ru" ? "Рус" : "Қаз"}
              </button>
            ))}
          </div>
          <button onClick={printReport} className="print:hidden rounded-full border border-ink px-3 py-1 text-sm hover:bg-ink hover:text-paper">{t.report}</button>
          <span className={`rounded-sm px-2 py-0.5 font-mono text-[11px] ${isDemo ? "bg-amber text-ink" : "bg-good text-paper"}`}>{isDemo ? t.demo : `${t.imported}: ${rows.length} ${t.rows}`}</span>
        </div>
      </header>

      <nav className="print:hidden sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto bg-paper/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
        {t.tabs.map((name, i) => (
          <button key={name} onClick={() => setTab(i)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${tab === i ? "bg-ink text-paper" : "hover:bg-line"}`}>
            {name}
          </button>
        ))}
      </nav>

      {show(0) && (
        <section className="mt-4 grid gap-10">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
            {([[rows.length, t.students], [a.classes, t.classes], [a.schools, t.schools], [a.topics.length, t.topics]] as const).map(([n, l]) => (
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
              {findings.filter(Boolean).map((f, i) => (
                <li key={i} className="flex gap-3 rounded-md border border-line bg-white/60 p-4 text-[15px] leading-snug">
                  <span className="font-mono text-accent">0{i + 1}</span>
                  <span>{f}</span>
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
                <thead><tr><th className="text-left font-normal text-muted">{t.schools}</th>{a.topics.map((tp, i) => <th key={tp} title={label(tp)} className="w-12 font-mono font-normal text-muted">T{i + 1}</th>)}</tr></thead>
                <tbody>
                  {a.schoolList.map((sc) => (
                    <tr key={sc}>
                      <td className="pr-2 text-[13px] whitespace-nowrap">{sc}</td>
                      {a.topics.map((tp) => {
                        const v = a.heat(sc, tp);
                        const alpha = v == null ? 0 : Math.max(0.06, Math.min(1, (90 - v) / 50));
                        return <td key={tp} title={`${label(tp)}: ${v ?? "—"}%`} className="h-8 rounded-sm text-center font-mono tabular-nums" style={{ background: `rgba(180,68,44,${alpha})`, color: alpha > 0.55 ? "#f5f2ea" : "#1c1b17" }}>{v ?? "—"}</td>;
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
        <section className="mt-4 grid gap-10">
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
                      <td className="py-3 pr-3 font-medium">{e.textbook}<div className="font-mono text-xs font-normal text-muted">{e.k} {t.k}</div></td>
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
        </section>
      )}

      {show(2) && (
        <section className="mt-4">
          <h2 className="font-display text-2xl">{t.hoursTitle}</h2>
          <p className="mt-2 max-w-3xl text-[15px] text-muted">{t.hoursNote}</p>
          <div className="mt-4 grid gap-3">
            {a.recs.map((r) => (
              <article key={r.topic} className="grid gap-2 rounded-md border border-line bg-white/60 p-4 sm:grid-cols-[minmax(0,260px)_150px_1fr] sm:gap-6">
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
            <div className="rounded-md border border-ink p-4">
              <h3 className="font-display text-xl">{t.whatIf}</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <select value={wiTopic || sorted[0]?.topic} onChange={(e) => setWiTopic(e.target.value)} className="max-w-full rounded-sm border border-line bg-paper px-2 py-1">
                  {a.stats.map((s) => <option key={s.topic} value={s.topic}>{label(s.topic)}</option>)}
                </select>
                <input type="range" min={-3} max={4} value={wiDelta} onChange={(e) => setWiDelta(Number(e.target.value))} aria-label="hours" />
                <span className="font-mono">{wiDelta > 0 ? "+" : ""}{wiDelta} {lang === "ru" ? "ч" : "сағ"}</span>
              </div>
              {(() => {
                const s = a.stats.find((x) => x.topic === (wiTopic || sorted[0]?.topic));
                if (!s) return null;
                const pred = Math.max(0, Math.min(95, s.mean + ELASTICITY * wiDelta));
                return (
                  <p className="mt-3 text-[15px]">
                    {label(s.topic)}: <span className="font-mono">{s.mean}% → {pred.toFixed(1)}%</span> {pred >= TARGET ? `✓ ${t.reach}` : `· ${t.toTarget} ${Math.ceil((TARGET - s.mean) / ELASTICITY)} ${lang === "ru" ? "ч" : "сағ"}`}
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
        <section className="mt-4 grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl">{t.upload}</h2>
            <p className="mt-2 text-sm text-muted">{t.uploadHint}</p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-ink/30 p-8 text-center hover:border-ink">
              <span className="font-mono text-sm">.csv · .xlsx</span>
              <span className="text-sm">{t.upload}</span>
              <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            {err && <p className="mt-2 text-sm text-bad">{err}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={downloadTemplate} className="rounded-full border border-ink px-4 py-1.5 text-sm hover:bg-ink hover:text-paper">{t.template}</button>
              {!isDemo && <button onClick={() => { setRows(DEMO); setHours(DEMO_HOURS); setIsDemo(true); }} className="rounded-full px-4 py-1.5 text-sm hover:bg-line">{t.reset}</button>}
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
