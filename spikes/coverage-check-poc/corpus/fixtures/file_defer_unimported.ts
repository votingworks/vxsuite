// @coverage-defer-file: no tests yet for the retry planner

export function planRetries(budget: number): number[] {
  const plan: number[] = [];
  for (let i = 0; i < budget; i += 1) {
    plan.push(2 ** i);
  }
  return plan;
}
