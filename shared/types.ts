export type Primitive = string | number | boolean | null;

export type DataRow = Record<string, Primitive>;

export type SourceStatus = "available" | "installed" | "unhealthy" | "missing_credentials" | "not_installed";

export type PrivacyMode = "catalog_only" | "summaries" | "sampled_rows" | "local_full";

export type ChartType = "bar" | "line" | "donut";

export interface SourceSummary {
  id: string;
  name: string;
  status: SourceStatus;
  description: string;
  tables: number;
  lastChecked: string;
}

export interface SourceInput {
  key: string;
  kind: "secret" | "variable";
  required: boolean;
  defaultValue?: string;
  description: string;
}

export interface SourceInfo {
  id: string;
  name: string;
  status: SourceStatus;
  origin: string;
  version: string;
  description: string;
  inputs: SourceInput[];
}

export interface SourceActionResult {
  ok: boolean;
  message: string;
}

export interface InstallSourceRequest {
  inputs: Record<string, string>;
}

export interface CatalogColumn {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
}

export interface CatalogTable {
  schema: string;
  name: string;
  description: string;
  columns: CatalogColumn[];
}

export interface ChartSpec {
  type: ChartType;
  xKey: string;
  yKey: string;
  seriesKey?: string;
  reason: string;
}

export interface QueryProvenance {
  sources: string[];
  rowCount: number;
  executionMs: number;
  cache: "live" | "cached";
  generatedAt: string;
  privacyMode: PrivacyMode;
}

export interface ChatRequest {
  message: string;
  threadId?: string;
  privacyMode?: PrivacyMode;
  forceRefresh?: boolean;
}

export interface ChatResponse {
  id: string;
  threadId: string;
  question: string;
  answer: string;
  sql: string;
  rows: DataRow[];
  columns: string[];
  chart?: ChartSpec;
  provenance: QueryProvenance;
  progress: string[];
  warnings: string[];
}

export interface SqlExecutionResult {
  rows: DataRow[];
  columns: string[];
  executionMs: number;
}

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  run?: ChatResponse;
}

export interface Thread {
  id: string;
  title: string;
  messages: ThreadMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedQuestion {
  id: string;
  title: string;
  prompt: string;
  createdAt: string;
}

export interface Schedule {
  id: string;
  savedQuestionId: string;
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  destination: "email" | "webhook";
  recipient: string;
  nextRun: string;
  active: boolean;
}

export interface ReportDryRunResponse {
  schedule: Schedule;
  savedQuestion: SavedQuestion;
  report: ChatResponse;
  delivery: {
    attempted: false;
    skippedReason: string;
  };
}

export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  sql: string;
  dimensions: string[];
}

export interface MetricInvestigation {
  metric: MetricDefinition;
  summary: string;
  headline: DataRow;
  trend: DataRow[];
  breakdowns: Array<{
    title: string;
    sql: string;
    rows: DataRow[];
    chart?: ChartSpec;
  }>;
}

export interface AppState {
  threads: Thread[];
  savedQuestions: SavedQuestion[];
  schedules: Schedule[];
  metrics: MetricDefinition[];
}

export interface HealthResponse {
  app: "ok";
  coral: {
    available: boolean;
    version?: string;
    mode: "coral" | "missing";
    message: string;
  };
}
