const { contextBridge, ipcRenderer } = require('electron')

async function invokeWithFallback(channel, fallback, ...args) {
  try {
    return await ipcRenderer.invoke(channel, ...args)
  } catch (error) {
    return typeof fallback === 'function' ? fallback(error) : fallback
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Connection config
  loadConnections: () => ipcRenderer.invoke('config:load'),
  saveConnections: (connections) => ipcRenderer.invoke('config:save', connections),

  // Governance API
  loadGovernanceConfig: () => invokeWithFallback('governance:loadConfig', null),
  saveGovernanceConfig: (config) =>
    invokeWithFallback(
      'governance:saveConfig',
      { success: false, message: 'Governance config API is unavailable' },
      config
    ),
  listAuditLogs: (filters) => invokeWithFallback('governance:listAuditLogs', [], filters),
  listFlashbackLogs: (filters) => invokeWithFallback('governance:listFlashbackLogs', [], filters),
  getFlashbackRecord: (id) => invokeWithFallback('governance:getFlashbackRecord', null, id),
  approveGovernanceDecision: (approval) =>
    invokeWithFallback(
      'governance:approveDecision',
      { success: false, approved: false, message: 'Governance approval API is unavailable' },
      approval
    ),

  // Database actions
  testConnection: (config) => ipcRenderer.invoke('db:test', config),
  connect: (config) => ipcRenderer.invoke('db:connect', config),
  disconnect: (id) => ipcRenderer.invoke('db:disconnect', id),
  query: (id, sql, governanceOptions) => ipcRenderer.invoke('db:query', id, sql, governanceOptions),
  getDatabases: (id) => ipcRenderer.invoke('db:getDatabases', id),
  getTables: (id, database) => ipcRenderer.invoke('db:getTables', id, database),
  getColumns: (id, database, table) => ipcRenderer.invoke('db:getColumns', id, database, table),
  getTableData: (id, database, table, page, pageSize) =>
    ipcRenderer.invoke('db:getTableData', id, database, table, page, pageSize),
  updateRow: (id, database, table, primaryKey, updates, governanceOptions) =>
    ipcRenderer.invoke('db:updateRow', id, database, table, primaryKey, updates, governanceOptions),
  deleteRow: (id, database, table, primaryKey, governanceOptions) =>
    ipcRenderer.invoke('db:deleteRow', id, database, table, primaryKey, governanceOptions),
  insertRow: (id, database, table, columns, values, governanceOptions) =>
    ipcRenderer.invoke('db:insertRow', id, database, table, columns, values, governanceOptions),

  // Database management
  createDatabase: (id, dbName, charset, collation, governanceOptions) =>
    ipcRenderer.invoke('db:createDatabase', id, dbName, charset, collation, governanceOptions),
  dropDatabase: (id, dbName, governanceOptions) => ipcRenderer.invoke('db:dropDatabase', id, dbName, governanceOptions),

  // Table management
  createTable: (id, database, tableName, columns, governanceOptions) =>
    ipcRenderer.invoke('db:createTable', id, database, tableName, columns, governanceOptions),
  dropTable: (id, database, tableName, governanceOptions) => ipcRenderer.invoke('db:dropTable', id, database, tableName, governanceOptions),
  truncateTable: (id, database, tableName, governanceOptions) => ipcRenderer.invoke('db:truncateTable', id, database, tableName, governanceOptions),
  renameTable: (id, database, oldName, newName, governanceOptions) =>
    ipcRenderer.invoke('db:renameTable', id, database, oldName, newName, governanceOptions),
  duplicateTable: (id, database, sourceTable, newTable, withData, governanceOptions) =>
    ipcRenderer.invoke('db:duplicateTable', id, database, sourceTable, newTable, withData, governanceOptions),

  // Column management
  addColumn: (id, database, tableName, column, governanceOptions) =>
    ipcRenderer.invoke('db:addColumn', id, database, tableName, column, governanceOptions),
  modifyColumn: (id, database, tableName, oldName, column, governanceOptions) =>
    ipcRenderer.invoke('db:modifyColumn', id, database, tableName, oldName, column, governanceOptions),
  dropColumn: (id, database, tableName, columnName, governanceOptions) =>
    ipcRenderer.invoke('db:dropColumn', id, database, tableName, columnName, governanceOptions),

  // Table designer
  getTableInfo: (id, database, tableName) => ipcRenderer.invoke('db:getTableInfo', id, database, tableName),
  getIndexes: (id, database, tableName) => ipcRenderer.invoke('db:getIndexes', id, database, tableName),
  getForeignKeys: (id, database, tableName) => ipcRenderer.invoke('db:getForeignKeys', id, database, tableName),
  getColumnNames: (id, database, tableName) => ipcRenderer.invoke('db:getColumnNames', id, database, tableName),
  executeMultiSQL: (id, sqls, governanceOptions) => ipcRenderer.invoke('db:executeMultiSQL', id, sqls, governanceOptions),

  // File operations
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', filePath, content),
  selectFile: (extensions) => ipcRenderer.invoke('file:select', extensions),
  saveDialog: (options) => ipcRenderer.invoke('file:saveDialog', options),
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),

  // Password decryption
  decryptNavicatPassword: (encryptedPassword, version) =>
    ipcRenderer.invoke('crypto:decryptNavicatPassword', encryptedPassword, version),
})
