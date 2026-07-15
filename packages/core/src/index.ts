export { generateSystemPrompt } from './prompt.js';
export { PromptBuilder, buildSystemPrompt, createDefaultPromptBuilder, identitySection, capabilitiesSection, workingDirSection, repositorySection, guidelinesSection, responseFormatSection, preferencesSection, modelCapabilitiesSection } from './prompt-builder.js';
export type { PromptBuilderOptions, PromptSection } from './prompt-builder.js';
export { RepoMapper } from './repo_map.js';
export type { DependencyEdge, CrossReference, SymbolEntry, ProjectInfo } from './repo_map.js';
export { WorkflowEngine } from './workflow/engine.js';
export type { PlanTask, Plan, WorkflowOptions } from './workflow/engine.js';
export { PlanTasksTool, CompleteTaskTool } from './workflow/tools.js';
export { SessionManager } from './session.js';
export type { SessionMetadata, SessionData } from './session.js';
export { PluginSystem, createPluginManifest } from './plugin-system.js';
export type { PluginManifest as PluginSystemManifest, PluginAPI, PluginHooks, PluginOptions } from './plugin-system.js';
export { AutoValidator } from './validation.js';
export type { ValidationStep, ValidationResult, ValidationReport } from './validation.js';
export { StreamManager, LiveStreamDisplay, CancellationToken, CancelledError } from './stream-manager.js';
export type { StreamEvent, StreamEventType, StreamListener } from './stream-manager.js';
export { ParallelExecutor } from './parallel.js';
export type { Task, TaskResult, ParallelOptions } from './parallel.js';
export { MCPClient, MCPServerManager } from './mcp.js';
export type { MCPServerConfig, MCPToolDefinition, MCPCallResult } from './mcp.js';
export { MCPHttpClient, MCPHttpServer } from './mcp-http.js';
export type { MCPHttpTransportConfig } from './mcp-http.js';
export { AdvancedTUI } from './tui.js';
export type { TUITheme, TUICommand, TUIStatus } from './tui.js';
export { GitWorkflow } from './git-workflow.js';
export type { GitStatus, CommitSuggestion } from './git-workflow.js';
export { Telemetry, CostTracker } from './telemetry.js';
export type { ToolTiming, TurnMetrics, PerformanceReport } from './telemetry.js';
export { SecurityManager } from './security.js';
export type { SecurityPolicy, AuditEntry } from './security.js';
export { AstProviderRegistry, defaultRegistry, TsMorphProvider, TypeScriptAstProvider, PythonAstProvider, RustAstProvider, GoAstProvider, detectLanguage, isSupportedLanguage } from './ast-editor/index.js';
export type { AstProvider, AstEditResult, AstEdit, EditRange, SymbolInfo, Language } from './ast-editor/index.js';
export { PersistenceStore } from './persistence.js';
export type { PersistenceConfig, ConversationRecord, ProviderHistoryRecord, WorkspaceMetadataRecord } from './persistence.js';
export { CodeIndexer, VectorIndex, TfIdfVectorizer, OpenAIEmbeddingProvider, OllamaEmbeddingProvider } from './rag.js';
export type { Chunk, SearchResult, EmbeddingProvider } from './rag.js';
export { AgentOrchestrator } from './orchestrator.js';
export type { AgentTask } from './orchestrator.js';
export { CheckpointManager, createDiff } from './checkpoint.js';
export type { Checkpoint, Milestone } from './checkpoint.js';
export { LearningMemory } from './memory.js';
export type { MemoryEntry, PatternMatch } from './memory.js';
export { PluginMarketplace } from './marketplace.js';
export type { PluginManifest, PluginPackage, MarketplaceListing } from './marketplace.js';
export { WorkspaceOrchestrator } from './workspace-orchestrator.js';
export type { WorkspaceConfig, WorkspaceTask, FileEvent } from './workspace-orchestrator.js';
export { ObservabilityManager } from './observability.js';
export type { LogEntry, MetricValue, Span, Trace, LogLevel } from './observability.js';
export { OpenTelemetryManager } from './opentelemetry.js';
export type { OtelExporterConfig, OtelSpan, OtelMetric, OtelExporterType } from './opentelemetry.js';
export { EnterpriseSecurityManager } from './enterprise-security.js';
export type { Role, User, Permission, AuditEvent, ComplianceRule, ComplianceResult } from './enterprise-security.js';
export { ChokidarWatcher } from './chokidar-watcher.js';
export type { WatchEvent, WatchListener, ChokidarWatcherOptions } from './chokidar-watcher.js';
export { Agent } from './agent.js';

// Phase 37 - LSP Integration
export { LSPManager, LSPClient } from './lsp/index.js';
export type { LSPDiagnostic, LSPCompletion, LSPSymbol, LSPHover, LSPLocation, LSPServerConfig, LSPManagerOptions } from './lsp/index.js';

// Phase 38 - External Editor
export { ExternalEditor } from './editor.js';
export type { EditorConfig } from './editor.js';

// Phase 39 - Modal Editor
export { ModalEditor } from './modal-editor.js';
export type { EditorMode, EditorOptions } from './modal-editor.js';

// Phase 40 - Macro System
export { MacroEngine } from './macro.js';
export type { MacroDefinition, MacroArgument, MacroStep, MacroContext } from './macro.js';

// Phase 41 - Workspace Timeline
export { WorkspaceTimeline } from './timeline.js';
export type { TimelineEvent, TimelineEventType, TimelineDiff } from './timeline.js';

// Phase 42 - Workspace Dashboard
export { WorkspaceDashboard } from './dashboard.js';
export type { DashboardData, DashboardWidget } from './dashboard.js';
