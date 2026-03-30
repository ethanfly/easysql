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

Audit records must follow a fixed schema rather than an ad hoc object shape.

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
4. Governance computes a decision from classification, risk, and policy.
5. If the decision is `block`, return a structured response instead of executing.
6. If the decision is `confirm`, the renderer must collect explicit user confirmation and retry with an approval token.
7. If the decision is `allow`, continue directly.
8. Execute the query.
9. Write audit entry with success or failure.
10. If result is a read result, apply masking before returning to renderer.
11. If result is a supported write operation, capture flashback metadata when possible.

### Table Data Path

1. Renderer calls `db:getTableData`.
2. Main process fetches data.
3. Governance masking is applied to returned rows.
4. The result reaches the renderer already masked.

### Row Edit Path

1. Renderer calls `db:updateRow`, `db:deleteRow`, or `db:insertRow`.
2. Main process captures the target row before mutation when needed.
3. The operation is mapped to `DML`.
4. Governance computes a decision from operation kind and risk.
5. Audit entry is written.
6. Flashback recovery SQL is generated for supported cases.

### Schema Operation Path

1. Renderer calls handlers such as `db:dropTable` or `db:truncateTable`.
2. The operation is mapped to `DDL`.
3. Risk is marked high for destructive actions.
4. Governance computes a decision from operation kind and risk.
5. Audit entry is written.

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
  "defaultUnknownDecision": "confirm",
  "highRiskMode": "confirm",
  "maskingEnabled": true,
  "auditEnabled": true,
  "maxAuditEntries": 5000,
  "decisionPolicy": {
    "DQL": "allow",
    "DML": "allow",
    "DDL": "confirm",
    "TCL": "allow",
    "UNKNOWN": "confirm"
  },
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

Additional config constraints:

- `defaultUnknownDecision` must default to `confirm`
- `highRiskMode` may be `allow`, `confirm`, or `block`
- `decisionPolicy` maps classifier output to a default governance decision
- `UNKNOWN` must never default to `allow` in v1

### Audit Record Schema

Every audit entry must use a stable schema so the UI and future migrations can rely on fixed fields.

```json
{
  "id": "audit_01HXYZ...",
  "timestamp": "2026-03-30T10:15:30.123Z",
  "connectionId": "conn_123",
  "connectionName": "Production MySQL",
  "databaseType": "mysql",
  "databaseName": "app_db",
  "source": "sql-editor",
  "operationKind": "raw-sql",
  "classification": "DML",
  "riskLevel": "medium",
  "decision": "allow",
  "approvedByUser": false,
  "sqlText": "UPDATE users SET phone = '13800000000' WHERE id = 1",
  "statementCount": 1,
  "isMultiStatement": false,
  "target": {
    "schema": "app_db",
    "table": "users",
    "primaryKey": "id"
  },
  "maskingApplied": false,
  "flashback": {
    "eligible": true,
    "available": true,
    "flashbackId": "flashback_01HXYZ..."
  },
  "result": {
    "success": true,
    "affectedRows": 1,
    "errorCode": null,
    "errorMessage": null,
    "durationMs": 42
  },
  "metadata": {
    "highRiskReasons": [],
    "classifierNotes": [],
    "clientVersion": "2.0.15"
  }
}
```

Required fields:

- `id`
- `timestamp`
- `connectionId`
- `connectionName`
- `databaseType`
- `source`
- `operationKind`
- `classification`
- `riskLevel`
- `decision`
- `approvedByUser`
- `statementCount`
- `isMultiStatement`
- `result.success`

Optional but strongly recommended fields:

- `databaseName`
- `sqlText`
- `target`
- `maskingApplied`
- `flashback`
- `result.affectedRows`
- `result.errorCode`
- `result.errorMessage`
- `result.durationMs`
- `metadata`

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
approveGovernanceDecision(requestId)
```

### Governance Decision Model

Every intercepted operation must resolve to one of three decisions:

- `allow`: execute immediately
- `confirm`: require explicit user confirmation before execution
- `block`: do not execute

Decision inputs:

- Governance enabled flag
- Operation source
- Classification
- Risk level
- Statement count
- Whether the SQL was parsed confidently
- Whether the action is inherently destructive

Decision rules in v1:

1. If governance is disabled, return `allow`.
2. If classification is `UNKNOWN`, use `defaultUnknownDecision`.
3. If the operation is high risk, use `highRiskMode`.
4. Otherwise, use `decisionPolicy[classification]`.

Decision overrides:

- Multi-statement raw SQL must never return `allow` automatically in v1.
- `UNKNOWN` plus multi-statement must resolve to `block` or `confirm`, never `allow`.
- Destructive `DDL` such as `DROP` and `TRUNCATE` should default to at least `confirm`.

Approval flow:

- A `confirm` result returns a structured payload with a short-lived `requestId`.
- The renderer shows the risk explanation and asks for confirmation.
- On confirmation, the renderer retries through an approval API that consumes the `requestId`.
- Approval must be single-use and short-lived to prevent accidental replay.

## Enforcement Rules

### Classification Rules

Start with a lightweight SQL classifier rather than a full SQL parser. For v1, use normalized leading-keyword inspection plus targeted heuristics.

Examples:

- `SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN` => `DQL`
- `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `MERGE` => `DML`
- `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `RENAME` => `DDL`
- `BEGIN`, `START TRANSACTION`, `COMMIT`, `ROLLBACK`, `SAVEPOINT` => `TCL`

Boundary rules:

- Leading comments and whitespace must be ignored before classification.
- `WITH ... SELECT ...` must classify as `DQL`.
- `WITH ... UPDATE/DELETE/INSERT ...` must classify by the first executable statement after the CTE.
- Empty SQL after trimming comments must classify as `UNKNOWN`.
- Parse failure must classify as `UNKNOWN`.
- Multi-statement input such as `SELECT 1; DELETE FROM users` must set `isMultiStatement = true` and classify as `UNKNOWN` in v1 unless every statement classifies to the same safe category and the implementation explicitly supports that path.
- If the classifier cannot prove a safe read-only interpretation, it must not downgrade to `DQL`.

### High-Risk Heuristics

Mark these as high risk in v1:

- `DROP DATABASE`
- `DROP TABLE`
- `TRUNCATE TABLE`
- `DELETE` without `WHERE`
- `UPDATE` without `WHERE`
- Any destructive schema operation initiated from table tools
- Any multi-statement raw SQL
- Any `UNKNOWN` raw SQL that reaches decision evaluation

Boundary behavior:

- `UNKNOWN` must default to `riskLevel = high` unless a narrower classification can be proven safely.
- Multi-statement raw SQL must default to `riskLevel = high`.
- `WITH` clauses do not reduce risk by themselves; only the resolved executable statement matters.
- Safety defaults must favor `confirm` or `block`, not permissive execution.

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

Raw SQL flashback support must be intentionally narrow in v1.

Only support recovery SQL generation when all of these are true:

- The statement targets one table
- The statement count is exactly one
- The statement classification is exactly `UPDATE` or `DELETE` within `DML`
- The table name can be identified with high confidence
- The target database and primary key can be identified with high confidence
- The statement includes a simple `WHERE` predicate that the flashback builder explicitly supports
- A before-image query can be generated without interpreting joins, subqueries, CTE recursion, unions, functions with side effects, or vendor-specific advanced syntax
- The before-image query returns a bounded result set under a conservative row cap

Unsupported examples in v1:

- Multi-statement SQL
- `UPDATE ... JOIN ...`
- `DELETE ... USING ...`
- CTE-based writes
- Statements without `WHERE`
- Statements whose target table or key cannot be resolved reliably
- Statements expected to affect more than the configured flashback row cap

If not safely supported:

- Still create an audit entry
- Mark flashback as unavailable
- Store a reason code explaining why flashback was skipped

## Error Handling

- Governance failure must not silently corrupt execution flow.
- If config loading fails, fall back to a safe default and log the error.
- If audit writing fails, the query may still proceed, but the failure must be logged clearly.
- If masking fails, return the unmasked result only if masking is disabled by failure policy. For this release, prefer fail-open with an audit note rather than breaking every query.
- If flashback capture fails, continue execution but record flashback-unavailable in audit metadata.
- If classifier confidence is insufficient, the system must treat the statement as `UNKNOWN`.
- If governance decision evaluation fails, default to `confirm` for raw SQL and log the failure.

## Testing Strategy

Follow test-first implementation.

Minimum test groups:

### Classification Tests

- `SELECT` classified as `DQL`
- `INSERT`, `UPDATE`, `DELETE` classified as `DML`
- `CREATE`, `ALTER`, `DROP`, `TRUNCATE` classified as `DDL`
- `BEGIN`, `COMMIT`, `ROLLBACK` classified as `TCL`
- Empty or unsupported SQL classified as `UNKNOWN`
- Leading comments do not change classification
- `WITH cte AS (...) SELECT ...` classified as `DQL`
- `WITH cte AS (...) UPDATE ...` classified as `DML`
- Mixed multi-statement input classified as `UNKNOWN`

### Risk Tests

- `DELETE FROM users` is high risk
- `UPDATE users SET name = 'x'` without `WHERE` is high risk
- `DROP TABLE users` is high risk
- Multi-statement raw SQL is high risk
- `UNKNOWN` raw SQL defaults to high risk

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
- Multi-statement raw SQL never produces flashback recovery SQL
- CTE-based writes do not produce flashback recovery SQL in v1

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
- `UNKNOWN` and multi-statement raw SQL use conservative defaults.
- Raw SQL flashback is limited to tightly-bounded single-statement cases only.

## Approval State

This document reflects the approved interactive design decisions from March 30, 2026 and is intended to be the implementation baseline for the next planning step.
