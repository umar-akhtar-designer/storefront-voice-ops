/**
 * Helpers that turn data into short, speakable text, following the voice writing rules:
 * under 3 spoken sentences, rounded numbers, IDs spelled digit by digit, lists capped at 3.
 */

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const CURRENCY_WORDS: Record<string, string> = {
  PKR: "rupees",
  USD: "dollars",
  EUR: "euros",
  GBP: "pounds",
  INR: "rupees",
  AED: "dirhams",
};

function under1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
    if (n > 0) parts.push("and");
  }
  if (n >= 20) {
    const tens = TENS[Math.floor(n / 10)]!;
    const rest = n % 10;
    parts.push(rest > 0 ? `${tens}-${ONES[rest]}` : tens);
  } else if (n > 0) {
    parts.push(ONES[n]!);
  }
  return parts.join(" ");
}

/** Convert a non-negative integer into spoken words (up to billions). */
export function numberToWords(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return "zero";
  const units: [number, string][] = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ];
  const parts: string[] = [];
  let rest = n;
  for (const [size, label] of units) {
    if (rest >= size) {
      const count = Math.floor(rest / size);
      parts.push(`${under1000(count)} ${label}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(under1000(rest));
  return parts.join(" ");
}

/** Round an amount so it reads naturally when spoken. */
export function roundForSpeech(amount: number): number {
  if (amount >= 100_000) return Math.round(amount / 1000) * 1000;
  if (amount >= 10_000) return Math.round(amount / 500) * 500;
  if (amount >= 1_000) return Math.round(amount / 100) * 100;
  return Math.round(amount);
}

/** For screens and logs: "9,000 PKR". */
export function formatMoney(amount: number, currency = "PKR"): string {
  return `${amount.toLocaleString("en-US")} ${currency}`;
}

/** For speech: "about nine thousand rupees". */
export function moneyForSpeech(
  amount: number,
  currency = "PKR",
  options: { about?: boolean } = {},
): string {
  const about = options.about ?? true;
  const rounded = roundForSpeech(amount);
  const word = CURRENCY_WORDS[currency] ?? currency;
  const spoken = `${numberToWords(rounded)} ${word}`;
  return about ? `about ${spoken}` : spoken;
}

/**
 * Spell an order/product id so it is unmistakable when spoken:
 * "1042" -> "one thousand forty-two"; "1002" -> "one thousand two";
 * lettered codes are read character by character.
 */
export function spellId(id: string): string {
  const digits = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  // Purely-numeric ids: read as a natural number.
  if (/^\d+$/.test(id)) {
    return numberToWords(Number(id));
  }
  // Mixed/lettered ids: character by character ("ORD-4A2B" -> "o r d dash four a two b").
  const out = [...id]
    .map((ch) => {
      if (ch >= "0" && ch <= "9") {
        return ch === "0" ? "oh" : digits[Number(ch)]!;
      }
      return ch;
    })
    .join(" ");
  return out.replace(/\s+/g, " ").trim();
}

/** Join up to `max` items for speech, then summarise the rest. */
export function listForSpeech(items: string[], max = 3): string {
  if (items.length === 0) return "none";
  const shown = items.slice(0, max);
  const remaining = items.length - shown.length;
  const head =
    shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
  if (remaining <= 0) return head;
  return `${head}, and ${remaining} more. Say more for the rest`;
}

/** Truncate to at most `maxSentences` sentences (used as a safety net for generated text). */
export function limitSentences(text: string, maxSentences = 3): string {
  const parts = text
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]+/g);
  if (!parts) return text.trim();
  return parts
    .slice(0, maxSentences)
    .map((part) => part.trim())
    .join(" ")
    .trim();
}
