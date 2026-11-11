import { json } from "@/lib/db";
import { scopedClassTopics, scopedTopicStats } from "@/lib/api";
import { hourRecs, textbookEffects } from "@/lib/analytics";
import { TOPICS } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const lang = p.get("lang") === "kk" ? "kk" : p.get("lang") === "en" ? "en" : "ru";
  const [stats, cts] = await Promise.all([scopedTopicStats(p), scopedClassTopics(p)]);
  const e = textbookEffects(cts, stats.map((s) => s.topic));
  const recs = hourRecs(stats, Object.fromEntries(TOPICS.map((t) => [t.name, t.hours])), e.cells, lang, (x) => x);
  return json({ total_plan: recs.reduce((s, r) => s + r.plan, 0), total_recommended: recs.reduce((s, r) => s + r.rec, 0), topics: recs });
}
