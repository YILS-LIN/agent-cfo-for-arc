import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const port = 3210;
const baseUrl = `http://127.0.0.1:${port}`;
const serverPath = path.resolve(".next/standalone/server.js");
await access(serverPath);

const server = spawn(process.execPath, [serverPath], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    DATABASE_URL: "postgresql://benchmark:benchmark@127.0.0.1:5432/benchmark",
    NEXT_PUBLIC_SITE_URL: "https://benchmark.example.com",
    NEXT_PUBLIC_PRIVY_APP_ID: "benchmark-privy-app-00001",
    PRIVY_APP_SECRET: "benchmark-secret-with-safe-length",
    PRIVY_VERIFICATION_KEY: "benchmark-verification-key-with-safe-length",
    SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    SECRETS_ENCRYPTION_KEY_ID: "benchmark-v1",
    INTERNAL_JOB_SECRET: "benchmark-internal-secret-at-least-32-characters",
    RATE_LIMIT_HASH_KEY: "benchmark-rate-limit-key-at-least-32-characters",
    MCP_PUBLIC_URL: "https://benchmark.example.com/mcp",
    MCP_OAUTH_ISSUER: "https://auth.benchmark.example.com",
    MCP_OAUTH_JWKS_URL: "https://auth.benchmark.example.com/.well-known/jwks.json",
    MCP_OAUTH_AUDIENCE: "https://benchmark.example.com/mcp",
    MCP_ALLOWED_ORIGINS: "https://chatgpt.com",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

async function waitUntilReady() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null)
      throw new Error(`Production server exited early\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/health/live`);
      if (response.ok) return;
    } catch {
      // The socket is expected to reject while the server is starting.
    }
    await delay(100);
  }
  throw new Error(`Production server did not become ready\n${serverOutput}`);
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

async function benchmark({ name, pathname, requests, concurrency, maxP95Ms, verify }) {
  const durations = [];
  const errors = [];
  let nextRequest = 0;
  async function worker() {
    while (nextRequest < requests) {
      nextRequest += 1;
      const startedAt = performance.now();
      try {
        const response = await fetch(`${baseUrl}${pathname}`, { cache: "no-store" });
        const body = await response.text();
        if (!response.ok || !verify(body)) errors.push(`${response.status}: ${body.slice(0, 80)}`);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      } finally {
        durations.push(performance.now() - startedAt);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const p95Ms = percentile(durations, 0.95);
  const result = {
    name,
    requests,
    concurrency,
    errors: errors.length,
    p50Ms: Math.round(percentile(durations, 0.5)),
    p95Ms: Math.round(p95Ms),
  };
  console.log(JSON.stringify(result));
  if (errors.length) {
    throw new Error(
      `${name} returned ${errors.length} errors: ${errors[0]}\n${serverOutput.slice(-2_000)}`,
    );
  }
  if (p95Ms > maxP95Ms) {
    throw new Error(`${name} p95 ${Math.round(p95Ms)}ms exceeded ${maxP95Ms}ms`);
  }
}

try {
  await waitUntilReady();
  for (let index = 0; index < 5; index += 1) await fetch(`${baseUrl}/`);
  await benchmark({
    name: "liveness",
    pathname: "/api/health/live",
    requests: 100,
    concurrency: 10,
    maxP95Ms: 250,
    verify: (body) => body.includes('"status":"ok"'),
  });
  await benchmark({
    name: "homepage-ssr",
    pathname: "/",
    requests: 30,
    concurrency: 5,
    maxP95Ms: 1_000,
    verify: (body) => body.includes("Agent CFO for Arc"),
  });
} finally {
  server.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(5_000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
