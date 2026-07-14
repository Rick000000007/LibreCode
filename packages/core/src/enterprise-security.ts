export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  inherits?: string[];
}

export interface User {
  id: string;
  username: string;
  roles: string[];
  enabled: boolean;
  mfaEnabled: boolean;
  lastLogin?: Date;
}

export interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'execute' | 'admin';
  conditions?: PermissionCondition[];
}

export interface PermissionCondition {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'lt' | 'contains';
  value: unknown;
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  result: 'allow' | 'deny' | 'error';
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export interface ComplianceRule {
  id: string;
  name: string;
  standard: 'soc2' | 'hipaa' | 'gdpr' | 'pci' | 'sox';
  description: string;
  check: () => Promise<ComplianceResult>;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ComplianceResult {
  ruleId: string;
  passed: boolean;
  details: string;
  timestamp: Date;
}

export class EnterpriseSecurityManager {
  private roles = new Map<string, Role>();
  private users = new Map<string, User>();
  private auditLog: AuditEvent[] = [];
  private complianceRules: ComplianceRule[] = [];
  private auditLimit = 100000;

  constructor() {
    this.registerDefaultRoles();
  }

  createRole(role: Omit<Role, 'id'>): Role {
    const id = crypto.randomUUID();
    const full: Role = { ...role, id };
    this.roles.set(id, full);
    return full;
  }

  updateRole(id: string, patch: Partial<Omit<Role, 'id'>>): boolean {
    const role = this.roles.get(id);
    if (!role) return false;
    Object.assign(role, patch);
    return true;
  }

  deleteRole(id: string): boolean {
    return this.roles.delete(id);
  }

  getRole(id: string): Role | undefined {
    return this.roles.get(id);
  }

  listRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  createUser(user: Omit<User, 'id'>): User {
    const id = crypto.randomUUID();
    const full: User = { ...user, id };
    this.users.set(id, full);
    return full;
  }

  updateUser(id: string, patch: Partial<Omit<User, 'id'>>): boolean {
    const user = this.users.get(id);
    if (!user) return false;
    Object.assign(user, patch);
    return true;
  }

  deleteUser(id: string): boolean {
    return this.users.delete(id);
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByUsername(username: string): User | undefined {
    return Array.from(this.users.values()).find(u => u.username === username);
  }

  listUsers(): User[] {
    return Array.from(this.users.values());
  }

  checkPermission(userId: string, resource: string, action: Permission['action']): boolean {
    const user = this.users.get(userId);
    if (!user || !user.enabled) return false;

    const effectivePermissions = this.getEffectivePermissions(user);
    const allowed = effectivePermissions.some(p =>
      this.matchesResource(p.resource, resource) &&
      (p.action === action || p.action === 'admin') &&
      this.evaluateConditions(p, { resource, action }),
    );

    this.audit({
      userId,
      action,
      resource,
      result: allowed ? 'allow' : 'deny',
      details: { roles: user.roles },
    });

    return allowed;
  }

  hasPermission(userId: string, resource: string, action: Permission['action']): boolean {
    return this.checkPermission(userId, resource, action);
  }

  async runComplianceCheck(): Promise<ComplianceResult[]> {
    const results: ComplianceResult[] = [];
    for (const rule of this.complianceRules) {
      try {
        const result = await rule.check();
        results.push(result);
      } catch (err) {
        results.push({
          ruleId: rule.id,
          passed: false,
          details: `Error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date(),
        });
      }
    }
    return results;
  }

  addComplianceRule(rule: Omit<ComplianceRule, 'id'>): ComplianceRule {
    const id = crypto.randomUUID();
    const full: ComplianceRule = { ...rule, id };
    this.complianceRules.push(full);
    return full;
  }

  getAuditLog(filter?: { userId?: string; action?: string; result?: string; limit?: number }): AuditEvent[] {
    let result = [...this.auditLog];
    if (filter?.userId) result = result.filter(e => e.userId === filter.userId);
    if (filter?.action) result = result.filter(e => e.action === filter.action);
    if (filter?.result) result = result.filter(e => e.result === filter.result);
    if (filter?.limit) result = result.slice(-filter.limit);
    return result;
  }

  private getEffectivePermissions(user: User): Permission[] {
    const perms: Permission[] = [];
    const visited = new Set<string>();

    const collect = (roleId: string) => {
      if (visited.has(roleId)) return;
      visited.add(roleId);
      const role = this.roles.get(roleId);
      if (!role) return;
      perms.push(...role.permissions);
      for (const inherited of role.inherits ?? []) collect(inherited);
    };

    for (const roleId of user.roles) collect(roleId);
    return perms;
  }

  private matchesResource(pattern: string, resource: string): boolean {
    if (pattern === '*') return true;
    if (pattern.length > 200) return false;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    try {
      const regex = new RegExp(`^${escaped}$`);
      return regex.test(resource);
    } catch {
      return false;
    }
  }

  private evaluateConditions(permission: Permission, context: Record<string, unknown>): boolean {
    if (!permission.conditions || permission.conditions.length === 0) return true;
    return permission.conditions.every(cond => {
      const ctxVal = context[cond.field];
      switch (cond.operator) {
        case 'eq': return ctxVal === cond.value;
        case 'neq': return ctxVal !== cond.value;
        case 'in': return Array.isArray(cond.value) && cond.value.includes(ctxVal);
        case 'nin': return Array.isArray(cond.value) && !cond.value.includes(ctxVal);
        case 'gt': return typeof ctxVal === 'number' && typeof cond.value === 'number' && ctxVal > cond.value;
        case 'lt': return typeof ctxVal === 'number' && typeof cond.value === 'number' && ctxVal < cond.value;
        case 'contains': return typeof ctxVal === 'string' && ctxVal.includes(String(cond.value));
        default: return false;
      }
    });
  }

  private audit(event: Omit<AuditEvent, 'id' | 'timestamp'>): void {
    const entry: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...event,
    };
    this.auditLog.push(entry);
    if (this.auditLog.length > this.auditLimit) {
      this.auditLog = this.auditLog.slice(-this.auditLimit);
    }
  }

  private registerDefaultRoles(): void {
    this.createRole({
      name: 'admin',
      description: 'Full system access',
      permissions: [{ resource: '*', action: 'admin' }],
    });

    this.createRole({
      name: 'developer',
      description: 'Standard developer access',
      permissions: [
        { resource: 'file:*', action: 'read' },
        { resource: 'file:*', action: 'update', conditions: [{ field: 'action', operator: 'eq', value: 'update' }] },
        { resource: 'config:personal', action: 'read' },
        { resource: 'config:personal', action: 'update' },
      ],
    });

    this.createRole({
      name: 'viewer',
      description: 'Read-only access',
      permissions: [
        { resource: 'file:*', action: 'read' },
      ],
    });
  }
}
