import { json } from "@/lib/db";
import { scopedClassTopics } from "@/lib/api";
import { textbookEffects } from "@/lib/analytics";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const cts = await scopedClassTopics(new URL(req.url).searchParams);
  const topics = [...new Set(cts.map((c) => c.topic))];
  const e = textbookEffects(cts, topics);
  return json({ method: "class-level residual vs a(topic) + b·baseline, 95% CI", slope_b: e.b, overall: e.overall, by_topic: e.cells });
}
