import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

// 类型定义
export interface ConnectionConfig {
  id: string
  type: string
  name: string
  host: string
  port: number
  username: string
  password: string
  database?: string
  sshEnabled?: boolean
  sshHost?: string
  sshPort?: number
  sshUser?: string
  sshPassword?: string
  sshKey?: string
}

export interface CommandResult {
  success: boolean
  message: string
}

export interface QueryResult {
  columns: string[]
  rows: any[][]
  error?: string
  affectedRows?: number
}

export interface TableInfo {
  name: string
  rows: number
  isView: boolean
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  key?: string
  comment?: string
}

export interface TableDataResult {
  columns: ColumnInfo[]
  rows: any[][]
  total: number
  page: number
  pageSize: number
}

// API 实现
const api = {
  // 窗口控制
  minimize: () => invoke('window_minimize'),
  maximize: () => invoke('window_maximize'),
  close: () => invoke('window_close'),

  // 数据库操作
  testConnection: async (config: any): Promise<{ success: boolean; message: string }> => {
    try {
      return await invoke<CommandResult>('db_test', { config })
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },
  
  connect: async (config: any): Promise<{ success: boolean; message: string }> => {
    try {
      return await invoke<CommandResult>('db_connect', { config })
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },
  
  disconnect: async (id: string): Promise<void> => {
    try {
      await invoke('db_disconnect', { id })
    } catch (e) {
      console.error('Disconnect error:', e)
    }
  },
  
  query: async (id: string, sql: string): Promise<{ columns: string[]; rows: any[]; error?: string }> => {
    try {
      const result = await invoke<QueryResult>('db_query', { id, sql })
      return {
        columns: result.columns,
        rows: result.rows,
        error: result.error,
      }
    } catch (e: any) {
      return { columns: [], rows: [], error: e.toString() }
    }
  },
  
  getDatabases: async (id: string): Promise<string[]> => {
    try {
      return await invoke<string[]>('db_get_databases', { id })
    } catch (e) {
      console.error('getDatabases error:', e)
      return []
    }
  },
  
  getTables: async (id: string, database: string): Promise<TableInfo[]> => {
    try {
      return await invoke<TableInfo[]>('db_get_tables', { id, database })
    } catch (e) {
      console.error('getTables error:', e)
      return []
    }
  },
  
  getColumns: async (id: string, database: string, table: string): Promise<ColumnInfo[]> => {
    try {
      return await invoke<ColumnInfo[]>('db_get_columns', { id, database, table })
    } catch (e) {
      console.error('getColumns error:', e)
      return []
    }
  },
  
  getTableData: async (id: string, database: string, table: string, page?: number, pageSize?: number): Promise<{ data: any[]; total: number; columns?: ColumnInfo[] }> => {
    try {
      const result = await invoke<TableDataResult>('db_get_table_data', { 
        id, database, table, page: page || 1, pageSize: pageSize || 100 
      })
      return {
        data: result.rows,
        total: result.total,
        columns: result.columns,
      }
    } catch (e) {
      console.error('getTableData error:', e)
      return { data: [], total: 0 }
    }
  },

  updateRow: async (id: string, database: string, tableName: string, primaryKey: { column: string; value: any }, updates: Record<string, any>): Promise<{ success?: boolean; error?: string }> => {
    try {
      const result = await invoke<CommandResult>('db_update_row', { 
        id, database, table: tableName, primaryKey, updates 
      })
      return { success: result.success, error: result.success ? undefined : result.message }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },

  deleteRow: async (id: string, database: string, tableName: string, primaryKey: { column: string; value: any }): Promise<{ success?: boolean; error?: string }> => {
    try {
      const result = await invoke<CommandResult>('db_delete_row', { 
        id, database, table: tableName, primaryKey 
      })
      return { success: result.success, error: result.success ? undefined : result.message }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },

  // 配置存储
  saveConnections: async (connections: any[]): Promise<void> => {
    try {
      await invoke('config_save', { connections })
    } catch (e) {
      console.error('saveConnections error:', e)
    }
  },
  
  loadConnections: async (): Promise<any[]> => {
    try {
      return await invoke<any[]>('config_load')
    } catch (e) {
      console.error('loadConnections error:', e)
      return []
    }
  },
  
  exportConnections: async (connections: any[], format: 'json' | 'ncx'): Promise<{ success?: boolean; path?: string; error?: string; cancelled?: boolean; count?: number }> => {
    try {
      const path = await save({
        filters: [{ 
          name: format === 'json' ? 'JSON' : 'Navicat NCX', 
          extensions: [format === 'json' ? 'json' : 'ncx'] 
        }]
      })
      if (!path) return { cancelled: true }
      
      const content = format === 'json' 
        ? JSON.stringify(connections, null, 2)
        : generateNcx(connections)
      
      await writeTextFile(path, content)
      return { success: true, path, count: connections.length }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },
  
  importConnections: async (): Promise<{ success?: boolean; connections?: any[]; error?: string; cancelled?: boolean; count?: number; source?: string }> => {
    try {
      const path = await open({
        filters: [{ name: '配置文件', extensions: ['json', 'ncx'] }]
      })
      if (!path) return { cancelled: true }
      
      const content = await readTextFile(path as string)
      const isNcx = (path as string).toLowerCase().endsWith('.ncx')
      
      let connections: any[]
      if (isNcx) {
        connections = parseNcx(content)
      } else {
        connections = JSON.parse(content)
      }
      
      return { success: true, connections, count: connections.length, source: isNcx ? 'Navicat' : 'JSON' }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },

  // 文件操作 - 使用 Tauri 原生命令
  openFile: async (): Promise<{ path: string; content: string; name: string; error?: string } | null> => {
    try {
      const result = await invoke<{ path: string; content: string; name: string } | null>('file_open')
      return result
    } catch (e: any) {
      // 回退到前端实现
      try {
        const path = await open({
          filters: [{ name: 'SQL 文件', extensions: ['sql'] }]
        })
        if (!path) return null
        
        const content = await readTextFile(path as string)
        const name = (path as string).split(/[/\\]/).pop() || 'untitled.sql'
        return { path: path as string, content, name }
      } catch (err: any) {
        return { path: '', content: '', name: '', error: err.toString() }
      }
    }
  },
  
  saveFile: async (filePath: string | null, content: string): Promise<{ path: string; name: string; error?: string } | null> => {
    try {
      const result = await invoke<{ success: boolean; path: string; name: string; error?: string }>('file_save', { 
        filePath, 
        content 
      })
      if (!result.success) {
        return result.error ? { path: '', name: '', error: result.error } : null
      }
      return { path: result.path, name: result.name }
    } catch (e: any) {
      // 回退到前端实现
      try {
        let path = filePath
        if (!path) {
          const selected = await save({
            filters: [{ name: 'SQL 文件', extensions: ['sql'] }]
          })
          if (!selected) return null
          path = selected
        }
        
        await writeTextFile(path, content)
        const name = path.split(/[/\\]/).pop() || 'untitled.sql'
        return { path, name }
      } catch (err: any) {
        return { path: '', name: '', error: err.toString() }
      }
    }
  },
  
  selectFile: async (extensions?: string[]): Promise<{ path: string } | null> => {
    try {
      const path = await invoke<string | null>('file_select', { extensions })
      if (!path) return null
      return { path }
    } catch (e) {
      // 回退到前端实现
      try {
        const path = await open({
          filters: extensions ? [{ name: '数据库文件', extensions }] : undefined
        })
        if (!path) return null
        return { path: path as string }
      } catch (err) {
        return null
      }
    }
  },

  // 数据库备份与导出
  backupDatabase: async (id: string, database: string): Promise<{ success?: boolean; path?: string; error?: string; cancelled?: boolean }> => {
    try {
      const path = await save({
        filters: [{ name: 'SQL 文件', extensions: ['sql'] }],
        defaultPath: `${database}_backup.sql`
      })
      if (!path) return { cancelled: true }
      
      // 获取所有表并导出
      const tables = await api.getTables(id, database)
      let sqlContent = `-- Database: ${database}\n-- Backup Time: ${new Date().toISOString()}\n\n`
      
      for (const table of tables) {
        if (table.isView) continue
        
        // 获取表结构
        const columns = await api.getColumns(id, database, table.name)
        
        // 获取表数据
        const result = await api.query(id, `SELECT * FROM \`${table.name}\``)
        if (result.rows && result.rows.length > 0) {
          for (const row of result.rows) {
            const values = row.map((v: any) => 
              v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
            ).join(', ')
            sqlContent += `INSERT INTO \`${table.name}\` VALUES (${values});\n`
          }
          sqlContent += '\n'
        }
      }
      
      await writeTextFile(path, sqlContent)
      return { success: true, path }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },
  
  exportTable: async (id: string, database: string, tableName: string, format: 'excel' | 'sql' | 'csv'): Promise<{ success?: boolean; path?: string; error?: string; cancelled?: boolean }> => {
    try {
      const ext = format === 'excel' ? 'xlsx' : format
      const path = await save({
        filters: [{ name: format.toUpperCase(), extensions: [ext] }],
        defaultPath: `${tableName}.${ext}`
      })
      if (!path) return { cancelled: true }
      
      const result = await api.query(id, `SELECT * FROM \`${tableName}\``)
      
      let content: string
      if (format === 'csv') {
        const header = result.columns.join(',')
        const rows = result.rows.map(row => row.map(v => 
          v === null ? '' : typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v
        ).join(',')).join('\n')
        content = `${header}\n${rows}`
      } else if (format === 'sql') {
        content = result.rows.map(row => {
          const values = row.map((v: any) => 
            v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
          ).join(', ')
          return `INSERT INTO \`${tableName}\` VALUES (${values});`
        }).join('\n')
      } else {
        // Excel 需要特殊处理，暂时用 CSV
        const header = result.columns.join(',')
        const rows = result.rows.map(row => row.map(v => 
          v === null ? '' : typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v
        ).join(',')).join('\n')
        content = `${header}\n${rows}`
      }
      
      await writeTextFile(path, content)
      return { success: true, path }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },
}

// 简单的 NCX 解析和生成
function parseNcx(content: string): any[] {
  // 简化的 NCX 解析
  const connections: any[] = []
  const regex = /<Connection[^>]*\/>/g
  let match
  
  while ((match = regex.exec(content)) !== null) {
    const attrs: Record<string, string> = {}
    const attrRegex = /(\w+)="([^"]*)"/g
    let attrMatch
    
    while ((attrMatch = attrRegex.exec(match[0])) !== null) {
      attrs[attrMatch[1]] = attrMatch[2]
    }
    
    if (attrs.ConnectionName) {
      connections.push({
        id: crypto.randomUUID(),
        name: attrs.ConnectionName,
        type: (attrs.ConnType || 'mysql').toLowerCase(),
        host: attrs.Host || 'localhost',
        port: parseInt(attrs.Port) || 3306,
        username: attrs.UserName || '',
        password: attrs.Password || '',
        database: attrs.Database || '',
      })
    }
  }
  
  return connections
}

function generateNcx(connections: any[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Connections>\n'
  
  for (const conn of connections) {
    xml += `  <Connection ConnectionName="${conn.name}" ConnType="${conn.type}" `
    xml += `Host="${conn.host}" Port="${conn.port}" `
    xml += `UserName="${conn.username}" Password="${conn.password}" `
    xml += `Database="${conn.database || ''}" />\n`
  }
  
  xml += '</Connections>'
  return xml
}

// 导出
export default api
