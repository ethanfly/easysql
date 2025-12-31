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
  connectionId: string  // 所属连接ID
  columns: ColumnInfo[]
  data: any[]
  total: number
  page: number
  pageSize: number
  // 编辑相关状态
  pendingChanges?: Map<string, Record<string, any>> // rowIndex -> { colName: newValue }
  deletedRows?: Set<number> // 待删除的行索引
  originalData?: any[] // 原始数据用于回滚
  newRows?: any[] // 新增的行数据（尚未保存到数据库）
}

export const DB_INFO: Record<DatabaseType, { 
  name: string
  icon: string
  color: string
  defaultPort: number
  supported: boolean
  needsHost: boolean
  needsAuth: boolean
  needsFile: boolean
}> = {
  mysql: { name: 'MySQL', icon: '🐬', color: '#00758f', defaultPort: 3306, supported: true, needsHost: true, needsAuth: true, needsFile: false },
  postgres: { name: 'PostgreSQL', icon: '🐘', color: '#336791', defaultPort: 5432, supported: true, needsHost: true, needsAuth: true, needsFile: false },
  sqlite: { name: 'SQLite', icon: '💾', color: '#003b57', defaultPort: 0, supported: true, needsHost: false, needsAuth: false, needsFile: true },
  mongodb: { name: 'MongoDB', icon: '🍃', color: '#47a248', defaultPort: 27017, supported: true, needsHost: true, needsAuth: true, needsFile: false },
  redis: { name: 'Redis', icon: '⚡', color: '#dc382d', defaultPort: 6379, supported: true, needsHost: true, needsAuth: true, needsFile: false },
  sqlserver: { name: 'SQL Server', icon: '📊', color: '#cc2927', defaultPort: 1433, supported: true, needsHost: true, needsAuth: true, needsFile: false },
  oracle: { name: 'Oracle', icon: '🔶', color: '#f80000', defaultPort: 1521, supported: false, needsHost: true, needsAuth: true, needsFile: false },
  mariadb: { name: 'MariaDB', icon: '🦭', color: '#c0765a', defaultPort: 3306, supported: true, needsHost: true, needsAuth: true, needsFile: false },
  snowflake: { name: 'Snowflake', icon: '❄️', color: '#29b5e8', defaultPort: 443, supported: false, needsHost: true, needsAuth: true, needsFile: false },
}

