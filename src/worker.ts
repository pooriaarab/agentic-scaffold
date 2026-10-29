import type { Auth } from "agentic-identity";
import { requirePrincipal } from "agentic-identity/http";
import { summarizeText } from "./core.js";
import { VERSION } from "./version.js";

export interface WorkerEnv {
  PACK_NAME?: string;
  /** The Auth port that checks each request. Without it, protected routes answer 503. */
  AUTH?: Auth;
}

export const SUMMARIZE_SCOPE = "text:read";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, pack: env.PACK_NAME ?? "agentic-pack", version: VERSION });
    }
    if (request.method === "POST" && url.pathname === "/api/v1/summarize") {
      if (!env.AUTH) {
        return json({ error: "auth is not configured" }, 503);
      }
      const principal = await requirePrincipal(request, env.AUTH, { scope: SUMMARIZE_SCOPE });
      if (principal instanceof Response) {
        return principal;
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "body must be JSON" }, 400);
      }
      if (typeof body !== "object" || body === null || !("text" in body)) {
        return json({ error: "body needs a text string" }, 400);
      }
      const { text } = body as { text: unknown };
      if (typeof text !== "string") {
        return json({ error: "body needs a text string" }, 400);
      }
      return json(summarizeText(text));
    }
    return json({ error: "not found" }, 404);
  },
};
