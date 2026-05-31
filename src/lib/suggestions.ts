import type { SourceSummary } from "../../shared/types";

export interface QuerySuggestion {
  label: string;
  description: string;
  sql: string;
  sources: string[];
  category: "metadata" | "single-source" | "cross-source";
}

const metadataSuggestions: QuerySuggestion[] = [
  {
    label: "Show tables",
    description: "See what Coral exposes right now.",
    sql: "SHOW TABLES",
    sources: [],
    category: "metadata"
  },
  {
    label: "List catalog",
    description: "Inspect schemas and table types.",
    sql: "SELECT table_schema, table_name, table_type FROM information_schema.tables ORDER BY table_schema, table_name LIMIT 50",
    sources: [],
    category: "metadata"
  },
  {
    label: "Count by schema",
    description: "Check source coverage without reading rows.",
    sql: "SELECT table_schema, COUNT(*) AS tables FROM information_schema.tables GROUP BY table_schema ORDER BY table_schema",
    sources: [],
    category: "metadata"
  }
];

const sourceSuggestionMap: Record<string, QuerySuggestion[]> = {
  github: [
    {
      label: "Open pull requests",
      description: "PRs currently open across your repos.",
      sql: "SELECT title, user_login, created_at, html_url FROM github.pull_requests WHERE state = 'open' ORDER BY created_at DESC LIMIT 20",
      sources: ["github"],
      category: "single-source"
    },
    {
      label: "Recent issues",
      description: "Latest issues filed in your repositories.",
      sql: "SELECT title, state, user_login, created_at FROM github.issues ORDER BY created_at DESC LIMIT 20",
      sources: ["github"],
      category: "single-source"
    },
    {
      label: "Top contributors",
      description: "Most active contributors by commits.",
      sql: "SELECT author_login, COUNT(*) AS commits FROM github.commits GROUP BY author_login ORDER BY commits DESC LIMIT 10",
      sources: ["github"],
      category: "single-source"
    }
  ],
  slack: [
    {
      label: "Recent messages",
      description: "Latest Slack messages across channels.",
      sql: "SELECT channel, user_name, text, ts FROM slack.messages ORDER BY ts DESC LIMIT 20",
      sources: ["slack"],
      category: "single-source"
    },
    {
      label: "Active channels",
      description: "Channels with the most recent activity.",
      sql: "SELECT channel, COUNT(*) AS messages FROM slack.messages GROUP BY channel ORDER BY messages DESC LIMIT 10",
      sources: ["slack"],
      category: "single-source"
    }
  ],
  sentry: [
    {
      label: "Unresolved errors",
      description: "Open issues grouped by project.",
      sql: "SELECT project, title, level, COUNT(*) AS occurrences FROM sentry.issues WHERE status = 'unresolved' GROUP BY project, title, level ORDER BY occurrences DESC LIMIT 15",
      sources: ["sentry"],
      category: "single-source"
    },
    {
      label: "Fatal errors this week",
      description: "Critical issues from the past 7 days.",
      sql: "SELECT title, project, first_seen, last_seen FROM sentry.issues WHERE level = 'fatal' ORDER BY last_seen DESC LIMIT 10",
      sources: ["sentry"],
      category: "single-source"
    }
  ],
  stripe: [
    {
      label: "Recent charges",
      description: "Latest Stripe charges and their status.",
      sql: "SELECT id, amount, currency, status, created FROM stripe.charges ORDER BY created DESC LIMIT 20",
      sources: ["stripe"],
      category: "single-source"
    },
    {
      label: "Revenue by status",
      description: "Total charge amounts grouped by status.",
      sql: "SELECT status, COUNT(*) AS count, SUM(amount) AS total_cents FROM stripe.charges GROUP BY status",
      sources: ["stripe"],
      category: "single-source"
    }
  ],
  linear: [
    {
      label: "Open issues",
      description: "Current Linear issues and their priority.",
      sql: "SELECT title, state, priority, assignee_name FROM linear.issues WHERE state NOT IN ('Done', 'Canceled') ORDER BY priority LIMIT 20",
      sources: ["linear"],
      category: "single-source"
    }
  ],
  datadog: [
    {
      label: "Recent monitors",
      description: "Monitor status across your Datadog account.",
      sql: "SELECT name, type, overall_state FROM datadog.monitors ORDER BY name LIMIT 20",
      sources: ["datadog"],
      category: "single-source"
    }
  ]
};

const crossSourceSuggestions: Array<{ requiredSources: string[]; suggestion: QuerySuggestion }> = [
  {
    requiredSources: ["github", "sentry"],
    suggestion: {
      label: "PRs with related errors",
      description: "Cross-reference merged PRs with Sentry issues.",
      sql: `SELECT g.title AS pr_title, s.title AS error_title, s.level, g.merged_at
FROM github.pull_requests g
JOIN sentry.issues s ON s.first_seen >= g.merged_at
WHERE g.state = 'closed' AND g.merged_at IS NOT NULL
ORDER BY g.merged_at DESC
LIMIT 15`,
      sources: ["github", "sentry"],
      category: "cross-source"
    }
  },
  {
    requiredSources: ["github", "slack"],
    suggestion: {
      label: "Deployments & team chatter",
      description: "Match GitHub merges with Slack discussions.",
      sql: `SELECT g.title AS pr_title, g.merged_at, sl.text AS slack_message
FROM github.pull_requests g
JOIN slack.messages sl ON sl.ts >= g.merged_at
WHERE g.merged_at IS NOT NULL
ORDER BY g.merged_at DESC
LIMIT 15`,
      sources: ["github", "slack"],
      category: "cross-source"
    }
  },
  {
    requiredSources: ["sentry", "slack"],
    suggestion: {
      label: "Errors in incident channels",
      description: "Match Sentry fatals with Slack incident messages.",
      sql: `SELECT s.title AS error, s.level, sl.channel, sl.text
FROM sentry.issues s
JOIN slack.messages sl ON sl.channel = '#incidents'
WHERE s.level = 'fatal'
ORDER BY s.first_seen DESC
LIMIT 10`,
      sources: ["sentry", "slack"],
      category: "cross-source"
    }
  },
  {
    requiredSources: ["github", "sentry", "slack"],
    suggestion: {
      label: "Root cause across 3 sources",
      description: "The Coral hero query — PRs + errors + incidents.",
      sql: `SELECT g.title, s.error_message, sl.text
FROM github.pull_requests g
JOIN sentry.issues s ON s.first_seen >= g.merged_at
JOIN slack.messages sl ON sl.channel = '#incidents'
WHERE s.level = 'fatal'
ORDER BY s.first_seen DESC
LIMIT 10`,
      sources: ["github", "sentry", "slack"],
      category: "cross-source"
    }
  }
];

export function getSuggestions(sources: SourceSummary[]): QuerySuggestion[] {
  const installedIds = new Set(
    sources.filter((s) => s.status === "installed").map((s) => s.id)
  );

  const results: QuerySuggestion[] = [];

  // Cross-source suggestions first (most impressive)
  for (const { requiredSources, suggestion } of crossSourceSuggestions) {
    if (requiredSources.every((id) => installedIds.has(id))) {
      results.push(suggestion);
    }
  }

  // Single-source suggestions
  for (const id of installedIds) {
    const suggestions = sourceSuggestionMap[id];
    if (suggestions) {
      results.push(...suggestions.slice(0, 2));
    }
  }

  // Always include metadata suggestions as fallback
  results.push(...metadataSuggestions);

  return results;
}
