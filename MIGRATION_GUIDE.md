# Migration Guide

## Migrating from 0.4.0-beta.1 to 1.0.0

### Breaking Changes

1. **`repo_map.ts` refactored into `repo-map/` directory**
   - `import { RepoMapper } from 'librecode-core'` still works (re-export maintained)
   - Internal imports of `./repo_map` should use `./repo-map/index.js` or the sub-modules
   - Types `SymbolEntry`, `ProjectInfo` are now exported from `repo-map/types.js`

2. **`index.ts` split into `index.ts` + `agent.ts`**
   - `import { Agent } from 'librecode-core'` still works
   - Direct imports from `../src/index.js` should use `../src/agent.js` for Agent class

3. **`VectorIndex.index()` is now async**
   - Previous sync signature `index(chunks)` become `async index(chunks)`
   ```typescript
   // Old:
   index.index(chunks);
   
   // New:
   await index.index(chunks);
   ```

4. **`CodeIndexer.indexFile()` is async**
   - Already documented as async in 0.4.0 but implementation was partially sync
   - Now properly awaits the index operation

### New Features (1.0.0)

- **RustAstProvider** — Rust code editing (fn, struct, enum, trait, impl, mod)
- **GoAstProvider** — Go code editing (func, type, struct, interface, var, const)
- **Hybrid RAG** — `VectorIndex.hybridSearch()` with embedding fusion
- **OpenAIEmbeddingProvider** — `text-embedding-3-small` embeddings
- **OllamaEmbeddingProvider** — `nomic-embed-text` (or any Ollama model)
- **MCPHttpClient/MCPHttpServer** — HTTP-based MCP transport
- **ChokidarWatcher** — Production file watching
- **OpenTelemetryManager** — OTel-compatible export
- **CI benchmark regression detection** — `pnpm bench:ci`
- **Mutation testing** — `pnpm mutation` (StrykerJS)

### Deprecations

- `TypeScriptAstProvider` (regex-based) is superseded by `TsMorphProvider` (parser-backed)
- The legacy regex-based TypeScript provider will be removed in 2.0.0

## Migrating from 0.3.x to 0.4.0

### Breaking Changes

1. **Agent class properties `ProviderName` and `ProviderModel` are now `readonly`**
   - Use `setProvider()` to change the active provider instead of direct assignment
   ```typescript
   // Old (0.3.x):
   agent.ProviderName = 'new-provider';
   
   // New (0.4.0):
   agent.setProvider(newProvider, 'new-provider', 'model-name');
   ```

2. **`GitWorkflow` now uses `execFileSync` instead of `execSync`**
   - All git commands use argument arrays — no shell injection risk
   - String interpolation in `createBranch()`, `commit()`, `safeRollback()` is gone
   - All methods still return the same types

3. **`CheckpointManager.saveCheckpoint()` is now synchronous**
   - No longer returns a Promise — returns `Checkpoint` directly
   ```typescript
   // Old:
   const cp = await cm.saveCheckpoint('desc', files);
   
   // New:
   const cp = cm.saveCheckpoint('desc', files);
   ```

4. **`PluginMarketplace.install()` is now synchronous**
   - SHA-256 hash uses Node.js `crypto.createHash()` (synchronous)
   ```typescript
   // Old:
   const pkg = await pm.install(manifest, code);
   
   // New:
   const pkg = pm.install(manifest, code);
   ```

5. **`MCPClient` constructor accepts optional `requestTimeout` parameter**
   ```typescript
   // Old:
   const client = new MCPClient(config);
   
   // New (optional):
   const client = new MCPClient(config, 15000); // 15s timeout
   ```

6. **`EnterpriseSecurityManager` constructor no longer requires `SecurityManager`**
   ```typescript
   // Old:
   const esm = new EnterpriseSecurityManager(securityManager);
   
   // New:
   const esm = new EnterpriseSecurityManager();
   ```

### New Features (0.4.0)

- AST-Based Code Editing (TypeScript, Python)
- Semantic Search (TF-IDF RAG)
- Multi-Agent Orchestrator
- Checkpoints & Milestones
- Learning Memory with confidence scoring
- Plugin Marketplace with sandboxing
- Workspace Orchestrator with file watching
- Observability (logs, metrics, tracing)
- Enterprise Security (RBAC, compliance, audit)
- Advanced TUI with themes
- 18 new E2E integration tests

### Deprecations

None in this release.

### Removals

None in this release.
