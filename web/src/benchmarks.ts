import benchmarksReport from '../../reports/benchmarks.json';

export interface BenchmarkResult {
  id: number;
  name: string;
  value: number | Record<string, number>;
  expected: number | Record<string, number>;
  expected_display: string;
  computed: string;
  tolerance: number | Record<string, number>;
  tolerance_display: string;
  source_page: string;
  passed: boolean;
  status: string;
  notes: string;
}

export function runAllBenchmarks(): {
  results: BenchmarkResult[];
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
} {
  const results = benchmarksReport.benchmarks as BenchmarkResult[];
  return {
    results,
    allPassed: Boolean(benchmarksReport.all_passed),
    passedCount: Number(benchmarksReport.passed_count),
    totalCount: Number(benchmarksReport.total_count)
  };
}
