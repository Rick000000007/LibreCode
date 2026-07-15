# SQLite Persistence Schema

## Overview

LibreCode uses SQLite (via `better-sqlite3`) for persistent storage. The database is stored at `.librecode/librecode.db` in the workspace root directory.

## Schema Version: 2

### `schema_version`
Migration tracking table.

| Column | Type | Description |
|--------|------|-------------|
| version | INTEGER (PK) | Schema version number |
| applied_at | TEXT | Timestamp of migration |

### `checkpoints`
File snapshots and milestones.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| version | INTEGER | Incrementing version |
| timestamp | TEXT | ISO 8601 timestamp |
| description | TEXT | Human-readable description |
| files | TEXT | JSON array of [file, content] pairs |
| metadata | TEXT | JSON metadata object |
| parent_id | TEXT | Previous checkpoint ID |
| tags | TEXT | JSON array of tags |

### `audit_logs`
Security audit trail.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| timestamp | TEXT | ISO 8601 |
| user_id | TEXT | User identifier |
| action | TEXT | Action performed |
| resource | TEXT | Target resource |
| result | TEXT | success/failure/blocked |
| details | TEXT | JSON details |
| ip | TEXT | Client IP |
| user_agent | TEXT | Client user agent |

### `memory_entries`
Persistent memory storage.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| type | TEXT | pattern/preference/fact/project_knowledge/error |
| content | TEXT | Memory content |
| source | TEXT | Origin |
| confidence | REAL | 0.0-1.0 confidence score |
| created_at | TEXT | ISO 8601 |
| last_accessed | TEXT | ISO 8601 |
| access_count | INTEGER | Access counter |
| tags | TEXT | JSON array |
| metadata | TEXT | JSON object |

### `telemetry_logs`
Structured log entries.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER (PK) | Auto-increment |
| timestamp | TEXT | ISO 8601 |
| level | TEXT | debug/info/warn/error |
| source | TEXT | Component name |
| message | TEXT | Log message |
| data | TEXT | JSON data payload |

### `telemetry_metrics`
Numeric metrics.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER (PK) | Auto-increment |
| timestamp | TEXT | ISO 8601 |
| name | TEXT | Metric name |
| value | REAL | Numeric value |
| tags | TEXT | JSON tags |

### `telemetry_spans`
Distributed tracing spans.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| parent_id | TEXT | Parent span |
| trace_id | TEXT | Trace identifier |
| name | TEXT | Span name |
| start_time | TEXT | ISO 8601 |
| end_time | TEXT | ISO 8601 |
| duration_ms | REAL | Duration |
| status | TEXT | ok/error |
| attributes | TEXT | JSON attributes |

### `sessions`
Session state.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |
| data | TEXT | JSON session data |
| metadata | TEXT | JSON metadata |

### `workflow_state`
Workflow plan persistence.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| plan | TEXT | JSON plan |
| current_task | TEXT | Active task ID |
| status | TEXT | active/completed/failed |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |
| state | TEXT | JSON state |

### `conversations` (V2)
Conversation message storage.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| session_id | TEXT | FK to sessions |
| role | TEXT | user/assistant/system/tool |
| content | TEXT | Message content |
| token_count | INTEGER | Token count |
| created_at | TEXT | ISO 8601 |
| metadata | TEXT | JSON metadata |

### `provider_history` (V2)
API call history.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| provider | TEXT | Provider name |
| model | TEXT | Model name |
| action | TEXT | Action type |
| tokens_in | INTEGER | Input tokens |
| tokens_out | INTEGER | Output tokens |
| duration_ms | REAL | Duration |
| cost | REAL | Estimated cost |
| success | INTEGER | 1/0 |
| error | TEXT | Error message |
| timestamp | TEXT | ISO 8601 |

### `workspace_metadata` (V2)
Key-value workspace metadata.

| Column | Type | Description |
|--------|------|-------------|
| key | TEXT (PK) | Metadata key |
| value | TEXT | Metadata value |
| updated_at | TEXT | ISO 8601 |

### `timeline_events` (V2)
Workspace timeline entries.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID |
| type | TEXT | Event type |
| description | TEXT | Event description |
| timestamp | TEXT | ISO 8601 |
| data | TEXT | JSON data |
| session_id | TEXT | Session reference |
| tags | TEXT | JSON array |

### `macros` (V2)
Custom macro definitions.

| Column | Type | Description |
|--------|------|-------------|
| name | TEXT (PK) | Macro name |
| definition | TEXT | YAML/JSON definition |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |
| metadata | TEXT | JSON metadata |

## Indexes

- `idx_audit_user`, `idx_audit_timestamp`
- `idx_memory_type`, `idx_memory_confidence`
- `idx_telemetry_source`, `idx_telemetry_level`
- `idx_metrics_name`
- `idx_spans_trace`
- `idx_conv_session`, `idx_conv_created`
- `idx_provider_ts`, `idx_provider_name`
- `idx_timeline_type`, `idx_timeline_ts`
