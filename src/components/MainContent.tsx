import { X, Play, Plus, Table2, ChevronLeft, ChevronRight, Key, Info, FolderOpen, Save, AlignLeft, Download, FileSpreadsheet, FileCode, Database, Pin, PinOff } from 'lucide-react'
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
  showColumnInfo?: boolean // 是否显示列的类型和备注信息
}

function DataTable({ columns, data, showColumnInfo = false }: DataTableProps) {
  const [pinnedColumns, setPinnedColumns] = useState<Set<string>>(new Set())
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  
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
                  className={`px-4 py-2 text-left font-medium border-b border-r border-metro-border whitespace-nowrap select-none
                    ${isPinned ? 'z-30' : ''}`}
                  style={{ 
                    background: isPinned ? '#1a3a4a' : '#2d2d2d',
                    position: isPinned ? 'sticky' : 'relative',
                    left: isPinned ? `${pinnedIndex * 150}px` : 'auto',
                    minWidth: '120px',
                    boxShadow: isPinned && scrollLeft > 0 ? '2px 0 4px rgba(0,0,0,0.3)' : 'none',
                  }}
                  title={col.comment ? `${col.name}\n类型: ${col.type}\n备注: ${col.comment}` : col.type ? `${col.name}\n类型: ${col.type}` : col.name}
                >
                  <div className="flex items-center gap-1.5">
                    {/* 固定/取消固定按钮 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(col.name) }}
                      className={`p-0.5 rounded transition-colors ${isPinned ? 'text-accent-blue bg-accent-blue/20' : 'text-white/30 hover:text-white/60 hover:bg-white/10'}`}
                      title={isPinned ? '取消固定' : '固定此列'}
                    >
                      {isPinned ? <Pin size={12} /> : <PinOff size={12} />}
                    </button>
                    
                    {showColumnInfo && col.key === 'PRI' && <Key size={12} className="text-accent-orange" />}
                    <span className="text-accent-blue">{col.name}</span>
                    {showColumnInfo && col.type && (
                      <span className="text-white/30 font-normal text-xs">({col.type})</span>
                    )}
                    {showColumnInfo && col.comment && (
                      <span className="text-accent-green text-xs" title={col.comment}>
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
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-metro-surface/50">
              {sortedColumns.map((col, j) => {
                const isPinned = pinnedColumns.has(col.name)
                const pinnedIndex = isPinned ? [...pinnedColumns].indexOf(col.name) : -1
                const value = row[col.name]
                
                return (
                  <td 
                    key={col.name}
                    className={`px-4 py-1.5 border-b border-r border-metro-border/50 font-mono text-white/80 whitespace-nowrap
                      ${isPinned ? 'z-10' : ''}`}
                    style={{ 
                      background: isPinned ? '#1a3040' : 'transparent',
                      position: isPinned ? 'sticky' : 'relative',
                      left: isPinned ? `${pinnedIndex * 150}px` : 'auto',
                      minWidth: '120px',
                      boxShadow: isPinned && scrollLeft > 0 ? '2px 0 4px rgba(0,0,0,0.2)' : 'none',
                    }}
                  >
                    {value === null ? (
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
}: Props) {
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
            <TableViewer tab={currentTab} onLoadPage={(page) => onLoadTablePage(currentTab.id, page)} />
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

function TableViewer({ tab, onLoadPage }: { 
  tab: TableTab
  onLoadPage: (page: number) => void
}) {
  const totalPages = Math.ceil(tab.total / tab.pageSize)
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 表信息栏 */}
      <div className="h-10 bg-metro-bg flex items-center px-3 gap-4 border-b border-metro-border" style={{ flexShrink: 0 }}>
        <div className="flex items-center gap-2">
          <Table2 size={16} className="text-accent-orange" />
          <span className="font-medium">{tab.tableName}</span>
          <span className="text-white/40 text-sm">({tab.total} 行)</span>
        </div>
        
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

      {/* 数据表格 - 使用绝对定位确保滚动 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          overflow: 'auto' 
        }}>
          <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
            <thead className="sticky top-0 z-10">
              <tr>
                {tab.columns.map((col, i) => (
                  <th 
                    key={i} 
                    className="px-4 py-2 text-left font-medium border-b border-metro-border whitespace-nowrap"
                    style={{ background: '#2d2d2d' }}
                    title={col.comment ? `${col.name}\n类型: ${col.type}\n备注: ${col.comment}` : `${col.name}\n类型: ${col.type}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.key === 'PRI' && <Key size={12} className="text-accent-orange" />}
                      <span className="text-accent-blue">{col.name}</span>
                      <span className="text-white/30 font-normal text-xs">({col.type})</span>
                      {col.comment && (
                        <span className="text-accent-green text-xs" title={col.comment}>
                          <Info size={12} />
                        </span>
                      )}
                    </div>
                    {col.comment && (
                      <div className="text-xs text-white/40 font-normal mt-0.5 max-w-[200px] truncate">
                        {col.comment}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab.data.map((row, i) => (
                <tr key={i} className="hover:bg-metro-surface/50">
                  {tab.columns.map((col, j) => (
                    <td key={j} className="px-4 py-1.5 border-b border-metro-border/50 font-mono text-white/80 whitespace-nowrap">
                      {row[col.name] === null ? (
                        <span className="text-white/30 italic">NULL</span>
                      ) : typeof row[col.name] === 'object' ? (
                        <span className="text-accent-purple">{JSON.stringify(row[col.name])}</span>
                      ) : (
                        String(row[col.name])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          
          {tab.data.length === 0 && (
            <div className="h-32 flex items-center justify-center text-white/30">
              暂无数据
            </div>
          )}
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
    
    const blob = n