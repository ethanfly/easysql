export type DatabaseType =
  | 'mysql'
  | 'postgres'
  | 'sqlite'
  | 'mongodb'
  | 'redis'
  | 'sqlserver'
  | 'oracle'
  | 'mariadb'
  | 'snowflake'

export interface Connection {
  id: string
  name: string
  type: DatabaseType
  host: string
  port: number
  username: string
  password: string
  database: string
  sshEnabled: boolean
  sshHost: string
  sshPort: number
  sshUser: string
  sshPassword: string
  sshKey: string
}

export interface QueryTab {
  id: string
  title: string
  sql: string
  connectionId?: string
  results:
    | {
        columns: string[]
        rows: any[]
      }
    | null
}

export interface TableInfo {
  name: string
  rows: number
  columns?: ColumnInfo[]
  isView?: boolean
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  key?: string
  comment?: string
}

export interface TableTab {
  id: string
  type: 'table'
  tableName: string
  database: string
  connectionId: string
  columns: ColumnInfo[]
  data: any[]
  total: number
  page: number
  pageSize: number
  pendingChanges?: Map<string, Record<string, any>>
  deletedRows?: Set<number>
  originalData?: any[]
  newRows?: any[]
}

export const DB_INFO: Record<
  DatabaseType,
  {
    name: string
    icon: string
    color: string
    defaultPort: number
    supported: boolean
    needsHost: boolean
    needsAuth: boolean
    needsFile: boolean
  }
> = {
  mysql: { name: 'MySQL', icon: 'mysql', color: '#00758f', defaultPort: 3306, supported: true, needsHost: true, needsAuth: true, needsFile: false },
  postgres: { name: 'PostgreSQL', icon: 'postgres', color: '#336791', defaultPort: 5432, supported: true, needsHost: true, needsAuth: true, needsFile: false },
  sqlite: { name: 'SQLite', icon: 'sqlite', color: '#003b57', defaultPort: 0, supported: true, needsHost: false, needsAuth: false, needsFile: true },
  mongodb: { name: 'MongoDB', icon: 'mongodb', color: '#47a248', defaultPort: 27017, supported: true, needsHost: true, needsAuth: true, needsFile: false },
  redis: { name: 'Redis', icon: 'redis', color: '#dc382d', defaultPort: 6379, supported: true, needsHost: true, needsAuth: true, needsFile: false },
  sqlserver: { name: 'SQL Server', icon: 'sqlserver', color: '#cc2927', defaultPort: 1433, supported: true, needsHost: true, needsAuth: true, needsFile: false },
  oracle: { name: 'Oracle', icon: 'oracle', color: '#f80000', defaultPort: 1521, supported: false, needsHost: true, needsAuth: true, needsFile: false },
  mariadb: { name: 'MariaDB', icon: 'mariadb', color: '#c0765a', defaultPort: 3306, supported: true, needsHost: true, needsAuth: true, needsFile: false },
  snowflake: { name: 'Snowflake', icon: 'snowflake', color: '#29b5e8', defaultPort: 443, supported: false, needsHost: true, needsAuth: true, needsFile: false },
}

export type GovernanceClassification = 'DQL' | 'DML' | 'DDL' | 'TCL' | 'UNKNOWN'
export type GovernanceDecision = 'allow' | 'confirm' | 'block'
export type GovernanceRiskLevel = 'low' | 'medium' | 'high'
export type GovernanceMaskMatchMode = 'exact' | 'keyword'
export type GovernanceMaskType = 'phone' | 'email' | 'id-card' | 'bank-card' | 'name' | 'custom-partial'
export type GovernanceOperationSource = 'sql-editor' | 'table-browser' | 'table-editor' | 'schema-browser'

export interface GovernanceMaskRule {
  id: string
  enabled: boolean
  matchMode: GovernanceMaskMatchMode
  pattern: string
  maskType: GovernanceMaskType
  prefix?: number
  suffix?: number
  maskChar?: string
}

export interface GovernanceConfig {
  enabled: boolean
  maskingEnabled: boolean
  auditEnabled: boolean
  defaultUnknownDecision: GovernanceDecision
  highRiskMode: GovernanceDecision
  decisionPolicy: Record<GovernanceClassification, GovernanceDecision>
  maskRules: GovernanceMaskRule[]
}

export interface GovernanceLogFilters {
  connectionId?: string
  source?: GovernanceOperationSource
  classification?: GovernanceClassification
  decision?: GovernanceDecision
  riskLevel?: GovernanceRiskLevel
  limit?: number
}

export interface GovernanceFlashbackTarget {
  databaseName?: string | null
  tableName?: string | null
  primaryKey?: string | null
}

export interface GovernanceFlashbackRecord {
  flashbackId: string | null
  auditId?: string
  eligible: boolean
  available: boolean
  operationKind?: string
  target?: GovernanceFlashbackTarget | null
  recoverySql?: string | null
  beforeImageQuery?: string | null
  reasonCodes: string[]
}

export interface GovernanceAuditResult {
  success: boolean
  affectedRows: number | null
  errorCode: string | null
  errorMessage: string | null
  durationMs: number | null
}

export interface GovernanceApprovalRequest {
  requestId?: string
  token?: string
  connectionId?: string
  source?: GovernanceOperationSource | string
  operationHash?: string
}

export interface GovernanceApprovalResponse {
  success: boolean
  approved?: boolean
  message?: string
  requestId?: string
  token?: string
  connectionId?: string
  source?: string
  operationHash?: string
}

export interface GovernanceExecutionInfo {
  classification: GovernanceClassification
  statementType: string
  isMultiStatement: boolean
  classifierNotes: string[]
  riskLevel: GovernanceRiskLevel
  highRiskReasons: string[]
  decision: GovernanceDecision
  decisionNotes: string[]
  approvalRequest?: GovernanceApprovalRequest | null
  maskingApplied?: boolean
}

export interface GovernanceAuditRecord {
  id: string
  timestamp: string
  connectionId: string
  connectionName: string
  databaseType: string
  databaseName?: string | null
  source: GovernanceOperationSource | string
  operationKind: string
  classification: GovernanceClassification
  statementType: string
  riskLevel: GovernanceRiskLevel
  decision: GovernanceDecision
  approvedByUser: boolean
  sqlText?: string | null
  statementCount: number
  isMultiStatement: boolean
  target?: GovernanceFlashbackTarget | null
  maskingApplied?: boolean
  flashback?: GovernanceFlashbackRecord | null
  result: GovernanceAuditResult
  metadata?: Record<string, any>
}

export interface TableDataResult {
  columns: ColumnInfo[]
  rows: any[][]
  total: number
  page: number
  pageSize: number
  governance?: GovernanceExecutionInfo
}

declare global {
  interface Window {
    electronAPI: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      loadConnections: () => Promise<any[]>
      saveConnections: (connections: any[]) => Promise<{ success: boolean; message?: string }>
      loadGovernanceConfig: () => Promise<GovernanceConfig | null>
      saveGovernanceConfig: (config: GovernanceConfig) => Promise<{ success: boolean; message?: string }>
      listAuditLogs: (filters?: GovernanceLogFilters) => Promise<GovernanceAuditRecord[]>
      listFlashbackLogs: (filters?: GovernanceLogFilters) => Promise<GovernanceFlashbackRecord[]>
      getFlashbackRecord: (id: string) => Promise<GovernanceFlashbackRecord | null>
      approveGovernanceDecision: (approval: GovernanceApprovalRequest) => Promise<GovernanceApprovalResponse>
      testConnection: (config: any) => Promise<{ success: boolean; message: string }>
      connect: (config: any) => Promise<{ success: boolean; message: string }>
      disconnect: (id: string) => Promise<void>
      query: (id: string, sql: string, governanceOptions?: GovernanceApprovalRequest) => Promise<any>
      getDatabases: (id: string) => Promise<string[]>
      getTables: (id: string, database: string) => Promise<TableInfo[]>
      getColumns: (id: string, database: string, table: string) => Promise<ColumnInfo[]>
      getTableData: (id: string, database: string, table: string, page: number, pageSize: number) => Promise<TableDataResult>
      updateRow: (id: string, database: string, table: string, primaryKey: { column: string; value: any }, updates: Record<string, any>) => Promise<{ success: boolean; message: string }>
      deleteRow: (id: string, database: string, table: string, primaryKey: { column: string; value: any }) => Promise<{ success: boolean; message: string }>
      insertRow: (id: string, database: string, table: string, columns: string[], values: any[]) => Promise<{ success: boolean; message: string; insertId?: number }>
      createDatabase: (id: string, dbName: string, charset?: string, collation?: string) => Promise<{ success: boolean; message: string }>
      dropDatabase: (id: string, dbName: string) => Promise<{ success: boolean; message: string }>
      createTable: (id: string, database: string, tableName: string, columns: any[]) => Promise<{ success: boolean; message: string }>
      dropTable: (id: string, database: string, tableName: string) => Promise<{ success: boolean; message: string }>
      truncateTable: (id: string, database: string, tableName: string) => Promise<{ success: boolean; message: string }>
      renameTable: (id: string, database: string, oldName: string, newName: string) => Promise<{ success: boolean; message: string }>
      duplicateTable: (id: string, database: string, sourceTable: string, newTable: string, withData?: boolean) => Promise<{ success: boolean; message: string }>
      addColumn: (id: string, database: string, tableName: string, column: any) => Promise<{ success: boolean; message: string }>
      modifyColumn: (id: string, database: string, tableName: string, oldName: string, column: any) => Promise<{ success: boolean; message: string }>
      dropColumn: (id: string, database: string, tableName: string, columnName: string) => Promise<{ success: boolean; message: string }>
      getTableInfo: (id: string, database: string, tableName: string) => Promise<TableDesignerInfo>
      getIndexes: (id: string, database: string, tableName: string) => Promise<IndexInfo[]>
      getForeignKeys: (id: string, database: string, tableName: string) => Promise<ForeignKeyInfo[]>
      getColumnNames: (id: string, database: string, tableName: string) => Promise<string[]>
      executeMultiSQL: (id: string, sqls: string) => Promise<{ success: boolean; message: string }>
      openFile: () => Promise<{ path: string; content: string; name: string } | null>
      saveFile: (filePath: string | null, content: string) => Promise<{ path: string; name: string } | null>
      selectFile: (extensions?: string[]) => Promise<string | null>
      saveDialog: (options: any) => Promise<string | null>
      writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
      decryptNavicatPassword: (encryptedPassword: string, version?: number) => Promise<string>
    }
  }
}

export interface ColumnDetailInfo {
  id: string
  name: string
  type: string
  length: string
  decimals: string
  nullable: boolean
  primaryKey: boolean
  autoIncrement: boolean
  unsigned: boolean
  zerofill: boolean
  defaultValue: string
  comment: string
  isVirtual: boolean
  virtualExpression: string
}

export interface IndexInfo {
  id: string
  name: string
  columns: string[]
  type: 'NORMAL' | 'UNIQUE' | 'FULLTEXT' | 'SPATIAL'
  method: 'BTREE' | 'HASH'
  comment: string
}

export interface ForeignKeyInfo {
  id: string
  name: string
  columns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
  onDelete: string
  onUpdate: string
}

export interface TableOptions {
  engine: string
  charset: string
  collation: string
  comment: string
  autoIncrement: string
  rowFormat: string
}

export interface TableDesignerInfo {
  columns: ColumnDetailInfo[]
  indexes: IndexInfo[]
  foreignKeys: ForeignKeyInfo[]
  options: TableOptions
}
