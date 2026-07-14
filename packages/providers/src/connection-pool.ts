import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

interface PoolConfig {
  maxConnections: number;
  maxIdleTimeMs: number;
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxConnections: 25,
  maxIdleTimeMs: 60_000,
};

export class ConnectionPool {
  private httpAgent: HttpAgent;
  private httpsAgent: HttpsAgent;
  private providerAgents = new Map<string, HttpAgent | HttpsAgent>();

  constructor(config?: Partial<PoolConfig>) {
    const { maxConnections, maxIdleTimeMs } = { ...DEFAULT_POOL_CONFIG, ...config };
    this.httpAgent = new HttpAgent({ keepAlive: true, maxSockets: maxConnections, timeout: maxIdleTimeMs });
    this.httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: maxConnections, timeout: maxIdleTimeMs });
  }

  getAgent(baseUrl: string): HttpAgent | HttpsAgent {
    return baseUrl.startsWith('https') ? this.httpsAgent : this.httpAgent;
  }

  getProviderAgent(providerId: string): HttpAgent | HttpsAgent {
    return this.providerAgents.get(providerId) ?? this.httpsAgent;
  }

  setProviderAgent(providerId: string, baseUrl: string): void {
    const agent = baseUrl.startsWith('https')
      ? new HttpsAgent({ keepAlive: true, maxSockets: 10 })
      : new HttpAgent({ keepAlive: true, maxSockets: 10 });
    this.providerAgents.set(providerId, agent);
  }

  destroy(): void {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
    for (const agent of this.providerAgents.values()) agent.destroy();
    this.providerAgents.clear();
  }
}
