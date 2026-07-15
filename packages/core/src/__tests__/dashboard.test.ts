import { describe, it, expect } from 'vitest';
import { WorkspaceDashboard } from '../dashboard.js';

describe('WorkspaceDashboard', () => {
  it('renders with default data', () => {
    const dashboard = new WorkspaceDashboard();
    const output = dashboard.render();
    expect(output).toContain('LibreCode Dashboard');
    expect(output).toContain('Provider');
    expect(output).toContain('Token Usage');
    expect(output).toContain('Workspace');
  });

  it('reflects updated data', () => {
    const dashboard = new WorkspaceDashboard();
    dashboard.update({
      provider: 'openai',
      model: 'gpt-4o',
      tokenUsage: { prompt: 100, completion: 50, total: 150 },
    });

    const output = dashboard.render();
    expect(output).toContain('openai');
    expect(output).toContain('gpt-4o');
    expect(output).toContain('150');
  });

  it('supports custom widgets', () => {
    const dashboard = new WorkspaceDashboard();
    dashboard.registerWidget({
      id: 'custom',
      label: 'Custom',
      order: 99,
      render: () => 'Custom Widget Content',
    });

    const output = dashboard.render();
    expect(output).toContain('Custom Widget Content');
  });

  it('allows widget collapsing', () => {
    const dashboard = new WorkspaceDashboard();
    dashboard.registerWidget({
      id: 'hidden',
      label: 'Hidden',
      order: 99,
      collapsed: true,
      render: () => 'SHOULD NOT APPEAR',
    });

    const output = dashboard.render();
    expect(output).not.toContain('SHOULD NOT APPEAR');
  });

  it('collects runtime data', () => {
    const dashboard = new WorkspaceDashboard();
    dashboard.refresh();
    const data = dashboard.getData();
    expect(data.runtime.memoryUsage.heapUsed).toBeGreaterThan(0);
    expect(data.runtime.platform).toBeTruthy();
    expect(data.runtime.nodeVersion).toBeTruthy();
  });

  it('starts and stops auto-refresh', () => {
    const dashboard = new WorkspaceDashboard();
    dashboard.startAutoRefresh(1000);
    dashboard.stopAutoRefresh();
    expect(true).toBe(true); // No crash
  });
});
