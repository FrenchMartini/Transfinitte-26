import { describe, it, expect } from 'vitest';
import { runAllBenchmarks } from '../src/benchmarks';

describe('Hackathon Validation Benchmarks (Section 6)', () => {
  it('passes all 10 benchmarks plus the momentum ledger check', () => {
    const { results, allPassed } = runAllBenchmarks();

    expect(results.length).toBe(11);
    expect(allPassed).toBe(true);

    for (const b of results) {
      expect(b.passed, `Benchmark ${b.id} (${b.name}) failed`).toBe(true);
    }
  });

  it('verifies exact numbers from Section 3 & 6 of the participant guide', () => {
    const { results } = runAllBenchmarks();

    const b1 = results.find((r) => r.id === 1);
    expect(b1?.computed).toContain('10.0000 N');
    expect(b1?.passed).toBe(true);

    const b7 = results.find((r) => r.id === 7);
    expect(b7?.expected).toBe('2.94 + 2.65 km/s, ~259 days');
    expect(b7?.passed).toBe(true);

    const b8 = results.find((r) => r.id === 8);
    expect(b8?.computed).toContain('+3170.1 km');
    expect(b8?.passed).toBe(true);

    const b10 = results.find((r) => r.id === 10);
    expect(b10?.computed).toContain('254.0');
    expect(b10?.passed).toBe(true);
  });
});
