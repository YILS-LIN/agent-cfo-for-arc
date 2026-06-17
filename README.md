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

## Tech Stack

The implementation is under active development. This README will be updated with the concrete stack once the MVP code is finalized.

Planned technical areas include:

- Agent payment telemetry
- x402-style paid service calls
- Arc USDC payment activity
- Spend classification
- Budget and risk analysis
- Real-time dashboard UI
- Natural language report generation

## Quick Start

The implementation is under active development. Setup instructions will be added once the MVP code is available.

Expected local workflow:

```bash
# Install dependencies
# Run the local development server
# Open the Agent CFO dashboard
```

## Project Structure

The repository structure will be documented as the implementation is added.

Expected modules:

```txt
.
├── dashboard/        # Agent CFO user interface
├── agent/            # Demo research agent
├── services/         # x402-style paid service integrations
├── analytics/        # Spend classification and risk analysis
└── README.md
```

## Roadmap

- [ ] Agent wallet address input
- [ ] Real-time payment timeline
- [ ] Total spend and payment count
- [ ] Budget usage tracking
- [ ] Provider and category breakdown
- [ ] Task-level cost summary
- [ ] Basic anomaly and inefficiency detection
- [ ] Natural language spend report
- [ ] Demo research agent using x402-style paid service calls
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
