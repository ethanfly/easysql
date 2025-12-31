import { X, Play, Plus, Minus, Table2, ChevronLeft, ChevronRight, FolderOpen, Save, AlignLeft, Download, FileSpreadsheet, FileCode, Database, Loader2, Check, RefreshCw, Zap } from 'lucide-react'
import { QueryTab, DB_INFO, DatabaseType, TableInfo, ColumnInfo, TableTab } from '../types'
import { useState, useEffect, useCallback, memo, Suspense, lazy } from 'react'
import { format } from 'sql-formatter'
import api from '../lib/electron-api'
import VirtualDataTable from './VirtualDataTable'

const SqlEditor = lazy(() => import('./SqlEditor'))

const EditorLoading = memo(() => (
  <div className="h-full flex items-center justify-center bg-light-surface">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      <span className="text-sm text-text-tertiary">加载编辑器...</span>
    </div>
  </div>
))

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
  onChangeTablePageSize?: (id: string, pageSize: number) => void
  onNewConnectionWithType?: (type: DatabaseType) => void
  onUpdateTableCell?: (tabId: string, rowIndex: number, colName: string, value: any) => void
  onDeleteTableRow?: (tabId: string, rowIndex: number) => void
  onDeleteTableRows?: (tabId: string, rowIndices: number[]) => void
  onSaveTableChanges?: (tabId: string) => Promise<void>
  onDiscardTableChanges?: (tabId: string) => void
  onRefreshTable?: (tabId: string) => void
  onAddTableRow?: (tabId: string) => void
  onUpdateNewRow?: (tabId: string, rowIndex: number, colName: string, value: any) => void
  onDeleteNewRow?: (tabId: string, rowIndex: number) => void
  loadingTables?: Set<string>
}

const MainContent = memo(function MainContent({
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
  onChangeTablePageSize,
  onNewConnectionWithType,
  onUpdateTableCell,
  onDeleteTableRow,
  onDeleteTableRows,
  onSaveTableChanges,
  onDiscardTableChanges,
  onRefreshTable,
  onAddTableRow,
  onUpdateNewRow,
  onDeleteNewRow,
  loadingTables,
}: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault()
        if (activeTab !== 'welcome') onCloseTab(activeTab)
      }
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
    if ('tableName' in tab) return tab.tableName
    return tab.title
  }

  const getTabIcon = (tab: Tab) => {
    if ('tableName' in tab) {
      return <Table2 size={13} className="text-warning-500" />
    }
    return null
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* 标签栏 */}
      <div className="h-10 bg-light-surface flex items-stretch px-1 border-b border-border-default overflow-x-auto scrollbar-thin">
        <button
          onClick={() => onTabChange('welcome')}
          className={`px-4 text-sm flex items-center gap-1.5 transition-all shrink-0 relative
            ${activeTab === 'welcome' 
              ? 'text-text-primary font-medium' 
              : 'text-text-tertiary hover:text-text-secondary hover:bg-light-hover'}`}
        >
          <Database size={14} className={activeTab === 'welcome' ? 'text-primary-500' : ''} />
          主页
          {activeTab === 'welcome' && <span className="tab-indicator" />}
        </button>

        <div className="w-px h-5 bg-border-light self-center mx-1" />

        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`px-3 flex items-center gap-2 text-sm group transition-all shrink-0 relative cursor-pointer
              ${activeTab === tab.id 
                ? 'text-text-primary font-medium' 
                : 'text-text-tertiary hover:text-text-secondary hover:bg-light-hover'}`}
            onClick={() => onTabChange(tab.id)}
          >
            {getTabIcon(tab)}
            <span className="max-w-[120px] truncate">{getTabTitle(tab)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id) }}
              className="opacity-0 group-hover:opacity-100 hover:text-danger-500 p-0.5 rounded transition-all"
            >
              <X size={13} />
            </button>
            {activeTab === tab.id && <span className="tab-indicator" />}
          </div>
        ))}

        <button
          onClick={onNewQuery}
          className="w-9 flex items-center justify-center text-text-muted hover:text-primary-500 hover:bg-light-hover shrink-0 transition-colors rounded-lg mx-1 my-1"
          title="新建查询"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-h-0">
        {activeTab === 'welcome' ? (
          <WelcomeScreen onNewQuery={onNewQuery} onNewConnectionWithType={onNewConnectionWithType} />
        ) : currentTab ? (
          'tableName' in currentTab ? (
            <TableViewer 
              tab={currentTab as any} 
              isLoading={loadingTables?.has(currentTab.id)}
              onLoadPage={(page) => onLoadTablePage(currentTab.id, page)}
              onChangePageSize={(pageSize) => onChangeTablePageSize?.(currentTab.id, pageSize)}
              onCellChange={(rowIndex, colName, value) => onUpdateTableCell?.(currentTab.id, rowIndex, colName, value)}
              onDeleteRow={(rowIndex) => onDeleteTableRow?.(currentTab.id, rowIndex)}
              onDeleteRows={(rowIndices) => onDeleteTableRows?.(currentTab.id, rowIndices)}
              onSave={() => onSaveTableChanges?.(currentTab.id)}
              onDiscard={() => onDiscardTableChanges?.(currentTab.id)}
              onRefresh={() => onRefreshTable?.(currentTab.id)}
              onAddRow={() => onAddTableRow?.(currentTab.id)}
              onUpdateNewRow={(rowIndex, colName, value) => onUpdateNewRow?.(currentTab.id, rowIndex, colName, value)}
              onDeleteNewRow={(rowIndex) => onDeleteNewRow?.(currentTab.id, rowIndex)}
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
})

// 欢迎屏幕
const WelcomeScreen = memo(function WelcomeScreen({ 
  onNewQuery, 
  onNewConnectionWithType 
}: { 
  onNewQuery: () => void
  onNewConnectionWithType?: (type: DatabaseType) => void
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-white via-light-surface to-light-elevated">
      {/* Logo */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-16 h-16 rounded-2xl bg-primary-500 flex items-center justify-center shadow-btn">
          <Database size={32} className="text-white" />
        </div>
      </div>
      
      <h1 className="text-4xl font-bold text-text-primary mb-2">EasySQL</h1>
      <p className="text-text-tertiary text-lg mb-8">简洁高效的数据库管理工具</p>

      <button
        onClick={onNewQuery}
        className="px-8 py-3 bg-primary-500 hover:bg-primary-600 text-white text-base font-medium 
                   rounded-xl shadow-btn hover:shadow-btn-hover transition-all flex items-center gap-2"
      >
        <Zap size={18} />
        开始查询
      </button>

      {/* 快捷键 */}
      <div className="flex items-center gap-6 mt-6 text-xs text-text-muted">
        <span className="flex items-center gap-2">
          <kbd className="px-2 py-1 bg-light-elevated rounded border border-border-default font-mono">Ctrl+Q</kbd>
          新建查询
        </span>
        <span className="flex items-center gap-2">
          <kbd className="px-2 py-1 bg-light-elevated rounded border border-border-default font-mono">Ctrl+Enter</kbd>
          执行
        </span>
      </div>

      {/* 数据库磁贴 */}
      <div className="mt-12">
        <p className="text-center text-text-muted text-sm mb-4 font-medium">支持的数据库</p>
        
        <div className="flex gap-3 justify-center mb-3">
          {(Object.entries(DB_INFO) as [DatabaseType, typeof DB_INFO[DatabaseType]][]).slice(0, 5).map(([key, info]) => (
            <button
              key={key}
              onClick={() => info.supported && onNewConnectionWithType?.(key)}
              className={`db-tile w-20 h-20 flex flex-col items-center justify-center
                ${info.supported ? '' : 'cursor-not-allowed opacity-40'}`}
              style={{ background: info.color }}
              title={info.supported ? `创建 ${info.name} 连接` : `${info.name} - 即将支持`}
              disabled={!info.supported}
            >
              <span className="text-3xl mb-1">{info.icon}</span>
              <span className="text-[10px] font-medium text-white/90">{info.name}</span>
            </button>
          ))}
        </div>
        
        <div className="flex gap-3 justify-center">
          {(Object.entries(DB_INFO) as [DatabaseType, typeof DB_INFO[DatabaseType]][]).slice(5, 9).map(([key, info]) => (
            <button
              key={key}
              onClick={() => info.supported && onNewConnectionWithType?.(key)}
              className={`db-tile w-20 h-20 flex flex-col items-center justify-center
                ${info.supported ? '' : 'cursor-not-allowed opacity-40'}`}
              style={{ background: info.color }}
              title={info.supported ? `创建 ${info.name} 连接` : `${info.name} - 即将支持`}
              disabled={!info.supported}
            >
              <span className="text-3xl mb-1">{info.icon}</span>
              <span className="text-[10px] font-medium text-white/90">{info.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
})

// 表格查看器
const TableViewer = memo(function TableViewer({ 
  tab, 
  isLoading,
  onLoadPage, 
  onChangePageSize,
  onCellChange, 
  onDeleteRow, 
  onDeleteRows, 
  onSave, 
  onDiscard,
  onRefresh,
  onAddRow,
  onUpdateNewRow,
  onDeleteNewRow,
}: { 
  tab: TableTab & { pendingChanges?: Map<string, any>; deletedRows?: Set<number>; newRows?: any[] }
  isLoading?: boolean
  onLoadPage: (page: number) => void
  onChangePageSize?: (pageSize: number) => void
  onCellChange?: (rowIndex: number, colName: string, value: any) => void
  onDeleteRow?: (rowIndex: number) => void
  onDeleteRows?: (rowIndices: number[]) => void
  onSave?: () => void
  onDiscard?: () => void
  onRefresh?: () => void
  onAddRow?: () => void
  onUpdateNewRow?: (rowIndex: number, colName: string, value: any) => void
  onDeleteNewRow?: (rowIndex: number) => void
}) {
  const totalPages = Math.ceil(tab.total / tab.pageSize)
  const hasChanges = (tab.pendingChanges?.size || 0) > 0 || (tab.deletedRows?.size || 0) > 0 || (tab.newRows?.length || 0) > 0
  const primaryKeyCol = tab.columns.find(c => c.key === 'PRI')?.name || tab.columns[0]?.name
  
  const modifiedCells = new Set<string>()
  tab.pendingChanges?.forEach((changes, rowKey) => {
    const rowIndex = parseInt(rowKey)
    Object.keys(changes).forEach(colName => {
      modifiedCells.add(`${rowIndex}-${colName}`)
    })
  })
  
  const newRowCount = tab.newRows?.length || 0
  const existingDataCount = tab.data.filter((_, i) => !tab.deletedRows?.has(i)).length
  
  if (newRowCount > 0) {
    for (let i = 0; i < newRowCount; i++) {
      const rowIndex = existingDataCount + i
      tab.columns.forEach(col => {
        modifiedCells.add(`${rowIndex}-${col.name}`)
      })
    }
  }
  
  const visibleData = [...tab.data.filter((_, i) => !tab.deletedRows?.has(i)), ...(tab.newRows || [])]
  const originalIndexMap = tab.data.map((_, i) => i).filter(i => !tab.deletedRows?.has(i))
  const changesCount = (tab.pendingChanges?.size || 0) + (tab.deletedRows?.size || 0) + (tab.newRows?.length || 0)
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <div className="bg-light-surface border-b border-border-default flex items-center justify-between px-4 gap-3" style={{ flexShrink: 0, height: 44 }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-border-default">
            <Table2 size={15} className="text-warning-500" />
            <span className="font-medium text-text-primary text-sm">{tab.tableName}</span>
          </div>
          <span className="text-text-muted text-xs">{tab.total.toLocaleString()} 行</span>
          {isLoading && (
            <div className="flex items-center gap-1.5 text-primary-500 text-xs">
              <Loader2 size={13} className="animate-spin" />
              加载中...
            </div>
          )}
        </div>
        
        {hasChanges && (
          <div className="px-2.5 py-1 bg-warning-50 text-warning-600 text-xs font-medium rounded-md border border-warning-200">
            {changesCount} 项待保存
          </div>
        )}
        
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onLoadPage(tab.page - 1)}
            disabled={tab.page <= 1 || isLoading}
            className="p-1 hover:bg-light-hover disabled:opacity-30 rounded transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs min-w-[70px] text-center">
            <span className="text-primary-600 font-medium">{tab.page}</span> / {totalPages}
          </span>
          <button
            onClick={() => onLoadPage(tab.page + 1)}
            disabled={tab.page >= totalPages || isLoading}
            className="p-1 hover:bg-light-hover disabled:opacity-30 rounded transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          <select
            value={tab.pageSize}
            onChange={(e) => onChangePageSize?.(parseInt(e.target.value))}
            disabled={isLoading}
            className="h-7 px-2 text-xs bg-white border border-border-default rounded cursor-pointer"
          >
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={2000}>2000</option>
          </select>
        </div>
      </div>

      {/* 表格 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {isLoading && (
          <div className="loading-overlay">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin text-primary-500" />
              <span className="text-sm text-text-secondary">加载数据中...</span>
            </div>
          </div>
        )}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <VirtualDataTable 
            columns={tab.columns} 
            data={visibleData} 
            showColumnInfo={true}
            editable={true}
            primaryKeyColumn={primaryKeyCol}
            modifiedCells={modifiedCells}
            onCellChange={(visibleRowIndex, colName, value) => {
              if (visibleRowIndex >= existingDataCount) {
                onUpdateNewRow?.(visibleRowIndex - existingDataCount, colName, value)
              } else {
                onCellChange?.(originalIndexMap[visibleRowIndex], colName, value)
              }
            }}
            onDeleteRow={(visibleRowIndex) => {
              if (visibleRowIndex >= existingDataCount) {
                onDeleteNewRow?.(visibleRowIndex - existingDataCount)
              } else {
                onDeleteRow?.(originalIndexMap[visibleRowIndex])
              }
            }}
            onDeleteRows={(visibleRowIndices) => {
              const originalIndices: number[] = []
              const newRowIndices: number[] = []
              visibleRowIndices.forEach(i => {
                if (i >= existingDataCount) newRowIndices.push(i - existingDataCount)
                else originalIndices.push(originalIndexMap[i])
              })
              if (originalIndices.length > 0) onDeleteRows?.(originalIndices)
              newRowIndices.sort((a, b) => b - a).forEach(i => onDeleteNewRow?.(i))
            }}
            onRefresh={onRefresh}
            onSave={onSave}
            onAddRow={onAddRow}
            onBatchUpdate={(updates) => {
              updates.forEach(({ rowIndex, colName, value }) => {
                if (rowIndex >= existingDataCount) {
                  onUpdateNewRow?.(rowIndex - existingDataCount, colName, value)
                } else {
                  const originalIndex = originalIndexMap[rowIndex]
                  if (originalIndex !== undefined) onCellChange?.(originalIndex, colName, value)
                }
              })
            }}
          />
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="bg-light-surface border-t border-border-default flex items-center px-3 gap-1" style={{ flexShrink: 0, height: 36 }}>
        <div className="flex items-center gap-0.5">
          <button onClick={onAddRow} disabled={isLoading}
            className="w-7 h-7 flex items-center justify-center hover:bg-light-hover disabled:opacity-40 rounded text-text-tertiary hover:text-success-500">
            <Plus size={15} />
          </button>
          <button onClick={() => newRowCount > 0 && onDeleteNewRow?.(newRowCount - 1)} disabled={isLoading || newRowCount === 0}
            className="w-7 h-7 flex items-center justify-center hover:bg-light-hover disabled:opacity-40 rounded text-text-tertiary hover:text-danger-500">
            <Minus size={15} />
          </button>
          <div className="w-px h-4 bg-border-default mx-1" />
          <button onClick={onSave} disabled={isLoading || !hasChanges}
            className={`w-7 h-7 flex items-center justify-center rounded ${hasChanges ? 'hover:bg-success-50 text-success-500' : 'text-text-disabled'}`}>
            <Check size={15} />
          </button>
          <button onClick={onDiscard} disabled={isLoading || !hasChanges}
            className={`w-7 h-7 flex items-center justify-center rounded ${hasChanges ? 'hover:bg-danger-50 text-danger-500' : 'text-text-disabled'}`}>
            <X size={15} />
          </button>
          <button onClick={onRefresh} disabled={isLoading}
            className="w-7 h-7 flex items-center justify-center hover:bg-light-hover disabled:opacity-40 rounded text-text-tertiary">
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="flex-1 text-center text-xs text-text-muted">
          {hasChanges ? `${tab.pendingChanges?.size || 0} 修改 · ${tab.deletedRows?.size || 0} 删除 · ${newRowCount} 新增` : `共 ${visibleData.length} 行`}
        </div>
        <div className="text-xs text-text-disabled font-mono">
          SELECT * FROM `{tab.tableName}` LIMIT {tab.pageSize}
        </div>
      </div>
    </div>
  )
})

// 查询编辑器
const QueryEditor = memo(function QueryEditor({ 
  tab, databases, tables, columns, onRun, onUpdateSql, onUpdateTitle 
}: { 
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
  const [showExportMenu, setShowExportMenu] = useState(false)

  const handleRun = useCallback(() => {
    onRun(sql)
    onUpdateSql(sql)
  }, [sql, onRun, onUpdateSql])

  const handleOpenFile = useCallback(async () => {
    const result = await api.openFile()
    if (result && !result.error) {
      setSql(result.content)
      setFilePath(result.path)
      onUpdateSql(result.content)
      onUpdateTitle?.(result.name)
    }
  }, [onUpdateSql, onUpdateTitle])

  const handleSaveFile = useCallback(async () => {
    const result = await api.saveFile(filePath, sql)
    if (result && !result.error) {
      setFilePath(result.path)
      onUpdateTitle?.(result.name)
    }
  }, [filePath, sql, onUpdateTitle])

  const handleFormat = useCallback(() => {
    try {
      const formatted = format(sql, { language: 'mysql', tabWidth: 2, keywordCase: 'upper', linesBetweenQueries: 2 })
      setSql(formatted)
      onUpdateSql(formatted)
    } catch (err) {
      console.error('SQL 格式化失败:', err)
    }
  }, [sql, onUpdateSql])

  const findColumnInfo = useCallback((colName: string): ColumnInfo | undefined => {
    for (const [, cols] of columns) {
      const found = cols.find(c => c.name === colName || c.name.toLowerCase() === colName.toLowerCase())
      if (found) return found
    }
    return undefined
  }, [columns])

  const handleExportCsv = useCallback(async () => {
    if (!tab.results || tab.results.rows.length === 0) return
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return
    const path = await electronAPI.saveDialog({ filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: `query_${Date.now()}.csv` })
    if (!path) return
    const header = tab.results.columns.join(',')
    const rows = tab.results.rows.map(row => row.map((v: any) => v === null ? '' : typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : String(v)).join(',')).join('\n')
    await electronAPI.writeFile(path, `${header}\n${rows}`)
  }, [tab.results])

  const handleExportSql = useCallback(async () => {
    if (!tab.results || tab.results.rows.length === 0) return
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return
    const path = await electronAPI.saveDialog({ filters: [{ name: 'SQL', extensions: ['sql'] }], defaultPath: `query_${Date.now()}.sql` })
    if (!path) return
    let sqlContent = `-- ${new Date().toLocaleString()}\n-- ${tab.results.rows.length} 条\n\n`
    tab.results.rows.forEach(row => {
      const values = row.map((val: any) => val === null ? 'NULL' : typeof val === 'number' ? val : `'${String(val).replace(/'/g, "''")}'`).join(', ')
      sqlContent += `INSERT INTO table_name (\`${tab.results!.columns.join('`, `')}\`) VALUES (${values});\n`
    })
    await electronAPI.writeFile(path, sqlContent)
  }, [tab.results])

  const resultData = tab.results?.rows.map(row => {
    const obj: Record<string, any> = {}
    tab.results?.columns.forEach((col, i) => { obj[col] = row[i] })
    return obj
  }) || []

  const resultColumns = tab.results?.columns.map(col => {
    const colInfo = findColumnInfo(col)
    return { name: col, type: colInfo?.type, key: colInfo?.key, comment: colInfo?.comment }
  }) || []

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <div style={{ height: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderBottom: '1px solid #e2e8f0' }}>
        <div className="h-11 bg-light-surface flex items-center px-3 gap-2" style={{ flexShrink: 0 }}>
          <button onClick={handleRun}
            className="h-8 px-4 bg-success-500 hover:bg-success-600 text-white flex items-center gap-1.5 text-sm font-medium rounded-lg shadow-sm transition-all">
            <Play size={13} fill="currentColor" />
            执行
          </button>
          <div className="w-px h-5 bg-border-default mx-1" />
          <button onClick={handleOpenFile}
            className="h-8 px-3 bg-white hover:bg-light-hover border border-border-default flex items-center gap-1.5 text-sm rounded-lg transition-colors">
            <FolderOpen size={14} />
            打开
          </button>
          <button onClick={handleSaveFile}
            className="h-8 px-3 bg-white hover:bg-light-hover border border-border-default flex items-center gap-1.5 text-sm rounded-lg transition-colors">
            <Save size={14} />
            保存
          </button>
          <button onClick={handleFormat}
            className="h-8 px-3 bg-white hover:bg-light-hover border border-border-default flex items-center gap-1.5 text-sm rounded-lg transition-colors">
            <AlignLeft size={14} />
            格式化
          </button>
          <div className="w-px h-5 bg-border-default mx-1" />
          <div className="relative">
            <button onClick={() => setShowExportMenu(!showExportMenu)} disabled={!tab.results || tab.results.rows.length === 0}
              className="h-8 px-3 bg-white hover:bg-light-hover border border-border-default flex items-center gap-1.5 text-sm rounded-lg transition-colors disabled:opacity-40">
              <Download size={14} />
              导出
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0" onClick={() => setShowExportMenu(false)} />
                <div className="absolute top-full left-0 mt-1 bg-white border border-border-default rounded-lg shadow-lg z-50 min-w-[120px] py-1 menu">
                  <button onClick={() => { handleExportCsv(); setShowExportMenu(false) }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-2">
                    <FileSpreadsheet size={14} className="text-success-500" /> CSV
                  </button>
                  <button onClick={() => { handleExportSql(); setShowExportMenu(false) }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-2">
                    <FileCode size={14} className="text-warning-500" /> SQL
                  </button>
                </div>
              </>
            )}
          </div>
          <span className="text-xs text-text-muted ml-auto">
            {filePath && <span className="mr-3 text-primary-500 font-mono">{filePath.split(/[/\\]/).pop()}</span>}
            <kbd className="px-1.5 py-0.5 bg-light-elevated rounded text-[10px] border border-border-light">Ctrl+Enter</kbd> 执行
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Suspense fallback={<EditorLoading />}>
            <SqlEditor value={sql} onChange={setSql} onRun={handleRun} onSave={handleSaveFile} onOpen={handleOpenFile} onFormat={handleFormat}
              databases={databases} tables={tables} columns={columns} />
          </Suspense>
        </div>
      </div>

      {/* 结果 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="h-9 bg-light-surface flex items-center px-4 border-b border-border-default" style={{ flexShrink: 0 }}>
          <span className="text-sm text-text-secondary flex items-center gap-2">
            <Database size={14} className="text-primary-500" />
            结果
            {tab.results && <span className="text-text-muted text-xs ml-2">({tab.results.rows.length.toLocaleString()} 行)</span>}
          </span>
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            {tab.results ? (
              <VirtualDataTable columns={resultColumns} data={resultData} showColumnInfo={true} onRefresh={() => onRun(sql)} />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-light-elevated flex items-center justify-center">
                    <Database size={24} className="text-text-disabled" />
                  </div>
                  <span className="text-text-muted">执行查询以查看结果</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

export default MainContent
