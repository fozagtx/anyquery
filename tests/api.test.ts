import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

let baseUrl = "";
let server: Server;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  const dir = await mkdtemp(path.join(tmpdir(), "anyquery-coral-test-"));
  process.env.APP_STATE_PATH = path.join(dir, "state.json");
  await writeFile(
    process.env.APP_STATE_PATH,
    JSON.stringify({
      threads: [],
      savedQuestions: [],
      schedules: [],
      metrics: [
        {
          id: "metric-catalog-tables",
          name: "Catalog tables",
          description: "Count of tables visible through Coral information_schema",
          sql: "SELECT table_schema, COUNT(*) AS tables FROM information_schema.tables GROUP BY table_schema",
          dimensions: ["table_schema"]
        }
      ]
    }),
    "utf8"
  );
  const { app } = await import("../server/index");
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("API with real Coral", () => {
  it("reports Coral health", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.coral.mode).toBe("coral");
    expect(body.coral.available).toBe(true);
  });

  it("rejects requests from non-local allowed origins", async () => {
    const response = await fetch(`${baseUrl}/api/threads`, {
      headers: {
        Origin: "https://attacker.example"
      }
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("Origin");
  });

  it("executes SQL through Coral", async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "SELECT 1 AS ok", privacyMode: "summaries" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sql).toBe("SELECT 1 AS ok");
    expect(body.rows).toEqual([{ ok: 1 }]);
    expect(body.provenance.sources).toContain("coral");
  });

  it("does not persist result rows outside local_full privacy mode", async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "SELECT 1 AS ok", privacyMode: "summaries" })
    });
    const run = await response.json();
    const threadsResponse = await fetch(`${baseUrl}/api/threads`);
    const threads = await threadsResponse.json();
    const persistedRun = threads
      .flatMap((thread: { messages: Array<{ run?: { id: string; rows: unknown[] } }> }) => thread.messages)
      .find((message: { run?: { id: string; rows: unknown[] } }) => message.run?.id === run.id)?.run;
    const stateMode = (await stat(process.env.APP_STATE_PATH!)).mode & 0o777;

    expect(response.status).toBe(200);
    expect(run.rows).toEqual([{ ok: 1 }]);
    expect(persistedRun?.rows).toEqual([]);
    expect(stateMode).toBe(0o600);
    expect(await readFile(process.env.APP_STATE_PATH!, "utf8")).not.toContain("\"rows\": [\n              {\n                \"ok\": 1");
  });

  it("dry-runs a scheduled saved report through Coral without delivery", async () => {
    const savedResponse = await fetch(`${baseUrl}/api/saved-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Dry run smoke", prompt: "SELECT 1 AS ok" })
    });
    const savedQuestion = await savedResponse.json();
    const scheduleResponse = await fetch(`${baseUrl}/api/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        savedQuestionId: savedQuestion.id,
        frequency: "daily",
        destination: "email",
        recipient: "ops@example.com"
      })
    });
    const schedule = await scheduleResponse.json();
    const beforeThreadsResponse = await fetch(`${baseUrl}/api/threads`);
    const beforeThreads = await beforeThreadsResponse.json();

    const response = await fetch(`${baseUrl}/api/schedules/${schedule.id}/dry-run`, {
      method: "POST"
    });
    const body = await response.json();
    const afterThreadsResponse = await fetch(`${baseUrl}/api/threads`);
    const afterThreads = await afterThreadsResponse.json();

    expect(response.status).toBe(200);
    expect(body.schedule.id).toBe(schedule.id);
    expect(body.savedQuestion.id).toBe(savedQuestion.id);
    expect(body.report.question).toBe("SELECT 1 AS ok");
    expect(body.report.sql).toBe("SELECT 1 AS ok");
    expect(body.report.rows).toEqual([{ ok: 1 }]);
    expect(body.report.provenance.cache).toBe("live");
    expect(body.report.provenance.sources).toContain("coral");
    expect(body.delivery.attempted).toBe(false);
    expect(afterThreads.length).toBe(beforeThreads.length);
  });

  it("returns real Coral source metadata", async () => {
    const response = await fetch(`${baseUrl}/api/sources/github`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe("github");
    expect(body.inputs.some((input: { key: string }) => input.key === "GITHUB_TOKEN")).toBe(true);
  }, 15000);

  it("rejects unsafe source install environment keys before running Coral install", async () => {
    const response = await fetch(`${baseUrl}/api/sources/github/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: { PATH: "/tmp/unsafe", GITHUB_TOKEN: "redacted-test-token" } })
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.ok).toBe(false);
    expect(body.message).toContain("PATH");
  }, 15000);

  it("lints custom source specs through Coral", async () => {
    const response = await fetch(`${baseUrl}/api/source-specs/lint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml: "" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.message).toContain("empty");
  });

  it("refuses natural language when no model provider is configured", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Show me tables", privacyMode: "summaries" })
    });
    const body = await response.json();
    process.env.OPENAI_API_KEY = previous;

    expect(response.status).toBe(422);
    expect(body.error).toContain("OPENAI_API_KEY");
  });

  it("validates unsafe SQL", async () => {
    const response = await fetch(`${baseUrl}/api/sql/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "DROP TABLE information_schema.tables" })
    });
    const body = await response.json();

    expect(body.safe).toBe(false);
  });
});
