# LibreCode Troubleshooting Guide

## Common Issues

### Build fails with TypeScript errors

```bash
# Clean and rebuild
pnpm clean
pnpm build
```

### Tests hang or timeout

- E2E tests use filesystem operations that may be slow in CI
- Increase timeout: `vitest run --testTimeout=30000`
- The `WorkspaceOrchestrator.init()` uses `fs.watch` which may hang in some environments
- Solution: Use `--reporter=verbose` to identify which test hangs

### MCP server not connecting

1. Verify the server path is correct
2. Check `~/.config/librecode/mcp-servers.json` format
3. Run the server command manually to test
4. Check stderr output from the MCP server

### Permission errors

- RBAC: User must have a role with the required permission
- Tool-level: Use `setAlwaysAllow(tool)` to pre-approve
- File operations: Verify path is within allowed workspace root

### "Path traversal denied" errors

- All file paths must resolve within the configured workspace root
- Use absolute paths or paths relative to workspace root
- Symbolic links pointing outside workspace are rejected

### AST editing produces wrong results

- The regex-based providers are heuristic — they may fail on complex code
- Known limitations: arrow functions, nested generics, template literals
- Fall back to string-based operations for precision

### Memory grows unbounded

- Check that `ObservabilityManager.clear()` or `LearningMemory.forget()` is called periodically
- Verify `maxEntries` is set in `LearningMemory`
- Log, metric, and trace limits should prevent unbounded growth

## Getting Help

- GitHub Issues: https://github.com/Rick000000007/LibreCode/issues
- Check KNOWN_ISSUES.md for known limitations
- Run `librecode doctor` for system diagnostics
