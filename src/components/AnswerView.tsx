import { motion } from "motion/react";
import {
  AlertCircle,
  Clipboard,
  Check,
  Download,
  LineChart,
  Loader2,
  RefreshCcw,
  Save,
  Table2
} from "lucide-react";
import { useState } from "react";
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
import type { ChatResponse } from "../../shared/types";
import { JoinVisualizer } from "./JoinVisualizer";

const cardAnimation = {
  initial: { opacity: 0, y: 18, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.38, ease: "easeOut" as const }
};

const staggerChildren = {
  animate: { transition: { staggerChildren: 0.08 } }
};

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 }
};

export function AnswerView({
  run,
  onRefresh,
  onSave
}: {
  run: ChatResponse;
  onRefresh: () => void;
  onSave: () => void;
}) {
  return (
    <motion.article className="answer-card" {...cardAnimation}>
      <motion.div className="answer-header" {...staggerChildren}>
        <motion.div {...fadeUp}>
          <p className="eyebrow">Answer</p>
          <h3>{run.answer}</h3>
        </motion.div>
        <div className="icon-row">
          <button type="button" title="Refresh" aria-label="Refresh answer" onClick={onRefresh}>
            <RefreshCcw size={17} />
          </button>
          <button type="button" title="Save" aria-label="Save question" onClick={onSave}>
            <Save size={17} />
          </button>
        </div>
      </motion.div>

      <motion.div className="provenance" {...fadeUp}>
        <span>{run.provenance.cache}</span>
        <span>{run.provenance.rowCount} rows</span>
        <span>{run.provenance.executionMs} ms</span>
        <span>{run.provenance.sources.join(", ")}</span>
      </motion.div>

      {run.provenance.sources.length > 1 ? (
        <motion.div {...fadeUp}>
          <JoinVisualizer sql={run.sql} sources={run.provenance.sources} />
        </motion.div>
      ) : null}

      <SqlPanel sql={run.sql} />
      <ResultTable run={run} />
      {run.chart ? <ResultChart run={run} /> : null}
    </motion.article>
  );
}

function SqlPanel({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);

  async function copySql() {
    await navigator.clipboard?.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <motion.section className="sql-panel" {...fadeUp}>
      <div className="section-title">
        <Table2 size={16} />
        <span>SQL</span>
        <button type="button" title="Copy SQL" aria-label="Copy SQL" onClick={() => void copySql()}>
          {copied ? <Check size={15} className="text-success" /> : <Clipboard size={15} />}
        </button>
      </div>
      <pre>{sql}</pre>
    </motion.section>
  );
}

function ResultTable({ run }: { run: ChatResponse }) {
  function downloadCsv() {
    const header = run.columns.join(",");
    const rows = run.rows.map((row) =>
      run.columns.map((col) => {
        const val = String(row[col] ?? "");
        return val.includes(",") || val.includes('"') || val.includes("\n")
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "anyquery-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <motion.section className="result-table-wrap" {...fadeUp}>
      <div className="table-toolbar">
        <span className="table-row-count">{run.rows.length} rows</span>
        <button type="button" className="csv-export-btn" title="Export CSV" onClick={downloadCsv}>
          <Download size={14} />
          <span>CSV</span>
        </button>
      </div>
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
    </motion.section>
  );
}

const CHART_COLORS = ["#0f766e", "#6366f1", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16"];

function ResultChart({ run }: { run: ChatResponse }) {
  const chart = run.chart;
  if (!chart) return null;

  return (
    <motion.section className="chart-panel" {...fadeUp}>
      <div className="section-title">
        <LineChart size={16} />
        <span>{chart.type} chart</span>
      </div>
      <div className="chart-frame">
        <ResponsiveContainer width="100%" height={240}>
          {chart.type === "line" ? (
            <ReLineChart data={run.rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  fontSize: "12px"
                }}
              />
              <Line dataKey={chart.yKey} stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3, fill: "#0f766e" }} />
            </ReLineChart>
          ) : chart.type === "donut" ? (
            <PieChart>
              <Tooltip
                contentStyle={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  fontSize: "12px"
                }}
              />
              <Pie data={run.rows} dataKey={chart.yKey} nameKey={chart.xKey} innerRadius={58} outerRadius={92}>
                {run.rows.map((_row, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={run.rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  fontSize: "12px"
                }}
              />
              <Bar dataKey={chart.yKey} fill="#0f766e" radius={[6, 6, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <p className="muted">{chart.reason}</p>
    </motion.section>
  );
}

export function QueryErrorBanner({ message }: { message: string }) {
  const isModelKeyError = message.includes("AISA_API_KEY");

  return (
    <motion.div className="error-banner" role="alert" {...cardAnimation}>
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>{isModelKeyError ? "Natural language needs AISA_API_KEY" : "Query did not run"}</strong>
        <p>{message}</p>
      </div>
    </motion.div>
  );
}

export function ProgressSteps() {
  const steps = ["Discovering catalog", "Writing SQL", "Validating safety", "Running Coral", "Summarizing"];
  return (
    <motion.div className="progress-steps" {...cardAnimation}>
      {steps.map((step, i) => (
        <motion.span
          key={step}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.12, duration: 0.25 }}
        >
          <Loader2 className="spin" size={14} />
          {step}
        </motion.span>
      ))}
    </motion.div>
  );
}
