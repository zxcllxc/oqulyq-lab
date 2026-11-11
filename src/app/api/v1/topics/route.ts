import { json } from "@/lib/db";
import { scopedTopicStats } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const stats = await scopedTopicStats(new URL(req.url).searchParams);
  return json({ target: 70, pass: 60, topics: stats });
}
