import { describe, expect, it } from "vitest";
import { dropRepeatedSentences, hasRepetition } from "./repetition";

describe("hasRepetition", () => {
  it("flags the same list restated", () => {
    const t = "Rockstar Games tracks Grand Theft Auto and Red Dead Redemption. Its notable franchises include Grand Theft Auto and Red Dead Redemption.";
    expect(hasRepetition(t)).toBe(true);
  });
  it("passes sentences that each add a fact", () => {
    const t = "Rockstar Games has 7 tracked titles. Most of them, 5 of 7, use Denuvo. The publisher is headquartered in North America.";
    expect(hasRepetition(t)).toBe(false);
  });
  it("drops repeats and keeps the rest", () => {
    const t = "Capcom has 12 tracked titles. Capcom has twelve titles tracked. Eight use Denuvo.";
    expect(dropRepeatedSentences(t)).toBe("Capcom has 12 tracked titles. Eight use Denuvo.");
  });
});
