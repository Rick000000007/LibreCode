import * as fs from 'node:fs';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import * as https from 'node:https';
import type { DoctorCheck, DoctorReport } from 'librecode-types';
import { ConfigurationManager } from './configuration-manager.js';
import { ProviderRegistry } from './provider-registry.js';
import { ProviderFactory } from './provider-factory.js';
import { ProviderRouter } from './provider-router.js';

const VERSION = '1.0.0';

const healthCache = new Map<string, { available: boolean; error?: string; latency: number; timestamp: number }>();

export class Doctor {
  private configManager: ConfigurationManager;
  private registry: ProviderRegistry;

  constructor() {
    this.configManager = new ConfigurationManager();
    this.registry = new ProviderRegistry();
  }

  async run(onProgress?: (msg: string) => void): Promise<DoctorReport> {
    const checks: DoctorCheck[] = [];
    if (onProgress) onProgress('Running diagnostics...');

    checks.push(this.checkNodeVersion());
    checks.push(this.checkPlatform());
    checks.push(this.checkGit());
    checks.push(this.checkWorkspacePermissions());
    checks.push(this.checkConfiguration());
    checks.push(await this.checkInternet());
    checks.push(this.checkTerminal());

    if (onProgress) onProgress('Checking providers...');
    const providerChecks = await this.checkProviders(onProgress);
    checks.push(...providerChecks);

    const summary = {
      passed: checks.filter((c) => c.status === 'passed').length,
      warnings: checks.filter((c) => c.status === 'warning').length,
      failed: checks.filter((c) => c.status === 'failed').length,
    };

    // For terminal output, include the full details section
    const details = this.formatAllProviderDetails(checks);

    return {
      timestamp: new Date().toISOString(),
      version: VERSION,
      platform: `${os.platform()} ${os.release()}`,
      checks,
      summary,
      details,
    };
  }

  private formatAllProviderDetails(checks: DoctorCheck[]): string {
    const lines: string[] = [];
    for (const check of checks) {
      if (check.name.startsWith('Provider:')) {
        lines.push(`  ${check.name}`);
        if (check.detail) {
          for (const line of check.detail.split('\n')) {
            lines.push(`    ${line}`);
          }
        }
        lines.push(`  Status: ${check.status.toUpperCase()} - ${check.message}`);
        if (check.fix) {
          lines.push(`  Fix: ${check.fix}`);
        }
        lines.push('');
      }
    }
    return lines.join('\n');
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

  private async checkProviders(onProgress?: (msg: string) => void): Promise<DoctorCheck[]> {
    const config = this.configManager.load();
    const checks: DoctorCheck[] = [];
    const enabledEntries = Object.entries(config.providers).filter(([, entry]) => entry.enabled);

    const total = enabledEntries.length;
    let completed = 0;

    const promises = enabledEntries.map(async ([name, entry], index) => {
      const meta = this.registry.get(name);
      const builtin = this.registry.getBuiltin(name);
      const displayName = meta?.name ?? name;
      const baseUrl = entry.endpoint?.trim() || this.registry.getBaseUrl(name) || '';

      const detailLines: string[] = [];
      detailLines.push(`Provider: ${displayName}`);
      detailLines.push(`Base URL: ${baseUrl}`);
      detailLines.push(`Authentication: ${meta?.requiresApiKey ? 'API Key required' : 'None / Local'}`);

      // Validate API key
      if (entry.apiKey) {
        if (entry.apiKey.length < 8) {
          const check: DoctorCheck = {
            name: `Provider: ${displayName}`,
            status: 'warning',
            message: 'API key looks too short (minimum 8 characters)',
            fix: 'Run `/provider login` to update the key',
            detail: detailLines.join('\n'),
          };
          completed++;
          if (onProgress) onProgress(`[${completed}/${total}] ${displayName} ......... \u26A0 Key too short`);
          return check;
        }

        // Check against known key prefixes
        const knownPrefixes = ['sk-', 'AIza', 'nvapi-', 'ghp_', 'ghu_', 'ghs_', 'ghr_', 'github_pat_'];
        const hasKnownPrefix = knownPrefixes.some(p => entry.apiKey!.startsWith(p));
        if (!hasKnownPrefix) {
          detailLines.push(`Health: WARNING - API key format not recognized (starts with: ${entry.apiKey.slice(0, 8)}...)`);
          detailLines.push('  The API key may still be valid, but it does not match common key patterns.');
          detailLines.push('  Fix: Verify the API key is correct. Run `/provider login` to update.');
        } else {
          detailLines.push('Health: API key format looks valid');
        }
      } else if (meta?.requiresApiKey) {
        const envKey = this.registry.getEnvKey(name);
        const hasEnvKey = !!process.env[envKey];
        if (hasEnvKey) {
          detailLines.push(`Authentication: Using ${envKey} from environment`);
        } else {
          const check: DoctorCheck = {
            name: `Provider: ${displayName}`,
            status: 'failed',
            message: 'No API key configured',
            fix: `Run \`/provider login ${name}\` or set ${envKey} environment variable`,
            detail: detailLines.join('\n'),
          };
          completed++;
          if (onProgress) onProgress(`[${completed}/${total}] ${displayName} ......... \u2718 Not Configured`);
          return check;
        }
      }

      // Attempt health check
      try {
        const factory = new ProviderFactory(this.registry);
        const provider = factory.create(name, { ...entry, enabled: true });
        const router = new ProviderRouter();
        router.addProvider(name, provider, 10);

        // Test health
        const healthStart = Date.now();
        let healthResult: { available: boolean; error?: string };
        let latency = 0;
        
        const cached = healthCache.get(name);
        if (cached && (healthStart - cached.timestamp < 60000)) {
           healthResult = { available: cached.available, error: cached.error };
           latency = cached.latency;
        } else {
           const result = await Promise.race([
              router.checkHealth(name),
              new Promise<{ available: boolean; error: string }>((r) => setTimeout(() => r({ available: false, error: 'Health check timed out after 15s' }), 15000))
           ]);
           healthResult = result;
           latency = Date.now() - healthStart;
           if (healthResult.available) {
              healthCache.set(name, { available: true, latency, timestamp: Date.now() });
           }
        }

        if (healthResult.available) {
          detailLines.push(`Health: Available (${latency}ms)`);
        } else {
          detailLines.push(`Health: FAILED - ${healthResult.error ?? 'Not available'}`);
          detailLines.push(`  Latency: ${latency}ms`);
          detailLines.push(`  Fix: Run \`/provider test ${name}\` for detailed diagnostics`);
        }

        // Test model discovery
        try {
          const models = await Promise.race([
             provider.listModels(),
             new Promise<any[]>((r) => setTimeout(() => r([]), 30000))
          ]);
          if (models.length > 0) {
            detailLines.push(`Model Discovery: ${models.length} models found`);
            detailLines.push(`  Default model: ${entry.defaultModel || meta?.defaultModel || 'N/A'}`);
            detailLines.push(`  First model: ${models[0]!.id}`);
          } else {
            detailLines.push('Model Discovery: No models returned');
          }
        } catch (err) {
          detailLines.push(`Model Discovery: FAILED - ${err instanceof Error ? err.message : String(err)}`);
        }

        completed++;
        
        // Determine overall status
        if (healthResult.available) {
          if (onProgress) onProgress(`[${completed}/${total}] ${displayName} ......... \u2714 ${latency} ms`);
          return {
            name: `Provider: ${displayName}`,
            status: 'passed',
            message: `Available (${latency}ms) | ${baseUrl}`,
            detail: detailLines.join('\n'),
          } as DoctorCheck;
        } else {
          if (onProgress) onProgress(`[${completed}/${total}] ${displayName} ......... \u2718 ${healthResult.error?.includes('ECONNREFUSED') ? 'Not Running' : 'Failed'}`);
          return {
            name: `Provider: ${displayName}`,
            status: 'failed',
            message: healthResult.error ?? 'Not available',
            fix: `Run \`/provider test ${name}\` for details. Run \`/provider login ${name}\` to reconfigure.`,
            detail: detailLines.join('\n'),
          } as DoctorCheck;
        }
      } catch (err) {
        detailLines.push(`Error: ${err instanceof Error ? err.message : String(err)}`);
        completed++;
        if (onProgress) onProgress(`[${completed}/${total}] ${displayName} ......... \u2718 Error`);
        return {
          name: `Provider: ${displayName}`,
          status: 'failed',
          message: err instanceof Error ? err.message : String(err),
          fix: `Run \`/provider login ${name}\` to reconfigure. Run \`/setup\` to start over.`,
          detail: detailLines.join('\n'),
        } as DoctorCheck;
      }
    });

    const results = await Promise.all(promises);
    checks.push(...results);

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

  let lastWasProviderDetail = false;

  for (const check of report.checks) {
    const isProvider = check.name.startsWith('Provider:');
    const icon = check.status === 'passed' ? '✔' : check.status === 'warning' ? '⚠' : '✘';
    const color = check.status === 'passed' ? theme.pass : check.status === 'warning' ? theme.warn : theme.fail;

    if (isProvider && check.detail) {
      // Multi-line provider detail
      lines.push(`  ${color}${icon}${theme.reset} ${theme.bold}${check.name}${theme.reset}`);
      for (const detailLine of check.detail.split('\n')) {
        lines.push(`    ${theme.dim}${detailLine}${theme.reset}`);
      }
      if (check.fix) {
        lines.push(`    ${theme.warn}→ ${check.fix}${theme.reset}`);
      }
      lastWasProviderDetail = true;
    } else {
      if (lastWasProviderDetail) {
        lines.push('');
        lastWasProviderDetail = false;
      }
      lines.push(`  ${color}${icon}${theme.reset} ${theme.bold}${check.name}${theme.reset}`);
      lines.push(`     ${theme.dim}${check.message}${theme.reset}`);
      if (check.fix) {
        lines.push(`     ${theme.warn}→ ${check.fix}${theme.reset}`);
      }
      lastWasProviderDetail = false;
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
