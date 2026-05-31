import { motion } from "motion/react";

interface JoinVisualizerProps {
  sql: string;
  sources: string[];
}

interface JoinNode {
  id: string;
  label: string;
  type: "source" | "result";
}

interface JoinEdge {
  from: string;
  to: string;
  condition: string;
}

const SOURCE_COLORS: Record<string, string> = {
  github: "#24292e",
  sentry: "#362d59",
  slack: "#4a154b",
  stripe: "#635bff",
  linear: "#5e6ad2",
  datadog: "#632ca6",
  default: "#0f766e"
};

const SOURCE_ICONS: Record<string, string> = {
  github: "GH",
  sentry: "SN",
  slack: "SL",
  stripe: "ST",
  linear: "LN",
  datadog: "DD"
};

function parseJoinInfo(sql: string, sources: string[]): { nodes: JoinNode[]; edges: JoinEdge[] } {
  const nodes: JoinNode[] = sources.map((s) => ({
    id: s,
    label: s.charAt(0).toUpperCase() + s.slice(1),
    type: "source" as const
  }));
  nodes.push({ id: "result", label: "Result", type: "result" });

  const edges: JoinEdge[] = [];

  // Extract JOIN conditions from SQL
  const joinMatches = [...sql.matchAll(/JOIN\s+(\w+)\.(\w+)\s+\w+\s+ON\s+(.+?)(?=\s+(?:JOIN|WHERE|ORDER|GROUP|LIMIT|$))/gi)];

  if (joinMatches.length > 0) {
    // First source connects to result
    const firstFromMatch = sql.match(/FROM\s+(\w+)\./i);
    const firstSource = firstFromMatch?.[1] ?? sources[0];
    if (firstSource) {
      edges.push({ from: firstSource, to: "result", condition: "FROM" });
    }

    for (const match of joinMatches) {
      const schema = match[1];
      const condition = match[3]?.trim().slice(0, 40) ?? "JOIN";
      edges.push({ from: schema, to: "result", condition });
    }
  } else {
    // Simple case: all sources connect to result
    for (const source of sources) {
      edges.push({ from: source, to: "result", condition: "→" });
    }
  }

  return { nodes, edges };
}

export function JoinVisualizer({ sql, sources }: JoinVisualizerProps) {
  if (sources.length < 2) return null;

  const { nodes, edges } = parseJoinInfo(sql, sources);
  const sourceNodes = nodes.filter((n) => n.type === "source");
  const resultNode = nodes.find((n) => n.type === "result")!;

  const svgWidth = 520;
  const svgHeight = Math.max(160, sourceNodes.length * 70 + 40);
  const sourceX = 60;
  const resultX = svgWidth - 80;
  const resultY = svgHeight / 2;

  return (
    <motion.section
      className="join-visualizer"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div className="section-title">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="4" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M7 8h2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span>Cross-source data flow</span>
        <span className="join-source-count">{sourceNodes.length} sources joined</span>
      </div>
      <div className="join-svg-wrap">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width="100%"
          height={svgHeight}
          className="join-svg"
          aria-label="Data flow diagram showing sources joined in this query"
        >
          <defs>
            <linearGradient id="flow-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.15" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Edges */}
          {sourceNodes.map((source, i) => {
            const sourceY = ((i + 1) / (sourceNodes.length + 1)) * svgHeight;
            const color = SOURCE_COLORS[source.id] ?? SOURCE_COLORS.default;
            const midX = (sourceX + 40 + resultX - 30) / 2;

            return (
              <motion.g key={`edge-${source.id}`}>
                <motion.path
                  d={`M ${sourceX + 40} ${sourceY} C ${midX} ${sourceY}, ${midX} ${resultY}, ${resultX - 30} ${resultY}`}
                  stroke={color}
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray="6 3"
                  opacity="0.5"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.5 }}
                  transition={{ duration: 0.8, delay: i * 0.15, ease: "easeInOut" }}
                />
                {/* Animated dot traveling along the path */}
                <motion.circle
                  r="3"
                  fill={color}
                  filter="url(#glow)"
                  initial={{ offsetDistance: "0%" }}
                  animate={{ offsetDistance: "100%" }}
                  transition={{
                    duration: 2,
                    delay: i * 0.15 + 0.5,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                  style={{
                    offsetPath: `path('M ${sourceX + 40} ${sourceY} C ${midX} ${sourceY}, ${midX} ${resultY}, ${resultX - 30} ${resultY}')`,
                  }}
                />
              </motion.g>
            );
          })}

          {/* Source nodes */}
          {sourceNodes.map((source, i) => {
            const sourceY = ((i + 1) / (sourceNodes.length + 1)) * svgHeight;
            const color = SOURCE_COLORS[source.id] ?? SOURCE_COLORS.default;
            const icon = SOURCE_ICONS[source.id] ?? source.id.slice(0, 2).toUpperCase();

            return (
              <motion.g
                key={source.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <rect
                  x={sourceX - 30}
                  y={sourceY - 18}
                  width={70}
                  height={36}
                  rx={8}
                  fill={color}
                  opacity="0.12"
                  stroke={color}
                  strokeWidth="1.5"
                />
                <circle cx={sourceX - 10} cy={sourceY} r={10} fill={color} />
                <text
                  x={sourceX - 10}
                  y={sourceY + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize="8"
                  fontWeight="700"
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {icon}
                </text>
                <text
                  x={sourceX + 14}
                  y={sourceY + 4}
                  fill={color}
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {source.label}
                </text>
              </motion.g>
            );
          })}

          {/* Result node */}
          <motion.g
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <rect
              x={resultX - 30}
              y={resultY - 22}
              width={80}
              height={44}
              rx={10}
              fill="var(--accent)"
              opacity="0.12"
              stroke="var(--accent)"
              strokeWidth="2"
            />
            <text
              x={resultX + 10}
              y={resultY + 5}
              textAnchor="middle"
              fill="var(--accent)"
              fontSize="13"
              fontWeight="700"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {resultNode.label}
            </text>
          </motion.g>

          {/* Edge labels */}
          {edges.map((edge, i) => {
            const sourceIdx = sourceNodes.findIndex((s) => s.id === edge.from);
            if (sourceIdx < 0) return null;
            const sourceY = ((sourceIdx + 1) / (sourceNodes.length + 1)) * svgHeight;
            const labelX = (sourceX + 40 + resultX - 30) / 2;
            const labelY = (sourceY + resultY) / 2 - 6;

            return (
              <motion.text
                key={`label-${i}`}
                x={labelX}
                y={labelY}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
                opacity="0.7"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7 }}
                transition={{ delay: 0.8 + i * 0.1 }}
              >
                {edge.condition.length > 30 ? edge.condition.slice(0, 30) + "…" : edge.condition}
              </motion.text>
            );
          })}
        </svg>
      </div>
    </motion.section>
  );
}
