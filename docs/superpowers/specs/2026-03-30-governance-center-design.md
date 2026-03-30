# Governance Center Design

## Overview

This document defines the first implementation of a global governance center for EasySQL. The scope is intentionally limited to features that can be made truly effective inside the current Electron desktop architecture without introducing a separate proxy service or modifying the target databases.

The first release will implement three working capabilities:

1. Data access classification for SQL and database operations, covering `DQL`, `DML`, `DDL`, and `TCL`.
2. Data masking for query results and table browsing results, based on global sensitive-field rules.
3. Operation audit and flashback assistance, including execution logs and rollback SQL suggestions for supported write operations.

The governance center is global. One shared rule set applies to every configured connection.

## Goals

- Add real governance behavior in the Electron main process so checks are enforced for all client-initiated execution paths.
- Preserve the current EasySQL user workflow with minimal interruption.
- Keep the first release small enough to verify and extend safely.
- Create clear extension points for the future items shown in the feature sketch:
  - Advanced permission strategy
  - Fine-grained permission control
  - Sensitive data identification
  - Dynamic authorization
  - Desensitization audit

## Non-Goals

The first release will not implement:

- Database-side authorization or privilege escalation control
- Automatic sensitive-data discovery across schemas
- Fully automatic rollback execution
- Row-level, user-level, or role-level policy engines
- A separate gateway or SQL proxy

Those items require a different architecture and should be treated as later phases.

## Product Scope

### 1. Data Access Classification

The system must classify all operations initiated from EasySQL into one of these categories:

- `DQL`: read-only queries such as `SELECT`, `SHOW`, `DESC`, `EXPLAIN`
- `DML`: `INSERT`, `UPDATE`, `DELETE`, `MERGE`, row edits from the table UI
- `DDL`: `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, table designer changes
- `TCL`: `BEGIN`, `START TRANSACTION`, `COMMIT`, `ROLLBACK`, savepoints
- `UNKNOWN`: fallback when parsing fails

Classification applies to:

- SQL executed from the SQL editor via `db:query`
- Table editing IPC handlers such as update, insert, delete
- Schema management IPC handlers such as create table, drop table, truncate table, rename table, duplicate table

The system must also derive a lightweight risk level:

- `low`: normal reads and bounded changes
- `medium`: writes with expected scope
- `high`: destructive or hard-to-reverse operations such as `DROP`, `TRUNCATE`, or `DELETE` without `WHERE`

### 2. Data Masking

Masking is display-only. Original database values are never changed by this feature.

The first release will support global rules based on column-name matching. A rule includes:

- Rule id
- Enabled flag
- Match mode: exact or keyword
- Pattern
- Mask type

Supported mask types in v1:

- `phone`
- `email`
- `id-card`
- `bank-card`
- `name`
- `custom-partial`

Masking is applied to:

- SQL query results returned from `db:query`
- Table data returned from `db:getTableData`

Matching is case-insensitive. If no rule matches a column name, the value is returned unchanged.

### 3. Audit and Flashback Assistance

All classified operations must be written to a local audit log.

Audit records must include:

- Timestamp
- Connection id and connection name
- Database type
- Operation source: `sql-editor`, `table-editor`, `schema-designer`, or other IPC source
- Classification
- Risk level
- SQL text or synthetic operation summary
- Success or failure
- Error message if present

Flashback support in v1 is advisory, not automatic. The system stores enough context to help the user restore data manually.

Supported flashback scenarios:

- Table row update from the UI
- Table row delete from the UI
- SQL `UPDATE` with identifiable single-table target
- SQL `DELETE` with identifiable single-table target

For supported scenarios, the system stores:

- Before-image data when available
- Generated recovery SQL
- Related audit id

Not guaranteed in v1:

- Multi-table SQL recovery
- Stored procedure rollback
- Transaction replay
- Fully automatic execution of recovery SQL

## Recommended Architecture

### High-Level Choice

The chosen architecture is a governance layer inside the Electron main process.

This is preferred over a frontend-only solution because it can intercept both:

- SQL editor execution
- Non-SQL IPC operations such as row edits and schema changes

It is preferred over a proxy architecture because it fits the existing app and keeps the first release achievable.

### Main Process Governance Layer

Add a governance service layer between IPC handlers and database execution helpers in `electron/main.js`.

Recommended extracted modules:

- `electron/governance/config-store.js`
- `electron/governance/sql-classifier.js`
- `electron/governance/risk-analyzer.js`
- `electron/governance/masking-engine.js`
- `electron/governance/audit-store.js`
- `electron/governance/flashback-builder.js`

Responsibilities:

- `config-store`: load and save governance settings
- `sql-classifier`: classify SQL into `DQL`, `DML`, `DDL`, `TCL`, `UNKNOWN`
- `risk-analyzer`: assign risk flags based on operation patterns
- `masking-engine`: apply masking rules to result sets
- `audit-store`: append and query audit entries
- `flashback-builder`: capture before-images and create rollback SQL suggestions

## Data Flow

### SQL Editor Query Path

1. Renderer calls `db:query`.
2. Main process loads governance config.
3. SQL is classified and risk-scored.
4. If governance says the operation requires a prompt or block, return a structured response instead of executing.
5. Execute the query.
6. Write audit entry with success or failure.
7. If result is a read result, apply masking before returning to renderer.
8. If result is a supported write operation, capture flashback metadata when possible.

### Table Data Path

1. Renderer calls `db:getTableData`.
2. Main process fetches data.
3. Governance masking is applied to returned rows.
4. The result reaches the renderer already masked.

### Row Edit Path

1. Renderer calls `db:updateRow`, `db:deleteRow`, or `db:insertRow`.
2. Main process captures the target row before mutation when needed.
3. The operation is mapped to `DML`.
4. Audit entry is written.
5. Flashback recovery SQL is generated for supported cases.

### Schema Operation Path

1. Renderer calls handlers such as `db:dropTable` or `db:truncateTable`.
2. The operation is mapped to `DDL`.
3. Risk is marked high for destructive actions.
4. Audit entry is written.

## Storage Design

Use separate files under the app user-data directory. Do not mix governance state into `connections.json`.

Recommended files:

- `governance.json`
- `audit-log.jsonl`
- `flashback-log.jsonl`

### governance.json

Example shape:

```json
{
  "enabled": true,
  "blockHighRisk": false,
  "maskingEnabled": true,
  "auditEnabled": true,
  "maxAuditEntries": 5000,
  "maskRules": [
    {
      "id": "rule-phone",
      "enabled": true,
      "matchMode": "keyword",
      "pattern": "phone",
      "maskType": "phone"
    }
  ]
}
```

### audit-log.jsonl

One JSON object per line. This favors append-only writes and keeps the implementation simple for Electron.

### flashback-log.jsonl

One JSON object per line, with recovery SQL and before-image data for supported operations.

## UI Design

Add one new top-level entry: `Governance Center`.

This keeps governance features in one place rather than scattering them across existing dialogs.

### Tabs

#### Access Classification and Risk

Shows:

- Classification counts by `DQL`, `DML`, `DDL`, `TCL`
- Recent high-risk operations
- Global toggle for high-risk blocking or confirmation behavior

#### Data Masking

Shows:

- Global masking enable switch
- Rule list
- Add, edit, delete rule actions
- Mask type preview examples

#### Audit and Flashback

Shows:

- Recent audit entries
- Filters by category, connection, and success state
- Per-row action to inspect generated recovery SQL

### Lightweight Main UI Feedback

Outside the governance center:

- SQL execution result area shows classification and risk badges for the latest execution
- High-risk operations trigger a confirmation flow before execution if the config requires it

## Component Design

Renderer additions:

- `src/components/GovernanceCenter.tsx`
- Possibly small child components for rules, audit table, and flashback detail

App integration:

- `src/App.tsx` gains state and navigation for opening governance center
- `src/lib/electron-api.ts` gains governance APIs and related types
- `src/types.ts` gains governance configuration and audit types if shared across components

Main process additions:

- New IPC channels for governance config read/write
- New IPC channels for audit log query and flashback retrieval

## API Design

Renderer-facing governance API additions should cover:

- Load governance config
- Save governance config
- List recent audit entries
- List recent flashback entries
- Get one flashback detail by id

Possible preload API surface:

```ts
loadGovernanceConfig()
saveGovernanceConfig(config)
listAuditLogs(filters?)
listFlashbackLogs(filters?)
getFlashbackRecord(id)
```

## Enforcement Rules

### Classification Rules

Start with a lightweight SQL classifier rather than a full SQL parser. For v1, use normalized leading-keyword inspection plus targeted heuristics.

Examples:

- `SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN` => `DQL`
- `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `MERGE` => `DML`
- `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `RENAME` => `DDL`
- `BEGIN`, `START TRANSACTION`, `COMMIT`, `ROLLBACK`, `SAVEPOINT` => `TCL`

### High-Risk Heuristics

Mark these as high risk in v1:

- `DROP DATABASE`
- `DROP TABLE`
- `TRUNCATE TABLE`
- `DELETE` without `WHERE`
- `UPDATE` without `WHERE`
- Any destructive schema operation initiated from table tools

Mark these as medium risk:

- Normal `INSERT`
- Normal `UPDATE` or `DELETE` with `WHERE`
- Table row edits

### Masking Rules

Normalize column names to lowercase before matching.

Keyword examples:

- `phone`, `mobile`, `tel`
- `email`, `mail`
- `idcard`, `id_card`, `identity`
- `bankcard`, `bank_card`, `cardno`
- `name`, `real_name`

The masking engine must handle:

- `null` values
- non-string values by converting to string only when required by the mask type
- short values without throwing

## Flashback Strategy

### UI Row Updates

Before performing an update:

- Read the current row using the primary key
- Save the row as before-image
- Generate rollback SQL that restores original values

### UI Row Deletes

Before performing a delete:

- Read the current row using the primary key
- Save the row as before-image
- Generate rollback SQL as an `INSERT`

### Raw SQL Update and Delete

Only support recovery SQL generation when:

- The statement targets one table
- The table name can be identified
- A simple before-image query can be performed safely

If not safely supported:

- Still create an audit entry
- Mark flashback as unavailable

## Error Handling

- Governance failure must not silently corrupt execution flow.
- If config loading fails, fall back to a safe default and log the error.
- If audit writing fails, the query may still proceed, but the failure must be logged clearly.
- If masking fails, return the unmasked result only if masking is disabled by failure policy. For this release, prefer fail-open with an audit note rather than breaking every query.
- If flashback capture fails, continue execution but record flashback-unavailable in audit metadata.

## Testing Strategy

Follow test-first implementation.

Minimum test groups:

### Classification Tests

- `SELECT` classified as `DQL`
- `INSERT`, `UPDATE`, `DELETE` classified as `DML`
- `CREATE`, `ALTER`, `DROP`, `TRUNCATE` classified as `DDL`
- `BEGIN`, `COMMIT`, `ROLLBACK` classified as `TCL`
- Empty or unsupported SQL classified as `UNKNOWN`

### Risk Tests

- `DELETE FROM users` is high risk
- `UPDATE users SET name = 'x'` without `WHERE` is high risk
- `DROP TABLE users` is high risk

### Masking Tests

- Phone masking for matching columns
- Email masking for matching columns
- No masking on unrelated columns
- Null and short-value handling

### Audit Tests

- Query execution writes a success audit record
- Failed execution writes a failed audit record
- Row update and delete from UI are logged with correct category

### Flashback Tests

- Delete row produces an insert recovery SQL
- Update row produces an update recovery SQL
- Unsupported raw SQL marks flashback unavailable

## File Impact

Expected files to change during implementation:

- `electron/main.js`
- `electron/preload.js`
- `src/lib/electron-api.ts`
- `src/App.tsx`
- `src/types.ts`
- New governance modules under `electron/governance/`
- New UI component under `src/components/`

## Implementation Sequence

1. Add governance config storage and types.
2. Add SQL classifier and risk analyzer with tests.
3. Add masking engine with tests.
4. Integrate query-path governance in `db:query`.
5. Integrate row-edit and schema-operation audit hooks.
6. Add flashback builder for supported update and delete scenarios.
7. Expose governance IPC APIs to renderer.
8. Build governance center UI.
9. Add lightweight badges and risk prompts in existing query flow.

## Open Questions Resolved for V1

- Governance scope is global, not per connection.
- First release is main-process enforced, not frontend-only.
- First working features are classification, masking, and audit/flashback assistance.
- Flashback means recovery guidance, not automatic rollback execution.

## Approval State

This document reflects the approved interactive design decisions from March 30, 2026 and is intended to be the implementation baseline for the next planning step.
