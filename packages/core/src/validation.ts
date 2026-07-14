import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export interface ValidationStep {
  name: string;
  run(dir: string): ValidationResult;
}

export interface ValidationResult {
  passed: boolean;
  name: string;
  output: string;
  error?: string;
  fix?: string;
}

export interface ValidationReport {
  passed: boolean;
  steps: ValidationResult[];
  summary: { total: number; passed: number; failed: number };
}

export class AutoValidator {
  private steps: ValidationStep[] = [];

  constructor() {
    this.registerDefaults();
  }

  register(step: ValidationStep): void {
    this.steps.push(step);
  }

  async validate(dir: string): Promise<ValidationReport> {
    const results: ValidationResult[] = [];

    for (const step of this.steps) {
      try {
        const result = step.run(dir);
        results.push(result);
      } catch (err) {
        results.push({
          passed: false,
          name: step.name,
          output: '',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const passed = results.filter(r => r.passed).length;
    return {
      passed: passed === results.length,
      steps: results,
      summary: { total: results.length, passed, failed: results.length - passed },
    };
  }

  private registerDefaults(): void {
    this.register(new FormatValidator());
    this.register(new LintValidator());
    this.register(new TestValidator());
    this.register(new TypeCheckValidator());
  }
}

class FormatValidator implements ValidationStep {
  name = 'Formatter';

  run(dir: string): ValidationResult {
    if (!hasTool(dir, 'prettier') && !hasTool(dir, 'ruff') && !hasTool(dir, 'rustfmt')) {
      return { passed: true, name: this.name, output: 'Skipped: no formatter configured' };
    }

    try {
      if (hasTool(dir, 'prettier')) {
        execSync('npx prettier --check .', { cwd: dir, stdio: 'pipe', timeout: 30_000 });
        return { passed: true, name: this.name, output: 'Formatting check passed' };
      }
      return { passed: true, name: this.name, output: 'Skipped: no supported formatter' };
    } catch (err) {
      const output = err instanceof Error ? err.message : String(err);
      return {
        passed: false,
        name: this.name,
        output,
        error: 'Formatting issues detected',
        fix: 'Run formatter to fix automatically',
      };
    }
  }
}

class LintValidator implements ValidationStep {
  name = 'Linter';

  run(dir: string): ValidationResult {
    if (hasTool(dir, 'eslint') || fs.existsSync(path.join(dir, '.eslintrc'))) {
      try {
        execSync('npx eslint . --quiet', { cwd: dir, stdio: 'pipe', timeout: 30_000 });
        return { passed: true, name: this.name, output: 'Lint passed' };
      } catch (err) {
        const output = err instanceof Error ? err.message : String(err);
        const lines = output.split('\n').filter(l => l.includes(':')).slice(0, 10);
        return {
          passed: false,
          name: this.name,
          output: lines.join('\n'),
          error: 'Lint errors found',
          fix: 'Fix reported issues manually or run linter with --fix',
        };
      }
    }

    return { passed: true, name: this.name, output: 'Skipped: no linter configured' };
  }
}

class TestValidator implements ValidationStep {
  name = 'Tests';

  run(dir: string): ValidationResult {
    const testCommands = [
      { name: 'pnpm test', exists: () => fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) || fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) },
      { name: 'npm test', exists: () => fs.existsSync(path.join(dir, 'package.json')) },
      { name: 'cargo test', exists: () => fs.existsSync(path.join(dir, 'Cargo.toml')) },
      { name: 'go test ./...', exists: () => fs.existsSync(path.join(dir, 'go.mod')) },
      { name: 'pytest', exists: () => fs.existsSync(path.join(dir, 'pyproject.toml')) || fs.existsSync(path.join(dir, 'setup.py')) },
    ];

    const found = testCommands.find(c => c.exists());
    if (!found) {
      return { passed: true, name: this.name, output: 'Skipped: no test framework detected' };
    }

    try {
      execSync(found.name, { cwd: dir, stdio: 'pipe', timeout: 60_000 });
      return { passed: true, name: this.name, output: 'All tests passed' };
    } catch (err) {
      const output = err instanceof Error ? err.message : String(err);
      const lines = output.split('\n').filter(l => l.includes('FAIL') || l.includes('fail')).slice(0, 10);
      return {
        passed: false,
        name: this.name,
        output: lines.length > 0 ? lines.join('\n') : output.slice(0, 500),
        error: 'Tests failed',
        fix: 'Check test output for details and fix failing tests',
      };
    }
  }
}

class TypeCheckValidator implements ValidationStep {
  name = 'Type Checker';

  run(dir: string): ValidationResult {
    if (hasTool(dir, 'tsc') || fs.existsSync(path.join(dir, 'tsconfig.json'))) {
      try {
        execSync('npx tsc --noEmit', { cwd: dir, stdio: 'pipe', timeout: 60_000 });
        return { passed: true, name: this.name, output: 'Type check passed' };
      } catch (err) {
        const output = err instanceof Error ? err.message : String(err);
        const lines = output.split('\n').filter(l => l.includes(': error')).slice(0, 10);
        return {
          passed: false,
          name: this.name,
          output: lines.join('\n'),
          error: 'Type errors found',
          fix: 'Fix reported type issues',
        };
      }
    }

    if (hasTool(dir, 'mypy') || fs.existsSync(path.join(dir, 'mypy.ini'))) {
      try {
        execSync('mypy .', { cwd: dir, stdio: 'pipe', timeout: 60_000 });
        return { passed: true, name: this.name, output: 'Type check passed' };
      } catch (err) {
        const output = err instanceof Error ? err.message : String(err);
        return {
          passed: false,
          name: this.name,
          output: output.slice(0, 500),
          error: 'Type errors found',
          fix: 'Fix reported type issues',
        };
      }
    }

    return { passed: true, name: this.name, output: 'Skipped: no type checker configured' };
  }
}

function hasTool(dir: string, tool: string): boolean {
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const all = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };
      if (tool in all) return true;
    } catch {
    }
  }

  try {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'where' : 'which';
    execSync(`${cmd} ${tool}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
