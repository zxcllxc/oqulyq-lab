import { getDb, json } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const db = await getDb();
  const r = await db.query(`SELECT d.id, d.name_ru, d.name_kk, COUNT(DISTINCT s.id)::int AS schools, COUNT(DISTINCT c.id)::int AS classes
    FROM district d LEFT JOIN school s ON s.district_id = d.id LEFT JOIN class c ON c.school_id = s.id GROUP BY d.id ORDER BY d.id`);
  return json({ region: "Жамбылская область (демо)", districts: r.rows });
}
