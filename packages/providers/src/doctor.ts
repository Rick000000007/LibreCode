import * as fs from 'node:fs';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import * as https from 'node:https';
import type { DoctorCheck, DoctorReport } from 'librecode-types';
import { ConfigurationManager } from './configuration-manager.js';
import { ProviderRegistry } from './provider-registry.js';
import { ProviderFactory } from './provider-factory.js';
import { ProviderRouter } from './provider-router.js';

const VERSION = '0.2.1';

export class Doctor {
  private configManager: ConfigurationManager;
  private registry: ProviderRegistry;

  constructor() {
    this.configManager = new ConfigurationManager();
    this.registry = new ProviderRegistry();
  }

  async run(): Promise<DoctorReport> {
    const checks: DoctorCheck[] = [];

    checks.push(this.checkNodeVersion());
    checks.push(this.checkPlatform());
    checks.push(this.checkGit());
    checks.push(this.checkWorkspacePermissions());
    checks.push(this.checkConfiguration());
    checks.push(await this.checkInternet());
    checks.push(this.checkTerminal());

    const providerChecks = await this.checkProviders();
    checks.push(...providerChecks);

    const summary = {
      passed: checks.filter((c) => c.status === 'passed').length,
      warnings: checks.filter((c) => c.status === 'warning').length,
      failed: checks.filter((c) => c.status === 'failed').length,
    };

    return {
      timestamp: new Date().toISOString(),
      version: VERSION,
      platform: `${os.platform()} ${os.release()}`,
      checks,
      summary,
    };
  }

  private checkNodeVersion(): DoctorCheck {
    const version = process.version.slice(1);
    const major = parseInt(version.split('.')[0] ?? '0', 10);
    if (major >= 22) {
      return { name: 'Node.js', status: 'passed', message: `v${version} (>=22)` };
    }
    if (major >= 20) {
      return {
        name: 'Node.js',
        status: 'warning',
        message: `v${version} (expected >=22)`,
        fix: 'Upgrade Node.js to v22+ with `nvm install 22` or `fnm install 22`',
      };
    }
    return {
      name: 'Node.js',
      status: 'failed',
      message: `v${version} (expected >=22)`,
      fix: 'Install Node.js v22+ from https://nodejs.org or use nvm/fnm',
    };
  }

  private checkPlatform(): DoctorCheck {
    const p = os.platform();
    const platforms = ['linux', 'darwin', 'win32'];
    const isWSL = os.release().toLowerCase().includes('microsoft') ||
      os.release().toLowerCase().includes('wsl');

    if (platforms.includes(p) || isWSL) {
      return {
        name: 'Platform',
        status: 'passed',
        message: `${p}${isWSL ? ' (WSL)' : ''}`,
      };
    }
    return {
      name: 'Platform',
      status: 'warning',
      message: `Unsupported platform: ${p}`,
    };
  }

  private checkGit(): DoctorCheck {
    try {
      const result = execSync('git --version', {
        encoding: 'utf-8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { name: 'Git', status: 'passed', message: result.trim() };
    } catch {
      return {
        name: 'Git',
        status: 'failed',
        message: 'Git is not installed',
        fix: 'Install Git: https://git-scm.com/downloads',
      };
    }
  }

  private checkWorkspacePermissions(): DoctorCheck {
    try {
      const dir = process.cwd();
      fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
      return { name: 'Workspace', status: 'passed', message: `Read/write: ${dir}` };
    } catch {
      return {
        name: 'Workspace',
        status: 'failed',
        message: `No read/write permission: ${process.cwd()}`,
        fix: 'Ensure you have read/write permissions for the current directory',
      };
    }
  }

  private checkConfiguration(): DoctorCheck {
    const config = this.configManager.load();
    if (!this.configManager.isConfigured()) {
      return {
        name: 'Configuration',
        status: 'failed',
        message: 'No configuration file found',
        fix: 'Run `librecode setup` or `librecode provider login` to configure',
      };
    }

    const enabled = Object.entries(config.providers).filter(([, v]) => v.enabled);
    if (enabled.length === 0) {
      return {
        name: 'Configuration',
        status: 'failed',
        message: 'No enabled providers in configuration',
        fix: 'Run `librecode provider login` to configure a provider',
      };
    }

    return {
      name: 'Configuration',
      status: 'passed',
      message: `Found at ${this.configManager.configFilePath()}`,
    };
  }

  private checkInternet(): Promise<DoctorCheck> {
    return new Promise<DoctorCheck>((resolve) => {
      const start = Date.now();
      const req = https.get('https://api.github.com', {
        timeout: 5000,
        headers: { 'User-Agent': 'librecode-doctor' },
      }, (res) => {
        const latency = Date.now() - start;
        resolve({
          name: 'Internet',
          status: latency < 2000 ? 'passed' : 'warning',
          message: `${res.statusCode} (${latency}ms)`,
        });
      });
      req.on('error', () => {
        resolve({
          name: 'Internet',
          status: 'failed',
          message: 'Cannot reach api.github.com',
          fix: 'Check your internet connection and firewall/proxy settings',
        });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({
          name: 'Internet',
          status: 'failed',
          message: 'Connection timed out',
          fix: 'Check your internet connection and proxy settings',
        });
      });
    });
  }

  private checkTerminal(): DoctorCheck {
    const term = process.env['TERM'] ?? 'none';
    const isTTY = process.stdout.isTTY ? 'yes' : 'no';
    return {
      name: 'Terminal',
      status: 'passed',
      message: `TERM=${term} TTY=${isTTY} cols=${process.stdout.columns ?? 80}`,
    };
  }

  private async checkProviders(): Promise<DoctorCheck[]> {
    const config = this.configManager.load();
    const checks: DoctorCheck[] = [];

    for (const [name, entry] of Object.entries(config.providers)) {
      if (!entry.enabled) continue;
      const meta = this.registry.get(name);
      const displayName = meta?.name ?? name;

      if (entry.apiKey) {
        if (entry.apiKey.length < 8) {
          checks.push({
            name: `Provider: ${displayName}`,
            status: 'warning',
            message: 'API key looks too short',
            fix: `Run \`librecode provider login ${name}\` to update the key`,
          });
          continue;
        }
        if (!entry.apiKey.startsWith('sk-') && !entry.apiKey.startsWith('AIza')) {
          checks.push({
            name: `Provider: ${displayName}`,
            status: 'warning',
            message: 'API key has unusual format',
            fix: 'Verify the API key is correct',
          });
        }
      }

      try {
        const factory = new ProviderFactory(this.registry);
        const provider = factory.create(name, { ...entry, enabled: true });
        const router = new ProviderRouter();
        router.addProvider(name, provider, 10);
        const result = await router.checkHealth(name);

        if (result.available) {
          checks.push({
            name: `Provider: ${displayName}`,
            status: 'passed',
            message: result.latencyMs !== undefined
              ? `Available (${result.latencyMs}ms)`
              : 'Available',
          });
        } else {
          checks.push({
            name: `Provider: ${displayName}`,
            status: 'failed',
            message: result.error ?? 'Not available',
            fix: `Run \`librecode provider test ${name}\` for details`,
          });
        }
      } catch (err) {
        checks.push({
          name: `Provider: ${displayName}`,
          status: 'failed',
          message: err instanceof Error ? err.message : String(err),
          fix: `Run \`librecode provider login ${name}\` to reconfigure`,
        });
      }
    }

    if (checks.length === 0) {
      checks.push({
        name: 'Providers',
        status: 'warning',
        message: 'No providers configured',
        fix: 'Run `librecode setup` to configure a provider',
      });
    }

    return checks;
  }
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  const theme = {
    pass: '\x1B[32m',
    warn: '\x1B[33m',
    fail: '\x1B[31m',
    dim: '\x1B[90m',
    bold: '\x1B[1m',
    reset: '\x1B[39m\x1B[22m',
  };

  lines.push(`${theme.bold}LibreCode Doctor${theme.reset}`);
  lines.push(`${theme.dim}Version: ${report.version} | Platform: ${report.platform}${theme.reset}`);
  lines.push('');

  for (const check of report.checks) {
    const icon = check.status === 'passed' ? '✔' : check.status === 'warning' ? '⚠' : '✘';
    const color = check.status === 'passed' ? theme.pass : check.status === 'warning' ? theme.warn : theme.fail;
    lines.push(`  ${color}${icon}${theme.reset} ${theme.bold}${check.name}${theme.reset}`);
    lines.push(`     ${theme.dim}${check.message}${theme.reset}`);
    if (check.fix) {
      lines.push(`     ${theme.warn}→ ${check.fix}${theme.reset}`);
    }
  }

  lines.push('');
  const total = report.checks.length;
  const passed = report.summary.passed;
  const warnings = report.summary.warnings;
  const failed = report.summary.failed;

  lines.push(`  ${theme.dim}───${theme.reset}`);
  if (failed === 0 && warnings === 0) {
    lines.push(`  ${theme.pass}All ${total} checks passed${theme.reset}`);
  } else if (failed === 0) {
    lines.push(`  ${theme.warn}${passed} passed, ${warnings} warnings${theme.reset}`);
  } else {
    lines.push(`  ${theme.fail}${passed} passed, ${warnings} warnings, ${failed} failed${theme.reset}`);
    lines.push(`  ${theme.dim}Fix the issues above and run \`librecode doctor\` again${theme.reset}`);
  }

  return lines.join('\n') + '\n';
}
