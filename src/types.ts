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
}

export const DB_INFO: Record<DatabaseType, { name: string; icon: string; color: string; port: number }> = {
  mysql: { name: 'MySQL', icon: '🐬', color: '#00758f', port: 3306 },
  postgres: { name: 'PostgreSQL', icon: '🐘', color: '#336791', port: 5432 },
  sqlite: { name: 'SQLite', icon: '💾', color: '#003b57', port: 0 },
  mongodb: { name: 'MongoDB', icon: '🍃', color: '#47a248', port: 27017 },
  redis: { name: 'Redis', icon: '⚡', color: '#dc382d', port: 6379 },
  sqlserver: { name: 'SQL Server', icon: '📊', color: '#cc2927', port: 1433 },
  oracle: { name: 'Oracle', icon: '🔶', color: '#f80000', port: 1521 },
  mariadb: { name: 'MariaDB', icon: '🦭', color: '#c0765a', port: 3306 },
  snowflake: { name: 'Snowflake', icon: '❄️', color: '#29b5e8', port: 443 },
}

