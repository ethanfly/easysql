"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // 窗口控制
  minimize: () => electron.ipcRenderer.invoke("window:minimize"),
  maximize: () => electron.ipcRenderer.invoke("window:maximize"),
  close: () => electron.ipcRenderer.invoke("window:close"),
  // 数据库操作
  testConnection: (config) => electron.ipcRenderer.invoke("db:test", config),
  connect: (config) => electron.ipcRenderer.invoke("db:connect", config),
  disconnect: (id) => electron.ipcRenderer.invoke("db:disconnect", id),
  query: (id, sql) => electron.ipcRenderer.invoke("db:query", id, sql),
  getDatabases: (id) => electron.ipcRenderer.invoke("db:getDatabases", id),
  getTables: (id, database) => electron.ipcRenderer.invoke("db:getTables", id, database),
  getColumns: (id, database, table) => electron.ipcRenderer.invoke("db:getColumns", id, database, table),
  getTableData: (id, database, table, page, pageSize) => electron.ipcRenderer.invoke("db:getTableData", id, database, table, page, pageSize),
  // 配置存储
  saveConnections: (connections) => electron.ipcRenderer.invoke("config:save", connections),
  loadConnections: () => electron.ipcRenderer.invoke("config:load"),
  // 文件操作
  openFile: () => electron.ipcRenderer.invoke("file:open"),
  saveFile: (filePath, content) => electron.ipcRenderer.invoke("file:save", filePath, content),
  // 数据库备份与导出
  backupDatabase: (id, database) => electron.ipcRenderer.invoke("db:backup", id, database),
  exportTable: (id, database, tableName, format) => electron.ipcRenderer.invoke("db:exportTable", id, database, tableName, format)
});
