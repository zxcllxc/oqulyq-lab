export const runtime = "nodejs";

// Is AI available (gateway has credit)? Cached per instance for 10 minutes; always answers 200 so the
// browser console stays clean when AI is off.
let cache: { at: number; on: boolean } | null = null;

export async function GET(req: Request) {
  if (cache && Date.now() - cache.at < 600_000) return Response.json({ ai: cache.on }, { headers: { "cache-control": "no-store" } });
  const token = process.env.AI_GATEWAY_API_KEY || req.headers.get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN;
  let on = false;
  if (token) {
    try {
      const r = await fetch("https://ai-gateway.vercel.sh/v1/credits", { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      on = r.ok && Number(j.balance) > 0;
    } catch {
      on = false;
    }
  }
  cache = { at: Date.now(), on };
  return Response.json({ ai: on }, { headers: { "cache-control": "no-store" } });
}
