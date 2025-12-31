import { X, Play, Plus, Table2, ChevronLeft, ChevronRight, FolderOpen, Save, AlignLeft, Download, FileSpreadsheet, FileCode, Database, RotateCcw, Loader2 } from 'lucide-react'
import { QueryTab, DB_INFO, DatabaseType, TableInfo, ColumnInfo, TableTab } from '../types'
import { useState, useRef, useEffect, useCallback, memo, Suspense, lazy } from 'react'
import { format } from 'sql-formatter'
import api from '../lib/electron-api'
import VirtualDataTable from './VirtualDataTable'

// 懒加载 Monaco Editor 以提升首次加载性能
const SqlEditor = lazy(() => import('./SqlEditor'))

// 编辑器加载占位组件
const EditorLoading = memo(() => (
  <div className="h-full flex items-center justify-center bg-metro-dark">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-accent-blue" />
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
  loadingTables?: Set<string>  // 正在加载的表标签ID
}

// 主内容组件
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
  loadingTables,
}: Props) {
  // 快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault()
        if (activeTab !== 'welcome') {
          onCloseTab(activeTab)
        }
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
      return <Table2 size={12} className="text-accent-orange" />
    }
    return null
  }

  return (
    <div className="flex-1 flex flex-col bg-metro-dark">
      {/* Metro 风格标签栏 */}
      <div className="h-10 bg-metro-bg flex items-stretch px-1 border-b border-metro-border/50 overflow-x-auto">
        <button
          onClick={() => onTabChange('welcome')}
          className={`px-5 text-sm flex items-center transition-all duration-150 shrink-0 relative
            ${activeTab === 'welcome' 
              ? 'bg-metro-dark text-white font-medium' 
              : 'text-text-secondary hover:text-white hover:bg-metro-hover'}`}
        >
          主页
          {activeTab === 'welcome' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue" />
          )}
        </button>

        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`px-4 flex items-center gap-2 text-sm group transition-all duration-150 shrink-0 relative
              ${activeTab === tab.id 
                ? 'bg-metro-dark text-white font-medium' 
                : 'text-text-secondary hover:text-white hover:bg-metro-hover'}`}
          >
            <button onClick={() => onTabChange(tab.id)} className="flex items-center gap-2">
              {getTabIcon(tab)}
              <span className="max-w-[120px] truncate">{getTabTitle(tab)}</span>
            </button>
            <button
              onClick={() => onCloseTab(tab.id)}
              className="opacity-0 group-hover:opacity-100 hover:text-accent-red p-0.5 rounded-sm hover:bg-white/10 transition-all"
            >
              <X size={14} />
            </button>
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue" />
            )}
          </div>
        ))}

        <button
          onClick={onNewQuery}
          className="w-10 flex items-center justify-center text-text-tertiary hover:text-white hover:bg-metro-hover shrink-0 transition-colors"
          title="新建查询 (Ctrl+Q)"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* 内容区域 */}
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

// 欢迎屏幕组件
const WelcomeScreen = memo(function WelcomeScreen({ 
  onNewQuery, 
  onNewConnectionWithType 
}: { 
  onNewQuery: () => void
  onNewConnectionWithType?: (type: DatabaseType) => void
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-metro-dark via-metro-dark to-metro-bg relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-blue/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent-purple/5 rounded-full blur-3xl" />
      </div>
      
      {/* Logo 区域 */}
      <div className="flex items-center gap-4 mb-3 relative z-10">
        <div className="p-3 bg-gradient-to-br from-accent-blue/20 to-accent-blue/5 rounded-lg">
          <Database size={48} className="text-accent-blue" />
        </div>
        <h1 className="text-5xl font-light tracking-tight text-white">EasySQL</h1>
      </div>
      <p className="text-text-tertiary mb-10 text-lg relative z-10">简洁高效的数据库管理工具</p>

      <button
        onClick={onNewQuery}
        className="px-10 py-3.5 bg-accent-blue hover:bg-accent-blue-hover text-base font-medium 
                   transition-all duration-200 shadow-metro hover:shadow-metro-lg relative z-10
                   hover:translate-y-[-2px]"
      >
        开始查询
      </button>

      {/* 数据库磁贴 */}
      <p className="mt-14 text-text-disabled text-sm tracking-wide relative z-10">快速创建数据库连接</p>
      <div className="mt-5 grid grid-cols-5 gap-2 relative z-10">
        {(Object.entries(DB_INFO) as [DatabaseType, typeof DB_INFO[DatabaseType]][]).slice(0, 5).map(([key, info]) => (
          <button
            key={key}
            onClick={() => info.supported && onNewConnectionWithType?.(key)}
            className={`metro-tile w-24 h-24 flex flex-col items-center justify-center shadow-metro relative
              ${info.supported ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            style={{ 
              backgroundColor: info.color,
              opacity: info.supported ? 1 : 0.4,
              filter: info.supported ? 'none' : 'grayscale(50%)'
            }}
            title={info.supported ? `创建 ${info.name} 连接` : `${info.name} - 即将支持`}
            disabled={!info.supported}
          >
            <span className="text-3xl mb-2">{info.icon}</span>
            <span className="text-xs font-medium text-white/90">{info.name}</span>
            {!info.supported && (
              <span className="absolute bottom-1 text-[10px] text-white/60">即将支持</span>
            )}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 mt-2 relative z-10">
        {(Object.entries(DB_INFO) as [DatabaseType, typeof DB_INFO[DatabaseType]][]).slice(5, 9).map(([key, info]) => (
          <button
            key={key}
            onClick={() => info.supported && onNewConnectionWithType?.(key)}
            className={`metro-tile w-24 h-24 flex flex-col items-center justify-center shadow-metro relative
              ${info.supported ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            style={{ 
              backgroundColor: info.color,
              opacity: info.supported ? 1 : 0.4,
              filter: info.supported ? 'none' : 'grayscale(50%)'
            }}
            title={info.supported ? `创建 ${info.name} 连接` : `${info.name} - 即将支持`}
            disabled={!info.supported}
          >
            <span className="text-3xl mb-2">{info.icon}</span>
            <span className="text-xs font-medium text-white/90">{info.name}</span>
            {!info.supported && (
              <span className="absolute bottom-1 text-[10px] text-white/60">即将支持</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
})

// 表格查看器组件
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
  onRefresh
}: { 
  tab: TableTab & { pendingChanges?: Map<string, any>; deletedRows?: Set<number> }
  isLoading?: boolean
  onLoadPage: (page: number) => void
  onChangePageSize?: (pageSize: number) => void
  onCellChange?: (rowIndex: number, colName: string, value: any) => void
  onDeleteRow?: (rowIndex: number) => void
  onDeleteRows?: (rowIndices: number[]) => void
  onSave?: () => void
  onDiscard?: () => void
  onRefresh?: () => void
}) {
  const totalPages = Math.ceil(tab.total / tab.pageSize)
  const hasChanges = (tab.pendingChanges?.size || 0) > 0 || (tab.deletedRows?.size || 0) > 0
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
      {/* 表信息栏 - 紧凑布局 */}
      <div className="bg-metro-bg border-b border-metro-border/50 flex items-center justify-between px-3 gap-2" style={{ flexShrink: 0, height: 36 }}>
        {/* 左侧：表名 */}
        <div className="flex items-center gap-2 min-w-0">
          <Table2 size={16} className="text-accent-orange flex-shrink-0" />
          <span className="font-medium text-white text-sm truncate">{tab.tableName}</span>
          <span className="text-text-tertiary text-xs flex-shrink-0">({tab.total.toLocaleString()}行)</span>
          {isLoading && (
            <div className="flex items-center gap-1.5 text-accent-blue text-xs flex-shrink-0">
              <Loader2 size={12} className="animate-spin" />
              加载中...
            </div>
          )}
        </div>
        
        {/* 中间：修改提示和按钮 */}
        {hasChanges && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-accent-orange font-medium px-1.5 py-0.5 bg-accent-orange/10 rounded">
              {(tab.pendingChanges?.size || 0) + (tab.deletedRows?.size || 0)}项
            </span>
            <button
              onClick={onSave}
              className="h-6 px-2 bg-accent-green hover:bg-accent-green-hover flex items-center gap-1 text-xs font-medium transition-all"
              title="保存修改 (Ctrl+S)"
            >
              <Save size={11} />
              保存
            </button>
            <button
              onClick={onDiscard}
              className="h-6 px-2 bg-metro-surface hover:bg-metro-hover flex items-center gap-1 text-xs transition-all border border-metro-border"
            >
              <RotateCcw size={11} />
              放弃
            </button>
          </div>
        )}
        
        {/* 右侧：分页控件 - 固定宽度 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onLoadPage(tab.page - 1)}
            disabled={tab.page <= 1 || isLoading}
            className="p-0.5 hover:bg-metro-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs whitespace-nowrap min-w-[70px] text-center">
            <span className="text-accent-blue font-medium">{tab.page}</span>/{totalPages}页
          </span>
          <button
            onClick={() => onLoadPage(tab.page + 1)}
            disabled={tab.page >= totalPages || isLoading}
            className="p-0.5 hover:bg-metro-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          <select
            value={tab.pageSize}
            onChange={(e) => onChangePageSize?.(parseInt(e.target.value))}
            disabled={isLoading}
            className="h-6 px-1 text-xs bg-metro-surface border border-metro-border text-white rounded cursor-pointer hover:border-text-tertiary focus:border-accent-blue outline-none disabled:opacity-50"
            title="每页条数"
          >
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={2000}>2000</option>
            <option value={5000}>5000</option>
          </select>
        </div>
      </div>

      {/* 数据表格 - 使用虚拟滚动 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Loading 遮罩 */}
        {isLoading && (
          <div className="absolute inset-0 bg-metro-dark/80 flex items-center justify-center z-50">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="animate-spin text-accent-blue" />
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
              const originalIndex = originalIndexMap[visibleRowIndex]
              onCellChange?.(originalIndex, colName, value)
            }}
            onDeleteRow={(visibleRowIndex) => {
              const originalIndex = originalIndexMap[visibleRowIndex]
              onDeleteRow?.(originalIndex)
            }}
            onDeleteRows={(visibleRowIndices) => {
              const originalIndices = visibleRowIndices.map(i => originalIndexMap[i])
              onDeleteRows?.(originalIndices)
            }}
            onRefresh={onRefresh}
          />
        </div>
      </div>
    </div>
  )
})

// 查询编辑器组件
const QueryEditor = memo(function QueryEditor({ 
  tab, 
  databases, 
  tables, 
  columns, 
  onRun, 
  onUpdateSql, 
  onUpdateTitle 
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
    
    const path = await electronAPI.saveDialog({
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      defaultPath: `query_results_${Date.now()}.csv`
    })
    if (!path) return
    
    const columnNames = tab.results.columns
    const header = columnNames.join(',')
    const rows = tab.results.rows.map(row => 
      row.map((v: any) => {
        if (v === null) return ''
        if (typeof v === 'string') return `"${v.replace(/"/g, '""')}"`
        return String(v)
      }).join(',')
    ).join('\n')
    
    await electronAPI.writeFile(path, `${header}\n${rows}`)
  }, [tab.results])

  const handleExportSql = useCallback(async () => {
    if (!tab.results || tab.results.rows.length === 0) return
    
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return
    
    const path = await electronAPI.saveDialog({
      filters: [{ name: 'SQL', extensions: ['sql'] }],
      defaultPath: `query_results_${Date.now()}.sql`
    })
    if (!path) return
    
    const tableName = 'table_name'
    const columnNames = tab.results.columns
    const rows = tab.results.rows
    
    let sqlContent = `-- 导出时间: ${new Date().toLocaleString()}\n`
    sqlContent += `-- 共 ${rows.length} 条记录\n\n`
    
    rows.forEach(row => {
      const values = row.map((val: any) => {
        if (val === null) return 'NULL'
        if (typeof val === 'number') return val
        return `'${String(val).replace(/'/g, "''")}'`
      }).join(', ')
      sqlContent += `INSERT INTO \`${tableName}\` (\`${columnNames.join('`, `')}\`) VALUES (${values});\n`
    })
    
    await electronAPI.writeFile(path, sqlContent)
  }, [tab.results])

  // 结果数据转换为表格格式
  const resultData = tab.results?.rows.map(row => {
    const obj: Record<string, any> = {}
    tab.results?.columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj
  }) || []

  const resultColumns = tab.results?.columns.map(col => {
    const colInfo = findColumnInfo(col)
    return {
      name: col,
      type: colInfo?.type,
      key: colInfo?.key,
      comment: colInfo?.comment,
    }
  }) || []

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
              className="h-7 px-3 bg-metro-surface hover:bg-metro-surface/80 flex items-center gap-1.5 text-sm transition-colors disabled:opacity-40"
              title="导出结果"
              disabled={!tab.results || tab.results.rows.length === 0}
            >
              <Download size={14} />
              导出
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0" onClick={() => setShowExportMenu(false)} />
                <div className="absolute top-full left-0 mt-1 bg-metro-surface border border-metro-border rounded shadow-lg z-50 min-w-[140px] animate-fade-in">
                  <button
                    onClick={() => { handleExportCsv(); setShowExportMenu(false) }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent-blue/20 flex items-center gap-2"
                  >
                    <FileSpreadsheet size={14} className="text-accent-green" />
                    导出 CSV
                  </button>
                  <button
                    onClick={() => { handleExportSql(); setShowExportMenu(false) }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent-blue/20 flex items-center gap-2"
                  >
                    <FileCode size={14} className="text-accent-orange" />
                    导出 SQL
                  </button>
                </div>
              </>
            )}
          </div>
          
          <span className="text-xs text-white/40 ml-auto">
            {filePath && <span className="mr-3 text-accent-blue">{filePath.split(/[/\\]/).pop()}</span>}
            Ctrl+Enter 执行 | Ctrl+S 保存
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Suspense fallback={<EditorLoading />}>
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
          </Suspense>
        </div>
      </div>

      {/* 结果区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="h-9 bg-metro-bg flex items-center px-3 border-b border-metro-border" style={{ flexShrink: 0 }}>
          <span className="text-sm text-white/60">
            结果
            {tab.results && <span className="ml-2 text-white/40">({tab.results.rows.length.toLocaleString()} 行)</span>}
          </span>
        </div>
        
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            {tab.results ? (
              <VirtualDataTable 
                columns={resultColumns}
                data={resultData}
                showColumnInfo={true}
                onRefresh={() => onRun(sql)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-white/30">
                <div className="flex flex-col items-center gap-2">
                  <Database size={32} className="text-white/20" />
                  <span>执行查询以查看结果</span>
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
