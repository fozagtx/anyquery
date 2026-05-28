import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CalendarClock,
  Clipboard,
  Database,
  KeyRound,
  LineChart,
  Loader2,
  RefreshCcw,
  Save,
  Send,
  ShieldCheck,
  Table2,
  Terminal
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as ReLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { api } from "./lib/api";
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
  SourceStatus,
  SourceSummary,
  Thread
} from "../shared/types";

const sqlExamples = [
  {
    label: "Show tables",
    description: "See what Coral exposes right now.",
    sql: "SHOW TABLES"
  },
  {
    label: "List catalog",
    description: "Inspect schemas and table types.",
    sql: "SELECT table_schema, table_name, table_type FROM information_schema.tables ORDER BY table_schema, table_name LIMIT 50"
  },
  {
    label: "Count by schema",
    description: "Check source coverage without reading rows.",
    sql: "SELECT table_schema, COUNT(*) AS tables FROM information_schema.tables GROUP BY table_schema ORDER BY table_schema"
  },
  {
    label: "Required inputs",
    description: "Review Coral source input metadata.",
    sql: "SELECT * FROM coral.inputs LIMIT 20"
  }
];

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

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  const currentThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? threads[0],
    [activeThreadId, threads]
  );
  const installedSourceCount = useMemo(
    () => sources.filter((source) => source.status === "installed").length,
    [sources]
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
      <aside className="sidebar" aria-label="Workspace">
        <div className="brand">
          <div className="brand-mark">AQ</div>
          <div>
            <h1>AnyQuery</h1>
            <p>{health?.coral.mode === "coral" ? "Coral live" : "Coral required"}</p>
          </div>
        </div>

        <section className="panel compact">
          <div className="panel-title">
            <Activity size={16} />
            <span>Threads</span>
          </div>
          <div className="thread-list">
            {threads.length === 0 ? <span className="muted">No threads yet</span> : null}
            {threads.slice(0, 6).map((thread) => (
              <button
                className={thread.id === currentThread?.id ? "thread active" : "thread"}
                key={thread.id}
                onClick={() => setActiveThreadId(thread.id)}
              >
                <span>{thread.title}</span>
                <small>{thread.messages.length} messages</small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel compact">
          <div className="panel-title">
            <Save size={16} />
            <span>Saved</span>
          </div>
          {savedQuestions.slice(0, 4).map((saved) => (
            <button className="saved-item" key={saved.id} onClick={() => void submitPrompt(saved.prompt, true)}>
              {saved.title}
            </button>
          ))}
        </section>

        <section className="panel compact">
          <div className="panel-title">
            <CalendarClock size={16} />
            <span>Reports</span>
          </div>
          {schedules.slice(0, 3).map((schedule) => (
            <div className="report-item" key={schedule.id}>
              <strong>{schedule.frequency}</strong>
              <span>{schedule.destination}</span>
            </div>
          ))}
          <button className="secondary-button" onClick={() => void scheduleFirstSavedQuestion()}>
            Add weekly
          </button>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Coral-native data assistant</p>
            <h2>{currentThread?.title ?? "Ask across connected sources"}</h2>
            <p className="topbar-copy">Run read-only SQL through real Coral. Natural-language SQL generation requires OPENAI_API_KEY.</p>
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
              NL needs key
            </span>
          </div>
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
            <FirstRunEmptyState
              health={health}
              installedSourceCount={installedSourceCount}
              catalogCount={catalog.length}
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
              <p>These run directly with Coral. Plain-language questions work only when the API server has OPENAI_API_KEY.</p>
            </div>
            <Terminal size={18} aria-hidden="true" />
          </div>
          <div className="chips sql-examples">
            {sqlExamples.map((example) => (
              <button key={example.sql} type="button" onClick={() => void submitPrompt(example.sql)}>
                <span>{example.label}</span>
                <small>{example.description}</small>
                <code>{example.sql}</code>
              </button>
            ))}
          </div>
          <div className="composer-row">
            <label className="sr-only" htmlFor="query-composer">
              SQL query or natural-language prompt
            </label>
            <textarea
              id="query-composer"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitPrompt();
                }
              }}
              placeholder="Paste SELECT/WITH SQL. Natural-language prompts require OPENAI_API_KEY."
              spellCheck={false}
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
              <button
                className="primary-button"
                type="button"
                aria-label="Run query"
                onClick={() => void submitPrompt()}
                disabled={loading}
              >
                {loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              </button>
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

function FirstRunEmptyState({
  health,
  installedSourceCount,
  catalogCount,
  onRunExample
}: {
  health: HealthResponse | null;
  installedSourceCount: number;
  catalogCount: number;
  onRunExample: (sql: string) => void;
}) {
  const coralReady = health?.coral.mode === "coral";
  const hasConfiguredSources = installedSourceCount > 0;
  const title = !health
    ? "Checking Coral"
    : !coralReady
      ? "Coral CLI is required"
      : hasConfiguredSources
        ? "Ask Coral with SQL"
        : "No Coral sources configured yet";
  const description = !health
    ? "The app is checking the local Coral CLI before it can run a query."
    : !coralReady
      ? "Install Coral and make sure the coral command is on PATH. AnyQuery requires real Coral source data."
      : hasConfiguredSources
        ? "Use an example or write read-only SQL against the live catalog. Natural language requires OPENAI_API_KEY."
        : "Start with Coral metadata SQL, then install a bundled source or custom source spec in the Sources panel.";

  return (
    <div className="empty-state">
      <div className="empty-icon">
        <LineChart size={30} aria-hidden="true" />
      </div>
      <div className="empty-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="empty-facts">
        <span>{installedSourceCount} installed sources</span>
        <span>{catalogCount} catalog tables</span>
        <span>SQL first</span>
      </div>
      <div className="empty-examples" aria-label="Runnable SQL examples">
        {sqlExamples.slice(0, 3).map((example) => (
          <button
            key={example.sql}
            type="button"
            disabled={!coralReady}
            onClick={() => onRunExample(example.sql)}
          >
            <span>{example.label}</span>
            <code>{example.sql}</code>
          </button>
        ))}
      </div>
    </div>
  );
}

function QueryErrorBanner({ message }: { message: string }) {
  const isModelKeyError = message.includes("OPENAI_API_KEY");

  return (
    <div className="error-banner" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>{isModelKeyError ? "Natural language needs OPENAI_API_KEY" : "Query did not run"}</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

function ProgressSteps() {
  const steps = ["Discovering catalog", "Writing SQL", "Validating safety", "Running Coral", "Summarizing"];
  return (
    <div className="progress-steps">
      {steps.map((step) => (
        <span key={step}>
          <Loader2 className="spin" size={14} />
          {step}
        </span>
      ))}
    </div>
  );
}

function AnswerView({
  run,
  onRefresh,
  onSave
}: {
  run: ChatResponse;
  onRefresh: () => void;
  onSave: () => void;
}) {
  return (
    <article className="answer-card">
      <div className="answer-header">
        <div>
          <p className="eyebrow">Answer</p>
          <h3>{run.answer}</h3>
        </div>
        <div className="icon-row">
          <button type="button" title="Refresh" aria-label="Refresh answer" onClick={onRefresh}>
            <RefreshCcw size={17} />
          </button>
          <button type="button" title="Save" aria-label="Save question" onClick={onSave}>
            <Save size={17} />
          </button>
        </div>
      </div>

      <div className="provenance">
        <span>{run.provenance.cache}</span>
        <span>{run.provenance.rowCount} rows</span>
        <span>{run.provenance.executionMs} ms</span>
        <span>{run.provenance.sources.join(", ")}</span>
      </div>

      <SqlPanel sql={run.sql} />
      <ResultTable run={run} />
      {run.chart ? <ResultChart run={run} /> : null}
    </article>
  );
}

function SqlPanel({ sql }: { sql: string }) {
  async function copySql() {
    await navigator.clipboard?.writeText(sql);
  }

  return (
    <section className="sql-panel">
      <div className="section-title">
        <Table2 size={16} />
        <span>SQL</span>
        <button type="button" title="Copy SQL" aria-label="Copy SQL" onClick={() => void copySql()}>
          <Clipboard size={15} />
        </button>
      </div>
      <pre>{sql}</pre>
    </section>
  );
}

function ResultTable({ run }: { run: ChatResponse }) {
  return (
    <section className="result-table-wrap">
      <table className="result-table">
        <thead>
          <tr>
            {run.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {run.rows.map((row, index) => (
            <tr key={index}>
              {run.columns.map((column) => (
                <td key={column}>{String(row[column] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ResultChart({ run }: { run: ChatResponse }) {
  const chart = run.chart;
  if (!chart) return null;

  return (
    <section className="chart-panel">
      <div className="section-title">
        <LineChart size={16} />
        <span>{chart.type} chart</span>
      </div>
      <div className="chart-frame">
        <ResponsiveContainer width="100%" height={240}>
          {chart.type === "line" ? (
            <ReLineChart data={run.rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={chart.xKey} />
              <YAxis />
              <Tooltip />
              <Line dataKey={chart.yKey} stroke="#0f766e" strokeWidth={3} dot={{ r: 3 }} />
            </ReLineChart>
          ) : chart.type === "donut" ? (
            <PieChart>
              <Tooltip />
              <Pie data={run.rows} dataKey={chart.yKey} nameKey={chart.xKey} innerRadius={58} outerRadius={92}>
                {run.rows.map((_row, index) => (
                  <Cell key={index} fill={["#0f766e", "#2563eb", "#b7791f", "#697477"][index % 4]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={run.rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={chart.xKey} />
              <YAxis />
              <Tooltip />
              <Bar dataKey={chart.yKey} fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <p className="muted">{chart.reason}</p>
    </section>
  );
}

function SourceInspector({
  coral,
  sources,
  catalog,
  selectedSource,
  sourceInputs,
  sourceAction,
  sourceLoading,
  onSelectSource,
  onInputChange,
  onInstall,
  onTest,
  customSourceYaml,
  customSourceAction,
  customSourceLoading,
  onCustomSourceChange,
  onLintCustomSource,
  onInstallCustomSource
}: {
  coral?: HealthResponse["coral"];
  sources: SourceSummary[];
  catalog: CatalogTable[];
  selectedSource: SourceInfo | null;
  sourceInputs: Record<string, string>;
  sourceAction: SourceActionResult | null;
  sourceLoading: boolean;
  onSelectSource: (name: string) => void;
  onInputChange: (key: string, value: string) => void;
  onInstall: () => void;
  onTest: () => void;
  customSourceYaml: string;
  customSourceAction: SourceActionResult | null;
  customSourceLoading: boolean;
  onCustomSourceChange: (value: string) => void;
  onLintCustomSource: () => void;
  onInstallCustomSource: () => void;
}) {
  const installedSources = sources.filter((source) => source.status === "installed");
  const installableSources = sources.filter((source) => source.status !== "installed");
  const coralReady = coral?.mode === "coral";
  const hasConfiguredSources = installedSources.length > 0;

  return (
    <section className="panel">
      <div className="panel-title">
        <Database size={16} />
        <span>Sources</span>
      </div>
      <div className={hasConfiguredSources ? "source-summary configured" : "source-summary needs-setup"}>
        <strong>{sourceSummaryTitle(coralReady, hasConfiguredSources, sources.length)}</strong>
        <p>{sourceSummaryCopy(coralReady, hasConfiguredSources, sources.length)}</p>
        <div className="source-counts" aria-label="Source counts">
          <span>{installedSources.length} installed</span>
          <span>{installableSources.length} available</span>
        </div>
      </div>
      <div className="source-list">
        {sources.length === 0 ? (
          <div className="source-empty-callout">
            <strong>{coralReady ? "No sources returned by Coral" : "Coral is not connected"}</strong>
            <p>
              {coralReady
                ? "Use a real custom source spec below, or check the Coral CLI output with coral source discover."
                : "Source discovery and installation are disabled until the local Coral CLI is available."}
            </p>
          </div>
        ) : null}
        {sources.map((source) => (
          <button
            className={selectedSource?.id === source.id ? "source-card selected" : "source-card"}
            key={source.id}
            type="button"
            onClick={() => onSelectSource(source.id)}
          >
            <div>
              <strong>{source.name}</strong>
              <span>{source.description}</span>
              <em>{sourceStatusDescription(source.status)}</em>
            </div>
            <small className={`source-status ${sourceStatusTone(source.status)}`}>{sourceStatusLabel(source.status)}</small>
          </button>
        ))}
      </div>
      {selectedSource ? (
        <div className="source-setup" aria-busy={sourceLoading}>
          <div className="setup-header">
            <div>
              <strong>{selectedSource.name}</strong>
              <span className={`source-status ${sourceStatusTone(selectedSource.status)}`}>
                {sourceStatusLabel(selectedSource.status)}
              </span>
            </div>
            <button type="button" disabled={sourceLoading || selectedSource.status !== "installed"} onClick={onTest}>
              {sourceLoading ? "Testing..." : "Test"}
            </button>
          </div>
          <p>{selectedSource.description}</p>
          <p className="source-status-note">{sourceStatusDescription(selectedSource.status)}</p>
          {selectedSource.inputs.map((input) => (
            <label className="source-input" key={input.key}>
              <span>
                {input.key}
                {input.required ? " *" : ""}
              </span>
              <input
                type={input.kind === "secret" ? "password" : "text"}
                value={sourceInputs[input.key] ?? ""}
                onChange={(event) => onInputChange(input.key, event.target.value)}
                placeholder={input.defaultValue ?? input.kind}
                autoComplete="off"
                spellCheck={false}
              />
              {input.description ? <small>{input.description}</small> : null}
            </label>
          ))}
          <button className="secondary-button" type="button" disabled={sourceLoading} onClick={onInstall}>
            {sourceLoading ? "Working..." : "Install / update with Coral"}
          </button>
          {sourceAction ? (
            <div className={sourceAction.ok ? "action-message ok" : "action-message error"}>{sourceAction.message}</div>
          ) : null}
        </div>
      ) : null}
      <div className="catalog-list">
        <div className="catalog-heading">
          <strong>Live catalog preview</strong>
          <span>{catalog.length} tables from information_schema</span>
        </div>
        {catalog.length === 0 ? (
          <div className="catalog-empty">
            <strong>No catalog tables exposed yet</strong>
            <span>Run SHOW TABLES or install a Coral source. This list only shows real Coral catalog entries.</span>
          </div>
        ) : null}
        {catalog.slice(0, 6).map((table) => (
          <div className="catalog-item" key={`${table.schema}.${table.name}`}>
            <strong>
              {table.schema}.{table.name}
            </strong>
            <span>{table.columns.length} columns</span>
          </div>
        ))}
      </div>
      <div className="source-setup">
        <div className="setup-header">
          <div>
            <strong>Custom source spec</strong>
            <span>Runs real Coral lint/install</span>
          </div>
        </div>
        <p>Paste a real Coral source YAML spec. Lint and install call the local Coral CLI.</p>
        <textarea
          className="source-yaml"
          value={customSourceYaml}
          onChange={(event) => onCustomSourceChange(event.target.value)}
          placeholder="Paste Coral source YAML"
          spellCheck={false}
        />
        <div className="button-row">
          <button className="secondary-button" type="button" disabled={customSourceLoading} onClick={onLintCustomSource}>
            Lint
          </button>
          <button className="secondary-button" type="button" disabled={customSourceLoading} onClick={onInstallCustomSource}>
            Install
          </button>
        </div>
        {customSourceAction ? (
          <div className={customSourceAction.ok ? "action-message ok" : "action-message error"}>
            {customSourceAction.message}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MetricPanel({
  metrics,
  onInvestigate
}: {
  metrics: MetricDefinition[];
  onInvestigate: (id: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <Activity size={16} />
        <span>Metrics</span>
      </div>
      {metrics.map((metric) => (
        <div className="metric-card" key={metric.id}>
          <strong>{metric.name}</strong>
          <span>{metric.description}</span>
          <button type="button" onClick={() => onInvestigate(metric.id)}>Investigate</button>
        </div>
      ))}
    </section>
  );
}

function InvestigationView({ investigation }: { investigation: MetricInvestigation }) {
  return (
    <article className="answer-card">
      <div className="answer-header">
        <div>
          <p className="eyebrow">Investigation</p>
          <h3>{investigation.metric.name}</h3>
          <p>{investigation.summary}</p>
        </div>
      </div>
      <div className="provenance">
        {Object.entries(investigation.headline).map(([key, value]) => (
          <span key={key}>
            {key}: {String(value)}
          </span>
        ))}
      </div>
      {investigation.breakdowns.map((breakdown) => (
        <section className="sql-panel" key={breakdown.title}>
          <div className="section-title">
            <Table2 size={16} />
            <span>{breakdown.title}</span>
          </div>
          <pre>{breakdown.sql}</pre>
        </section>
      ))}
    </article>
  );
}

function isSqlLike(message: string): boolean {
  const trimmed = message.trim();
  return /^(select|with)\b/i.test(trimmed) || /^show\s+(tables|columns|schemas)\b/i.test(trimmed);
}

function formatQueryError(error: unknown, message: string): string {
  const raw = error instanceof Error ? error.message : "Query failed";

  if (!isSqlLike(message) && raw === "Request failed: 422") {
    return "Natural-language SQL generation requires OPENAI_API_KEY. Enter a SELECT/WITH SQL query or restart the API server with OPENAI_API_KEY.";
  }

  return raw;
}

function sourceStatusLabel(status: SourceStatus): string {
  const labels: Record<SourceStatus, string> = {
    available: "Available",
    installed: "Installed",
    unhealthy: "Unhealthy",
    missing_credentials: "Needs credentials",
    not_installed: "Not installed"
  };
  return labels[status];
}

function sourceStatusTone(status: SourceStatus): string {
  if (status === "installed") return "success";
  if (status === "missing_credentials" || status === "not_installed" || status === "available") return "warn";
  return "danger";
}

function sourceStatusDescription(status: SourceStatus): string {
  const descriptions: Record<SourceStatus, string> = {
    available: "Available from Coral. Select it, provide required inputs, and install it before querying source tables.",
    installed: "Installed in Coral. Use Test to confirm connectivity before relying on query results.",
    unhealthy: "Coral reported a source problem. Test it or update the source configuration.",
    missing_credentials: "Coral needs credentials before this source can be installed or queried.",
    not_installed: "Not installed in Coral yet. Install it here with real source credentials."
  };
  return descriptions[status];
}

function sourceSummaryTitle(coralReady: boolean, hasConfiguredSources: boolean, sourceCount: number): string {
  if (!coralReady) return "Coral required for sources";
  if (hasConfiguredSources) return "Coral sources configured";
  if (sourceCount > 0) return "No sources configured";
  return "No sources discovered";
}

function sourceSummaryCopy(coralReady: boolean, hasConfiguredSources: boolean, sourceCount: number): string {
  if (!coralReady) {
    return "Install Coral and restart the app. Source discovery, install, test, and catalog views use real Coral only.";
  }
  if (hasConfiguredSources) {
    return "Installed sources can be queried through read-only SQL. Status and catalog data come from Coral.";
  }
  if (sourceCount > 0) {
    return "Coral is available, but no source is installed yet. You can still query metadata while installing a real source.";
  }
  return "Coral did not return bundled sources. Use a real custom source spec below or inspect the local Coral CLI.";
}
