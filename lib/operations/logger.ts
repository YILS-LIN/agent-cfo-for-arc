type LogContext = Record<string, string | number | boolean | null | undefined>;

function serializedError(error: unknown) {
  if (!(error instanceof Error)) {
    return { name: "UnknownError", message: "Non-error value thrown" };
  }
  return {
    name: error.name,
    message: error.message,
    ...(process.env.NODE_ENV !== "production" && error.stack ? { stack: error.stack } : {}),
  };
}

export function logError(event: string, error: unknown, context: LogContext = {}) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event,
      ...context,
      error: serializedError(error),
    }),
  );
}
