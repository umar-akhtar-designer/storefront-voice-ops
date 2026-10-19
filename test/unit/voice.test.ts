import { describe, expect, it } from "vitest";
import {
  limitSentences,
  listForSpeech,
  moneyForSpeech,
  numberToWords,
  roundForSpeech,
  spellId,
  formatMoney,
} from "../../src/voice.js";

describe("numberToWords", () => {
  it("handles small numbers", () => {
    expect(numberToWords(0)).toBe("zero");
    expect(numberToWords(7)).toBe("seven");
    expect(numberToWords(15)).toBe("fifteen");
    expect(numberToWords(21)).toBe("twenty-one");
    expect(numberToWords(99)).toBe("ninety-nine");
  });

  it("handles hundreds, thousands and millions", () => {
    expect(numberToWords(100)).toBe("one hundred");
    expect(numberToWords(105)).toBe("one hundred and five");
    expect(numberToWords(1000)).toBe("one thousand");
    expect(numberToWords(1234)).toBe("one thousand two hundred and thirty-four");
    expect(numberToWords(1_000_000)).toBe("one million");
    expect(numberToWords(1_000_000_000)).toBe("one billion");
  });
});

describe("roundForSpeech", () => {
  it("rounds to a natural spoken magnitude", () => {
    expect(roundForSpeech(950)).toBe(950);
    expect(roundForSpeech(1234)).toBe(1200);
    expect(roundForSpeech(12345)).toBe(12500);
    expect(roundForSpeech(123456)).toBe(123000);
  });
});

describe("moneyForSpeech", () => {
  it("rounds and words the amount", () => {
    expect(moneyForSpeech(9000, "PKR")).toBe("about nine thousand rupees");
    expect(moneyForSpeech(0, "PKR")).toBe("about zero rupees");
    expect(moneyForSpeech(1800, "PKR", { about: false })).toBe("one thousand eight hundred rupees");
  });

  it("falls back to the currency code for unknown currencies", () => {
    expect(moneyForSpeech(1000, "XYZ", { about: false })).toBe("one thousand XYZ");
  });
});

describe("formatMoney", () => {
  it("formats for screens", () => {
    expect(formatMoney(9000, "PKR")).toBe("9,000 PKR");
  });
});

describe("spellId", () => {
  it("reads pure numeric ids as natural numbers", () => {
    expect(spellId("1042")).toBe("one thousand forty-two");
    expect(spellId("1007")).toBe("one thousand seven");
    expect(spellId("1008")).toBe("one thousand eight");
  });

  it("keeps non-digit characters", () => {
    expect(spellId("C001")).toBe("C oh oh one");
  });
});

describe("listForSpeech", () => {
  it("caps the list at three and summarises the rest", () => {
    expect(listForSpeech([])).toBe("none");
    expect(listForSpeech(["a"])).toBe("a");
    expect(listForSpeech(["a", "b"])).toBe("a and b");
    expect(listForSpeech(["a", "b", "c"])).toBe("a, b and c");
    expect(listForSpeech(["a", "b", "c", "d", "e"])).toBe(
      "a, b and c, and 2 more. Say more for the rest",
    );
  });
});

describe("limitSentences", () => {
  it("keeps at most the requested number of sentences", () => {
    expect(limitSentences("One. Two. Three. Four.", 3)).toBe("One. Two. Three.");
    expect(limitSentences("no punctuation at all")).toBe("no punctuation at all");
  });
});
