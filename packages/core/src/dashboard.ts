import * as os from 'node:os';
import { execSync } from 'node:child_process';

export interface DashboardData {
  provider: string;
  model: string;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
  sessionDuration: number;
  workspace: {
    root: string;
    branch: string | null;
    status: string;
    fileCount: number;
  };
  diagnostics: {
    errors: number;
    warnings: number;
    infos: number;
  };
  runtime: {
    memoryUsage: { heapUsed: number; heapTotal: number; rss: number };
    cpuUsage: { user: number; system: number };
    platform: string;
    uptime: number;
    nodeVersion: string;
  };
  backgroundTasks: number;
  activeAgents: number;
  runningTools: string[];
  git: {
    branch: string | null;
    commits: number;
    uncommitted: number;
    lastCommit?: string;
  };
}

export interface DashboardWidget {
  id: string;
  label: string;
  render: (data: DashboardData) => string;
  order: number;
  collapsed?: boolean;
}

export class WorkspaceDashboard {
  private data: Partial<DashboardData> = {};
  private widgets: DashboardWidget[] = [];
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.registerDefaultWidgets();
  }

  private registerDefaultWidgets(): void {
    this.registerWidget({
      id: 'provider',
      label: 'Provider',
      order: 1,
      render: (d) => `Provider: ${d.provider ?? 'N/A'} (${d.model ?? 'N/A'})`,
    });

    this.registerWidget({
      id: 'tokens',
      label: 'Token Usage',
      order: 2,
      render: (d) => {
        const t = d.tokenUsage;
        return `Tokens: ↑${(t?.prompt ?? 0).toLocaleString()} ↓${(t?.completion ?? 0).toLocaleString()} Σ${(t?.total ?? 0).toLocaleString()}`;
      },
    });

    this.registerWidget({
      id: 'session',
      label: 'Session',
      order: 3,
      render: (d) => `Duration: ${formatDuration(d.sessionDuration ?? 0)}`,
    });

    this.registerWidget({
      id: 'workspace',
      label: 'Workspace',
      order: 4,
      render: (d) => `Dir: ${d.workspace?.root ?? 'N/A'} | Branch: ${d.workspace?.branch ?? 'N/A'} | Files: ${d.workspace?.fileCount ?? 0}`,
    });

    this.registerWidget({
      id: 'diagnostics',
      label: 'Diagnostics',
      order: 5,
      render: (d) => {
        const diag = d.diagnostics;
        return `Errors: ${diag?.errors ?? 0} | Warnings: ${diag?.warnings ?? 0} | Info: ${diag?.infos ?? 0}`;
      },
    });

    this.registerWidget({
      id: 'runtime',
      label: 'Runtime',
      order: 6,
      render: (d) => {
        const mem = d.runtime?.memoryUsage;
        return `Mem: ${mem ? formatBytes(mem.heapUsed) : 'N/A'} | Node: ${d.runtime?.nodeVersion ?? 'N/A'} | Uptime: ${formatDuration(d.runtime?.uptime ?? 0)}`;
      },
    });

    this.registerWidget({
      id: 'git',
      label: 'Git',
      order: 7,
      render: (d) => {
        const g = d.git;
        return `Branch: ${g?.branch ?? 'N/A'} | Uncommitted: ${g?.uncommitted ?? 0} | Last: ${g?.lastCommit ?? 'N/A'}`;
      },
    });

    this.registerWidget({
      id: 'tasks',
      label: 'Tasks',
      order: 8,
      render: (d) => `Background: ${d.backgroundTasks ?? 0} | Agents: ${d.activeAgents ?? 0} | Tools: ${(d.runningTools ?? []).join(', ') || 'None'}`,
    });
  }

  registerWidget(widget: DashboardWidget): void {
    this.widgets.push(widget);
    this.widgets.sort((a, b) => a.order - b.order);
  }

  update(data: Partial<DashboardData>): void {
    this.data = { ...this.data, ...data };
  }

  getData(): DashboardData {
    return {
      provider: 'unknown',
      model: 'unknown',
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      sessionDuration: 0,
      workspace: { root: process.cwd(), branch: null, status: 'unknown', fileCount: 0 },
      diagnostics: { errors: 0, warnings: 0, infos: 0 },
      runtime: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        platform: os.platform(),
        uptime: process.uptime(),
        nodeVersion: process.version,
      },
      backgroundTasks: 0,
      activeAgents: 0,
      runningTools: [],
      git: { branch: null, commits: 0, uncommitted: 0 },
      ...this.data,
    };
  }

  render(): string {
    const data = this.getData();
    const width = Math.min(process.stdout.columns || 80, 80);
    const lines: string[] = [];

    lines.push(`\x1B[1m${'═'.repeat(width)}\x1B[22m`);
    lines.push(`\x1B[1m  LibreCode Dashboard\x1B[22m`);
    lines.push(`\x1B[1m${'═'.repeat(width)}\x1B[22m`);

    for (const widget of this.widgets) {
      if (widget.collapsed) continue;
      const content = widget.render(data);
      lines.push('');
      lines.push(`  \x1B[36m${widget.label}\x1B[39m`);
      lines.push(`  \x1B[90m${'─'.repeat(width - 4)}\x1B[39m`);
      const wrapped = this.wrapText(content, width - 4);
      for (const w of wrapped) {
        lines.push(`  ${w}`);
      }
    }

    lines.push('');
    lines.push(`\x1B[90m${'─'.repeat(width)}\x1B[39m`);
    lines.push(`  \x1B[90mUpdated: ${new Date().toLocaleTimeString()}\x1B[39m`);

    return lines.join('\n');
  }

  startAutoRefresh(intervalMs = 5000): void {
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, intervalMs);
    this.refreshInterval.unref();
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  refresh(): void {
    this.update(this.collectRuntimeData());
    this.emit('refresh', this.getData());
  }

  private collectRuntimeData(): Partial<DashboardData> {
    let branch: string | null = null;
    let uncommitted = 0;
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', timeout: 2000 }).trim();
      uncommitted = parseInt(execSync('git status --porcelain | wc -l', { encoding: 'utf-8', timeout: 2000 }).trim(), 10) || 0;
    } catch { /* not git */ }

    return {
      runtime: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        platform: os.platform(),
        uptime: process.uptime(),
        nodeVersion: process.version,
      },
      git: {
        branch,
        commits: 0,
        uncommitted,
      },
    };
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let current = '';
    for (const word of text.split(' ')) {
      if ((current + ' ' + word).length > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  private emit(_event: string, _data: DashboardData): void {
    // Hook for external listeners
  }

  destroy(): void {
    this.stopAutoRefresh();
    this.widgets = [];
    this.data = {};
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}
