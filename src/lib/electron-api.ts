// Electron API 类型声明
declare global {
  interface Window {
    electronAPI: {
      // 窗口控制
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      
      // 配置存储
      loadConnections: () => Promise<any[]>
      saveConnections: (connections: any[]) => Promise<{ success: boolean; message?: string }>
      
      // 数据库操作
      testConnection: (config: any) => Promise<{ success: boolean; message: string }>
      connect: (config: any) => Promise<{ success: boolean; message: string }>
      disconnect: (id: string) => Promise<void>
      query: (id: string, sql: string) => Promise<{ columns: string[]; rows: any[][]; error?: string; affectedRows?: number }>
      getDatabases: (id: string) => Promise<string[]>
      getTables: (id: string, database: string) => Promise<TableInfo[]>
      getColumns: (id: string, database: string, table: string) => Promise<ColumnInfo[]>
      getTableData: (id: string, database: string, table: string, page: number, pageSize: number) => Promise<TableDataResult>
      updateRow: (id: string, database: string, table: string, primaryKey: { column: string; value: any }, updates: Record<string, any>) => Promise<{ success: boolean; message: string }>
      deleteRow: (id: string, database: string, table: string, primaryKey: { column: string; value: any }) => Promise<{ success: boolean; message: string }>
      insertRow: (id: string, database: string, table: string, columns: string[], values: any[]) => Promise<{ success: boolean; message: string; insertId?: number }>
      
      // 数据库管理
      createDatabase: (id: string, dbName: string, charset?: string, collation?: string) => Promise<{ success: boolean; message: string }>
      dropDatabase: (id: string, dbName: string) => Promise<{ success: boolean; message: string }>
      
      // 表管理
      createTable: (id: string, database: string, tableName: string, columns: any[]) => Promise<{ success: boolean; message: string }>
      dropTable: (id: string, database: string, tableName: string) => Promise<{ success: boolean; message: string }>
      truncateTable: (id: string, database: string, tableName: string) => Promise<{ success: boolean; message: string }>
      renameTable: (id: string, database: string, oldName: string, newName: string) => Promise<{ success: boolean; message: string }>
      duplicateTable: (id: string, database: string, sourceTable: string, newTable: string, withData?: boolean) => Promise<{ success: boolean; message: string }>
      
      // 列管理
      addColumn: (id: string, database: string, tableName: string, column: any) => Promise<{ success: boolean; message: string }>
      modifyColumn: (id: string, database: string, tableName: string, oldName: string, column: any) => Promise<{ success: boolean; message: string }>
      dropColumn: (id: string, database: string, tableName: string, columnName: string) => Promise<{ success: boolean; message: string }>
      
      // 表设计器相关
      getTableInfo: (id: string, database: string, tableName: string) => Promise<TableDesignerInfo>
      getIndexes: (id: string, database: string, tableName: string) => Promise<IndexInfo[]>
      getForeignKeys: (id: string, database: string, tableName: string) => Promise<ForeignKeyInfo[]>
      getColumnNames: (id: string, database: string, tableName: string) => Promise<string[]>
      executeMultiSQL: (id: string, sqls: string) => Promise<{ success: boolean; message: string }>
      
      // 文件操作
      openFile: () => Promise<{ path: string; content: string; name: string } | null>
      saveFile: (filePath: string | null, content: string) => Promise<{ path: string; name: string } | null>
      selectFile: (extensions?: string[]) => Promise<string | null>
      saveDialog: (options: any) => Promise<string | null>
      writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
      
      // 密码解密
      decryptNavicatPassword: (encryptedPassword: string, version?: number) => Promise<string>
    }
  }
}

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

// 表设计器相关类型
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

// 获取 Electron API
const getElectronAPI = () => {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI
  }
  return null
}

// API 实现
const api = {
  // 窗口控制
  minimize: async () => {
    const electronAPI = getElectronAPI()
    if (electronAPI) {
      await electronAPI.minimize()
    }
  },
  
  maximize: async () => {
    const electronAPI = getElectronAPI()
    if (electronAPI) {
      await electronAPI.maximize()
    }
  },
  
  close: async () => {
    const electronAPI = getElectronAPI()
    if (electronAPI) {
      await electronAPI.close()
    }
  },

  // 数据库操作
  testConnection: async (config: any): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) {
      return { success: false, message: 'Electron API 不可用' }
    }
    try {
      return await electronAPI.testConnection(config)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },
  
  connect: async (config: any): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) {
      return { success: false, message: 'Electron API 不可用' }
    }
    try {
      return await electronAPI.connect(config)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },
  
  disconnect: async (id: string): Promise<void> => {
    const electronAPI = getElectronAPI()
    if (electronAPI) {
      try {
        await electronAPI.disconnect(id)
      } catch (e) {
        console.error('Disconnect error:', e)
      }
    }
  },
  
  query: async (id: string, sql: string): Promise<{ columns: string[]; rows: any[]; error?: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) {
      return { columns: [], rows: [], error: 'Electron API 不可用' }
    }
    try {
      const result = await electronAPI.query(id, sql)
      return {
        columns: result.columns,
        rows: result.rows,
        error: result.error,
      }
    } catch (e: any) {
      return { columns: [], rows: [], error: e.toString() }
    }
  },

  // 执行查询（query 的别名，用于兼容）
  executeQuery: async (id: string, sql: string): Promise<{ columns: string[]; rows: any[]; error?: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) {
      return { columns: [], rows: [], error: 'Electron API 不可用' }
    }
    try {
      const result = await electronAPI.query(id, sql)
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
    const electronAPI = getElectronAPI()
    if (!electronAPI) return []
    try {
      return await electronAPI.getDatabases(id)
    } catch (e) {
      console.error('getDatabases error:', e)
      return []
    }
  },
  
  getTables: async (id: string, database: string): Promise<TableInfo[]> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return []
    try {
      return await electronAPI.getTables(id, database)
    } catch (e) {
      console.error('getTables error:', e)
      return []
    }
  },
  
  getColumns: async (id: string, database: string, table: string): Promise<ColumnInfo[]> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return []
    try {
      return await electronAPI.getColumns(id, database, table)
    } catch (e) {
      console.error('getColumns error:', e)
      return []
    }
  },
  
  // 别名，兼容旧代码
  getTableColumns: async (id: string, database: string, table: string): Promise<ColumnInfo[]> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return []
    try {
      return await electronAPI.getColumns(id, database, table)
    } catch (e) {
      console.error('getTableColumns error:', e)
      return []
    }
  },
  
  getTableData: async (id: string, database: string, table: string, page?: number, pageSize?: number): Promise<{ data: any[]; total: number; columns?: ColumnInfo[] }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { data: [], total: 0 }
    try {
      const result = await electronAPI.getTableData(
        id, database, table, page || 1, pageSize || 100
      )
      
      // 将数组数组转换为对象数组 [[v1,v2]] -> [{ col1: v1, col2: v2 }]
      const columns = result.columns || []
      const data = (result.rows || []).map(row => {
        const obj: Record<string, any> = {}
        columns.forEach((col, i) => {
          obj[col.name] = row[i]
        })
        return obj
      })
      
      return {
        data,
        total: result.total,
        columns: result.columns,
      }
    } catch (e) {
      console.error('getTableData error:', e)
      return { data: [], total: 0 }
    }
  },

  updateRow: async (id: string, database: string, tableName: string, primaryKey: { column: string; value: any }, updates: Record<string, any>): Promise<{ success?: boolean; error?: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, error: 'Electron API 不可用' }
    try {
      const result = await electronAPI.updateRow(id, database, tableName, primaryKey, updates)
      return { success: result.success, error: result.success ? undefined : result.message }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },

  deleteRow: async (id: string, database: string, tableName: string, primaryKey: { column: string; value: any }): Promise<{ success?: boolean; error?: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, error: 'Electron API 不可用' }
    try {
      const result = await electronAPI.deleteRow(id, database, tableName, primaryKey)
      return { success: result.success, error: result.success ? undefined : result.message }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },

  insertRow: async (id: string, database: string, tableName: string, columns: string[], values: any[]): Promise<{ success?: boolean; error?: string; insertId?: number }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, error: 'Electron API 不可用' }
    try {
      const result = await electronAPI.insertRow(id, database, tableName, columns, values)
      return { success: result.success, error: result.success ? undefined : result.message, insertId: result.insertId }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },

  // 更新行（简化参数格式，兼容旧代码）
  updateTableRow: async (id: string, database: string, tableName: string, primaryKeyColumn: string, primaryKeyValue: any, updates: Record<string, any>): Promise<{ success?: boolean; error?: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, error: 'Electron API 不可用' }
    try {
      const result = await electronAPI.updateRow(id, database, tableName, { column: primaryKeyColumn, value: primaryKeyValue }, updates)
      return { success: result.success, error: result.success ? undefined : result.message }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },

  // 插入行（对象格式，兼容旧代码）
  insertTableRow: async (id: string, database: string, tableName: string, data: Record<string, any>): Promise<{ success?: boolean; error?: string; insertId?: number }> => {
    const columns = Object.keys(data)
    const values = Object.values(data)
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, error: 'Electron API 不可用' }
    try {
      const result = await electronAPI.insertRow(id, database, tableName, columns, values)
      return { success: result.success, error: result.success ? undefined : result.message, insertId: result.insertId }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },

  // 删除行（简化参数格式，兼容旧代码）
  deleteTableRow: async (id: string, database: string, tableName: string, primaryKeyColumn: string, primaryKeyValue: any): Promise<{ success?: boolean; error?: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, error: 'Electron API 不可用' }
    try {
      const result = await electronAPI.deleteRow(id, database, tableName, { column: primaryKeyColumn, value: primaryKeyValue })
      return { success: result.success, error: result.success ? undefined : result.message }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },

  // 数据库管理
  createDatabase: async (id: string, dbName: string, charset = 'utf8mb4', collation = 'utf8mb4_general_ci'): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, message: 'Electron API 不可用' }
    try {
      return await electronAPI.createDatabase(id, dbName, charset, collation)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },

  dropDatabase: async (id: string, dbName: string): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, message: 'Electron API 不可用' }
    try {
      return await electronAPI.dropDatabase(id, dbName)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },

  // 表管理
  createTable: async (id: string, database: string, tableName: string, columns: any[]): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, message: 'Electron API 不可用' }
    try {
      return await electronAPI.createTable(id, database, tableName, columns)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },

  dropTable: async (id: string, database: string, tableName: string): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, message: 'Electron API 不可用' }
    try {
      return await electronAPI.dropTable(id, database, tableName)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },

  truncateTable: async (id: string, database: string, tableName: string): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, message: 'Electron API 不可用' }
    try {
      return await electronAPI.truncateTable(id, database, tableName)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },

  renameTable: async (id: string, database: string, oldName: string, newName: string): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, message: 'Electron API 不可用' }
    try {
      return await electronAPI.renameTable(id, database, oldName, newName)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },

  duplicateTable: async (id: string, database: string, sourceTable: string, newTable: string, withData = false): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, message: 'Electron API 不可用' }
    try {
      return await electronAPI.duplicateTable(id, database, sourceTable, newTable, withData)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },

  // 列管理
  addColumn: async (id: string, database: string, tableName: string, column: any): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, message: 'Electron API 不可用' }
    try {
      return await electronAPI.addColumn(id, database, tableName, column)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },

  modifyColumn: async (id: string, database: string, tableName: string, oldName: string, column: any): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, message: 'Electron API 不可用' }
    try {
      return await electronAPI.modifyColumn(id, database, tableName, oldName, column)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },

  dropColumn: async (id: string, database: string, tableName: string, columnName: string): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, message: 'Electron API 不可用' }
    try {
      return await electronAPI.dropColumn(id, database, tableName, columnName)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },

  // 表设计器相关
  getTableInfo: async (id: string, database: string, tableName: string): Promise<TableDesignerInfo> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { columns: [], indexes: [], foreignKeys: [], options: {} as TableOptions }
    try {
      return await electronAPI.getTableInfo(id, database, tableName)
    } catch (e) {
      console.error('getTableInfo error:', e)
      return { columns: [], indexes: [], foreignKeys: [], options: {} as TableOptions }
    }
  },

  getIndexes: async (id: string, database: string, tableName: string): Promise<IndexInfo[]> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return []
    try {
      return await electronAPI.getIndexes(id, database, tableName)
    } catch (e) {
      console.error('getIndexes error:', e)
      return []
    }
  },

  getForeignKeys: async (id: string, database: string, tableName: string): Promise<ForeignKeyInfo[]> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return []
    try {
      return await electronAPI.getForeignKeys(id, database, tableName)
    } catch (e) {
      console.error('getForeignKeys error:', e)
      return []
    }
  },

  getColumnNames: async (id: string, database: string, tableName: string): Promise<string[]> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return []
    try {
      return await electronAPI.getColumnNames(id, database, tableName)
    } catch (e) {
      console.error('getColumnNames error:', e)
      return []
    }
  },

  executeMultiSQL: async (id: string, sqls: string): Promise<{ success: boolean; message: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, message: 'Electron API 不可用' }
    try {
      return await electronAPI.executeMultiSQL(id, sqls)
    } catch (e: any) {
      return { success: false, message: e.toString() }
    }
  },

  // 配置存储
  saveConnections: async (connections: any[]): Promise<void> => {
    const electronAPI = getElectronAPI()
    if (electronAPI) {
      try {
        await electronAPI.saveConnections(connections)
      } catch (e) {
        console.error('saveConnections error:', e)
      }
    }
  },
  
  loadConnections: async (): Promise<any[]> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return []
    try {
      return await electronAPI.loadConnections()
    } catch (e) {
      console.error('loadConnections error:', e)
      return []
    }
  },
  
  exportConnections: async (connections: any[], format: 'json' | 'ncx'): Promise<{ success?: boolean; path?: string; error?: string; cancelled?: boolean; count?: number }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, error: 'Electron API 不可用' }
    
    try {
      const path = await electronAPI.saveDialog({
        filters: [{ 
          name: format === 'json' ? 'JSON' : 'Navicat NCX', 
          extensions: [format === 'json' ? 'json' : 'ncx'] 
        }]
      })
      if (!path) return { cancelled: true }
      
      const content = format === 'json' 
        ? JSON.stringify(connections, null, 2)
        : generateNcx(connections)
      
      await electronAPI.writeFile(path, content)
      return { success: true, path, count: connections.length }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },
  
  importConnections: async (): Promise<{ success?: boolean; connections?: any[]; error?: string; cancelled?: boolean; count?: number; source?: string }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, error: 'Electron API 不可用' }
    
    try {
      const path = await electronAPI.selectFile(['json', 'ncx'])
      if (!path) return { cancelled: true }
      
      const result = await electronAPI.readFile(path)
      if (!result.success || !result.content) {
        return { success: false, error: result.error || '读取文件失败' }
      }
      
      const isNcx = path.toLowerCase().endsWith('.ncx')
      
      let connections: any[]
      if (isNcx) {
        // NCX 解析现在是异步的，因为需要解密密码
        connections = await parseNcxAsync(result.content, electronAPI)
      } else {
        connections = JSON.parse(result.content)
      }
      
      return { success: true, connections, count: connections.length, source: isNcx ? 'Navicat' : 'JSON' }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },

  // 文件操作
  openFile: async (): Promise<{ path: string; content: string; name: string; error?: string } | null> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return null
    try {
      return await electronAPI.openFile()
    } catch (e: any) {
      return { path: '', content: '', name: '', error: e.toString() }
    }
  },
  
  saveFile: async (filePath: string | null, content: string): Promise<{ path: string; name: string; error?: string } | null> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return null
    try {
      return await electronAPI.saveFile(filePath, content)
    } catch (e: any) {
      return { path: '', name: '', error: e.toString() }
    }
  },
  
  selectFile: async (extensions?: string[]): Promise<{ path: string } | null> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return null
    try {
      const path = await electronAPI.selectFile(extensions)
      if (!path) return null
      return { path }
    } catch (e) {
      return null
    }
  },

  // 数据库备份与导出
  backupDatabase: async (id: string, database: string): Promise<{ success?: boolean; path?: string; error?: string; cancelled?: boolean }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, error: 'Electron API 不可用' }
    
    try {
      const path = await electronAPI.saveDialog({
        filters: [{ name: 'SQL 文件', extensions: ['sql'] }],
        defaultPath: `${database}_backup.sql`
      })
      if (!path) return { cancelled: true }
      
      // 获取所有表并导出
      const tables = await api.getTables(id, database)
      let sqlContent = `-- Database: ${database}\n-- Backup Time: ${new Date().toISOString()}\n\n`
      
      for (const table of tables) {
        if (table.isView) continue
        
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
      
      await electronAPI.writeFile(path, sqlContent)
      return { success: true, path }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },
  
  exportTable: async (id: string, database: string, tableName: string, format: 'excel' | 'sql' | 'csv'): Promise<{ success?: boolean; path?: string; error?: string; cancelled?: boolean }> => {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return { success: false, error: 'Electron API 不可用' }
    
    try {
      const ext = format === 'excel' ? 'xlsx' : format
      const path = await electronAPI.saveDialog({
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
      
      await electronAPI.writeFile(path, content)
      return { success: true, path }
    } catch (e: any) {
      return { success: false, error: e.toString() }
    }
  },
}

// NCX 解析 - 支持多种 Navicat 导出格式（异步版本，支持密码解密）
async function parseNcxAsync(content: string, electronAPI: Window['electronAPI']): Promise<any[]> {
  const connections: any[] = []
  
  // 尝试匹配两种格式:
  // 1. 自闭合: <Connection ... />
  // 2. 非自闭合: <Connection ...>...</Connection>
  const selfClosingRegex = /<Connection\s+([^>]*?)\/>/gi
  const openTagRegex = /<Connection\s+([^>]*?)>/gi
  
  // 解析属性的辅助函数
  const parseAttrs = (attrString: string): Record<string, string> => {
    const attrs: Record<string, string> = {}
    const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g
    let match
    while ((match = attrRegex.exec(attrString)) !== null) {
      attrs[match[1]] = match[2]
    }
    return attrs
  }
  
  // 从属性创建连接对象（异步，支持密码解密）
  const createConnection = async (attrs: Record<string, string>) => {
    // 支持多种属性名称格式
    const name = attrs.ConnectionName || attrs.Name || attrs.connection_name || ''
    if (!name) return null
    
    // 类型映射
    let type = (attrs.ConnType || attrs.Type || attrs.conn_type || 'mysql').toLowerCase()
    if (type === 'postgresql') type = 'postgres'
    if (type === 'sql server' || type === 'mssql') type = 'sqlserver'
    
    // 获取加密的密码
    const encryptedPassword = attrs.Password || attrs.password || ''
    let password = ''
    
    // 如果密码看起来是加密的（全是十六进制字符），则尝试解密
    if (encryptedPassword && /^[0-9A-Fa-f]+$/.test(encryptedPassword) && encryptedPassword.length >= 16) {
      try {
        // 检测 Navicat 版本 - 通过查找 Version 属性或使用默认的 12+
        const version = parseInt(attrs.Version || attrs.version || '12') || 12
        password = await electronAPI.decryptNavicatPassword(encryptedPassword, version)
        console.log(`密码解密成功: ${name} (版本: ${version})`)
      } catch (e) {
        console.warn(`密码解密失败: ${name}`, e)
        // 解密失败时保留原始值（可能是明文密码）
        password = encryptedPassword
      }
    } else {
      // 如果密码不是十六进制格式，假设是明文
      password = encryptedPassword
    }
    
    return {
      id: crypto.randomUUID(),
      name,
      type,
      host: attrs.Host || attrs.host || attrs.Server || 'localhost',
      port: parseInt(attrs.Port || attrs.port || '3306') || 3306,
      username: attrs.UserName || attrs.Username || attrs.User || attrs.user || '',
      password,
      database: attrs.Database || attrs.database || attrs.InitialDatabase || '',
    }
  }
  
  // 收集所有属性字符串
  const attrStrings: string[] = []
  
  // 匹配自闭合标签
  let match
  while ((match = selfClosingRegex.exec(content)) !== null) {
    attrStrings.push(match[1])
  }
  
  // 匹配非自闭合标签
  while ((match = openTagRegex.exec(content)) !== null) {
    attrStrings.push(match[1])
  }
  
  // 并行处理所有连接
  const connectionPromises = attrStrings.map(async (attrString) => {
    const attrs = parseAttrs(attrString)
    return await createConnection(attrs)
  })
  
  const results = await Promise.all(connectionPromises)
  
  // 过滤掉 null 值
  for (const conn of results) {
    if (conn) connections.push(conn)
  }
  
  // 去重（基于名称）
  const uniqueConnections = connections.filter((conn, index, self) =>
    index === self.findIndex(c => c.name === conn.name)
  )
  
  return uniqueConnections
}

// NCX 解析 - 同步版本（不解密密码，保留兼容性）
function parseNcx(content: string): any[] {
  const connections: any[] = []
  
  // 尝试匹配两种格式:
  // 1. 自闭合: <Connection ... />
  // 2. 非自闭合: <Connection ...>...</Connection>
  const selfClosingRegex = /<Connection\s+([^>]*?)\/>/gi
  const openTagRegex = /<Connection\s+([^>]*?)>/gi
  
  // 解析属性的辅助函数
  const parseAttrs = (attrString: string): Record<string, string> => {
    const attrs: Record<string, string> = {}
    const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g
    let match
    while ((match = attrRegex.exec(attrString)) !== null) {
      attrs[match[1]] = match[2]
    }
    return attrs
  }
  
  // 从属性创建连接对象
  const createConnection = (attrs: Record<string, string>) => {
    // 支持多种属性名称格式
    const name = attrs.ConnectionName || attrs.Name || attrs.connection_name || ''
    if (!name) return null
    
    // 类型映射
    let type = (attrs.ConnType || attrs.Type || attrs.conn_type || 'mysql').toLowerCase()
    if (type === 'postgresql') type = 'postgres'
    if (type === 'sql server' || type === 'mssql') type = 'sqlserver'
    
    return {
      id: crypto.randomUUID(),
      name,
      type,
      host: attrs.Host || attrs.host || attrs.Server || 'localhost',
      port: parseInt(attrs.Port || attrs.port || '3306') || 3306,
      username: attrs.UserName || attrs.Username || attrs.User || attrs.user || '',
      password: attrs.Password || attrs.password || '',
      database: attrs.Database || attrs.database || attrs.InitialDatabase || '',
    }
  }
  
  // 匹配自闭合标签
  let match
  while ((match = selfClosingRegex.exec(content)) !== null) {
    const attrs = parseAttrs(match[1])
    const conn = createConnection(attrs)
    if (conn) connections.push(conn)
  }
  
  // 匹配非自闭合标签
  while ((match = openTagRegex.exec(content)) !== null) {
    const attrs = parseAttrs(match[1])
    const conn = createConnection(attrs)
    if (conn) connections.push(conn)
  }
  
  // 去重（基于名称）
  const uniqueConnections = connections.filter((conn, index, self) =>
    index === self.findIndex(c => c.name === conn.name)
  )
  
  return uniqueConnections
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

