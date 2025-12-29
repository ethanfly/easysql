import { Plus, Database, MoreHorizontal, Table2, ChevronRight, ChevronDown, Loader2, HardDrive, FileSpreadsheet, FileCode, FileText } from 'lucide-react'
import { Connection, DB_INFO, TableInfo } from '../types'
import { useState, useEffect } from 'react'

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
  onSelectDatabase: (db: string) => void
  onOpenTable: (database: string, table: string) => void
  onBackupDatabase?: (database: string) => void
  onExportTable?: (database: string, table: string, format: 'excel' | 'sql' | 'csv') => void
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
  onSelectDatabase,
  onOpenTable,
  onBackupDatabase,
  onExportTable,
}: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; conn: Connection } | null>(null)
  const [dbMenu, setDbMenu] = useState<{ x: number; y: number; db: string } | null>(null)
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number; db: string; table: string } | null>(null)
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set())
  
  // 选中数据库时自动展开
  useEffect(() => {
    if (selectedDatabase) {
      setExpandedDbs(prev => new Set(prev).add(selectedDatabase))
    }
  }, [selectedDatabase])

  return (
    <>
      <div className="w-60 bg-metro-bg flex flex-col border-r border-metro-border">
        {/* 新建连接按钮 - Metro 磁贴风格 */}
        <div className="p-3">
          <button
            onClick={onNewConnection}
            className="w-full h-10 bg-accent-blue hover:bg-accent-blue/90 
                       flex items-center justify-center gap-2 text-sm font-medium
                       transition-colors"
          >
            <Plus size={18} />
            新建连接
          </button>
        </div>

        {/* 连接列表 */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2 text-xs text-white/50 uppercase tracking-wide">
            连接
          </div>
          
          {connections.length === 0 ? (
            <div className="px-3 py-6 text-center text-white/30 text-sm">
              暂无连接
            </div>
          ) : (
            <div className="px-2">
              {connections.map(conn => {
                const info = DB_INFO[conn.type]
                const isConnected = connectedIds.has(conn.id)
                const isActive = activeConnection === conn.id

                return (
                  <div
                    key={conn.id}
                    className={`group flex items-center gap-2 px-2 py-2 mb-0.5 cursor-pointer transition-colors
                      ${isActive ? 'bg-accent-blue' : 'hover:bg-metro-hover'}`}
                    onClick={() => onSelectConnection(conn.id)}
                    onDoubleClick={() => !isConnected && onConnect(conn)}
                    onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, conn }) }}
                  >
                    <span className="text-lg">{info?.icon}</span>
                    <span className="flex-1 text-sm truncate">{conn.name}</span>
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-accent-green' : 'bg-white/20'}`} />
                    <button 
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10"
                      onClick={(e) => { e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, conn }) }}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* 数据库列表 */}
          {databases.length > 0 && (
            <>
              <div className="px-3 py-2 mt-2 text-xs text-white/50 uppercase tracking-wide flex items-center gap-1">
                <Database size={12} />
                数据库
              </div>
              <div className="px-2 pb-3">
                {databases.map(db => {
                  const isSelected = selectedDatabase === db
                  const isExpanded = expandedDbs.has(db)
                  const dbTables = isSelected ? tables : []
                  
                  return (
                    <div key={db}>
                      <div
                        className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer text-sm transition-colors
                          ${isSelected ? 'bg-accent-blue text-white' : 'text-white/80 hover:bg-metro-hover'}`}
                        onClick={() => {
                          onSelectDatabase(db)
                          setExpandedDbs(prev => {
                            const next = new Set(prev)
                            if (next.has(db)) next.delete(db)
                            else next.add(db)
                            return next
                          })
                        }}
                        onContextMenu={(e) => { e.preventDefault(); setDbMenu({ x: e.clientX, y: e.clientY, db }) }}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Database size={14} className={isSelected ? 'text-white' : 'text-accent-blue'} />
                        <span className="flex-1 truncate">{db}</span>
                      </div>
                      
                      {/* 表列表 */}
                      {isExpanded && isSelected && (
                        <div className="ml-4 border-l border-metro-border">
                          {loadingTables ? (
                            <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/50">
                              <Loader2 size={12} className="animate-spin" />
                              加载中...
                            </div>
                          ) : dbTables.length > 0 ? (
                            dbTables.map(table => (
                              <div
                                key={table.name}
                                className="flex items-center gap-2 px-3 py-1 text-xs text-white/70 hover:bg-metro-hover cursor-pointer"
                                title={`${table.name} (${table.rows} 行) - 单击打开，右键导出`}
                                onClick={() => onOpenTable(db, table.name)}
                                onContextMenu={(e) => { e.preventDefault(); setTableMenu({ x: e.clientX, y: e.clientY, db, table: table.name }) }}
                              >
                                <Table2 size={12} className="text-accent-orange" />
                                <span className="truncate">{table.name}</span>
                                <span className="ml-auto text-white/40">{table.rows}</span>
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-xs text-white/30">无表</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Metro 风格右键菜单 - 连接 */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 bg-metro-surface border border-metro-border py-1 min-w-[140px]"
            style={{ left: menu.x, top: menu.y }}
          >
            {connectedIds.has(menu.conn.id) ? (
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-2"
                onClick={() => { onDisconnect(menu.conn.id); setMenu(null) }}
              >
                断开连接
              </button>
            ) : (
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-2"
                onClick={() => { onConnect(menu.conn); setMenu(null) }}
              >
                连接
              </button>
            )}
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover"
              onClick={() => { onEditConnection(menu.conn); setMenu(null) }}
            >
              编辑
            </button>
            <div className="my-1 border-t border-metro-border" />
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover text-accent-red"
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
            className="fixed z-50 bg-metro-surface border border-metro-border py-1 min-w-[160px]"
            style={{ left: dbMenu.x, top: dbMenu.y }}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-2"
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
            className="fixed z-50 bg-metro-surface border border-metro-border py-1 min-w-[160px]"
            style={{ left: tableMenu.x, top: tableMenu.y }}
          >
            <div className="px-4 py-1 text-xs text-white/40 border-b border-metro-border mb-1">
              导出表 {tableMenu.table}
            </div>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-2"
              onClick={() => { onExportTable?.(tableMenu.db, tableMenu.table, 'excel'); setTableMenu(null) }}
            >
              <FileSpreadsheet size={14} className="text-accent-green" />
              导出 Excel
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-2"
              onClick={() => { onExportTable?.(tableMenu.db, tableMenu.table, 'sql'); setTableMenu(null) }}
            >
              <FileCode size={14} className="text-accent-orange" />
              导出 SQL
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-2"
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
