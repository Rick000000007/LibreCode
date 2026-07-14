# LibreCode Developer Guide

## Prerequisites

- Node.js >= 22.0.0
- pnpm >= 9.0.0

## Setup

```bash
git clone <repo>
cd librecode
pnpm install
pnpm build
```

## Development Workflow

### Build all packages
```bash
pnpm build
```

### Build a specific package
```bash
pnpm --filter librecode-core build
```

### Watch mode
```bash
pnpm build:watch
```

### Run all tests
```bash
pnpm test
```

### Run tests for a specific package
```bash
pnpm --filter librecode-core test
```

### Run tests with coverage
```bash
pnpm test:coverage
```

### Run specific test file
```bash
pnpm --filter librecode-core vitest run ast-editor
pnpm --filter librecode-core vitest run e2e
```

### Run benchmarks
```bash
pnpm --filter librecode-core vitest run --bench
```
*Note: Benchmarks require vitest 2.x (upgrade from 1.6.0)*

### Lint
```bash
pnpm lint
pnpm lint:fix
```

### Format
```bash
pnpm format
pnpm format:check
```

## Code Style

- TypeScript with strict mode
- ES2022 target, NodeNext module resolution
- Use `node:` prefix for built-in modules
- Prefer `const` over `let`, avoid `var`
- Use `interface` over `type` for object shapes
- Export types with `export type` for isolatedModules
- All public APIs must have type exports
- Async methods return `Promise<T>`, not `void`
- No silent catch blocks — log error context
- Use `crypto.randomUUID()` for IDs (Node 19+)

## Adding a New Feature

1. Add types to `librecode-types` if needed
2. Implement in `librecode-core`
3. Add tests in `src/__tests__/`
4. Export from `src/index.ts`
5. Update `ARCHITECTURE.md` if architectural change
6. Add E2E test in `src/__tests__/e2e.test.ts`

## Testing Guidelines

- Unit tests in `src/__tests__/*.test.ts`
- E2E tests in `src/__tests__/e2e.test.ts`
- Benchmarks in `src/__tests__/*.bench.ts`
- No external API calls in unit tests
- Use `createTempDir()` for filesystem tests
- Always clean up temp directories in `finally` blocks
