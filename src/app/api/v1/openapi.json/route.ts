import { json } from "@/lib/db";
import { openapi } from "@/lib/openapi";

export function GET() {
  return json(openapi);
}
