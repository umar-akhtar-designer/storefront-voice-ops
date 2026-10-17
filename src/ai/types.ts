/**
 * The AI layer contract. `bedrock.ts` (Stage 3) provides a Bedrock-backed implementation with an
 * offline fallback; tools depend only on this interface so they stay testable without AWS.
 */

export type AiSource = "bedrock" | "offline";

export interface AiTextResult {
  text: string;
  source: AiSource;
}

export interface ExplainRestockInput {
  sku: string;
  name: string;
  stock: number;
  reorderPoint: number;
  unitsSold: number;
  days: number;
  suggestedQuantity: number;
}

export interface SupplierDraftInput {
  supplierName?: string;
  productName: string;
  sku: string;
  quantity: number;
  currentStock: number;
}

export type CustomerMessageKind = "shipping-update" | "delay" | "thanks";

export interface CustomerDraftInput {
  customerName: string;
  orderId?: string;
  kind: CustomerMessageKind;
  note?: string;
}

export interface AiService {
  /** True when a real model is reachable (USE_BEDROCK on and not killed). */
  readonly enabled: boolean;
  /** Rephrase already-computed briefing facts into 2-3 spoken sentences. */
  phraseBriefing(facts: string): Promise<AiTextResult>;
  /** Explain a restock recommendation in plain, spoken language. */
  explainRestock(input: ExplainRestockInput): Promise<AiTextResult>;
  /** Draft a supplier restock message (never sent automatically). */
  draftSupplierMessage(input: SupplierDraftInput): Promise<AiTextResult>;
  /** Draft a customer message (never sent automatically). */
  draftCustomerMessage(input: CustomerDraftInput): Promise<AiTextResult>;
}
