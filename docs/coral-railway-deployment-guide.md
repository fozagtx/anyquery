# Deploying a Coral-Powered Next.js App to Railway

A practical deployment guide for a Next.js app that calls Coral from server-side code. It keeps the original Coral/Railway gotchas, but adapts the file layout, Dockerfile, and runtime startup flow for Next.js instead of Streamlit.

## What is Coral?

Coral is a CLI binary that gives your app one SQL interface over APIs such as GitHub, Slack, Stripe, Linear, Sentry, and more. Your Next.js API routes, Route Handlers, Server Actions, or background jobs call:

```bash
coral sql --format json "SELECT ..."
```

Coral handles upstream auth, pagination, and API calls behind the scenes.

Because Coral is a binary, not an npm package, standard Node-only deployment detection is not enough. Use Railway with a Dockerfile so the container includes the correct Linux Coral binary.

References:

- Railway Next.js guide: https://docs.railway.com/guides/nextjs
- Railway Dockerfile support: https://docs.railway.com/languages-frameworks
- Next.js Docker standalone output: https://nextjs.org/docs/app/getting-started/deploying
- Coral releases: https://github.com/withcoral/coral/releases

## Project Structure

Recommended structure for a Next.js App Router project:

```text
your-project/
├── app/
│   ├── api/
│   │   └── query/
│   │       └── route.ts
│   └── page.tsx
├── lib/
│   └── coral.ts
├── next.config.ts
├── package.json
├── package-lock.json
├── Dockerfile
├── start.sh
├── config.toml
└── .gitignore
```

## Step 1 - package.json

Coral does not go in `dependencies`. Keep only your JavaScript dependencies in `package.json`.

Example:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

Gotcha: do not try `npm install coral`. Coral must be installed as an OS binary inside the Docker image.

## Step 2 - next.config.ts

Use standalone output so the Docker runtime image can copy the minimal production server.

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone"
};

export default nextConfig;
```

Gotcha: do not use static export for a Coral app. Coral must run from server-side Node code, so the app needs a Node runtime.

## Step 3 - Find the Right Coral Binary

Railway containers run Linux x86_64 unless you configure otherwise. Use the Linux GNU release asset:

```text
coral-x86_64-unknown-linux-gnu.tar.gz
```

Get the latest release URL from:

```text
https://github.com/withcoral/coral/releases
```

Gotcha: your local macOS or Windows Coral binary will not run in Railway's Linux container. Download the Linux binary during the Docker build.

## Step 4 - Dockerfile

This Dockerfile builds a Next.js standalone app and installs Coral into the final runtime image.

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl tar ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Pin this URL to the Coral release you have tested.
RUN curl -L https://github.com/withcoral/coral/releases/download/v0.4.1/coral-x86_64-unknown-linux-gnu.tar.gz \
  | tar -xz \
  && mv coral /usr/local/bin/coral \
  && chmod +x /usr/local/bin/coral

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY start.sh ./start.sh
COPY config.toml ./config.toml

RUN chmod +x start.sh

EXPOSE 3000
CMD ["bash", "start.sh"]
```

Gotcha 1: name the file exactly `Dockerfile`, with no extension. If Railway falls back to Railpack/Nixpacks, your Coral install step will not run.

Gotcha 2: if Railway keeps using a cached non-Docker builder, go to **Service -> Settings -> Build** and confirm the builder is **Dockerfile**, then manually redeploy.

Gotcha 3: never run `coral source add github` in the Dockerfile. That happens at build time, before Railway injects secret env vars.

## Step 5 - start.sh

Register Coral sources at runtime, when Railway variables are available.

```bash
#!/usr/bin/env bash
set -euo pipefail

export CORAL_CONFIG_DIR="${CORAL_CONFIG_DIR:-/app/.coral}"
mkdir -p "$CORAL_CONFIG_DIR"

coral --version

if [ -n "${GITHUB_TOKEN:-}" ]; then
  coral source add github || true
fi

if [ -n "${SLACK_TOKEN:-}" ]; then
  coral source add slack || true
fi

exec node server.js
```

Why `node server.js`? With `output: "standalone"`, Next.js copies the production server entrypoint into the standalone output. In the Dockerfile above, that standalone output is copied to `/app`, so `server.js` is the runtime entrypoint.

Gotcha: without runtime source registration, Coral queries against source schemas fail with errors like:

```text
Schema 'github' is not currently registered.
```

## Step 6 - config.toml

Create this in your project root when you want a checked-in source mapping. Do not put actual tokens here.

```toml
version = 1

[workspaces.default.sources.github]
variables = { GITHUB_API_BASE = "https://api.github.com" }
secrets = ["GITHUB_TOKEN"]
origin = "bundled"

[workspaces.default.sources.slack]
variables = {}
secrets = ["SLACK_TOKEN"]
origin = "bundled"
```

To inspect source requirements locally:

```bash
coral source info -v github
coral source info -v slack
```

## Step 7 - Next.js Server-Side Coral Helper

Create a small server-only helper. Do not call Coral from client components.

```ts
// lib/coral.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function coralSql<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!/^\s*(select|with|show)\b/i.test(sql)) {
    throw new Error("Only read-only SQL is allowed.");
  }

  const { stdout } = await execFileAsync("coral", ["sql", "--format", "json", sql], {
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 8
  });

  return JSON.parse(stdout) as T[];
}
```

Example App Router endpoint:

```ts
// app/api/query/route.ts
import { NextResponse } from "next/server";
import { coralSql } from "@/lib/coral";

export async function POST(request: Request) {
  const { sql } = await request.json();
  const rows = await coralSql(sql);
  return NextResponse.json({ rows });
}
```

Gotcha: this must run in the Node.js runtime, not Edge runtime. Do not add `export const runtime = "edge"` to routes that call Coral.

## Step 8 - Get Your Tokens

GitHub token:

1. Go to https://github.com/settings/tokens
2. Create a token with the scopes needed for the tables you query.
3. Common scopes: `repo`, `read:org`, `security_events`
4. Copy the `ghp_...` value.

Slack token:

1. Go to https://api.slack.com/apps and open your app.
2. Go to **OAuth & Permissions**.
3. Copy the Bot Token, usually `xoxb-...`.
4. Invite the bot to channels you want to query with `/invite @yourbot`.

Gotcha: generating a new Slack token does not automatically invalidate the old token. Both may remain valid until revoked.

## Step 9 - .gitignore

```gitignore
.env
*.env
.next/
node_modules/
npm-debug.log*
.coral/
```

Never commit tokens, `.env` files, or local Coral state.

## Step 10 - Deploy on Railway

1. Push your repo to GitHub.
2. Go to https://railway.app.
3. Create **New Project -> Deploy from GitHub repo**.
4. Select your repo.
5. Go to **Service -> Variables** and add:

```text
GITHUB_TOKEN=ghp_...
SLACK_TOKEN=xoxb-...
AISA_API_KEY=...
```

6. Go to **Service -> Settings -> Build** and confirm the builder is **Dockerfile**.
7. Go to **Service -> Settings -> Networking** and generate a domain.
8. Use port `3000` unless you changed `PORT`.
9. Trigger a manual redeploy after changing variables or the build mode.

Gotcha: Railway may default to another port in the domain dialog. Match it to your Next.js server port, usually `3000`.

## Debugging Checklist

| Symptom | Likely Cause | Fix |
|---|---|---|
| `coral: command not found` | Railway did not build with your Dockerfile | Confirm builder is Dockerfile and redeploy |
| `Schema 'github' is not currently registered` | `coral source add github` did not run at startup | Add it to `start.sh`, not the Dockerfile |
| `missing required environment variable: GITHUB_TOKEN` | Token not set in Railway variables | Add `GITHUB_TOKEN`, then redeploy |
| `Channel Unavailable` in Slack | Bot lacks channel access | Invite the bot to the channel |
| Next app builds but API route fails | Route is running as Edge or Coral missing | Use Node runtime and Dockerfile |
| App is unreachable | Railway domain points to wrong port | Set domain port to `3000` |
| Old error persists after fix | Cached deployment | Redeploy from Railway Deployments |

## How Coral Resolves Credentials

When you run:

```bash
coral source add github
```

Coral:

1. Looks for the required env vars, such as `GITHUB_TOKEN`.
2. Stores source configuration in its local config directory.
3. Reads the actual token from the environment at query time.

This is why source registration belongs in `start.sh`: Railway injects env vars into the running container, not into the Docker build stage.

Local state defaults:

- Windows: `%APPDATA%\withcoral\coral\config`
- Linux/macOS: `~/.config/coral` or `~/.local/share/withcoral/coral/config`

In containers, set:

```bash
export CORAL_CONFIG_DIR=/app/.coral
```

## Updating Coral

Change the version in the Dockerfile:

```dockerfile
RUN curl -L https://github.com/withcoral/coral/releases/download/v0.4.2/coral-x86_64-unknown-linux-gnu.tar.gz \
  | tar -xz \
  && mv coral /usr/local/bin/coral \
  && chmod +x /usr/local/bin/coral
```

Then push to GitHub and redeploy on Railway.

## Minimum File Reference

For a Coral-powered Next.js Railway deployment, the minimum deployment files are:

```text
Dockerfile
start.sh
config.toml
next.config.ts
package.json
package-lock.json
app/
lib/
```

Use Dockerfile deployment whenever your app needs the Coral binary.
