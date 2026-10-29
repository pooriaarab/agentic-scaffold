import { createMemoryAuth } from "agentic-identity";
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
    const env = { AUTH_TOKENS: JSON.stringify({ [token]: "human:ana" }) };
    const ok = await worker.fetch(post("/api/v1/summarize", { text: "one two" }, token), env);
    expect(ok.status).toBe(200);
    const bad = await worker.fetch(post("/api/v1/summarize", { text: "one two" }, "b".repeat(40)), env);
    expect(bad.status).toBe(401);
  });

  test("a short token refuses the whole AUTH_TOKENS table", async () => {
    const strong = "a".repeat(40);
    const env = { AUTH_TOKENS: JSON.stringify({ [strong]: "human:ana", short: "human:bob" }) };
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
