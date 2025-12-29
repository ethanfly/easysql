import { useState, useEffect } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import ConnectionModal from './components/ConnectionModal'
import { Connection, QueryTab, DatabaseType, TableInfo, ColumnInfo, TableTab } from './types'

// 统一的标签页类型
type Tab = QueryTab | TableTab

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void
      maximize: () => void
      close: () => void
      testConnection: (config: any) => Promise<{ success: boolean; message: string }>
      connect: (config: any) => Promise<{ success: boolean; message: string }>
      disconnect: (id: string) => Promise<void>
      query: (id: string, sql: string) => Promise<{ columns: string[]; rows: any[]; error?: string }>
      getDatabases: (id: string) => Promise<string[]>
      getTables: (id: string, database: string) => Promise<TableInfo[]>
      getColumns: (id: string, database: string, table: string) => Promise<ColumnInfo[]>
      getTableData: (id: string, database: string, table: string, page?: number, pageSize?: number) => 
        Promise<{ data: any[]; total: number }>
      saveConnections: (connections: any[]) => Promise<void>
      loadConnections: () => Promise<any[]>
      // 文件操作
      openFile: () => Promise<{ path: string; content: string; name: string; error?: string } | null>
      saveFile: (filePath: string | null, content: string) => Promise<{ path: string; name: string; error?: string } | null>
      // 数据库备份与导出
      backupDatabase: (id: string, database: string) => Promise<{ success?: boolean; path?: string; error?: string; cancelled?: boolean }>
      exportTable: (id: string, database: string, tableName: string, format: 'excel' | 'sql' | 'csv') => 
        Promise<{ success?: boolean; path?: string; error?: string; cancelled?: boolean }>
    }
  }
}

export default function App() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [activeConnection, setActiveConnection] = useState<string | null>(null)
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set())
  const [databases, setDatabases] = useState<string[]>([])
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [loadingTables, setLoadingTables] = useState(false)
  const [allColumns, setAllColumns] = useState<Map<string, ColumnInfo[]>>(new Map())
  const [showModal, setShowModal] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [defaultDbType, setDefaultDbType] = useState<DatabaseType | undefined>(undefined)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState<string>('welcome')
  const [status, setStatus] = useState({ text: '就绪', type: 'success' as 'success' | 'error' | 'warning' | 'info' })

  useEffect(() => {
    window.electronAPI?.loadConnections().then(data => {
      if (data) setConnections(data)
    })
  }, [])

  useEffect(() => {
    if (connections.length > 0) {
      window.electronAPI?.saveConnections(connections)
    }
  }, [connections])

  const handleSaveConnection = (conn: Connection) => {
    if (editingConnection) {
      setConnections(prev => prev.map(c => c.id === conn.id ? conn : c))
    } else {
      setConnections(prev => [...prev, conn])
    }
    setShowModal(false)
  }

  const handleConnect = async (conn: Connection) => {
    setStatus({ text: `正在连接 ${conn.name}...`, type: 'info' })
    
    const result = await window.electronAPI?.connect(conn)
    
    if (result?.success) {
      setConnectedIds(prev => new Set(prev).add(conn.id))
      setActiveConnection(conn.id)
      setStatus({ text: `已连接: ${conn.name}`, type: 'success' })
      
      const dbs = await window.electronAPI?.getDatabases(conn.id)
      setDatabases(dbs || [])
      handleNewQuery(conn.name)
    } else {
      setStatus({ text: result?.message || '连接失败', type: 'error' })
    }
  }

  const handleDisconnect = async (id: string) => {
    await window.electronAPI?.disconnect(id)
    setConnectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    if (activeConnection === id) {
      setActiveConnection(null)
      setDatabases([])
      setSelectedDatabase(null)
      setTables([])
      setAllColumns(new Map())
    }
  }

  const handleSelectDatabase = async (db: string) => {
    if (!activeConnection) return
    
    setSelectedDatabase(db)
    setTables([])
    setLoadingTables(true)
    setStatus({ text: `正在加载 ${db} 的表...`, type: 'info' })
    
    try {
      const tableList = await window.electronAPI?.getTables(activeConnection, db)
      setTables(tableList || [])
      setLoadingTables(false)
      
      // 获取所有表的字段信息用于代码提示
      const columnsMap = new Map<string, ColumnInfo[]>()
      if (tableList) {
        for (const table of tableList) {
          const cols = await window.electronAPI?.getColumns(activeConnection, db, table.name)
          if (cols) columnsMap.set(table.name, cols)
        }
      }
      setAllColumns(columnsMap)
      setStatus({ text: `${db}: ${tableList?.length || 0} 个表`, type: 'success' })
    } catch (err: any) {
      setLoadingTables(false)
      setStatus({ text: err.message, type: 'error' })
    }
  }

  const handleNewQuery = (name?: string) => {
    const id = `query-${Date.now()}`
    const newTab: QueryTab = { id, title: name || '查询', sql: '', results: null }
    setTabs(prev => [...prev, newTab])
    setActiveTab(id)
  }

  const handleOpenTable = async (database: string, tableName: string) => {
    if (!activeConnection) return
    
    // 检查是否已经打开了这个表
    const existingTab = tabs.find(t => 'tableName' in t && t.tableName === tableName && t.database === database)
    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }
    
    setStatus({ text: `正在加载 ${tableName}...`, type: 'info' })
    
    try {
      // 获取字段信息
      const columns = await window.electronAPI?.getColumns(activeConnection, database, tableName) || []
      // 获取表数据
      const result = await window.electronAPI?.getTableData(activeConnection, database, tableName, 1, 100)
      
      const id = `table-${Date.now()}`
      const newTab: TableTab = {
        id,
        type: 'table',
        tableName,
        database,
        columns,
        data: result?.data || [],
        total: result?.total || 0,
        page: 1,
        pageSize: 100
      }
      
      setTabs(prev => [...prev, newTab])
      setActiveTab(id)
      setStatus({ text: `${tableName}: ${result?.total || 0} 行`, type: 'success' })
    } catch (err: any) {
      setStatus({ text: err.message, type: 'error' })
    }
  }

  const handleLoadTablePage = async (tabId: string, page: number) => {
    const tab = tabs.find(t => t.id === tabId) as TableTab | undefined
    if (!tab || !('tableName' in tab) || !activeConnection) return
    
    setStatus({ text: `加载第 ${page} 页...`, type: 'info' })
    
    try {
      const result = await window.electronAPI?.getTableData(
        activeConnection, tab.database, tab.tableName, page, tab.pageSize
      )
      
      setTabs(prev => prev.map(t => 
        t.id === tabId && 'tableName' in t 
          ? { ...t, data: result?.data || [], page } 
          : t
      ))
      setStatus({ text: `${tab.tableName}: 第 ${page} 页`, type: 'success' })
    } catch (err: any) {
      setStatus({ text: err.message, type: 'error' })
    }
  }

  const handleRunQuery = async (tabId: string, sql: string) => {
    if (!activeConnection) {
      setStatus({ text: '请先连接数据库', type: 'warning' })
      return
    }

    setStatus({ text: '执行中...', type: 'info' })
    const start = Date.now()
    
    const result = await window.electronAPI?.query(activeConnection, sql)
    const elapsed = ((Date.now() - start) / 1000).toFixed(2)
    
    if (result?.error) {
      setStatus({ text: result.error, type: 'error' })
    } else {
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, results: result, sql } : t))
      setStatus({ text: `${result?.rows?.length || 0} 行 (${elapsed}s)`, type: 'success' })
    }
  }

  // 数据库备份
  const handleBackupDatabase = async (database: string) => {
    if (!activeConnection) {
      setStatus({ text: '请先连接数据库', type: 'warning' })
      return
    }
    
    setStatus({ text: `正在备份 ${database}...`, type: 'info' })
    
    const result = await window.electronAPI?.backupDatabase(activeConnection, database)
    
    if (result?.error) {
      setStatus({ text: `备份失败: ${result.error}`, type: 'error' })
    } else if (result?.cancelled) {
      setStatus({ text: '备份已取消', type: 'warning' })
    } else if (result?.success) {
      setStatus({ text: `备份成功: ${result.path}`, type: 'success' })
    }
  }

  // 导出表
  const handleExportTable = async (database: string, tableName: string, format: 'excel' | 'sql' | 'csv') => {
    if (!activeConnection) {
      setStatus({ text: '请先连接数据库', type: 'warning' })
      return
    }
    
    setStatus({ text: `正在导出 ${tableName}...`, type: 'info' })
    
    const result = await window.electronAPI?.exportTable(activeConnection, database, tableName, format)
    
    if (result?.error) {
      setStatus({ text: `导出失败: ${result.error}`, type: 'error' })
    } else if (result?.cancelled) {
      setStatus({ text: '导出已取消', type: 'warning' })
    } else if (result?.success) {
      setStatus({ text: `导出成功: ${result.path}`, type: 'success' })
    }
  }

  return (
    <div className="h-screen flex flex-col bg-metro-dark overflow-hidden">
      <TitleBar />
      
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          connections={connections}
          activeConnection={activeConnection}
          connectedIds={connectedIds}
          databases={databases}
          tables={tables}
          selectedDatabase={selectedDatabase}
          loadingTables={loadingTables}
          onNewConnection={() => { setEditingConnection(null); setDefaultDbType(undefined); setShowModal(true) }}
          onSelectConnection={setActiveConnection}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onEditConnection={(c) => { setEditingConnection(c); setShowModal(true) }}
          onDeleteConnection={(id) => setConnections(prev => prev.filter(c => c.id !== id))}
          onSelectDatabase={handleSelectDatabase}
          onOpenTable={handleOpenTable}
          onBackupDatabase={handleBackupDatabase}
          onExportTable={handleExportTable}
        />
        
        <MainContent
          tabs={tabs}
          activeTab={activeTab}
          databases={databases}
          tables={tables}
          columns={allColumns}
          onTabChange={setActiveTab}
          onCloseTab={(id) => {
            setTabs(prev => prev.filter(t => t.id !== id))
            if (activeTab === id) setActiveTab('welcome')
          }}
          onNewQuery={() => handleNewQuery()}
          onRunQuery={handleRunQuery}
          onUpdateSql={(id, sql) => setTabs(prev => prev.map(t => t.id === id && !('tableName' in t) ? { ...t, sql } : t))}
          onUpdateTabTitle={(id, title) => setTabs(prev => prev.map(t => t.id === id && !('tableName' in t) ? { ...t, title } : t))}
          onLoadTablePage={handleLoadTablePage}
          onNewConnectionWithType={(type) => {
            setEditingConnection(null)
            setDefaultDbType(type)
            setShowModal(true)
          }}
        />
      </div>
      
      {/* Metro 风格状态栏 */}
      <div className="h-6 bg-metro-bg flex items-center px-3 text-xs border-t border-metro-border">
        <div className={`flex items-center gap-2 ${
          status.type === 'success' ? 'text-accent-green' :
          status.type === 'error' ? 'text-accent-red' :
          status.type === 'warning' ? 'text-accent-orange' : 'text-white/60'
        }`}>
          <span className="w-2 h-2 rounded-full bg-current" />
          {status.text}
        </div>
        <span className="ml-auto text-white/40">EasySQL</span>
      </div>

      {showModal && (
        <ConnectionModal
          connection={editingConnection}
          defaultType={defaultDbType}
          onSave={handleSaveConnection}
          onClose={() => { setShowModal(false); setDefaultDbType(undefined) }}
        />
      )}
    </div>
  )
}
