# PRD: AnyQuery Coral Data Assistant

Status: Draft
Date: 2026-05-24
Working title: AnyQuery

## Research Notes and Assumptions

This PRD defines a plain-language data assistant that can answer questions across multiple data sources, preserve conversation context, schedule recurring reports, create metric investigations, protect data privacy, reuse cached answers, support multilingual users, and present charts when results are better understood visually.

Coral is the proposed data access layer. Based on the current Coral docs, Coral provides a local SQL interface over APIs, files, and other sources; runs through a CLI or MCP server; exposes catalog discovery tools; supports bundled sources such as GitHub, Slack, Datadog, Linear, Sentry, Stripe, and others; supports custom YAML source specs for HTTP APIs and local JSONL/Parquet files; executes read-only SQL; stores data, credentials, and usage history locally; and currently targets a single-user local trust boundary.

Key implementation assumption: the first product should not try to ship every possible connector. The MVP should be a Coral-native AI data assistant: it connects to Coral-supported sources, uses Coral catalog metadata to generate SQL, runs read-only SQL locally through Coral, and wraps the result in a polished chat, chart, metric, and reporting experience. Native database connectors such as PostgreSQL, MySQL, MongoDB, and Excel-style spreadsheets can be planned as follow-on work through Coral source support, an adapter layer, or separately managed connectors.

Primary references:

- Coral introduction: https://withcoral.com/docs
- Coral quickstart: https://withcoral.com/docs/getting-started/quickstart
- Coral installation: https://withcoral.com/docs/getting-started/installation
- Coral MCP guide: https://withcoral.com/docs/guides/use-coral-over-mcp
- Coral custom source guide: https://withcoral.com/docs/guides/write-a-custom-source
- Coral bundled sources: https://withcoral.com/docs/reference/bundled-sources
- Coral CLI reference: https://withcoral.com/docs/reference/cli-reference
- Coral security model: https://withcoral.com/docs/project/security
- Coral architecture: https://withcoral.com/docs/project/architecture
- Coral roadmap: https://withcoral.com/docs/project/roadmap

## Problem Statement

Business teams need fast answers from operational data, but the data is scattered across product analytics, billing, issue trackers, support tools, documents, logs, and internal APIs. Non-technical users wait on analysts or engineers because they do not know the right query language, table names, API filters, or data source boundaries. Technical users also lose time stitching together one-off scripts, API calls, CSV exports, dashboard edits, and follow-up explanations.

Existing BI tools are often too rigid for exploratory questions, while general AI tools cannot safely and reliably inspect private company data. Teams need a private, self-hosted assistant that can understand plain-language questions, discover the right connected sources, generate inspectable SQL, run only safe read-only queries, return usable results, and remember enough context for follow-up analysis.

## Solution

AnyQuery will be a local-first AI data assistant built on Coral. Users will connect sources through Coral, then ask questions in a chat interface. The assistant will discover the available Coral catalog, generate read-only SQL, execute it through Coral, and return a natural-language answer with the underlying table, query, result grid, and chart when appropriate.

The MVP will focus on:

- Plain-language chat over Coral-connected sources.
- Source connection and health management for bundled Coral sources.
- Custom source spec upload, linting, validation, and testing for advanced users.
- Safe generated SQL with preview, execution status, row limits, timeouts, and visible provenance.
- Conversation threads with follow-up questions.
- Result tables and one-click charts.
- Saved questions and scheduled recurring reports.
- Metric definitions and a first version of `/investigate <metric>` for automated summaries and dimension breakdowns.
- Privacy controls that define what catalog metadata, SQL, summaries, and raw result values may be sent to the selected model.
- Local deployment first, with a path to shared team deployment as Coral's team-oriented capabilities mature.

The first release should feel like a data analyst sitting inside a secure workspace: conversational, useful, inspectable, and grounded in actual data, without hiding the query or data source path from the user.

## User Stories

1. As an executive, I want to ask a revenue or customer question in plain language, so that I can get an answer without waiting for a data team.
2. As a team lead, I want to ask follow-up questions in the same thread, so that I can drill into a result without restating the original context.
3. As an analyst, I want to see the SQL generated for every answer, so that I can audit, copy, refine, or debug the query.
4. As an operations manager, I want to connect tools like Stripe, Slack, Linear, GitHub, Sentry, and Datadog, so that I can query operational data from one place.
5. As a developer, I want AnyQuery to use Coral's catalog discovery before writing SQL, so that generated queries reference real schemas, tables, and columns.
6. As a user, I want the assistant to explain which sources it used, so that I can trust where the answer came from.
7. As a user, I want an answer to include a result table when the data is tabular, so that I can inspect the underlying rows.
8. As a user, I want AnyQuery to suggest a chart when the result has chartable dimensions and measures, so that I can understand trends or breakdowns quickly.
9. As a user, I want to choose between bar, line, and pie charts when the data supports them, so that I can present the result clearly.
10. As a user, I want chart axes and labels to be generated from result metadata, so that charts are readable without manual cleanup.
11. As a manager, I want to save a useful question, so that I can rerun it later without retyping the prompt.
12. As a manager, I want to schedule a saved question hourly, daily, weekly, or monthly, so that reports arrive automatically.
13. As a recipient, I want scheduled reports delivered by email first, so that I can consume results without opening the app.
14. As a workspace admin, I want to configure report delivery channels, so that the organization controls where data is sent.
15. As a privacy-conscious admin, I want to decide whether raw result rows can be sent to the LLM, so that sensitive business data stays within policy.
16. As a privacy-conscious admin, I want a cloud-model mode that sends only catalog metadata, generated SQL, aggregate summaries, and permitted samples, so that the assistant can help without exposing full records.
17. As a privacy-conscious admin, I want a local-model mode that can reason over raw data, so that private deployments can support deeper narrative analysis.
18. As a user, I want destructive SQL and multi-statement SQL blocked, so that a generated query cannot mutate or damage connected systems.
19. As a user, I want default row limits and query timeouts, so that accidental broad queries do not overload sources.
20. As a user, I want clear error messages when a query fails, so that I understand whether the problem is permissions, missing filters, unavailable sources, or query syntax.
21. As a user, I want the assistant to repair failed SQL using the error and catalog metadata, so that simple mistakes do not end the workflow.
22. As an analyst, I want to inspect the tables and columns available in each source, so that I can understand what the assistant can query.
23. As an admin, I want to run source health checks, so that broken credentials or invalid source specs are detected before users ask questions.
24. As an admin, I want source credentials to stay in the Coral configuration boundary, so that AnyQuery does not duplicate or expose secrets unnecessarily.
25. As an admin, I want least-privilege setup guidance for every source, so that connected tokens grant only the data required.
26. As a developer, I want to add a custom source spec, lint it, install it, test it, and query it, so that internal APIs can become available to the assistant.
27. As a developer, I want source spec validation output displayed in the UI, so that I can fix schema or credential problems quickly.
28. As a developer, I want custom sources to expose tables, columns, filters, and inputs through the same catalog experience as bundled sources, so that users do not need to learn a different flow.
29. As a product leader, I want to define a metric such as revenue, active users, incidents, or churn, so that recurring analysis uses consistent logic.
30. As a product leader, I want to define metric dimensions, so that I can analyze a metric by plan, channel, region, owner, service, or time period.
31. As a user, I want to run `/investigate <metric>`, so that AnyQuery produces a metric summary, trend, breakdowns, and likely drivers.
32. As an analyst, I want metric SQL to be visible and editable, so that business definitions remain auditable.
33. As a user, I want AnyQuery to remember prior conversation context, so that follow-up prompts such as "break that down by region" work naturally.
34. As a user, I want conversation threads organized by topic, so that I can return to a project or investigation later.
35. As a multilingual user, I want to ask questions in my preferred language, so that I do not need to translate business questions into English first.
36. As a multilingual user, I want responses in the language I used, so that the experience feels natural for international teams.
37. As a user, I want the app to cache semantically similar questions and results, so that repeated questions are faster and cheaper.
38. As an admin, I want to configure the cache similarity threshold and TTL, so that reused answers are helpful without becoming stale.
39. As a user, I want cached answers clearly marked, so that I know whether the system queried live data or reused a previous result.
40. As a user, I want to force-refresh a cached answer, so that I can rerun the query against live data.
41. As an admin, I want audit records of prompts, generated SQL, executed sources, execution status, and delivery events, so that usage can be reviewed.
42. As an admin, I want sensitive values redacted from logs, so that observability does not become a data leak.
43. As a developer, I want OpenTelemetry correlation between AnyQuery requests and Coral queries, so that slow or failing workflows can be traced end to end.
44. As a user, I want streaming progress states such as discovering schema, writing query, running query, and summarizing result, so that long tasks feel understandable.
45. As a user, I want to cancel a running query, so that I can stop accidental or slow work.
46. As an admin, I want environment-based configuration for Coral paths, AIsa settings, storage, and delivery services, so that deployments are repeatable.
47. As a self-hosted customer, I want a simple local deployment path, so that I can run the assistant inside my infrastructure.
48. As a future team customer, I want a path to shared workspaces, role-based access, and source sharing, so that the product can scale beyond one user.
49. As a new user, I want onboarding to confirm Coral is installed and has at least one source, so that I can ask my first question quickly.
50. As a new user, I want sample prompts based on connected sources, so that I know what the system can answer.
51. As a user, I want to export result tables as CSV, so that I can use answers outside the app.
52. As a user, I want to copy generated SQL, so that I can run it in other tools when needed.
53. As a user, I want saved reports to include the prompt, SQL, timestamp, source list, result summary, and chart, so that recipients get enough context.
54. As an admin, I want scheduled report failures to notify the owner, so that broken reports are repaired quickly.
55. As an analyst, I want prompt and SQL version history for saved questions and metrics, so that changes can be reviewed over time.
56. As a user, I want the assistant to ask a clarifying question when a request is ambiguous, so that it does not guess a risky query.
57. As a user, I want the assistant to refuse requests outside available data or permissions, so that answers remain truthful and grounded.
58. As a developer, I want tests to run against a real local Coral CLI and safe metadata queries, so that product behavior never depends on invented source data.
59. As a buyer, I want evidence that data and credentials remain local by default, so that I can approve deployment in a security review.
60. As a buyer, I want a clear enterprise roadmap, so that I understand how shared workspaces, SSO, access policies, masking, and audit logs will arrive.

## Implementation Decisions

- Build AnyQuery as a self-hosted web application with a chat-first primary screen, source management, thread history, saved questions, metric definitions, scheduled reports, and admin settings.
- Use Coral as the default data plane. The app should not implement provider pagination, auth, source-specific table mapping, or API stitching when Coral already provides those capabilities.
- Create a Coral gateway as a deep module. It should own Coral availability checks, version checks, source discovery, source listing, source info, bundled source installation, custom source installation, source linting, source testing, catalog discovery, table description, column listing, SQL execution, timeout handling, structured error normalization, and result normalization.
- Prefer Coral MCP-style discovery semantics in the AI workflow: list or search the catalog, describe relevant tables, list relevant columns, generate SQL, run SQL, and repair on failure with bounded retries.
- Support both direct Coral CLI execution and an MCP client adapter behind the Coral gateway. The product interface should not leak which transport is used.
- Store application metadata separately from Coral state. App storage should hold users, threads, messages, saved questions, schedules, metric definitions, cache records, delivery logs, audit records, and UI preferences. Coral remains responsible for source configuration and source secrets.
- Use a configurable Coral state directory per deployment or workspace. Do not copy Coral secrets into the app database.
- Treat all generated SQL as read-only. Enforce a safety validator before execution even though Coral rejects DDL, DML, and multiple statements.
- Add app-level row limits, query timeouts, and optional maximum result byte limits. The assistant should offer refinements when results are too large.
- Keep generated SQL visible by default. Every answer should include the prompt, executed SQL, source list, execution time, row count, cache status, and result timestamp.
- Use a policy engine for LLM data exposure. Policies should control whether the model may see catalog metadata only, aggregate summaries, sampled rows, full result rows, or no result values.
- Make local or bring-your-own model support a first-class privacy mode, especially for deployments that want full narrative analysis over raw records.
- Use a deterministic result summarizer before sending anything to a cloud model. It should compute schema, row count, numeric summaries, top categories, time ranges, null rates, and representative examples according to policy.
- Implement an AI orchestrator with explicit intent routing for data question, follow-up, source setup help, chart request, saved question, schedule creation, metric definition, metric investigation, export, and troubleshooting.
- Store conversation state as structured context, not only prose. Include prior SQL, result schema, source names, filters, time windows, chart selections, and metric references.
- Implement semantic caching at the question-plan-result level. Cache keys should include normalized prompt meaning, connected source/catalog fingerprint, generated SQL, policy mode, and relevant time window.
- Mark cached answers in the UI and allow force refresh. Scheduled reports should default to live execution unless explicitly configured otherwise.
- Implement chart recommendation as a separate module. It should inspect result shape and suggest line charts for time series, bar charts for category comparisons, and pie or donut charts only for small part-to-whole distributions.
- Implement metric definitions as named objects with SQL templates, measure expressions, time grain, default filters, dimensions, owner, description, and validation status.
- Implement `/investigate <metric>` as a workflow that runs a bounded set of SQL analyses: headline value, period-over-period change, trend, dimension breakdowns, top movers, and notable anomalies.
- Keep metric investigation explainable. Each section of the report should link to the SQL that produced it.
- Implement scheduling as a background job runner. Schedules should reference saved questions or metric investigations, include frequency, timezone, delivery recipients, delivery format, and failure policy.
- Start with email delivery and webhook delivery. Slack delivery can follow once delivery policies and redaction controls are stable. WhatsApp delivery is not MVP.
- Implement source management UI for Coral bundled sources first. Users should see available, installed, unhealthy, and missing-credential states.
- Implement custom source spec support for advanced users. The UI should allow uploading or editing YAML, linting before install, adding with required inputs, running source tests, and viewing exposed catalog entries.
- Include source setup guidance that encourages least-privilege and read-only upstream tokens.
- Implement audit logging for prompt submission, generated SQL, execution, source access, cache reuse, export, schedule delivery, source install, source test, and settings changes.
- Use OpenTelemetry for app traces and metrics, and propagate trace context into Coral invocations where supported, so operators can connect app requests to Coral query spans.
- Design for a single-user/local MVP while keeping workspace boundaries in the domain model. Coral's current security model is local and trusted-user oriented, while the Coral roadmap points toward shared team use, access policies, and enterprise controls.
- Do not promise table-level access policies, masking, enterprise SSO, or org-level permissions in MVP unless implemented independently of Coral.

## Testing Decisions

- Tests should assert external behavior rather than implementation details. For example, a prompt should produce a safe SQL execution plan, visible provenance, and a correct rendered answer, without requiring a specific internal chain of helper calls.
- The Coral gateway should have contract tests with a fake Coral process or fake MCP adapter. These tests should cover source discovery, source install failure, source test failure, catalog pagination, SQL success, SQL syntax errors, permission errors, timeout handling, and result normalization.
- Add integration tests against a local JSONL Coral source when Coral is installed in the test environment. The test should lint a source spec, add it, test it, query it, and verify normalized rows.
- The AI orchestrator should have fixture-based tests using known catalogs and expected SQL plans. Include ambiguous prompts, follow-ups, missing tables, required filters, failed SQL repair, multilingual prompts, and requests outside available data.
- The SQL safety validator should have unit and property-style tests for read-only SELECT statements, CTEs, joins, aggregates, window functions, comments, multiple statements, DDL, DML, COPY, SET, and attempts to smuggle writes through prompt injection.
- The privacy policy engine should have tests proving that cloud-model mode does not receive raw result values when the policy forbids them.
- The result summarizer should have tests for numeric summaries, categorical summaries, time ranges, null handling, row caps, redaction, and deterministic output.
- The chart recommendation module should have tests for time series, category comparisons, part-to-whole results, unsupported shapes, sparse values, and large result sets.
- The semantic cache should have tests for cache hits, misses, TTL expiry, source/catalog fingerprint changes, policy changes, forced refresh, and stale scheduled reports.
- The scheduler should have tests for timezone handling, retry behavior, missed runs, disabled schedules, owner notification on failure, and delivery payload generation.
- The metric engine should have tests for definition validation, investigation query generation, dimension breakdowns, period comparisons, anomaly flags, and SQL provenance.
- The custom source spec workflow should have tests for lint success, lint failure, install success, install warning, strict source test failure, secret input handling, and displayed catalog shape.
- Add end-to-end tests for onboarding, connecting a sample source, asking a question, viewing SQL, rendering a table, rendering a chart, saving a question, scheduling a report, and exporting CSV.
- Add security regression tests for prompt injection inside source data, unsafe generated SQL, accidental secret display, log redaction, and blocked delivery of sensitive raw rows.
- Use provider contract tests for model integration. Only a small manual or nightly suite should call real model APIs.

## Out of Scope

- Full feature parity with established AI data assistant products in the first release.
- Native PostgreSQL, MySQL, SQL Server, MongoDB, Excel, and warehouse connectors unless available through Coral sources, custom source specs, or a deliberately scoped adapter.
- Write operations, approval-gated actions, source mutations, and agent-driven updates to upstream systems.
- Managed cloud hosting as the first deployment target.
- Enterprise SSO, org-level permissions, table-level access policies, and policy-driven masking unless implemented as an app-owned layer after MVP.
- WhatsApp delivery.
- A full BI dashboard builder with drag-and-drop reports.
- A public custom source marketplace.
- Training or fine-tuning models on customer data.
- Guaranteeing safety for untrusted local agents, untrusted source specs, compromised machines, or over-permissioned upstream tokens.

## Further Notes

Recommended MVP modules:

- Coral gateway
- AI orchestration engine
- SQL safety and policy engine
- Catalog and source management service
- Conversation and context service
- Result rendering and chart recommendation service
- Semantic cache
- Saved question and scheduler service
- Metric registry and investigation service
- Audit and observability service
- Admin configuration service

Recommended MVP milestones:

1. Local prototype: connect one Coral source, ask a plain-language question, generate SQL, execute through Coral, show SQL and table.
2. Product shell: chat threads, source status, catalog browser, query provenance, error repair, and result charts.
3. Trust layer: privacy policy modes, SQL validator, audit logs, row limits, timeouts, redaction, and cache controls.
4. Repeatability: saved questions, scheduled email reports, exports, and force-refresh.
5. Intelligence layer: metric definitions, `/investigate`, dimension breakdowns, and driver summaries.
6. Advanced source layer: custom source spec authoring, linting, validation, and UI-guided troubleshooting.

Open product questions:

- Should the product name remain AnyQuery?
- Which first three sources matter most for the initial launch proof?
- Should the default model be cloud-hosted, local, or bring-your-own?
- Should the first customer experience be single-user desktop/local, self-hosted team workspace, or both?
- Which data exposure policy should be the default for the first launch proof?
- What delivery channels are required beyond email for launch?
