import { motion } from "motion/react";
import {
  Activity,
  Database,
  Table2
} from "lucide-react";
import type {
  CatalogTable,
  HealthResponse,
  MetricDefinition,
  MetricInvestigation,
  SourceActionResult,
  SourceInfo,
  SourceStatus,
  SourceSummary
} from "../../shared/types";

export function SourceInspector({
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
          <motion.button
            className={selectedSource?.id === source.id ? "source-card selected" : "source-card"}
            key={source.id}
            type="button"
            onClick={() => onSelectSource(source.id)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <div>
              <strong>{source.name}</strong>
              <span>{source.description}</span>
              <em>{sourceStatusDescription(source.status)}</em>
            </div>
            <small className={`source-status ${sourceStatusTone(source.status)}`}>{sourceStatusLabel(source.status)}</small>
          </motion.button>
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

export function MetricPanel({
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

export function InvestigationView({ investigation }: { investigation: MetricInvestigation }) {
  return (
    <motion.article
      className="answer-card"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38 }}
    >
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
    </motion.article>
  );
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
