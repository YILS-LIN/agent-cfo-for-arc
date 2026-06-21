import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { databaseConnection, runDatabaseCommand } from "./database-cli.mjs";

const help = `Usage: pnpm db:restore -- --backup backups/name.dump --confirm host/database

Verifies the backup manifest, then replaces objects in RESTORE_DATABASE_URL inside one transaction.
RESTORE_DATABASE_URL is intentionally separate from DATABASE_URL. Requires pg_restore.`;

if (process.argv.includes("--help")) {
  console.log(help);
  process.exit(0);
}

function requiredArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}

const targetUrl = process.env.RESTORE_DATABASE_URL;
if (!targetUrl) throw new Error("RESTORE_DATABASE_URL is required");
const connection = databaseConnection(targetUrl);
const confirmation = requiredArgument("--confirm");
if (confirmation !== connection.identity) {
  throw new Error(`Restore confirmation must exactly equal ${connection.identity}`);
}

const backup = path.resolve(requiredArgument("--backup"));
const contents = await readFile(backup);
const manifest = JSON.parse(await readFile(`${backup}.json`, "utf8"));
const digest = createHash("sha256").update(contents).digest("hex");
if (manifest.version !== 1 || manifest.format !== "postgresql-custom") {
  throw new Error("Backup manifest format is unsupported");
}
if (manifest.bytes !== contents.length || manifest.sha256 !== digest) {
  throw new Error("Backup integrity verification failed");
}

await runDatabaseCommand(
  "pg_restore",
  [
    ...connection.args,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-acl",
    "--exit-on-error",
    "--single-transaction",
    backup,
  ],
  connection.environment,
);
console.log(`Restore completed for ${connection.identity}`);
