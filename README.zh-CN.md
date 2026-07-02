# Agent CFO for Arc

<p align="center"><strong>面向 Arc 自主 Agent 的支出智能与财务控制工作区。</strong></p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a>
</p>

Agent CFO 将 USDC 支付事件转化为租户隔离的财务工作区，包括仪表盘、任务与服务商成本归因、预算、风险信号、可审计策略和 CFO 风格报告。公开体验保持确定性且无需凭证；登录后的工作区会将金融事实持久化到 PostgreSQL。

## 已实现能力

- 数据驱动的支出趋势与活动图表、入场动画、减弱动画支持和响应式布局。
- Privy 登录、Google/钱包身份绑定，以及 owner、operator、viewer 工作区角色。
- 租户隔离的钱包、支付、任务、预算、服务商策略、风险、同步游标、报告、审计和幂等记录。
- 精确十进制 USDC 计算、乐观并发、重放保护、同步租约和失败恢复。
- 面向任意已保存钱包的 Arc Testnet 原生 USDC 增量索引，包含链事件证据、近期优先的有界回填和可续传区块游标。
- 加密保存工作区 OpenAI 凭据，并通过 Vercel AI SDK 和 BYOK 生成结构化报告。
- 使用内嵌 CJK 字体、经过渲染验证的中英文 PDF 导出。
- 受 OAuth 保护的远程 MCP 工具，支持钱包、支出分析、支付、风险、监控预算和报告。
- 安全响应头、来源校验、请求体限制、PostgreSQL 分布式限流、请求 ID、结构化日志、存活与就绪探针。
- Docker standalone 运行镜像、迁移目标、CI 门禁、浏览器 E2E、WCAG 扫描、依赖审计和生产延迟检查。
- 带完整性校验的 PostgreSQL 备份，以及必须明确确认目标库的恢复命令。

## 真实集成边界

默认公开工作区使用确定性数据。独立公开证据路径可验证声明过的 Circle Gateway / Arc Testnet 样本。登录后的工作区可以从配置的 EIP-7708 起始区块开始，索引任意已保存 Arc Testnet 钱包的原生 USDC 转出事件。同步会优先处理最新区块，并在历史回填到达边界前明确显示为部分完成。

Arc RPC 数据能够证明链上价值流动，但不会推断私有业务语义，也不会自动发现任意 Circle Gateway 元数据。持久化数据还可通过认证 API、内部摄取 API 和来源专用适配器写入。服务商凭据和部署环境仍需由部署者配置。预算目前用于监控、分析和告警，不会签名或阻断链上交易。

## 架构

```text
Privy / OAuth 身份
        │
        ▼
Next.js 应用与 MCP 资源服务器
        │
        ├── 工作区应用服务
        ├── 精确支出分析与风险引擎
        ├── 加密 BYOK 报告生成与 PDF 导出
        └── Arc / Circle / x402 摄取适配器
        │
        ▼
PostgreSQL 租户数据、审计、幂等、租约与限流
```

所有持久化仓储读写都必须携带工作区作用域。写操作同时执行角色检查、输入校验、幂等处理、审计和事务更新。

## 本地公开 Demo

要求：Node.js 22.17+、pnpm 10.12+。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://localhost:3000`。公开 Demo 不需要凭据或数据库。

## 持久化环境

将 `.env.example` 复制为 `.env.local`，并配置：

- PostgreSQL `DATABASE_URL`、可选 `DATABASE_DRIVER` 和高强度内部/限流密钥。
- 32 字节 base64 加密密钥及其 key ID。
- Privy app ID、app secret 和 verification key。
- HTTPS 站点地址与 MCP 地址。
- OAuth issuer、JWKS、audience、claims 和 MCP 允许来源。
- Arc RPC 地址，以及可选的区块范围、分块大小和并发调优参数。

然后执行迁移并启动：

```bash
pnpm db:migrate
pnpm dev
```

OpenAI 采用 BYOK：owner 或 editor 在设置页保存密钥。明文密钥会先加密再持久化，元数据 API 永远不会返回明文。

普通 PostgreSQL 域名和 IP 端点默认使用 `pg` 驱动。以 `.neon.tech` 结尾的 Neon 端点继续使用 Neon serverless 驱动；必要时可通过 `DATABASE_DRIVER=postgres|neon` 显式覆盖自动判断。

## 远程 MCP

Streamable HTTP 端点为 `/mcp`，受保护资源元数据位于 `/.well-known/oauth-protected-resource/mcp`。授权服务器签发的 JWT access token 必须包含已配置的 audience、scope、Privy subject claim 和 workspace claim。工具执行前还会重新查询 PostgreSQL 成员关系。

可用 scope：

- `wallets:read` / `wallets:write`：读取观察钱包和执行可审计的钱包创建。
- `analytics:read`：读取支出摘要、支付和风险信号。
- `budgets:read` / `budgets:write`：读取监控预算和执行可审计的全生命周期管理。
- `reports:read`：生成报告并读取生成结果。

客户端迁移期间仍兼容旧版 `agent-cfo:*` scope，但受保护资源元数据不再对外声明它们。

获取绑定工作区的 access token 后，可使用与桌面 MCP 客户端相同的 Streamable HTTP 客户端契约验证部署：

```bash
MCP_URL=https://your-app.example.com/mcp \
MCP_ACCESS_TOKEN='…' pnpm mcp:check
```

## 验证命令

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

Playwright 覆盖桌面端和移动端公开流程、页面导航、控制台错误、WCAG A/AA、减弱动画与视口溢出。性能门禁会启动生产 standalone 服务，检查存活接口与首页 SSR 的错误率和 p95 延迟。

## 容器部署

```bash
docker build --target runner -t agent-cfo-for-arc .
docker build --target migrate -t agent-cfo-for-arc-migrate .
docker run --env-file .env.production agent-cfo-for-arc-migrate
docker run --env-file .env.production -p 3000:3000 agent-cfo-for-arc
```

每次发布先运行一次迁移目标，再滚动发布应用目标。运行镜像使用非 root 用户，并通过 `/api/health/ready` 检查就绪状态。

## 数据库恢复

以下命令需要 PostgreSQL 客户端工具：

```bash
DATABASE_URL='postgresql://…' pnpm db:backup
RESTORE_DATABASE_URL='postgresql://…' \
  pnpm db:restore -- --backup backups/name.dump --confirm host/database
```

备份采用 PostgreSQL custom format，并生成 SHA-256 manifest。恢复时会先校验完整性，要求逐字确认目标 `host/database`，并在单个事务中执行替换。任何生产恢复前，都应先对一次性数据库完成恢复演练。

## 关键目录

```text
app/          页面、API、健康探针与 MCP transport
components/   仪表盘、工作区、认证与报告 UI
lib/          领域、仓储、服务、安全、AI、MCP 与适配器
drizzle/      版本化 PostgreSQL migration
e2e/          Playwright 公开工作区验收测试
scripts/      部署、性能、备份与恢复验证
```

## 许可证

[MIT](./LICENSE)
