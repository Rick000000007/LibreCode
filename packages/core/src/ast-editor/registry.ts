import type { AstProvider } from './provider.js';
import type { Language } from './types.js';
import { TsMorphProvider } from './ts-morph.js';
import { PythonAstProvider } from './python.js';
import { RustAstProvider } from './rust.js';
import { GoAstProvider } from './go.js';

export class AstProviderRegistry {
  private providers = new Map<Language, AstProvider>();
  private fallback: AstProvider | null = null;

  constructor() {
    this.register(new TsMorphProvider());
    this.register(new PythonAstProvider());
    this.register(new RustAstProvider());
    this.register(new GoAstProvider());
  }

  register(provider: AstProvider): void {
    this.providers.set(provider.language, provider);
  }

  getProvider(language: Language): AstProvider | null {
    return this.providers.get(language) ?? null;
  }

  getProviderForFile(filename: string): AstProvider | null {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const langMap: Record<string, Language> = {
      ts: 'typescript', tsx: 'typescript', mts: 'typescript',
      js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
      py: 'python',
      rs: 'rust',
      go: 'go',
    };
    const lang = langMap[ext];
    if (!lang) return this.fallback;
    return this.getProvider(lang);
  }

  getSupportedLanguages(): Language[] {
    return Array.from(this.providers.keys());
  }

  setFallback(provider: AstProvider): void {
    this.fallback = provider;
  }
}

export const defaultRegistry = new AstProviderRegistry();
