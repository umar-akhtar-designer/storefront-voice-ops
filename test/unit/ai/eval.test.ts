import { describe, expect, it } from "vitest";
import { offlineAi } from "../../../src/ai/offline.js";
import { evalCases } from "../../../eval/cases.js";
import { runCase } from "../../../eval/run.js";

describe("AI eval set (offline)", () => {
  for (const c of evalCases) {
    it(`${c.id} satisfies the voice and injection invariants`, async () => {
      const result = await runCase(offlineAi, c);
      expect(result.failures).toEqual([]);
      expect(result.passed).toBe(true);
    });
  }
});
