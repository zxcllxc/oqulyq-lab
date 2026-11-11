import { generateText } from "ai";
import { LIMITS, makeLimiter, numbersGrounded, sanitizeFacts, sanitizeQuestion, systemPrompt, userPrompt } from "@/lib/aiGuard";

export const runtime = "nodejs";
export const maxDuration = 20;

const limit = makeLimiter();
const MODEL = "anthropic/claude-haiku-5.5";

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 40_000) return reply({ fallback: true, reason: "too_big" }, 413);
  let body: { mode?: unknown; facts?: unknown; question?: unknown; lang?: unknown };
  try { body = JSON.parse(raw); } catch { return reply({ fallback: true, reason: "bad_json" }, 400); }
  const mode = body.mode === "ask" ? "ask" : "explain";
  const lang = body.lang === "kk" ? "kk" : body.lang === "en" ? "en" : "ru";
  const facts = sanitizeFacts(body.facts);
  const question = sanitizeQuestion(body.question);
  if (!facts.length || (mode === "ask" && !question)) return reply({ fallback: true, reason: "empty" }, 400);

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const ok = limit(ip);
  if (ok !== "ok") return reply({ fallback: true, reason: ok === "ip" ? "rate_ip" : "rate_day" }, 429);
  // no credentials at all (local dev without key): skip the network call
  if (!process.env.VERCEL_OIDC_TOKEN && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL) return reply({ fallback: true, reason: "ai_off" }, 503);

  try {
    const { text } = await generateText({
      model: MODEL,
      instructions: systemPrompt(lang),
      prompt: userPrompt(facts, mode, question),
      maxOutputTokens: LIMITS.maxOutputTokens,
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(15_000),
    });
    const g = numbersGrounded(text, facts);
    if (!g.ok) return reply({ fallback: true, reason: "ungrounded", stray: g.stray.slice(0, 5) }, 422);
    return reply({ text, model: MODEL });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    // most common: gateway has no credit / card not on file → client falls back to templates
    return reply({ fallback: true, reason: /credit|card|verification|payment|quota/i.test(msg) ? "ai_off" : "error" }, 503);
  }
}
