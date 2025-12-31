import { Plus, Database, Table2, ChevronRight, ChevronDown, Loader2, HardDrive, FileSpreadsheet, FileCode, FileText, Search, X, Download, Upload, Trash2, CheckSquare, Square, Eye, Folder, FolderOpen, PlusCircle, Edit3, Copy, RefreshCw, Settings } from 'lucide-react'
import { Connection, DB_INFO, TableInfo } from '../types'
import { useState, useEffect, useRef, useCallback, memo } from 'react'

// 表分组列表
const TableGroupList = memo(function TableGroupList({
  tables,
  db,
  connectionId,
  expandedDbs,
  setExpandedDbs,
  onOpenTable,
  onContextMenu,
}: {
  tables: TableInfo[]
  db: string
  connectionId: string
  expandedDbs: Set<string>
  setExpandedDbs: React.Dispatch<React.SetStateAction<Set<string>>>
  onOpenTable: (connectionId: string, db: string, table: string) => void
  onContextMenu: (e: React.MouseEvent, tableName: string) => void
}) {
  const regularTables = tables.filter(t => !t.isView)
  const views = tables.filter(t => t.isView)
  
  const tablesKey = `${db}_tables`
  const viewsKey = `${db}_views`
  
  const isTablesExpanded = expandedDbs.has(tablesKey)
  const isViewsExpanded = expandedDbs.has(viewsKey)
  
  const toggleGroup = (key: string) => {
    setExpandedDbs(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  
  useEffect(() => {
    if (regularTables.length > 0) {
      setExpandedDbs(prev => new Set(prev).add(tablesKey))
    }
  }, [regularTables.length, tablesKey, setExpandedDbs])
  
  if (tables.length === 0) {
    return <div className="px-4 py-3 text-xs text-text-muted">暂无表</div>
  }
  
  return (
    <div className="py-1">
      {/* 表文件夹 */}
      {regularTables.length > 0 && (
        <div>
          <div
            className="flex items-center gap-2 px-3 py-1.5 mx-2 text-xs text-text-secondary hover:bg-light-hover cursor-pointer transition-colors rounded-lg"
            onClick={() => toggleGroup(tablesKey)}
          >
            <span className="text-text-muted">
              {isTablesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <span className="text-warning-500">
              {isTablesExpanded ? <FolderOpen size={13} /> : <Folder size={13} />}
            </span>
            <span className="flex-1 font-medium">表</span>
            <span className="text-text-muted text-[10px] bg-light-elevated px-1.5 py-0.5 rounded-full">
              {regularTables.length}
            </span>
          </div>
          {isTablesExpanded && (
            <div className="ml-4 pl-2 border-l border-border-light">
              {regularTables.map(table => (
                <div
                  key={table.name}
                  className="flex items-center gap-2 px-2 py-1.5 mr-1 text-text-secondary hover:bg-light-hover cursor-pointer transition-colors rounded-lg group"
                  onClick={() => onOpenTable(connectionId, db, table.name)}
                  onContextMenu={(e) => onContextMenu(e, table.name)}
                  title={table.name}
                >
                  <Table2 size={14} className="text-warning-500 flex-shrink-0" />
                  <span className="truncate font-mono text-[13px] flex-1 min-w-0">{table.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* 视图文件夹 */}
      {views.length > 0 && (
        <div className="mt-1">
          <div
            className="flex items-center gap-2 px-3 py-1.5 mx-2 text-xs text-text-secondary hover:bg-light-hover cursor-pointer transition-colors rounded-lg"
            onClick={() => toggleGroup(viewsKey)}
          >
            <span className="text-text-muted">
              {isViewsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <span className="text-info-500">
              {isViewsExpanded ? <FolderOpen size={13} /> : <Folder size={13} />}
            </span>
            <span className="flex-1 font-medium">视图</span>
            <span className="text-text-muted text-[10px] bg-light-elevated px-1.5 py-0.5 rounded-full">
              {views.length}
            </span>
          </div>
          {isViewsExpanded && (
            <div className="ml-4 pl-2 border-l border-border-light">
              {views.map(view => (
                <div
                  key={view.name}
                  className="flex items-center gap-2 px-2 py-1.5 mr-1 text-text-secondary hover:bg-light-hover cursor-pointer transition-colors rounded-lg group"
                  onClick={() => onOpenTable(connectionId, db, view.name)}
                  onContextMenu={(e) => onContextMenu(e, view.name)}
                  title={view.name}
                >
                  <Eye size={14} className="text-info-500 flex-shrink-0" />
                  <span className="truncate font-mono text-[13px] flex-1 min-w-0">{view.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

interface Props {
  connections: Connection[]
  activeConnection: string | null
  connectedIds: Set<string>
  databasesMap: Map<string, string[]>
  tablesMap: Map<string, TableInfo[]>
  selectedDatabase: string | null
  loadingDbSet: Set<string>
  loadingConnectionsSet?: Set<string>
  onNewConnection: () => void
  onSelectConnection: (id: string) => void
  onConnect: (conn: Connection) => void
  onDisconnect: (id: string) => void
  onEditConnection: (conn: Connection) => void
  onDeleteConnection: (id: string) => void
  onDeleteConnections?: (ids: string[]) => void
  onSelectDatabase: (db: string, connectionId: string) => void
  onOpenTable: (connectionId: string, database: string, table: string) => void
  onBackupDatabase?: (database: string) => void
  onExportTable?: (database: string, table: string, format: 'excel' | 'sql' | 'csv') => void
  onExportConnections?: (format: 'json' | 'ncx') => void
  onImportConnections?: () => void
  onCreateDatabase?: (connectionId: string) => void
  onDropDatabase?: (connectionId: string, database: string) => void
  onCreateTable?: (connectionId: string, database: string) => void
  onDropTable?: (connectionId: string, database: string, table: string) => void
  onTruncateTable?: (connectionId: string, database: string, table: string) => void
  onRenameTable?: (connectionId: string, database: string, table: string) => void
  onDuplicateTable?: (connectionId: string, database: string, table: string) => void
  onRefreshTables?: (connectionId: string, database: string) => void
  onDesignTable?: (connectionId: string, database: string, table: string) => void
  onFetchDatabases?: (connectionId: string) => void
}

function getMenuPosition(x: number, y: number, menuHeight: number = 200, menuWidth: number = 200) {
  const windowHeight = window.innerHeight
  const windowWidth = window.innerWidth
  
  let finalX = x
  let finalY = y
  
  if (y + menuHeight > windowHeight - 10) {
    finalY = Math.max(10, y - menuHeight)
  }
  
  if (x + menuWidth > windowWidth - 10) {
    finalX = Math.max(10, x - menuWidth)
  }
  
  return { x: finalX, y: finalY }
}

export default function Sidebar({
  connections,
  activeConnection,
  connectedIds,
  databasesMap,
  tablesMap,
  selectedDatabase,
  loadingDbSet,
  loadingConnectionsSet,
  onNewConnection,
  onSelectConnection,
  onConnect,
  onDisconnect,
  onEditConnection,
  onDeleteConnection,
  onDeleteConnections,
  onSelectDatabase,
  onOpenTable,
  onBackupDatabase,
  onExportTable,
  onExportConnections,
  onImportConnections,
  onCreateDatabase,
  onDropDatabase,
  onCreateTable,
  onDropTable,
  onTruncateTable,
  onRenameTable,
  onDuplicateTable,
  onRefreshTables,
  onDesignTable,
  onFetchDatabases,
}: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; conn: Connection } | null>(null)
  const [dbMenu, setDbMenu] = useState<{ x: number; y: number; db: string; connectionId: string } | null>(null)
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number; db: string; table: string; connectionId: string } | null>(null)
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set())
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedConnections, setSelectedConnections] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const prevConnectedIdsRef = useRef<Set<string>>(new Set())
  
  useEffect(() => {
    if (selectedDatabase) {
      setExpandedDbs(prev => new Set(prev).add(selectedDatabase))
    }
  }, [selectedDatabase])
  
  // 当连接状态变化时，只展开新建立的连接（不影响其他已连接但被折叠的连接）
  useEffect(() => {
    const prevIds = prevConnectedIdsRef.current
    // 找出新增的连接
    connectedIds.forEach(id => {
      if (!prevIds.has(id)) {
        // 只展开新建立的连接
        setExpandedDbs(prev => new Set(prev).add(id))
      }
    })
    // 更新引用
    prevConnectedIdsRef.current = new Set(connectedIds)
  }, [connectedIds])
  
  const handleSidebarKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && isFocused) {
      e.preventDefault()
      e.stopPropagation()
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
    if (e.key === 'Escape' && searchQuery) {
      setSearchQuery('')
    }
  }, [isFocused, searchQuery])
  
  useEffect(() => {
    const sidebar = sidebarRef.current
    if (sidebar) {
      sidebar.addEventListener('keydown', handleSidebarKeyDown)
      return () => sidebar.removeEventListener('keydown', handleSidebarKeyDown)
    }
  }, [handleSidebarKeyDown])
  
  const getFilteredTables = (db: string) => {
    const dbTables = tablesMap.get(db) || []
    if (!searchQuery) return dbTables
    return dbTables.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }
  
  const dbHasMatchingTables = (db: string) => {
    if (!searchQuery) return false
    const dbTables = tablesMap.get(db) || []
    return dbTables.some(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }
  
  const getFilteredDatabases = (connDatabases: string[]) => {
    return connDatabases.filter(db => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      if (db.toLowerCase().includes(query)) return true
      if (dbHasMatchingTables(db)) return true
      return false
    })
  }
  
  useEffect(() => {
    if (searchQuery) {
      databasesMap.forEach((dbs) => {
        dbs.forEach(db => {
          if (dbHasMatchingTables(db)) {
            setExpandedDbs(prev => new Set(prev).add(db))
          }
        })
      })
    }
  }, [searchQuery, databasesMap, tablesMap])

  return (
    <>
      <div 
        ref={sidebarRef}
        className="w-80 bg-light-surface flex flex-col h-full select-none border-r border-border-default"
        tabIndex={0}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsFocused(false)
          }
        }}
        onMouseEnter={() => setIsFocused(true)}
        onMouseLeave={() => setIsFocused(false)}
      >
        {/* 头部 */}
        <div className="p-3 flex-shrink-0 space-y-2">
          {/* 新建连接按钮 */}
          <button
            onClick={onNewConnection}
            className="w-full h-9 bg-primary-500 hover:bg-primary-600 text-white
                       flex items-center justify-center gap-2 text-sm font-medium
                       transition-all rounded-lg shadow-btn hover:shadow-btn-hover"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>新建连接</span>
          </button>
          
          {/* 导入导出 */}
          <div className="flex gap-2">
            <button
              onClick={onImportConnections}
              className="flex-1 h-8 bg-white hover:bg-light-hover border border-border-default
                         flex items-center justify-center gap-1.5 text-xs text-text-secondary
                         transition-colors rounded-lg"
            >
              <Upload size={13} />
              <span>导入</span>
            </button>
            <div className="relative group flex-1">
              <button
                className="w-full h-8 bg-white hover:bg-light-hover border border-border-default
                           flex items-center justify-center gap-1.5 text-xs text-text-secondary
                           transition-colors rounded-lg"
              >
                <Download size={13} />
                <span>导出</span>
              </button>
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-border-default 
                              rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible 
                              transition-all z-50 overflow-hidden">
                <button
                  onClick={() => onExportConnections?.('json')}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-light-hover flex items-center gap-2 text-text-primary"
                >
                  <FileCode size={12} className="text-primary-500" />
                  导出 JSON
                </button>
                <button
                  onClick={() => onExportConnections?.('ncx')}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-light-hover flex items-center gap-2 text-text-primary"
                >
                  <FileText size={12} className="text-warning-500" />
                  导出 Navicat
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索..."
              className="w-full h-8 pl-9 pr-8 bg-white text-sm text-text-primary placeholder-text-muted
                         border border-border-default focus:border-primary-500 transition-all rounded-lg"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary p-0.5"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* 连接列表 */}
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              连接 · {connections.length}
            </span>
            {connections.length > 0 && (
              <button
                onClick={() => {
                  setMultiSelectMode(!multiSelectMode)
                  if (multiSelectMode) setSelectedConnections(new Set())
                }}
                className={`p-1 rounded transition-colors ${
                  multiSelectMode 
                    ? 'bg-primary-500 text-white' 
                    : 'hover:bg-light-hover text-text-muted'
                }`}
              >
                {multiSelectMode ? <CheckSquare size={12} /> : <Square size={12} />}
              </button>
            )}
          </div>
          
          {/* 多选操作栏 */}
          {multiSelectMode && selectedConnections.size > 0 && (
            <div className="px-3 pb-2 flex items-center gap-2 animate-fade-in">
              <span className="text-xs text-text-tertiary">已选 {selectedConnections.size} 项</span>
              <button
                onClick={() => {
                  if (confirm(`确定删除 ${selectedConnections.size} 个连接？`)) {
                    onDeleteConnections?.([...selectedConnections])
                    setSelectedConnections(new Set())
                    setMultiSelectMode(false)
                  }
                }}
                className="px-2 py-1 text-xs bg-danger-50 text-danger-600 hover:bg-danger-100 rounded-md flex items-center gap-1"
              >
                <Trash2 size={11} />
                删除
              </button>
            </div>
          )}
          
          {connections.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-light-elevated flex items-center justify-center">
                <Database size={24} className="text-text-muted" />
              </div>
              <p className="text-text-muted text-sm">暂无连接</p>
              <p className="text-text-disabled text-xs mt-1">点击上方按钮创建</p>
            </div>
          ) : (
            <div className="px-2 pb-3 space-y-0.5">
              {connections.map(conn => {
                const info = DB_INFO[conn.type]
                const isConnected = connectedIds.has(conn.id)
                const isActive = activeConnection === conn.id
                const isSelected = selectedConnections.has(conn.id)
                const isExpanded = expandedDbs.has(conn.id)
                const connDatabases = databasesMap.get(conn.id) || []
                const showDatabases = isExpanded && isConnected && connDatabases.length > 0

                return (
                  <div key={conn.id}>
                    <div
                      className={`group flex items-center gap-2 px-2.5 py-2 cursor-pointer transition-all rounded-lg
                        ${isSelected ? 'bg-primary-50 ring-1 ring-primary-200' : ''}
                        ${isActive && !isSelected ? 'bg-light-hover' : 'hover:bg-light-hover'}`}
                      onClick={() => {
                        if (multiSelectMode) {
                          setSelectedConnections(prev => {
                            const next = new Set(prev)
                            if (next.has(conn.id)) next.delete(conn.id)
                            else next.add(conn.id)
                            return next
                          })
                        } else {
                          onSelectConnection(conn.id)
                          if (isConnected) {
                            const willExpand = !expandedDbs.has(conn.id)
                            setExpandedDbs(prev => {
                              const next = new Set(prev)
                              if (next.has(conn.id)) next.delete(conn.id)
                              else next.add(conn.id)
                              return next
                            })
                            // 如果展开但数据库列表为空，尝试获取
                            if (willExpand && connDatabases.length === 0 && onFetchDatabases) {
                              onFetchDatabases(conn.id)
                            }
                          }
                        }
                      }}
                      onDoubleClick={async () => {
                        if (!multiSelectMode && !isConnected) {
                          await onConnect(conn)
                          setExpandedDbs(prev => new Set(prev).add(conn.id))
                        }
                      }}
                      onContextMenu={(e) => { 
                        e.preventDefault()
                        const pos = getMenuPosition(e.clientX, e.clientY, 200)
                        setMenu({ x: pos.x, y: pos.y, conn }) 
                      }}
                    >
                      <span className="w-4 flex-shrink-0 flex items-center justify-center">
                        {multiSelectMode ? (
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[10px]
                            ${isSelected ? 'bg-primary-500 border-primary-500 text-white' : 'border-border-strong'}`}>
                            {isSelected && '✓'}
                          </span>
                        ) : (
                          <span className={isConnected ? 'text-text-muted' : 'opacity-0'}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                        )}
                      </span>
                      <span className="text-lg flex-shrink-0">{info?.icon}</span>
                      <span className="flex-1 text-sm truncate font-medium text-text-primary">{conn.name}</span>
                      <span className={`status-dot flex-shrink-0 ${isConnected ? 'connected' : 'disconnected'}`} />
                    </div>
                    
                    {/* 数据库列表 */}
                    {isExpanded && isConnected && (
                      <div className="ml-5 mt-0.5 pl-3 border-l border-border-light animate-slide-down">
                        {loadingConnectionsSet?.has(conn.id) ? (
                          <div className="px-2.5 py-2 text-sm text-text-muted flex items-center gap-2">
                            <span className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                            加载数据库...
                          </div>
                        ) : connDatabases.length === 0 ? (
                          <div className="px-2.5 py-2 text-sm text-text-muted">
                            无数据库或无权限
                          </div>
                        ) : getFilteredDatabases(connDatabases).map(db => {
                          const isDbSelected = selectedDatabase === db
                          const isDbExpanded = expandedDbs.has(db)
                          const dbTables = getFilteredTables(db)
                          const isLoading = loadingDbSet.has(db)
                          
                          return (
                            <div key={db}>
                              <div
                                className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-sm transition-all rounded-lg mx-1
                                  ${isDbSelected ? 'bg-primary-50 text-primary-700' : 'text-text-secondary hover:bg-light-hover'}`}
                                onClick={() => {
                                  const willExpand = !expandedDbs.has(db)
                                  if (willExpand) onSelectDatabase(db, conn.id)
                                  setExpandedDbs(prev => {
                                    const next = new Set(prev)
                                    if (next.has(db)) next.delete(db)
                                    else next.add(db)
                                    return next
                                  })
                                }}
                                onContextMenu={(e) => { 
                                  e.preventDefault()
                                  const pos = getMenuPosition(e.clientX, e.clientY, 220)
                                  setDbMenu({ x: pos.x, y: pos.y, db, connectionId: conn.id }) 
                                }}
                              >
                                <span className="text-text-muted">
                                  {isDbExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </span>
                                <Database size={14} className={isDbSelected ? 'text-primary-500' : 'text-teal-500'} />
                                <span className="flex-1 truncate">{db}</span>
                              </div>
                              
                              {isDbExpanded && (
                                <div className="ml-4 mt-0.5">
                                  {isLoading ? (
                                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
                                      <Loader2 size={12} className="animate-spin text-primary-500" />
                                      加载中...
                                    </div>
                                  ) : (
                                    <TableGroupList 
                                      tables={dbTables}
                                      db={db}
                                      connectionId={conn.id}
                                      expandedDbs={expandedDbs}
                                      setExpandedDbs={setExpandedDbs}
                                      onOpenTable={onOpenTable}
                                      onContextMenu={(e, tableName) => {
                                        e.preventDefault()
                                        const pos = getMenuPosition(e.clientX, e.clientY, 320)
                                        setTableMenu({ x: pos.x, y: pos.y, db, table: tableName, connectionId: conn.id })
                                      }}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 右键菜单 - 连接 */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 bg-white border border-border-default py-1.5 min-w-[180px] rounded-xl shadow-modal menu"
            style={{ left: menu.x, top: menu.y }}
          >
            {connectedIds.has(menu.conn.id) ? (
              <>
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
                  onClick={() => { onDisconnect(menu.conn.id); setMenu(null) }}
                >
                  <span className="w-3 h-3 rounded-full border-2 border-danger-500" />
                  断开连接
                </button>
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
                  onClick={() => { onCreateDatabase?.(menu.conn.id); setMenu(null) }}
                >
                  <PlusCircle size={14} className="text-success-500" />
                  新建数据库
                </button>
                <div className="my-1.5 mx-2 border-t border-border-light" />
              </>
            ) : (
              <button
                className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
                onClick={() => { 
                  onConnect(menu.conn)
                  setExpandedDbs(prev => new Set(prev).add(menu.conn.id))
                  setMenu(null) 
                }}
              >
                <span className="w-3 h-3 rounded-full border-2 border-success-500" />
                连接
              </button>
            )}
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
              onClick={() => { onEditConnection(menu.conn); setMenu(null) }}
            >
              <Edit3 size={14} className="text-text-muted" />
              编辑
            </button>
            <div className="my-1.5 mx-2 border-t border-border-light" />
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-danger-50 text-danger-600 flex items-center gap-3"
              onClick={() => { onDeleteConnection(menu.conn.id); setMenu(null) }}
            >
              <Trash2 size={14} />
              删除
            </button>
          </div>
        </>
      )}

      {/* 右键菜单 - 数据库 */}
      {dbMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDbMenu(null)} />
          <div
            className="fixed z-50 bg-white border border-border-default py-1.5 min-w-[180px] rounded-xl shadow-modal menu"
            style={{ left: dbMenu.x, top: dbMenu.y }}
          >
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
              onClick={() => { onCreateTable?.(dbMenu.connectionId, dbMenu.db); setDbMenu(null) }}
            >
              <PlusCircle size={14} className="text-success-500" />
              新建表
            </button>
            <div className="my-1.5 mx-2 border-t border-border-light" />
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
              onClick={() => { onRefreshTables?.(dbMenu.connectionId, dbMenu.db); setDbMenu(null) }}
            >
              <RefreshCw size={14} className="text-text-muted" />
              刷新
            </button>
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
              onClick={() => { onBackupDatabase?.(dbMenu.db); setDbMenu(null) }}
            >
              <HardDrive size={14} className="text-primary-500" />
              备份
            </button>
            <div className="my-1.5 mx-2 border-t border-border-light" />
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-danger-50 text-danger-600 flex items-center gap-3"
              onClick={() => { 
                if (confirm(`确定删除数据库 "${dbMenu.db}"？`)) {
                  onDropDatabase?.(dbMenu.connectionId, dbMenu.db)
                }
                setDbMenu(null) 
              }}
            >
              <Trash2 size={14} />
              删除数据库
            </button>
          </div>
        </>
      )}

      {/* 右键菜单 - 表 */}
      {tableMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setTableMenu(null)} />
          <div
            className="fixed z-50 bg-white border border-border-default py-1.5 min-w-[180px] rounded-xl shadow-modal menu"
            style={{ left: tableMenu.x, top: tableMenu.y }}
          >
            <div className="px-3 py-1.5 text-xs text-text-muted border-b border-border-light mb-1 font-mono">
              {tableMenu.table}
            </div>
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
              onClick={() => { onOpenTable(tableMenu.connectionId, tableMenu.db, tableMenu.table); setTableMenu(null) }}
            >
              <Table2 size={14} className="text-warning-500" />
              打开表
            </button>
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
              onClick={() => { onDesignTable?.(tableMenu.connectionId, tableMenu.db, tableMenu.table); setTableMenu(null) }}
            >
              <Settings size={14} className="text-teal-500" />
              设计表
            </button>
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
              onClick={() => { onRenameTable?.(tableMenu.connectionId, tableMenu.db, tableMenu.table); setTableMenu(null) }}
            >
              <Edit3 size={14} className="text-primary-500" />
              重命名
            </button>
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
              onClick={() => { onDuplicateTable?.(tableMenu.connectionId, tableMenu.db, tableMenu.table); setTableMenu(null) }}
            >
              <Copy size={14} className="text-info-500" />
              复制表
            </button>
            <div className="my-1.5 mx-2 border-t border-border-light" />
            <div className="px-3 py-1 text-[10px] text-text-muted uppercase">导出</div>
            <button
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
              onClick={() => { onExportTable?.(tableMenu.db, tableMenu.table, 'excel'); setTableMenu(null) }}
            >
              <FileSpreadsheet size={14} className="text-success-500" />
              Excel
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
              onClick={() => { onExportTable?.(tableMenu.db, tableMenu.table, 'sql'); setTableMenu(null) }}
            >
              <FileCode size={14} className="text-warning-500" />
              SQL
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-light-hover flex items-center gap-3 text-text-secondary"
              onClick={() => { onExportTable?.(tableMenu.db, tableMenu.table, 'csv'); setTableMenu(null) }}
            >
              <FileText size={14} className="text-primary-500" />
              CSV
            </button>
            <div className="my-1.5 mx-2 border-t border-border-light" />
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-warning-50 text-warning-600 flex items-center gap-3"
              onClick={() => { 
                if (confirm(`确定清空表 "${tableMenu.table}"？`)) {
                  onTruncateTable?.(tableMenu.connectionId, tableMenu.db, tableMenu.table)
                }
                setTableMenu(null) 
              }}
            >
              <RefreshCw size={14} />
              清空表
            </button>
            <button
              className="w-full px-3 py-2 text-left text-sm hover:bg-danger-50 text-danger-600 flex items-center gap-3"
              onClick={() => { 
                if (confirm(`确定删除表 "${tableMenu.table}"？`)) {
                  onDropTable?.(tableMenu.connectionId, tableMenu.db, tableMenu.table)
                }
                setTableMenu(null) 
              }}
            >
              <Trash2 size={14} />
              删除表
            </button>
          </div>
        </>
      )}
    </>
  )
}
