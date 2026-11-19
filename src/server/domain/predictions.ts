export function isPredictionOpen(startsAt: Date, serverNow: Date): boolean {
  return serverNow.getTime() < startsAt.getTime();
}
export function scoreWinnerPrediction(
  predicted: string,
  actual: string,
  points = 10,
): number {
  if (!Number.isInteger(points) || points < 0)
    throw new Error("Points must be a non-negative integer.");
  return predicted === actual ? points : 0;
}
