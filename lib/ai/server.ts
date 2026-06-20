import "server-only";

import { AiCredentialService } from "@/lib/ai/credential-service";
import { getDatabase } from "@/lib/db/client";
import { SecretVault } from "@/lib/secrets/vault";

let credentialService: AiCredentialService | undefined;

export function getAiCredentialService() {
  credentialService ??= new AiCredentialService(getDatabase(), SecretVault.fromEnvironment());
  return credentialService;
}
