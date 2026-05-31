import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Database,
  KeyRound,
  ShieldCheck,
  Table2,
  Terminal
} from "lucide-react";
import ActionSearchBar, { type ActionSearchAction } from "./components/kokonutui/action-search-bar";
import Toolbar from "./components/kokonutui/toolbar";
import { Sidebar } from "./components/Sidebar";
import { AnswerView, QueryErrorBanner, ProgressSteps } from "./components/AnswerView";
import { SourceInspector, MetricPanel, InvestigationView } from "./components/SourceInspector";
import { EmptyState } from "./components/EmptyState";
import { api } from "./lib/api";
import { getSuggestions } from "./lib/suggestions";
import type {
  CatalogTable,
  ChatResponse,
  HealthResponse,
  MetricDefinition,
  MetricInvestigation,
  PrivacyMode,
  SavedQuestion,
  Schedule,
  SourceActionResult,
  SourceInfo,
  SourceSummary,
  Thread
} from "../shared/types";

const privacyModes: Array<{ value: PrivacyMode; label: string }> = [
  { value: "summaries", label: "Summaries" },
  { value: "catalog_only", label: "Catalog" },
  { value: "sampled_rows", label: "Samples" },
  { value: "local_full", label: "Local full" }
];

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [catalog, setCatalog] = useState<CatalogTable[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [savedQuestions, setSavedQuestions] = useState<SavedQuestion[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [investigation, setInvestigation] = useState<MetricInvestigation | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceInfo | null>(null);
  const [sourceInputs, setSourceInputs] = useState<Record<string, string>>({});
  const [sourceAction, setSourceAction] = useState<SourceActionResult | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [customSourceYaml, setCustomSourceYaml] = useState("");
  const [customSourceAction, setCustomSourceAction] = useState<SourceActionResult | null>(null);
  const [customSourceLoading, setCustomSourceLoading] = useState(false);
  const [run, setRun] = useState<ChatResponse | null>(null);
  const [prompt, setPrompt] = useState("");
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>("summaries");
  const [loading, setLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("anyquery-theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("anyquery-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const currentThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? threads[0],
    [activeThreadId, threads]
  );
  const installedSourceCount = useMemo(
    () => sources.filter((source) => source.status === "installed").length,
    [sources]
  );
  const suggestions = useMemo(() => getSuggestions(sources), [sources]);
  const queryActions = useMemo<ActionSearchAction[]>(
    () =>
      suggestions.slice(0, 8).map((s) => ({
        id: s.label.toLowerCase().replace(/\s+/g, "-"),
        label: s.label,
        description: s.description,
        icon: <Table2 className="h-4 w-4" />,
        end: s.category === "cross-source" ? "JOIN" : "SQL",
        value: s.sql
      })),
    [suggestions]
  );

  async function refreshWorkspace() {
    const healthResponse = await api.health();
    setHealth(healthResponse);

    const [sourceResponse, catalogResponse, threadResponse, savedResponse, scheduleResponse, metricResponse] =
      await Promise.allSettled([
        api.sources(),
        api.catalog(),
        api.threads(),
        api.savedQuestions(),
        api.schedules(),
        api.metrics()
      ]);

    if (sourceResponse.status === "fulfilled") setSources(sourceResponse.value);
    if (catalogResponse.status === "fulfilled") setCatalog(catalogResponse.value);
    if (threadResponse.status === "fulfilled") {
      setThreads(threadResponse.value);
      setActiveThreadId((existing) => existing ?? threadResponse.value[0]?.id);
    }
    if (savedResponse.status === "fulfilled") setSavedQuestions(savedResponse.value);
    if (scheduleResponse.status === "fulfilled") setSchedules(scheduleResponse.value);
    if (metricResponse.status === "fulfilled") setMetrics(metricResponse.value);
  }

  async function submitPrompt(nextPrompt = prompt, forceRefresh = false) {
    const message = nextPrompt.trim();
    if (!message || loading) return;

    setLoading(true);
    setError(null);
    setPrompt("");
    setInvestigation(null);

    try {
      const response = await api.chat({
        message,
        threadId: activeThreadId,
        privacyMode,
        forceRefresh
      });
      setRun(response);
      setActiveThreadId(response.threadId);
      await refreshWorkspace();
    } catch (err) {
      setError(formatQueryError(err, message));
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrentQuestion() {
    if (!run) return;
    const saved = await api.saveQuestion({
      title: run.question,
      prompt: run.question
    });
    setSavedQuestions((items) => [saved, ...items]);
  }

  async function scheduleFirstSavedQuestion() {
    const saved = savedQuestions[0];
    if (!saved) return;

    const schedule = await api.createSchedule({
      savedQuestionId: saved.id,
      frequency: "weekly",
      destination: "email",
      recipient: "team@example.com"
    });
    setSchedules((items) => [schedule, ...items]);
  }

  async function investigate(id: string) {
    setInvestigation(await api.investigateMetric(id));
  }

  async function loadSource(name: string) {
    setSourceLoading(true);
    setSourceAction(null);

    try {
      const info = await api.sourceInfo(name);
      setSelectedSource(info);
      setSourceInputs(
        Object.fromEntries(info.inputs.map((input) => [input.key, input.defaultValue ?? ""]))
      );
    } catch (err) {
      setSourceAction({ ok: false, message: err instanceof Error ? err.message : "Failed to load source info." });
    } finally {
      setSourceLoading(false);
    }
  }

  async function installSelectedSource() {
    if (!selectedSource) return;
    setSourceLoading(true);
    setSourceAction(null);

    try {
      const result = await api.installSource(selectedSource.id, sourceInputs);
      setSourceAction(result);
      await refreshWorkspace();
      await loadSource(selectedSource.id);
    } catch (err) {
      setSourceAction({ ok: false, message: err instanceof Error ? err.message : "Install failed." });
    } finally {
      setSourceLoading(false);
    }
  }

  async function testSelectedSource() {
    if (!selectedSource) return;
    setSourceLoading(true);
    setSourceAction(null);

    try {
      const result = await api.testSource(selectedSource.id);
      setSourceAction(result);
    } catch (err) {
      setSourceAction({ ok: false, message: err instanceof Error ? err.message : "Source test failed." });
    } finally {
      setSourceLoading(false);
    }
  }

  async function lintCustomSource() {
    setCustomSourceLoading(true);
    setCustomSourceAction(null);

    try {
      setCustomSourceAction(await api.lintSourceSpec(customSourceYaml));
    } catch (err) {
      setCustomSourceAction({ ok: false, message: err instanceof Error ? err.message : "Source spec lint failed." });
    } finally {
      setCustomSourceLoading(false);
    }
  }

  async function installCustomSource() {
    setCustomSourceLoading(true);
    setCustomSourceAction(null);

    try {
      const result = await api.installSourceSpec(customSourceYaml, {});
      setCustomSourceAction(result);
      await refreshWorkspace();
    } catch (err) {
      setCustomSourceAction({ ok: false, message: err instanceof Error ? err.message : "Custom source install failed." });
    } finally {
      setCustomSourceLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <Sidebar
        threads={threads}
        currentThreadId={currentThread?.id}
        savedQuestions={savedQuestions}
        schedules={schedules}
        darkMode={darkMode}
        onSelectThread={setActiveThreadId}
        onRunSaved={(p) => void submitPrompt(p, true)}
        onSchedule={() => void scheduleFirstSavedQuestion()}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
      />

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Coral-native data assistant</p>
            <h2>{currentThread?.title ?? "Ask across connected sources"}</h2>
            <p className="topbar-copy">Run read-only SQL through real Coral. Natural-language SQL generation uses AIsa with AISA_API_KEY.</p>
          </div>
          <div className="status-pills">
            <span className={health?.coral.mode === "coral" ? "pill success" : "pill warn"}>
              <Database size={14} />
              {health?.coral.mode ?? "checking"}
            </span>
            <span className="pill">
              <ShieldCheck size={14} />
              {privacyModes.find((mode) => mode.value === privacyMode)?.label}
            </span>
            <span className="pill info">
              <KeyRound size={14} />
              AIsa SQL
            </span>
          </div>
          <Toolbar
            activeColor="text-teal-700"
            className="kokonut-toolbar"
            defaultSelected="query"
            items={[
              { id: "query", title: "Query", icon: Terminal },
              { id: "sources", title: "Sources", icon: Database },
              {
                id: "privacy",
                title: privacyModes.find((mode) => mode.value === privacyMode)?.label ?? "Privacy",
                icon: ShieldCheck
              },
              { id: "reports", title: "Reports", icon: CalendarClock }
            ]}
          />
        </header>

        <section className="chat-surface">
          {currentThread?.messages.length ? (
            currentThread.messages.slice(-6).map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="message-role">{message.role}</div>
                <p>{message.content}</p>
              </article>
            ))
          ) : (
            <EmptyState
              health={health}
              installedSourceCount={installedSourceCount}
              catalogCount={catalog.length}
              suggestions={suggestions}
              onRunExample={(sql) => void submitPrompt(sql)}
            />
          )}

          {loading ? <ProgressSteps /> : null}
          {error ? <QueryErrorBanner message={error} /> : null}

          {run ? (
            <AnswerView
              run={run}
              onRefresh={() => void submitPrompt(run.question, true)}
              onSave={() => void saveCurrentQuestion()}
            />
          ) : null}

          {investigation ? <InvestigationView investigation={investigation} /> : null}
        </section>

        <section className="composer">
          <div className="composer-guidance">
            <div>
              <strong>SQL examples</strong>
              <p>These run directly with Coral. Plain-language questions work only when the API server has AISA_API_KEY.</p>
            </div>
            <Terminal size={18} aria-hidden="true" />
          </div>
          <div className="composer-row">
            <ActionSearchBar
              actions={queryActions}
              disabled={loading}
              footer="Pick a Coral SQL example or press Enter to run"
              label="SQL query or AIsa prompt"
              onActionSelect={(action) => {
                if (action.value) {
                  void submitPrompt(action.value);
                }
              }}
              onChange={setPrompt}
              onSubmit={(value) => void submitPrompt(value)}
              placeholder="Paste SELECT/WITH SQL. Natural-language prompts require AISA_API_KEY."
              value={prompt}
            />
            <div className="composer-actions">
              <select
                aria-label="Privacy mode"
                value={privacyMode}
                onChange={(event) => setPrivacyMode(event.target.value as PrivacyMode)}
              >
                {privacyModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      </section>

      <aside className="inspector" aria-label="Inspector">
        <SourceInspector
          coral={health?.coral}
          sources={sources}
          catalog={catalog}
          selectedSource={selectedSource}
          sourceInputs={sourceInputs}
          sourceAction={sourceAction}
          sourceLoading={sourceLoading}
          onSelectSource={(name) => void loadSource(name)}
          onInputChange={(key, value) => setSourceInputs((inputs) => ({ ...inputs, [key]: value }))}
          onInstall={() => void installSelectedSource()}
          onTest={() => void testSelectedSource()}
          customSourceYaml={customSourceYaml}
          customSourceAction={customSourceAction}
          customSourceLoading={customSourceLoading}
          onCustomSourceChange={setCustomSourceYaml}
          onLintCustomSource={() => void lintCustomSource()}
          onInstallCustomSource={() => void installCustomSource()}
        />
        <MetricPanel metrics={metrics} onInvestigate={(id) => void investigate(id)} />
      </aside>
    </main>
  );
}

function isSqlLike(message: string): boolean {
  const trimmed = message.trim();
  return /^(select|with)\b/i.test(trimmed) || /^show\s+(tables|columns|schemas)\b/i.test(trimmed);
}

function formatQueryError(error: unknown, message: string): string {
  const raw = error instanceof Error ? error.message : "Query failed";

  if (!isSqlLike(message) && raw === "Request failed: 422") {
    return "Natural-language SQL generation requires AISA_API_KEY. Enter a SELECT/WITH SQL query or restart the API server with AISA_API_KEY.";
  }

  return raw;
}
