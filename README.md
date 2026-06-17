# Agent CFO for Arc

<p align="center">
  <strong>Real-time spend intelligence for autonomous AI agents on Arc.</strong>
</p>

<p align="center">
  Every autonomous agent needs a CFO.
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="#demo-flow">Demo</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-MVP-blue">
  <img alt="Built for Arc" src="https://img.shields.io/badge/built%20for-Arc-7C3AED">
  <img alt="Payments" src="https://img.shields.io/badge/payments-USDC-2775CA">
  <img alt="Agent" src="https://img.shields.io/badge/agent-autonomous-111827">
</p>

Agent CFO for Arc is a real-time spend intelligence console for autonomous AI agents. It helps users understand where an agent's USDC is going on Arc, what services it paid for, how much each task cost, whether the agent stayed within budget, and whether there were unusual or inefficient spending patterns.

Instead of showing raw wallet transactions, Agent CFO turns x402 and nanopayment activity into a human-readable financial report for agent operators.

## Table of Contents

- [Overview](#overview)
- [Why Agent CFO](#why-agent-cfo)
- [Features](#features)
- [Demo Flow](#demo-flow)
- [Example Report](#example-report)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Lepton Hackathon Fit](#lepton-hackathon-fit)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Use Cases](#use-cases)
- [Positioning](#positioning)

## Overview

Autonomous agents are becoming economically active. They can pay for API calls, datasets, model services, compute, storage, licensed content, creator assets, and other agent services.

That creates a new trust problem: once an agent starts spending money automatically, users need to understand what it bought, why it paid, whether the spend was efficient, and whether the agent respected its budget.

Agent CFO for Arc provides the financial observability layer for that agent economy.

```txt
Agent: 0xA12...89F
Total Spend: 0.1842 USDC
Payments: 186
Average Payment: 0.00099 USDC
Top Category: Data APIs
Budget Status: 72% used
Risk Level: Medium
```

## Why Agent CFO

Traditional wallet explorers show transactions. They do not explain autonomous agent behavior.

Agent CFO answers questions that raw transaction lists cannot:

- What did the agent buy?
- Which providers received the most payments?
- How much did each task cost?
- Did the agent stay within budget?
- Were there duplicate, inefficient, or suspicious payments?
- What should be optimized before the next task?

## Features

### Real-Time Agent Spend Dashboard

Track live USDC outflows from an autonomous agent wallet, including total spend, payment count, average payment size, budget usage, top providers, top categories, and risk level.

### Human-Readable Payment Timeline

Convert low-level payment activity into readable events.

```txt
12:04:11  Paid 0.001 USDC  -> Research API
12:04:16  Paid 0.003 USDC  -> Premium Dataset
12:04:21  Paid 0.0005 USDC -> Memory Store
12:04:32  Paid 0.008 USDC  -> Image Model
```

### Task-Level Cost Attribution

Group payments by agent task and explain the actual cost of each task.

```txt
Task: Research creator payment tools
Budget: 0.05 USDC
Spent: 0.037 USDC
Status: Within budget
```

### Budget Monitoring

Track whether an agent is under budget, near its limit, over budget, or showing unusual spend acceleration.

### Spend Categorization

Classify payments into categories such as data APIs, model calls, compute, storage, creator content, search, summarization, and other agent services.

### Risk and Efficiency Analysis

Detect repeated purchases, duplicate dataset access, unexpected provider usage, excessive small payments, budget overruns, and abnormal spend concentration.

### Natural Language Financial Report

Generate a CFO-style explanation of the agent's spending behavior.

```txt
The agent completed the task within budget, spending 0.037 USDC out of 0.05 USDC.
Most of the cost came from paid data APIs and summarization services.
The largest inefficiency was repeated access to the same premium dataset.
Adding a cache layer could reduce future task cost by approximately 31%.
```

## Demo Flow

The project is designed to pair the dashboard with a demo research agent, showing the complete lifecycle from autonomous task execution to autonomous payment and user-facing spend analysis.

```txt
User enters a research task
        ↓
User assigns a budget, for example 0.05 USDC
        ↓
The agent calls several x402-protected services
        ↓
Each service call triggers a micropayment
        ↓
Agent CFO displays payments in real time
        ↓
Agent CFO generates a spend report
```

Example task:

```txt
Task: Research creator payment tools
Budget: 0.05 USDC
Spent: 0.037 USDC

Step 1: Paid Search API
Step 2: Paid Premium Article Source
Step 3: Paid Summarization API
Step 4: Paid Citation Source
```

## Example Report

```txt
Agent CFO Report

Agent Wallet:
0xA12...89F

Task:
Research creator payment tools

Budget:
0.05 USDC

Total Spend:
0.037 USDC

Budget Used:
74%

Payment Count:
23

Average Payment:
0.0016 USDC

Top Category:
Data APIs

Top Provider:
Research API

Risk Level:
Medium

Summary:
The agent completed the task within budget. Most spending went to data APIs,
premium article access, and summarization services. One provider was called
multiple times for similar data, suggesting a caching opportunity.

Recommendation:
Cache repeated dataset responses to reduce future task cost by approximately 31%.
```

## Architecture

```txt
Demo Research Agent
        ↓
x402-Protected Services
        ↓
USDC Nanopayments on Arc
        ↓
Payment Event Indexer
        ↓
Spend Classification Engine
        ↓
Budget and Risk Analyzer
        ↓
Agent CFO Dashboard
        ↓
Human-Readable Financial Report
```

Arc provides the settlement layer. Agent CFO provides the visibility, interpretation, and trust layer.

## How It Works

1. A user enters an autonomous agent wallet address.
2. Agent CFO fetches or listens to payment activity associated with that wallet.
3. Payments are enriched with provider metadata and service categories.
4. The system groups payments by task, provider, category, and time.
5. Budget usage and risk signals are calculated.
6. A natural language report explains what happened and what can be improved.

## Lepton Hackathon Fit

Agent CFO is built for the Lepton Agents Hackathon hosted by Canteen with Circle and Arc.

It maps most closely to:

- **RFB 01: Autonomous Paying Agents** - a budget and spend intelligence layer for agents that discover and pay for x402-protected resources.
- **RFB 05: Nanopayment Infrastructure & Tooling** - a dashboard and simulator that makes nanopayment-enabled agents easier to observe and debug.

The current MVP uses a deterministic demo adapter so judges can click through the full product without credentials. The architecture keeps the Arc/Circle integration behind `lib/arc/client.ts`, which is where a production adapter can call:

- ARC CLI for Arc testnet RPC and chain context.
- Circle CLI / Agent Stack for agent wallets and x402-compatible payments.
- Gateway/Nanopayments for batched USDC nanopayment telemetry.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS v4
- Zustand-ready client architecture
- Lucide icon system
- Deterministic mock Arc adapter for offline judging
- Pure TypeScript analytics modules for spend classification, budget analysis, risk detection, task attribution, and CFO report generation

## Quick Start

Requirements:

- Node.js 22.17+ recommended
- pnpm 10.12+

Run locally:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

Useful validation commands:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Demo actions:

- Paste or edit the Agent wallet address.
- Click **Analyze Wallet** to fetch a spend summary through `/api/agents/[wallet]/summary`.
- Click **Run Demo Agent** to simulate a research agent generating x402-style payment events.
- Review the KPI cards, spend flow, recent payments, risk signals, task summary, and AI insight.

Complete workspace pages:

- **Overview**: wallet analysis, KPIs, spend flow, risks, and AI CFO recommendations.
- **Wallets**: connect wallets, switch the primary wallet, copy addresses, and analyze an account.
- **Spend**: search and filter the full payment ledger, then export CSV.
- **Providers**: inspect concentration and approve or block future payments.
- **Budgets**: edit task limits and configure hard stops and review thresholds.
- **Risks**: filter by severity and move signals through investigation and resolution.
- **Tasks**: inspect cost attribution and pause, resume, or restart agent tasks.
- **Settings**: configure alerts, security, webhooks, retention, and exportable settings.

## Project Structure

```txt
.
├── app/                  # Next.js routes, API routes, metadata, global styles
├── components/
│   ├── dashboard/        # Agent CFO dashboard components
│   ├── workspace/        # Wallets, Spend, Providers, and governance pages
│   └── ui/               # Reusable UI primitives
├── lib/
│   ├── analytics/        # Spend classification, budget, task, and risk logic
│   ├── arc/              # Adapter boundary for demo Arc/Circle integration
│   ├── demo/             # Deterministic hackathon demo payment stream
│   ├── reports/          # CFO-style report generation
│   └── utils.ts
├── types/                # Shared domain types
└── README.md
```

## Roadmap

- [x] Agent wallet address input
- [x] Simulated payment timeline
- [x] Total spend and payment count
- [x] Budget usage tracking
- [x] Provider and category breakdown
- [x] Task-level cost summary
- [x] Basic anomaly and inefficiency detection
- [x] Natural language spend report
- [x] Demo research agent using x402-style paid service calls
- [x] Multi-wallet management and primary-wallet switching
- [x] Full ledger filtering and CSV export
- [x] Provider approval, task budgets, and payment guardrails
- [x] Risk investigation workflow and task lifecycle controls
- [x] Notification, security, webhook, and retention settings
- [ ] Production Arc/Circle adapter
- [ ] Exportable CFO report
- [ ] Multi-agent portfolio view

## Use Cases

### Agent Operators

Understand what an autonomous agent is spending money on and whether it is operating efficiently.

### Developers

Debug paid agent workflows and identify expensive service calls.

### Protocol Ecosystems

Show higher-level analytics for machine-to-machine payments.

### Users

Gain confidence before allowing an AI agent to spend autonomously.

## Positioning

Agent CFO for Arc is not a wallet explorer.

It is not another payment protocol.

It is the financial observability layer for autonomous AI agents on Arc.

```txt
Arc is the settlement layer.
Agent CFO is the trust and intelligence layer.
```

## Tagline

**Agent CFO for Arc: Let every AI agent that spends money have its own CFO.**
