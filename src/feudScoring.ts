export const multiplierForRound = (round: number): number => {
  if (round >= 4) return 3;
  if (round === 3) return 2;
  return 1;
};
