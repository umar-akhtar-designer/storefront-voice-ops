import { config } from "../config.js";
import { BedrockAiService } from "./bedrock.js";
import { offlineAi } from "./offline.js";
import type { AiService } from "./types.js";

export * from "./types.js";
export { OfflineAiService, offlineAi } from "./offline.js";
export { BedrockAiService } from "./bedrock.js";
export {
  UNTRUSTED_DATA_RULE,
  looksLikeInjection,
  sanitizeUntrusted,
  wrapUntrusted,
} from "./guardrails.js";

/** Pick the AI implementation for this process: Bedrock when enabled, offline otherwise. */
export function createAiService(): AiService {
  return config.isBedrockEnabled ? new BedrockAiService() : offlineAi;
}
