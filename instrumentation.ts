import { validateProductionEnvironment } from "@/lib/operations/config";
import { logError } from "@/lib/operations/logger";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    try {
      validateProductionEnvironment(process.env);
    } catch (error) {
      logError("startup.configuration_invalid", error);
      process.exit(1);
    }
  }
}
