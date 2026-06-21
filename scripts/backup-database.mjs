import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { databaseConnection, runDatabaseCommand } from "./database-cli.mjs";

const help = `Usage: pnpm db:backup -- [--output backups/name.dump]

Creates a PostgreSQL custom-format backup and a SHA-256 manifest.
Requires DATABASE_URL and the pg_dump command.`;

if (process.argv.includes("--help")) {
  console.log(help);
  process.exit(0);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const connection = databaseConnection(databaseUrl);
const timestamp = new Date().toISOString().replaceAll(":", "-");
const output = path.resolve(argument("--output") ?? `backups/agent-cfo-${timestamp}.dump`);
if (!output.endsWith(".dump")) throw new Error("Backup output must use the .dump extension");
await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });

await runDatabaseCommand(
  "pg_dump",
  [...connection.args, "--format=custom", "--no-owner", "--no-acl", "--file", output],
  connection.environment,
);
await chmod(output, 0o600);
const contents = await readFile(output);
const metadata = await stat(output);
const manifest = {
  version: 1,
  createdAt: new Date().toISOString(),
  database: connection.identity,
  format: "postgresql-custom",
  bytes: metadata.size,
  sha256: createHash("sha256").update(contents).digest("hex"),
};
const manifestPath = `${output}.json`;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(`Backup created: ${output}`);
console.log(`Manifest created: ${manifestPath}`);
