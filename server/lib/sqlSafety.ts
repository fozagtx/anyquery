const blockedPatterns = [
  /\b(insert|update|delete|drop|alter|truncate|create|replace|merge|grant|revoke|vacuum|copy|set)\b/i,
  /;\s*\S/
];

export interface SqlSafetyResult {
  safe: boolean;
  reason?: string;
}

export function validateReadOnlySql(sql: string): SqlSafetyResult {
  const trimmed = sql.trim();

  if (!trimmed) {
    return { safe: false, reason: "SQL is empty." };
  }

  if (!/^(select|with|show)\b/i.test(trimmed)) {
    return { safe: false, reason: "Only SELECT, SHOW, and read-only CTE queries are allowed." };
  }

  for (const pattern of blockedPatterns) {
    if (pattern.test(trimmed)) {
      return { safe: false, reason: "Query contains a blocked write, DDL, or multi-statement pattern." };
    }
  }

  return { safe: true };
}
