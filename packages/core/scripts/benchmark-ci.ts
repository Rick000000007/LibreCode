import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadBaseline, saveBaseline, parseVitestBenchOutput, detectRegressions, generateBenchmarkReport, saveTrendData } from '../dist/benchmark-regression.js';

const BASELINE_PATH = path.resolve('.benchmark-baseline.json');
const TREND_DIR = path.resolve('.benchmark-trends');
const THRESHOLD_PERCENT = 20;

function getCurrentCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function runBenchmarks(): string {
  console.log('Running benchmarks...');
  const output = execSync('npx vitest bench --run 2>&1', {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return output;
}

function main(): void {
  const commit = getCurrentCommit();
  const output = runBenchmarks();

  console.log('\n--- Raw Output ---\n');
  console.log(output);

  const currentResults = parseVitestBenchOutput(output);

  if (currentResults.length === 0) {
    console.error('ERROR: Could not parse any benchmark results from output.');
    process.exit(1);
  }

  console.log(`\nParsed ${currentResults.length} benchmark results.`);

  saveTrendData(TREND_DIR, currentResults);

  const baseline = loadBaseline(BASELINE_PATH);
  if (baseline) {
    console.log(`\nComparing against baseline from commit ${baseline.commit}...`);
    const regressions = detectRegressions(baseline.results, currentResults, THRESHOLD_PERCENT);
    const report = generateBenchmarkReport(baseline, currentResults, regressions);
    console.log(report);

    if (regressions.length > 0) {
      console.log(`\n⚠ DETECTED ${regressions.length} PERFORMANCE REGRESSION(S) EXCEEDING ${THRESHOLD_PERCENT}%`);
      for (const r of regressions) {
        console.log(`  - ${r.name}: ${r.changePercent.toFixed(1)}% (${r.baselineHz.toFixed(2)} → ${r.currentHz.toFixed(2)} Hz)`);
      }
      process.exit(1);
    }
  } else {
    console.log('No baseline found. Saving current results as baseline.');
  }

  saveBaseline(BASELINE_PATH, currentResults, commit);
  console.log(`Baseline saved to ${BASELINE_PATH}`);
}

main();
