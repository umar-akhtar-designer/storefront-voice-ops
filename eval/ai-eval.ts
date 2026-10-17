/**
 * AI evaluation harness.
 *
 * Runs the eval set through whichever AiService is configured (Bedrock when USE_BEDROCK=1,
 * offline otherwise) and checks the voice/injection invariants. Exits non-zero on any failure.
 *
 *   npm run eval              # offline (no AWS needed)
 *   USE_BEDROCK=1 npm run eval  # against the real model
 */
import { createAiService } from "../src/ai/index.js";
import { evalCases } from "./cases.js";
import { runCase } from "./run.js";

async function main(): Promise<void> {
  const ai = createAiService();
  console.log(
    `AI eval set: ${evalCases.length} cases (source: ${ai.enabled ? "bedrock" : "offline"})\n`,
  );

  let failed = 0;
  for (const c of evalCases) {
    const result = await runCase(ai, c);
    if (result.passed) {
      console.log(`  PASS  ${result.id}  [${result.source}]  ${result.text}`);
    } else {
      failed += 1;
      console.log(`  FAIL  ${result.id}  [${result.source}]`);
      for (const f of result.failures) console.log(`        - ${f}`);
      console.log(`        text: ${result.text}`);
    }
  }

  console.log(`\n${evalCases.length - failed}/${evalCases.length} passed`);
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error("eval failed:", (error as Error).message);
  process.exit(1);
});
