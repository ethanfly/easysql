import { useState, useEffect, useCallback, useMemo } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import ConnectionModal from './components/ConnectionModal'
import { Connection, QueryTab, DatabaseType, TableInfo, ColumnInfo, TableTab } from './types'
import api from './lib/tauri-api'
import { useDebouncedCallback } from './lib/hooks'

// 统一的标签页类型
type Tab = QueryTab | TableTab

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
    api.loadConnections().then(data => {
      if (data) setConnections(data)
    })
  }, [])

  // 防抖保存连接配置
  const debouncedSaveConnections = useDebouncedCallback((conns: Connection[]) => {
    api.saveConnections(conns)
  }, 500)

  useEffect(() => {
    if (connections.length > 0) {
      debouncedSaveConnections(connections)
    }
  }, [connections, debouncedSaveConnections])

  // 全局快捷键
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Q 新建查询
      if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
        e.preventDefault()
        const id = `query-${Date.now()}`
        const newTab: QueryTab = { id, title: '查询', sql: '', results: null }
        setTabs(prev => [...prev, newTab])
        setActiveTab(id)
      }
    }
    
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

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
    
    const result = await api.connect(conn)
    
    if (result?.success) {
      setConnectedIds(prev => new Set(prev).add(conn.id))
      setActiveConnection(conn.id)
      setStatus({ text: `已连接: ${conn.name}`, type: 'success' })
      
      const dbs = await api.getDatabases(conn.id)
      setDatabases(dbs || [])
      handleNewQuery(conn.name)
    } else {
      setStatus({ text: result?.message || '连接失败', type: 'error' })
    }
  }

  const handleDisconnect = async (id: string) => {
    await api.disconnect(id)
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

  // 切换选中的连接，如果已连接则加载数据库列表
  const handleSelectConnection = async (id: string) => {
    setActiveConnection(id)
    
    // 如果该连接已经连接，加载其数据库列表
    if (connectedIds.has(id)) {
      setSelectedDatabase(null)
      setTables([])
      setAllColumns(new Map())
      setStatus({ text: '正在加载数据库列表...', type: 'info' })
      
      try {
        const dbs = await api.getDatabases(id)
        setDatabases(dbs || [])
        setStatus({ text: `${dbs?.length || 0} 个数据库`, type: 'success' })
      } catch (err: any) {
        setStatus({ text: err.message, type: 'error' })
      }
    } else {
      // 未连接的连接，清空数据库列表
      setDatabases([])
      setSelectedDatabase(null)
      setTables([])
      setAllColumns(new Map())
    }
  }

  const handleSelectDatabase = useCallback(async (db: string) => {
    if (!activeConnection) return
    
    setSelectedDatabase(db)
    setTables([])
    setLoadingTables(true)
    setStatus({ text: `正在加载 ${db} 的表...`, type: 'info' })
    
    try {
      const tableList = await api.getTables(activeConnection, db)
      setTables(tableList || [])
      setLoadingTables(false)
      
      // 获取所有表的字段信息用于代码提示 - 并行加载以提高性能
      if (tableList && tableList.length > 0) {
        const columnsPromises = tableList.map(async (table) => {
          const cols = await api.getColumns(activeConnection, db, table.name)
          return { name: table.name, cols: cols || [] }
        })
        
        const columnsResults = await Promise.all(columnsPromises)
        const columnsMap = new Map<string, ColumnInfo[]>()
        columnsResults.forEach(({ name, cols }) => {
          if (cols.length > 0) columnsMap.set(name, cols)
        })
        setAllColumns(columnsMap)
      } else {
        setAllColumns(new Map())
      }
      
      setStatus({ text: `${db}: ${tableList?.length || 0} 个表`, type: 'success' })
    } catch (err: any) {
      setLoadingTables(false)
      setStatus({ text: err.message, type: 'error' })
    }
  }, [activeConnection])

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
      const columns = await api.getColumns(activeConnection, database, tableName) || []
      // 获取表数据
      const result = await api.getTableData(activeConnection, database, tableName, 1, 100)
      
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
        pageSize: 100,
        originalData: result?.data || [],
        pendingChanges: new Map(),
        deletedRows: new Set()
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
      const result = await api.getTableData(
        activeConnection, tab.database, tab.tableName, page, tab.pageSize
      )
      
      setTabs(prev => prev.map(t => 
        t.id === tabId && 'tableName' in t 
          ? { ...t, data: result?.data || [], page, originalData: result?.data || [], pendingChanges: new Map(), deletedRows: new Set() } 
          : t
      ))
      setStatus({ text: `${tab.tableName}: 第 ${page} 页`, type: 'success' })
    } catch (err: any) {
      setStatus({ text: err.message, type: 'error' })
    }
  }

  // 更新表格单元格
  const handleUpdateTableCell = (tabId: string, rowIndex: number, colName: string, value: any) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId || !('tableName' in t)) return t
      const tab = t as TableTab
      
      // 更新数据
      const newData = [...tab.data]
      newData[rowIndex] = { ...newData[rowIndex], [colName]: value }
      
      // 记录修改
      const pendingChanges = new Map(tab.pendingChanges || new Map())
      const rowChanges = pendingChanges.get(String(rowIndex)) || {}
      rowChanges[colName] = value
      pendingChanges.set(String(rowIndex), rowChanges)
      
      return { ...tab, data: newData, pendingChanges }
    }))
  }

  // 删除表格行
  const handleDeleteTableRow = (tabId: string, rowIndex: number) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId || !('tableName' in t)) return t
      const tab = t as TableTab
      
      const deletedRows = new Set(tab.deletedRows || new Set())
      deletedRows.add(rowIndex)
      
      return { ...tab, deletedRows }
    }))
  }

  // 批量删除表格行
  const handleDeleteTableRows = (tabId: string, rowIndices: number[]) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId || !('tableName' in t)) return t
      const tab = t as TableTab
      
      const deletedRows = new Set(tab.deletedRows || new Set())
      rowIndices.forEach(idx => deletedRows.add(idx))
      
      return { ...tab, deletedRows }
    }))
  }

  // 保存表格修改
  const handleSaveTableChanges = async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId) as TableTab | undefined
    if (!tab || !('tableName' in tab) || !activeConnection) return
    
    const primaryKeyCol = tab.columns.find(c => c.key === 'PRI')?.name || tab.columns[0]?.name
    if (!primaryKeyCol) {
      setStatus({ text: '无法确定主键列', type: 'error' })
      return
    }
    
    setStatus({ text: '保存中...', type: 'info' })
    
    try {
      // 保存修改的行
      if (tab.pendingChanges) {
        for (const [rowIndexStr, changes] of tab.pendingChanges) {
          const rowIndex = parseInt(rowIndexStr)
          const originalRow = tab.originalData?.[rowIndex] || tab.data[rowIndex]
          const primaryKeyValue = originalRow[primaryKeyCol]
          
          const result = await api.updateRow(
            activeConnection,
            tab.database,
            tab.tableName,
            { column: primaryKeyCol, value: primaryKeyValue },
            changes
          )
          
          if (result?.error) {
            setStatus({ text: `保存失败: ${result.error}`, type: 'error' })
            return
          }
        }
      }
      
      // 删除行
      if (tab.deletedRows) {
        for (const rowIndex of tab.deletedRows) {
          const originalRow = tab.originalData?.[rowIndex] || tab.data[rowIndex]
          const primaryKeyValue = originalRow[primaryKeyCol]
          
          const result = await api.deleteRow(
            activeConnection,
            tab.database,
            tab.tableName,
            { column: primaryKeyCol, value: primaryKeyValue }
          )
          
          if (result?.error) {
            setStatus({ text: `删除失败: ${result.error}`, type: 'error' })
            return
          }
        }
      }
      
      // 重新加载数据
      const result = await api.getTableData(
        activeConnection, tab.database, tab.tableName, tab.page, tab.pageSize
      )
      const totalResult = await api.getTableData(
        activeConnection, tab.database, tab.tableName, 1, 1
      )
      
      setTabs(prev => prev.map(t => 
        t.id === tabId && 'tableName' in t 
          ? { 
              ...t, 
              data: result?.data || [], 
              total: totalResult?.total || tab.total,
              originalData: result?.data || [],
              pendingChanges: new Map(), 
              deletedRows: new Set() 
            } 
          : t
      ))
      
      setStatus({ text: '保存成功', type: 'success' })
    } catch (err: any) {
      setStatus({ text: `保存失败: ${err.message}`, type: 'error' })
    }
  }

  // 放弃修改
  const handleDiscardTableChanges = (tabId: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId || !('tableName' in t)) return t
      const tab = t as TableTab
      
      return { 
        ...tab, 
        data: tab.originalData || tab.data,
        pendingChanges: new Map(), 
        deletedRows: new Set() 
      }
    }))
    setStatus({ text: '已放弃修改', type: 'warning' })
  }

  // 使用防抖防止快速重复点击
  const handleRunQuery = useDebouncedCallback(async (tabId: string, sql: string) => {
    if (!activeConnection) {
      setStatus({ text: '请先连接数据库', type: 'warning' })
      return
    }

    setStatus({ text: '执行中...', type: 'info' })
    const start = Date.now()
    
    const result = await api.query(activeConnection, sql)
    const elapsed = ((Date.now() - start) / 1000).toFixed(2)
    
    if (result?.error) {
      setStatus({ text: result.error, type: 'error' })
    } else {
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, results: result, sql } : t))
      setStatus({ text: `${result?.rows?.length || 0} 行 (${elapsed}s)`, type: 'success' })
    }
  }, 300)

  // 数据库备份
  const handleBackupDatabase = async (database: string) => {
    if (!activeConnection) {
      setStatus({ text: '请先连接数据库', type: 'warning' })
      return
    }
    
    setStatus({ text: `正在备份 ${database}...`, type: 'info' })
    
    const result = await api.backupDatabase(activeConnection, database)
    
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
    
    const result = await api.exportTable(activeConnection, database, tableName, format)
    
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
          onSelectConnection={handleSelectConnection}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onEditConnection={(c) => { setEditingConnection(c); setShowModal(true) }}
          onDeleteConnection={(id) => setConnections(prev => prev.filter(c => c.id !== id))}
          onDeleteConnections={(ids) => {
            // 先断开所有选中的已连接数据库
            ids.forEach(id => {
              if (connectedIds.has(id)) {
                api.disconnect(id)
              }
            })
            setConnectedIds(prev => {
              const next = new Set(prev)
              ids.forEach(id => next.delete(id))
              return next
            })
            setConnections(prev => prev.filter(c => !ids.includes(c.id)))
            setStatus({ text: `已删除 ${ids.length} 个连接`, type: 'success' })
          }}
          onSelectDatabase={handleSelectDatabase}
          onOpenTable={handleOpenTable}
          onBackupDatabase={handleBackupDatabase}
          onExportTable={handleExportTable}
          onExportConnections={async (format) => {
            const result = await api.exportConnections(connections, format)
            if (result?.success) {
              setStatus({ text: `已导出 ${result.count} 个连接到 ${result.path}`, type: 'success' })
            } else if (result?.error) {
              setStatus({ text: result.error, type: 'error' })
            }
          }}
          onImportConnections={async () => {
            const result = await api.importConnections()
            if (result?.success && result.connections) {
              // 合并连接（检查重名）
              const existingNames = new Set(connections.map(c => c.name))
              const newConnections = result.connections.map(conn => {
                let name = conn.name
                let counter = 1
                while (existingNames.has(name)) {
                  name = `${conn.name} (${counter++})`
                }
                existingNames.add(name)
                return { ...conn, name }
              })
              setConnections(prev => [...prev, ...newConnections])
              setStatus({ 
                text: `已从 ${result.source} 导入 ${result.count} 个连接`, 
                type: 'success' 
              })
            } else if (result?.error) {
              setStatus({ text: result.error, type: 'error' })
            }
          }}
        />
        
        <MainContent
          tabs={tabs}
          activeTab={activeTab}
          databases={databases}
          tables={tables}
          columns={allColumns}
          onTabChange={setActiveTab}
          onCloseTab={(id) => {
            setTabs(prev => {
              const remaining = prev.filter(t => t.id !== id)
              // 如果关闭的是当前标签页，跳转到最近的标签页
              if (activeTab === id) {
                const closedIndex = prev.findIndex(t => t.id === id)
                if (remaining.length > 0) {
                  // 优先跳转到右边的标签页，如果没有则跳转到左边的
                  const nextIndex = Math.min(closedIndex, remaining.length - 1)
                  setActiveTab(remaining[nextIndex].id)
                } else {
                  setActiveTab('welcome')
                }
              }
              return remaining
            })
          }}
          onNewQuery={() => handleNewQuery()}
          onRunQuery={handleRunQuery}
          onUpdateSql={(id, sql) => setTabs(prev => prev.map(t => t.id === id && !('tableName' in t) ? { ...t, sql } : t))}
          onUpdateTabTitle={(id, title) => setTabs(prev => prev.map(t => t.id === id && !('tableName' in t) ? { ...t, title } : t))}
          onLoadTablePage={handleLoadTablePage}
          onUpdateTableCell={handleUpdateTableCell}
          onDeleteTableRow={handleDeleteTableRow}
          onDeleteTableRows={handleDeleteTableRows}
          onSaveTableChanges={handleSaveTableChanges}
          onDiscardTableChanges={handleDiscardTableChanges}
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
