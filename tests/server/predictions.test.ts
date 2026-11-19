import { describe, expect, it } from "vitest";
import {
  isPredictionOpen,
  scoreWinnerPrediction,
} from "~/server/domain/predictions";
import { requireAdmin } from "~/server/domain/permissions";
describe("server prediction invariants", () => {
  const start = new Date("2027-01-01T12:00:00Z");
  it("locks at the exact server deadline and remains closed afterward", () => {
    expect(isPredictionOpen(start, new Date(start.getTime() - 1))).toBe(true);
    expect(isPredictionOpen(start, start)).toBe(false);
    expect(isPredictionOpen(start, new Date(start.getTime() + 1))).toBe(false);
  });
  it("scores correct predictions and rejects invalid scoring rules", () => {
    expect(scoreWinnerPrediction("atlas", "atlas", 20)).toBe(20);
    expect(scoreWinnerPrediction("nova", "atlas", 20)).toBe(0);
    expect(() => scoreWinnerPrediction("atlas", "atlas", -1)).toThrow();
  });
  it("denies spectators, players and missing users administrator rights", () => {
    for (const role of [undefined, "SPECTATOR", "PLAYER"])
      expect(() => requireAdmin(role)).toThrow();
    expect(() => requireAdmin("ADMIN")).not.toThrow();
  });
});
