# LibreCode Security Guide

## Overview

LibreCode implements defense-in-depth security across all subsystems.

## Security Layers

### 1. Command Injection Protection
All shell commands use `execFileSync` with argument arrays — never string interpolation.
User input is never concatenated into command strings.

### 2. Path Traversal Protection
- Every file operation validates the resolved path is within the workspace root
- Paths are resolved with `path.resolve()` before validation
- Relative paths like `../../../etc/passwd` are rejected

### 3. Permission System
Two-tier permission model:

**Tool-level** (`PermissionChecker`):
- `setAlwaysAllow(tool)` — skip approval
- `setDeny(tool)` — always block
- `resetTool(tool)` — restore default (ask)

**Enterprise RBAC** (`EnterpriseSecurityManager`):
- Roles with fine-grained permissions (`create/read/update/delete/execute/admin`)
- Resource patterns with wildcard support
- Permission conditions (field-based constraints)
- Inheritable roles
- Full audit trail of all access decisions

### 4. Plugin Sandbox
- Manifest validation (required fields, ID format)
- Permission allowlist (`read:files`, `write:files`, `network`, `exec`)
- SHA-256 integrity verification
- Plugins cannot request unknown permissions

### 5. SecurityManager
- Dangerous command detection (sudo, rm -rf, chmod, dd, mkfs)
- Path allow/block lists
- File size limits
- Audit logging
- Confirmation prompts for dangerous operations

### 6. MCP HTTP Transport Security
- Optional `apiKey` authentication (Bearer token) on both client and server
- Configurable TLS options (CA, cert, key, `rejectUnauthorized`)
- Request timeout and retry limits
- Path traversal check on tool names

### 7. OpenTelemetry Export Security
- HTTP export supports `apiKey` header for authenticated collectors
- File export writes to configurable path (not world-writable default)
- Console export for development only

## Default Security Policies

```typescript
{
  allowedCommands: [],     // Empty = allow all (use blocklist)
  blockedCommands: [       // Blocked command prefixes
    'sudo', 'rm -rf /', 'chmod 777', 'dd if=',
    'mkfs', '> /dev/', '| sh'
  ],
  allowedPaths: ['*'],     // Allow all paths
  blockedPaths: [          // Block sensitive paths
    '/etc', '/usr', '/proc', '/sys', '/boot'
  ],
  maxFileSize: 10 * 1024 * 1024,  // 10 MB
  confirmDangerous: true,
  auditLog: false
}
```

## Best Practices

1. **Never disable security checks in production**
2. **Use least-privilege RBAC roles**
3. **Enable audit logging** for compliance
4. **Set `maxFileSize`** appropriate to your workload
5. **Review audit logs** regularly
6. **Never commit `.env` or API keys** to version control
7. **Configure MCP HTTP with apiKey and TLS** in production deployments
8. **Use chokidar's ignored paths** to prevent watching sensitive directories
