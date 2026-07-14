import * as fs from 'node:fs';
import * as path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

export interface BenchmarkResult {
  name: string;
  hz: number;
  mean: number;
  p99: number;
  samples: number;
}

export interface BenchmarkBaseline {
  timestamp: number;
  commit: string;
  results: BenchmarkResult[];
}

export interface RegressionResult {
  name: string;
  baselineHz: number;
  currentHz: number;
  changePercent: number;
  isRegression: boolean;
}

export function loadBaseline(baselinePath: string): BenchmarkBaseline | null {
  try {
    const data = fs.readFileSync(baselinePath, 'utf-8');
    return JSON.parse(data) as BenchmarkBaseline;
  } catch {
    return null;
  }
}

export function saveBaseline(baselinePath: string, results: BenchmarkResult[], commit: string): void {
  const baseline: BenchmarkBaseline = {
    timestamp: Date.now(),
    commit,
    results,
  };
  const dir = path.dirname(baselinePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), 'utf-8');
}

export function parseVitestBenchOutput(output: string): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  const clean = stripVTControlCharacters(output);
  const lines = clean.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*·\s+(.+?)\s+([\d,.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (match) {
      results.push({
        name: match[1]!.trim(),
        hz: parseFloat(match[2]!.replace(/,/g, '')),
        mean: parseFloat(match[3]!),
        p99: parseFloat(match[7]!),
        samples: 0,
      });
    }
  }
  return results;
}

export function detectRegressions(
  baseline: BenchmarkResult[],
  current: BenchmarkResult[],
  thresholdPercent: number = 20,
): RegressionResult[] {
  const regressions: RegressionResult[] = [];
  const baselineMap = new Map(baseline.map(r => [r.name, r]));

  for (const cur of current) {
    const base = baselineMap.get(cur.name);
    if (!base) continue;

    const changePercent = base.hz > 0 ? ((cur.hz - base.hz) / base.hz) * 100 : 0;
    if (changePercent < -thresholdPercent) {
      regressions.push({
        name: cur.name,
        baselineHz: base.hz,
        currentHz: cur.hz,
        changePercent,
        isRegression: true,
      });
    }
  }

  return regressions;
}

export function generateBenchmarkReport(
  baseline: BenchmarkBaseline | null,
  current: BenchmarkResult[],
  regressions: RegressionResult[],
): string {
  let report = `# Benchmark Report\n\n`;
  report += `- **Generated**: ${new Date().toISOString()}\n`;
  report += `- **Baseline commit**: ${baseline?.commit ?? 'none'}\n`;
  report += `- **Baseline timestamp**: ${baseline ? new Date(baseline.timestamp).toISOString() : 'none'}\n\n`;

  if (regressions.length > 0) {
    report += `## ⚠ Performance Regressions Detected\n\n`;
    report += `| Benchmark | Baseline (Hz) | Current (Hz) | Change |\n`;
    report += `|---|---|---|---|\n`;
    for (const r of regressions) {
      report += `| ${r.name} | ${r.baselineHz.toFixed(2)} | ${r.currentHz.toFixed(2)} | ${r.changePercent.toFixed(1)}% |\n`;
    }
    report += `\n`;
  } else {
    report += `## ✅ No Performance Regressions\n\n`;
  }

  report += `## Current Benchmark Results\n\n`;
  report += `| Benchmark | Hz | Mean (ms) | p99 (ms) |\n`;
  report += `|---|---|---|---|\n`;
  for (const r of current) {
    report += `| ${r.name} | ${r.hz.toFixed(2)} | ${r.mean.toFixed(3)} | ${r.p99.toFixed(3)} |\n`;
  }

  return report;
}

export function saveTrendData(trendDir: string, results: BenchmarkResult[]): void {
  const dir = path.resolve(trendDir);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `bench-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ timestamp: Date.now(), results }, null, 2), 'utf-8');
}
