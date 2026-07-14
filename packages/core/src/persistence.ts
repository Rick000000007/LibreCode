import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCHEMA_VERSION = 1;

export interface PersistenceConfig {
  dbPath?: string;
  autoBackup?: boolean;
  backupIntervalMs?: number;
}

export class PersistenceStore {
  private db: Database.Database;
  private backupTimer: ReturnType<typeof setInterval> | null = null;
  private dbPath: string;

  constructor(config: PersistenceConfig = {}) {
    const dbDir = config.dbPath ? path.dirname(config.dbPath) : path.join(process.cwd(), '.librecode');
    fs.mkdirSync(dbDir, { recursive: true });
    this.dbPath = config.dbPath ?? path.join(dbDir, 'librecode.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();

    if (config.autoBackup !== false) {
      this.startAutoBackup(config.backupIntervalMs ?? 300_000);
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        description TEXT NOT NULL,
        files TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        parent_id TEXT,
        tags TEXT DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        result TEXT NOT NULL,
        details TEXT DEFAULT '{}',
        ip TEXT,
        user_agent TEXT
      );

      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        created_at TEXT NOT NULL,
        last_accessed TEXT NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS telemetry_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS telemetry_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        name TEXT NOT NULL,
        value REAL NOT NULL,
        tags TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS telemetry_spans (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        trace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_ms REAL,
        status TEXT NOT NULL DEFAULT 'ok',
        attributes TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL,
        metadata TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS workflow_state (
        id TEXT PRIMARY KEY,
        plan TEXT NOT NULL,
        current_task TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_entries(type);
      CREATE INDEX IF NOT EXISTS idx_memory_confidence ON memory_entries(confidence);
      CREATE INDEX IF NOT EXISTS idx_telemetry_source ON telemetry_logs(source);
      CREATE INDEX IF NOT EXISTS idx_telemetry_level ON telemetry_logs(level);
      CREATE INDEX IF NOT EXISTS idx_metrics_name ON telemetry_metrics(name);
      CREATE INDEX IF NOT EXISTS idx_spans_trace ON telemetry_spans(trace_id);
    `);

    const currentVersion = this.db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null } | undefined;
    const ver = currentVersion?.v ?? 0;
    if (ver < SCHEMA_VERSION) {
      this.db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
    }
  }

  // --- Checkpoints ---

  saveCheckpoint(cp: { id: string; version: number; timestamp: Date; description: string; files: Map<string, string>; metadata: Record<string, unknown>; parent?: string; tags?: string[] }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO checkpoints (id, version, timestamp, description, files, metadata, parent_id, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(cp.id, cp.version, cp.timestamp.toISOString(), cp.description, JSON.stringify(Array.from(cp.files.entries())), JSON.stringify(cp.metadata), cp.parent ?? null, JSON.stringify(cp.tags ?? []));
  }

  getCheckpoint(id: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  }

  listCheckpoints(tag?: string): Record<string, unknown>[] {
    if (tag) {
      return this.db.prepare('SELECT * FROM checkpoints WHERE json_extract(tags, \'$\') LIKE ? ORDER BY version DESC').get(`%${tag}%`) as Record<string, unknown>[] ?? [];
    }
    return this.db.prepare('SELECT * FROM checkpoints ORDER BY version DESC').all() as Record<string, unknown>[];
  }

  deleteCheckpoint(id: string): boolean {
    return this.db.prepare('DELETE FROM checkpoints WHERE id = ?').run(id).changes > 0;
  }

  // --- Audit Logs ---

  appendAuditLog(entry: { id: string; timestamp: Date; userId: string; action: string; resource: string; result: string; details?: Record<string, unknown>; ip?: string; userAgent?: string }): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_id, action, resource, result, details, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(entry.id, entry.timestamp.toISOString(), entry.userId, entry.action, entry.resource, entry.result, JSON.stringify(entry.details ?? {}), entry.ip ?? null, entry.userAgent ?? null);
  }

  queryAuditLogs(filter?: { userId?: string; action?: string; result?: string; limit?: number; offset?: number }): Record<string, unknown>[] {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: unknown[] = [];
    if (filter?.userId) { sql += ' AND user_id = ?'; params.push(filter.userId); }
    if (filter?.action) { sql += ' AND action = ?'; params.push(filter.action); }
    if (filter?.result) { sql += ' AND result = ?'; params.push(filter.result); }
    sql += ' ORDER BY timestamp DESC';
    if (filter?.limit) sql += ` LIMIT ${filter.limit}`;
    if (filter?.offset) sql += ` OFFSET ${filter.offset}`;
    return this.db.prepare(sql).all(...params) as Record<string, unknown>[];
  }

  // --- Memory ---

  saveMemoryEntry(entry: { id: string; type: string; content: string; source: string; confidence: number; createdAt: Date; lastAccessed: Date; accessCount: number; tags: string[]; metadata: Record<string, unknown> }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memory_entries (id, type, content, source, confidence, created_at, last_accessed, access_count, tags, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(entry.id, entry.type, entry.content, entry.source, entry.confidence, entry.createdAt.toISOString(), entry.lastAccessed.toISOString(), entry.accessCount, JSON.stringify(entry.tags), JSON.stringify(entry.metadata));
  }

  queryMemory(type?: string, minConfidence?: number, limit?: number): Record<string, unknown>[] {
    let sql = 'SELECT * FROM memory_entries WHERE 1=1';
    const params: unknown[] = [];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (minConfidence !== undefined) { sql += ' AND confidence >= ?'; params.push(minConfidence); }
    sql += ' ORDER BY confidence DESC, last_accessed DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(...params) as Record<string, unknown>[];
  }

  deleteMemory(id: string): boolean {
    return this.db.prepare('DELETE FROM memory_entries WHERE id = ?').run(id).changes > 0;
  }

  // --- Telemetry ---

  appendLog(entry: { timestamp: Date; level: string; source: string; message: string; data?: Record<string, unknown> }): void {
    this.db.prepare('INSERT INTO telemetry_logs (timestamp, level, source, message, data) VALUES (?, ?, ?, ?, ?)')
      .run(entry.timestamp.toISOString(), entry.level, entry.source, entry.message, JSON.stringify(entry.data ?? {}));
  }

  appendMetric(entry: { timestamp: Date; name: string; value: number; tags?: Record<string, string> }): void {
    this.db.prepare('INSERT INTO telemetry_metrics (timestamp, name, value, tags) VALUES (?, ?, ?, ?)')
      .run(entry.timestamp.toISOString(), entry.name, entry.value, JSON.stringify(entry.tags ?? {}));
  }

  saveSpan(span: { id: string; parentId?: string; traceId: string; name: string; startTime: Date; endTime?: Date; duration?: number; status: string; attributes: Record<string, unknown> }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO telemetry_spans (id, parent_id, trace_id, name, start_time, end_time, duration_ms, status, attributes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(span.id, span.parentId ?? null, span.traceId, span.name, span.startTime.toISOString(), span.endTime?.toISOString() ?? null, span.duration ?? null, span.status, JSON.stringify(span.attributes));
  }

  queryLogs(level?: string, source?: string, limit?: number): Record<string, unknown>[] {
    let sql = 'SELECT * FROM telemetry_logs WHERE 1=1';
    const params: unknown[] = [];
    if (level) { sql += ' AND level = ?'; params.push(level); }
    if (source) { sql += ' AND source = ?'; params.push(source); }
    sql += ' ORDER BY timestamp DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(...params) as Record<string, unknown>[];
  }

  queryMetrics(name?: string, limit?: number): Record<string, unknown>[] {
    let sql = 'SELECT * FROM telemetry_metrics WHERE 1=1';
    const params: unknown[] = [];
    if (name) { sql += ' AND name = ?'; params.push(name); }
    sql += ' ORDER BY timestamp DESC';
    if (limit) sql += ` LIMIT ${limit}`;
    return this.db.prepare(sql).all(...params) as Record<string, unknown>[];
  }

  // --- Sessions ---

  saveSession(session: { id: string; createdAt: Date; updatedAt: Date; data: Record<string, unknown>; metadata?: Record<string, unknown> }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO sessions (id, created_at, updated_at, data, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(session.id, session.createdAt.toISOString(), session.updatedAt.toISOString(), JSON.stringify(session.data), JSON.stringify(session.metadata ?? {}));
  }

  getSession(id: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  }

  deleteSession(id: string): boolean {
    return this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id).changes > 0;
  }

  // --- Workflow State ---

  saveWorkflowState(state: { id: string; plan: Record<string, unknown>; currentTask?: string; status: string; createdAt: Date; updatedAt: Date; state: Record<string, unknown> }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO workflow_state (id, plan, current_task, status, created_at, updated_at, state)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(state.id, JSON.stringify(state.plan), state.currentTask ?? null, state.status, state.createdAt.toISOString(), state.updatedAt.toISOString(), JSON.stringify(state.state));
  }

  getWorkflowState(id: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM workflow_state WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  }

  listWorkflowStates(status?: string): Record<string, unknown>[] {
    if (status) return this.db.prepare('SELECT * FROM workflow_state WHERE status = ? ORDER BY updated_at DESC').all(status) as Record<string, unknown>[];
    return this.db.prepare('SELECT * FROM workflow_state ORDER BY updated_at DESC').all() as Record<string, unknown>[];
  }

  // --- Backup & Restore ---

  backup(backupPath?: string): string {
    const dir = backupPath ? path.dirname(backupPath) : path.join(path.dirname(this.dbPath), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = backupPath ?? path.join(dir, `librecode-backup-${timestamp}.db`);
    this.db.backup(outPath);
    return outPath;
  }

  restore(backupPath: string): void {
    if (!fs.existsSync(backupPath)) throw new Error(`Backup not found: ${backupPath}`);
    this.db.close();
    if (this.backupTimer) clearInterval(this.backupTimer);
    fs.copyFileSync(backupPath, this.dbPath);
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
  }

  vacuum(): void {
    this.db.exec('VACUUM');
  }

  close(): void {
    if (this.backupTimer) clearInterval(this.backupTimer);
    this.db.close();
  }

  private startAutoBackup(intervalMs: number): void {
    this.backupTimer = setInterval(() => {
      try {
        this.backup();
      } catch { /* best-effort */ }
    }, intervalMs);
    this.backupTimer.unref();
  }
}
