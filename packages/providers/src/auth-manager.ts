import type { AuthType } from './types/provider-descriptor.js';

export class AuthManager {
  private credentialCache = new Map<string, string>();

  async getAuthHeaders(
    providerId: string,
    authType: AuthType,
    config?: { apiKey?: string },
  ): Promise<Record<string, string>> {
    return this.resolveAuth(providerId, authType, config);
  }

  getAuthHeadersSync(
    providerId: string,
    authType: AuthType,
    config?: { apiKey?: string },
  ): Record<string, string> {
    return this.resolveAuth(providerId, authType, config);
  }

  private resolveAuth(
    providerId: string,
    authType: AuthType,
    config?: { apiKey?: string },
  ): Record<string, string> {
    switch (authType.type) {
      case 'bearer': {
        const key = this.resolveKey(providerId, authType.envVar, config?.apiKey);
        if (!key && authType.envVar) {
          return {};
        }
        return { Authorization: `Bearer ${key}` };
      }
      case 'header': {
        const value = this.resolveKey(providerId, authType.envVar, config?.apiKey);
        if (!value && authType.envVar) {
          return {};
        }
        return { [authType.headerName]: value };
      }
      case 'oauth':
        return {};
      case 'aws-sigv4':
        return {};
      case 'none':
        return {};
    }
  }

  private resolveKey(providerId: string, envVar?: string, configKey?: string): string {
    if (configKey) {
      this.credentialCache.set(providerId, configKey);
      return configKey;
    }
    const cached = this.credentialCache.get(providerId);
    if (cached) return cached;
    if (envVar) {
      const envValue = process.env[envVar];
      if (envValue) {
        this.credentialCache.set(providerId, envValue);
        return envValue;
      }
      const genericVar = `${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`;
      if (genericVar !== envVar) {
        const genericValue = process.env[genericVar];
        if (genericValue) {
          this.credentialCache.set(providerId, genericValue);
          return genericValue;
        }
      }
    }
    return '';
  }

  clearCache(): void {
    this.credentialCache.clear();
  }
}
