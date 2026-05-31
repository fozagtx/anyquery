import { motion } from "motion/react";
import { LineChart, Sparkles, Zap, Database } from "lucide-react";
import type { HealthResponse, SourceSummary } from "../../shared/types";
import type { QuerySuggestion } from "../lib/suggestions";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35 }
};

const stagger = {
  animate: { transition: { staggerChildren: 0.06 } }
};

function categoryIcon(category: QuerySuggestion["category"]) {
  if (category === "cross-source") return <Sparkles size={14} />;
  if (category === "single-source") return <Database size={14} />;
  return <Zap size={14} />;
}

function categoryBadge(category: QuerySuggestion["category"]) {
  if (category === "cross-source") return "Cross-source JOIN";
  if (category === "single-source") return "Source query";
  return "Metadata";
}

export function EmptyState({
  health,
  installedSourceCount,
  catalogCount,
  suggestions,
  onRunExample
}: {
  health: HealthResponse | null;
  installedSourceCount: number;
  catalogCount: number;
  suggestions: QuerySuggestion[];
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
        ? "Use an example or write read-only SQL against the live catalog. Natural language requires AISA_API_KEY."
        : "Start with Coral metadata SQL, then install a bundled source or custom source spec in the Sources panel.";

  // Show cross-source suggestions first, then source-specific, then metadata
  const displaySuggestions = suggestions.slice(0, 6);

  return (
    <motion.div className="empty-state" {...fadeUp}>
      <motion.div className="empty-icon" {...fadeUp}>
        <LineChart size={30} aria-hidden="true" />
      </motion.div>
      <motion.div className="empty-copy" {...fadeUp}>
        <strong>{title}</strong>
        <p>{description}</p>
      </motion.div>
      <motion.div className="empty-facts" {...fadeUp}>
        <span>{installedSourceCount} installed sources</span>
        <span>{catalogCount} catalog tables</span>
        <span>SQL first</span>
      </motion.div>
      <motion.div className="empty-examples" aria-label="Runnable SQL examples" {...stagger}>
        {displaySuggestions.map((suggestion, i) => (
          <motion.button
            key={suggestion.sql}
            type="button"
            disabled={!coralReady && suggestion.category !== "metadata"}
            onClick={() => onRunExample(suggestion.sql)}
            className={`suggestion-card suggestion-${suggestion.category}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.28 }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="suggestion-header">
              {categoryIcon(suggestion.category)}
              <span className="suggestion-label">{suggestion.label}</span>
            </div>
            <span className="suggestion-description">{suggestion.description}</span>
            {suggestion.category !== "metadata" && (
              <span className="suggestion-badge">{categoryBadge(suggestion.category)}</span>
            )}
            <code>{suggestion.sql.length > 60 ? suggestion.sql.slice(0, 60) + "…" : suggestion.sql}</code>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  );
}
