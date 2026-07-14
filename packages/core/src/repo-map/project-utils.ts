import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { ProjectInfo } from './types.js';

export function detectProject(dir: string): ProjectInfo | null {
  const cargoPath = path.join(dir, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    return parseCargoToml(fs.readFileSync(cargoPath, 'utf-8'));
  }
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    return parsePackageJson(fs.readFileSync(pkgPath, 'utf-8'));
  }
  const goPath = path.join(dir, 'go.mod');
  if (fs.existsSync(goPath)) {
    return parseGoMod(fs.readFileSync(goPath, 'utf-8'));
  }
  const pyprojectPath = path.join(dir, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    return parsePyproject(fs.readFileSync(pyprojectPath, 'utf-8'));
  }
  return null;
}

function parseCargoToml(content: string): ProjectInfo {
  let name = '';
  let description: string | undefined;
  const dependencies: string[] = [];
  let inDeps = false;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('name') && trimmed.includes('=')) {
      name = trimmed.split('=')[1]?.trim().replace(/["']/g, '') ?? '';
    }
    if (trimmed.startsWith('description') && trimmed.includes('=')) {
      description = trimmed.split('=')[1]?.trim().replace(/["']/g, '') ?? '';
    }
    if (trimmed === '[dependencies]' || trimmed.startsWith('[dependencies.')) {
      inDeps = true;
      continue;
    }
    if (trimmed.startsWith('[') && trimmed !== '[dependencies]') {
      inDeps = false;
      continue;
    }
    if (inDeps && trimmed.includes('=')) {
      const depName = trimmed.split('=')[0]?.trim() ?? '';
      if (depName) dependencies.push(depName);
    }
  }
  return { name, language: 'rust', description, dependencies };
}

function parsePackageJson(content: string): ProjectInfo {
  try {
    const json = JSON.parse(content) as Record<string, unknown>;
    return {
      name: typeof json['name'] === 'string' ? json['name'] : '',
      language: 'javascript',
      description: typeof json['description'] === 'string' ? json['description'] : undefined,
      dependencies: [
        ...Object.keys((json['dependencies'] ?? {}) as Record<string, string>),
        ...Object.keys((json['devDependencies'] ?? {}) as Record<string, string>),
      ],
    };
  } catch {
    return { name: '', language: 'javascript', dependencies: [] };
  }
}

function parseGoMod(content: string): ProjectInfo {
  let name = '';
  const dependencies: string[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('module ')) {
      name = trimmed.replace('module ', '').trim();
    }
    if (trimmed.startsWith('require ')) {
      const dep = trimmed.replace('require ', '').split(/\s+/)[0] ?? '';
      if (dep) dependencies.push(dep);
    }
  }
  return { name, language: 'go', dependencies };
}

function parsePyproject(content: string): ProjectInfo {
  let name = '';
  let description: string | undefined;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('name') && trimmed.includes('=')) {
      name = trimmed.split('=')[1]?.trim().replace(/["']/g, '') ?? '';
    }
    if (trimmed.startsWith('description') && trimmed.includes('=')) {
      description = trimmed.split('=')[1]?.trim().replace(/["']/g, '') ?? '';
    }
  }
  return { name, language: 'python', description, dependencies: [] };
}

export function getRecentFiles(dir: string): string[] {
  try {
    const output = execSync('git log --pretty=format:%h --name-only -20', { cwd: dir }).toString();
    const lines = output.split('\n');
    const files: string[] = [];
    for (const line of lines) {
      if (line.trim() && !line.match(/^[0-9a-f]+$/) && fs.existsSync(path.join(dir, line))) {
        files.push(line.trim());
      }
    }
    return [...new Set(files)];
  } catch {
    return [];
  }
}
