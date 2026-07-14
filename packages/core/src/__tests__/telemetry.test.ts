import { describe, it, expect } from 'vitest';
import { Telemetry, CostTracker } from '../telemetry';

describe('Telemetry', () => {
  it('generates empty report initially', () => {
    const tel = new Telemetry();
    const report = tel.generateReport();
    expect(report.totalTurns).toBe(0);
    expect(report.toolStats).toEqual([]);
  });

  it('records tool calls', () => {
    const tel = new Telemetry();
    tel.recordToolCall('read_file', true, 100);
    tel.recordToolCall('write_file', false, 200);
    const stats = tel.getToolStats();
    expect(stats.length).toBe(2);
  });

  it('records turns', () => {
    const tel = new Telemetry();
    tel.recordTurn(1, { promptTokens: 100, completionTokens: 50, totalTokens: 150 }, 2, 1000);
    const report = tel.generateReport();
    expect(report.totalTurns).toBe(1);
    expect(report.totalTokens.totalTokens).toBe(150);
  });

  it('formats report', () => {
    const tel = new Telemetry();
    tel.recordToolCall('read_file', true, 50);
    tel.recordTurn(1, { promptTokens: 100, completionTokens: 50, totalTokens: 150 }, 1, 500);

    const report = tel.formatReport();
    expect(report).toContain('Performance Report');
    expect(report).toContain('read_file');
  });

  it('tracks memory', () => {
    const tel = new Telemetry();
    tel.recordMemory();
    tel.recordMemory();
    const report = tel.generateReport();
    expect(report).toBeDefined();
  });

  it('resets state', () => {
    const tel = new Telemetry();
    tel.recordToolCall('test', true, 10);
    tel.reset();
    expect(tel.getToolStats()).toEqual([]);
  });
});

describe('CostTracker', () => {
  it('starts at zero', () => {
    const ct = new CostTracker();
    expect(ct.totalCost()).toBe(0);
  });

  it('tracks cost per model', () => {
    const ct = new CostTracker();
    ct.record('gpt-4o', 1000);
    expect(ct.totalCost()).toBeGreaterThan(0);
    expect(ct.totalTokens()).toBe(1000);
  });

  it('formats cost', () => {
    const ct = new CostTracker();
    ct.record('gpt-4o', 1000);
    const formatted = ct.formatCost();
    expect(formatted).toContain('$');
    expect(formatted).toContain('tokens');
  });
});
