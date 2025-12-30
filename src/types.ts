export type DatabaseType = 'mysql' | 'postgres' | 'sqlite' | 'mongodb' | 'redis' | 'sqlserver' | 'oracle' | 'mariadb' | 'snowflake'

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
  results: {
    columns: string[]
    rows: any[]
  } | null
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
  columns: ColumnInfo[]
  data: any[]
  total: number
  page: number
  pageSize: number
  // 编辑相关状态
  pendingChanges?: Map<string, Record<string, any>> // rowIndex -> { colName: newValue }
  deletedRows?: Set<number> // 待删除的行索引
  originalData?: any[] // 原始数据用于回滚
}

export const DB_INFO: Record<DatabaseType, { name: string; icon: string; color: string; port: number; supported: boolean }> = {
  mysql: { name: 'MySQL', icon: '🐬', color: '#00758f', port: 3306, supported: true },
  postgres: { name: 'PostgreSQL', icon: '🐘', color: '#336791', port: 5432, supported: true },
  sqlite: { name: 'SQLite', icon: '💾', color: '#003b57', port: 0, supported: true },
  mongodb: { name: 'MongoDB', icon: '🍃', color: '#47a248', port: 27017, supported: true },
  redis: { name: 'Redis', icon: '⚡', color: '#dc382d', port: 6379, supported: true },
  sqlserver: { name: 'SQL Server', icon: '📊', color: '#cc2927', port: 1433, supported: true },
  oracle: { name: 'Oracle', icon: '🔶', color: '#f80000', port: 1521, supported: false },
  mariadb: { name: 'MariaDB', icon: '🦭', color: '#c0765a', port: 3306, supported: true },
  snowflake: { name: 'Snowflake', icon: '❄️', color: '#29b5e8', port: 443, supported: false },
}

