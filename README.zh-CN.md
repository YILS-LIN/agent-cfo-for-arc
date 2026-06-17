# Agent CFO for Arc

<p align="center">
  <strong>Arc 上自主 AI Agent 的实时花销智能控制台。</strong>
</p>

<p align="center">
  Every autonomous agent needs a CFO.
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="#demo-流程">Demo</a> ·
  <a href="#架构">架构</a> ·
  <a href="#路线图">路线图</a>
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-MVP-blue">
  <img alt="Built for Arc" src="https://img.shields.io/badge/built%20for-Arc-7C3AED">
  <img alt="Payments" src="https://img.shields.io/badge/payments-USDC-2775CA">
  <img alt="Agent" src="https://img.shields.io/badge/agent-autonomous-111827">
</p>

Agent CFO for Arc 是一个面向自主 AI Agent 的实时花销智能控制台。用户输入 Agent 钱包地址后，可以看懂这个 Agent 在 Arc 上的 USDC 都花到了哪里：购买了哪些服务、每个任务花费多少、哪些服务商收款最多、是否超出预算，以及是否存在异常或低效支出。

它不只是展示原始钱包交易，而是把 x402 和微支付活动转化成人类可读的 Agent 财务报告。

## 目录

- [项目概览](#项目概览)
- [为什么需要 Agent CFO](#为什么需要-agent-cfo)
- [核心功能](#核心功能)
- [Demo 流程](#demo-流程)
- [示例报告](#示例报告)
- [架构](#架构)
- [工作原理](#工作原理)
- [Lepton 黑客松适配](#lepton-黑客松适配)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [路线图](#路线图)
- [使用场景](#使用场景)
- [项目定位](#项目定位)

## 项目概览

自主 AI Agent 正在成为具备经济行为的软件实体。它们可以自动为 API 调用、数据源、模型服务、算力、存储、内容授权、创作者素材和其他 Agent 服务付费。

这带来了新的信任问题：当 Agent 开始自动花钱之后，用户需要知道它到底买了什么、为什么付款、钱花得是否高效，以及是否遵守了预算。

Agent CFO for Arc 为这套 Agent 经济提供财务可观测性层。

```txt
Agent 钱包：0xA12...89F
累计支出：0.1842 USDC
支付笔数：186
平均单笔：0.00099 USDC
最高类别：数据 API
预算状态：已使用 72%
风险等级：中等
```

## 为什么需要 Agent CFO

传统钱包浏览器只能展示交易，无法解释自主 Agent 的行为。

Agent CFO 回答的是原始交易列表无法回答的问题：

- Agent 到底买了什么？
- 哪些服务商收到了最多付款？
- 每个任务具体花了多少钱？
- Agent 是否遵守预算？
- 是否存在重复、低效或可疑付款？
- 下次任务前应该优化什么？

## 核心功能

### 实时 Agent 支出看板

追踪自主 Agent 钱包的实时 USDC 支出，包括总支出、支付笔数、平均单笔金额、预算使用情况、主要服务商、最高支出类别和风险等级。

### 人类可读的支付时间线

将底层支付活动转化为可读事件。

```txt
12:04:11  支付 0.001 USDC  -> 研究 API
12:04:16  支付 0.003 USDC  -> 高级数据集
12:04:21  支付 0.0005 USDC -> 记忆存储
12:04:32  支付 0.008 USDC  -> 图像模型
```

### 任务级成本归因

按照 Agent 任务聚合付款，并解释每个任务的实际成本。

```txt
任务：研究创作者支付工具
预算：0.05 USDC
已花费：0.037 USDC
状态：预算内
```

### 预算监控

追踪 Agent 是否处于预算内、接近上限、超出预算，或出现异常支出加速。

### 支出分类

将付款归类为数据 API、模型调用、计算资源、存储服务、创作者内容、搜索服务、摘要服务和其他 Agent 服务。

### 风险与效率分析

检测重复购买、重复访问同一数据集、使用意外服务商、过多小额支付、预算超支和支出过度集中等问题。

### 自然语言财务报告

生成 CFO 风格的自然语言报告，用普通语言解释 Agent 的支出行为。

```txt
该 Agent 在预算内完成了任务，共花费 0.037 USDC，预算上限为 0.05 USDC。
主要成本来自付费数据 API 和摘要服务。
最大的低效支出来自对同一个高级数据集的重复访问。
如果加入缓存层，未来同类任务成本预计可降低约 31%。
```

## Demo 流程

项目设计上会配套一个 Demo 研究 Agent，用于展示从自主任务执行、自主支付到用户侧花销分析的完整生命周期。

```txt
用户输入研究任务
        ↓
用户分配预算，例如 0.05 USDC
        ↓
Agent 调用多个受 x402 保护的服务
        ↓
每次服务调用都会触发一笔微支付
        ↓
Agent CFO 实时展示这些付款
        ↓
Agent CFO 生成花销报告
```

示例任务：

```txt
任务：研究创作者支付工具
预算：0.05 USDC
已花费：0.037 USDC

步骤 1：支付搜索 API
步骤 2：支付高级文章源
步骤 3：支付摘要 API
步骤 4：支付引用来源
```

## 示例报告

```txt
Agent CFO 花销报告

Agent 钱包：
0xA12...89F

任务：
研究创作者支付工具

预算：
0.05 USDC

累计支出：
0.037 USDC

预算使用率：
74%

支付笔数：
23

平均单笔：
0.0016 USDC

最高支出类别：
数据 API

主要服务商：
研究 API

风险等级：
中等

总结：
该 Agent 在预算内完成了任务。主要支出流向数据 API、高级文章访问和摘要服务。
其中某个服务商被多次用于获取相似数据，说明存在缓存优化空间。

建议：
缓存重复数据集响应，预计可将未来同类任务成本降低约 31%。
```

## 架构

```txt
Demo 研究 Agent
        ↓
x402 保护服务
        ↓
Arc 上的 USDC 微支付
        ↓
支付事件索引器
        ↓
支出分类引擎
        ↓
预算与风险分析器
        ↓
Agent CFO 控制台
        ↓
人类可读的财务报告
```

Arc 提供结算层，Agent CFO 提供可视化、解释和信任层。

## 工作原理

1. 用户输入自主 Agent 的钱包地址。
2. Agent CFO 获取或监听该钱包关联的支付活动。
3. 系统使用服务商元数据和服务类别增强付款信息。
4. 系统按照任务、服务商、类别和时间聚合付款。
5. 系统计算预算使用情况和风险信号。
6. 系统生成自然语言报告，解释发生了什么以及如何优化。

## Lepton 黑客松适配

Agent CFO 面向 Canteen × Circle × Arc 的 Lepton Agents Hackathon 构建。

它主要对应：

- **RFB 01：Autonomous Paying Agents** - 为会自主发现并购买 x402 资源的 Agent 提供预算与花销智能层。
- **RFB 05：Nanopayment Infrastructure & Tooling** - 为 nanopayment Agent 提供可观测、可调试、可演示的 dashboard 和模拟器。

当前 MVP 使用确定性的 demo adapter，方便评审无需凭证即可完整点击体验。真实 Arc/Circle 集成边界保留在 `lib/arc/client.ts`，后续可接入：

- ARC CLI：获取 Arc testnet RPC 与链上下文。
- Circle CLI / Agent Stack：管理 Agent 钱包与 x402-compatible payment。
- Gateway/Nanopayments：读取批量 USDC nanopayment telemetry。

## 技术栈

- Next.js App Router
- React
- TypeScript
- Tailwind CSS v4
- Zustand-ready 客户端架构
- Lucide 图标系统
- 离线可演示的 deterministic mock Arc adapter
- 纯 TypeScript 分析模块：支出分类、预算分析、风险检测、任务归因和 CFO 报告生成

## 快速开始

要求：

- Node.js 22.17+ 推荐
- pnpm 10.12+

本地运行：

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000`。

常用验证命令：

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Demo 操作：

- 粘贴或编辑 Agent wallet address。
- 点击 **Analyze Wallet**，通过 `/api/agents/[wallet]/summary` 获取花销摘要。
- 点击 **Run Demo Agent**，模拟一个研究 Agent 生成 x402 风格支付事件。
- 查看 KPI、Spend Flow、Recent Payments、风险信号、任务摘要和 AI Insight。

完整工作台页面：

- **Overview**：钱包分析、KPI、支出流、风险和 AI CFO 建议。
- **Wallets**：连接钱包、切换主钱包、复制地址并进入分析。
- **Spend**：检索和筛选完整支付账本，导出 CSV。
- **Providers**：查看服务商集中度，批准或阻止未来付款。
- **Budgets**：编辑任务预算，配置硬停止和付款审查阈值。
- **Risks**：按严重度筛选，将信号推进到调查或解决状态。
- **Tasks**：查看任务成本归因，暂停、恢复和重启 Agent 任务。
- **Settings**：配置通知、安全策略、Webhook 和数据保留，并导出设置。

## 项目结构

```txt
.
├── app/                  # Next.js 路由、API 路由、元数据和全局样式
├── components/
│   ├── dashboard/        # Agent CFO dashboard 组件
│   ├── workspace/        # Wallets、Spend、Providers 等业务页面
│   └── ui/               # 通用 UI primitives
├── lib/
│   ├── analytics/        # 支出分类、预算、任务和风险逻辑
│   ├── arc/              # demo Arc/Circle 集成 adapter 边界
│   ├── demo/             # 黑客松 demo 支付事件流
│   ├── reports/          # CFO 风格报告生成
│   └── utils.ts
├── types/                # 共享领域类型
└── README.md
```

## 路线图

- [x] Agent 钱包地址输入
- [x] 模拟支付时间线
- [x] 总支出与支付笔数
- [x] 预算使用情况追踪
- [x] 服务商与类别拆分
- [x] 任务级成本总结
- [x] 基础异常与低效支出检测
- [x] 自然语言花销报告
- [x] 使用 x402 风格付费服务调用的 Demo 研究 Agent
- [x] 多钱包管理和主钱包切换
- [x] 完整支付账本筛选与 CSV 导出
- [x] 服务商准入、任务预算和支付 guardrail
- [x] 风险调查/解决工作流和任务启停控制
- [x] 通知、安全、Webhook 和数据保留设置
- [ ] 真实 Arc/Circle adapter
- [ ] 可导出的 CFO 报告
- [ ] 多 Agent 组合视图

## 使用场景

### Agent 运营者

理解自主 Agent 正在把钱花在哪里，以及其运行是否高效。

### 开发者

调试付费 Agent 工作流，并识别昂贵的服务调用。

### 协议生态

为机器到机器支付提供更高层级的分析能力。

### 用户

在允许 AI Agent 自主花钱之前建立信任。

## 项目定位

Agent CFO for Arc 不是普通钱包浏览器。

它也不是另一个支付协议。

它是 Arc 上自主 AI Agent 的财务可观测性层。

```txt
Arc 是结算层。
Agent CFO 是信任层和智能解释层。
```

## 标语

**Agent CFO for Arc：让每一个会花钱的 AI Agent，都拥有自己的财务官。**
