/**
 * Robust Soliton Distribution for LT codes.
 *
 * Combines the Ideal Soliton Distribution with an additional "spike"
 * to ensure reliable decoding with O(k * ln(k/delta)) symbols.
 */

/**
 * Build the CDF (cumulative distribution function) for the Robust Soliton
 * Distribution with parameters k, c, and delta.
 */
export function buildRobustSolitonCdf(
  k: number,
  c: number,
  delta: number
): number[] {
  // Ideal Soliton Distribution: rho
  // rho(1) = 1/k, rho(d) = 1/(d*(d-1)) for d = 2..k
  const rho = new Array<number>(k + 1);
  rho[0] = 0;
  rho[1] = 1 / k;
  for (let d = 2; d <= k; d++) {
    rho[d] = 1 / (d * (d - 1));
  }

  // Robust component: tau
  const R = c * Math.log(k / delta) * Math.sqrt(k);
  const tau = new Array<number>(k + 1).fill(0);
  const kOverR = Math.floor(k / R);

  for (let d = 1; d <= k; d++) {
    if (d < kOverR) {
      tau[d] = R / (d * k);
    } else if (d === kOverR) {
      tau[d] = (R * Math.log(R / delta)) / k;
    }
    // tau[d] = 0 for d > k/R (already filled)
  }

  // Combined: mu = rho + tau, then normalize
  const mu = new Array<number>(k + 1);
  let sum = 0;
  for (let d = 1; d <= k; d++) {
    mu[d] = rho[d] + tau[d];
    sum += mu[d];
  }

  // Build CDF (degrees 1 through k)
  const cdf = new Array<number>(k);
  let cumulative = 0;
  for (let d = 1; d <= k; d++) {
    cumulative += mu[d] / sum;
    cdf[d - 1] = cumulative;
  }
  // Ensure last entry is exactly 1
  cdf[k - 1] = 1;

  return cdf;
}

/**
 * Sample a degree from the Robust Soliton Distribution using a uniform
 * random number mapped through the CDF via binary search.
 */
export function sampleDegree(cdf: number[], rng: () => number): number {
  const u = (rng() >>> 0) / 0x100000000; // uniform in [0, 1)
  // Binary search for the smallest index where cdf[index] >= u
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cdf[mid] < u) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo + 1; // degrees are 1-indexed
}
