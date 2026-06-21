import { spawn } from "node:child_process";

export function databaseConnection(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Database URL is invalid");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Database URL must use the postgres or postgresql protocol");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!url.hostname || !database || !url.username) {
    throw new Error("Database URL must include host, database, and username");
  }
  return {
    identity: `${url.hostname}/${database}`,
    database,
    args: [
      "--host",
      url.hostname,
      "--port",
      url.port || "5432",
      "--username",
      decodeURIComponent(url.username),
      "--dbname",
      database,
    ],
    environment: {
      ...process.env,
      PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: url.searchParams.get("sslmode") ?? "prefer",
    },
  };
}

export function runDatabaseCommand(command, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: environment, stdio: "inherit" });
    child.once("error", (error) => {
      reject(
        error.code === "ENOENT"
          ? new Error(`${command} is required; install the PostgreSQL client tools first`)
          : error,
      );
    });
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(new Error(`${command} failed with ${signal ? `signal ${signal}` : `code ${code}`}`));
    });
  });
}
