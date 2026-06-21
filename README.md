# Agent CFO for Arc

<p align="center"><strong>Spend intelligence and financial controls for autonomous agents on Arc.</strong></p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a>
</p>

Agent CFO turns USDC payment events into a tenant-scoped financial workspace: dashboards, task and provider attribution, budgets, risk signals, auditable policies, and CFO-style reports. The public experience remains deterministic and credential-free; authenticated workspaces persist financial facts in PostgreSQL.

## What is implemented

- Data-driven dashboard with spend trends, activity charts, motion, reduced-motion support, and responsive layouts.
- Privy authentication with workspace membership and owner, editor, and viewer roles.
- Tenant-scoped wallets, payments, tasks, budgets, provider policies, risks, sync cursors, reports, audit events, and idempotency records.
- Exact decimal USDC accounting, optimistic concurrency, replay protection, sync leases, and failure recovery.
- Incremental Arc Testnet native USDC indexing for arbitrary saved wallets, with chain-event evidence, recent-first bounded backfill, and resumable block cursors.
- Encrypted workspace OpenAI credentials and structured BYOK report generation.
- Verified Chinese/English PDF export using an embedded CJK font.
- OAuth-protected remote MCP tools for wallets, spend analysis, payments, risks, monitoring budgets, and reports.
- Security headers, origin checks, body limits, distributed PostgreSQL rate limits, request IDs, structured logs, liveness, and readiness probes.
- Docker standalone runtime, migration image target, CI quality gates, browser E2E, WCAG scans, dependency audit, and production latency checks.
- Integrity-checked PostgreSQL backup and explicitly confirmed restore commands.

## Truthful integration boundary

The default public workspace uses deterministic fixtures. A separate public evidence path verifies the declared Circle Gateway/Arc Testnet sample. Authenticated workspaces can index outgoing native USDC events for arbitrary saved Arc Testnet wallets from the configured EIP-7708 start block. Sync processes the newest blocks first and reports a partial state until historical backfill reaches that boundary.

Arc RPC data proves onchain value movement but does not infer private business context or discover arbitrary Circle Gateway metadata. Persistent ingestion is also available through authenticated/internal APIs and source-specific adapters. Provider credentials and the deployment environment must be configured by the operator. Budgets currently monitor, analyze, and alert; they do not sign or block onchain transactions.

## Architecture

```text
Privy / OAuth identities
          │
          ▼
Next.js application and MCP resource server
          │
          ├── Workspace application services
          ├── Exact spend analytics and risk engine
          ├── Encrypted BYOK report generation and PDF export
          └── Arc / Circle / x402 ingestion adapters
          │
          ▼
PostgreSQL tenant data, audit trail, idempotency, leases, and rate limits
```

All persistent repository reads and writes require a workspace scope. Mutations combine role checks, validation, idempotency, auditing, and transactional updates.

## Local public demo

Requirements: Node.js 22.17+ and pnpm 10.12+.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. No credentials or database are required for the public demo.

## Persistent environment

Copy `.env.example` to `.env.local` and configure:

- PostgreSQL `DATABASE_URL` and strong internal/rate-limit secrets.
- A 32-byte base64 encryption key and key ID.
- Privy app ID, app secret, and verification key.
- HTTPS site and MCP URLs.
- OAuth issuer, JWKS, audience, claims, and allowed MCP origins.
- Arc RPC URL plus optional block-range, chunk-size, and concurrency tuning.

Then apply migrations and start the app:

```bash
pnpm db:migrate
pnpm dev
```

OpenAI remains BYOK: an owner or editor stores the key in Settings. Plaintext keys are encrypted before persistence and are never returned by metadata APIs.

## Remote MCP

The streamable HTTP endpoint is `/mcp`; protected-resource metadata is published under `/.well-known/oauth-protected-resource/mcp`. The authorization server must issue JWT access tokens with the configured audience, scopes, Privy subject claim, and workspace claim. Workspace membership is revalidated against PostgreSQL before a tool runs.

Available scopes:

- `wallets:read` / `wallets:write` — observed wallet access and audited creation.
- `analytics:read` — spend summaries, payments, and risk signals.
- `budgets:read` / `budgets:write` — monitoring budget access and audited creation.
- `reports:read` — report generation and retrieval results.

Legacy `agent-cfo:*` scopes remain accepted during client migration but are not advertised by protected-resource metadata.

After obtaining a workspace-bound access token, verify any deployment with the same Streamable HTTP client contract used by desktop MCP clients:

```bash
MCP_URL=https://your-app.example.com/mcp \
MCP_ACCESS_TOKEN='…' pnpm mcp:check
```

## Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm security:audit
pnpm build
pnpm verify:standalone
pnpm performance:check
pnpm db:recovery:check
```

Playwright covers desktop and mobile public journeys, navigation, console errors, WCAG A/AA checks, reduced motion, and viewport overflow. The performance gate starts the production standalone server and checks liveness and homepage SSR error rate and p95 latency.

## Container deployment

```bash
docker build --target runner -t agent-cfo-for-arc .
docker build --target migrate -t agent-cfo-for-arc-migrate .
docker run --env-file .env.production agent-cfo-for-arc-migrate
docker run --env-file .env.production -p 3000:3000 agent-cfo-for-arc
```

Run the migration target once per release before rolling out the application target. The runtime executes as a non-root user and probes `/api/health/ready`.

## Database recovery

The commands require PostgreSQL client tools.

```bash
DATABASE_URL='postgresql://…' pnpm db:backup
RESTORE_DATABASE_URL='postgresql://…' \
  pnpm db:restore -- --backup backups/name.dump --confirm host/database
```

Backups use PostgreSQL custom format and include a SHA-256 manifest. Restore verifies the manifest, requires the target identity to be typed exactly, and applies replacement inside one transaction. Test restores against a disposable database before any production recovery.

## Key directories

```text
app/          Pages, APIs, health probes, and MCP transport
components/   Dashboard, workspace, authentication, and report UI
lib/          Domain, repositories, services, security, AI, MCP, and adapters
drizzle/      Versioned PostgreSQL migrations
e2e/          Playwright public-workspace acceptance tests
scripts/      Deployment, performance, backup, and restore verification
```

## License

[MIT](./LICENSE)
