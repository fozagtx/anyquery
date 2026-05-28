import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeSql: vi.fn(),
  fetch: vi.fn(),
  listCatalog: vi.fn()
}));

vi.mock("../server/lib/coral", () => ({
  coralGateway: {
    executeSql: mocks.executeSql,
    listCatalog: mocks.listCatalog
  }
}));

const { answerQuestion } = await import("../server/lib/queryEngine");

describe("answerQuestion natural-language SQL generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    process.env.AISA_API_KEY = "test-key";
    delete process.env.AISA_MODEL;
    delete process.env.AISA_BASE_URL;
    mocks.listCatalog.mockResolvedValue([
      {
        schema: "coral",
        name: "inputs",
        description: "BASE TABLE",
        columns: [
          { name: "id", type: "TEXT" },
          { name: "value", type: "INTEGER" }
        ]
      }
    ]);
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: "{\"sql\":\"SELECT 1 AS ok\"}"
            }
          }
        ]
      })
    });
    mocks.executeSql.mockResolvedValue({
      rows: [{ ok: 1 }],
      executionMs: 7
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AISA_API_KEY;
    delete process.env.AISA_MODEL;
    delete process.env.AISA_BASE_URL;
  });

  it("uses AIsa chat completions to plan SQL before running Coral", async () => {
    const response = await answerQuestion({
      message: "show me whether the system is alive",
      threadId: "thread-1",
      privacyMode: "summaries"
    });

    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.aisa.one/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key"
        }),
        body: expect.stringContaining("coral.inputs(id TEXT, value INTEGER)")
      })
    );
    expect(mocks.executeSql).toHaveBeenCalledWith("SELECT 1 AS ok");
    expect(response.sql).toBe("SELECT 1 AS ok");
    expect(response.rows).toEqual([{ ok: 1 }]);
  });

  it("honors AISA_MODEL and AISA_BASE_URL when calling AIsa", async () => {
    process.env.AISA_MODEL = "gpt-4.1";
    process.env.AISA_BASE_URL = "https://api.aisa.one/v1/";

    await answerQuestion({
      message: "count the inputs",
      threadId: "thread-1",
      privacyMode: "summaries"
    });

    const [, request] = mocks.fetch.mock.calls[0];
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://api.aisa.one/v1/chat/completions");
    expect(JSON.parse(request.body).model).toBe("gpt-4.1");
  });

  it("fails before catalog discovery when no model key is configured", async () => {
    delete process.env.AISA_API_KEY;

    await expect(
      answerQuestion({
        message: "count the inputs",
        threadId: "thread-1",
        privacyMode: "summaries"
      })
    ).rejects.toThrow("AISA_API_KEY");

    expect(mocks.listCatalog).not.toHaveBeenCalled();
  });
});
