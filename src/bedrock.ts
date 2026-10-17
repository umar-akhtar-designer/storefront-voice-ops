import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "us.amazon.nova-lite-v1:0";
export const bedrockEnabled = () => process.env.USE_BEDROCK === "1";
export const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });

/** Turn raw store numbers into a short spoken briefing. Falls back to a template if Bedrock is off. */
export async function spokenBriefing(facts: string): Promise<string> {
  if (!bedrockEnabled()) return `Here's your store update. ${facts}`;
  try {
    const out = await bedrock.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [
          {
            text: "You are a voice assistant for a small online store owner. Write a warm, concise spoken briefing (max 4 sentences, no markdown). Lead with the most urgent action.",
          },
        ],
        messages: [{ role: "user", content: [{ text: facts }] }],
        inferenceConfig: { maxTokens: 220, temperature: 0.4 },
      }),
    );
    return out.output?.message?.content?.[0]?.text ?? facts;
  } catch (e) {
    console.error("Bedrock briefing failed, using fallback:", (e as Error).message);
    return `Here's your store update. ${facts}`;
  }
}
