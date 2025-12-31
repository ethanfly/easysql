import { useState, useEffect, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import ConnectionModal from './components/ConnectionModal'
import CreateDatabaseModal from './components/CreateDatabaseModal'
import CreateTableModal from './components/CreateTableModal'
import InputDialog from './components/InputDialog'
import { Connection, QueryTab, DatabaseType, TableInfo, ColumnInfo, TableTab } from './types'
import api from './lib/electron-api'
import { useConnections, useDatabaseOperations, useTableOperations, useTabOperations, useQueryOperations, useImportExport } from './lib/hooks'
import { Database, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

function App() {
  const [activeConnection, setActiveConnection] = useState<string | null>(null)
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null)
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [newConnectionType, setNewConnectionType] = useState<DatabaseType | undefined>()
  const [showCreateDbModal, setShowCreateDbModal] = useState(false)
  const [createDbConnectionId, setCreateDbConnectionId] = useState<string | null>(null)
  const [showCreateTableModal, setShowCreateTableModal] = useState(false)
  const [createTableContext, setCreateTableContext] = useState<{ connectionId: string; database: string } | null>(null)
  const [inputDialog, setInputDialog] = useState<{
    isOpen: boolean
    title: string
    label: string
    defaultValue: string
    onConfirm: (value: string) => void
  } | null>(null)
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info'
    message: string
  } | null>(null)

  // 显示通知
  const showNotification = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }, [])

  // 连接管理
  const {
    connections, setConnections,
    connectedIds, setConnectedIds,
    addConnection, deleteConnection, updateConnection
  } = useConnections()

  // 数据库操作
  const {
    databasesMap, setDatabasesMap,
    loadingDbSet, setLoadingDbSet,
    fetchDatabases
  } = useDatabaseOperations(showNotification)

  // 表操作
  const {
    tablesMap, setTablesMap,
    columnsMap, setColumnsMap,
    fetchTables, fetchColumns
  } = useTableOperations(showNotification)

  // Tab操作
  const {
    tabs, setTabs,
    activeTab, setActiveTab,
    loadingTables, setLoadingTables
  } = useTabOperations()

  // 查询操作
  const { runQuery } = useQueryOperations(tabs, setTabs, showNotification)

  // 导入导出
  const { importConnections: doImportConnections, exportConnections: doExportConnections } = useImportExport(connections, setConnections, showNotification)

  // 连接数据库
  const handleConnect = useCallback(async (conn: Connection) => {
    if (connectedIds.has(conn.id)) return
    try {
      await api.connect(conn)
      setConnectedIds(prev => new Set(prev).add(conn.id))
      setActiveConnection(conn.id)
      await fetchDatabases(conn.id)
      showNotification('success', `已连接到 ${conn.name}`)
    } catch (err) {
      showNotification('error', '连接失败：' + (err as Error).message)
    }
  }, [connectedIds, setConnectedIds, fetchDatabases, showNotification])

  // 断开连接
  const handleDisconnect = useCallback(async (id: string) => {
    try {
      await api.disconnect(id)
      setConnectedIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setDatabasesMap(prev => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      if (activeConnection === id) setActiveConnection(null)
      showNotification('info', '连接已断开')
    } catch (err) {
      showNotification('error', '断开失败：' + (err as Error).message)
    }
  }, [activeConnection, setConnectedIds, setDatabasesMap, showNotification])

  // 选择数据库
  const handleSelectDatabase = useCallback(async (db: string, connectionId: string) => {
    setSelectedDatabase(db)
    setActiveConnection(connectionId)
    setLoadingDbSet(prev => new Set(prev).add(db))
    try {
      await fetchTables(connectionId, db)
      const tables = tablesMap.get(db) || []
      await Promise.all(tables.map(t => fetchColumns(connectionId, db, t.name)))
    } finally {
      setLoadingDbSet(prev => {
        const next = new Set(prev)
        next.delete(db)
        return next
      })
    }
  }, [fetchTables, fetchColumns, tablesMap, setLoadingDbSet])

  // 打开表
  const handleOpenTable = useCallback(async (connectionId: string, database: string, tableName: string) => {
    const existingTab = tabs.find(t => 'tableName' in t && t.tableName === tableName && t.database === database)
    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    const newTabId = `table-${Date.now()}`
    setLoadingTables(prev => new Set(prev).add(newTabId))
    
    try {
      const cols = await api.getTableColumns(connectionId, database, tableName)
      const pageSize = 100
      const { rows, total } = await api.getTableData(connectionId, database, tableName, 1, pageSize)
      
      const newTab: TableTab = {
        id: newTabId,
        tableName,
        database,
        connectionId,
        columns: cols,
        data: rows,
        total,
        page: 1,
        pageSize,
        pendingChanges: new Map(),
        deletedRows: new Set(),
        newRows: []
      }
      setTabs(prev => [...prev, newTab])
      setActiveTab(newTabId)
    } catch (err) {
      showNotification('error', '打开表失败：' + (err as Error).message)
    } finally {
      setLoadingTables(prev => {
        const next = new Set(prev)
        next.delete(newTabId)
        return next
      })
    }
  }, [tabs, setTabs, setActiveTab, setLoadingTables, showNotification])

  // 加载表页
  const handleLoadTablePage = useCallback(async (tabId: string, page: number) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab || !('tableName' in tab)) return

    setLoadingTables(prev => new Set(prev).add(tabId))
    try {
      const { rows, total } = await api.getTableData(tab.connectionId, tab.database, tab.tableName, page, tab.pageSize)
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, data: rows, total, page, pendingChanges: new Map(), deletedRows: new Set(), newRows: [] } : t))
    } catch (err) {
      showNotification('error', '加载数据失败')
    } finally {
      setLoadingTables(prev => {
        const next = new Set(prev)
        next.delete(tabId)
        return next
      })
    }
  }, [tabs, setTabs, setLoadingTables, showNotification])

  // 更新表单元格
  const handleUpdateTableCell = useCallback((tabId: string, rowIndex: number, colName: string, value: any) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId || !('tableName' in t)) return t
      const tab = t as TableTab & { pendingChanges: Map<string, any> }
      const changes = new Map(tab.pendingChanges)
      const rowKey = String(rowIndex)
      const rowChanges = changes.get(rowKey) || {}
      rowChanges[colName] = value
      changes.set(rowKey, rowChanges)
      return { ...t, pendingChanges: changes }
    }))
  }, [setTabs])

  // 删除行
  const handleDeleteTableRow = useCallback((tabId: string, rowIndex: number) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId || !('tableName' in t)) return t
      const tab = t as TableTab & { deletedRows: Set<number> }
      const deleted = new Set(tab.deletedRows)
      deleted.add(rowIndex)
      return { ...t, deletedRows: deleted }
    }))
  }, [setTabs])

  // 批量删除行
  const handleDeleteTableRows = useCallback((tabId: string, rowIndices: number[]) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId || !('tableName' in t)) return t
      const tab = t as TableTab & { deletedRows: Set<number> }
      const deleted = new Set(tab.deletedRows)
      rowIndices.forEach(i => deleted.add(i))
      return { ...t, deletedRows: deleted }
    }))
  }, [setTabs])

  // 保存更改
  const handleSaveTableChanges = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId) as (TableTab & { pendingChanges: Map<string, any>; deletedRows: Set<number>; newRows: any[] }) | undefined
    if (!tab || !('tableName' in tab)) return

    const primaryKeyCol = tab.columns.find(c => c.key === 'PRI')?.name || tab.columns[0]?.name
    if (!primaryKeyCol) {
      showNotification('error', '无法确定主键')
      return
    }

    setLoadingTables(prev => new Set(prev).add(tabId))
    try {
      // 处理更新
      for (const [rowKey, changes] of tab.pendingChanges) {
        const rowIndex = parseInt(rowKey)
        const row = tab.data[rowIndex]
        if (!row) continue
        const pkValue = row[primaryKeyCol]
        await api.updateTableRow(tab.connectionId, tab.database, tab.tableName, primaryKeyCol, pkValue, changes)
      }

      // 处理删除
      for (const rowIndex of tab.deletedRows) {
        const row = tab.data[rowIndex]
        if (!row) continue
        const pkValue = row[primaryKeyCol]
        await api.deleteTableRow(tab.connectionId, tab.database, tab.tableName, primaryKeyCol, pkValue)
      }

      // 处理新增
      for (const newRow of tab.newRows || []) {
        const insertData: Record<string, any> = {}
        tab.columns.forEach(col => {
          if (newRow[col.name] !== undefined && newRow[col.name] !== null && newRow[col.name] !== '') {
            insertData[col.name] = newRow[col.name]
          }
        })
        if (Object.keys(insertData).length > 0) {
          await api.insertTableRow(tab.connectionId, tab.database, tab.tableName, insertData)
        }
      }

      showNotification('success', '保存成功')
      await handleLoadTablePage(tabId, tab.page)
    } catch (err) {
      showNotification('error', '保存失败：' + (err as Error).message)
    } finally {
      setLoadingTables(prev => {
        const next = new Set(prev)
        next.delete(tabId)
        return next
      })
    }
  }, [tabs, handleLoadTablePage, setLoadingTables, showNotification])

  // 丢弃更改
  const handleDiscardTableChanges = useCallback((tabId: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, pendingChanges: new Map(), deletedRows: new Set(), newRows: [] } : t))
  }, [setTabs])

  // 刷新表
  const handleRefreshTable = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab || !('tableName' in tab)) return
    await handleLoadTablePage(tabId, (tab as TableTab).page)
  }, [tabs, handleLoadTablePage])

  // 添加新行
  const handleAddTableRow = useCallback((tabId: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId || !('tableName' in t)) return t
      const tab = t as TableTab & { newRows: any[] }
      const newRow: Record<string, any> = {}
      tab.columns.forEach(col => { newRow[col.name] = null })
      return { ...t, newRows: [...(tab.newRows || []), newRow] }
    }))
  }, [setTabs])

  // 更新新行
  const handleUpdateNewRow = useCallback((tabId: string, rowIndex: number, colName: string, value: any) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId || !('tableName' in t)) return t
      const tab = t as TableTab & { newRows: any[] }
      const newRows = [...(tab.newRows || [])]
      if (newRows[rowIndex]) {
        newRows[rowIndex] = { ...newRows[rowIndex], [colName]: value }
      }
      return { ...t, newRows }
    }))
  }, [setTabs])

  // 删除新行
  const handleDeleteNewRow = useCallback((tabId: string, rowIndex: number) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId || !('tableName' in t)) return t
      const tab = t as TableTab & { newRows: any[] }
      const newRows = [...(tab.newRows || [])]
      newRows.splice(rowIndex, 1)
      return { ...t, newRows }
    }))
  }, [setTabs])

  // 新建查询
  const handleNewQuery = useCallback(() => {
    const newTab: QueryTab = { id: `query-${Date.now()}`, title: `查询 ${tabs.filter(t => !('tableName' in t)).length + 1}`, sql: '', results: null }
    setTabs(prev => [...prev, newTab])
    setActiveTab(newTab.id)
  }, [tabs, setTabs, setActiveTab])

  // 执行查询
  const handleRunQuery = useCallback(async (tabId: string, sql: string) => {
    if (!activeConnection) {
      showNotification('error', '请先连接数据库')
      return
    }
    await runQuery(tabId, activeConnection, sql)
  }, [activeConnection, runQuery, showNotification])

  // 更新SQL
  const handleUpdateSql = useCallback((tabId: string, sql: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, sql } : t))
  }, [setTabs])

  // 更新Tab标题
  const handleUpdateTabTitle = useCallback((tabId: string, title: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title } : t))
  }, [setTabs])

  // 关闭Tab
  const handleCloseTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId)
      if (activeTab === tabId) {
        setActiveTab(filtered.length > 0 ? filtered[filtered.length - 1].id : 'welcome')
      }
      return filtered
    })
  }, [activeTab, setTabs, setActiveTab])

  // 切换Tab
  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId)
  }, [setActiveTab])

  // 更改每页大小
  const handleChangeTablePageSize = useCallback(async (tabId: string, pageSize: number) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, pageSize } : t))
    await handleLoadTablePage(tabId, 1)
  }, [setTabs, handleLoadTablePage])

  // 带类型新建连接
  const handleNewConnectionWithType = useCallback((type: DatabaseType) => {
    setNewConnectionType(type)
    setEditingConnection(null)
    setShowConnectionModal(true)
  }, [])

  // 保存连接
  const handleSaveConnection = useCallback((conn: Omit<Connection, 'id'> & { id?: string }) => {
    if (conn.id) {
      updateConnection(conn as Connection)
    } else {
      addConnection(conn)
    }
  }, [addConnection, updateConnection])

  // 删除连接
  const handleDeleteConnection = useCallback(async (id: string) => {
    if (connectedIds.has(id)) {
      await handleDisconnect(id)
    }
    deleteConnection(id)
  }, [connectedIds, handleDisconnect, deleteConnection])

  // 批量删除连接
  const handleDeleteConnections = useCallback(async (ids: string[]) => {
    for (const id of ids) {
      await handleDeleteConnection(id)
    }
  }, [handleDeleteConnection])

  // 编辑连接
  const handleEditConnection = useCallback((conn: Connection) => {
    setEditingConnection(conn)
    setNewConnectionType(undefined)
    setShowConnectionModal(true)
  }, [])

  // 创建数据库
  const handleCreateDatabase = useCallback((connectionId: string) => {
    setCreateDbConnectionId(connectionId)
    setShowCreateDbModal(true)
  }, [])

  // 删除数据库
  const handleDropDatabase = useCallback(async (connectionId: string, database: string) => {
    try {
      await api.dropDatabase(connectionId, database)
      showNotification('success', `数据库 ${database} 已删除`)
      await fetchDatabases(connectionId)
    } catch (err) {
      showNotification('error', '删除失败：' + (err as Error).message)
    }
  }, [fetchDatabases, showNotification])

  // 创建表
  const handleCreateTable = useCallback((connectionId: string, database: string) => {
    setCreateTableContext({ connectionId, database })
    setShowCreateTableModal(true)
  }, [])

  // 删除表
  const handleDropTable = useCallback(async (connectionId: string, database: string, table: string) => {
    try {
      await api.dropTable(connectionId, database, table)
      showNotification('success', `表 ${table} 已删除`)
      await fetchTables(connectionId, database)
    } catch (err) {
      showNotification('error', '删除失败：' + (err as Error).message)
    }
  }, [fetchTables, showNotification])

  // 清空表
  const handleTruncateTable = useCallback(async (connectionId: string, database: string, table: string) => {
    try {
      await api.truncateTable(connectionId, database, table)
      showNotification('success', `表 ${table} 已清空`)
    } catch (err) {
      showNotification('error', '清空失败：' + (err as Error).message)
    }
  }, [showNotification])

  // 重命名表
  const handleRenameTable = useCallback((connectionId: string, database: string, table: string) => {
    setInputDialog({
      isOpen: true,
      title: '重命名表',
      label: '新表名',
      defaultValue: table,
      onConfirm: async (newName: string) => {
        if (newName && newName !== table) {
          try {
            await api.renameTable(connectionId, database, table, newName)
            showNotification('success', `表已重命名为 ${newName}`)
            await fetchTables(connectionId, database)
          } catch (err) {
            showNotification('error', '重命名失败：' + (err as Error).message)
          }
        }
        setInputDialog(null)
      }
    })
  }, [fetchTables, showNotification])

  // 复制表
  const handleDuplicateTable = useCallback((connectionId: string, database: string, table: string) => {
    setInputDialog({
      isOpen: true,
      title: '复制表',
      label: '新表名',
      defaultValue: `${table}_copy`,
      onConfirm: async (newName: string) => {
        if (newName) {
          try {
            await api.duplicateTable(connectionId, database, table, newName)
            showNotification('success', `表已复制为 ${newName}`)
            await fetchTables(connectionId, database)
          } catch (err) {
            showNotification('error', '复制失败：' + (err as Error).message)
          }
        }
        setInputDialog(null)
      }
    })
  }, [fetchTables, showNotification])

  // 刷新表列表
  const handleRefreshTables = useCallback(async (connectionId: string, database: string) => {
    await fetchTables(connectionId, database)
    showNotification('success', '已刷新')
  }, [fetchTables, showNotification])

  // 设计表
  const handleDesignTable = useCallback(async (connectionId: string, database: string, table: string) => {
    showNotification('info', '表设计器开发中...')
  }, [showNotification])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'q') {
        e.preventDefault()
        handleNewQuery()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNewQuery])

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden font-sans">
      <TitleBar />
      <div className="flex-1 flex min-h-0">
        <Sidebar
          connections={connections}
          activeConnection={activeConnection}
          connectedIds={connectedIds}
          databasesMap={databasesMap}
          tablesMap={tablesMap}
          selectedDatabase={selectedDatabase}
          loadingDbSet={loadingDbSet}
          onNewConnection={() => { setEditingConnection(null); setNewConnectionType(undefined); setShowConnectionModal(true) }}
          onSelectConnection={setActiveConnection}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onEditConnection={handleEditConnection}
          onDeleteConnection={handleDeleteConnection}
          onDeleteConnections={handleDeleteConnections}
          onSelectDatabase={handleSelectDatabase}
          onOpenTable={handleOpenTable}
          onExportConnections={doExportConnections}
          onImportConnections={doImportConnections}
          onCreateDatabase={handleCreateDatabase}
          onDropDatabase={handleDropDatabase}
          onCreateTable={handleCreateTable}
          onDropTable={handleDropTable}
          onTruncateTable={handleTruncateTable}
          onRenameTable={handleRenameTable}
          onDuplicateTable={handleDuplicateTable}
          onRefreshTables={handleRefreshTables}
          onDesignTable={handleDesignTable}
        />
        <MainContent
          tabs={tabs}
          activeTab={activeTab}
          databases={databasesMap.get(activeConnection || '') || []}
          tables={tablesMap.get(selectedDatabase || '') || []}
          columns={columnsMap}
          onTabChange={handleTabChange}
          onCloseTab={handleCloseTab}
          onNewQuery={handleNewQuery}
          onRunQuery={handleRunQuery}
          onUpdateSql={handleUpdateSql}
          onUpdateTabTitle={handleUpdateTabTitle}
          onLoadTablePage={handleLoadTablePage}
          onChangeTablePageSize={handleChangeTablePageSize}
          onNewConnectionWithType={handleNewConnectionWithType}
          onUpdateTableCell={handleUpdateTableCell}
          onDeleteTableRow={handleDeleteTableRow}
          onDeleteTableRows={handleDeleteTableRows}
          onSaveTableChanges={handleSaveTableChanges}
          onDiscardTableChanges={handleDiscardTableChanges}
          onRefreshTable={handleRefreshTable}
          onAddTableRow={handleAddTableRow}
          onUpdateNewRow={handleUpdateNewRow}
          onDeleteNewRow={handleDeleteNewRow}
          loadingTables={loadingTables}
        />
      </div>

      {/* 状态栏 */}
      <div className="h-6 bg-light-surface flex items-center px-3 text-xs border-t border-border-default text-text-tertiary">
        <span className={`w-2 h-2 rounded-full mr-2 ${connectedIds.size > 0 ? 'bg-success-500' : 'bg-text-disabled'}`} />
        <span>{connectedIds.size > 0 ? `${connectedIds.size} 个连接` : '未连接'}</span>
        <span className="ml-auto font-mono text-text-muted">EasySQL v2.0</span>
      </div>

      {/* 通知 */}
      {notification && (
        <div className={`fixed bottom-12 right-4 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-slide-up z-50
          ${notification.type === 'success' ? 'bg-white text-success-600 border border-success-200' : 
            notification.type === 'error' ? 'bg-white text-danger-600 border border-danger-200' : 
            'bg-white text-primary-600 border border-primary-200'}`}>
          {notification.type === 'success' && <CheckCircle size={16} />}
          {notification.type === 'error' && <XCircle size={16} />}
          {notification.type === 'info' && <AlertCircle size={16} />}
          <span className="text-sm">{notification.message}</span>
        </div>
      )}

      {/* 模态框 */}
      <ConnectionModal
        isOpen={showConnectionModal}
        editingConnection={editingConnection}
        initialType={newConnectionType}
        onClose={() => { setShowConnectionModal(false); setEditingConnection(null); setNewConnectionType(undefined) }}
        onSave={handleSaveConnection}
      />

      <CreateDatabaseModal
        isOpen={showCreateDbModal}
        connectionId={createDbConnectionId}
        onClose={() => { setShowCreateDbModal(false); setCreateDbConnectionId(null) }}
        onCreated={async () => {
          if (createDbConnectionId) await fetchDatabases(createDbConnectionId)
        }}
      />

      <CreateTableModal
        isOpen={showCreateTableModal}
        connectionId={createTableContext?.connectionId || null}
        database={createTableContext?.database || null}
        onClose={() => { setShowCreateTableModal(false); setCreateTableContext(null) }}
        onCreated={async () => {
          if (createTableContext) await fetchTables(createTableContext.connectionId, createTableContext.database)
        }}
      />

      {inputDialog && (
        <InputDialog
          isOpen={inputDialog.isOpen}
          title={inputDialog.title}
          label={inputDialog.label}
          defaultValue={inputDialog.defaultValue}
          onClose={() => setInputDialog(null)}
          onConfirm={inputDialog.onConfirm}
        />
      )}
    </div>
  )
}

export default App
