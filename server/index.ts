import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  ChatRequest,
  HealthResponse,
  InstallSourceRequest,
  MetricInvestigation,
  ReportDryRunResponse,
  Schedule
} from "../shared/types";
import { CoralQueryError, CoralUnavailableError, coralGateway } from "./lib/coral";
import { answerQuestion, NaturalLanguageUnavailableError } from "./lib/queryEngine";
import {
  appendChatRun,
  createSavedQuestion,
  createSchedule,
  getSavedQuestion,
  getSchedule,
  listMetrics,
  listSavedQuestions,
  listSchedules,
  listThreads
} from "./lib/store";
import { validateReadOnlySql } from "./lib/sqlSafety";

export const app = express();
const port = Number(process.env.PORT ?? 8787);
const allowedOrigins = buildAllowedOrigins(port);

app.use(rejectUnexpectedOrigin);
app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin) ? origin ?? false : false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600
  })
);
app.use(express.json({ limit: "1mb" }));

const chatSchema = z.object({
  message: z.string().min(1),
  threadId: z.string().optional(),
  privacyMode: z.enum(["catalog_only", "summaries", "sampled_rows", "local_full"]).optional(),
  forceRefresh: z.boolean().optional()
});

const savedQuestionSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1)
});

const scheduleSchema = z.object({
  savedQuestionId: z.string().min(1),
  frequency: z.enum(["hourly", "daily", "weekly", "monthly"]),
  destination: z.enum(["email", "webhook"]),
  recipient: z.string().min(1)
});

const installSourceSchema = z.object({
  inputs: z.record(z.string(), z.string())
});

app.get("/api/health", async (_req, res) => {
  const coral = await coralGateway.probe();
  const response: HealthResponse = {
    app: "ok",
    coral
  };
  res.json(response);
});

app.get("/api/sources", async (_req, res) => {
  try {
    res.json(await coralGateway.listSources());
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get("/api/sources/:name", async (req, res) => {
  try {
    res.json(await coralGateway.getSourceInfo(req.params.name));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post("/api/sources/:name/install", async (req, res) => {
  const parsed = installSourceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid source install request.", details: parsed.error.flatten() });
    return;
  }

  try {
    const request = parsed.data satisfies InstallSourceRequest;
    const result = await coralGateway.installSource(req.params.name, request.inputs);
    res.status(result.ok ? 200 : 422).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post("/api/sources/:name/test", async (req, res) => {
  try {
    const result = await coralGateway.testSource(req.params.name);
    res.status(result.ok ? 200 : 422).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get("/api/catalog", async (_req, res) => {
  try {
    res.json(await coralGateway.listCatalog());
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get("/api/threads", async (_req, res) => {
  res.json(await listThreads());
});

app.post("/api/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid chat request.", details: parsed.error.flatten() });
    return;
  }

  try {
    const request = parsed.data satisfies ChatRequest;
    const run = await answerQuestion({
      message: request.message,
      threadId: request.threadId ?? randomUUID(),
      privacyMode: request.privacyMode ?? "summaries"
    });

    await appendChatRun(run);
    res.json(run);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post("/api/sql/validate", (req, res) => {
  const sql = String(req.body?.sql ?? "");
  res.json(validateReadOnlySql(sql));
});

app.get("/api/saved-questions", async (_req, res) => {
  res.json(await listSavedQuestions());
});

app.post("/api/saved-questions", async (req, res) => {
  const parsed = savedQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid saved question.", details: parsed.error.flatten() });
    return;
  }
  res.status(201).json(await createSavedQuestion(parsed.data));
});

app.get("/api/schedules", async (_req, res) => {
  res.json(await listSchedules());
});

app.post("/api/schedules", async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid schedule.", details: parsed.error.flatten() });
    return;
  }
  res.status(201).json(await createSchedule(parsed.data as Omit<Schedule, "id" | "nextRun" | "active">));
});

app.post("/api/schedules/:id/dry-run", async (req, res) => {
  const schedule = await getSchedule(req.params.id);

  if (!schedule) {
    res.status(404).json({ error: "Schedule not found." });
    return;
  }

  const savedQuestion = await getSavedQuestion(schedule.savedQuestionId);

  if (!savedQuestion) {
    res.status(404).json({ error: "Saved question not found." });
    return;
  }

  try {
    const report = await answerQuestion({
      message: savedQuestion.prompt,
      threadId: randomUUID(),
      privacyMode: "summaries"
    });
    const response: ReportDryRunResponse = {
      schedule,
      savedQuestion,
      report,
      delivery: {
        attempted: false,
        skippedReason: "Dry run renders the saved report payload without sending email or webhook delivery."
      }
    };
    res.json(response);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.get("/api/metrics", async (_req, res) => {
  res.json(await listMetrics());
});

app.post("/api/metrics/:id/investigate", async (req, res) => {
  const metrics = await listMetrics();
  const metric = metrics.find((candidate) => candidate.id === req.params.id);

  if (!metric) {
    res.status(404).json({ error: "Metric not found." });
    return;
  }

  const safety = validateReadOnlySql(metric.sql);
  if (!safety.safe) {
    res.status(422).json({ error: safety.reason });
    return;
  }

  try {
    const result = await coralGateway.executeSql(metric.sql);
    const investigation: MetricInvestigation = {
      metric,
      summary: `Coral returned ${result.rows.length} rows for ${metric.name}.`,
      headline: result.rows[0] ?? { metric: metric.name, rows: result.rows.length },
      trend: result.rows,
      breakdowns: [
        {
          title: metric.name,
          sql: metric.sql,
          rows: result.rows
        }
      ]
    };
    res.json(investigation);
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post("/api/source-specs/lint", async (req, res) => {
  const yaml = String(req.body?.yaml ?? "");
  try {
    res.json(await coralGateway.lintSourceSpec(yaml));
  } catch (error) {
    sendApiError(res, error);
  }
});

app.post("/api/source-specs/install", async (req, res) => {
  const yaml = String(req.body?.yaml ?? "");
  const inputs = typeof req.body?.inputs === "object" && req.body.inputs ? req.body.inputs as Record<string, string> : {};
  try {
    const result = await coralGateway.installCustomSource(yaml, inputs);
    res.status(result.ok ? 200 : 422).json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, "127.0.0.1", () => {
    console.log(`AnyQuery API listening on http://127.0.0.1:${port}`);
  });
}

function sendApiError(res: express.Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "Request failed.";

  if (error instanceof CoralUnavailableError) {
    res.status(503).json({ error: message });
    return;
  }

  if (error instanceof NaturalLanguageUnavailableError) {
    res.status(422).json({ error: message });
    return;
  }

  if (error instanceof CoralQueryError) {
    res.status(422).json({ error: message });
    return;
  }

  res.status(500).json({ error: message });
}

function rejectUnexpectedOrigin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const origin = req.get("origin");

  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json({ error: "Origin is not allowed for this local Coral workspace." });
    return;
  }

  next();
}

function buildAllowedOrigins(apiPort: number): Set<string> {
  const configured = (process.env.ANYQUERY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const defaults = [
    `http://127.0.0.1:${apiPort}`,
    `http://localhost:${apiPort}`,
    "http://127.0.0.1:5173",
    "http://localhost:5173"
  ];

  return new Set([...defaults, ...configured]);
}
