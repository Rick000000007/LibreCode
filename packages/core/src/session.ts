import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Message } from 'librecode-types';

export interface SessionMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  tokenCount: number;
  providerName?: string;
  providerModel?: string;
  workingDir?: string;
  tags?: string[];
}

export interface SessionData {
  metadata: SessionMetadata;
  messages: Message[];
  systemPrompt?: string;
}

export class SessionManager {
  private sessionsDir: string;
  private currentSessionId: string | null = null;

  constructor(baseDir?: string) {
    this.sessionsDir = baseDir ?? this.defaultSessionsDir();
    this.ensureDir();
  }

  async create(name?: string): Promise<SessionData> {
    const id = generateId();
    const session: SessionData = {
      metadata: {
        id,
        name: name ?? `Session ${new Date().toLocaleString()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
        tokenCount: 0,
      },
      messages: [],
    };
    await this.save(session);
    this.currentSessionId = id;
    return session;
  }

  async save(session: SessionData): Promise<void> {
    session.metadata.updatedAt = Date.now();
    session.metadata.messageCount = session.messages.length;
    const filePath = this.sessionPath(session.metadata.id);
    await fs.promises.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  async load(id: string): Promise<SessionData | null> {
    const filePath = this.sessionPath(id);
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      const session = JSON.parse(data) as SessionData;
      this.currentSessionId = id;
      return session;
    } catch {
      return null;
    }
  }

  async list(): Promise<SessionMetadata[]> {
    const files = await fs.promises.readdir(this.sessionsDir);
    const sessions: SessionMetadata[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = await fs.promises.readFile(
          path.join(this.sessionsDir, file),
          'utf-8',
        );
        const session = JSON.parse(data) as SessionData;
        sessions.push(session.metadata);
      } catch {
        continue;
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async rename(id: string, newName: string): Promise<boolean> {
    const session = await this.load(id);
    if (!session) return false;
    session.metadata.name = newName;
    await this.save(session);
    return true;
  }

  async delete(id: string): Promise<boolean> {
    const filePath = this.sessionPath(id);
    try {
      await fs.promises.unlink(filePath);
      if (this.currentSessionId === id) {
        this.currentSessionId = null;
      }
      return true;
    } catch {
      return false;
    }
  }

  async exportSession(id: string): Promise<string | null> {
    const session = await this.load(id);
    if (!session) return null;
    return JSON.stringify(session, null, 2);
  }

  async importSession(jsonData: string): Promise<SessionData | null> {
    try {
      const session = JSON.parse(jsonData) as SessionData;
      if (!session.metadata || !session.messages) return null;
      session.metadata.id = generateId();
      session.metadata.createdAt = Date.now();
      session.metadata.updatedAt = Date.now();
      await this.save(session);
      return session;
    } catch {
      return null;
    }
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  setCurrentSessionId(id: string | null): void {
    this.currentSessionId = id;
  }

  private sessionPath(id: string): string {
    return path.join(this.sessionsDir, `${id}.json`);
  }

  private defaultSessionsDir(): string {
    const xdg = process.env['XDG_DATA_HOME'];
    const base = xdg ? path.join(xdg, 'librecode') : path.join(os.homedir(), '.local', 'share', 'librecode');
    return path.join(base, 'sessions');
  }

  private ensureDir(): void {
    try {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    } catch {
    }
  }
}

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
