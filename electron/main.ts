import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null
let dbConnections: Map<string, any> = new Map()

const isDev = !app.isPackaged

// 单例锁 - 确保只运行一个实例
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 如果获取锁失败，说明已有实例在运行，退出当前进程
  app.quit()
} else {
  // 当第二个实例尝试启动时，聚焦到现有窗口
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: '#1f1f1f',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// 窗口控制
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()
})
ipcMain.handle('window:close', () => mainWindow?.close())

// 解析主机名 - 将 localhost 转换为 127.0.0.1 避免 IPv6 问题
function resolveHost(host: string): string {
  return host === 'localhost' ? '127.0.0.1' : host
}

// 测试连接
ipcMain.handle('db:test', async (_, config) => {
  const host = resolveHost(config.host)
  
  try {
    if (config.type === 'mysql' || config.type === 'mariadb') {
      const mysql = require('mysql2/promise')
      const conn = await mysql.createConnection({
        host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database || undefined,
        connectTimeout: 10000,
      })
      await conn.ping()
      await conn.end()
      return { success: true, message: '连接成功' }
    } else if (config.type === 'postgres') {
      const { Client } = require('pg')
      const client = new Client({
        host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database || 'postgres',
        connectionTimeoutMillis: 10000,
      })
      await client.connect()
      await client.end()
      return { success: true, message: '连接成功' }
    } else if (config.type === 'mongodb') {
      const { MongoClient } = require('mongodb')
      const uri = config.username 
        ? `mongodb://${config.username}:${config.password}@${host}:${config.port}/${config.database || 'admin'}`
        : `mongodb://${host}:${config.port}/${config.database || 'admin'}`
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 })
      await client.connect()
      await client.close()
      return { success: true, message: '连接成功' }
    } else if (config.type === 'redis') {
      const Redis = require('ioredis')
      const client = new Redis({
        host,
        port: config.port,
        password: config.password || undefined,
        connectTimeout: 10000,
        lazyConnect: true,
      })
      await client.connect()
      await client.ping()
      await client.quit()
      return { success: true, message: '连接成功' }
    } else if (config.type === 'sqlserver') {
      const sql = require('mssql')
      const poolConfig = {
        server: host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database || 'master',
        options: { encrypt: false, trustServerCertificate: true },
        connectionTimeout: 10000,
      }
      const pool = await sql.connect(poolConfig)
      await pool.close()
      return { success: true, message: '连接成功' }
    }
    return { success: false, message: `暂不支持 ${config.type}` }
  } catch (err: any) {
    return { success: false, message: err.message }
  }
})

// 连接
ipcMain.handle('db:connect', async (_, config) => {
  const host = resolveHost(config.host)
  
  try {
    if (config.type === 'mysql' || config.type === 'mariadb') {
      const mysql = require('mysql2/promise')
      const conn = await mysql.createConnection({
        host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database || undefined,
      })
      dbConnections.set(config.id, { type: 'mysql', conn })
      return { success: true, message: '连接成功' }
    } else if (config.type === 'postgres') {
      const { Client } = require('pg')
      const client = new Client({
        host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database || 'postgres',
      })
      await client.connect()
      dbConnections.set(config.id, { type: 'postgres', conn: client })
      return { success: true, message: '连接成功' }
    } else if (config.type === 'mongodb') {
      const { MongoClient } = require('mongodb')
      const uri = config.username 
        ? `mongodb://${config.username}:${config.password}@${host}:${config.port}/${config.database || 'admin'}`
        : `mongodb://${host}:${config.port}/${config.database || 'admin'}`
      const client = new MongoClient(uri)
      await client.connect()
      dbConnections.set(config.id, { type: 'mongodb', conn: client })
      return { success: true, message: '连接成功' }
    } else if (config.type === 'redis') {
      const Redis = require('ioredis')
      const client = new Redis({
        host,
        port: config.port,
        password: config.password || undefined,
        lazyConnect: true,
      })
      await client.connect()
      dbConnections.set(config.id, { type: 'redis', conn: client })
      return { success: true, message: '连接成功' }
    } else if (config.type === 'sqlserver') {
      const sql = require('mssql')
      const poolConfig = {
        server: host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database || 'master',
        options: { encrypt: false, trustServerCertificate: true },
      }
      const pool = await sql.connect(poolConfig)
      dbConnections.set(config.id, { type: 'sqlserver', conn: pool })
      return { success: true, message: '连接成功' }
    }
    return { success: false, message: `暂不支持 ${config.type}` }
  } catch (err: any) {
    return { success: false, message: err.message }
  }
})

// 断开
ipcMain.handle('db:disconnect', async (_, id) => {
  const db = dbConnections.get(id)
  if (db) {
    try { await db.conn.end() } catch {}
    dbConnections.delete(id)
  }
})

// 查询
ipcMain.handle('db:query', async (_, id, sql) => {
  const db = dbConnections.get(id)
  if (!db) return { columns: [], rows: [], error: '未连接' }

  try {
    if (db.type === 'mysql') {
      const [rows, fields] = await db.conn.query(sql)
      const columns = fields?.map((f: any) => f.name) || []
      return { columns, rows: Array.isArray(rows) ? rows : [] }
    } else if (db.type === 'postgres') {
      const result = await db.conn.query(sql)
      const columns = result.fields?.map((f: any) => f.name) || []
      return { columns, rows: result.rows }
    }
    return { columns: [], rows: [], error: '不支持的类型' }
  } catch (err: any) {
    return { columns: [], rows: [], error: err.message }
  }
})

// 获取数据库列表
ipcMain.handle('db:getDatabases', async (_, id) => {
  const db = dbConnections.get(id)
  if (!db) return []

  try {
    if (db.type === 'mysql') {
      const [rows] = await db.conn.query('SHOW DATABASES')
      return rows.map((r: any) => r.Database)
    } else if (db.type === 'postgres') {
      const result = await db.conn.query("SELECT datname FROM pg_database WHERE datistemplate = false")
      return result.rows.map((r: any) => r.datname)
    }
  } catch {}
  return []
})

// 获取表列表（带行数）
ipcMain.handle('db:getTables', async (_, id, database) => {
  const db = dbConnections.get(id)
  if (!db) return []

  try {
    if (db.type === 'mysql') {
      // 先切换数据库
      await db.conn.query(`USE \`${database}\``)
      const [rows] = await db.conn.query(`
        SELECT TABLE_NAME as name, TABLE_ROWS as \`rows\` 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ?
      `, [database])
      return rows.map((r: any) => ({ name: r.name, rows: r.rows || 0 }))
    } else if (db.type === 'postgres') {
      const result = await db.conn.query(`
        SELECT tablename as name, 
               (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) as rows
        FROM pg_tables WHERE schemaname = 'public'
      `)
      return result.rows.map((r: any) => ({ name: r.name, rows: parseInt(r.rows) || 0 }))
    }
  } catch (err) {
    console.error('getTables error:', err)
  }
  return []
})

// 获取表字段信息（包含备注）
ipcMain.handle('db:getColumns', async (_, id, database, table) => {
  const db = dbConnections.get(id)
  if (!db) return []

  try {
    if (db.type === 'mysql') {
      const [rows] = await db.conn.query(`
        SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE as nullable, 
               COLUMN_KEY as \`key\`, COLUMN_COMMENT as comment
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [database, table])
      return rows.map((r: any) => ({
        name: r.name,
        type: r.type,
        nullable: r.nullable === 'YES',
        key: r.key || undefined,
        comment: r.comment || undefined
      }))
    } else if (db.type === 'postgres') {
      const result = await db.conn.query(`
        SELECT c.column_name as name, c.data_type as type, c.is_nullable as nullable,
               pgd.description as comment
        FROM information_schema.columns c
        LEFT JOIN pg_catalog.pg_statio_all_tables st ON c.table_schema = st.schemaname AND c.table_name = st.relname
        LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
        WHERE c.table_schema = 'public' AND c.table_name = $1
        ORDER BY c.ordinal_position
      `, [table])
      return result.rows.map((r: any) => ({
        name: r.name,
        type: r.type,
        nullable: r.nullable === 'YES',
        comment: r.comment || undefined
      }))
    }
  } catch (err) {
    console.error('getColumns error:', err)
  }
  return []
})

// 获取表数据（分页）
ipcMain.handle('db:getTableData', async (_, id, database, table, page = 1, pageSize = 100) => {
  const db = dbConnections.get(id)
  if (!db) return { data: [], total: 0 }

  try {
    const offset = (page - 1) * pageSize
    
    if (db.type === 'mysql') {
      // 获取总数
      const [countResult] = await db.conn.query(`SELECT COUNT(*) as total FROM \`${database}\`.\`${table}\``)
      const total = countResult[0]?.total || 0
      
      // 获取数据
      const [rows] = await db.conn.query(`SELECT * FROM \`${database}\`.\`${table}\` LIMIT ? OFFSET ?`, [pageSize, offset])
      return { data: rows, total }
    } else if (db.type === 'postgres') {
      // 获取总数
      const countResult = await db.conn.query(`SELECT COUNT(*) as total FROM "${table}"`)
      const total = parseInt(countResult.rows[0]?.total) || 0
      
      // 获取数据
      const result = await db.conn.query(`SELECT * FROM "${table}" LIMIT $1 OFFSET $2`, [pageSize, offset])
      return { data: result.rows, total }
    }
  } catch (err) {
    console.error('getTableData error:', err)
  }
  return { data: [], total: 0 }
})

// 配置存储
const fs = require('fs')
const configPath = path.join(app.getPath('userData'), 'connections.json')

ipcMain.handle('config:save', async (_, connections) => {
  fs.writeFileSync(configPath, JSON.stringify(connections, null, 2))
})

ipcMain.handle('config:load', async () => {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
  } catch {}
  return []
})

// 文件操作
ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '打开 SQL 文件',
    filters: [
      { name: 'SQL 文件', extensions: ['sql'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  
  const filePath = result.filePaths[0]
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return { path: filePath, content, name: path.basename(filePath) }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('file:save', async (_, filePath: string | null, content: string) => {
  let targetPath = filePath
  
  if (!targetPath) {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '保存 SQL 文件',
      defaultPath: 'query.sql',
      filters: [
        { name: 'SQL 文件', extensions: ['sql'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    
    if (result.canceled || !result.filePath) {
      return null
    }
    targetPath = result.filePath
  }
  
  try {
    fs.writeFileSync(targetPath, content, 'utf-8')
    return { path: targetPath, name: path.basename(targetPath) }
  } catch (err: any) {
    return { error: err.message }
  }
})

// 数据库备份
ipcMain.handle('db:backup', async (_, id: string, database: string) => {
  const db = dbConnections.get(id)
  if (!db) return { error: '未连接数据库' }

  // 选择保存位置
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: '备份数据库',
    defaultPath: `${database}_backup_${new Date().toISOString().slice(0, 10)}.sql`,
    filters: [
      { name: 'SQL 文件', extensions: ['sql'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  
  if (result.canceled || !result.filePath) {
    return { cancelled: true }
  }

  try {
    let sqlContent = ''
    sqlContent += `-- Database Backup: ${database}\n`
    sqlContent += `-- Generated: ${new Date().toLocaleString()}\n`
    sqlContent += `-- Tool: EasySQL\n\n`
    
    if (db.type === 'mysql' || db.type === 'mariadb') {
      // 切换到目标数据库
      await db.conn.query(`USE \`${database}\``)
      
      // 获取所有表
      const [tables] = await db.conn.query(`SHOW TABLES`)
      const tableKey = `Tables_in_${database}`
      
      sqlContent += `SET FOREIGN_KEY_CHECKS = 0;\n\n`
      
      for (const tableRow of tables as any[]) {
        const tableName = tableRow[tableKey]
        
        // 获取建表语句
        const [createResult] = await db.conn.query(`SHOW CREATE TABLE \`${tableName}\``)
        const createStatement = (createResult as any[])[0]['Create Table']
        
        sqlContent += `-- Table: ${tableName}\n`
        sqlContent += `DROP TABLE IF EXISTS \`${tableName}\`;\n`
        sqlContent += `${createStatement};\n\n`
        
        // 获取表数据
        const [rows] = await db.conn.query(`SELECT * FROM \`${tableName}\``)
        
        if ((rows as any[]).length > 0) {
          const columns = Object.keys((rows as any[])[0])
          
          for (const row of rows as any[]) {
            const values = columns.map(col => {
              const val = row[col]
              if (val === null) return 'NULL'
              if (typeof val === 'number') return val
              if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`
              return `'${String(val).replace(/'/g, "''").replace(/\\/g, '\\\\')}'`
            }).join(', ')
            
            sqlContent += `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES (${values});\n`
          }
          sqlContent += '\n'
        }
      }
      
      sqlContent += `SET FOREIGN_KEY_CHECKS = 1;\n`
    } else if (db.type === 'postgres') {
      // PostgreSQL 备份
      const tablesResult = await db.conn.query(`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      `)
      
      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.tablename
        
        // 获取表数据
        const dataResult = await db.conn.query(`SELECT * FROM "${tableName}"`)
        
        if (dataResult.rows.length > 0) {
          const columns = Object.keys(dataResult.rows[0])
          
          sqlContent += `-- Table: ${tableName}\n`
          
          for (const row of dataResult.rows) {
            const values = columns.map(col => {
              const val = row[col]
              if (val === null) return 'NULL'
              if (typeof val === 'number') return val
              if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`
              return `'${String(val).replace(/'/g, "''")}'`
            }).join(', ')
            
            sqlContent += `INSERT INTO "${tableName}" ("${columns.join('", "')}") VALUES (${values});\n`
          }
          sqlContent += '\n'
        }
      }
    }
    
    fs.writeFileSync(result.filePath, sqlContent, 'utf-8')
    return { success: true, path: result.filePath }
  } catch (err: any) {
    return { error: err.message }
  }
})

// 导出表数据
ipcMain.handle('db:exportTable', async (_, id: string, database: string, tableName: string, format: 'excel' | 'sql' | 'csv') => {
  const db = dbConnections.get(id)
  if (!db) return { error: '未连接数据库' }

  const ext = format === 'excel' ? 'xlsx' : format
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: `导出表 ${tableName}`,
    defaultPath: `${tableName}_${new Date().toISOString().slice(0, 10)}.${ext}`,
    filters: [
      { name: format === 'excel' ? 'Excel 文件' : format === 'sql' ? 'SQL 文件' : 'CSV 文件', extensions: [ext] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  
  if (result.canceled || !result.filePath) {
    return { cancelled: true }
  }

  try {
    let rows: any[] = []
    let columns: string[] = []
    
    if (db.type === 'mysql' || db.type === 'mariadb') {
      await db.conn.query(`USE \`${database}\``)
      const [data] = await db.conn.query(`SELECT * FROM \`${tableName}\``)
      rows = data as any[]
      if (rows.length > 0) columns = Object.keys(rows[0])
    } else if (db.type === 'postgres') {
      const data = await db.conn.query(`SELECT * FROM "${tableName}"`)
      rows = data.rows
      if (rows.length > 0) columns = Object.keys(rows[0])
    }
    
    if (format === 'sql') {
      let content = `-- Table: ${tableName}\n`
      content += `-- Exported: ${new Date().toLocaleString()}\n\n`
      
      for (const row of rows) {
        const values = columns.map(col => {
          const val = row[col]
          if (val === null) return 'NULL'
          if (typeof val === 'number') return val
          return `'${String(val).replace(/'/g, "''")}'`
        }).join(', ')
        content += `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES (${values});\n`
      }
      
      fs.writeFileSync(result.filePath, content, 'utf-8')
    } else if (format === 'csv') {
      let content = columns.join(',') + '\n'
      for (const row of rows) {
        const values = columns.map(col => {
          const val = row[col]
          if (val === null) return ''
          const str = String(val)
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        })
        content += values.join(',') + '\n'
      }
      fs.writeFileSync(result.filePath, content, 'utf-8')
    }
    
    return { success: true, path: result.filePath }
  } catch (err: any) {
    return { error: err.message }
  }
})

// 更新表数据
ipcMain.handle('db:updateRow', async (_, id: string, database: string, tableName: string, primaryKey: { column: string; value: any }, updates: Record<string, any>) => {
  const db = dbConnections.get(id)
  if (!db) return { error: '未连接数据库' }

  try {
    if (db.type === 'mysql' || db.type === 'mariadb') {
      await db.conn.query(`USE \`${database}\``)
      
      const setClauses = Object.entries(updates).map(([col, val]) => {
        if (val === null) return `\`${col}\` = NULL`
        return `\`${col}\` = ?`
      })
      const values = Object.values(updates).filter(v => v !== null)
      values.push(primaryKey.value)
      
      await db.conn.query(
        `UPDATE \`${tableName}\` SET ${setClauses.join(', ')} WHERE \`${primaryKey.column}\` = ?`,
        values
      )
      return { success: true }
    } else if (db.type === 'postgres') {
      const setClauses = Object.entries(updates).map(([col, val], i) => {
        if (val === null) return `"${col}" = NULL`
        return `"${col}" = $${i + 1}`
      })
      const values = Object.values(updates).filter(v => v !== null)
      values.push(primaryKey.value)
      
      await db.conn.query(
        `UPDATE "${tableName}" SET ${setClauses.join(', ')} WHERE "${primaryKey.column}" = $${values.length}`,
        values
      )
      return { success: true }
    }
    return { error: '不支持的数据库类型' }
  } catch (err: any) {
    return { error: err.message }
  }
})

// 删除表数据行
ipcMain.handle('db:deleteRow', async (_, id: string, database: string, tableName: string, primaryKey: { column: string; value: any }) => {
  const db = dbConnections.get(id)
  if (!db) return { error: '未连接数据库' }

  try {
    if (db.type === 'mysql' || db.type === 'mariadb') {
      await db.conn.query(`USE \`${database}\``)
      await db.conn.query(`DELETE FROM \`${tableName}\` WHERE \`${primaryKey.column}\` = ?`, [primaryKey.value])
      return { success: true }
    } else if (db.type === 'postgres') {
      await db.conn.query(`DELETE FROM "${tableName}" WHERE "${primaryKey.column}" = $1`, [primaryKey.value])
      return { success: true }
    }
    return { error: '不支持的数据库类型' }
  } catch (err: any) {
    return { error: err.message }
  }
})
