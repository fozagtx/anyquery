import { randomUUID } from "node:crypto";
import type { CatalogTable, ChartSpec, ChatResponse, DataRow, PrivacyMode } from "../../shared/types";
import { coralGateway } from "./coral";
import { validateReadOnlySql } from "./sqlSafety";

const sqlGenerationSystemPrompt = [
  "You are AnyQuery's SQL planner for Coral/DataFusion.",
  'Return compact JSON only in the shape {"sql":"..."}; never prose or markdown.',
  "Generate exactly one read-only SQL query.",
  "Use only tables and columns from the provided catalog unless the user asks to inspect metadata.",
  "For metadata requests, use SHOW TABLES, SHOW COLUMNS, SHOW SCHEMAS, or information_schema.",
  "Prefer explicit schema-qualified table names when a source schema is available.",
  "Always include a LIMIT when the query can return multiple rows.",
  "Never generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, COPY, SET, or multiple statements."
].join(" ");

export class NaturalLanguageUnavailableError extends Error {
  constructor() {
    super("Natural-language SQL generation requires AISA_API_KEY. Enter a SELECT/WITH SQL query or configure AIsa.");
    this.name = "NaturalLanguageUnavailableError";
  }
}

export async function answerQuestion(input: {
  message: string;
  threadId: string;
  privacyMode: PrivacyMode;
}): Promise<ChatResponse> {
  const sql = isSqlLike(input.message) ? input.message.trim() : await generateSql(input.message);
  const safety = validateReadOnlySql(sql);

  if (!safety.safe) {
    throw new Error(safety.reason ?? "SQL was blocked by the read-only safety validator.");
  }

  const result = await coralGateway.executeSql(sql);
  const columns = deriveColumns(result.rows);

  return {
    id: randomUUID(),
    threadId: input.threadId,
    question: input.message,
    answer: summarizeRows(result.rows, columns),
    sql,
    rows: result.rows,
    columns,
    chart: inferChart(result.rows, columns),
    provenance: {
      sources: inferSources(sql),
      rowCount: result.rows.length,
      executionMs: result.executionMs,
      cache: "live",
      generatedAt: new Date().toISOString(),
      privacyMode: input.privacyMode
    },
    progress: ["Validated SQL", "Executed with Coral", "Rendered result"],
    warnings: []
  };
}

function isSqlLike(message: string): boolean {
  const trimmed = message.trim();
  return /^(select|with)\b/i.test(trimmed) || /^show\s+(tables|columns|schemas)\b/i.test(trimmed);
}

async function generateSql(prompt: string): Promise<string> {
  const apiKey = process.env.AISA_API_KEY;

  if (!apiKey) {
    throw new NaturalLanguageUnavailableError();
  }

  const catalog = await coralGateway.listCatalog();
  const schema = renderCatalogForPrompt(catalog);
  const content = await callAisaForSql({
    apiKey,
    prompt,
    schema
  });
  const sql = extractSql(content);

  if (!sql) {
    throw new Error("AIsa did not return SQL.");
  }

  return normalizeGeneratedSql(sql);
}

async function callAisaForSql(input: { apiKey: string; prompt: string; schema: string }): Promise<string> {
  const baseUrl = normalizeBaseUrl(process.env.AISA_BASE_URL ?? "https://api.aisa.one/v1");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.AISA_MODEL ?? "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: sqlGenerationSystemPrompt
        },
        {
          role: "user",
          content: `Catalog:\n${input.schema}\n\nQuestion:\n${input.prompt}`
        }
      ],
      temperature: 0,
      max_tokens: 600
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AIsa chat completion failed with HTTP ${response.status}: ${message.slice(0, 240)}`);
  }

  const body = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("AIsa response did not include message content.");
  }

  return content;
}

function renderCatalogForPrompt(catalog: CatalogTable[]): string {
  const rendered = catalog
    .slice(0, 80)
    .map((table) => {
      const columns = table.columns.map((column) => `${column.name} ${column.type}`).join(", ");
      return `${table.schema}.${table.name}(${columns})`;
    })
    .join("\n");

  return rendered || "No source tables are currently installed. Use Coral metadata tables only.";
}

function normalizeGeneratedSql(sql: string): string {
  return sql.replace(/^```sql\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function extractSql(content: string): string {
  const normalized = normalizeGeneratedSql(content);

  try {
    const parsed = JSON.parse(normalized) as { sql?: unknown };
    return typeof parsed.sql === "string" ? parsed.sql : "";
  } catch {
    return normalized;
  }
}

function deriveColumns(rows: DataRow[]): string[] {
  const columns = new Set<string>();

  for (const row of rows) {
    for (const column of Object.keys(row)) {
      columns.add(column);
    }
  }

  return [...columns];
}

function summarizeRows(rows: DataRow[], columns: string[]): string {
  if (rows.length === 0) {
    return "Coral returned zero rows.";
  }

  const firstColumn = columns[0] ?? "result";
  const numericColumn = columns.find((column) => rows.some((row) => typeof row[column] === "number"));

  if (numericColumn) {
    const total = rows.reduce((sum, row) => {
      const value = row[numericColumn];
      return typeof value === "number" ? sum + value : sum;
    }, 0);
    return `Coral returned ${rows.length} rows. The numeric total for ${numericColumn} is ${formatNumber(total)}.`;
  }

  return `Coral returned ${rows.length} rows across ${columns.length} columns. First column: ${firstColumn}.`;
}

function inferChart(rows: DataRow[], columns: string[]): ChartSpec | undefined {
  if (rows.length < 2) return undefined;

  const numeric = columns.find((column) => rows.every((row) => typeof row[column] === "number" || row[column] === null));
  const dimension = columns.find((column) => column !== numeric);

  if (!numeric || !dimension) return undefined;

  const type = /date|time|month|day|week|year/i.test(dimension) ? "line" : "bar";

  return {
    type,
    xKey: dimension,
    yKey: numeric,
    reason: type === "line" ? "The first dimension looks temporal." : "The result has one dimension and one numeric measure."
  };
}

function inferSources(sql: string): string[] {
  const matches = [...sql.matchAll(/\bfrom\s+([a-zA-Z_][\w]*)(?:\.([a-zA-Z_][\w]*))?/gi)];
  const sources = matches.map((match) => match[2] ? match[1] : "coral");
  const unique = [...new Set(sources)];
  return unique.length > 0 ? unique : ["coral"];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(value);
}
