import { describe, it, expect } from 'vitest';
import { runAllBenchmarks } from '../src/benchmarks';
import benchmarksJson from '../../reports/benchmarks.json';

describe('Hackathon Validation Benchmarks (Loaded from reports/benchmarks.json)', () => {
  it('loads all 10 guide benchmarks directly from reports/benchmarks.json', () => {
    const { results, allPassed, passedCount, totalCount } = runAllBenchmarks();

    expect(results.length).toBe(10);
    expect(totalCount).toBe(10);
    expect(passedCount).toBe(10);
    expect(allPassed).toBe(true);
    expect(results).toEqual(benchmarksJson.benchmarks);

    for (const b of results) {
      expect(b.passed, `Benchmark ${b.id} (${b.name}) failed`).toBe(true);
      expect(b.status).toBe('PASS');
      expect(b.source_page).toBe('Page 9');
    }
  });

  it('contains non-zero dynamically computed values from Python simulation', () => {
    const { results } = runAllBenchmarks();

    const b1 = results.find((r) => r.id === 1);
    expect(b1?.value).toBe(10.0);

    const b4 = results.find((r) => r.id === 4);
    expect((b4?.value as Record<string, number>).pos_rel_err).toBeGreaterThan(0);

    const b5 = results.find((r) => r.id === 5);
    expect(b5?.value as number).toBeGreaterThan(0);

    const b7 = results.find((r) => r.id === 7);
    expect(b7?.expected_display).toBe('2.94 + 2.65 km/s, ~259 days');

    const b8 = results.find((r) => r.id === 8);
    expect(b8?.passed).toBe(true);

    const b10 = results.find((r) => r.id === 10);
    expect(b10?.computed).toContain('254.03 K');
  });
});
