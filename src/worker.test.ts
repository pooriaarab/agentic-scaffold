import { createMemoryAuth } from "agentic-identity";
import type { D1Like } from "agentic-identity/cloudflare";
import { describe, expect, test } from "vitest";
import worker from "./worker.js";

const ctx = (scopes: string[]) => ({
  principalId: "p1",
  kind: "human" as const,
  chain: [{ id: "p1", kind: "human" as const }],
  scopes,
});

async function setup() {
  const mem = createMemoryAuth();
  const env = { PACK_NAME: "probe", AUTH: mem.auth };
  return {
    env,
    allowed: await mem.issue(ctx(["text:read"])),
    narrow: await mem.issue(ctx(["other:read"])),
  };
}

function post(path: string, body: unknown, token?: string): Request {
  return new Request(`https://pack.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("worker", () => {
  test("GET /health uses the package name by default", async () => {
    const response = await worker.fetch(new Request("https://pack.test/health"), {});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, pack: "agentic-scaffold" });
  });

  test("GET /health reports ok without auth", async () => {
    const response = await worker.fetch(new Request("https://pack.test/health"), {
      PACK_NAME: "probe",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, pack: "probe" });
  });

  test("POST /api/v1/summarize returns stats with a scoped key", async () => {
    const { env, allowed } = await setup();
    const response = await worker.fetch(post("/api/v1/summarize", { text: "one two two" }, allowed), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ words: 3 });
  });

  test("a missing or bad key gets 401", async () => {
    const { env } = await setup();
    const none = await worker.fetch(post("/api/v1/summarize", { text: "a" }), env);
    expect(none.status).toBe(401);
    const bad = await worker.fetch(post("/api/v1/summarize", { text: "a" }, "nope"), env);
    expect(bad.status).toBe(401);
  });

  test("a key without the scope gets 403", async () => {
    const { env, narrow } = await setup();
    const response = await worker.fetch(post("/api/v1/summarize", { text: "a" }, narrow), env);
    expect(response.status).toBe(403);
  });

  test("with no Auth configured the route fails closed", async () => {
    const response = await worker.fetch(post("/api/v1/summarize", { text: "a" }, "x"), {});
    expect(response.status).toBe(503);
  });

  test("a Worker env of plain strings authenticates through AUTH_TOKENS", async () => {
    const token = "a".repeat(40);
    const env = { AUTH_UNSAFE_DEV_TOKENS: "1", AUTH_TOKENS: JSON.stringify({ [token]: "human:ana" }) };
    const ok = await worker.fetch(post("/api/v1/summarize", { text: "one two" }, token), env);
    expect(ok.status).toBe(200);
    const bad = await worker.fetch(post("/api/v1/summarize", { text: "one two" }, "b".repeat(40)), env);
    expect(bad.status).toBe(401);
  });

  test("a short token refuses the whole AUTH_TOKENS table", async () => {
    const strong = "a".repeat(40);
    const env = { AUTH_UNSAFE_DEV_TOKENS: "1", AUTH_TOKENS: JSON.stringify({ [strong]: "human:ana", short: "human:bob" }) };
    const response = await worker.fetch(post("/api/v1/summarize", { text: "x" }, strong), env);
    expect(response.status).toBe(401);
  });

  test("the old /summarize route is gone", async () => {
    const { env, allowed } = await setup();
    const response = await worker.fetch(post("/summarize", { text: "a" }, allowed), env);
    expect(response.status).toBe(404);
  });

  test("POST /api/v1/summarize rejects a bad body", async () => {
    const { env, allowed } = await setup();
    const response = await worker.fetch(post("/api/v1/summarize", { text: 42 }, allowed), env);
    expect(response.status).toBe(400);
  });

  test("unknown routes return 404", async () => {
    const response = await worker.fetch(new Request("https://pack.test/nowhere"), {});
    expect(response.status).toBe(404);
  });
});

// Failure cases: missing or forged credentials, another principal's rights,
// revoked parents, bad region settings, and accidental dev fallback in production.
describe("shared identity database", () => {
  async function identity() {
    const docs = new Map<string, unknown>();
    const token = "aid_" + "a".repeat(40);
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    docs.set(`credentials/${hash}`, { principalId: "child", kind: "api_key" });
    docs.set("principals/root", { id: "root", kind: "human", scopes: ["text:read"] });
    docs.set("principals/child", { id: "child", kind: "agent_of_human", parentId: "root", scopes: ["text:read"] });
    const db = {
      prepare() {
        return { bind(collection: string, id: string) {
          return { async all() {
            const doc = docs.get(`${collection}/${id}`);
            return { results: doc ? [{ body: JSON.stringify(doc), version: 1 }] : [], meta: { served_by_region: "WEUR" } };
          } };
        } };
      },
    } as unknown as D1Like;
    return { docs, token, env: { IDENTITY_DB: db, REGION: "eu" } };
  }

  test("authenticates a stored credential and its delegated principal", async () => {
    const { env, token } = await identity();
    const response = await worker.fetch(post("/api/v1/summarize", { text: "one two" }, token), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ words: 2 });
  });

  test("rejects absent and unknown credentials", async () => {
    const { env } = await identity();
    for (const token of [undefined, "unknown"]) {
      expect((await worker.fetch(post("/api/v1/summarize", { text: "x" }, token), env)).status).toBe(401);
    }
  });

  test("does not borrow rights from a different principal", async () => {
    const { env, docs, token } = await identity();
    docs.set("principals/child", { id: "child", kind: "agent", scopes: ["other:read"] });
    expect((await worker.fetch(post("/api/v1/summarize", { text: "x" }, token), env)).status).toBe(403);
  });

  test("revoking a parent denies its child on the next request", async () => {
    const { env, docs, token } = await identity();
    docs.set("principals/root", { id: "root", kind: "human", scopes: ["text:read"], revokedAt: 1 });
    expect((await worker.fetch(post("/api/v1/summarize", { text: "x" }, token), env)).status).toBe(401);
  });

  test("database auth takes precedence over the development token table", async () => {
    const { env } = await identity();
    const token = "b".repeat(40);
    const response = await worker.fetch(post("/api/v1/summarize", { text: "x" }, token), {
      ...env, AUTH_UNSAFE_DEV_TOKENS: "1", AUTH_TOKENS: JSON.stringify({ [token]: "human:dev" }),
    });
    expect(response.status).toBe(401);
  });

  test("a token table alone does not enable development auth", async () => {
    const token = "b".repeat(40);
    expect((await worker.fetch(post("/api/v1/summarize", { text: "x" }, token), {
      AUTH_TOKENS: JSON.stringify({ [token]: "human:dev" }),
    })).status).toBe(503);
  });

  test("bad region settings and unavailable databases fail closed", async () => {
    const { env, token } = await identity();
    expect((await worker.fetch(post("/api/v1/summarize", { text: "x" }, token), { ...env, REGION: "invalid" })).status).toBe(503);
    const broken = { prepare() { throw new Error("unavailable"); } } as unknown as D1Like;
    expect((await worker.fetch(post("/api/v1/summarize", { text: "x" }, token), { ...env, IDENTITY_DB: broken })).status).toBe(503);
  });
});
