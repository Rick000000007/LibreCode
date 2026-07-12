import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { describe, test, expect } from 'vitest';

describe('CLI package publish packaging', () => {
  test('npm pack should replace workspace:* dependencies', () => {
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
    // Pack the CLI package into tmpDir
    execSync('pnpm pack --pack-destination .', {
      cwd: path.resolve(__dirname, '../../cli'),
      stdio: 'inherit',
    });
    // Find generated .tgz file
    const files = fs.readdirSync(path.resolve(__dirname, '../../cli')).filter(f => f.endsWith('.tgz'));
    expect(files.length).toBeGreaterThan(0);
    const tgzPath = path.resolve(__dirname, '../../cli', files[0]);
    // Extract package.json content from tarball
    const pkgJsonStr = execSync(`tar -xOf ${tgzPath} package/package.json`).toString();
    const pkg = JSON.parse(pkgJsonStr);
    const deps = pkg.dependencies || {};
    for (const [_, version] of Object.entries(deps)) {
      expect(version).not.toMatch(/^workspace:/);
    }
    // Clean up generated tgz
    fs.unlinkSync(tgzPath);
  });
});
