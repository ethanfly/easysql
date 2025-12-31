import { useState, useEffect, useCallback, useMemo } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import ConnectionModal from './components/ConnectionModal'
import CreateDatabaseModal from './components/CreateDatabaseModal'
import CreateTableModal from './components/CreateTableModal'
import InputDialog from './components/InputDialog'
import TableDesigner from './components/TableDesigner'
import { Connection, QueryTab, DatabaseType, TableInfo, ColumnInfo, TableTab } from './types'
import api from './lib/electron-api'
import { useDebouncedCallback } from './lib/hooks'
import { Edit3, Copy } from 'lucide-react'

// 统一的标签页类型
type Tab = QueryTab | TableTab

export default function App() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [activeConnection, setActiveConnection] = useState<string | null>(null)
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set())
  // 每个连接的数据库列表独立存储: connectionId -> databases[]
  const [databasesMap, setDatabasesMap] = useState<Map<string, string[]>>(new Map())
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null)
  // 每个数据库的表列表独立存储: "connectionId:database" -> tables[]
  const [tablesMap, setTablesMap] = useState<Map<string, TableInfo[]>>(new Map())
  const [loadingDbSet, setLoadingDbSet] = useState<Set<string>>(new Set())
  const [loadingTables, setLoadingTables] = useState<Set<string>>(new Set())  // 正在加载的表标签
  const [allColumns, setAllColumns] = useState<Map<string, ColumnInfo[]>>(new Map())
  const [showModal, setShowModal] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [defaultDbType, setDefaultDbType] = useState<DatabaseType | undefined>(undefined)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState<string>('welcome')
  const [status, setStatus] = useState({ text: '就绪', type: 'success' as 'success' | 'error' | 'warning' | 'info' })
  
  // 数据库/表管理相关状态
  const [showCreateDbModal, setShowCreateDbModal] = useState(false)
  const [createDbConnectionId, setCreateDbConnectionId] = useState<string | null>(null)
  const [showCreateTableModal, setShowCreateTableModal] = useState(false)
  const [createTableInfo, setCreateTableInfo] = useState<{ connectionId: string; database: string } | null>(null)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameInfo, setRenameInfo] = useState<{ connectionId: string; database: string; table: string } | null>(null)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [duplicateInfo, setDuplicateInfo] = useState<{ connectionId: string; database: string; table: string } | null>(null)
  
  // 表设计器状态
  const [showTableDesigner, setShowTableDesigner] = useState(false)
  const [tableDesignerInfo, setTableDesignerInfo] = useState<{
    mode: 'create' | 'edit'
    connectionId: string
    database: string
    tableName?: string
  } | null>(null)

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
      // 存储该连接的数据库列表
      setDatabasesMap(prev => new Map(prev).set(conn.id, dbs || []))
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
    // 清理该连接的数据
    setDatabasesMap(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    // 清理该连接相关的表数据
    setTablesMap(prev => {
      const next = new Map(prev)
      for (const key of next.keys()) {
        if (key.startsWith(`${id}:`)) {
          next.delete(key)
        }
      }
      return next
    })
    if (activeConnection === id) {
      setActiveConnection(null)
      setSelectedDatabase(null)
    }
  }

  // 切换选中的连接，如果已连接且尚未加载数据库列表则加载
  const handleSelectConnection = async (id: string) => {
    setActiveConnection(id)
    
    // 如果该连接已经连接，且尚未加载过数据库列表
    if (connectedIds.has(id) && !databasesMap.has(id)) {
      setStatus({ text: '正在加载数据库列表...', type: 'info' })
      
      try {
        const dbs = await api.getDatabases(id)
        setDatabasesMap(prev => new Map(prev).set(id, dbs || []))
        setStatus({ text: `${dbs?.length || 0} 个数据库`, type: 'success' })
      } catch (err: any) {
        setStatus({ text: err.message, type: 'error' })
      }
    }
  }

  const handleSelectDatabase = useCallback(async (db: string, connectionId: string) => {
    // 如果已经加载过该数据库的表，只更新选中状态
    if (tablesMap.has(db)) {
      setSelectedDatabase(db)
      return
    }
    
    setSelectedDatabase(db)
    // 标记该数据库正在加载
    setLoadingDbSet(prev => new Set(prev).add(db))
    setStatus({ text: `正在加载 ${db} 的表...`, type: 'info' })
    
    try {
      const tableList = await api.getTables(connectionId, db)
      // 更新该数据库的表列表（不影响其他数据库）
      setTablesMap(prev => {
        const next = new Map(prev)
        next.set(db, tableList || [])
        return next
      })
      setLoadingDbSet(prev => {
        const next = new Set(prev)
        next.delete(db)
        return next
      })
      
      // 获取所有表的字段信息用于代码提示 - 并行加载以提高性能
      if (tableList && tableList.length > 0) {
        const columnsPromises = tableList.map(async (table) => {
          const cols = await api.getColumns(connectionId, db, table.name)
          return { name: table.name, cols: cols || [] }
        })
        
        const columnsResults = await Promise.all(columnsPromises)
        setAllColumns(prev => {
          const next = new Map(prev)
          columnsResults.forEach(({ name, cols }) => {
            if (cols.length > 0) next.set(name, cols)
          })
          return next
        })
      }
      
      setStatus({ text: `${db}: ${tableList?.length || 0} 个表`, type: 'success' })
    } catch (err: any) {
      setLoadingDbSet(prev => {
        const next = new Set(prev)
        next.delete(db)
        return next
      })
      setStatus({ text: err.message, type: 'error' })
    }
  }, [tablesMap])

  const handleNewQuery = (name?: string) => {
    const id = `query-${Date.now()}`
    const newTab: QueryTab = { id, title: name || '查询', sql: '', results: null }
    setTabs(prev => [...prev, newTab])
    setActiveTab(id)
  }

  const handleOpenTable = async (connectionId: string, database: string, tableName: string) => {
    // 检查是否已经打开了这个表（同一连接、同一数据库、同一表）
    const existingTab = tabs.find(t => 
      'tableName' in t && 
      t.tableName === tableName && 
      t.database === database &&
      t.connectionId === connectionId
    )
    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }
    
    // 先创建空标签页并显示 loading
    const id = `table-${Date.now()}`
    const emptyTab: TableTab = {
      id,
      type: 'table',
      tableName,
      database,
      connectionId,
      columns: [],
      data: [],
      total: 0,
      page: 1,
      pageSize: 1000,
      originalData: [],
      pendingChanges: new Map(),
      deletedRows: new Set()
    }
    
    setTabs(prev => [...prev, emptyTab])
    setActiveTab(id)
    setLoadingTables(prev => new Set(prev).add(id))
    setStatus({ text: `正在加载 ${tableName}...`, type: 'info' })
    
    try {
      // 使用传入的 connectionId 而不是 activeConnection，默认1000条
      const result = await api.getTableData(connectionId, database, tableName, 1, 1000)
      // 使用返回的 columns，确保列顺序和数据一致
      const columns = result?.columns || []
      
      // 更新标签页数据
      setTabs(prev => prev.map(t => 
        t.id === id 
          ? {
              ...t,
              columns,
              data: result?.data || [],
              total: result?.total || 0,
              originalData: result?.data || [],
            }
          : t
      ))
      setStatus({ text: `${tableName}: ${result?.total || 0} 行`, type: 'success' })
    } catch (err: any) {
      setStatus({ text: err.message, type: 'error' })
      // 加载失败时关闭标签页
      setTabs(prev => prev.filter(t => t.id !== id))
      setActiveTab('welcome')
    } finally {
      setLoadingTables(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleLoadTablePage = async (tabId: string, page: number) => {
    const tab = tabs.find(t => t.id === tabId) as TableTab | undefined
    if (!tab || !('tableName' in tab)) return
    
    // 设置加载状态
    setLoadingTables(prev => new Set(prev).add(tabId))
    setStatus({ text: `加载第 ${page} 页...`, type: 'info' })
    
    try {
      const result = await api.getTableData(
        tab.connectionId, tab.database, tab.tableName, page, tab.pageSize
      )
      
      setTabs(prev => prev.map(t => 
        t.id === tabId && 'tableName' in t 
          ? { ...t, data: result?.data || [], page, originalData: result?.data || [], pendingChanges: new Map(), deletedRows: new Set() } 
          : t
      ))
      setStatus({ text: `${tab.tableName}: 第 ${page} 页`, type: 'success' })
    } catch (err: any) {
      setStatus({ text: err.message, type: 'error' })
    } finally {
      setLoadingTables(prev => {
        const next = new Set(prev)
        next.delete(tabId)
        return next
      })
    }
  }

  // 修改每页显示条数
  const handleChangeTablePageSize = async (tabId: string, pageSize: number) => {
    const tab = tabs.find(t => t.id === tabId) as TableTab | undefined
    if (!tab || !('tableName' in tab)) return
    
    // 设置加载状态
    setLoadingTables(prev => new Set(prev).add(tabId))
    setStatus({ text: `切换为每页 ${pageSize} 条...`, type: 'info' })
    
    try {
      // 重新从第1页加载
      const result = await api.getTableData(
        tab.connectionId, tab.database, tab.tableName, 1, pageSize
      )
      
      setTabs(prev => prev.map(t => 
        t.id === tabId && 'tableName' in t 
          ? { ...t, data: result?.data || [], page: 1, pageSize, originalData: result?.data || [], pendingChanges: new Map(), deletedRows: new Set() } 
          : t
      ))
      setStatus({ text: `${tab.tableName}: 每页 ${pageSize} 条`, type: 'success' })
    } catch (err: any) {
      setStatus({ text: err.message, type: 'error' })
    } finally {
      setLoadingTables(prev => {
        const next = new Set(prev)
        next.delete(tabId)
        return next
      })
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
    if (!tab || !('tableName' in tab)) return
    
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
            tab.connectionId,
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
            tab.connectionId,
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
        tab.connectionId, tab.database, tab.tableName, tab.page, tab.pageSize
      )
      const totalResult = await api.getTableData(
        tab.connectionId, tab.database, tab.tableName, 1, 1
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

  // 刷新表数据
  const handleRefreshTable = async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId) as TableTab | undefined
    if (!tab || !('tableName' in tab)) return
    
    // 设置加载状态
    setLoadingTables(prev => new Set(prev).add(tabId))
    setStatus({ text: `刷新 ${tab.tableName}...`, type: 'info' })
    
    try {
      const result = await api.getTableData(
        tab.connectionId, tab.database, tab.tableName, tab.page, tab.pageSize
      )
      const totalResult = await api.getTableData(
        tab.connectionId, tab.database, tab.tableName, 1, 1
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
      setStatus({ text: `${tab.tableName}: ${totalResult?.total || 0} 行`, type: 'success' })
    } catch (err: any) {
      setStatus({ text: err.message, type: 'error' })
    } finally {
      setLoadingTables(prev => {
        const next = new Set(prev)
        next.delete(tabId)
        return next
      })
    }
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

  // ============ 数据库管理 ============
  const handleCreateDatabase = (connectionId: string) => {
    setCreateDbConnectionId(connectionId)
    setShowCreateDbModal(true)
  }

  const handleSubmitCreateDatabase = async (name: string, charset: string, collation: string) => {
    if (!createDbConnectionId) return
    
    setShowCreateDbModal(false)
    setStatus({ text: `正在创建数据库 ${name}...`, type: 'info' })
    
    const result = await api.createDatabase(createDbConnectionId, name, charset, collation)
    
    if (result?.success) {
      setStatus({ text: `数据库 ${name} 创建成功`, type: 'success' })
      // 刷新数据库列表
      const dbs = await api.getDatabases(createDbConnectionId)
      setDatabasesMap(prev => new Map(prev).set(createDbConnectionId!, dbs || []))
    } else {
      setStatus({ text: result?.message || '创建失败', type: 'error' })
    }
    setCreateDbConnectionId(null)
  }

  const handleDropDatabase = async (connectionId: string, database: string) => {
    setStatus({ text: `正在删除数据库 ${database}...`, type: 'info' })
    
    const result = await api.dropDatabase(connectionId, database)
    
    if (result?.success) {
      setStatus({ text: `数据库 ${database} 已删除`, type: 'success' })
      // 刷新数据库列表
      const dbs = await api.getDatabases(connectionId)
      setDatabasesMap(prev => new Map(prev).set(connectionId, dbs || []))
      // 清理该数据库的表数据
      setTablesMap(prev => {
        const next = new Map(prev)
        next.delete(database)
        return next
      })
      if (selectedDatabase === database) {
        setSelectedDatabase(null)
      }
    } else {
      setStatus({ text: result?.message || '删除失败', type: 'error' })
    }
  }

  // ============ 表管理 ============
  const handleCreateTable = (connectionId: string, database: string) => {
    // 使用表设计器创建表
    handleCreateTableWithDesigner(connectionId, database)
  }

  const handleSubmitCreateTable = async (tableName: string, columns: any[]) => {
    if (!createTableInfo) return
    
    const { connectionId, database } = createTableInfo
    setShowCreateTableModal(false)
    setStatus({ text: `正在创建表 ${tableName}...`, type: 'info' })
    
    // 转换列定义格式
    const formattedColumns = columns.map(col => ({
      name: col.name,
      type: col.length ? `${col.type}(${col.length})` : col.type,
      nullable: col.nullable,
      primaryKey: col.primaryKey,
      autoIncrement: col.autoIncrement,
      defaultValue: col.defaultValue,
      comment: col.comment,
    }))
    
    const result = await api.createTable(connectionId, database, tableName, formattedColumns)
    
    if (result?.success) {
      setStatus({ text: `表 ${tableName} 创建成功`, type: 'success' })
      // 刷新表列表
      handleRefreshTables(connectionId, database)
    } else {
      setStatus({ text: result?.message || '创建失败', type: 'error' })
    }
    setCreateTableInfo(null)
  }

  const handleDropTable = async (connectionId: string, database: string, table: string) => {
    setStatus({ text: `正在删除表 ${table}...`, type: 'info' })
    
    const result = await api.dropTable(connectionId, database, table)
    
    if (result?.success) {
      setStatus({ text: `表 ${table} 已删除`, type: 'success' })
      // 刷新表列表
      handleRefreshTables(connectionId, database)
      // 关闭相关的表标签页
      setTabs(prev => prev.filter(t => !('tableName' in t) || t.tableName !== table || t.database !== database))
    } else {
      setStatus({ text: result?.message || '删除失败', type: 'error' })
    }
  }

  const handleTruncateTable = async (connectionId: string, database: string, table: string) => {
    setStatus({ text: `正在清空表 ${table}...`, type: 'info' })
    
    const result = await api.truncateTable(connectionId, database, table)
    
    if (result?.success) {
      setStatus({ text: `表 ${table} 已清空`, type: 'success' })
      // 刷新打开的表标签页数据
      const tableTab = tabs.find(t => 'tableName' in t && t.tableName === table && t.database === database)
      if (tableTab) {
        handleRefreshTable(tableTab.id)
      }
    } else {
      setStatus({ text: result?.message || '清空失败', type: 'error' })
    }
  }

  const handleRenameTable = (connectionId: string, database: string, table: string) => {
    setRenameInfo({ connectionId, database, table })
    setShowRenameDialog(true)
  }

  const handleSubmitRenameTable = async (newName: string) => {
    if (!renameInfo) return
    
    const { connectionId, database, table } = renameInfo
    setShowRenameDialog(false)
    setStatus({ text: `正在重命名表 ${table} -> ${newName}...`, type: 'info' })
    
    const result = await api.renameTable(connectionId, database, table, newName)
    
    if (result?.success) {
      setStatus({ text: `表已重命名为 ${newName}`, type: 'success' })
      // 刷新表列表
      handleRefreshTables(connectionId, database)
      // 更新打开的表标签页
      setTabs(prev => prev.map(t => 
        ('tableName' in t && t.tableName === table && t.database === database) 
          ? { ...t, tableName: newName } 
          : t
      ))
    } else {
      setStatus({ text: result?.message || '重命名失败', type: 'error' })
    }
    setRenameInfo(null)
  }

  const handleDuplicateTable = (connectionId: string, database: string, table: string) => {
    setDuplicateInfo({ connectionId, database, table })
    setShowDuplicateDialog(true)
  }

  const handleSubmitDuplicateTable = async (newName: string, withData: boolean) => {
    if (!duplicateInfo) return
    
    const { connectionId, database, table } = duplicateInfo
    setShowDuplicateDialog(false)
    setStatus({ text: `正在复制表 ${table} -> ${newName}...`, type: 'info' })
    
    const result = await api.duplicateTable(connectionId, database, table, newName, withData)
    
    if (result?.success) {
      setStatus({ text: `表已复制为 ${newName}`, type: 'success' })
      // 刷新表列表
      handleRefreshTables(connectionId, database)
    } else {
      setStatus({ text: result?.message || '复制失败', type: 'error' })
    }
    setDuplicateInfo(null)
  }

  const handleRefreshTables = async (connectionId: string, database: string) => {
    setLoadingDbSet(prev => new Set(prev).add(database))
    setStatus({ text: `刷新 ${database} 表列表...`, type: 'info' })
    
    try {
      const tableList = await api.getTables(connectionId, database)
      setTablesMap(prev => {
        const next = new Map(prev)
        next.set(database, tableList || [])
        return next
      })
      setStatus({ text: `${database}: ${tableList?.length || 0} 个表`, type: 'success' })
    } catch (err: any) {
      setStatus({ text: err.message, type: 'error' })
    } finally {
      setLoadingDbSet(prev => {
        const next = new Set(prev)
        next.delete(database)
        return next
      })
    }
  }

  // ============ 表设计器 ============
  const handleDesignTable = (connectionId: string, database: string, tableName: string) => {
    setTableDesignerInfo({
      mode: 'edit',
      connectionId,
      database,
      tableName,
    })
    setShowTableDesigner(true)
  }

  const handleCreateTableWithDesigner = (connectionId: string, database: string) => {
    setTableDesignerInfo({
      mode: 'create',
      connectionId,
      database,
    })
    setShowTableDesigner(true)
  }

  const handleSaveTableDesign = async (sql: string): Promise<{ success: boolean; message: string }> => {
    if (!tableDesignerInfo) return { success: false, message: '无效的操作' }
    
    const { connectionId, database } = tableDesignerInfo
    setStatus({ text: '正在保存表结构...', type: 'info' })
    
    const result = await api.executeMultiSQL(connectionId, sql)
    
    if (result?.success) {
      setStatus({ text: '表结构保存成功', type: 'success' })
      // 刷新表列表
      handleRefreshTables(connectionId, database)
      return { success: true, message: '保存成功' }
    } else {
      setStatus({ text: result?.message || '保存失败', type: 'error' })
      return { success: false, message: result?.message || '保存失败' }
    }
  }

  const handleGetTableInfo = useCallback(async () => {
    if (!tableDesignerInfo || tableDesignerInfo.mode !== 'edit' || !tableDesignerInfo.tableName) {
      return { columns: [], indexes: [], foreignKeys: [], options: {} as any }
    }
    const { connectionId, database, tableName } = tableDesignerInfo
    return await api.getTableInfo(connectionId, database, tableName)
  }, [tableDesignerInfo])

  const handleGetDatabasesForDesigner = async () => {
    if (!tableDesignerInfo) return []
    return await api.getDatabases(tableDesignerInfo.connectionId)
  }

  const handleGetTablesForDesigner = async (database: string) => {
    if (!tableDesignerInfo) return []
    const tables = await api.getTables(tableDesignerInfo.connectionId, database)
    return tables.map(t => t.name)
  }

  const handleGetColumnsForDesigner = async (database: string, table: string) => {
    if (!tableDesignerInfo) return []
    return await api.getColumnNames(tableDesignerInfo.connectionId, database, table)
  }

  // 获取当前连接的数据库类型
  const getConnectionDbType = (connectionId: string): string => {
    const conn = connections.find(c => c.id === connectionId)
    return conn?.type || 'mysql'
  }

  return (
    <div className="h-screen flex flex-col bg-metro-dark overflow-hidden">
      <TitleBar />
      
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          connections={connections}
          activeConnection={activeConnection}
          connectedIds={connectedIds}
          databasesMap={databasesMap}
          tablesMap={tablesMap}
          selectedDatabase={selectedDatabase}
          loadingDbSet={loadingDbSet}
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
          onCreateDatabase={handleCreateDatabase}
          onDropDatabase={handleDropDatabase}
          onCreateTable={handleCreateTable}
          onDropTable={handleDropTable}
          onTruncateTable={handleTruncateTable}
          onRenameTable={handleRenameTable}
          onDuplicateTable={handleDuplicateTable}
          onRefreshTables={handleRefreshTables}
          onDesignTable={handleDesignTable}
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
          databases={activeConnection ? (databasesMap.get(activeConnection) || []) : []}
          tables={selectedDatabase ? (tablesMap.get(selectedDatabase) || []) : []}
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
          onChangeTablePageSize={handleChangeTablePageSize}
          onUpdateTableCell={handleUpdateTableCell}
          onDeleteTableRow={handleDeleteTableRow}
          onDeleteTableRows={handleDeleteTableRows}
          onSaveTableChanges={handleSaveTableChanges}
          onDiscardTableChanges={handleDiscardTableChanges}
          onRefreshTable={handleRefreshTable}
          loadingTables={loadingTables}
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

      {/* 创建数据库对话框 */}
      <CreateDatabaseModal
        isOpen={showCreateDbModal}
        onClose={() => { setShowCreateDbModal(false); setCreateDbConnectionId(null) }}
        onSubmit={handleSubmitCreateDatabase}
      />

      {/* 创建表对话框 */}
      <CreateTableModal
        isOpen={showCreateTableModal}
        database={createTableInfo?.database || ''}
        onClose={() => { setShowCreateTableModal(false); setCreateTableInfo(null) }}
        onSubmit={handleSubmitCreateTable}
      />

      {/* 重命名表对话框 */}
      <InputDialog
        isOpen={showRenameDialog}
        title="重命名表"
        label="新表名"
        placeholder="输入新的表名"
        defaultValue={renameInfo?.table || ''}
        confirmText="重命名"
        icon={<Edit3 size={18} className="text-accent-blue" />}
        onClose={() => { setShowRenameDialog(false); setRenameInfo(null) }}
        onSubmit={handleSubmitRenameTable}
      />

      {/* 复制表对话框 */}
      <InputDialog
        isOpen={showDuplicateDialog}
        title="复制表"
        label="新表名"
        placeholder="输入新的表名"
        defaultValue={duplicateInfo?.table ? `${duplicateInfo.table}_copy` : ''}
        confirmText="复制"
        icon={<Copy size={18} className="text-accent-purple" />}
        showDataOption
        onClose={() => { setShowDuplicateDialog(false); setDuplicateInfo(null) }}
        onSubmit={(name) => handleSubmitDuplicateTable(name, false)}
        onSubmitWithData={handleSubmitDuplicateTable}
      />

      {/* 表设计器 */}
      {showTableDesigner && tableDesignerInfo && (
        <TableDesigner
          isOpen={true}
          mode={tableDesignerInfo.mode}
          database={tableDesignerInfo.database}
          tableName={tableDesignerInfo.tableName}
          connectionId={tableDesignerInfo.connectionId}
          dbType={getConnectionDbType(tableDesignerInfo.connectionId)}
          onClose={() => { setShowTableDesigner(false); setTableDesignerInfo(null) }}
          onSave={handleSaveTableDesign}
          onGetTableInfo={tableDesignerInfo.mode === 'edit' ? handleGetTableInfo : undefined}
          onGetDatabases={handleGetDatabasesForDesigner}
          onGetTables={handleGetTablesForDesigner}
          onGetColumns={handleGetColumnsForDesigner}
        />
      )}
    </div>
  )
}
