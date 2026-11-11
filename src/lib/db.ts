import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { BOOKS, COVERAGE, DISTRICTS, generateDemo, TOPICS } from "./data";

// One in-process Postgres per server instance. Same db/schema.sql runs on Neon in production (DATABASE_URL).
let ready: Promise<PGlite> | null = null;

export function getDb() {
  ready ??= init();
  return ready;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function init() {
  const db = new PGlite();
  await db.exec(readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
  const { rows } = generateDemo();
  const sql: string[] = [];
  sql.push(`INSERT INTO region(name_ru,name_kk) VALUES ('Жамбылская область','Жамбыл облысы');`);
  sql.push(`INSERT INTO district(region_id,name_ru,name_kk) VALUES ${DISTRICTS.map((d) => `(1,${q(d.name)},${q(d.kk)})`).join(",")};`);
  const distId = new Map(DISTRICTS.map((d, i) => [d.name, i + 1]));
  const schools = [...new Map(rows.map((r) => [r.school, r])).values()];
  const schoolId = new Map(schools.map((r, i) => [r.school, i + 1]));
  sql.push(`INSERT INTO school(district_id,name,urban) VALUES ${schools.map((r) => `(${distId.get(r.district)},${q(r.school)},${DISTRICTS.find((d) => d.name === r.district)!.urban})`).join(",")};`);
  sql.push(`INSERT INTO subject(name_ru,name_kk,grade,annual_hours) VALUES ('Алгебра','Алгебра',7,${TOPICS.reduce((s, t) => s + t.hours, 0)});`);
  sql.push(`INSERT INTO topic(subject_id,ord,name_ru,name_kk,planned_hours) VALUES ${TOPICS.map((t, i) => `(1,${i + 1},${q(t.name)},${q(t.kk)},${t.hours})`).join(",")};`);
  sql.push(`INSERT INTO textbook(subject_id,title,publisher) VALUES ${BOOKS.map((b) => `(1,${q(b)},'демо')`).join(",")};`);
  sql.push(`INSERT INTO textbook_chapter VALUES ${BOOKS.flatMap((b, bi) => COVERAGE[b].map((p, ti) => (p > 0 ? `(${bi + 1},${ti + 1},${p},${p * 2})` : null)).filter(Boolean)).join(",")};`);
  const classes = [...new Map(rows.map((r) => [`${r.school}|${r.cls}`, r])).values()];
  const classId = new Map(classes.map((r, i) => [`${r.school}|${r.cls}`, i + 1]));
  sql.push(`INSERT INTO class(school_id,grade,letter,year,textbook_id,baseline) VALUES ${classes.map((r) => `(${schoolId.get(r.school)},7,${q(r.cls)},2026,${BOOKS.indexOf(r.textbook as (typeof BOOKS)[number]) + 1},${r.baseline})`).join(",")};`);
  sql.push(`INSERT INTO test(topic_id,quarter,year) VALUES ${TOPICS.map((t, i) => `(${i + 1},${t.quarter},2026)`).join(",")};`);
  // generator emits TOPICS.length consecutive rows per student
  const n = TOPICS.length;
  const students: string[] = [];
  const results: string[] = [];
  for (let i = 0; i < rows.length; i += n) {
    const sid = i / n + 1;
    students.push(`(${classId.get(`${rows[i].school}|${rows[i].cls}`)},'demo-${sid}')`);
    for (let j = 0; j < n; j++) results.push(`(${j + 1},${sid},${rows[i + j].score})`);
  }
  sql.push(`INSERT INTO student(class_id,pseudo_id) VALUES ${students.join(",")};`);
  sql.push(`INSERT INTO result VALUES ${results.join(",")};`);
  sql.push(`REFRESH MATERIALIZED VIEW class_topic_stats;`);
  await db.exec(sql.join("\n"));
  return db;
}

/** Shared filter: ?district=<id>&school=<id> → SQL WHERE on class_topic_stats. Ids are parsed as integers (no injection). */
export function scopeWhere(params: URLSearchParams) {
  const parts: string[] = [];
  const d = Number(params.get("district"));
  const s = Number(params.get("school"));
  if (Number.isInteger(d) && d > 0) parts.push(`cts.district_id = ${d}`);
  if (Number.isInteger(s) && s > 0) parts.push(`cts.school_id = ${s}`);
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400", "access-control-allow-origin": "*" },
  });
}
