import {
  mergeVectorClocks,
  compareVectorClocks,
  isLater,
} from './vector_clock';
import { VectorClock } from './types';

describe('Vector Clock Utilities', () => {
  test('mergeVectorClocks', () => {
    const clock1: VectorClock = { m1: 1, m2: 2 };
    const clock2: VectorClock = { m2: 3, m3: 1 };
    const mergedClock = mergeVectorClocks(clock1, clock2);
    expect(mergedClock).toEqual({ m1: 1, m2: 3, m3: 1 });
  });

  test('compareVectorClocks - causally before', () => {
    const clock1: VectorClock = { m1: 1, m2: 2 };
    const clock2: VectorClock = { m1: 1, m2: 3 };
    const clock3: VectorClock = { m1: 2, m2: 3 };
    expect(compareVectorClocks(clock1, clock2)).toEqual(-1);
    expect(compareVectorClocks(clock1, clock3)).toEqual(-1);
    expect(compareVectorClocks(clock2, clock3)).toEqual(-1);
  });

  test('compareVectorClocks - causally after', () => {
    const clock1: VectorClock = { m1: 2, m2: 3 };
    const clock2: VectorClock = { m1: 2, m2: 2 };
    const clock3: VectorClock = { m1: 1, m2: 2 };
    expect(compareVectorClocks(clock1, clock2)).toEqual(1);
    expect(compareVectorClocks(clock1, clock3)).toEqual(1);
    expect(compareVectorClocks(clock2, clock3)).toEqual(1);
  });

  test('compareVectorClocks - concurrent', () => {
    const clock1: VectorClock = { m1: 2, m2: 3 };
    const clock2: VectorClock = { m1: 2, m2: 3 };
    expect(compareVectorClocks(clock1, clock2)).toEqual(0);

    const clock3: VectorClock = { m1: 1, m2: 4 };
    expect(compareVectorClocks(clock1, clock3)).toEqual(0);
    expect(compareVectorClocks(clock3, clock1)).toEqual(0);
  });

  test('isLater', () => {
    const clock1: VectorClock = { m1: 2, m2: 2 };
    const clock2: VectorClock = { m1: 1, m2: 3 };
    expect(isLater(clock1, clock2)).toEqual(true);
    expect(isLater(clock2, clock1)).toEqual(true);
    expect(isLater(clock1, clock1)).toEqual(false);
  });
});
