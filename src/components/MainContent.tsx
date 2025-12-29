import { X, Play, Plus, Table2, ChevronLeft, ChevronRight, Key, Info, FolderOpen, Save, AlignLeft, Download, FileSpreadsheet, FileCode, Database, Pin, PinOff, Trash2, RotateCcw } from 'lucide-react'
import { QueryTab, DB_INFO, DatabaseType, TableInfo, ColumnInfo, TableTab } from '../types'
import { useState, useRef, useEffect, useCallback } from 'react'
import SqlEditor from './SqlEditor'
import { format } from 'sql-formatter'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

// 可固定列的数据表格组件
interface DataTableColumn {
  name: string
  type?: string
  key?: string
  comment?: string
}

interface DataTableProps {
  columns: DataTableColumn[]
  data: any[]
  showColumnInfo?: boolean
  editable?: boolean
  primaryKeyColumn?: string
  onCellChange?: (rowIndex: number, colName: string, value: any) => void
  onDeleteRow?: (rowIndex: number) => void
  modifiedCells?: Set<string> // "rowIndex-colName" 格式
}

function DataTable({ columns, data, showColumnInfo = false, editable = false, primaryKeyColumn, onCellChange, onDeleteRow, modifiedCells }: DataTableProps) {
  const [pinnedColumns, setPinnedColumns] = useState<Set<string>>(new Set())
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // 切换列固定状态
  const togglePin = useCallback((colName: string) => {
    setPinnedColumns(prev => {
      const next = new Set(prev)
      if (next.has(colName)) {
        next.delete(colName)
      } else {
        next.add(colName)
      }
      return next
    })
  }, [])
  
  // 获取排序后的列（固定列在前）
  const sortedColumns = [...columns].sort((a, b) => {
    const aPinned = pinnedColumns.has(a.name) ? 0 : 1
    const bPinned = pinnedColumns.has(b.name) ? 0 : 1
    return aPinned - bPinned
  })
  
  // 计算固定列的累积宽度
  const pinnedColWidths = useRef<Map<string, number>>(new Map())
  
  useEffect(() => {
    // 在每次渲染后更新固定列宽度
    const container = tableContainerRef.current
    if (!container) return
    
    const headerCells = container.querySelectorAll('th[data-pinned="true"]')
    let accumulatedWidth = 0
    
    pinnedColWidths.current.clear()
    headerCells.forEach((cell) => {
      const colName = cell.getAttribute('data-col')
      if (colName) {
        pinnedColWidths.current.set(colName, accumulatedWidth)
        accumulatedWidth += (cell as HTMLElement).offsetWidth
      }
    })
  }, [pinnedColumns, columns])
  
  // 监听滚动
  useEffect(() => {
    const container = tableContainerRef.current
    if (!container) return
    
    const handleScroll = () => {
      setScrollLeft(container.scrollLeft)
    }
    
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])
  
  // 获取列的左边距（用于固定定位）
  const getPinnedLeft = (colName: string, index: number): number => {
    // 计算该列之前所有固定列的宽度总和
    let left = 0
    for (let i = 0; i < index; i++) {
      const col = sortedColumns[i]
      if (pinnedColumns.has(col.name)) {
        // 假设每列最小宽度 120px，实际会根据内容调整
        left += 150
      }
    }
    return left
  }
  
  return (
    <div 
      ref={tableContainerRef}
      style={{ 
        height: '100%',
        overflow: 'auto',
        position: 'relative'
      }}
    >
      <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
        <thead className="sticky top-0 z-20">
          <tr>
            {sortedColumns.map((col, i) => {
              const isPinned = pinnedColumns.has(col.name)
              const pinnedIndex = isPinned ? [...pinnedColumns].indexOf(col.name) : -1
              
              return (
                <th 
                  key={col.name}
                  data-pinned={isPinned}
                  data-col={col.name}
                  onClick={() => togglePin(col.name)}
                  className={`px-4 py-2 text-left font-medium border-b border-r border-metro-border whitespace-nowrap select-none cursor-pointer
                    ${isPinned ? 'z-30' : 'hover:bg-white/5'}`}
                  style={{ 
                    background: isPinned ? '#1a3a4a' : '#2d2d2d',
                    position: isPinned ? 'sticky' : 'relative',
                    left: isPinned ? `${pinnedIndex * 150}px` : 'auto',
                    minWidth: '120px',
                    boxShadow: isPinned && scrollLeft > 0 ? '2px 0 4px rgba(0,0,0,0.3)' : 'none',
                  }}
                  title={isPinned ? `点击取消固定 ${col.name}` : `点击固定 ${col.name}`}
                >
                  <div className="flex items-center gap-1.5">
                    {/* 固定状态图标 */}
                    <span className={`transition-colors ${isPinned ? 'text-accent-blue' : 'text-white/30'}`}>
                      {isPinned ? <Pin size={12} /> : <PinOff size={12} />}
                    </span>
                    
                    {showColumnInfo && col.key === 'PRI' && <Key size={12} className="text-accent-orange" />}
                    <span className="text-accent-blue">{col.name}</span>
                    {showColumnInfo && col.type && (
                      <span className="text-white/30 font-normal text-xs">({col.type})</span>
                    )}
                    {showColumnInfo && col.comment && (
                      <span className="text-accent-green text-xs">
                        <Info size={12} />
                      </span>
                    )}
                  </div>
                  {showColumnInfo && col.comment && (
                    <div className="text-xs text-white/40 font-normal mt-0.5 max-w-[200px] truncate">
                      {col.comment}
                    </div>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr 
              key={rowIndex} 
              className="hover:bg-metro-surface/50 group"
              onContextMenu={(e) => {
                if (editable) {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, row: rowIndex, col: '' })
                }
              }}
            >
              {sortedColumns.map((col) => {
                const isPinned = pinnedColumns.has(col.name)
                const pinnedIndex = isPinned ? [...pinnedColumns].indexOf(col.name) : -1
                const value = row[col.name]
                const isEditing = editingCell?.row === rowIndex && editingCell?.col === col.name
                const isModified = modifiedCells?.has(`${rowIndex}-${col.name}`)
                
                return (
                  <td 
                    key={col.name}
                    className={`px-4 py-1.5 border-b border-r border-metro-border/50 font-mono text-white/80 whitespace-nowrap
                      ${isPinned ? 'z-10' : ''}
                      ${editable ? 'cursor-text' : ''}
                      ${isModified ? 'bg-accent-orange/20' : ''}`}
                    style={{ 
                      background: isPinned ? (isModified ? '#3a3020' : '#1a3040') : (isModified ? 'rgba(249, 115, 22, 0.15)' : 'transparent'),
                      position: isPinned ? 'sticky' : 'relative',
                      left: isPinned ? `${pinnedIndex * 150}px` : 'auto',
                      minWidth: '120px',
                      boxShadow: isPinned && scrollLeft > 0 ? '2px 0 4px rgba(0,0,0,0.2)' : 'none',
                    }}
                    onClick={() => {
                      if (editable && !isEditing) {
                        setEditingCell({ row: rowIndex, col: col.name })
                        setEditValue(value === null ? '' : String(value))
                        setTimeout(() => inputRef.current?.focus(), 0)
                      }
                    }}
                    onContextMenu={(e) => {
                      if (editable) {
                        e.preventDefault()
                        e.stopPropagation()
                        setContextMenu({ x: e.clientX, y: e.clientY, row: rowIndex, col: col.name })
                      }
                    }}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          if (editValue !== (value === null ? '' : String(value))) {
                            onCellChange?.(rowIndex, col.name, editValue === '' ? null : editValue)
                          }
                          setEditingCell(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (editValue !== (value === null ? '' : String(value))) {
                              onCellChange?.(rowIndex, col.name, editValue === '' ? null : editValue)
                            }
                            setEditingCell(null)
                          } else if (e.key === 'Escape') {
                            setEditingCell(null)
                          }
                        }}
                        className="w-full bg-accent-blue/20 border border-accent-blue px-1 py-0.5 text-white outline-none"
                        style={{ minWidth: '80px' }}
                      />
                    ) : value === null ? (
                      <span className="text-white/30 italic">NULL</span>
                    ) : typeof value === 'object' ? (
                      <span className="text-accent-purple">{JSON.stringify(value)}</span>
                    ) : (
                      String(value)
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      
      {data.length === 0 && (
        <div className="h-32 flex items-center justify-center text-white/30">
          暂无数据
        </div>
      )}
      
      {/* 右键菜单 */}
      {contextMenu && editable && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-metro-surface border border-metro-border py-1 min-w-[160px] shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.col && (
              <>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-2"
                  onClick={() => {
                    onCellChange?.(contextMenu.row, contextMenu.col, null)
                    setContextMenu(null)
                  }}
                >
                  设为 NULL
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-2"
                  onClick={() => {
                    onCellChange?.(contextMenu.row, contextMenu.col, '')
                    setContextMenu(null)
                  }}
                >
                  设为空字符串
                </button>
                <div className="my-1 border-t border-metro-border" />
              </>
            )}
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-metro-hover flex items-center gap-2 text-accent-red"
              onClick={() => {
                onDeleteRow?.(contextMenu.row)
                setContextMenu(null)
              }}
            >
              <Trash2 size={14} />
              删除此行
            </button>
          </div>
        </>
      )}
    </div>
  )
}

type Tab = QueryTab | TableTab

interface Props {
  tabs: Tab[]
  activeTab: string
  databases: string[]
  tables: TableInfo[]
  columns: Map<string, ColumnInfo[]>
  onTabChange: (id: string) => void
  onCloseTab: (id: string) => void
  onNewQuery: () => void
  onRunQuery: (id: string, sql: string) => void
  onUpdateSql: (id: string, sql: string) => void
  onUpdateTabTitle: (id: string, title: string) => void
  onLoadTablePage: (id: string, page: number) => void
  onNewConnectionWithType?: (type: DatabaseType) => void
  onUpdateTableCell?: (tabId: string, rowIndex: number, colName: string, value: any) => void
  onDeleteTableRow?: (tabId: string, rowIndex: number) => void
  onSaveTableChanges?: (tabId: string) => Promise<void>
  onDiscardTableChanges?: (tabId: string) => void
}

export default function MainContent({
  tabs,
  activeTab,
  databases,
  tables,
  columns,
  onTabChange,
  onCloseTab,
  onNewQuery,
  onRunQuery,
  onUpdateSql,
  onUpdateTabTitle,
  onLoadTablePage,
  onNewConnectionWithType,
  onUpdateTableCell,
  onDeleteTableRow,
  onSaveTableChanges,
  onDiscardTableChanges,
}: Props) {
  // 快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+W 关闭当前标签页
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault()
        if (activeTab !== 'welcome') {
          onCloseTab(activeTab)
        }
      }
      // Ctrl+S 保存（针对表数据编辑）
      if (e.ctrlKey && e.key === 's') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab && 'tableName' in tab && (tab as any).pendingChanges?.size > 0) {
          e.preventDefault()
          onSaveTableChanges?.(activeTab)
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, tabs, onCloseTab, onSaveTableChanges])
  const currentTab = tabs.find(t => t.id === activeTab)

  const getTabTitle = (tab: Tab) => {
    if ('tableName' in tab) {
      return tab.tableName
    }
    return tab.title
  }

  const getTabIcon = (tab: Tab) => {
    if ('tableName' in tab) {
      return <Table2 size={12} className="text-accent-orange" />
    }
    return null
  }

  return (
    <div className="flex-1 flex flex-col bg-metro-dark">
      {/* Metro 风格标签栏 */}
      <div className="h-9 bg-metro-bg flex items-end px-1 border-b border-metro-border overflow-x-auto">
        <button
          onClick={() => onTabChange('welcome')}
          className={`h-8 px-4 text-sm flex items-center transition-colors shrink-0
            ${activeTab === 'welcome' 
              ? 'bg-metro-dark text-white' 
              : 'text-white/60 hover:text-white hover:bg-metro-hover'}`}
        >
          主页
        </button>

        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`h-8 px-3 flex items-center gap-2 text-sm group transition-colors shrink-0
              ${activeTab === tab.id 
                ? 'bg-metro-dark text-white' 
                : 'text-white/60 hover:text-white hover:bg-metro-hover'}`}
          >
            <button onClick={() => onTabChange(tab.id)} className="flex items-center gap-1.5">
              {getTabIcon(tab)}
              {getTabTitle(tab)}
            </button>
            <button
              onClick={() => onCloseTab(tab.id)}
              className="opacity-0 group-hover:opacity-100 hover:text-accent-red"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        <button
          onClick={onNewQuery}
          className="h-8 w-8 flex items-center justify-center text-white/40 hover:text-white hover:bg-metro-hover shrink-0"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 min-h-0">
        {activeTab === 'welcome' ? (
          <WelcomeScreen onNewQuery={onNewQuery} onNewConnectionWithType={onNewConnectionWithType} />
        ) : currentTab ? (
          'tableName' in currentTab ? (
            <TableViewer 
              tab={currentTab as any} 
              onLoadPage={(page) => onLoadTablePage(currentTab.id, page)}
              onCellChange={(rowIndex, colName, value) => onUpdateTableCell?.(currentTab.id, rowIndex, colName, value)}
              onDeleteRow={(rowIndex) => onDeleteTableRow?.(currentTab.id, rowIndex)}
              onSave={() => onSaveTableChanges?.(currentTab.id)}
              onDiscard={() => onDiscardTableChanges?.(currentTab.id)}
            />
          ) : (
            <QueryEditor
              tab={currentTab}
              databases={databases}
              tables={tables}
              columns={columns}
              onRun={(sql) => onRunQuery(currentTab.id, sql)}
              onUpdateSql={(sql) => onUpdateSql(currentTab.id, sql)}
              onUpdateTitle={(title) => onUpdateTabTitle(currentTab.id, title)}
            />
          )
        ) : null}
      </div>
    </div>
  )
}

function WelcomeScreen({ onNewQuery, onNewConnectionWithType }: { 
  onNewQuery: () => void
  onNewConnectionWithType?: (type: DatabaseType) => void
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <h1 className="text-4xl font-light mb-2 text-white">EasySQL</h1>
      <p className="text-white/50 mb-8">数据库管理工具</p>

      <button
        onClick={onNewQuery}
        className="px-8 py-3 bg-accent-blue hover:bg-accent-blue/90 text-sm font-medium transition-colors"
      >
        开始查询
      </button>

      {/* Metro 磁贴风格数据库展示 - 点击创建对应类型连接 */}
      <p className="mt-10 text-white/40 text-sm">点击下方图标快速创建连接</p>
      <div className="mt-4 grid grid-cols-5 gap-1">
        {(Object.entries(DB_INFO) as [DatabaseType, typeof DB_INFO[DatabaseType]][]).slice(0, 5).map(([key, info]) => (
          <button
            key={key}
            onClick={() => onNewConnectionWithType?.(key)}
            className="w-20 h-20 flex flex-col items-center justify-center transition-all hover:scale-105 hover:shadow-lg cursor-pointer"
            style={{ backgroundColor: info.color }}
            title={`创建 ${info.name} 连接`}
          >
            <span className="text-2xl mb-1">{info.icon}</span>
            <span className="text-xs text-white/90">{info.name}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1 mt-1">
        {(Object.entries(DB_INFO) as [DatabaseType, typeof DB_INFO[DatabaseType]][]).slice(5, 9).map(([key, info]) => (
          <button
            key={key}
            onClick={() => onNewConnectionWithType?.(key)}
            className="w-20 h-20 flex flex-col items-center justify-center transition-all hover:scale-105 hover:shadow-lg cursor-pointer"
            style={{ backgroundColor: info.color }}
            title={`创建 ${info.name} 连接`}
          >
            <span className="text-2xl mb-1">{info.icon}</span>
            <span className="text-xs text-white/90">{info.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function TableViewer({ tab, onLoadPage, onCellChange, onDeleteRow, onSave, onDiscard }: { 
  tab: TableTab & { pendingChanges?: Map<string, any>; deletedRows?: Set<number> }
  onLoadPage: (page: number) => void
  onCellChange?: (rowIndex: number, colName: string, value: any) => void
  onDeleteRow?: (rowIndex: number) => void
  onSave?: () => void
  onDiscard?: () => void
}) {
  const totalPages = Math.ceil(tab.total / tab.pageSize)
  const hasChanges = (tab.pendingChanges?.size || 0) > 0 || (tab.deletedRows?.size || 0) > 0
  
  // 找到主键列
  const primaryKeyCol = tab.columns.find(c => c.key === 'PRI')?.name || tab.columns[0]?.name
  
  // 计算修改过的单元格
  const modifiedCells = new Set<string>()
  tab.pendingChanges?.forEach((changes, rowKey) => {
    const rowIndex = parseInt(rowKey)
    Object.keys(changes).forEach(colName => {
      modifiedCells.add(`${rowIndex}-${colName}`)
    })
  })
  
  // 过滤掉已删除的行
  const visibleData = tab.data.filter((_, i) => !tab.deletedRows?.has(i))
  const originalIndexMap = tab.data.map((_, i) => i).filter(i => !tab.deletedRows?.has(i))
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 表信息栏 */}
      <div className="h-10 bg-metro-bg flex items-center px-3 gap-4 border-b border-metro-border" style={{ flexShrink: 0 }}>
        <div className="flex items-center gap-2">
          <Table2 size={16} className="text-accent-orange" />
          <span className="font-medium">{tab.tableName}</span>
          <span className="text-white/40 text-sm">({tab.total} 行)</span>
        </div>
        
        {hasChanges ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-accent-orange flex items-center gap-1">
              {(tab.pendingChanges?.size || 0) + (tab.deletedRows?.size || 0)} 项修改待保存
            </span>
            <button
              onClick={onSave}
              className="h-7 px-3 bg-accent-green hover:bg-accent-green/90 flex items-center gap-1.5 text-xs transition-colors"
              title="保存修改 (Ctrl+S)"
            >
              <Save size={12} />
              保存
            </button>
            <button
              onClick={onDiscard}
              className="h-7 px-3 bg-metro-surface hover:bg-metro-surface/80 flex items-center gap-1.5 text-xs transition-colors"
              title="放弃修改"
            >
              <RotateCcw size={12} />
              放弃
            </button>
          </div>
        ) : (
          <span className="text-xs text-white/30">
            点击单元格可编辑，右键可删除行或设为 NULL
          </span>
        )}
        
        {/* 分页控制 */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => onLoadPage(tab.page - 1)}
            disabled={tab.page <= 1}
            className="p-1 hover:bg-metro-hover disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm">
            第 <span className="text-accent-blue">{tab.page}</span> / {totalPages} 页
          </span>
          <button
            onClick={() => onLoadPage(tab.page + 1)}
            disabled={tab.page >= totalPages}
            className="p-1 hover:bg-metro-hover disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* 数据表格 - 使用 DataTable 组件支持列固定和编辑 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <DataTable 
            columns={tab.columns} 
            data={visibleData} 
            showColumnInfo={true}
            editable={true}
            primaryKeyColumn={primaryKeyCol}
            modifiedCells={modifiedCells}
            onCellChange={(visibleRowIndex, colName, value) => {
              const originalIndex = originalIndexMap[visibleRowIndex]
              onCellChange?.(originalIndex, colName, value)
            }}
            onDeleteRow={(visibleRowIndex) => {
              const originalIndex = originalIndexMap[visibleRowIndex]
              onDeleteRow?.(originalIndex)
            }}
          />
        </div>
      </div>
    </div>
  )
}

function QueryEditor({ tab, databases, tables, columns, onRun, onUpdateSql, onUpdateTitle }: { 
  tab: QueryTab
  databases: string[]
  tables: TableInfo[]
  columns: Map<string, ColumnInfo[]>
  onRun: (sql: string) => void
  onUpdateSql: (sql: string) => void
  onUpdateTitle?: (title: string) => void
}) {
  const [sql, setSql] = useState(tab.sql)
  const [filePath, setFilePath] = useState<string | null>(null)

  const handleRun = () => {
    onRun(sql)
    onUpdateSql(sql)
  }

  // 打开 SQL 文件
  const handleOpenFile = async () => {
    const result = await window.electronAPI?.openFile()
    if (result && !result.error) {
      setSql(result.content)
      setFilePath(result.path)
      onUpdateSql(result.content)
      onUpdateTitle?.(result.name)
    }
  }

  // 保存 SQL 文件
  const handleSaveFile = async () => {
    const result = await window.electronAPI?.saveFile(filePath, sql)
    if (result && !result.error) {
      setFilePath(result.path)
      onUpdateTitle?.(result.name)
    }
  }

  // 格式化 SQL
  const handleFormat = () => {
    try {
      const formatted = format(sql, {
        language: 'mysql',
        tabWidth: 2,
        keywordCase: 'upper',
        linesBetweenQueries: 2,
      })
      setSql(formatted)
      onUpdateSql(formatted)
    } catch (err) {
      console.error('SQL 格式化失败:', err)
    }
  }

  // 从所有表的列信息中查找匹配的列（用于显示注释）
  const findColumnInfo = (colName: string): ColumnInfo | undefined => {
    for (const [, cols] of columns) {
      const found = cols.find(c => c.name === colName || c.name.toLowerCase() === colName.toLowerCase())
      if (found) return found
    }
    return undefined
  }

  // 导出到 Excel
  const handleExportExcel = () => {
    if (!tab.results || tab.results.rows.length === 0) return
    
    const ws = XLSX.utils.json_to_sheet(tab.results.rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Query Results')
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    saveAs(blob, `query_results_${Date.now()}.xlsx`)
  }

  // 导出到 SQL (INSERT 语句)
  const handleExportSql = () => {
    if (!tab.results || tab.results.rows.length === 0) return
    
    const tableName = 'table_name' // 默认表名
    const columns = tab.results.columns
    const rows = tab.results.rows
    
    let sqlContent = `-- 导出时间: ${new Date().toLocaleString()}\n`
    sqlContent += `-- 共 ${rows.length} 条记录\n\n`
    
    rows.forEach(row => {
      const values = columns.map(col => {
        const val = row[col]
        if (val === null) return 'NULL'
        if (typeof val === 'number') return val
        return `'${String(val).replace(/'/g, "''")}'`
      }).join(', ')
      sqlContent += `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES (${values});\n`
    })
    
    const blob = new Blob([sqlContent], { type: 'text/plain;charset=utf-8' })
    saveAs(blob, `query_results_${Date.now()}.sql`)
  }

  // 导出下拉菜单状态
  const [showExportMenu, setShowExportMenu] = useState(false)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* SQL 编辑区 */}
      <div style={{ height: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderBottom: '1px solid #5d5d5d' }}>
        <div className="h-10 bg-metro-bg flex items-center px-2 gap-2" style={{ flexShrink: 0 }}>
          <button
            onClick={handleRun}
            className="h-7 px-4 bg-accent-green hover:bg-accent-green/90 flex items-center gap-1.5 text-sm transition-colors"
            title="执行 SQL (Ctrl+Enter)"
          >
            <Play size={14} fill="currentColor" />
            执行
          </button>
          
          <div className="w-px h-5 bg-white/20 mx-1" />
          
          <button
            onClick={handleOpenFile}
            className="h-7 px-3 bg-metro-surface hover:bg-metro-surface/80 flex items-center gap-1.5 text-sm transition-colors"
            title="打开 SQL 文件 (Ctrl+O)"
          >
            <FolderOpen size={14} />
            打开
          </button>
          
          <button
            onClick={handleSaveFile}
            className="h-7 px-3 bg-metro-surface hover:bg-metro-surface/80 flex items-center gap-1.5 text-sm transition-colors"
            title="保存 SQL 文件 (Ctrl+S)"
          >
            <Save size={14} />
            保存
          </button>
          
          <button
            onClick={handleFormat}
            className="h-7 px-3 bg-metro-surface hover:bg-metro-surface/80 flex items-center gap-1.5 text-sm transition-colors"
            title="格式化 SQL (Ctrl+Shift+F)"
          >
            <AlignLeft size={14} />
            格式化
          </button>
          
          <div className="w-px h-5 bg-white/20 mx-1" />
          
          {/* 导出按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="h-7 px-3 bg-metro-surface hover:bg-metro-surface/80 flex items-center gap-1.5 text-sm transition-colors"
              title="导出结果"
              disabled={!tab.results || tab.results.rows.length === 0}
            >
              <Download size={14} />
              导出
            </button>
            {showExportMenu && (
              <div className="absolute top-full left-0 mt-1 bg-metro-surface border border-metro-border rounded shadow-lg z-50 min-w-[140px]">
                <button
                  onClick={() => { handleExportExcel(); setShowExportMenu(false) }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent-blue/20 flex items-center gap-2"
                >
                  <FileSpreadsheet size={14} className="text-accent-green" />
                  导出 Excel
                </button>
                <button
                  onClick={() => { handleExportSql(); setShowExportMenu(false) }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent-blue/20 flex items-center gap-2"
                >
                  <FileCode size={14} className="text-accent-orange" />
                  导出 SQL
                </button>
              </div>
            )}
          </div>
          
          <span className="text-xs text-white/40 ml-auto">
            {filePath && <span className="mr-3 text-accent-blue">{filePath.split(/[/\\]/).pop()}</span>}
            Ctrl+Enter 执行 | Ctrl+S 保存 | Ctrl+Shift+F 格式化
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <SqlEditor
            value={sql}
            onChange={setSql}
            onRun={handleRun}
            onSave={handleSaveFile}
            onOpen={handleOpenFile}
            onFormat={handleFormat}
            databases={databases}
            tables={tables}
            columns={columns}
          />
        </div>
      </div>

      {/* 结果区 - 使用 DataTable 组件支持列固定 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="h-9 bg-metro-bg flex items-center px-3 border-b border-metro-border" style={{ flexShrink: 0 }}>
          <span className="text-sm text-white/60">
            结果
            {tab.results && <span className="ml-2 text-white/40">({tab.results.rows.length} 行)</span>}
          </span>
          {tab.results && tab.results.rows.length > 0 && (
            <span className="text-xs text-white/30 ml-4 flex items-center gap-1">
              <Pin size={12} /> 点击列头图钉可固定列
            </span>
          )}
        </div>
        
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            {tab.results ? (
              <DataTable 
                columns={tab.results.columns.map(col => {
                  const colInfo = findColumnInfo(col)
                  return {
                    name: col,
                    type: colInfo?.type,
                    key: colInfo?.key,
                    comment: colInfo?.comment,
                  }
                })}
                data={tab.results.rows}
                showColumnInfo={true}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-white/30">
                执行查询以查看结果
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
