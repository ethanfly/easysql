import { contextBridge, ipcRenderer } from 'electron'

// 暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  
  // 数据库操作
  testConnection: (config: any) => ipcRenderer.invoke('db:test', config),
  connect: (config: any) => ipcRenderer.invoke('db:connect', config),
  disconnect: (id: string) => ipcRenderer.invoke('db:disconnect', id),
  query: (id: string, sql: string) => ipcRenderer.invoke('db:query', id, sql),
  getDatabases: (id: string) => ipcRenderer.invoke('db:getDatabases', id),
  getTables: (id: string, database: string) => ipcRenderer.invoke('db:getTables', id, database),
  getColumns: (id: string, database: string, table: string) => ipcRenderer.invoke('db:getColumns', id, database, table),
  getTableData: (id: string, database: string, table: string, page?: number, pageSize?: number) => 
    ipcRenderer.invoke('db:getTableData', id, database, table, page, pageSize),
  
  // 配置存储
  saveConnections: (connections: any[]) => ipcRenderer.invoke('config:save', connections),
  loadConnections: () => ipcRenderer.invoke('config:load'),
  
  // 文件操作
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (filePath: string | null, content: string) => ipcRenderer.invoke('file:save', filePath, content),
  
  // 数据库备份与导出
  backupDatabase: (id: string, database: string) => ipcRenderer.invoke('db:backup', id, database),
  exportTable: (id: string, database: string, tableName: string, format: 'excel' | 'sql' | 'csv') => 
    ipcRenderer.invoke('db:exportTable', id, database, tableName, format),
})

