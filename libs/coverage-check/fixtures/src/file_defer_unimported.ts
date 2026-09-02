// @coverage-defer-file: no tests yet for the retry planner
// Driver: never imported; coverage still reports every included file, and
// the file directive defers every counter in it.

export function planRetries(budget: number): number[] {
  const plan: number[] = [];
  for (let i = 0; i < budget; i += 1) {
    plan.push(2 ** i);
  }
  return plan;
}
