import type {
  CatalogTable,
  ChatRequest,
  ChatResponse,
  HealthResponse,
  MetricDefinition,
  MetricInvestigation,
  SavedQuestion,
  Schedule,
  SourceActionResult,
  SourceInfo,
  SourceSummary,
  Thread
} from "../../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  sources: () => request<SourceSummary[]>("/api/sources"),
  sourceInfo: (name: string) => request<SourceInfo>(`/api/sources/${encodeURIComponent(name)}`),
  installSource: (name: string, inputs: Record<string, string>) =>
    request<SourceActionResult>(`/api/sources/${encodeURIComponent(name)}/install`, {
      method: "POST",
      body: JSON.stringify({ inputs })
    }),
  testSource: (name: string) =>
    request<SourceActionResult>(`/api/sources/${encodeURIComponent(name)}/test`, {
      method: "POST"
    }),
  lintSourceSpec: (yaml: string) =>
    request<SourceActionResult>("/api/source-specs/lint", {
      method: "POST",
      body: JSON.stringify({ yaml })
    }),
  installSourceSpec: (yaml: string, inputs: Record<string, string>) =>
    request<SourceActionResult>("/api/source-specs/install", {
      method: "POST",
      body: JSON.stringify({ yaml, inputs })
    }),
  catalog: () => request<CatalogTable[]>("/api/catalog"),
  threads: () => request<Thread[]>("/api/threads"),
  chat: (body: ChatRequest) =>
    request<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  savedQuestions: () => request<SavedQuestion[]>("/api/saved-questions"),
  saveQuestion: (body: Pick<SavedQuestion, "title" | "prompt">) =>
    request<SavedQuestion>("/api/saved-questions", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  schedules: () => request<Schedule[]>("/api/schedules"),
  createSchedule: (body: Pick<Schedule, "savedQuestionId" | "frequency" | "destination" | "recipient">) =>
    request<Schedule>("/api/schedules", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  metrics: () => request<MetricDefinition[]>("/api/metrics"),
  investigateMetric: (id: string) =>
    request<MetricInvestigation>(`/api/metrics/${id}/investigate`, {
      method: "POST"
    })
};
