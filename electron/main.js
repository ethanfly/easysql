import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import crypto from 'crypto'
import net from 'net'
import mysql from 'mysql2/promise'
import pg from 'pg'
import initSqlJs from 'sql.js'
import { MongoClient } from 'mongodb'
import Redis from 'ioredis'
import mssql from 'mssql'
import Blowfish from 'blowfish-node'
import { Client as SSHClient } from 'ssh2'
import {
  DEFAULT_GOVERNANCE_CONFIG,
  appendAuditRecord,
  appendFlashbackRecord,
  applyMaskingToResult,
  buildAuditRecord,
  buildRawSqlFlashback,
  createGovernanceRuntime,
  evaluateRawSqlOperation,
  evaluateStructuredOperation,
} from './governance/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 瀛樺偍娲诲姩鐨勬暟鎹簱杩炴帴
const connections = new Map()
// 瀛樺偍娲诲姩鐨?SSH 闅ч亾
const sshTunnels = new Map()
// 閰嶇疆鏂囦欢璺緞
const configPath = path.join(app.getPath('userData'), 'connections.json')
const governanceConfigPath = path.join(app.getPath('userData'), 'governance.json')
// SQL.js 鍒濆鍖?
let SQL = null
let governanceRuntime = null

function ensureGovernanceRuntime() {
  if (!governanceRuntime) {
    governanceRuntime = createGovernanceRuntime({
      baseDir: app.getPath('userData'),
      userDataPath: app.getPath('userData'),
      appVersion: app.getVersion(),
      config: loadGovernanceConfig(),
    })
  }

  return governanceRuntime
}

function loadGovernanceConfig() {
  try {
    if (!fs.existsSync(governanceConfigPath)) {
      return { ...DEFAULT_GOVERNANCE_CONFIG }
    }

    const data = fs.readFileSync(governanceConfigPath, 'utf-8')
    return {
      ...DEFAULT_GOVERNANCE_CONFIG,
      ...JSON.parse(data),
    }
  } catch (error) {
    console.error('[Governance] Failed to load config:', error.message)
    return { ...DEFAULT_GOVERNANCE_CONFIG }
  }
}

function saveGovernanceConfig(config) {
  const nextConfig = {
    ...DEFAULT_GOVERNANCE_CONFIG,
    ...(config || {}),
  }

  fs.writeFileSync(governanceConfigPath, JSON.stringify(nextConfig, null, 2))
  ensureGovernanceRuntime().setConfig(nextConfig)
  return nextConfig
}

// ============ SSH 闅ч亾绠＄悊 ============

/**
 * 鏌ユ壘鍙敤绔彛
 */
function findAvailablePort(startPort = 49152) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => {
      // 绔彛琚崰鐢紝灏濊瘯涓嬩竴涓?
      if (startPort < 65535) {
        resolve(findAvailablePort(startPort + 1))
      } else {
        reject(new Error('娌℃湁鍙敤绔彛'))
      }
    })
    server.listen(startPort, '127.0.0.1', () => {
      server.close(() => resolve(startPort))
    })
  })
}

/**
 * 鍒涘缓 SSH 闅ч亾
 * @param {Object} config - 杩炴帴閰嶇疆
 * @returns {Promise<{ssh, server, localPort, localHost}>}
 */
async function createSSHTunnel(config) {
  // 鍏堟壘涓€涓彲鐢ㄧ鍙?
  const localPort = await findAvailablePort()
  console.log(`[SSH] 浣跨敤鏈湴绔彛: ${localPort}`)
  
  return new Promise((resolve, reject) => {
    const ssh = new SSHClient()
    let server = null
    let connected = false
    
    ssh.on('ready', () => {
      console.log(`[SSH] 杩炴帴鎴愬姛: ${config.sshUser}@${config.sshHost}:${config.sshPort}`)
      connected = true
      
      // 鍒涘缓鏈湴 TCP 鏈嶅姟鍣ㄨ繘琛岀鍙ｈ浆鍙?
      server = net.createServer((socket) => {
        ssh.forwardOut(
          '127.0.0.1', localPort,
          config.host, config.port,
          (err, stream) => {
            if (err) {
              console.error('[SSH] 杞彂澶辫触:', err.message)
              socket.end()
              return
            }
            socket.pipe(stream).pipe(socket)
          }
        )
      })
      
      server.listen(localPort, '127.0.0.1', () => {
        console.log(`[SSH] 闅ч亾灏辩华: localhost:${localPort} 鈫?${config.host}:${config.port}`)
        resolve({ ssh, server, localPort, localHost: '127.0.0.1' })
      })
      
      server.on('error', (err) => {
        console.error('[SSH] 鏈湴鏈嶅姟鍣ㄩ敊璇?', err.message)
        ssh.end()
        reject(err)
      })
    })
    
    ssh.on('error', (err) => {
      console.error('[SSH] 杩炴帴閿欒:', err.message)
      if (!connected) reject(new Error(`SSH 杩炴帴澶辫触: ${err.message}`))
    })
    
    ssh.on('close', () => {
      console.log('[SSH] connection closed')
      if (server) server.close()
    })
    
    // 鏋勫缓 SSH 閰嶇疆
    const sshConfig = {
      host: config.sshHost,
      port: config.sshPort || 22,
      username: config.sshUser,
      readyTimeout: 10000,
      keepaliveInterval: 10000,
    }
    
    // 瀵嗙爜璁よ瘉
    if (config.sshPassword) {
      sshConfig.password = config.sshPassword
    }
    
    // 绉侀挜璁よ瘉
    if (config.sshKey) {
      try {
        if (fs.existsSync(config.sshKey)) {
          sshConfig.privateKey = fs.readFileSync(config.sshKey)
        } else if (config.sshKey.includes('-----BEGIN')) {
          sshConfig.privateKey = config.sshKey
        }
      } catch (e) {
        console.warn('[SSH] 璇诲彇绉侀挜澶辫触:', e.message)
      }
    }
    
    console.log(`[SSH] 姝ｅ湪杩炴帴: ${config.sshUser}@${config.sshHost}:${config.sshPort}`)
    ssh.connect(sshConfig)
  })
}

/**
 * 鍏抽棴 SSH 闅ч亾
 */
function closeSSHTunnel(tunnelId) {
  const tunnel = sshTunnels.get(tunnelId)
  if (tunnel) {
    try {
      if (tunnel.server) tunnel.server.close()
      if (tunnel.ssh) tunnel.ssh.end()
      console.log(`[SSH] 闅ч亾宸插叧闂? ${tunnelId}`)
    } catch (e) {
      console.error('[SSH] 鍏抽棴闅ч亾澶辫触:', e.message)
    }
    sshTunnels.delete(tunnelId)
  }
}

let mainWindow

async function initSqlite() {
  if (!SQL) {
    SQL = await initSqlJs()
  }
  return SQL
}

function createWindow() {
  // 鍒ゆ柇鏄惁涓哄紑鍙戞ā寮忥紙妫€鏌ユ槸鍚︽湁 Vite 寮€鍙戞湇鍔″櫒杩愯锛?
  const isDev = !app.isPackaged
  
  // 鍥炬爣璺緞锛堝紑鍙戝拰鐢熶骇鐜涓嶅悓锛?
  const iconPath = isDev
    ? path.join(__dirname, '../public/icon.png')
    : path.join(__dirname, '../dist/icon.png')
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: '#f8fafc', // 娴呰壊涓婚鑳屾櫙鑹?
    icon: iconPath,
    show: false, // 鍏堥殣钘忕獥鍙ｏ紝绛夊姞杞藉畬鎴愬啀鏄剧ず
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 绐楀彛鍑嗗濂藉悗鍐嶆樉绀猴紝閬垮厤鐧藉睆/榛戝睆闂儊
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 寮€鍙戞ā寮忎笅鍔犺浇 Vite 寮€鍙戞湇鍔″櫒
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // mainWindow.webContents.openDevTools()
  } else {
    // 鐢熶骇妯″紡鍔犺浇鎵撳寘鍚庣殑鏂囦欢
    const indexPath = path.join(__dirname, '../dist/index.html')
    console.log('Loading:', indexPath)
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('Failed to load index.html:', err)
    })
  }
  
  // 鍔犺浇澶辫触鏃剁殑閿欒澶勭悊
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription)
  })
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
  // 鍏抽棴鎵€鏈夋暟鎹簱杩炴帴鍜?SSH 闅ч亾
  for (const [id, connInfo] of connections) {
    try {
      closeConnection(connInfo.connection, connInfo.type, id)
    } catch (e) {
      console.error('鍏抽棴杩炴帴澶辫触:', e)
    }
  }
  connections.clear()
  
  // 娓呯悊娈嬬暀鐨?SSH 闅ч亾
  for (const [id, tunnel] of sshTunnels) {
    try {
      if (tunnel.server) tunnel.server.close()
      if (tunnel.ssh) tunnel.ssh.end()
    } catch (e) {}
  }
  sshTunnels.clear()
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ============ 绐楀彛鎺у埗 ============
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

// ============ 閰嶇疆瀛樺偍 ============
ipcMain.handle('config:load', async () => {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(data)
    }
    return []
  } catch (e) {
    console.error('鍔犺浇閰嶇疆澶辫触:', e)
    return []
  }
})

ipcMain.handle('config:save', async (event, connectionsList) => {
  try {
    fs.writeFileSync(configPath, JSON.stringify(connectionsList, null, 2))
    return { success: true }
  } catch (e) {
    console.error('淇濆瓨閰嶇疆澶辫触:', e)
    return { success: false, message: e.message }
  }
})

ipcMain.handle('governance:loadConfig', async () => {
  return loadGovernanceConfig()
})

ipcMain.handle('governance:saveConfig', async (event, config) => {
  try {
    saveGovernanceConfig(config)
    return { success: true }
  } catch (error) {
    return { success: false, message: error.message }
  }
})

ipcMain.handle('governance:listAuditLogs', async (event, filters = {}) => {
  return ensureGovernanceRuntime().listAuditRecords(filters)
})

ipcMain.handle('governance:listFlashbackLogs', async (event, filters = {}) => {
  return ensureGovernanceRuntime().listFlashbackRecords(filters)
})

ipcMain.handle('governance:getFlashbackRecord', async (event, flashbackId) => {
  return ensureGovernanceRuntime().getFlashbackRecord(flashbackId)
})

ipcMain.handle('governance:approveDecision', async (event, approval) => {
  return ensureGovernanceRuntime().approveDecision(approval)
})

// ============ 鏁版嵁搴撴搷浣?============
ipcMain.handle('db:test', async (event, config) => {
  try {
    const conn = await createConnection(config, null)
    await closeConnection(conn, config.type, null)
    const msg = config.sshEnabled ? '閫氳繃 SSH 闅ч亾杩炴帴鎴愬姛' : '杩炴帴鎴愬姛'
    return { success: true, message: msg }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('db:connect', async (event, config) => {
  try {
    const conn = await createConnection(config, config.id)
    connections.set(config.id, { connection: conn, type: config.type, config })
    const msg = config.sshEnabled ? '閫氳繃 SSH 闅ч亾杩炴帴鎴愬姛' : '杩炴帴鎴愬姛'
    return { success: true, message: msg }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('db:disconnect', async (event, id) => {
  const connInfo = connections.get(id)
  if (connInfo) {
    await closeConnection(connInfo.connection, connInfo.type, id)
    connections.delete(id)
  }
})

// 妫€鏌ヨ繛鎺ユ槸鍚︽湁鏁?
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
    console.log('杩炴帴妫€娴嬪け璐?', e.message)
    return false
  }
}

// 纭繚杩炴帴鏈夋晥锛屽鏋滄柇寮€鍒欒嚜鍔ㄩ噸杩?
async function ensureConnection(id, skipAliveCheck = false) {
  const connInfo = connections.get(id)
  if (!connInfo) {
    console.log(`[Connection] 杩炴帴涓嶅瓨鍦? id=${id}`)
    return null
  }

  // 妫€鏌?SSH 闅ч亾鏄惁鏈夋晥锛堜粎褰撳惎鐢?SSH 鏃讹級
  if (connInfo.config?.sshEnabled) {
    const tunnel = sshTunnels.get(id)
    if (!tunnel || !tunnel.ssh) {
      console.log(`[Connection] SSH 闅ч亾宸插け鏁堬紝閲嶆柊鍒涘缓...`)
      try {
        await closeConnection(connInfo.connection, connInfo.type, id)
      } catch (e) {}
      
      try {
        const newConn = await createConnection(connInfo.config, id)
        connections.set(id, { connection: newConn, type: connInfo.type, config: connInfo.config })
        console.log(`[Connection] SSH 闅ч亾閲嶅缓鎴愬姛`)
        return connections.get(id)
      } catch (e) {
        console.error(`[Connection] SSH 闅ч亾閲嶅缓澶辫触:`, e.message)
        connections.delete(id)
        return null
      }
    }
  }

  // 杩炴帴姹犵被鍨嬶紙MySQL/PostgreSQL锛夎嚜鍔ㄧ鐞嗚繛鎺ワ紝璺宠繃 alive 妫€鏌?
  // 鍙湁鍦ㄦ煡璇㈢湡姝ｅけ璐ユ椂鎵嶉渶瑕侀噸杩?
  if (skipAliveCheck) {
    return connInfo
  }

  // 闈炶繛鎺ユ睜绫诲瀷鎵嶉渶瑕佹鏌ヨ繛鎺ョ姸鎬?
  const poolTypes = ['mysql', 'mariadb', 'postgresql', 'postgres']
  if (poolTypes.includes(connInfo.type)) {
    return connInfo  // 杩炴帴姹犺嚜鍔ㄧ鐞嗭紝鐩存帴杩斿洖
  }

  // 鍏朵粬绫诲瀷妫€鏌ヨ繛鎺ユ槸鍚︽湁鏁?
  const alive = await isConnectionAlive(connInfo.connection, connInfo.type)
  
  if (!alive && connInfo.config) {
    console.log(`[Connection] 杩炴帴宸叉柇寮€锛屽皾璇曢噸鏂拌繛鎺? id=${id}`)
    try {
      try {
        await closeConnection(connInfo.connection, connInfo.type, id)
      } catch (e) {}
      
      const newConn = await createConnection(connInfo.config, id)
      connections.set(id, { connection: newConn, type: connInfo.type, config: connInfo.config })
      console.log(`[Connection] 閲嶆柊杩炴帴鎴愬姛`)
      return connections.get(id)
    } catch (e) {
      console.error(`[Connection] 閲嶆柊杩炴帴澶辫触:`, e.message)
      connections.delete(id)
      return null
    }
  }
  
  return connInfo
}

function getConnectionDisplayName(id, connInfo) {
  return connInfo?.config?.name || connInfo?.config?.connectionName || id
}

function getConnectionDatabaseName(connInfo, fallback = null) {
  return fallback || connInfo?.config?.database || connInfo?.config?.db || null
}

async function appendGovernanceAudit(input) {
  try {
    const record = buildAuditRecord(input)
    await appendAuditRecord({
      runtime: input.runtime,
      config: input.config,
      record,
    })
    return record
  } catch (error) {
    console.error('[Governance] Audit append failed:', error.message)
    return null
  }
}

async function appendGovernanceFlashback(input) {
  try {
    return await appendFlashbackRecord(input)
  } catch (error) {
    console.error('[Governance] Flashback append failed:', error.message)
    return { ok: false, error }
  }
}

function buildGovernanceResponseError(message, governance) {
  return {
    columns: [],
    rows: [],
    error: message,
    governance,
  }
}

function buildMutationGovernanceError(message, governance) {
  return {
    success: false,
    message,
    governance,
  }
}

function buildStructuredGovernancePayload(evaluation, extra = {}) {
  return {
    classification: extra.classification ?? null,
    statementType: extra.statementType ?? null,
    riskLevel: evaluation?.riskLevel ?? null,
    decision: evaluation?.decision?.decision ?? null,
    highRiskReasons: extra.highRiskReasons ?? [],
    decisionNotes: evaluation?.decision?.notes ?? [],
  }
}

function deriveStructuredRiskLevel(statementType, options = {}) {
  const normalizedType = String(statementType || '').toUpperCase()
  if (options.highRisk === true) {
    return 'high'
  }

  if (['DROP_DATABASE', 'DROP_TABLE', 'TRUNCATE_TABLE', 'DROP_COLUMN'].includes(normalizedType)) {
    return 'high'
  }

  if (['ROW_DELETE', 'ROW_UPDATE', 'ROW_INSERT', 'CREATE_TABLE', 'RENAME_TABLE', 'DUPLICATE_TABLE', 'ADD_COLUMN', 'MODIFY_COLUMN'].includes(normalizedType)) {
    return 'medium'
  }

  return 'low'
}

async function enforceStructuredGovernance(input) {
  const runtime = input.runtime ?? ensureGovernanceRuntime()
  const riskLevel = deriveStructuredRiskLevel(input.statementType, input)
  const evaluation = evaluateStructuredOperation({
    config: runtime.getConfig(),
    connectionId: input.connectionId,
    source: input.source,
    operationKind: input.operationKind,
    classification: input.classification,
    statementType: input.statementType,
    sqlText: input.sqlText,
    tableName: input.tableName,
    riskLevel,
  })
  const governance = buildStructuredGovernancePayload(evaluation, {
    classification: input.classification,
    statementType: input.statementType,
    highRiskReasons: Array.isArray(input.highRiskReasons)
      ? input.highRiskReasons
      : (riskLevel === 'high' ? [String(input.statementType || '').toLowerCase().replace(/_/g, '-')] : []),
  })

  if (evaluation.decision?.decision === 'allow') {
    return {
      blocked: false,
      runtime,
      evaluation,
      governance,
      riskLevel,
    }
  }

  await recordGovernedMutation({
    runtime,
    operationKind: input.operationKind,
    source: input.source,
    connectionId: input.connectionId,
    connectionName: input.connectionName,
    databaseType: input.databaseType,
    databaseName: input.databaseName,
    tableName: input.tableName,
    primaryKey: input.primaryKey,
    classification: input.classification,
    statementType: input.statementType,
    riskLevel,
    success: false,
    error: new Error('Governance blocked operation'),
    durationMs: Date.now() - input.startedAt,
    decision: evaluation.decision?.decision,
    highRiskReasons: governance.highRiskReasons,
    decisionNotes: evaluation.decision?.notes ?? [],
    flashbackReasonCodes: input.flashbackReasonCodes,
  })

  return {
    blocked: true,
    runtime,
    evaluation,
    governance,
    riskLevel,
    response: buildMutationGovernanceError('Governance blocked operation', governance),
  }
}

function isRetryableConnectionError(error) {
  const message = error?.message || ''
  return message.includes('closed') || message.includes('ECONNRESET') || message.includes('ETIMEDOUT')
}

async function recordGovernedMutation(input) {
  const runtime = input.runtime ?? ensureGovernanceRuntime()
  const record = await runtime.recordMutationOperation({
    operationKind: input.operationKind,
    source: input.source,
    connectionId: input.connectionId,
    connectionName: input.connectionName,
    databaseType: input.databaseType,
    databaseName: input.databaseName,
    tableName: input.tableName,
    primaryKey: input.primaryKey,
    classification: input.classification,
    statementType: input.statementType,
    riskLevel: input.riskLevel,
    decision: input.decision ?? 'allow',
    approvedByUser: input.approvedByUser === true,
    sqlText: input.sqlText ?? null,
    success: input.success === true,
    affectedRows: input.affectedRows,
    error: input.error,
    durationMs: input.durationMs,
    flashback: input.flashback,
    flashbackReasonCodes: input.flashbackReasonCodes,
    highRiskReasons: input.highRiskReasons,
    classifierNotes: input.classifierNotes,
    decisionNotes: input.decisionNotes,
  })

  if (input.flashback?.flashbackId) {
    await appendGovernanceFlashback({
      runtime,
      auditId: record.id,
      connectionId: input.connectionId,
      source: input.source,
      flashback: input.flashback,
    })
  }

  return record
}

async function getRowObjectByPrimaryKey(conn, type, database, table, primaryKey) {
  if (!primaryKey?.column) {
    return null
  }

  switch (type) {
    case 'mysql':
    case 'mariadb': {
      const [rows] = await conn.query(
        `SELECT * FROM \`${database}\`.\`${table}\` WHERE \`${primaryKey.column}\` = ? LIMIT 1`,
        [primaryKey.value]
      )
      return rows[0] || null
    }
    case 'postgresql':
    case 'postgres': {
      const result = await conn.query(
        `SELECT * FROM "${table}" WHERE "${primaryKey.column}" = $1 LIMIT 1`,
        [primaryKey.value]
      )
      return result.rows[0] || null
    }
    case 'sqlite': {
      const stmt = conn.prepare(`SELECT * FROM "${table}" WHERE "${primaryKey.column}" = ? LIMIT 1`)
      stmt.bind([primaryKey.value])
      let row = null
      if (stmt.step()) {
        row = stmt.getAsObject()
      }
      stmt.free()
      return row
    }
    case 'sqlserver': {
      const request = conn.request()
      request.input('pk', primaryKey.value)
      const result = await request.query(`SELECT TOP 1 * FROM [${table}] WHERE [${primaryKey.column}] = @pk`)
      return result.recordset?.[0] || null
    }
    case 'mongodb': {
      const db = conn.db(database)
      const { ObjectId } = await import('mongodb')
      const filter = primaryKey.column === '_id'
        ? { _id: new ObjectId(primaryKey.value) }
        : { [primaryKey.column]: primaryKey.value }
      return db.collection(table).findOne(filter)
    }
    case 'redis': {
      await conn.select(parseInt(database) || 0)
      const value = await conn.get(primaryKey.value)
      if (value === null || value === undefined) {
        return null
      }
      return {
        [primaryKey.column]: primaryKey.value,
        value,
      }
    }
    default:
      return null
  }
}

ipcMain.handle('db:query', async (event, id, sql, governanceOptions = {}) => {
  console.log('[Query] execute id=' + id)
  const connInfo = await ensureConnection(id)
  if (!connInfo) {
    console.error('[Query] missing connection id=' + id)
    return { columns: [], rows: [], error: '连接不存在或已断开，请重新连接' }
  }

  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const databaseName = getConnectionDatabaseName(connInfo)
  const governance = await runtime.beginRawSqlOperation({
    connectionId: id,
    connectionName,
    databaseType: connInfo.type,
    databaseName,
    source: 'sql-editor',
    sqlText: sql,
    approval: governanceOptions,
  })

  if (!governance.allowExecution) {
    return governance.response
  }

  try {
    const result = await executeQuery(connInfo.connection, connInfo.type, sql)
    const completed = await runtime.completeRawSqlOperation({
      auditRecord: governance.auditRecord,
      result,
      durationMs: Date.now() - startedAt,
    })
    return completed.result
  } catch (error) {
    console.error('[Query] failed:', error.message)
    if (isRetryableConnectionError(error)) {
      console.log('[Query] retrying after reconnect')
      const newConnInfo = await ensureConnection(id)
      if (newConnInfo) {
        try {
          const retried = await executeQuery(newConnInfo.connection, newConnInfo.type, sql)
          const completed = await runtime.completeRawSqlOperation({
            auditRecord: governance.auditRecord,
            result: retried,
            durationMs: Date.now() - startedAt,
          })
          return completed.result
        } catch (retryError) {
          const failed = await runtime.failRawSqlOperation({
            auditRecord: governance.auditRecord,
            error: retryError,
            durationMs: Date.now() - startedAt,
          })
          return failed.result
        }
      }
    }

    const failed = await runtime.failRawSqlOperation({
      auditRecord: governance.auditRecord,
      error,
      durationMs: Date.now() - startedAt,
    })
    return failed.result
  }
})

ipcMain.handle('db:getDatabases', async (event, id) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return []

  try {
    return await getDatabases(connInfo.connection, connInfo.type)
  } catch (e) {
    console.error('鑾峰彇鏁版嵁搴撳垪琛ㄥけ璐?', e)
    return []
  }
})

ipcMain.handle('db:getTables', async (event, id, database) => {
  console.log(`[Tables] 鑾峰彇琛ㄥ垪琛? id=${id}, database=${database}`)
  const connInfo = await ensureConnection(id)
  if (!connInfo) {
    console.error(`[Tables] 杩炴帴涓嶅瓨鍦? id=${id}`)
    return []
  }

  try {
    const tables = await getTables(connInfo.connection, connInfo.type, database)
    console.log(`[Tables] 鑾峰彇鎴愬姛: ${tables.length} 涓〃`)
    return tables
  } catch (e) {
    console.error('[Tables] 鑾峰彇琛ㄥ垪琛ㄥけ璐?', e.message)
    return []
  }
})

ipcMain.handle('db:getColumns', async (event, id, database, table) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) {
    console.error(`[Columns] 杩炴帴涓嶅瓨鍦? id=${id}`)
    return []
  }

  try {
    return await getColumns(connInfo.connection, connInfo.type, database, table)
  } catch (e) {
    console.error('[Columns] 鑾峰彇鍒椾俊鎭け璐?', e.message)
    return []
  }
})

ipcMain.handle('db:getTableData', async (event, id, database, table, page, pageSize) => {
  console.log('[TableData] load id=' + id + ' db=' + database + ' table=' + table)
  const connInfo = await ensureConnection(id)
  if (!connInfo) {
    console.error('[TableData] missing connection id=' + id)
    return { columns: [], rows: [], total: 0, page, pageSize }
  }

  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)

  try {
    const result = await getTableData(connInfo.connection, connInfo.type, database, table, page, pageSize)
    const masked = runtime.applyMaskingToTableData(result)
    await recordGovernedMutation({
      runtime,
      operationKind: 'table-browse',
      source: 'table-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName: table,
      classification: 'DQL',
      statementType: 'SELECT',
      riskLevel: 'low',
      success: true,
      affectedRows: masked.rows?.length ?? null,
      durationMs: Date.now() - startedAt,
      classifierNotes: ['table-browse'],
    })
    return masked
  } catch (error) {
    console.error('[TableData] failed:', error.message)
    await recordGovernedMutation({
      runtime,
      operationKind: 'table-browse',
      source: 'table-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName: table,
      classification: 'DQL',
      statementType: 'SELECT',
      riskLevel: 'low',
      success: false,
      error,
      durationMs: Date.now() - startedAt,
      classifierNotes: ['table-browse'],
    })
    return { columns: [], rows: [], total: 0, page, pageSize }
  }
})

ipcMain.handle('db:updateRow', async (event, id, database, table, primaryKey, updates) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开，请重新连接' }
  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const enforcement = await enforceStructuredGovernance({
    runtime,
    startedAt,
    operationKind: 'row-update',
    source: 'table-editor',
    connectionId: id,
    connectionName,
    databaseType: connInfo.type,
    databaseName: database,
    tableName: table,
    primaryKey,
    classification: 'DML',
    statementType: 'ROW_UPDATE',
    flashbackReasonCodes: ['flashback-not-supported'],
  })
  if (enforcement.blocked) {
    return enforcement.response
  }
  const beforeImage = await getRowObjectByPrimaryKey(connInfo.connection, connInfo.type, database, table, primaryKey)
  const flashback = beforeImage
    ? runtime.buildRowUpdateFlashback({
        databaseName: database,
        tableName: table,
        primaryKey: primaryKey.column,
        beforeImage,
      })
    : null
  try {
    await updateRow(connInfo.connection, connInfo.type, database, table, primaryKey, updates)
    const auditRecord = await recordGovernedMutation({
      runtime,
      operationKind: 'row-update',
      source: 'table-editor',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName: table,
      primaryKey,
      classification: 'DML',
      statementType: 'UPDATE',
      riskLevel: enforcement.riskLevel,
      success: true,
      affectedRows: 1,
      durationMs: Date.now() - startedAt,
      flashback,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
    })
    return { success: true, message: '更新成功', governance: auditRecord ? { ...enforcement.governance, flashback: auditRecord.flashback } : enforcement.governance }
  } catch (error) {
    await recordGovernedMutation({
      runtime,
      operationKind: 'row-update',
      source: 'table-editor',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName: table,
      primaryKey,
      classification: 'DML',
      statementType: 'UPDATE',
      riskLevel: enforcement.riskLevel,
      success: false,
      error,
      durationMs: Date.now() - startedAt,
      flashback,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
    })
    return { success: false, message: error.message }
  }
})

ipcMain.handle('db:deleteRow', async (event, id, database, table, primaryKey) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '连接不存在或已断开，请重新连接' }
  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const enforcement = await enforceStructuredGovernance({
    runtime,
    startedAt,
    operationKind: 'row-delete',
    source: 'table-editor',
    connectionId: id,
    connectionName,
    databaseType: connInfo.type,
    databaseName: database,
    tableName: table,
    primaryKey,
    classification: 'DML',
    statementType: 'ROW_DELETE',
    highRiskReasons: ['row-delete'],
    flashbackReasonCodes: ['flashback-not-supported'],
  })
  if (enforcement.blocked) {
    return enforcement.response
  }
  const beforeImage = await getRowObjectByPrimaryKey(connInfo.connection, connInfo.type, database, table, primaryKey)
  const flashback = beforeImage
    ? runtime.buildRowDeleteFlashback({
        databaseName: database,
        tableName: table,
        primaryKey: primaryKey.column,
        beforeImage,
      })
    : null
  try {
    await deleteRow(connInfo.connection, connInfo.type, database, table, primaryKey)
    const auditRecord = await recordGovernedMutation({
      runtime,
      operationKind: 'row-delete',
      source: 'table-editor',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName: table,
      primaryKey,
      classification: 'DML',
      statementType: 'DELETE',
      riskLevel: enforcement.riskLevel,
      success: true,
      affectedRows: 1,
      durationMs: Date.now() - startedAt,
      flashback,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
    })
    return { success: true, message: '删除成功', governance: auditRecord ? { ...enforcement.governance, flashback: auditRecord.flashback } : enforcement.governance }
  } catch (error) {
    await recordGovernedMutation({
      runtime,
      operationKind: 'row-delete',
      source: 'table-editor',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName: table,
      primaryKey,
      classification: 'DML',
      statementType: 'DELETE',
      riskLevel: enforcement.riskLevel,
      success: false,
      error,
      durationMs: Date.now() - startedAt,
      flashback,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
    })
    return { success: false, message: error.message }
  }
})

ipcMain.handle('db:insertRow', async (event, id, database, table, columns, values) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '杩炴帴涓嶅瓨鍦ㄦ垨宸叉柇寮€锛岃閲嶆柊杩炴帴' }
  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const enforcement = await enforceStructuredGovernance({
    runtime,
    startedAt,
    operationKind: 'row-insert',
    source: 'table-editor',
    connectionId: id,
    connectionName,
    databaseType: connInfo.type,
    databaseName: database,
    tableName: table,
    classification: 'DML',
    statementType: 'ROW_INSERT',
    flashbackReasonCodes: ['insert-flashback-not-supported'],
  })
  if (enforcement.blocked) {
    return enforcement.response
  }

  try {
    const result = await insertRow(connInfo.connection, connInfo.type, database, table, columns, values)
    await recordGovernedMutation({
      runtime,
      operationKind: 'row-insert',
      source: 'table-editor',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName: table,
      classification: 'DML',
      statementType: 'INSERT',
      riskLevel: enforcement.riskLevel,
      success: true,
      affectedRows: 1,
      durationMs: Date.now() - startedAt,
      flashbackReasonCodes: ['insert-flashback-not-supported'],
      classifierNotes: ['table-insert'],
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
    })
    return { success: true, message: '插入成功', insertId: result?.insertId, governance: enforcement.governance }
  } catch (error) {
    await recordGovernedMutation({
      runtime,
      operationKind: 'row-insert',
      source: 'table-editor',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName: table,
      classification: 'DML',
      statementType: 'INSERT',
      riskLevel: enforcement.riskLevel,
      success: false,
      error,
      durationMs: Date.now() - startedAt,
      flashbackReasonCodes: ['insert-flashback-not-supported'],
      classifierNotes: ['table-insert'],
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
    })
    return { success: false, message: error.message }
  }
})

// ============ 鏁版嵁搴撶鐞嗘搷浣?============

// 鍒涘缓鏁版嵁搴?
ipcMain.handle('db:createDatabase', async (event, id, dbName, charset = 'utf8mb4', collation = 'utf8mb4_general_ci') => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '杩炴帴涓嶅瓨鍦ㄦ垨宸叉柇寮€' }

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
        // MongoDB 浼氬湪棣栨鎻掑叆鏃惰嚜鍔ㄥ垱寤烘暟鎹簱
        await connInfo.connection.db(dbName).createCollection('_init_')
        await connInfo.connection.db(dbName).dropCollection('_init_')
        break
      default:
        return { success: false, message: '璇ユ暟鎹簱绫诲瀷涓嶆敮鎸佹鎿嶄綔' }
    }
    return { success: true, message: '数据库创建成功' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// 鍒犻櫎鏁版嵁搴?
ipcMain.handle('db:dropDatabase', async (event, id, dbName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '杩炴帴涓嶅瓨鍦ㄦ垨宸叉柇寮€' }
  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const enforcement = await enforceStructuredGovernance({
    runtime,
    startedAt,
    operationKind: 'drop-database',
    source: 'schema-browser',
    connectionId: id,
    connectionName,
    databaseType: connInfo.type,
    databaseName: dbName,
    classification: 'DDL',
    statementType: 'DROP_DATABASE',
    highRiskReasons: ['drop-database'],
    flashbackReasonCodes: ['schema-operation-not-supported'],
  })
  if (enforcement.blocked) {
    return enforcement.response
  }

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
        return { success: false, message: '璇ユ暟鎹簱绫诲瀷涓嶆敮鎸佹鎿嶄綔' }
    }
    await recordGovernedMutation({
      runtime,
      operationKind: 'drop-database',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: dbName,
      classification: 'DDL',
      statementType: 'DROP_DATABASE',
      riskLevel: enforcement.riskLevel,
      success: true,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      highRiskReasons: ['drop-database'],
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: true, message: '数据库删除成功', governance: enforcement.governance }
  } catch (e) {
    await recordGovernedMutation({
      runtime,
      operationKind: 'drop-database',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: dbName,
      classification: 'DDL',
      statementType: 'DROP_DATABASE',
      riskLevel: enforcement.riskLevel,
      success: false,
      error: e,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      highRiskReasons: ['drop-database'],
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: false, message: e.message }
  }
})

// ============ 琛ㄧ鐞嗘搷浣?============

// 鍒涘缓琛?
ipcMain.handle('db:createTable', async (event, id, database, tableName, columns) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '杩炴帴涓嶅瓨鍦ㄦ垨宸叉柇寮€' }
  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const enforcement = await enforceStructuredGovernance({
    runtime,
    startedAt,
    operationKind: 'create-table',
    source: 'schema-browser',
    connectionId: id,
    connectionName,
    databaseType: connInfo.type,
    databaseName: database,
    tableName,
    classification: 'DDL',
    statementType: 'CREATE_TABLE',
    flashbackReasonCodes: ['schema-operation-not-supported'],
  })
  if (enforcement.blocked) {
    return enforcement.response
  }

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
        return { success: false, message: '璇ユ暟鎹簱绫诲瀷涓嶆敮鎸佹鎿嶄綔' }
    }
    await recordGovernedMutation({
      runtime,
      operationKind: 'create-table',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'CREATE_TABLE',
      riskLevel: enforcement.riskLevel,
      success: true,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: true, message: '表创建成功', governance: enforcement.governance }
  } catch (e) {
    await recordGovernedMutation({
      runtime,
      operationKind: 'create-table',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'CREATE_TABLE',
      riskLevel: enforcement.riskLevel,
      success: false,
      error: e,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: false, message: e.message }
  }
})

// 鍒犻櫎琛?
ipcMain.handle('db:dropTable', async (event, id, database, tableName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '杩炴帴涓嶅瓨鍦ㄦ垨宸叉柇寮€' }
  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const evaluation = evaluateStructuredOperation({
    config: runtime.getConfig(),
    connectionId: id,
    source: 'schema-browser',
    operationKind: 'drop-table',
    classification: 'DDL',
    statementType: 'DROP_TABLE',
    riskLevel: 'high',
    tableName,
  })
  const governance = buildStructuredGovernancePayload(evaluation, {
    classification: 'DDL',
    statementType: 'DROP_TABLE',
    highRiskReasons: ['drop-table'],
  })

  if (evaluation.decision?.decision !== 'allow') {
    await recordGovernedMutation({
      runtime,
      operationKind: 'drop-table',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'DROP_TABLE',
      riskLevel: evaluation.riskLevel,
      success: false,
      error: new Error('Governance blocked operation'),
      durationMs: Date.now() - startedAt,
      decision: evaluation.decision?.decision,
      highRiskReasons: ['drop-table'],
      decisionNotes: evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return buildMutationGovernanceError('Governance blocked operation', governance)
  }

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
        return { success: false, message: '璇ユ暟鎹簱绫诲瀷涓嶆敮鎸佹鎿嶄綔' }
    }
    const auditRecord = await recordGovernedMutation({
      runtime,
      operationKind: 'drop-table',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'DROP_TABLE',
      riskLevel: evaluation.riskLevel,
      success: true,
      durationMs: Date.now() - startedAt,
      highRiskReasons: ['drop-table'],
      decisionNotes: evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: true, message: '表删除成功', governance: auditRecord ? { flashback: auditRecord.flashback } : null }
  } catch (error) {
    await recordGovernedMutation({
      runtime,
      operationKind: 'drop-table',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'DROP_TABLE',
      riskLevel: evaluation.riskLevel,
      success: false,
      error,
      durationMs: Date.now() - startedAt,
      highRiskReasons: ['drop-table'],
      decisionNotes: evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: false, message: error.message }
  }
})

// 娓呯┖琛?
ipcMain.handle('db:truncateTable', async (event, id, database, tableName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '杩炴帴涓嶅瓨鍦ㄦ垨宸叉柇寮€' }
  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const evaluation = evaluateStructuredOperation({
    config: runtime.getConfig(),
    connectionId: id,
    source: 'schema-browser',
    operationKind: 'truncate-table',
    classification: 'DDL',
    statementType: 'TRUNCATE_TABLE',
    riskLevel: 'high',
    tableName,
  })
  const governance = buildStructuredGovernancePayload(evaluation, {
    classification: 'DDL',
    statementType: 'TRUNCATE_TABLE',
    highRiskReasons: ['truncate-table'],
  })

  if (evaluation.decision?.decision !== 'allow') {
    await recordGovernedMutation({
      runtime,
      operationKind: 'truncate-table',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'TRUNCATE_TABLE',
      riskLevel: evaluation.riskLevel,
      success: false,
      error: new Error('Governance blocked operation'),
      durationMs: Date.now() - startedAt,
      decision: evaluation.decision?.decision,
      highRiskReasons: ['truncate-table'],
      decisionNotes: evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return buildMutationGovernanceError('Governance blocked operation', governance)
  }

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
        return { success: false, message: '璇ユ暟鎹簱绫诲瀷涓嶆敮鎸佹鎿嶄綔' }
    }
    const auditRecord = await recordGovernedMutation({
      runtime,
      operationKind: 'truncate-table',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'TRUNCATE_TABLE',
      riskLevel: evaluation.riskLevel,
      success: true,
      durationMs: Date.now() - startedAt,
      highRiskReasons: ['truncate-table'],
      decisionNotes: evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: true, message: '表已清空', governance: auditRecord ? { flashback: auditRecord.flashback } : null }
  } catch (error) {
    await recordGovernedMutation({
      runtime,
      operationKind: 'truncate-table',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'TRUNCATE_TABLE',
      riskLevel: evaluation.riskLevel,
      success: false,
      error,
      durationMs: Date.now() - startedAt,
      highRiskReasons: ['truncate-table'],
      decisionNotes: evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: false, message: error.message }
  }
})

// 閲嶅懡鍚嶈〃
ipcMain.handle('db:renameTable', async (event, id, database, oldName, newName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '杩炴帴涓嶅瓨鍦ㄦ垨宸叉柇寮€' }
  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const enforcement = await enforceStructuredGovernance({
    runtime,
    startedAt,
    operationKind: 'rename-table',
    source: 'schema-browser',
    connectionId: id,
    connectionName,
    databaseType: connInfo.type,
    databaseName: database,
    tableName: oldName,
    classification: 'DDL',
    statementType: 'RENAME_TABLE',
    flashbackReasonCodes: ['schema-operation-not-supported'],
  })
  if (enforcement.blocked) {
    return enforcement.response
  }

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
        return { success: false, message: '璇ユ暟鎹簱绫诲瀷涓嶆敮鎸佹鎿嶄綔' }
    }
    await recordGovernedMutation({
      runtime,
      operationKind: 'rename-table',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName: oldName,
      classification: 'DDL',
      statementType: 'RENAME_TABLE',
      riskLevel: enforcement.riskLevel,
      success: true,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: true, message: '琛ㄩ噸鍛藉悕鎴愬姛', governance: enforcement.governance }
  } catch (e) {
    await recordGovernedMutation({
      runtime,
      operationKind: 'rename-table',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName: oldName,
      classification: 'DDL',
      statementType: 'RENAME_TABLE',
      riskLevel: enforcement.riskLevel,
      success: false,
      error: e,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: false, message: e.message }
  }
})

// 澶嶅埗琛ㄧ粨鏋?
ipcMain.handle('db:duplicateTable', async (event, id, database, sourceTable, newTable, withData = false) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '杩炴帴涓嶅瓨鍦ㄦ垨宸叉柇寮€' }
  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const enforcement = await enforceStructuredGovernance({
    runtime,
    startedAt,
    operationKind: 'duplicate-table',
    source: 'schema-browser',
    connectionId: id,
    connectionName,
    databaseType: connInfo.type,
    databaseName: database,
    tableName: sourceTable,
    classification: 'DDL',
    statementType: 'DUPLICATE_TABLE',
    flashbackReasonCodes: ['schema-operation-not-supported'],
  })
  if (enforcement.blocked) {
    return enforcement.response
  }

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
        return { success: false, message: '璇ユ暟鎹簱绫诲瀷涓嶆敮鎸佹鎿嶄綔' }
    }
    await recordGovernedMutation({
      runtime,
      operationKind: 'duplicate-table',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName: sourceTable,
      classification: 'DDL',
      statementType: 'DUPLICATE_TABLE',
      riskLevel: enforcement.riskLevel,
      success: true,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: true, message: '表复制成功', governance: enforcement.governance }
  } catch (e) {
    await recordGovernedMutation({
      runtime,
      operationKind: 'duplicate-table',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName: sourceTable,
      classification: 'DDL',
      statementType: 'DUPLICATE_TABLE',
      riskLevel: enforcement.riskLevel,
      success: false,
      error: e,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: false, message: e.message }
  }
})

// 娣诲姞鍒?
ipcMain.handle('db:addColumn', async (event, id, database, tableName, column) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '杩炴帴涓嶅瓨鍦ㄦ垨宸叉柇寮€' }
  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const enforcement = await enforceStructuredGovernance({
    runtime,
    startedAt,
    operationKind: 'add-column',
    source: 'schema-browser',
    connectionId: id,
    connectionName,
    databaseType: connInfo.type,
    databaseName: database,
    tableName,
    classification: 'DDL',
    statementType: 'ADD_COLUMN',
    flashbackReasonCodes: ['schema-operation-not-supported'],
  })
  if (enforcement.blocked) {
    return enforcement.response
  }

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
        return { success: false, message: '璇ユ暟鎹簱绫诲瀷涓嶆敮鎸佹鎿嶄綔' }
    }
    await recordGovernedMutation({
      runtime,
      operationKind: 'add-column',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'ADD_COLUMN',
      riskLevel: enforcement.riskLevel,
      success: true,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: true, message: '列添加成功', governance: enforcement.governance }
  } catch (e) {
    await recordGovernedMutation({
      runtime,
      operationKind: 'add-column',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'ADD_COLUMN',
      riskLevel: enforcement.riskLevel,
      success: false,
      error: e,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: false, message: e.message }
  }
})

// 淇敼鍒?
ipcMain.handle('db:modifyColumn', async (event, id, database, tableName, oldName, column) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '杩炴帴涓嶅瓨鍦ㄦ垨宸叉柇寮€' }
  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const enforcement = await enforceStructuredGovernance({
    runtime,
    startedAt,
    operationKind: 'modify-column',
    source: 'schema-browser',
    connectionId: id,
    connectionName,
    databaseType: connInfo.type,
    databaseName: database,
    tableName,
    classification: 'DDL',
    statementType: 'MODIFY_COLUMN',
    flashbackReasonCodes: ['schema-operation-not-supported'],
  })
  if (enforcement.blocked) {
    return enforcement.response
  }

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
        // PostgreSQL 闇€瑕佸鏉¤鍙?
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
        return { success: false, message: '璇ユ暟鎹簱绫诲瀷涓嶆敮鎸佹鎿嶄綔' }
    }
    await recordGovernedMutation({
      runtime,
      operationKind: 'modify-column',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'MODIFY_COLUMN',
      riskLevel: enforcement.riskLevel,
      success: true,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: true, message: '列修改成功', governance: enforcement.governance }
  } catch (e) {
    await recordGovernedMutation({
      runtime,
      operationKind: 'modify-column',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'MODIFY_COLUMN',
      riskLevel: enforcement.riskLevel,
      success: false,
      error: e,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: false, message: e.message }
  }
})

// 鍒犻櫎鍒?
ipcMain.handle('db:dropColumn', async (event, id, database, tableName, columnName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '杩炴帴涓嶅瓨鍦ㄦ垨宸叉柇寮€' }
  const runtime = ensureGovernanceRuntime()
  const startedAt = Date.now()
  const connectionName = getConnectionDisplayName(id, connInfo)
  const enforcement = await enforceStructuredGovernance({
    runtime,
    startedAt,
    operationKind: 'drop-column',
    source: 'schema-browser',
    connectionId: id,
    connectionName,
    databaseType: connInfo.type,
    databaseName: database,
    tableName,
    classification: 'DDL',
    statementType: 'DROP_COLUMN',
    highRiskReasons: ['drop-column'],
    flashbackReasonCodes: ['schema-operation-not-supported'],
  })
  if (enforcement.blocked) {
    return enforcement.response
  }

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
        // SQLite 涓嶆敮鎸佺洿鎺ュ垹闄ゅ垪锛岄渶瑕侀噸寤鸿〃
        return { success: false, message: 'SQLite 涓嶆敮鎸佸垹闄ゅ垪鎿嶄綔' }
      default:
        return { success: false, message: '璇ユ暟鎹簱绫诲瀷涓嶆敮鎸佹鎿嶄綔' }
    }
    await recordGovernedMutation({
      runtime,
      operationKind: 'drop-column',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'DROP_COLUMN',
      riskLevel: enforcement.riskLevel,
      success: true,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      highRiskReasons: ['drop-column'],
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: true, message: '列删除成功', governance: enforcement.governance }
  } catch (e) {
    await recordGovernedMutation({
      runtime,
      operationKind: 'drop-column',
      source: 'schema-browser',
      connectionId: id,
      connectionName,
      databaseType: connInfo.type,
      databaseName: database,
      tableName,
      classification: 'DDL',
      statementType: 'DROP_COLUMN',
      riskLevel: enforcement.riskLevel,
      success: false,
      error: e,
      durationMs: Date.now() - startedAt,
      decision: enforcement.evaluation.decision?.decision,
      highRiskReasons: ['drop-column'],
      decisionNotes: enforcement.evaluation.decision?.notes ?? [],
      flashbackReasonCodes: ['schema-operation-not-supported'],
    })
    return { success: false, message: e.message }
  }
})

// ============ 琛ㄨ璁″櫒鐩稿叧鎿嶄綔 ============

// 鑾峰彇瀹屾暣鐨勮〃淇℃伅锛堝瓧娈点€佺储寮曘€佸閿€侀€夐」锛?
ipcMain.handle('db:getTableInfo', async (event, id, database, tableName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { columns: [], indexes: [], foreignKeys: [], options: {} }

  try {
    return await getTableInfo(connInfo.connection, connInfo.type, database, tableName)
  } catch (e) {
    console.error('鑾峰彇琛ㄤ俊鎭け璐?', e)
    return { columns: [], indexes: [], foreignKeys: [], options: {} }
  }
})

// 鑾峰彇绱㈠紩
ipcMain.handle('db:getIndexes', async (event, id, database, tableName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return []

  try {
    return await getIndexes(connInfo.connection, connInfo.type, database, tableName)
  } catch (e) {
    console.error('鑾峰彇绱㈠紩澶辫触:', e)
    return []
  }
})

// 鑾峰彇澶栭敭
ipcMain.handle('db:getForeignKeys', async (event, id, database, tableName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return []

  try {
    return await getForeignKeys(connInfo.connection, connInfo.type, database, tableName)
  } catch (e) {
    console.error('鑾峰彇澶栭敭澶辫触:', e)
    return []
  }
})

// 鑾峰彇琛ㄧ殑鍒楀悕锛堢畝鍖栫増锛岀敤浜庡閿€夋嫨锛?
ipcMain.handle('db:getColumnNames', async (event, id, database, tableName) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return []

  try {
    return await getColumnNames(connInfo.connection, connInfo.type, database, tableName)
  } catch (e) {
    console.error('鑾峰彇鍒楀悕澶辫触:', e)
    return []
  }
})

// 鎵ц澶氭潯 SQL锛堢敤浜庤〃璁捐鍣ㄤ繚瀛橈級
ipcMain.handle('db:executeMultiSQL', async (event, id, sqls) => {
  const connInfo = await ensureConnection(id)
  if (!connInfo) return { success: false, message: '杩炴帴涓嶅瓨鍦ㄦ垨宸叉柇寮€' }

  try {
    // 灏?SQL 璇彞鎸夊垎鍙峰垎鍓插苟閫愭潯鎵ц
    const statements = sqls.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'))
    
    for (const sql of statements) {
      await executeQuery(connInfo.connection, connInfo.type, sql)
    }
    
    return { success: true, message: '鎵ц鎴愬姛' }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

// ============ 鏂囦欢鎿嶄綔 ============
ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'SQL 鏂囦欢', extensions: ['sql'] }],
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
      filters: [{ name: 'SQL 鏂囦欢', extensions: ['sql'] }]
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
    filters: extensions ? [{ name: '数据文件', extensions }] : undefined,
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

// ============ Navicat 瀵嗙爜瑙ｅ瘑 ============
// 鏀寔 Navicat 11 鍜?Navicat 12+ 鐨勫瘑鐮佽В瀵?
ipcMain.handle('crypto:decryptNavicatPassword', async (event, encryptedPassword, version = 12) => {
  try {
    if (!encryptedPassword) return ''
    
    // 灏濊瘯鎵€鏈夎В瀵嗘柟娉?
    let result = ''
    
    // 棣栧厛灏濊瘯 Navicat 12+ (AES-128-CBC)
    result = decryptNavicat12(encryptedPassword)
    if (result && isPrintableString(result)) {
      console.log('Navicat 12 AES 瑙ｅ瘑鎴愬姛')
      return result
    }
    
    // 灏濊瘯 Navicat 11 (Blowfish/XOR)
    result = decryptNavicat11(encryptedPassword)
    if (result && isPrintableString(result)) {
      console.log('Navicat 11 瑙ｅ瘑鎴愬姛')
      return result
    }
    
    // 濡傛灉閮藉け璐ワ紝杩斿洖绌哄瓧绗︿覆
    console.warn('鎵€鏈夎В瀵嗘柟娉曢兘澶辫触锛屽瘑鐮佸彲鑳戒娇鐢ㄤ簡涓嶆敮鎸佺殑鍔犲瘑鏂瑰紡')
    return ''
  } catch (e) {
    console.error('Navicat 瀵嗙爜瑙ｅ瘑澶辫触:', e.message)
    return ''
  }
})

// 妫€鏌ュ瓧绗︿覆鏄惁涓哄彲鎵撳嵃瀛楃
function isPrintableString(str) {
  if (!str || str.length === 0) return false
  // 妫€鏌ユ槸鍚﹀寘鍚悎鐞嗙殑鍙墦鍗板瓧绗?
  return /^[\x20-\x7E\u4e00-\u9fa5]+$/.test(str)
}

// Navicat 12+ AES-128-CBC 瑙ｅ瘑
function decryptNavicat12(encryptedPassword) {
  // Navicat 12 浣跨敤 AES-128-CBC
  // 瀵嗛挜: libcckeylibcckey (16 bytes)
  // IV: 澶氱鍙兘鐨勬牸寮?
  
  try {
    const encryptedBuffer = Buffer.from(encryptedPassword, 'hex')
    
    if (encryptedBuffer.length === 0) {
      return ''
    }
    
    // 灏濊瘯澶氱鍙兘鐨勫瘑閽ュ拰 IV 缁勫悎
    const attempts = [
      // 缁勫悎 1: IV 浣滀负 UTF-8 瀛楃涓?
      { key: 'libcckeylibcckey', iv: Buffer.from('d0288c8e24342312', 'utf8') },
      // 缁勫悎 2: IV 閲嶅涓ゆ鐨勫崄鍏繘鍒?
      { key: 'libcckeylibcckey', iv: Buffer.from('d0288c8e24342312d0288c8e24342312', 'hex') },
      // 缁勫悎 3: 瀛楄妭鏁扮粍 IV
      { key: 'libcckeylibcckey', iv: Buffer.from([0xD0, 0x28, 0x8C, 0x8E, 0x24, 0x34, 0x23, 0x12, 0xD0, 0x28, 0x8C, 0x8E, 0x24, 0x34, 0x23, 0x12]) },
      // 缁勫悎 4: 鍏ㄩ浂 IV
      { key: 'libcckeylibcckey', iv: Buffer.alloc(16, 0) },
      // 缁勫悎 5: libcciv 浣滀负 IV
      { key: 'libcckeylibcckey', iv: Buffer.from('libcciv libcciv ', 'utf8') },
      // 缁勫悎 6: 鍙嶅悜瀛楄妭搴?
      { key: 'libcckeylibcckey', iv: Buffer.from([0x12, 0x23, 0x34, 0x24, 0x8E, 0x8C, 0x28, 0xD0, 0x12, 0x23, 0x34, 0x24, 0x8E, 0x8C, 0x28, 0xD0]) },
    ]
    
    for (const attempt of attempts) {
      try {
        const keyBuffer = Buffer.from(attempt.key, 'utf8')
        const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuffer, attempt.iv)
        decipher.setAutoPadding(true)
        
        const decrypted = Buffer.concat([
          decipher.update(encryptedBuffer),
          decipher.final()
        ])
        
        const result = decrypted.toString('utf8').replace(/\0+$/, '')
        if (result && isPrintableString(result)) {
          return result
        }
      } catch (e) {
        // 缁х画灏濊瘯涓嬩竴涓粍鍚?
      }
      
      // 灏濊瘯鍏抽棴鑷姩濉厖
      try {
        const keyBuffer = Buffer.from(attempt.key, 'utf8')
        const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuffer, attempt.iv)
        decipher.setAutoPadding(false)
        
        let decrypted = Buffer.concat([
          decipher.update(encryptedBuffer),
          decipher.final()
        ])
        
        // 鎵嬪姩绉婚櫎濉厖
        const paddingLen = decrypted[decrypted.length - 1]
        if (paddingLen > 0 && paddingLen <= 16) {
          // 楠岃瘉濉厖鏄惁姝ｇ‘
          let validPadding = true
          for (let i = 0; i < paddingLen; i++) {
            if (decrypted[decrypted.length - 1 - i] !== paddingLen) {
              validPadding = false
              break
            }
          }
          if (validPadding) {
            decrypted = decrypted.slice(0, -paddingLen)
          }
        }
        
        const result = decrypted.toString('utf8').replace(/\0+$/, '')
        if (result && isPrintableString(result)) {
          return result
        }
      } catch (e) {
        // 缁х画灏濊瘯涓嬩竴涓粍鍚?
      }
    }
    
    return ''
  } catch (e) {
    return ''
  }
}

// Navicat 11 瑙ｅ瘑 - 浣跨敤 Blowfish ECB
function decryptNavicat11(encryptedPassword) {
  try {
    const encryptedBuffer = Buffer.from(encryptedPassword, 'hex')
    
    if (encryptedBuffer.length === 0) {
      return ''
    }
    
    // 鏂规硶 1: 浣跨敤 Blowfish ECB 妯″紡
    // Navicat 11 瀵嗛挜鏄?SHA1("3DC5CA39") 鐨勫墠 8 瀛楄妭
    const keyStr = '3DC5CA39'
    const sha1Key = crypto.createHash('sha1').update(keyStr).digest()
    const blowfishKey = sha1Key.slice(0, 8)
    
    try {
      const bf = new Blowfish(blowfishKey, Blowfish.MODE.ECB, Blowfish.PADDING.NULL)
      const decrypted = bf.decode(encryptedBuffer, Blowfish.TYPE.UINT8_ARRAY)
      const result = Buffer.from(decrypted).toString('utf8').replace(/\0+$/, '')
      if (result && isPrintableString(result)) {
        console.log('Blowfish ECB 瑙ｅ瘑鎴愬姛')
        return result
      }
    } catch (e) {
      // 缁х画灏濊瘯鍏朵粬鏂规硶
    }
    
    // 鏂规硶 2: 鐩存帴浣跨敤瀵嗛挜瀛楃涓蹭綔涓?Blowfish 瀵嗛挜
    try {
      const bf = new Blowfish(keyStr, Blowfish.MODE.ECB, Blowfish.PADDING.NULL)
      const decrypted = bf.decode(encryptedBuffer, Blowfish.TYPE.UINT8_ARRAY)
      const result = Buffer.from(decrypted).toString('utf8').replace(/\0+$/, '')
      if (result && isPrintableString(result)) {
        console.log('Blowfish ECB (direct key) 瑙ｅ瘑鎴愬姛')
        return result
      }
    } catch (e) {
      // 缁х画灏濊瘯鍏朵粬鏂规硶
    }
    
    // 鏂规硶 3: XOR 瑙ｅ瘑锛堜綔涓哄悗澶囷級
    const sha1Hash = crypto.createHash('sha1').update(keyStr).digest()
    let result = Buffer.alloc(encryptedBuffer.length)
    for (let i = 0; i < encryptedBuffer.length; i++) {
      result[i] = encryptedBuffer[i] ^ sha1Hash[i % sha1Hash.length]
    }
    
    let decrypted = result.toString('utf8').replace(/\0+$/, '')
    if (decrypted && isPrintableString(decrypted)) {
      return decrypted
    }
    
    // 鏂规硶 4: Navicat 鐗瑰畾鐨?XOR 搴忓垪
    result = navicatXorDecrypt(encryptedBuffer)
    decrypted = result.toString('utf8').replace(/\0+$/, '')
    if (decrypted && isPrintableString(decrypted)) {
      return decrypted
    }
    
    return ''
  } catch (e) {
    console.error('Navicat 11 瑙ｅ瘑閿欒:', e.message)
    return ''
  }
}

// Navicat 鐗瑰畾鐨?XOR 瑙ｅ瘑绠楁硶
function navicatXorDecrypt(encryptedBuffer) {
  // Navicat 浣跨敤鐗瑰畾鐨?XOR 搴忓垪
  const xorKey = Buffer.from([
    0x42, 0xCE, 0xB2, 0x71, 0xA5, 0xE4, 0x58, 0xB7,
    0x4E, 0x13, 0xEA, 0x1C, 0x91, 0x67, 0xA3, 0x6D
  ])
  
  const result = Buffer.alloc(encryptedBuffer.length)
  for (let i = 0; i < encryptedBuffer.length; i++) {
    result[i] = encryptedBuffer[i] ^ xorKey[i % xorKey.length]
  }
  
  return result
}

// ============ 鏁版嵁搴撹繛鎺ヨ緟鍔╁嚱鏁?============
async function createConnection(config, connectionId = null) {
  let { type, host, port, username, password, database } = config
  const originalHost = host  // 淇濆瓨鍘熷 host锛圫QLite 闇€瑕佺敤锛?
  
  // 濡傛灉鍚敤浜?SSH 闅ч亾锛屽厛寤虹珛闅ч亾
  let tunnel = null
  if (config.sshEnabled && config.sshHost) {
    console.log(`[DB] 涓鸿繛鎺ュ垱寤?SSH 闅ч亾...`)
    try {
      tunnel = await createSSHTunnel(config)
      host = tunnel.localHost
      port = tunnel.localPort
      
      // 淇濆瓨闅ч亾锛堟寮忚繛鎺ユ椂锛?
      if (connectionId) {
        sshTunnels.set(connectionId, tunnel)
      }
    } catch (e) {
      throw new Error(`SSH 闅ч亾澶辫触: ${e.message}`)
    }
  }

  try {
    let conn
    
    switch (type) {
      case 'mysql':
      case 'mariadb':
        conn = await mysql.createConnection({
          host,
          port,
          user: username,
          password,
          database: database || undefined,
          connectTimeout: 10000,
          dateStrings: true
        })
        break

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
        conn = client
        break
      }

      case 'sqlite': {
        await initSqlite()
        const dbPath = originalHost || database  // SQLite 鐢ㄥ師濮嬭矾寰?
        let dbData = null
        
        if (dbPath && fs.existsSync(dbPath)) {
          dbData = fs.readFileSync(dbPath)
        }
        
        const db = new SQL.Database(dbData)
        db._path = dbPath
        conn = db
        break
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
        conn = client
        break
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
        conn = redis
        break
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
        conn = pool
        break
      }

      default:
        throw new Error(`涓嶆敮鎸佺殑鏁版嵁搴撶被鍨? ${type}`)
    }
    
    // 娴嬭瘯杩炴帴鏃讹紝灏嗛毀閬撻檮鍔犲埌杩炴帴瀵硅薄
    if (tunnel && !connectionId) {
      conn._sshTunnel = tunnel
    }
    
    return conn
  } catch (e) {
    // 杩炴帴澶辫触鏃舵竻鐞嗛毀閬?
    if (tunnel) {
      try {
        if (tunnel.server) tunnel.server.close()
        if (tunnel.ssh) tunnel.ssh.end()
      } catch (err) {}
      if (connectionId) sshTunnels.delete(connectionId)
    }
    throw e
  }
}

async function closeConnection(conn, type, connectionId = null) {
  try {
    // 鍏抽棴鏁版嵁搴撹繛鎺?
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
    
    // 鍏抽棴娴嬭瘯杩炴帴鐨?SSH 闅ч亾
    if (conn._sshTunnel) {
      try {
        if (conn._sshTunnel.server) conn._sshTunnel.server.close()
        if (conn._sshTunnel.ssh) conn._sshTunnel.ssh.end()
      } catch (e) {}
    }
    
    // 鍏抽棴姝ｅ紡杩炴帴鐨?SSH 闅ч亾
    if (connectionId) {
      closeSSHTunnel(connectionId)
    }
  } catch (e) {
    console.error('鍏抽棴杩炴帴鏃跺嚭閿?', e)
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
      // MongoDB 浣跨敤绠€鍗曠殑鍛戒护璇硶
      // 绀轰緥: db.collection.find({}) 鎴?collection_name
      return { columns: [], rows: [], error: 'MongoDB 璇蜂娇鐢ㄨ〃娴忚鍔熻兘鏌ョ湅鏁版嵁' }
    }

    case 'redis': {
      // Redis 鍛戒护鎵ц
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
      throw new Error(`涓嶆敮鎸佺殑鏁版嵁搴撶被鍨? ${type}`)
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
      // Redis 鏁版嵁搴撴槸鏁板瓧 0-15
      const info = await conn.info('keyspace')
      const dbs = ['0'] // 鑷冲皯杩斿洖 db0
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
      // 鍒囨崲鍒版寚瀹氭暟鎹簱
      await conn.select(parseInt(database) || 0)
      // 鑾峰彇鎵€鏈夐敭锛堝墠100涓綔涓?琛?锛?
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
      // 鍒囨崲鏁版嵁搴?
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
      // MongoDB 鏄棤妯″紡鐨勶紝浠庣涓€涓枃妗ｆ帹鏂瓧娈?
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
      // Redis 閿病鏈夊浐瀹氱殑"鍒?
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
  console.log('[getTableData] loading columns')
  const columns = await getColumns(conn, type, database, table)
  console.log('[getTableData] columns loaded count=' + columns.length)

  switch (type) {
    case 'mysql':
    case 'mariadb': {
      // 浣跨敤琛ㄧ姸鎬佽幏鍙栦及绠楄鏁帮紙鍑犱箮鐬棿瀹屾垚锛屾瘮 COUNT(*) 蹇緱澶氾級
      console.log('[getTableData] loading estimated row count')
      let total = 0
      try {
        const [statusRows] = await conn.query(
          `SELECT TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
          [database, table]
        )
        total = statusRows[0]?.TABLE_ROWS || 0
        console.log(`[getTableData] 浼扮畻琛屾暟: ${total}`)
      } catch (e) {
        console.log('[getTableData] estimate unavailable, continuing')
      }
      
      console.log('[getTableData] running select')
      const [rows] = await conn.query(`SELECT * FROM \`${database}\`.\`${table}\` LIMIT ? OFFSET ?`, [pageSize, offset])
      console.log('[getTableData] select complete rows=' + rows.length)
      const data = rows.map(row => columns.map(col => row[col.name]))
      
      // 濡傛灉瀹為檯杩斿洖琛屾暟灏忎簬 pageSize 涓旀槸绗竴椤碉紝璇存槑鏁版嵁閲忓皬锛屼娇鐢ㄥ疄闄呮暟閲?
      if (rows.length < pageSize && page === 1) {
        total = rows.length
      }
      
      return { columns, rows: data, total, page, pageSize }
    }

    case 'postgresql':
    case 'postgres': {
      // 浣跨敤 pg_class 鑾峰彇浼扮畻琛屾暟锛堟瘮 COUNT(*) 蹇緱澶氾級
      let total = 0
      try {
        const estResult = await conn.query(
          `SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = $1`,
          [table]
        )
        total = parseInt(estResult.rows[0]?.estimate) || 0
      } catch (e) {
        console.log(`[getTableData] PostgreSQL 浼扮畻琛屾暟澶辫触`)
      }
      
      const result = await conn.query(`SELECT * FROM "${table}" LIMIT $1 OFFSET $2`, [pageSize, offset])
      const data = result.rows.map(row => columns.map(col => row[col.name]))
      
      if (result.rows.length < pageSize && page === 1) {
        total = result.rows.length
      }
      
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
      // 鑾峰彇浠?table 涓哄墠缂€鐨勯敭
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
      // Redis 鏇存柊閿€?
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
      // 鑾峰彇鏈€鍚庢彃鍏ョ殑琛孖D
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
      // Redis: 鍋囪绗竴涓垪鏄敭鍚嶏紝绗簩涓垪鏄€?
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
      throw new Error(`涓嶆敮鎸佺殑鏁版嵁搴撶被鍨? ${type}`)
  }
}

// ============ 鑾峰彇琛ㄨ缁嗕俊鎭紙鐢ㄤ簬琛ㄨ璁″櫒锛?============
async function getTableInfo(conn, type, database, table) {
  const columns = await getColumnsDetailed(conn, type, database, table)
  const indexes = await getIndexes(conn, type, database, table)
  const foreignKeys = await getForeignKeys(conn, type, database, table)
  const options = await getTableOptions(conn, type, database, table)
  return { columns, indexes, foreignKeys, options }
}

// 鑾峰彇璇︾粏鐨勫垪淇℃伅
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
        // 瑙ｆ瀽 COLUMN_TYPE 鑾峰彇闀垮害/灏忔暟浣?
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
      // 鑾峰彇涓婚敭
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

// 鑾峰彇绱㈠紩淇℃伅
async function getIndexes(conn, type, database, table) {
  switch (type) {
    case 'mysql':
    case 'mariadb': {
      const [indexes] = await conn.query(`SHOW INDEX FROM \`${database}\`.\`${table}\``)
      // 鎸夌储寮曞悕鍒嗙粍
      const indexMap = new Map()
      for (const idx of indexes) {
        if (idx.Key_name === 'PRIMARY') continue // 涓婚敭鍗曠嫭澶勭悊
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
      // 浣跨敤 STUFF + FOR XML PATH 鍏煎鏃х増鏈?SQL Server (浣庝簬 2017)
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
        // 鑾峰彇绱㈠紩鍒?
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

// 鑾峰彇澶栭敭淇℃伅
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
      
      // 鎸夊閿悕鍒嗙粍
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

// 鑾峰彇琛ㄩ€夐」
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

// 鑾峰彇琛ㄧ殑鍒楀悕鍒楄〃锛堢畝鍖栫増锛岀敤浜庡閿€夋嫨锛?
async function getColumnNames(conn, type, database, table) {
  const columns = await getColumns(conn, type, database, table)
  return columns.map(c => c.name)
}

