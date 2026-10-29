import { isScope, parsePrincipal, type Auth, type PrincipalContext, type Scope } from "agentic-identity";

const MIN_TOKEN_BYTES = 32;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,512}$/;
const DEFAULT_SCOPES: Scope[] = ["text:read"];
const warned = new Set<string>();

function refuse(reason: string): void {
  if (!warned.has(reason)) {
    warned.add(reason);
    console.error(`AUTH_TOKENS is refused: ${reason}`); // never the token or its value
  }
}

function same(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function contextOf(entry: unknown): PrincipalContext | undefined {
  const object = typeof entry === "object" && entry !== null && !Array.isArray(entry) ? (entry as { as?: unknown; scopes?: unknown }) : undefined;
  const who = typeof entry === "string" ? entry : object?.as;
  const cut = typeof who === "string" ? who.indexOf(":") : -1;
  if (typeof who !== "string" || cut < 1 || cut === who.length - 1) return undefined;
  const given = object?.scopes;
  if (given !== undefined && !(Array.isArray(given) && given.every(isScope))) return undefined;
  try {
    const { kind, id } = parsePrincipal({ kind: who.slice(0, cut), id: who.slice(cut + 1) });
    return { principalId: id, kind, chain: [{ id, kind }], scopes: (given as Scope[] | undefined) ?? [...DEFAULT_SCOPES] };
  } catch {
    return undefined;
  }
}

/**
 * An `Auth` over a table of bearer tokens, read from one string secret. The secret is a JSON object:
 * token (32 to 512 bytes of A-Z a-z 0-9 _ -) to `kind:name`, or to `{ "as": "kind:name", "scopes": ["text:read"] }`.
 * One bad entry refuses the whole table, so a typo never leaves a weak token live.
 */
export function createTokenAuth(raw: string | undefined): Auth {
  let table: Map<string, PrincipalContext> | undefined;
  try {
    const parsed: unknown = JSON.parse(raw ?? "");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not a JSON object");
    table = new Map();
    for (const [token, entry] of Object.entries(parsed)) {
      if (new TextEncoder().encode(token).length < MIN_TOKEN_BYTES) throw new Error(`a token is shorter than ${MIN_TOKEN_BYTES} bytes`);
      if (!TOKEN_SHAPE.test(token)) throw new Error("a token holds a character outside A-Z a-z 0-9 _ - or is over 512 bytes");
      const context = contextOf(entry);
      if (!context) throw new Error("an entry is not a valid kind:name or { as, scopes }");
      table.set(token, context);
    }
  } catch (error) {
    table = undefined;
    refuse(error instanceof SyntaxError ? "not valid JSON" : (error as Error).message);
  }
  const known = table;
  return {
    async authenticate(request) {
      const bearer = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
      if (bearer === undefined || !known) return null;
      let found: PrincipalContext | null = null;
      for (const [token, context] of known) if (same(token, bearer)) found = context;
      return found;
    },
  };
}
