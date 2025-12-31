import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import crypto from 'crypto'
import mysql from 'mysql2/promise'
import pg from 'pg'
import initSqlJs from 'sql.js'
import { MongoClient } from 'mongodb'
import Redis from 'ioredis'
import mssql from 'mssql'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 存储活动的数据库连接
const connections = new Map()
// 配置文件路径
const configPath = path.join(app.getPath('userData'), 'connections.json')
// SQL.js 初始化
let SQL = null

let mainWindow

async function initSqlite() {
  if (!SQL) {
    SQL = await initSqlJs()
  }
  return SQL
}

function createWindow() {
  // 图标路径（开发和生产环境不同）
  const iconPath = process.env.NODE_ENV !== 'production'
    ? path.join(__dirname, '../public/icon.png')
    : path.join(__dirname, '../dist/icon.png')
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: '#1e1e1e',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 开发模式下加载 Vite 开发服务器
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL('http://localhost:5173')
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  await initSqlite()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // 关闭所有数据库连接
  for (const [id, connInfo] of connections) {
    try {
      closeConnection(connInfo.connection, connInfo.type)
    } catch (e) {
      console.error('关闭连接失败:', e)
    }
  }
  connections.clear()
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ============ 窗口控制 ============
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

// ============ 配置存储 ============
ipcMain.handle('config:load', async () => {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(data)
    }
    return []
  } catch (e) {
    console.error('加载配置失败:', e)
    return []
  }
})

ipcMain.handle('config:save', async (event, connectionsList) => {
  try {
    fs.writeFileSync(configPath, JSON.stringify(connectionsList, null, 2))
    return { success: true }
  } catch (e) {
    console.error('保存配置失败:', e)
    return { success: false, message: e.message }
  }
})

// ============ 数据库操作 ============
ipcMain.handle('db:test', async (event, config) => {
  try {
    const conn = await createConnection(config)
    await closeConnection(conn, config.type)
    return { success: true, message: '连接成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('db:connect', async (event, config) => {
  try {
    const conn = await createConnection(config)
    connections.set(config.id, { connection: conn, type: config.type, config })
    return { success: true, message: '连接成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('db:disconnect', async (event, id) => {
  const connInfo = connections.get(id)
  if (connInfo) {
    await closeConnection(connInfo.connection, connInfo.type)
    connections.delete(id)
  }
})

// 检查连接是否有效
async function isConnectionAlive(conn, type) {
  try {
    switch (type) {
      case 'mysql':
      case 'mariadb':
        await conn.query('SELECT 1')
        return true
      case 'postgresql':
      case 'postgres':
        await conn.query('SELECT 1')
        return true
      case 'sqlite':
        conn.exec('SELECT 1')
        return true
      case 'mongodb':
        await conn.db('admin').command({ ping: 1 })
        return true
      case 'redis':
        await conn.ping()
        return true
      case 'sqlserver':
        await conn.request().query('SELECT 1')
        return true
      default:
        return true
    }
  } catch (e) {
    console.log('连接检测失败:', e.message)
    return false
  }
}

// 确保连接有效，如果断开则自动重连
async function ensureConnection(id) {
  const connInfo = connections.get(id)
  if (!connInfo) {
    return null
  }

  // 检查连接是否有效
  const alive = await isConnectionAlive(connInfo.connection, connInfo.type)
  
  if (!alive && connInfo.config) {
    console.log(`连接 ${id} 已断开，尝试重新连接...`)
    try {
      // 尝试关闭旧连接（忽略错误）
      try {
        await closeConnection(connInfo.connection, connInfo.type)
      } catch (e) {}
      
      // 重新建立连接
      const newConn = await createConnection(connInfo.config)
      connections.set(id, { connection: newConn, type: connInfo.type, config: connInfo.config })
      console.log(`连接 ${id} 重新连接成功`)
      return connections.get(id)
    } catch (e) {
      console.error(`连接 ${id} 重新连接失败:`, e.message)
      connections.delete(id)
      return null
    }
  }
  
  return connInfo
}

ipcMain.handle('db:query', async (event, id, sql) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) {
    return { columns: [], rows: [], error: '连接不存在或已断开，请重新连接' }
  }

  try {
    const result = await executeQuery(connInfo.connection, connInfo.type, sql)
    return result
  } catch (e) {
    // 如果是连接错误，尝试重连后再执行一次
    if (e.message.includes('closed') || e.message.includes('ECONNRESET') || e.message.includes('ETIMEDOUT')) {
      const newConnInfo = await ensureConnection(id)
      if (newConnInfo) {
        try {
          return await executeQuery(newConnInfo.connection, newConnInfo.type, sql)
        } catch (e2) {
          return { columns: [], rows: [], error: e2.message }
        }
      }
    }
    return { columns: [], rows: [], error: e.message }
  }
})

ipcMain.handle('db:getDatabases', async (event, id) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return []

  try {
    return await getDatabases(connInfo.connection, connInfo.type)
  } catch (e) {
    console.error('获取数据库列表失败:', e)
    return []
  }
})

ipcMain.handle('db:getTables', async (event, id, database) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return []

  try {
    return await getTables(connInfo.connection, connInfo.type, database)
  } catch (e) {
    console.error('获取表列表失败:', e)
    return []
  }
})

ipcMain.handle('db:getColumns', async (event, id, database, table) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return []

  try {
    return await getColumns(connInfo.connection, connInfo.type, database, table)
  } catch (e) {
    console.error('获取列信息失败:', e)
    return []
  }
})

ipcMain.handle('db:getTableData', async (event, id, database, table, page, pageSize) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { columns: [], rows: [], total: 0, page, pageSize }

  try {
    return await getTableData(connInfo.connection, connInfo.type, database, table, page, pageSize)
  } catch (e) {
    console.error('获取表数据失败:', e)
    return { columns: [], rows: [], total: 0, page, pageSize }
  }
})

ipcMain.handle('db:updateRow', async (event, id, database, table, primaryKey, updates) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开，请重新连接' }

  try {
    await updateRow(connInfo.connection, connInfo.type, database, table, primaryKey, updates)
    return { success: true, message: '更新成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('db:deleteRow', async (event, id, database, table, primaryKey) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开，请重新连接' }

  try {
    await deleteRow(connInfo.connection, connInfo.type, database, table, primaryKey)
    return { success: true, message: '删除成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('db:insertRow', async (event, id, database, table, columns, values) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开，请重新连接' }

  try {
    const result = await insertRow(connInfo.connection, connInfo.type, database, table, columns, values)
    return { success: true, message: '插入成功', insertId: result?.insertId }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// ============ 数据库管理操作 ============

// 创建数据库
ipcMain.handle('db:createDatabase', async (event, id, dbName, charset = 'utf8mb4', collation = 'utf8mb4_general_ci') => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开' }

  try {
    switch (connInfo.type) {
      case 'mysql':
      case 'mariadb':
        await connInfo.connection.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET ${charset} COLLATE ${collation}`)
        break
      case 'postgresql':
      case 'postgres':
        await connInfo.connection.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8'`)
        break
      case 'sqlserver':
        await connInfo.connection.request().query(`CREATE DATABASE [${dbName}]`)
        break
      case 'mongodb':
        // MongoDB 会在首次插入时自动创建数据库
        await connInfo.connection.db(dbName).createCollection('_init_')
        await connInfo.connection.db(dbName).dropCollection('_init_')
        break
      default:
        return { success: false, message: '该数据库类型不支持此操作' }
    }
    return { success: true, message: '数据库创建成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// 删除数据库
ipcMain.handle('db:dropDatabase', async (event, id, dbName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开' }

  try {
    switch (connInfo.type) {
      case 'mysql':
      case 'mariadb':
        await connInfo.connection.query(`DROP DATABASE \`${dbName}\``)
        break
      case 'postgresql':
      case 'postgres':
        await connInfo.connection.query(`DROP DATABASE "${dbName}"`)
        break
      case 'sqlserver':
        await connInfo.connection.request().query(`DROP DATABASE [${dbName}]`)
        break
      case 'mongodb':
        await connInfo.connection.db(dbName).dropDatabase()
        break
      default:
        return { success: false, message: '该数据库类型不支持此操作' }
    }
    return { success: true, message: '数据库删除成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// ============ 表管理操作 ============

// 创建表
ipcMain.handle('db:createTable', async (event, id, database, tableName, columns) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开' }

  try {
    // columns: [{ name, type, nullable, primaryKey, autoIncrement, defaultValue, comment }]
    let sql = ''
    
    switch (connInfo.type) {
      case 'mysql':
      case 'mariadb': {
        const colDefs = columns.map(col => {
          let def = `\`${col.name}\` ${col.type}`
          if (!col.nullable) def += ' NOT NULL'
          if (col.autoIncrement) def += ' AUTO_INCREMENT'
          if (col.defaultValue !== undefined && col.defaultValue !== '') {
            def += ` DEFAULT ${col.defaultValue === 'NULL' ? 'NULL' : `'${col.defaultValue}'`}`
          }
          if (col.comment) def += ` COMMENT '${col.comment}'`
          return def
        })
        const pkCols = columns.filter(c => c.primaryKey).map(c => `\`${c.name}\``).join(', ')
        if (pkCols) colDefs.push(`PRIMARY KEY (${pkCols})`)
        sql = `CREATE TABLE \`${database}\`.\`${tableName}\` (${colDefs.join(', ')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
        await connInfo.connection.query(sql)
        break
      }
      case 'postgresql':
      case 'postgres': {
        const colDefs = columns.map(col => {
          let def = `"${col.name}" ${col.type}`
          if (col.primaryKey && col.autoIncrement) {
            def = `"${col.name}" SERIAL PRIMARY KEY`
          } else {
            if (!col.nullable) def += ' NOT NULL'
            if (col.primaryKey) def += ' PRIMARY KEY'
            if (col.defaultValue !== undefined && col.defaultValue !== '') {
              def += ` DEFAULT ${col.defaultValue}`
            }
          }
          return def
        })
        sql = `CREATE TABLE "${tableName}" (${colDefs.join(', ')})`
        await connInfo.connection.query(sql)
        break
      }
      case 'sqlserver': {
        const colDefs = columns.map(col => {
          let def = `[${col.name}] ${col.type}`
          if (col.autoIncrement) def += ' IDENTITY(1,1)'
          if (!col.nullable) def += ' NOT NULL'
          if (col.primaryKey) def += ' PRIMARY KEY'
          if (col.defaultValue !== undefined && col.defaultValue !== '') {
            def += ` DEFAULT ${col.defaultValue}`
          }
          return def
        })
        sql = `CREATE TABLE [${tableName}] (${colDefs.join(', ')})`
        await connInfo.connection.request().query(sql)
        break
      }
      case 'sqlite': {
        const colDefs = columns.map(col => {
          let def = `"${col.name}" ${col.type}`
          if (col.primaryKey) def += ' PRIMARY KEY'
          if (col.autoIncrement) def += ' AUTOINCREMENT'
          if (!col.nullable) def += ' NOT NULL'
          if (col.defaultValue !== undefined && col.defaultValue !== '') {
            def += ` DEFAULT ${col.defaultValue}`
          }
          return def
        })
        sql = `CREATE TABLE "${tableName}" (${colDefs.join(', ')})`
        connInfo.connection.run(sql)
        break
      }
      default:
        return { success: false, message: '该数据库类型不支持此操作' }
    }
    return { success: true, message: '表创建成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// 删除表
ipcMain.handle('db:dropTable', async (event, id, database, tableName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开' }

  try {
    switch (connInfo.type) {
      case 'mysql':
      case 'mariadb':
        await connInfo.connection.query(`DROP TABLE \`${database}\`.\`${tableName}\``)
        break
      case 'postgresql':
      case 'postgres':
        await connInfo.connection.query(`DROP TABLE "${tableName}"`)
        break
      case 'sqlserver':
        await connInfo.connection.request().query(`DROP TABLE [${tableName}]`)
        break
      case 'sqlite':
        connInfo.connection.run(`DROP TABLE "${tableName}"`)
        break
      case 'mongodb':
        await connInfo.connection.db(database).dropCollection(tableName)
        break
      default:
        return { success: false, message: '该数据库类型不支持此操作' }
    }
    return { success: true, message: '表删除成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// 清空表
ipcMain.handle('db:truncateTable', async (event, id, database, tableName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开' }

  try {
    switch (connInfo.type) {
      case 'mysql':
      case 'mariadb':
        await connInfo.connection.query(`TRUNCATE TABLE \`${database}\`.\`${tableName}\``)
        break
      case 'postgresql':
      case 'postgres':
        await connInfo.connection.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY`)
        break
      case 'sqlserver':
        await connInfo.connection.request().query(`TRUNCATE TABLE [${tableName}]`)
        break
      case 'sqlite':
        connInfo.connection.run(`DELETE FROM "${tableName}"`)
        connInfo.connection.run(`DELETE FROM sqlite_sequence WHERE name='${tableName}'`)
        break
      case 'mongodb':
        await connInfo.connection.db(database).collection(tableName).deleteMany({})
        break
      default:
        return { success: false, message: '该数据库类型不支持此操作' }
    }
    return { success: true, message: '表已清空' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// 重命名表
ipcMain.handle('db:renameTable', async (event, id, database, oldName, newName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开' }

  try {
    switch (connInfo.type) {
      case 'mysql':
      case 'mariadb':
        await connInfo.connection.query(`RENAME TABLE \`${database}\`.\`${oldName}\` TO \`${database}\`.\`${newName}\``)
        break
      case 'postgresql':
      case 'postgres':
        await connInfo.connection.query(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`)
        break
      case 'sqlserver':
        await connInfo.connection.request().query(`EXEC sp_rename '${oldName}', '${newName}'`)
        break
      case 'sqlite':
        connInfo.connection.run(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`)
        break
      case 'mongodb':
        await connInfo.connection.db(database).collection(oldName).rename(newName)
        break
      default:
        return { success: false, message: '该数据库类型不支持此操作' }
    }
    return { success: true, message: '表重命名成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// 复制表结构
ipcMain.handle('db:duplicateTable', async (event, id, database, sourceTable, newTable, withData = false) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开' }

  try {
    switch (connInfo.type) {
      case 'mysql':
      case 'mariadb':
        if (withData) {
          await connInfo.connection.query(`CREATE TABLE \`${database}\`.\`${newTable}\` AS SELECT * FROM \`${database}\`.\`${sourceTable}\``)
        } else {
          await connInfo.connection.query(`CREATE TABLE \`${database}\`.\`${newTable}\` LIKE \`${database}\`.\`${sourceTable}\``)
        }
        break
      case 'postgresql':
      case 'postgres':
        if (withData) {
          await connInfo.connection.query(`CREATE TABLE "${newTable}" AS SELECT * FROM "${sourceTable}"`)
        } else {
          await connInfo.connection.query(`CREATE TABLE "${newTable}" (LIKE "${sourceTable}" INCLUDING ALL)`)
        }
        break
      case 'sqlserver':
        if (withData) {
          await connInfo.connection.request().query(`SELECT * INTO [${newTable}] FROM [${sourceTable}]`)
        } else {
          await connInfo.connection.request().query(`SELECT * INTO [${newTable}] FROM [${sourceTable}] WHERE 1=0`)
        }
        break
      default:
        return { success: false, message: '该数据库类型不支持此操作' }
    }
    return { success: true, message: '表复制成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// 添加列
ipcMain.handle('db:addColumn', async (event, id, database, tableName, column) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开' }

  try {
    // column: { name, type, nullable, defaultValue, comment, after }
    switch (connInfo.type) {
      case 'mysql':
      case 'mariadb': {
        let sql = `ALTER TABLE \`${database}\`.\`${tableName}\` ADD COLUMN \`${column.name}\` ${column.type}`
        if (!column.nullable) sql += ' NOT NULL'
        if (column.defaultValue !== undefined && column.defaultValue !== '') {
          sql += ` DEFAULT ${column.defaultValue === 'NULL' ? 'NULL' : `'${column.defaultValue}'`}`
        }
        if (column.comment) sql += ` COMMENT '${column.comment}'`
        if (column.after) sql += ` AFTER \`${column.after}\``
        await connInfo.connection.query(sql)
        break
      }
      case 'postgresql':
      case 'postgres': {
        let sql = `ALTER TABLE "${tableName}" ADD COLUMN "${column.name}" ${column.type}`
        if (!column.nullable) sql += ' NOT NULL'
        if (column.defaultValue !== undefined && column.defaultValue !== '') {
          sql += ` DEFAULT ${column.defaultValue}`
        }
        await connInfo.connection.query(sql)
        break
      }
      case 'sqlserver': {
        let sql = `ALTER TABLE [${tableName}] ADD [${column.name}] ${column.type}`
        if (!column.nullable) sql += ' NOT NULL'
        if (column.defaultValue !== undefined && column.defaultValue !== '') {
          sql += ` DEFAULT ${column.defaultValue}`
        }
        await connInfo.connection.request().query(sql)
        break
      }
      case 'sqlite': {
        let sql = `ALTER TABLE "${tableName}" ADD COLUMN "${column.name}" ${column.type}`
        if (!column.nullable) sql += ' NOT NULL'
        if (column.defaultValue !== undefined && column.defaultValue !== '') {
          sql += ` DEFAULT ${column.defaultValue}`
        }
        connInfo.connection.run(sql)
        break
      }
      default:
        return { success: false, message: '该数据库类型不支持此操作' }
    }
    return { success: true, message: '列添加成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// 修改列
ipcMain.handle('db:modifyColumn', async (event, id, database, tableName, oldName, column) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开' }

  try {
    switch (connInfo.type) {
      case 'mysql':
      case 'mariadb': {
        let sql = `ALTER TABLE \`${database}\`.\`${tableName}\` CHANGE \`${oldName}\` \`${column.name}\` ${column.type}`
        if (!column.nullable) sql += ' NOT NULL'
        if (column.defaultValue !== undefined && column.defaultValue !== '') {
          sql += ` DEFAULT ${column.defaultValue === 'NULL' ? 'NULL' : `'${column.defaultValue}'`}`
        }
        if (column.comment) sql += ` COMMENT '${column.comment}'`
        await connInfo.connection.query(sql)
        break
      }
      case 'postgresql':
      case 'postgres': {
        // PostgreSQL 需要多条语句
        if (oldName !== column.name) {
          await connInfo.connection.query(`ALTER TABLE "${tableName}" RENAME COLUMN "${oldName}" TO "${column.name}"`)
        }
        await connInfo.connection.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${column.name}" TYPE ${column.type}`)
        if (column.nullable) {
          await connInfo.connection.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${column.name}" DROP NOT NULL`)
        } else {
          await connInfo.connection.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${column.name}" SET NOT NULL`)
        }
        break
      }
      case 'sqlserver': {
        if (oldName !== column.name) {
          await connInfo.connection.request().query(`EXEC sp_rename '${tableName}.${oldName}', '${column.name}', 'COLUMN'`)
        }
        let sql = `ALTER TABLE [${tableName}] ALTER COLUMN [${column.name}] ${column.type}`
        if (!column.nullable) sql += ' NOT NULL'
        await connInfo.connection.request().query(sql)
        break
      }
      default:
        return { success: false, message: '该数据库类型不支持此操作' }
    }
    return { success: true, message: '列修改成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// 删除列
ipcMain.handle('db:dropColumn', async (event, id, database, tableName, columnName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开' }

  try {
    switch (connInfo.type) {
      case 'mysql':
      case 'mariadb':
        await connInfo.connection.query(`ALTER TABLE \`${database}\`.\`${tableName}\` DROP COLUMN \`${columnName}\``)
        break
      case 'postgresql':
      case 'postgres':
        await connInfo.connection.query(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`)
        break
      case 'sqlserver':
        await connInfo.connection.request().query(`ALTER TABLE [${tableName}] DROP COLUMN [${columnName}]`)
        break
      case 'sqlite':
        // SQLite 不支持直接删除列，需要重建表
        return { success: false, message: 'SQLite 不支持删除列操作' }
      default:
        return { success: false, message: '该数据库类型不支持此操作' }
    }
    return { success: true, message: '列删除成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// ============ 表设计器相关操作 ============

// 获取完整的表信息（字段、索引、外键、选项）
ipcMain.handle('db:getTableInfo', async (event, id, database, tableName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { columns: [], indexes: [], foreignKeys: [], options: {} }

  try {
    return await getTableInfo(connInfo.connection, connInfo.type, database, tableName)
  } catch (e) {
    console.error('获取表信息失败:', e)
    return { columns: [], indexes: [], foreignKeys: [], options: {} }
  }
})

// 获取索引
ipcMain.handle('db:getIndexes', async (event, id, database, tableName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return []

  try {
    return await getIndexes(connInfo.connection, connInfo.type, database, tableName)
  } catch (e) {
    console.error('获取索引失败:', e)
    return []
  }
})

// 获取外键
ipcMain.handle('db:getForeignKeys', async (event, id, database, tableName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return []

  try {
    return await getForeignKeys(connInfo.connection, connInfo.type, database, tableName)
  } catch (e) {
    console.error('获取外键失败:', e)
    return []
  }
})

// 获取表的列名（简化版，用于外键选择）
ipcMain.handle('db:getColumnNames', async (event, id, database, tableName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return []

  try {
    return await getColumnNames(connInfo.connection, connInfo.type, database, tableName)
  } catch (e) {
    console.error('获取列名失败:', e)
    return []
  }
})

// 执行多条 SQL（用于表设计器保存）
ipcMain.handle('db:executeMultiSQL', async (event, id, sqls) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开' }

  try {
    // 将 SQL 语句按分号分割并逐条执行
    const statements = sqls.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'))
    
    for (const sql of statements) {
      await executeQuery(connInfo.connection, connInfo.type, sql)
    }
    
    return { success: true, message: '执行成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// ============ 文件操作 ============
ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'SQL 文件', extensions: ['sql'] }],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const filePath = result.filePaths[0]
  const content = fs.readFileSync(filePath, 'utf-8')
  const name = path.basename(filePath)

  return { path: filePath, content, name }
})

ipcMain.handle('file:save', async (event, filePath, content) => {
  let targetPath = filePath

  if (!targetPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'SQL 文件', extensions: ['sql'] }]
    })

    if (result.canceled) {
      return null
    }
    targetPath = result.filePath
  }

  fs.writeFileSync(targetPath, content, 'utf-8')
  const name = path.basename(targetPath)

  return { path: targetPath, name }
})

ipcMain.handle('file:select', async (event, extensions) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: extensions ? [{ name: '数据库文件', extensions }] : undefined,
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('file:saveDialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options)
  if (result.canceled) return null
  return result.filePath
})

ipcMain.handle('file:write', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('file:read', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return { success: true, content }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ============ 数据库连接辅助函数 ============
async function createConnection(config) {
  const { type, host, port, username, password, database } = config

  switch (type) {
    case 'mysql':
    case 'mariadb':
      return await mysql.createConnection({
        host,
        port,
        user: username,
        password,
        database: database || undefined,
        connectTimeout: 10000,
        dateStrings: true
      })

    case 'postgresql':
    case 'postgres': {
      const client = new pg.Client({
        host,
        port,
        user: username,
        password,
        database: database || 'postgres',
        connectionTimeoutMillis: 10000
      })
      await client.connect()
      return client
    }

    case 'sqlite': {
      await initSqlite()
      const dbPath = host || database
      let dbData = null
      
      if (dbPath && fs.existsSync(dbPath)) {
        dbData = fs.readFileSync(dbPath)
      }
      
      const db = new SQL.Database(dbData)
      db._path = dbPath
      return db
    }

    case 'mongodb': {
      const uri = username && password
        ? `mongodb://${username}:${password}@${host}:${port}/${database || 'admin'}?authSource=admin`
        : `mongodb://${host}:${port}/${database || 'admin'}`
      const client = new MongoClient(uri, { 
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000
      })
      await client.connect()
      client._database = database || 'admin'
      return client
    }

    case 'redis': {
      const redis = new Redis({
        host,
        port,
        password: password || undefined,
        db: parseInt(database) || 0,
        connectTimeout: 10000,
        lazyConnect: true
      })
      await redis.connect()
      return redis
    }

    case 'sqlserver': {
      const sqlConfig = {
        user: username,
        password,
        database: database || 'master',
        server: host,
        port: port || 1433,
        options: {
          encrypt: false,
          trustServerCertificate: true,
          connectTimeout: 10000
        }
      }
      const pool = await mssql.connect(sqlConfig)
      pool._database = database || 'master'
      return pool
    }

    default:
      throw new Error(`不支持的数据库类型: ${type}`)
  }
}

async function closeConnection(conn, type) {
  try {
    switch (type) {
      case 'mysql':
      case 'mariadb':
        await conn.end()
        break
      case 'postgresql':
      case 'postgres':
        await conn.end()
        break
      case 'sqlite':
        if (conn._path) {
          const data = conn.export()
          fs.writeFileSync(conn._path, Buffer.from(data))
        }
        conn.close()
        break
      case 'mongodb':
        await conn.close()
        break
      case 'redis':
        await conn.quit()
        break
      case 'sqlserver':
        await conn.close()
        break
    }
  } catch (e) {
    console.error('关闭连接时出错:', e)
  }
}

async function executeQuery(conn, type, sql) {
  switch (type) {
    case 'mysql':
    case 'mariadb': {
      const [rows, fields] = await conn.query(sql)
      if (Array.isArray(rows)) {
        const columns = fields ? fields.map(f => f.name) : Object.keys(rows[0] || {})
        const data = rows.map(row => columns.map(col => row[col]))
        return { columns, rows: data }
      }
      return { columns: [], rows: [], affectedRows: rows.affectedRows }
    }

    case 'postgresql':
    case 'postgres': {
      const result = await conn.query(sql)
      const columns = result.fields ? result.fields.map(f => f.name) : []
      const rows = result.rows.map(row => columns.map(col => row[col]))
      return { columns, rows }
    }

    case 'sqlite': {
      try {
        const stmt = conn.prepare(sql)
        const columns = stmt.getColumnNames()
        const rows = []
        while (stmt.step()) {
          rows.push(stmt.get())
        }
        stmt.free()
        return { columns, rows }
      } catch (e) {
        conn.run(sql)
        const changes = conn.getRowsModified()
        return { columns: [], rows: [], affectedRows: changes }
      }
    }

    case 'sqlserver': {
      const result = await conn.request().query(sql)
      if (result.recordset) {
        const columns = Object.keys(result.recordset[0] || {})
        const rows = result.recordset.map(row => columns.map(col => row[col]))
        return { columns, rows }
      }
      return { columns: [], rows: [], affectedRows: result.rowsAffected?.[0] || 0 }
    }

    case 'mongodb': {
      // MongoDB 使用简单的命令语法
      // 示例: db.collection.find({}) 或 collection_name
      return { columns: [], rows: [], error: 'MongoDB 请使用表浏览功能查看数据' }
    }

    case 'redis': {
      // Redis 命令执行
      const parts = sql.trim().split(/\s+/)
      const command = parts[0].toLowerCase()
      const args = parts.slice(1)
      const result = await conn.call(command, ...args)
      
      if (Array.isArray(result)) {
        return { 
          columns: ['index', 'value'], 
          rows: result.map((v, i) => [i, typeof v === 'object' ? JSON.stringify(v) : v])
        }
      }
      return { columns: ['result'], rows: [[typeof result === 'object' ? JSON.stringify(result) : result]] }
    }

    default:
      throw new Error(`不支持的数据库类型: ${type}`)
  }
}

async function getDatabases(conn, type) {
  switch (type) {
    case 'mysql':
    case 'mariadb': {
      const [rows] = await conn.query('SHOW DATABASES')
      return rows.map(row => Object.values(row)[0])
    }

    case 'postgresql':
    case 'postgres': {
      const result = await conn.query("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
      return result.rows.map(row => row.datname)
    }

    case 'sqlite':
      return ['main']

    case 'mongodb': {
      const admin = conn.db('admin')
      const result = await admin.command({ listDatabases: 1 })
      return result.databases.map(db => db.name)
    }

    case 'redis': {
      // Redis 数据库是数字 0-15
      const info = await conn.info('keyspace')
      const dbs = ['0'] // 至少返回 db0
      const matches = info.match(/db(\d+)/g)
      if (matches) {
        matches.forEach(m => {
          const num = m.replace('db', '')
          if (!dbs.includes(num)) dbs.push(num)
        })
      }
      return dbs.sort((a, b) => parseInt(a) - parseInt(b))
    }

    case 'sqlserver': {
      const result = await conn.request().query('SELECT name FROM sys.databases ORDER BY name')
      return result.recordset.map(row => row.name)
    }

    default:
      return []
  }
}

async function getTables(conn, type, database) {
  switch (type) {
    case 'mysql':
    case 'mariadb': {
      await conn.query(`USE \`${database}\``)
      const [tables] = await conn.query(`
        SELECT TABLE_NAME as name, TABLE_ROWS as \`rows\`, TABLE_TYPE as type
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME
      `, [database])
      return tables.map(t => ({
        name: t.name,
        rows: t.rows || 0,
        isView: t.type === 'VIEW'
      }))
    }

    case 'postgresql':
    case 'postgres': {
      const result = await conn.query(`
        SELECT table_name as name, table_type as type
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `)
      return result.rows.map(t => ({
        name: t.name,
        rows: 0,
        isView: t.type === 'VIEW'
      }))
    }

    case 'sqlite': {
      const stmt = conn.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
      const tables = []
      while (stmt.step()) {
        const row = stmt.getAsObject()
        tables.push({
          name: row.name,
          rows: 0,
          isView: row.type === 'view'
        })
      }
      stmt.free()
      return tables
    }

    case 'mongodb': {
      const db = conn.db(database)
      const collections = await db.listCollections().toArray()
      return collections.map(c => ({
        name: c.name,
        rows: 0,
        isView: c.type === 'view'
      }))
    }

    case 'redis': {
      // 切换到指定数据库
      await conn.select(parseInt(database) || 0)
      // 获取所有键（前100个作为"表"）
      const keys = await conn.keys('*')
      const uniquePrefixes = new Set()
      keys.forEach(key => {
        const prefix = key.split(':')[0]
        uniquePrefixes.add(prefix)
      })
      return [...uniquePrefixes].slice(0, 100).map(name => ({
        name,
        rows: 0,
        isView: false
      }))
    }

    case 'sqlserver': {
      // 切换数据库
      await conn.request().query(`USE [${database}]`)
      const result = await conn.request().query(`
        SELECT TABLE_NAME as name, TABLE_TYPE as type
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_CATALOG = '${database}'
        ORDER BY TABLE_NAME
      `)
      return result.recordset.map(t => ({
        name: t.name,
        rows: 0,
        isView: t.type === 'VIEW'
      }))
    }

    default:
      return []
  }
}

async function getColumns(conn, type, database, table) {
  switch (type) {
    case 'mysql':
    case 'mariadb': {
      const [columns] = await conn.query(`
        SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE as nullable, 
               COLUMN_KEY as \`key\`, COLUMN_COMMENT as comment
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [database, table])
      return columns.map(c => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable === 'YES',
        key: c.key || undefined,
        comment: c.comment || undefined
      }))
    }

    case 'postgresql':
    case 'postgres': {
      const result = await conn.query(`
        SELECT column_name as name, data_type as type, is_nullable as nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table])
      return result.rows.map(c => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable === 'YES'
      }))
    }

    case 'sqlite': {
      const stmt = conn.prepare(`PRAGMA table_info("${table}")`)
      const columns = []
      while (stmt.step()) {
        const row = stmt.getAsObject()
        columns.push({
          name: row.name,
          type: row.type || 'TEXT',
          nullable: !row.notnull,
          key: row.pk ? 'PRI' : undefined
        })
      }
      stmt.free()
      return columns
    }

    case 'mongodb': {
      // MongoDB 是无模式的，从第一个文档推断字段
      const db = conn.db(database)
      const doc = await db.collection(table).findOne()
      if (!doc) return []
      return Object.keys(doc).map(key => ({
        name: key,
        type: typeof doc[key],
        nullable: true,
        key: key === '_id' ? 'PRI' : undefined
      }))
    }

    case 'redis': {
      // Redis 键没有固定的"列"
      return [
        { name: 'key', type: 'string', nullable: false, key: 'PRI' },
        { name: 'value', type: 'string', nullable: true },
        { name: 'type', type: 'string', nullable: true },
        { name: 'ttl', type: 'integer', nullable: true }
      ]
    }

    case 'sqlserver': {
      const result = await conn.request().query(`
        SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE as nullable,
               COLUMNPROPERTY(OBJECT_ID('${table}'), COLUMN_NAME, 'IsIdentity') as is_identity
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = '${table}'
        ORDER BY ORDINAL_POSITION
      `)
      return result.recordset.map(c => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable === 'YES',
        key: c.is_identity ? 'PRI' : undefined
      }))
    }

    default:
      return []
  }
}

async function getTableData(conn, type, database, table, page = 1, pageSize = 100) {
  const offset = (page - 1) * pageSize
  const columns = await getColumns(conn, type, database, table)

  switch (type) {
    case 'mysql':
    case 'mariadb': {
      const [[{ total }]] = await conn.query(`SELECT COUNT(*) as total FROM \`${database}\`.\`${table}\``)
      const [rows] = await conn.query(`SELECT * FROM \`${database}\`.\`${table}\` LIMIT ? OFFSET ?`, [pageSize, offset])
      const data = rows.map(row => columns.map(col => row[col.name]))
      return { columns, rows: data, total, page, pageSize }
    }

    case 'postgresql':
    case 'postgres': {
      const countResult = await conn.query(`SELECT COUNT(*) as total FROM "${table}"`)
      const total = parseInt(countResult.rows[0].total)
      const result = await conn.query(`SELECT * FROM "${table}" LIMIT $1 OFFSET $2`, [pageSize, offset])
      const data = result.rows.map(row => columns.map(col => row[col.name]))
      return { columns, rows: data, total, page, pageSize }
    }

    case 'sqlite': {
      let total = 0
      const countStmt = conn.prepare(`SELECT COUNT(*) as total FROM "${table}"`)
      if (countStmt.step()) {
        total = countStmt.getAsObject().total
      }
      countStmt.free()

      const stmt = conn.prepare(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`)
      stmt.bind([pageSize, offset])
      const rows = []
      while (stmt.step()) {
        const row = stmt.get()
        rows.push(row)
      }
      stmt.free()
      return { columns, rows, total, page, pageSize }
    }

    case 'mongodb': {
      const db = conn.db(database)
      const collection = db.collection(table)
      const total = await collection.countDocuments()
      const docs = await collection.find().skip(offset).limit(pageSize).toArray()
      const rows = docs.map(doc => columns.map(col => {
        const val = doc[col.name]
        if (val instanceof Object && val.constructor.name === 'ObjectId') {
          return val.toString()
        }
        return typeof val === 'object' ? JSON.stringify(val) : val
      }))
      return { columns, rows, total, page, pageSize }
    }

    case 'redis': {
      await conn.select(parseInt(database) || 0)
      // 获取以 table 为前缀的键
      const pattern = table === '*' ? '*' : `${table}*`
      const allKeys = await conn.keys(pattern)
      const total = allKeys.length
      const keys = allKeys.slice(offset, offset + pageSize)
      
      const rows = await Promise.all(keys.map(async (key) => {
        const keyType = await conn.type(key)
        let value = ''
        switch (keyType) {
          case 'string':
            value = await conn.get(key)
            break
          case 'list':
            value = JSON.stringify(await conn.lrange(key, 0, 10))
            break
          case 'set':
            value = JSON.stringify(await conn.smembers(key))
            break
          case 'hash':
            value = JSON.stringify(await conn.hgetall(key))
            break
          case 'zset':
            value = JSON.stringify(await conn.zrange(key, 0, 10, 'WITHSCORES'))
            break
          default:
            value = `<${keyType}>`
        }
        const ttl = await conn.ttl(key)
        return [key, value, keyType, ttl === -1 ? 'forever' : ttl]
      }))
      
      return { columns, rows, total, page, pageSize }
    }

    case 'sqlserver': {
      const countResult = await conn.request().query(`SELECT COUNT(*) as total FROM [${table}]`)
      const total = countResult.recordset[0].total
      const result = await conn.request().query(`
        SELECT * FROM [${table}]
        ORDER BY (SELECT NULL)
        OFFSET ${offset} ROWS
        FETCH NEXT ${pageSize} ROWS ONLY
      `)
      const data = result.recordset.map(row => columns.map(col => row[col.name]))
      return { columns, rows: data, total, page, pageSize }
    }

    default:
      return { columns: [], rows: [], total: 0, page, pageSize }
  }
}

async function updateRow(conn, type, database, table, primaryKey, updates) {
  switch (type) {
    case 'mysql':
    case 'mariadb': {
      const setClauses = Object.keys(updates).map(col => `\`${col}\` = ?`).join(', ')
      const values = [...Object.values(updates), primaryKey.value]
      await conn.query(`UPDATE \`${database}\`.\`${table}\` SET ${setClauses} WHERE \`${primaryKey.column}\` = ?`, values)
      break
    }
    case 'postgresql':
    case 'postgres': {
      const pgSetClauses = Object.keys(updates).map((col, i) => `"${col}" = $${i + 1}`).join(', ')
      const pgValues = [...Object.values(updates), primaryKey.value]
      await conn.query(`UPDATE "${table}" SET ${pgSetClauses} WHERE "${primaryKey.column}" = $${pgValues.length}`, pgValues)
      break
    }
    case 'sqlite': {
      const sqliteSetClauses = Object.keys(updates).map(col => `"${col}" = ?`).join(', ')
      const values = [...Object.values(updates), primaryKey.value]
      conn.run(`UPDATE "${table}" SET ${sqliteSetClauses} WHERE "${primaryKey.column}" = ?`, values)
      break
    }
    case 'mongodb': {
      const db = conn.db(database)
      const { ObjectId } = await import('mongodb')
      const filter = primaryKey.column === '_id' 
        ? { _id: new ObjectId(primaryKey.value) }
        : { [primaryKey.column]: primaryKey.value }
      await db.collection(table).updateOne(filter, { $set: updates })
      break
    }
    case 'redis': {
      // Redis 更新键值
      await conn.select(parseInt(database) || 0)
      const keyType = await conn.type(primaryKey.value)
      if (keyType === 'string' && updates.value !== undefined) {
        await conn.set(primaryKey.value, updates.value)
      }
      break
    }
    case 'sqlserver': {
      const setClauses = Object.keys(updates).map(col => `[${col}] = @${col}`).join(', ')
      const request = conn.request()
      Object.entries(updates).forEach(([col, val]) => {
        request.input(col, val)
      })
      request.input('pk', primaryKey.value)
      await request.query(`UPDATE [${table}] SET ${setClauses} WHERE [${primaryKey.column}] = @pk`)
      break
    }
  }
}

async function deleteRow(conn, type, database, table, primaryKey) {
  switch (type) {
    case 'mysql':
    case 'mariadb':
      await conn.query(`DELETE FROM \`${database}\`.\`${table}\` WHERE \`${primaryKey.column}\` = ?`, [primaryKey.value])
      break
    case 'postgresql':
    case 'postgres':
      await conn.query(`DELETE FROM "${table}" WHERE "${primaryKey.column}" = $1`, [primaryKey.value])
      break
    case 'sqlite':
      conn.run(`DELETE FROM "${table}" WHERE "${primaryKey.column}" = ?`, [primaryKey.value])
      break
    case 'mongodb': {
      const db = conn.db(database)
      const { ObjectId } = await import('mongodb')
      const filter = primaryKey.column === '_id' 
        ? { _id: new ObjectId(primaryKey.value) }
        : { [primaryKey.column]: primaryKey.value }
      await db.collection(table).deleteOne(filter)
      break
    }
    case 'redis': {
      await conn.select(parseInt(database) || 0)
      await conn.del(primaryKey.value)
      break
    }
    case 'sqlserver': {
      const request = conn.request()
      request.input('pk', primaryKey.value)
      await request.query(`DELETE FROM [${table}] WHERE [${primaryKey.column}] = @pk`)
      break
    }
  }
}

async function insertRow(conn, type, database, table, columns, values) {
  switch (type) {
    case 'mysql':
    case 'mariadb': {
      const colList = columns.map(c => `\`${c}\``).join(', ')
      const placeholders = columns.map(() => '?').join(', ')
      const [result] = await conn.query(
        `INSERT INTO \`${database}\`.\`${table}\` (${colList}) VALUES (${placeholders})`,
        values
      )
      return { insertId: result.insertId }
    }
    case 'postgresql':
    case 'postgres': {
      const colList = columns.map(c => `"${c}"`).join(', ')
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
      const result = await conn.query(
        `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) RETURNING *`,
        values
      )
      return { insertId: result.rows[0]?.id }
    }
    case 'sqlite': {
      const colList = columns.map(c => `"${c}"`).join(', ')
      const placeholders = columns.map(() => '?').join(', ')
      conn.run(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`, values)
      // 获取最后插入的行ID
      const stmt = conn.prepare('SELECT last_insert_rowid() as id')
      let insertId = null
      if (stmt.step()) {
        insertId = stmt.getAsObject().id
      }
      stmt.free()
      return { insertId }
    }
    case 'mongodb': {
      const db = conn.db(database)
      const doc = {}
      columns.forEach((col, i) => {
        doc[col] = values[i]
      })
      const result = await db.collection(table).insertOne(doc)
      return { insertId: result.insertedId.toString() }
    }
    case 'redis': {
      await conn.select(parseInt(database) || 0)
      // Redis: 假设第一个列是键名，第二个列是值
      if (columns.length >= 2) {
        await conn.set(values[0], values[1])
      }
      return { insertId: values[0] }
    }
    case 'sqlserver': {
      const colList = columns.map(c => `[${c}]`).join(', ')
      const request = conn.request()
      columns.forEach((col, i) => {
        request.input(`col${i}`, values[i])
      })
      const paramList = columns.map((_, i) => `@col${i}`).join(', ')
      const result = await request.query(
        `INSERT INTO [${table}] (${colList}) VALUES (${paramList}); SELECT SCOPE_IDENTITY() as id`
      )
      return { insertId: result.recordset[0]?.id }
    }
    default:
      throw new Error(`不支持的数据库类型: ${type}`)
  }
}

// ============ 获取表详细信息（用于表设计器） ============
async function getTableInfo(conn, type, database, table) {
  const columns = await getColumnsDetailed(conn, type, database, table)
  const indexes = await getIndexes(conn, type, database, table)
  const foreignKeys = await getForeignKeys(conn, type, database, table)
  const options = await getTableOptions(conn, type, database, table)
  return { columns, indexes, foreignKeys, options }
}

// 获取详细的列信息
async function getColumnsDetailed(conn, type, database, table) {
  switch (type) {
    case 'mysql':
    case 'mariadb': {
      const [columns] = await conn.query(`
        SELECT 
          COLUMN_NAME as name,
          DATA_TYPE as dataType,
          COLUMN_TYPE as columnType,
          CHARACTER_MAXIMUM_LENGTH as length,
          NUMERIC_PRECISION as numPrecision,
          NUMERIC_SCALE as numScale,
          IS_NULLABLE as nullable,
          COLUMN_DEFAULT as defaultValue,
          COLUMN_KEY as \`key\`,
          EXTRA as extra,
          COLUMN_COMMENT as comment
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [database, table])
      return columns.map(c => {
        // 解析 COLUMN_TYPE 获取长度/小数位
        const typeMatch = c.columnType.match(/^(\w+)(?:\((\d+)(?:,(\d+))?\))?/)
        const hasUnsigned = c.columnType.includes('unsigned')
        const hasZerofill = c.columnType.includes('zerofill')
        return {
          id: crypto.randomUUID(),
          name: c.name,
          type: c.dataType.toUpperCase(),
          length: typeMatch?.[2] || '',
          decimals: typeMatch?.[3] || '',
          nullable: c.nullable === 'YES',
          primaryKey: c.key === 'PRI',
          autoIncrement: (c.extra || '').includes('auto_increment'),
          unsigned: hasUnsigned,
          zerofill: hasZerofill,
          defaultValue: c.defaultValue || '',
          comment: c.comment || '',
          isVirtual: (c.extra || '').includes('VIRTUAL') || (c.extra || '').includes('STORED'),
          virtualExpression: '',
        }
      })
    }

    case 'postgresql':
    case 'postgres': {
      const result = await conn.query(`
        SELECT 
          c.column_name as name,
          c.data_type as type,
          c.character_maximum_length as length,
          c.numeric_precision as num_precision,
          c.numeric_scale as num_scale,
          c.is_nullable as nullable,
          c.column_default as default_value,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT ku.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku
            ON tc.constraint_name = ku.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY' 
            AND tc.table_name = $1
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_schema = 'public' AND c.table_name = $1
        ORDER BY c.ordinal_position
      `, [table])
      return result.rows.map(c => ({
        id: crypto.randomUUID(),
        name: c.name,
        type: c.type.toUpperCase(),
        length: c.length || '',
        decimals: c.num_scale || '',
        nullable: c.nullable === 'YES',
        primaryKey: c.is_pk,
        autoIncrement: (c.default_value || '').includes('nextval'),
        unsigned: false,
        zerofill: false,
        defaultValue: c.default_value || '',
        comment: '',
        isVirtual: false,
        virtualExpression: '',
      }))
    }

    case 'sqlserver': {
      const result = await conn.request().query(`
        SELECT 
          c.COLUMN_NAME as name,
          c.DATA_TYPE as type,
          c.CHARACTER_MAXIMUM_LENGTH as length,
          c.NUMERIC_PRECISION as numPrecision,
          c.NUMERIC_SCALE as numScale,
          c.IS_NULLABLE as nullable,
          c.COLUMN_DEFAULT as defaultValue,
          COLUMNPROPERTY(OBJECT_ID('${table}'), c.COLUMN_NAME, 'IsIdentity') as isIdentity
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_NAME = '${table}'
        ORDER BY c.ORDINAL_POSITION
      `)
      // 获取主键
      const pkResult = await conn.request().query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_NAME = '${table}' AND CONSTRAINT_NAME LIKE 'PK%'
      `)
      const pkColumns = pkResult.recordset.map(r => r.COLUMN_NAME)
      
      return result.recordset.map(c => ({
        id: crypto.randomUUID(),
        name: c.name,
        type: c.type.toUpperCase(),
        length: c.length || '',
        decimals: c.numScale || '',
        nullable: c.nullable === 'YES',
        primaryKey: pkColumns.includes(c.name),
        autoIncrement: c.isIdentity === 1,
        unsigned: false,
        zerofill: false,
        defaultValue: c.defaultValue || '',
        comment: '',
        isVirtual: false,
        virtualExpression: '',
      }))
    }

    case 'sqlite': {
      const stmt = conn.prepare(`PRAGMA table_info("${table}")`)
      const columns = []
      while (stmt.step()) {
        const row = stmt.getAsObject()
        columns.push({
          id: crypto.randomUUID(),
          name: row.name,
          type: (row.type || 'TEXT').toUpperCase(),
          length: '',
          decimals: '',
          nullable: !row.notnull,
          primaryKey: row.pk === 1,
          autoIncrement: row.pk === 1 && (row.type || '').toUpperCase() === 'INTEGER',
          unsigned: false,
          zerofill: false,
          defaultValue: row.dflt_value || '',
          comment: '',
          isVirtual: false,
          virtualExpression: '',
        })
      }
      stmt.free()
      return columns
    }

    default:
      return []
  }
}

// 获取索引信息
async function getIndexes(conn, type, database, table) {
  switch (type) {
    case 'mysql':
    case 'mariadb': {
      const [indexes] = await conn.query(`SHOW INDEX FROM \`${database}\`.\`${table}\``)
      // 按索引名分组
      const indexMap = new Map()
      for (const idx of indexes) {
        if (idx.Key_name === 'PRIMARY') continue // 主键单独处理
        if (!indexMap.has(idx.Key_name)) {
          indexMap.set(idx.Key_name, {
            id: crypto.randomUUID(),
            name: idx.Key_name,
            columns: [],
            type: idx.Non_unique === 0 ? 'UNIQUE' : (idx.Index_type === 'FULLTEXT' ? 'FULLTEXT' : 'NORMAL'),
            method: idx.Index_type === 'BTREE' ? 'BTREE' : (idx.Index_type === 'HASH' ? 'HASH' : 'BTREE'),
            comment: idx.Index_comment || '',
          })
        }
        indexMap.get(idx.Key_name).columns.push(idx.Column_name)
      }
      return Array.from(indexMap.values())
    }

    case 'postgresql':
    case 'postgres': {
      const result = await conn.query(`
        SELECT 
          i.relname as name,
          array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns,
          ix.indisunique as is_unique,
          am.amname as method
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        JOIN pg_am am ON am.oid = i.relam
        WHERE t.relname = $1 AND NOT ix.indisprimary
        GROUP BY i.relname, ix.indisunique, am.amname
      `, [table])
      return result.rows.map(idx => ({
        id: crypto.randomUUID(),
        name: idx.name,
        columns: idx.columns,
        type: idx.is_unique ? 'UNIQUE' : 'NORMAL',
        method: idx.method.toUpperCase(),
        comment: '',
      }))
    }

    case 'sqlserver': {
      // 使用 STUFF + FOR XML PATH 兼容旧版本 SQL Server (低于 2017)
      const result = await conn.request().query(`
        SELECT 
          i.name as name,
          i.is_unique as isUnique,
          i.type_desc as typeDesc,
          STUFF((
            SELECT ',' + c2.name
            FROM sys.index_columns ic2
            JOIN sys.columns c2 ON ic2.object_id = c2.object_id AND ic2.column_id = c2.column_id
            WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id
            ORDER BY ic2.key_ordinal
            FOR XML PATH('')
          ), 1, 1, '') as columns
        FROM sys.indexes i
        WHERE i.object_id = OBJECT_ID('${table}') AND i.is_primary_key = 0 AND i.name IS NOT NULL
        GROUP BY i.object_id, i.index_id, i.name, i.is_unique, i.type_desc
      `)
      return result.recordset.map(idx => ({
        id: crypto.randomUUID(),
        name: idx.name,
        columns: idx.columns ? idx.columns.split(',') : [],
        type: idx.isUnique ? 'UNIQUE' : 'NORMAL',
        method: 'BTREE',
        comment: '',
      }))
    }

    case 'sqlite': {
      const stmt = conn.prepare(`PRAGMA index_list("${table}")`)
      const indexes = []
      while (stmt.step()) {
        const row = stmt.getAsObject()
        // 获取索引列
        const colStmt = conn.prepare(`PRAGMA index_info("${row.name}")`)
        const columns = []
        while (colStmt.step()) {
          columns.push(colStmt.getAsObject().name)
        }
        colStmt.free()
        
        if (!row.name.startsWith('sqlite_')) {
          indexes.push({
            id: crypto.randomUUID(),
            name: row.name,
            columns,
            type: row.unique ? 'UNIQUE' : 'NORMAL',
            method: 'BTREE',
            comment: '',
          })
        }
      }
      stmt.free()
      return indexes
    }

    default:
      return []
  }
}

// 获取外键信息
async function getForeignKeys(conn, type, database, table) {
  switch (type) {
    case 'mysql':
    case 'mariadb': {
      const [fks] = await conn.query(`
        SELECT 
          kcu.CONSTRAINT_NAME as name,
          kcu.COLUMN_NAME as column_name,
          kcu.REFERENCED_TABLE_SCHEMA as ref_schema,
          kcu.REFERENCED_TABLE_NAME as ref_table,
          kcu.REFERENCED_COLUMN_NAME as ref_column,
          rc.DELETE_RULE as on_delete,
          rc.UPDATE_RULE as on_update
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
          ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
          AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
        WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ?
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
      `, [database, table])
      
      // 按外键名分组
      const fkMap = new Map()
      for (const fk of fks) {
        if (!fkMap.has(fk.name)) {
          fkMap.set(fk.name, {
            id: crypto.randomUUID(),
            name: fk.name,
            columns: [],
            refSchema: fk.ref_schema,
            refTable: fk.ref_table,
            refColumns: [],
            onDelete: fk.on_delete.replace(' ', '_'),
            onUpdate: fk.on_update.replace(' ', '_'),
          })
        }
        fkMap.get(fk.name).columns.push(fk.column_name)
        fkMap.get(fk.name).refColumns.push(fk.ref_column)
      }
      return Array.from(fkMap.values())
    }

    case 'postgresql':
    case 'postgres': {
      const result = await conn.query(`
        SELECT
          tc.constraint_name as name,
          kcu.column_name as column_name,
          ccu.table_schema as ref_schema,
          ccu.table_name as ref_table,
          ccu.column_name as ref_column,
          rc.delete_rule as on_delete,
          rc.update_rule as on_update
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON rc.unique_constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
      `, [table])
      
      const fkMap = new Map()
      for (const fk of result.rows) {
        if (!fkMap.has(fk.name)) {
          fkMap.set(fk.name, {
            id: crypto.randomUUID(),
            name: fk.name,
            columns: [],
            refSchema: fk.ref_schema,
            refTable: fk.ref_table,
            refColumns: [],
            onDelete: fk.on_delete.replace(' ', '_'),
            onUpdate: fk.on_update.replace(' ', '_'),
          })
        }
        fkMap.get(fk.name).columns.push(fk.column_name)
        fkMap.get(fk.name).refColumns.push(fk.ref_column)
      }
      return Array.from(fkMap.values())
    }

    case 'sqlserver': {
      const result = await conn.request().query(`
        SELECT 
          fk.name as name,
          COL_NAME(fkc.parent_object_id, fkc.parent_column_id) as column_name,
          OBJECT_NAME(fk.referenced_object_id) as ref_table,
          COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) as ref_column,
          fk.delete_referential_action_desc as on_delete,
          fk.update_referential_action_desc as on_update
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
        WHERE fk.parent_object_id = OBJECT_ID('${table}')
      `)
      
      const fkMap = new Map()
      for (const fk of result.recordset) {
        if (!fkMap.has(fk.name)) {
          fkMap.set(fk.name, {
            id: crypto.randomUUID(),
            name: fk.name,
            columns: [],
            refSchema: '',
            refTable: fk.ref_table,
            refColumns: [],
            onDelete: fk.on_delete.replace('_', ' '),
            onUpdate: fk.on_update.replace('_', ' '),
          })
        }
        fkMap.get(fk.name).columns.push(fk.column_name)
        fkMap.get(fk.name).refColumns.push(fk.ref_column)
      }
      return Array.from(fkMap.values())
    }

    default:
      return []
  }
}

// 获取表选项
async function getTableOptions(conn, type, database, table) {
  switch (type) {
    case 'mysql':
    case 'mariadb': {
      const [rows] = await conn.query(`
        SELECT 
          ENGINE as engine,
          TABLE_COLLATION as collation,
          TABLE_COMMENT as comment,
          AUTO_INCREMENT as autoIncrement,
          ROW_FORMAT as rowFormat
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      `, [database, table])
      if (rows.length === 0) return {}
      const row = rows[0]
      const charset = row.collation ? row.collation.split('_')[0] : 'utf8mb4'
      return {
        engine: row.engine || 'InnoDB',
        charset,
        collation: row.collation || 'utf8mb4_general_ci',
        comment: row.comment || '',
        autoIncrement: row.autoIncrement ? String(row.autoIncrement) : '',
        rowFormat: row.rowFormat || 'DEFAULT',
      }
    }

    default:
      return {
        engine: '',
        charset: '',
        collation: '',
        comment: '',
        autoIncrement: '',
        rowFormat: '',
      }
  }
}

// 获取表的列名列表（简化版，用于外键选择）
async function getColumnNames(conn, type, database, table) {
  const columns = await getColumns(conn, type, database, table)
  return columns.map(c => c.name)
}
