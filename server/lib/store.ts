import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AppState,
  ChatResponse,
  MetricDefinition,
  SavedQuestion,
  Schedule,
  Thread,
  ThreadMessage
} from "../../shared/types";

const statePath = path.resolve(process.env.APP_STATE_PATH ?? path.join(process.cwd(), "data/app-state.json"));

const emptyState: AppState = {
  threads: [],
  savedQuestions: [],
  schedules: [],
  metrics: []
};

export async function readState(): Promise<AppState> {
  try {
    const raw = await readFile(statePath, "utf8");
    return { ...emptyState, ...JSON.parse(raw) };
  } catch {
    return emptyState;
  }
}

export async function writeState(state: AppState): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(statePath, 0o600);
}

export async function listThreads(): Promise<Thread[]> {
  const state = await readState();
  return state.threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function appendChatRun(run: ChatResponse): Promise<Thread> {
  const state = await readState();
  const now = new Date().toISOString();
  let thread = state.threads.find((candidate) => candidate.id === run.threadId);

  if (!thread) {
    thread = {
      id: run.threadId,
      title: titleFromPrompt(run.question),
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    state.threads.push(thread);
  }

  const userMessage: ThreadMessage = {
    id: randomUUID(),
    role: "user",
    content: run.question,
    createdAt: now
  };

  const assistantMessage: ThreadMessage = {
    id: run.id,
    role: "assistant",
    content: run.answer,
    createdAt: now,
    run: sanitizeRunForPersistence(run)
  };

  thread.messages.push(userMessage, assistantMessage);
  thread.updatedAt = now;
  await writeState(state);
  return thread;
}

export async function listSavedQuestions(): Promise<SavedQuestion[]> {
  const state = await readState();
  return state.savedQuestions;
}

export async function getSavedQuestion(id: string): Promise<SavedQuestion | undefined> {
  const state = await readState();
  return state.savedQuestions.find((savedQuestion) => savedQuestion.id === id);
}

export async function createSavedQuestion(input: Pick<SavedQuestion, "title" | "prompt">): Promise<SavedQuestion> {
  const state = await readState();
  const saved: SavedQuestion = {
    id: randomUUID(),
    title: input.title,
    prompt: input.prompt,
    createdAt: new Date().toISOString()
  };
  state.savedQuestions.unshift(saved);
  await writeState(state);
  return saved;
}

export async function listSchedules(): Promise<Schedule[]> {
  const state = await readState();
  return state.schedules;
}

export async function getSchedule(id: string): Promise<Schedule | undefined> {
  const state = await readState();
  return state.schedules.find((schedule) => schedule.id === id);
}

export async function createSchedule(input: Omit<Schedule, "id" | "nextRun" | "active">): Promise<Schedule> {
  const state = await readState();
  const schedule: Schedule = {
    ...input,
    id: randomUUID(),
    nextRun: nextRunFor(input.frequency).toISOString(),
    active: true
  };
  state.schedules.unshift(schedule);
  await writeState(state);
  return schedule;
}

export async function listMetrics(): Promise<MetricDefinition[]> {
  const state = await readState();
  return state.metrics;
}

function titleFromPrompt(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}...` : trimmed || "Untitled thread";
}

function nextRunFor(frequency: Schedule["frequency"]): Date {
  const date = new Date();
  const hours = frequency === "hourly" ? 1 : frequency === "daily" ? 24 : frequency === "weekly" ? 24 * 7 : 24 * 30;
  date.setHours(date.getHours() + hours);
  return date;
}

function sanitizeRunForPersistence(run: ChatResponse): ChatResponse {
  if (run.provenance.privacyMode === "local_full") {
    return run;
  }

  return {
    ...run,
    rows: [],
    warnings: [...run.warnings, "Result rows were not persisted because the run did not use local_full privacy mode."]
  };
}
