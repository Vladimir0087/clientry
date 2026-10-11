export const DEAL_LIMITS = {
  title: 200,
  // One billion in major units; every listed currency has two minor digits.
  maxAmount: 100_000_000_000,
  boardColumn: 100,
  history: 100,
  clientDeals: 50,
} as const;

export const STAGE_LIMITS = {
  name: 50,
  openStages: 10,
} as const;
