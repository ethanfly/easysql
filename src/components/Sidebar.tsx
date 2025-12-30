import { Plus, Database, MoreHorizontal, Table2, ChevronRight, ChevronDown, Loader2, HardDrive, FileSpreadsheet, FileCode, FileText, Search, X, Download, Upload, Trash2, CheckSquare, Square, Eye } from 'lucide-react'
import { Connection, DB_INFO, TableInfo } from '../types'
import { useState, useEffect, useRef, useCallback } from 'react'

interface Props {
  connections: Connection[]
  activeConnection: string | null
  connectedIds: Set<string>
  databases: string[]
  tables: TableInfo[]
  selectedDatabase: string | null
  loadingTables: boolean
  onNewConnection: () => void
  onSelectConnection: (id: string) => void
  onConnect: (conn: Connection) => void
  onDisconnect: (id: string) => void
  onEditConnection: (conn: Connection) => void
  onDeleteConnection: (id: string) => void
  onDeleteConnections?: (ids: string[]) => void
  onSelectDatabase: (db: string) => void
  onOpenTable: (database: string, table: string) => void
  onBackupDatabase?: (database: string) => void
  onExportTable?: (database: string, table: string, format: 'excel' | 'sql' | 'csv') => void
  onExportConnections?: (format: 'json' | 'ncx') => void
  onImportConnections?: () => void
}

// 计算菜单位置，防止超出屏幕
function getMenuPosition(x: number, y: number, menuHeight: number = 200, menuWidth: number = 180) {
  const windowHeight = window.innerHeight
  const windowWidth = window.innerWidth
  
  let finalX = x
  let finalY = y
  
  // 如果菜单会超出底部，则向上显示
  if (y + menuHeight > windowHeight - 10) {
    finalY = Math.max(10, y - menuHeight)
  }
  
  // 如果菜单会超出右侧，则向左显示
  if (x + menuWidth > windowWidth - 10) {
    finalX = Math.max(10, x - menuWidth)
  }
  
  return { x: finalX, y: finalY }
}

export default function Sidebar({
  connections,
  activeConnection,
  connectedIds,
  databases,
  tables,
  selectedDatabase,
  loadingTables,
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
}: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; conn: Connection } | null>(null)
  const [dbMenu, setDbMenu] = useState<{ x: number; y: number; db: string } | null>(null)
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number; db: string; table: string } | null>(null)
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set())
  
  // 多选模式
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedConnections, setSelectedConnections] = useState<Set<string>>(new Set())
  
  // 搜索功能
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  
  useEffect(() => {
    if (selectedDatabase) {
      setExpandedDbs(prev => new Set(prev).add(selectedDatabase))
    }
  }, [selectedDatabase])
  
  // Ctrl+F 快捷键 - 只在侧边栏有焦点时触发
  const handleSidebarKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && isFocused) {
      e.preventDefault()
      e.stopPropagation()
      setShowSearch(true)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
    if (e.key === 'Escape' && showSearch) {
      setShowSearch(false)
      setSearchQuery('')
    }
  }, [isFocused, showSearch])
  
  useEffect(() => {
    const sidebar = sidebarRef.current
    if (sidebar) {
      sidebar.addEventListener('keydown', handleSidebarKeyDown)
      return () => sidebar.removeEventListener('keydown', handleSidebarKeyDown)
    }
  }, [handleSidebarKeyDown])
  
  // 过滤表
  const getFilteredTables = (db: string) => {
    if (!searchQuery) return tables
    return tables.filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }
  
  // 检查是否有匹配的表
  const hasMatchingTables = searchQuery && selectedDatabase 
    ? tables.some(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : false
  
  // 过滤数据库：数据库名匹配 或者 该数据库下有匹配的表
  const filteredDatabases = databases.filter(db => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    // 数据库名匹配
    if (db.toLowerCase().includes(query)) return true
    // 如果是当前选中的数据库，检查是否有匹配的表
    if (db === selectedDatabase && hasMatchingTables) return true
    return false
  })
  
  // 搜索时自动展开匹配的数据库
  useEffect(() => {
    if (searchQuery && selectedDatabase && hasMatchingTables) {
      setExpandedDbs(prev => new Set(prev).add(selectedDatabase))
    }
  }, [searchQuery, selectedDatabase, hasMatchingTables])

  return (
    <>
      <div 
        ref={sidebarRef}
        className="w-72 bg-metro-bg flex flex-col border-r border-metro-border/50 h-full select-none"
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
        {/* 新建连接按钮 + 导入导出 */}
        <div className="p-3 flex-shrink-0 space-y-2">
          <button
            onClick={onNewConnection}
            className="w-full h-10 bg-accent-blue hover:bg-accent-blue-hover
                       flex items-center justify-center gap-2 text-sm font-medium
                       transition-all duration-150 shadow-metro"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>新建连接</span>
          </button>
          
          {/* 导入导出按钮 */}
          <div className="flex gap-2">
            <button
              onClick={onImportConnections}
              className="flex-1 h-8 bg-metro-surface hover:bg-metro-hover
                         flex items-center justify-center gap-1.5 text-xs text-text-secondary
                         transition-all duration-150"
              title="导入连接 (支持 JSON 和 Navicat NCX 格式)"
            >
              <Upload size={14} />
              <span>导入</span>
            </button>
            <div className="relative group flex-1">
              <button
                className="w-full h-8 bg-metro-surface hover:bg-metro-hover
                           flex items-center justify-center gap-1.5 text-xs text-text-secondary
                           transition-all duration-150"
                title="导出连接"
              >
                <Download size={14} />
                <span>导出</span>
              </button>
              {/* 导出格式下拉菜单 */}
              <div className="absolute left-0 right-0 top-full mt-1 bg-metro-card border border-metro-border 
                              shadow-metro-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible 
                              transition-all z-50">
                <button
                  onClick={() => onExportConnections?.('json')}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-metro-hover flex items-center gap-2"
                >
                  <FileCode size={12} className="text-accent-blue" />
                  导出为 JSON
                </button>
                <button
                  onClick={() => onExportConnections?.('ncx')}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-metro-hover flex items-center gap-2"
                >
                  <FileText size={12} className="text-accent-orange" />
                  导出为 Navicat (.ncx)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 搜索框 - 始终显示 */}
        <div className="px-3 pb-2 flex-shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={selectedDatabase ? "搜索表名... (Ctrl+F)" : "搜索数据库... (Ctrl+F)"}
                className="w-full h-8 pl-9 pr-8 bg-metro-surface text-sm text-white placeholder-text-disabled
                           border border-transparent focus:border-accent-blue transition-all rounded-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-disabled hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

        {/* 连接列表 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-3 py-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wider flex items-center justify-between">
            <span>连接 ({connections.length})</span>
            {connections.length > 0 && (
              <button
                onClick={() => {
                  setMultiSelectMode(!multiSelectMode)
                  if (multiSelectMode) setSelectedConnections(new Set())
                }}
                className={`p-1 rounded-sm transition-colors ${multiSelectMode ? 'bg-accent-blue text-white' : 'hover:bg-metro-hover'}`}
                title={multiSelectMode ? '退出多选' : '批量管理'}
              >
                {multiSelectMode ? <CheckSquare size={12} /> : <Square size={12} />}
              </button>
            )}
          </div>
          
          {/* 多选操作栏 */}
          {multiSelectMode && selectedConnections.size > 0 && (
            <div className="px-3 pb-2 flex items-center gap-2">
              <span className="text-xs text-text-tertiary">已选 {selectedConnections.size} 项</span>
              <button
                onClick={() => {
                  if (confirm(`确定删除选中的 ${selectedConnections.size} 个连接吗？`)) {
                    onDeleteConnections?.([...selectedConnections])
                    setSelectedConnections(new Set())
                    setMultiSelectMode(false)
                  }
                }}
                className="px-2 py-1 text-xs bg-accent-red/20 text-accent-red hover:bg-accent-red/30 rounded-sm transition-colors flex items-center gap-1"
              >
                <Trash2 size={12} />
                删除
              </button>
              <button
                onClick={() => setSelectedConnections(new Set())}
                className="px-2 py-1 text-xs bg-metro-surface hover:bg-metro-hover rounded-sm transition-colors"
              >
                取消
              </button>
            </div>
          )}
          
          {connections.length === 0 ? (
            <div className="px-3 py-6 text-center text-text-disabled text-sm">
              暂无连接
            </div>
          ) : (
            <div className="px-2 space-y-0.5">
              {connections.map(conn => {
                const info = DB_INFO[conn.type]
                const isConnected = connectedIds.has(conn.id)
                const isActive = activeConnection === conn.id
                const isSelected = selectedConnections.has(conn.id)
                const isExpanded = expandedDbs.has(conn.id)
                // 只有当前选中的连接才显示数据库
                const showDatabases = isActive && isConnected && databases.length > 0

                return (
                  <div key={conn.id}>
                    {/* 连接项 */}
                    <div
                      className={`group flex items-center gap-2 px-2 py-2 cursor-pointer transition-all duration-150 rounded-sm
                        ${isSelected ? 'bg-metro-hover ring-1 ring-text-tertiary' : ''}
                        ${isActive && !isSelected
                          ? 'bg-metro-hover' 
                          : 'hover:bg-metro-hover'} text-text-secondary hover:text-white`}
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
                          // 切换展开状态
                          if (isConnected) {
                            setExpandedDbs(prev => {
                              const next = new Set(prev)
                              if (next.has(conn.id)) next.delete(conn.id)
                              else next.add(conn.id)
                              return next
                            })
                          }
                        }
                      }}
                      onDoubleClick={async () => {
                        if (!multiSelectMode && !isConnected) {
                          onConnect(conn)
                          // 连接后自动展开
                          setExpandedDbs(prev => new Set(prev).add(conn.id))
                        }
                      }}
                      onContextMenu={(e) => { 
                        e.preventDefault()
                        const pos = getMenuPosition(e.clientX, e.clientY, 180)
                        setMenu({ x: pos.x, y: pos.y, conn }) 
                      }}
                    >
                      {/* 多选复选框 */}
                      {multiSelectMode && (
                        <span className={`w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0
                          ${isSelected ? 'bg-accent-blue border-accent-blue' : 'border-text-tertiary'}`}>
                          {isSelected && <span className="text-white text-xs">✓</span>}
                        </span>
                      )}
                      {/* 展开/折叠箭头 - 始终显示占位 */}
                      {!multiSelectMode && (
                        <span className={`flex-shrink-0 w-[14px] ${isConnected ? 'text-text-tertiary' : 'opacity-0'}`}>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                      )}
                      <span className="text-lg flex-shrink-0">{info?.icon}</span>
                      <span className="flex-1 text-sm truncate font-medium">{conn.name}</span>
                      {/* 增强的连接状态灯 */}
                      <span 
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all ${isConnected 
                          ? 'bg-[#00ff00] shadow-[0_0_8px_#00ff00,0_0_12px_#00ff00]' 
                          : 'bg-text-disabled/40'}`} 
                        title={isConnected ? '已连接' : '未连接'}
                      />
                      {!multiSelectMode && (
                        <button 
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded-sm transition-opacity flex-shrink-0"
                          onClick={(e) => { 
                            e.stopPropagation()
                            const pos = getMenuPosition(e.clientX, e.clientY, 180)
                            setMenu({ x: pos.x, y: pos.y, conn }) 
                          }}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      )}
                    </div>
                    
                    {/* 数据库列表 - 嵌套在连接下 */}
                    {showDatabases && isExpanded && (
                      <div className="ml-4 border-l border-metro-border/50 mt-0.5">
                        {filteredDatabases.map(db => {
                          const isDbSelected = selectedDatabase === db
                          const isDbExpanded = expandedDbs.has(db)
                          const dbTables = isDbSelected ? getFilteredTables(db) : []
                          
                          return (
                            <div key={db}>
                              <div
                                className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer text-sm transition-all duration-150 rounded-sm ml-1
                                  ${isDbSelected 
                                    ? 'bg-metro-hover text-white font-medium' 
                                    : 'text-text-secondary hover:bg-metro-hover hover:text-white'}`}
                                onClick={() => {
                                  onSelectDatabase(db)
                                  setExpandedDbs(prev => {
                                    const next = new Set(prev)
                                    if (next.has(db)) next.delete(db)
                                    else next.add(db)
                                    return next
                                  })
                                }}
                                onContextMenu={(e) => { 
                                  e.preventDefault()
                                  const pos = getMenuPosition(e.clientX, e.clientY, 60)
                                  setDbMenu({ x: pos.x, y: pos.y, db }) 
                                }}
                              >
                                <span className={`flex-shrink-0 ${isDbSelected ? 'text-white/70' : 'text-text-tertiary'}`}>
                                  {isDbExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </span>
                                <Database size={14} className={`flex-shrink-0 ${isDbSelected ? 'text-white' : 'text-accent-blue'}`} />
                                <span className="flex-1 truncate">{db}</span>
                              </div>
                              
                              {/* 表列表 */}
                              {isDbExpanded && isDbSelected && (
                                <div className="ml-5 mt-0.5 border-l border-metro-border/50">
                                  {loadingTables ? (
                                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-tertiary">
                                      <Loader2 size={12} className="animate-spin" />
                                      加载中...
                                    </div>
                                  ) : dbTables.length > 0 ? (
                                    <div className="py-0.5">
                                      {/* 先显示表 */}
                                      {dbTables.filter(t => !t.isView).map(table => (
                                        <div
                                          key={table.name}
                                          className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-metro-hover hover:text-white cursor-pointer transition-colors rounded-sm mx-0.5"
                                          title={`${table.name} (${table.rows} 行)`}
                                          onClick={() => onOpenTable(db, table.name)}
                                          onContextMenu={(e) => { 
                                            e.preventDefault()
                                            const pos = getMenuPosition(e.clientX, e.clientY, 160)
                                            setTableMenu({ x: pos.x, y: pos.y, db, table: table.name }) 
                                          }}
                                        >
                                          <Table2 size={12} className="text-accent-orange flex-shrink-0" />
                                          <span className="truncate flex-1">{table.name}</span>
                                          <span className="text-text-disabled font-mono flex-shrink-0">{table.rows}</span>
                                        </div>
                                      ))}
                                      {/* 再显示视图 */}
                                      {dbTables.filter(t => t.isView).map(view => (
                                        <div
                                          key={view.name}
                                          className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-metro-hover hover:text-white cursor-pointer transition-colors rounded-sm mx-0.5"
                                          title={`${view.name} (视图)`}
                                          onClick={() => onOpenTable(db, view.name)}
                                          onContextMenu={(e) => { 
                                            e.preventDefault()
                                            const pos = getMenuPosition(e.clientX, e.clientY, 160)
                                            setTableMenu({ x: pos.x, y: pos.y, db, table: view.name }) 
                                          }}
                                        >
                                          <Eye size={12} className="text-accent-purple flex-shrink-0" />
                                          <span className="truncate flex-1">{view.name}</span>
                                          <span className="text-text-disabled text-[10px] flex-shrink-0">视图</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="px-3 py-2 text-xs text-text-disabled">无表</div>
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

      {/* Metro 风格右键菜单 - 连接 */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 bg-metro-card border border-metro-border py-1.5 min-w-[160px] shadow-metro-lg animate-fade-in"
            style={{ left: menu.x, top: menu.y }}
          >
            {connectedIds.has(menu.conn.id) ? (
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-3 transition-colors"
                onClick={() => { onDisconnect(menu.conn.id); setMenu(null) }}
              >
                <span className="w-4 h-4 rounded-full border-2 border-accent-red" />
                断开连接
              </button>
            ) : (
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-3 transition-colors"
                onClick={() => { onConnect(menu.conn); setMenu(null) }}
              >
                <span className="w-4 h-4 rounded-full border-2 border-accent-green" />
                连接
              </button>
            )}
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover transition-colors"
              onClick={() => { onEditConnection(menu.conn); setMenu(null) }}
            >
              编辑
            </button>
            <div className="my-1 border-t border-metro-border" />
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover text-accent-red transition-colors"
              onClick={() => { onDeleteConnection(menu.conn.id); setMenu(null) }}
            >
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
            className="fixed z-50 bg-metro-card border border-metro-border py-1.5 min-w-[180px] shadow-metro-lg animate-fade-in"
            style={{ left: dbMenu.x, top: dbMenu.y }}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-3 transition-colors"
              onClick={() => { onBackupDatabase?.(dbMenu.db); setDbMenu(null) }}
            >
              <HardDrive size={14} className="text-accent-blue" />
              备份数据库
            </button>
          </div>
        </>
      )}

      {/* 右键菜单 - 表 */}
      {tableMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setTableMenu(null)} />
          <div
            className="fixed z-50 bg-metro-card border border-metro-border py-1.5 min-w-[180px] shadow-metro-lg animate-fade-in"
            style={{ left: tableMenu.x, top: tableMenu.y }}
          >
            <div className="px-4 py-1.5 text-xs text-text-disabled border-b border-metro-border mb-1">
              导出 {tableMenu.table}
            </div>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-3 transition-colors"
              onClick={() => { onExportTable?.(tableMenu.db, tableMenu.table, 'excel'); setTableMenu(null) }}
            >
              <FileSpreadsheet size={14} className="text-accent-green" />
              导出 Excel
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-3 transition-colors"
              onClick={() => { onExportTable?.(tableMenu.db, tableMenu.table, 'sql'); setTableMenu(null) }}
            >
              <FileCode size={14} className="text-accent-orange" />
              导出 SQL
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-3 transition-colors"
              onClick={() => { onExportTable?.(tableMenu.db, tableMenu.table, 'csv'); setTableMenu(null) }}
            >
              <FileText size={14} className="text-accent-blue" />
              导出 CSV
            </button>
          </div>
        </>
      )}
    </>
  )
}
