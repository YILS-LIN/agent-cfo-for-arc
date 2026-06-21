import { access, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".next/standalone");
await access(path.join(root, "server.js"));

async function containsFont(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && (await containsFont(target))) return true;
    if (entry.isFile() && entry.name === "NotoSansSC_400Regular.ttf") return true;
  }
  return false;
}

if (!(await containsFont(path.join(root, "node_modules")))) {
  throw new Error("Standalone output is missing the report PDF font");
}

console.log("Standalone server and report font are present.");
