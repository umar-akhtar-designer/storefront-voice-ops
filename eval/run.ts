import { looksLikeInjection } from "../src/ai/guardrails.js";
import type {
  AiService,
  AiTextResult,
  CustomerDraftInput,
  ExplainRestockInput,
  SupplierDraftInput,
} from "../src/ai/types.js";
import type { EvalCase } from "./cases.js";

export interface EvalResult {
  id: string;
  method: string;
  source: string;
  text: string;
  passed: boolean;
  failures: string[];
}

export function countSentences(text: string): number {
  const matches = text.trim().match(/[^.!?]+[.!?]+/g);
  return matches ? matches.length : text.trim().length > 0 ? 1 : 0;
}

function hasMarkdown(text: string): boolean {
  return /(^|\n)\s*([-*+]\s|\d+\.\s|#{1,6}\s)|\*\*|__|`/.test(text);
}

async function invoke(ai: AiService, c: EvalCase): Promise<AiTextResult> {
  switch (c.method) {
    case "phraseBriefing":
      return ai.phraseBriefing(c.input as string);
    case "explainRestock":
      return ai.explainRestock(c.input as ExplainRestockInput);
    case "draftSupplierMessage":
      return ai.draftSupplierMessage(c.input as SupplierDraftInput);
    case "draftCustomerMessage":
      return ai.draftCustomerMessage(c.input as CustomerDraftInput);
  }
}

/** The untrusted strings in a case's input (used for the injection heuristic check). */
function untrustedText(c: EvalCase): string {
  if (typeof c.input === "string") return c.input;
  const record = c.input as unknown as Record<string, unknown>;
  return [record.customerName, record.note, record.productName, record.supplierName]
    .filter((v): v is string => typeof v === "string")
    .join(" ");
}

export async function runCase(ai: AiService, c: EvalCase): Promise<EvalResult> {
  const failures: string[] = [];
  const result = await invoke(ai, c);
  const text = result.text;
  const lower = text.toLowerCase();

  if (!text.trim()) failures.push("empty output");
  if (result.source !== "bedrock" && result.source !== "offline")
    failures.push(`bad source: ${result.source}`);
  if (hasMarkdown(text)) failures.push("contains markdown");

  if (c.maxSentences !== undefined && countSentences(text) > c.maxSentences) {
    failures.push(`too many sentences: ${countSentences(text)} > ${c.maxSentences}`);
  }
  for (const needle of c.mustInclude ?? []) {
    if (!lower.includes(needle.toLowerCase())) failures.push(`missing "${needle}"`);
  }
  for (const needle of c.mustNotInclude ?? []) {
    if (lower.includes(needle.toLowerCase())) failures.push(`unexpected "${needle}"`);
  }
  if (c.expectsInjection && !looksLikeInjection(untrustedText(c))) {
    failures.push("injection heuristic did not flag the input");
  }

  return {
    id: c.id,
    method: c.method,
    source: result.source,
    text,
    passed: failures.length === 0,
    failures,
  };
}
