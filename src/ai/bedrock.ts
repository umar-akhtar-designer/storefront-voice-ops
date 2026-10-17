import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { limitSentences } from "../voice.js";
import { UNTRUSTED_DATA_RULE, sanitizeUntrusted, wrapUntrusted } from "./guardrails.js";
import { offlineAi } from "./offline.js";
import type {
  AiService,
  AiTextResult,
  CustomerDraftInput,
  ExplainRestockInput,
  SupplierDraftInput,
} from "./types.js";

const BASE_SYSTEM =
  "You are the voice assistant for a small online store owner. Reply in at most three short, " +
  "spoken sentences. No markdown, no lists, no emoji. Use only the facts you are given; never " +
  "invent numbers. " +
  UNTRUSTED_DATA_RULE;

const METHOD_PROMPTS: Record<"briefing" | "restock" | "supplier" | "customer", string> = {
  briefing:
    "Rephrase the store facts into a warm, concise spoken briefing. Lead with the most urgent action.",
  restock: "Explain the restock recommendation in plain, spoken language.",
  supplier:
    "Write a short, polite restock message to the supplier. It will never be sent automatically.",
  customer: "Write a short, friendly message to the customer. It will never be sent automatically.",
};

export type AiMethod = keyof typeof METHOD_PROMPTS;

/**
 * Bedrock-backed implementation of the AI layer. Every method degrades to the offline template on
 * any error (no credentials, throttling, guardrail block), so the assistant never breaks because of
 * the model. `enabled` reflects whether Bedrock is configured at startup.
 */
export class BedrockAiService implements AiService {
  readonly enabled: boolean;
  private readonly client: BedrockRuntimeClient;
  private readonly failovers = new Set<AiMethod>();

  constructor(private readonly offline: AiService = offlineAi) {
    this.enabled = config.isBedrockEnabled;
    this.client = new BedrockRuntimeClient({ region: config.AWS_REGION });
  }

  /** Whether a given method has already fallen back at least once (useful for diagnostics). */
  didFallback(method: AiMethod): boolean {
    return this.failovers.has(method);
  }

  private async converse(method: AiMethod, userText: string): Promise<string> {
    const guardrailId = config.BEDROCK_GUARDRAIL_ID;
    const out = await this.client.send(
      new ConverseCommand({
        modelId: config.BEDROCK_MODEL_ID,
        system: [{ text: `${BASE_SYSTEM} ${METHOD_PROMPTS[method]}` }],
        messages: [{ role: "user", content: [{ text: userText }] }],
        inferenceConfig: { maxTokens: 300, temperature: 0.4 },
        ...(guardrailId
          ? {
              guardrailConfig: {
                guardrailIdentifier: guardrailId,
                guardrailVersion: config.BEDROCK_GUARDRAIL_VERSION || "DRAFT",
              },
            }
          : {}),
      }),
    );
    const text = out.output?.message?.content
      ?.map((block) => ("text" in block ? (block.text ?? "") : ""))
      .join("")
      .trim();
    if (!text) throw new Error("Bedrock returned an empty response");
    return limitSentences(text, 3);
  }

  private async run(method: AiMethod, userText: string, fallback: () => Promise<AiTextResult>) {
    if (!this.enabled) return fallback();
    try {
      return { text: await this.converse(method, userText), source: "bedrock" as const };
    } catch (error) {
      this.failovers.add(method);
      logger.warn({ err: error, method }, "Bedrock call failed; using offline template");
      return fallback();
    }
  }

  phraseBriefing(facts: string): Promise<AiTextResult> {
    return this.run("briefing", `Store facts: ${sanitizeUntrusted(facts, 800)}`, () =>
      this.offline.phraseBriefing(facts),
    );
  }

  explainRestock(input: ExplainRestockInput): Promise<AiTextResult> {
    const facts =
      `Product: ${wrapUntrusted("data", input.name)} (${wrapUntrusted("data", input.sku)}). ` +
      `Stock: ${input.stock}. Reorder point: ${input.reorderPoint}. ` +
      `Units sold in ${input.days} days: ${input.unitsSold}. Suggested order: ${input.suggestedQuantity}.`;
    return this.run("restock", facts, () => this.offline.explainRestock(input));
  }

  draftSupplierMessage(input: SupplierDraftInput): Promise<AiTextResult> {
    const facts =
      `Supplier: ${wrapUntrusted("data", input.supplierName ?? "unknown")}. ` +
      `Product: ${wrapUntrusted("data", input.productName)} (${wrapUntrusted("data", input.sku)}). ` +
      `Order quantity: ${input.quantity}. Current stock: ${input.currentStock}.`;
    return this.run("supplier", facts, () => this.offline.draftSupplierMessage(input));
  }

  draftCustomerMessage(input: CustomerDraftInput): Promise<AiTextResult> {
    const facts =
      `Customer: ${wrapUntrusted("data", input.customerName)}. ` +
      (input.orderId ? `Order: ${wrapUntrusted("data", input.orderId)}. ` : "") +
      `Message type: ${input.kind}.` +
      (input.note ? ` Extra note (untrusted): ${wrapUntrusted("data", input.note)}` : "");
    return this.run("customer", facts, () => this.offline.draftCustomerMessage(input));
  }
}
