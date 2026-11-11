import Link from "next/link";
import { openapi } from "@/lib/openapi";

export const metadata = { title: "Oqulyq Lab API" };

const examples: Record<string, string> = {
  "/districts": "/api/v1/districts",
  "/schools": "/api/v1/schools?district=1&page=1&limit=5",
  "/topics": "/api/v1/topics?district=2",
  "/textbooks": "/api/v1/textbooks",
  "/hours": "/api/v1/hours?lang=en",
};

export default function ApiDocs() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
      <Link href="/" className="text-sm text-accent underline underline-offset-2">← Oqulyq Lab</Link>
      <h1 className="font-display mt-4 text-4xl">Open API</h1>
      <p className="mt-2 text-muted">{openapi.info.description}</p>
      <p className="mt-2 font-mono text-sm">OpenAPI 3.1: <a className="text-accent underline" href="/api/v1/openapi.json">/api/v1/openapi.json</a></p>
      <ul className="mt-8 grid gap-4">
        {Object.entries(openapi.paths).map(([path, op]) => (
          <li key={path} className="rounded-md border border-line bg-card p-4">
            <div className="font-mono"><span className="mr-2 rounded-sm bg-ink px-1.5 py-0.5 text-xs text-paper">GET</span>/api/v1{path}</div>
            <p className="mt-1 text-[15px]">{op.get.summary}</p>
            <a className="mt-1 inline-block font-mono text-sm text-accent underline" href={examples[path]}>{examples[path]}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
