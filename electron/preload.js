const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // 配置存储
  loadConnections: () => ipcRenderer.invoke('config:load'),
  saveConnections: (connections) => ipcRenderer.invoke('config:save', connections),

  // 数据库操作
  testConnection: (config) => ipcRenderer.invoke('db:test', config),
  connect: (config) => ipcRenderer.invoke('db:connect', config),
  disconnect: (id) => ipcRenderer.invoke('db:disconnect', id),
  query: (id, sql) => ipcRenderer.invoke('db:query', id, sql),
  getDatabases: (id) => ipcRenderer.invoke('db:getDatabases', id),
  getTables: (id, database) => ipcRenderer.invoke('db:getTables', id, database),
  getColumns: (id, database, table) => ipcRenderer.invoke('db:getColumns', id, database, table),
  getTableData: (id, database, table, page, pageSize) => 
    ipcRenderer.invoke('db:getTableData', id, database, table, page, pageSize),
  updateRow: (id, database, table, primaryKey, updates) => 
    ipcRenderer.invoke('db:updateRow', id, database, table, primaryKey, updates),
  deleteRow: (id, database, table, primaryKey) => 
    ipcRenderer.invoke('db:deleteRow', id, database, table, primaryKey),
  insertRow: (id, database, table, columns, values) => 
    ipcRenderer.invoke('db:insertRow', id, database, table, columns, values),

  // 数据库管理
  createDatabase: (id, dbName, charset, collation) => 
    ipcRenderer.invoke('db:createDatabase', id, dbName, charset, collation),
  dropDatabase: (id, dbName) => 
    ipcRenderer.invoke('db:dropDatabase', id, dbName),

  // 表管理
  createTable: (id, database, tableName, columns) => 
    ipcRenderer.invoke('db:createTable', id, database, tableName, columns),
  dropTable: (id, database, tableName) => 
    ipcRenderer.invoke('db:dropTable', id, database, tableName),
  truncateTable: (id, database, tableName) => 
    ipcRenderer.invoke('db:truncateTable', id, database, tableName),
  renameTable: (id, database, oldName, newName) => 
    ipcRenderer.invoke('db:renameTable', id, database, oldName, newName),
  duplicateTable: (id, database, sourceTable, newTable, withData) => 
    ipcRenderer.invoke('db:duplicateTable', id, database, sourceTable, newTable, withData),

  // 列管理
  addColumn: (id, database, tableName, column) => 
    ipcRenderer.invoke('db:addColumn', id, database, tableName, column),
  modifyColumn: (id, database, tableName, oldName, column) => 
    ipcRenderer.invoke('db:modifyColumn', id, database, tableName, oldName, column),
  dropColumn: (id, database, tableName, columnName) => 
    ipcRenderer.invoke('db:dropColumn', id, database, tableName, columnName),

  // 表设计器相关
  getTableInfo: (id, database, tableName) => 
    ipcRenderer.invoke('db:getTableInfo', id, database, tableName),
  getIndexes: (id, database, tableName) => 
    ipcRenderer.invoke('db:getIndexes', id, database, tableName),
  getForeignKeys: (id, database, tableName) => 
    ipcRenderer.invoke('db:getForeignKeys', id, database, tableName),
  getColumnNames: (id, database, tableName) => 
    ipcRenderer.invoke('db:getColumnNames', id, database, tableName),
  executeMultiSQL: (id, sqls) => 
    ipcRenderer.invoke('db:executeMultiSQL', id, sqls),

  // 文件操作
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', filePath, content),
  selectFile: (extensions) => ipcRenderer.invoke('file:select', extensions),
  saveDialog: (options) => ipcRenderer.invoke('file:saveDialog', options),
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath)
})
