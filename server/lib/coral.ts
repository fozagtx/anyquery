import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  CatalogColumn,
  CatalogTable,
  DataRow,
  HealthResponse,
  SourceActionResult,
  SourceInfo,
  SourceInput,
  SourceStatus,
  SourceSummary
} from "../../shared/types";

const execFileAsync = promisify(execFile);
const deniedInputEnvKeys = new Set([
  "ALL_PROXY",
  "CORAL_BIN",
  "CORAL_CONFIG_DIR",
  "CORAL_HOME",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "HOME",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "LD_PRELOAD",
  "NODE_OPTIONS",
  "NO_PROXY",
  "PATH",
  "SHELL"
]);

export class CoralUnavailableError extends Error {
  constructor(message = "Coral CLI is required, but it is not available on PATH.") {
    super(message);
    this.name = "CoralUnavailableError";
  }
}

export class CoralQueryError extends Error {
  constructor(
    message: string,
    readonly stderr = ""
  ) {
    super(message);
    this.name = "CoralQueryError";
  }
}

export interface CoralGateway {
  probe(): Promise<HealthResponse["coral"]>;
  listSources(): Promise<SourceSummary[]>;
  getSourceInfo(name: string): Promise<SourceInfo>;
  installSource(name: string, inputs: Record<string, string>): Promise<SourceActionResult>;
  testSource(name: string): Promise<SourceActionResult>;
  installCustomSource(yaml: string, inputs: Record<string, string>): Promise<SourceActionResult>;
  listCatalog(): Promise<CatalogTable[]>;
  executeSql(sql: string): Promise<{ rows: DataRow[]; executionMs: number }>;
  lintSourceSpec(yaml: string): Promise<{ ok: boolean; message: string }>;
}

export class CliCoralGateway implements CoralGateway {
  private readonly bin: string;

  constructor(bin = process.env.CORAL_BIN ?? "coral") {
    this.bin = bin;
  }

  async probe(): Promise<HealthResponse["coral"]> {
    try {
      const { stdout } = await this.run(["--version"], 2000);
      return {
        available: true,
        version: stdout.trim(),
        mode: "coral",
        message: "Coral CLI is available."
      };
    } catch {
      return {
        available: false,
        mode: "missing",
        message: "Coral CLI is required. Install Coral and run `coral source add ...` before querying data."
      };
    }
  }

  async listSources(): Promise<SourceSummary[]> {
    await this.requireCoral();
    const [availableOutput, installedOutput] = await Promise.all([
      this.run(["source", "discover"], 8000).then((result) => result.stdout),
      this.run(["source", "list"], 8000).then((result) => result.stdout)
    ]);
    const installed = new Set(parseSourceTable(installedOutput).map((source) => source.id));

    return parseSourceTable(availableOutput).map((source) => ({
      ...source,
      status: installed.has(source.id) ? "installed" : source.status
    }));
  }

  async getSourceInfo(name: string): Promise<SourceInfo> {
    await this.requireCoral();
    const { stdout } = await this.run(["source", "info", "-v", name], 8000);
    return parseSourceInfo(stdout, name);
  }

  async installSource(name: string, inputs: Record<string, string>): Promise<SourceActionResult> {
    await this.requireCoral();

    try {
      const sourceInfo = await this.getSourceInfo(name);
      const { stdout, stderr } = await this.run(
        ["source", "add", name],
        30000,
        sourceEnv(inputs, sourceInfo.inputs.map((input) => input.key))
      );
      return { ok: true, message: cleanMessage(stdout || stderr || `${name} installed.`) };
    } catch (error) {
      return { ok: false, message: cleanError(error) };
    }
  }

  async testSource(name: string): Promise<SourceActionResult> {
    await this.requireCoral();

    try {
      const { stdout, stderr } = await this.run(["source", "test", name], 30000);
      return { ok: true, message: cleanMessage(stdout || stderr || `${name} passed connectivity test.`) };
    } catch (error) {
      return { ok: false, message: cleanError(error) };
    }
  }

  async installCustomSource(yaml: string, inputs: Record<string, string>): Promise<SourceActionResult> {
    await this.requireCoral();

    if (!yaml.trim()) {
      return { ok: false, message: "Source spec is empty." };
    }

    const dir = await mkdtemp(path.join(tmpdir(), "anyquery-coral-source-"));
    const file = path.join(dir, "source.yaml");

    try {
      await writeFile(file, yaml, "utf8");
      const { stdout, stderr } = await this.run(["source", "add", "--file", file], 30000, sourceEnv(inputs));
      return { ok: true, message: cleanMessage(stdout || stderr || "Custom source installed.") };
    } catch (error) {
      return { ok: false, message: cleanError(error) };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async listCatalog(): Promise<CatalogTable[]> {
    await this.requireCoral();
    const tableRows = await this.queryJson<{
      table_schema: string;
      table_name: string;
      table_type: string;
    }>(
      "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('information_schema') ORDER BY table_schema, table_name"
    );
    const columnRows = await this.queryJson<{
      table_schema: string;
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      "SELECT table_schema, table_name, column_name, data_type, is_nullable FROM information_schema.columns ORDER BY table_schema, table_name, ordinal_position"
    );
    const columnsByTable = new Map<string, CatalogColumn[]>();

    for (const row of columnRows) {
      const key = tableKey(row.table_schema, row.table_name);
      const columns = columnsByTable.get(key) ?? [];
      columns.push({
        name: row.column_name,
        type: row.data_type,
        required: row.is_nullable === "NO"
      });
      columnsByTable.set(key, columns);
    }

    return tableRows.map((row) => ({
      schema: row.table_schema,
      name: row.table_name,
      description: row.table_type,
      columns: columnsByTable.get(tableKey(row.table_schema, row.table_name)) ?? []
    }));
  }

  async executeSql(sql: string): Promise<{ rows: DataRow[]; executionMs: number }> {
    await this.requireCoral();
    const started = performance.now();
    const rows = await this.queryJson<DataRow>(sql, 30000);
    return {
      rows,
      executionMs: Math.round(performance.now() - started)
    };
  }

  async lintSourceSpec(yaml: string): Promise<{ ok: boolean; message: string }> {
    await this.requireCoral();

    if (!yaml.trim()) {
      return { ok: false, message: "Source spec is empty." };
    }

    const dir = await mkdtemp(path.join(tmpdir(), "anyquery-coral-spec-"));
    const file = path.join(dir, "source.yaml");

    try {
      await writeFile(file, yaml, "utf8");
      await this.run(["source", "lint", file], 10000);
      return { ok: true, message: "Coral accepted the source spec." };
    } catch (error) {
      return { ok: false, message: cleanError(error) };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async queryJson<T extends DataRow>(sql: string, timeoutMs = 15000): Promise<T[]> {
    try {
      const { stdout } = await this.run(["sql", "--format", "json", sql], timeoutMs);
      return JSON.parse(stdout) as T[];
    } catch (error) {
      throw new CoralQueryError(cleanError(error), stderrFrom(error));
    }
  }

  private async requireCoral(): Promise<void> {
    const health = await this.probe();
    if (!health.available) {
      throw new CoralUnavailableError(health.message);
    }
  }

  private run(args: string[], timeoutMs: number, env?: NodeJS.ProcessEnv) {
    return execFileAsync(this.bin, args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 8,
      env: env ?? process.env
    });
  }
}

function parseSourceTable(output: string): SourceSummary[] {
  const now = new Date().toISOString();

  if (/No sources configured/i.test(output)) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Source") && !line.startsWith("-"))
    .map((line) => line.split(/\s{2,}/))
    .filter((parts) => parts.length >= 3)
    .map(([id, version, status]) => ({
      id,
      name: labelSource(id),
      status: normalizeStatus(status),
      description: `Coral ${id} source (${version}).`,
      tables: 0,
      lastChecked: now
    }));
}

function normalizeStatus(status: string): SourceStatus {
  const normalized = status.toLowerCase();

  if (normalized.includes("not installed")) return "not_installed";
  if (normalized.includes("installed")) return "installed";
  if (normalized.includes("credential")) return "missing_credentials";
  if (normalized.includes("available")) return "available";
  return "unhealthy";
}

function labelSource(name: string): string {
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseSourceInfo(output: string, requestedName: string): SourceInfo {
  const lines = output.split("\n");
  const id = lines[0]?.trim() || requestedName;
  const fields = new Map<string, string>();
  const inputs: SourceInput[] = [];
  let description = "";
  let currentInput: SourceInput | undefined;
  let section: "header" | "inputs" = "header";

  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (trimmed === "Inputs") {
      section = "inputs";
      continue;
    }

    if (section === "header") {
      const field = trimmed.match(/^([A-Za-z]+):\s+(.*)$/);
      if (field) {
        fields.set(field[1].toLowerCase(), field[2].trim());
      }
      continue;
    }

    const inputMatch = trimmed.match(/^([A-Z0-9_]+)\s+\((secret|variable),\s+(required|optional)\)$/i);
    if (inputMatch) {
      currentInput = {
        key: inputMatch[1],
        kind: inputMatch[2].toLowerCase() === "secret" ? "secret" : "variable",
        required: inputMatch[3].toLowerCase() === "required",
        description: ""
      };
      inputs.push(currentInput);
      continue;
    }

    if (currentInput && trimmed.startsWith("default:")) {
      currentInput.defaultValue = trimmed.replace(/^default:\s*/, "");
      continue;
    }

    if (currentInput) {
      currentInput.description = `${currentInput.description}${currentInput.description ? "\n" : ""}${trimmed}`;
    }
  }

  description = fields.get("description") ?? "";

  return {
    id,
    name: labelSource(id),
    status: normalizeStatus(fields.get("status") ?? "unhealthy"),
    origin: fields.get("origin") ?? "",
    version: fields.get("version") ?? "",
    description,
    inputs
  };
}

function sourceEnv(inputs: Record<string, string>, allowedKeys?: string[]): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const allowed = allowedKeys ? new Set(allowedKeys) : undefined;

  for (const [key, value] of Object.entries(inputs)) {
    if (!isSafeInputKey(key) || deniedInputEnvKeys.has(key) || key.startsWith("CORAL_") || key.startsWith("npm_")) {
      throw new Error(`Rejected unsafe source input key: ${key}`);
    }

    if (allowed && !allowed.has(key)) {
      throw new Error(`Rejected unexpected input for this source: ${key}`);
    }

    if (value) {
      env[key] = value;
    }
  }

  return env;
}

function isSafeInputKey(key: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(key);
}

function cleanMessage(value: string): string {
  return stripSecrets(value).trim() || "Coral command completed.";
}

function tableKey(schema: string, table: string) {
  return `${schema}.${table}`;
}

function cleanError(error: unknown): string {
  const stderr = stderrFrom(error);
  const message = error instanceof Error ? error.message : String(error);
  return stripSecrets(stderr || message).trim() || "Coral command failed.";
}

function stderrFrom(error: unknown): string {
  if (typeof error === "object" && error && "stderr" in error) {
    return String((error as { stderr?: unknown }).stderr ?? "");
  }

  return "";
}

function stripSecrets(value: string): string {
  return value
    .replace(/([A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD)[A-Z0-9_]*=)[^\s]+/gi, "$1[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]");
}

export const coralGateway = new CliCoralGateway();
