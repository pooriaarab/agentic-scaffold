import { createStoreAuth, parseRegion, type Auth } from "agentic-identity";
import { createD1Store, type D1Like } from "agentic-identity/cloudflare";
import { requirePrincipal } from "agentic-identity/http";
import { createTokenAuth } from "./auth.js";
import { summarizeText } from "./core.js";
import { VERSION } from "./version.js";

export interface WorkerEnv {
  PACK_NAME?: string;
  /** Identity database shared with the identity Worker. */
  IDENTITY_DB?: D1Like;
  /** Declare the database region. Use "unknown" only for local development. */
  REGION?: string;
  /** Explicit development fallback. Ignored when IDENTITY_DB is set. */
  AUTH_UNSAFE_DEV_TOKENS?: string;
  /** Development token table; requires AUTH_UNSAFE_DEV_TOKENS=1. */
  AUTH_TOKENS?: string;
  /** Optional Auth port override for other backends and tests. */
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
      return json({ ok: true, pack: env.PACK_NAME ?? "agentic-scaffold", version: VERSION });
    }
    if (request.method === "POST" && url.pathname === "/api/v1/summarize") {
      let auth: Auth;
      try {
        if (env.AUTH) auth = env.AUTH;
        else if (env.IDENTITY_DB) {
          auth = createStoreAuth(createD1Store(env.IDENTITY_DB, { region: parseRegion(env.REGION) }));
        } else if (env.AUTH_UNSAFE_DEV_TOKENS === "1" && env.AUTH_TOKENS) {
          auth = createTokenAuth(env.AUTH_TOKENS);
        } else return json({ error: "auth is not configured" }, 503);
      } catch {
        return json({ error: "auth configuration is invalid" }, 503);
      }
      const principal = await requirePrincipal(request, auth, { scope: SUMMARIZE_SCOPE });
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
