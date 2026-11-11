import { getDb, json } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, Number(p.get("limit")) || 20));
  const page = Math.max(1, Number(p.get("page")) || 1);
  const d = Number(p.get("district"));
  const where = Number.isInteger(d) && d > 0 ? `WHERE s.district_id = ${d}` : "";
  const db = await getDb();
  const total = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM school s ${where}`);
  const r = await db.query(`SELECT s.id, s.name, s.district_id, s.urban, COUNT(c.id)::int AS classes, ROUND(AVG(c.baseline), 1)::float AS baseline
    FROM school s LEFT JOIN class c ON c.school_id = s.id ${where} GROUP BY s.id ORDER BY s.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`);
  return json({ page, limit, total: total.rows[0].n, items: r.rows });
}
