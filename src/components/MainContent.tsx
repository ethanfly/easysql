import { X, Play, Plus, Minus, Table2, ChevronLeft, ChevronRight, FolderOpen, Save, AlignLeft, Download, FileSpreadsheet, FileCode, Database, Loader2, Check, RefreshCw, Zap, Server, ChevronDown } from 'lucide-react'
import { QueryTab, DB_INFO, DatabaseType, TableInfo, ColumnInfo, TableTab, Connection } from '../types'
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
  activeConnection: string | null
  selectedDatabase: string | null
  connections: Connection[]
  connectedIds: Set<string>
  databasesMap: Map<string, string[]>
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
  onSelectConnection?: (connectionId: string) => void
  onSelectDatabase?: (database: string, connectionId: string) => void
  loadingTables?: Set<string>
}

const MainContent = memo(function MainContent({
  tabs,
  activeTab,
  activeConnection,
  selectedDatabase,
  connections,
  connectedIds,
  databasesMap,
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
  onSelectConnection,
  onSelectDatabase,
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
              connectionId={activeConnection}
              selectedDatabase={selectedDatabase}
              connections={connections}
              connectedIds={connectedIds}
              databasesMap={databasesMap}
              databases={databases}
              tables={tables}
              columns={columns}
              onRun={(sql) => onRunQuery(currentTab.id, sql)}
              onUpdateSql={(sql) => onUpdateSql(currentTab.id, sql)}
              onUpdateTitle={(title) => onUpdateTabTitle(currentTab.id, title)}
              onSelectConnection={onSelectConnection}
              onSelectDatabase={onSelectDatabase}
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
  const tabData = tab.data || []
  const existingDataCount = tabData.filter((_, i) => !tab.deletedRows?.has(i)).length
  
  if (newRowCount > 0) {
    for (let i = 0; i < newRowCount; i++) {
      const rowIndex = existingDataCount + i
      tab.columns.forEach(col => {
        modifiedCells.add(`${rowIndex}-${col.name}`)
      })
    }
  }
  
  const visibleData = [...tabData.filter((_, i) => !tab.deletedRows?.has(i)), ...(tab.newRows || [])]
  const originalIndexMap = tabData.map((_, i) => i).filter(i => !tab.deletedRows?.has(i))
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
            className="p-1 hover:bg-light-hover disabled:opacity-30 rounded transition-colors text-text-primary"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs min-w-[70px] text-center text-text-primary">
            <span className="text-primary-600 font-medium">{tab.page}</span> / {totalPages}
          </span>
          <button
            onClick={() => onLoadPage(tab.page + 1)}
            disabled={tab.page >= totalPages || isLoading}
            className="p-1 hover:bg-light-hover disabled:opacity-30 rounded transition-colors text-text-primary"
          >
            <ChevronRight size={16} />
          </button>
          <select
            value={tab.pageSize}
            onChange={(e) => onChangePageSize?.(parseInt(e.target.value))}
            disabled={isLoading}
            className="h-7 px-2 text-xs bg-white border border-border-default rounded cursor-pointer text-text-primary"
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
        {isLoading && tab.columns.length === 0 ? (
          // 初始加载时显示全屏 loading
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-light-bg">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-primary-500" />
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-text-primary mb-1">正在加载表数据</div>
                <div className="text-xs text-text-muted">{tab.tableName}</div>
              </div>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
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
  tab, connectionId, selectedDatabase, connections, connectedIds, databasesMap, databases, tables, columns, 
  onRun, onUpdateSql, onUpdateTitle, onSelectConnection, onSelectDatabase
}: { 
  tab: QueryTab
  connectionId: string | null
  selectedDatabase: string | null
  connections: Connection[]
  connectedIds: Set<string>
  databasesMap: Map<string, string[]>
  databases: string[]
  tables: TableInfo[]
  columns: Map<string, ColumnInfo[]>
  onRun: (sql: string) => void
  onUpdateSql: (sql: string) => void
  onUpdateTitle?: (title: string) => void
  onSelectConnection?: (connectionId: string) => void
  onSelectDatabase?: (database: string, connectionId: string) => void
}) {
  const [showConnectionMenu, setShowConnectionMenu] = useState(false)
  const [showDatabaseMenu, setShowDatabaseMenu] = useState(false)
  
  // 获取当前连接信息
  const currentConnection = connections.find(c => c.id === connectionId)
  const currentDatabases = connectionId ? (databasesMap.get(connectionId) || []) : []
  const [sql, setSql] = useState(tab.sql)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  // 本地数据状态（用于编辑）
  const [localData, setLocalData] = useState<any[]>([])
  const [originalData, setOriginalData] = useState<any[]>([])  // 保存原始数据用于对比
  const [modifiedCells, setModifiedCells] = useState<Set<string>>(new Set())
  const [deletedRows, setDeletedRows] = useState<Set<number>>(new Set())  // 待删除的行索引（原始数据的索引）
  
  // 当查询结果变化时，更新本地数据
  useEffect(() => {
    if (tab.results) {
      const data = tab.results.rows.map(row => {
        const obj: Record<string, any> = {}
        tab.results?.columns.forEach((col, i) => { obj[col] = row[i] })
        return obj
      })
      setLocalData(data)
      setOriginalData(JSON.parse(JSON.stringify(data)))  // 深拷贝保存原始数据
      setModifiedCells(new Set())
      setDeletedRows(new Set())
    } else {
      setLocalData([])
      setOriginalData([])
      setModifiedCells(new Set())
      setDeletedRows(new Set())
    }
  }, [tab.results])
  
  // 从SQL中解析表名（支持简单的 SELECT ... FROM table_name 格式）
  const parseTableNameFromSql = useCallback((sqlStr: string): string | null => {
    // 匹配 FROM table_name 或 FROM `table_name` 或 FROM database.table_name
    const match = sqlStr.match(/\bFROM\s+[`"]?(\w+)[`"]?(?:\s*\.\s*[`"]?(\w+)[`"]?)?/i)
    if (match) {
      // 如果有 database.table 格式，返回表名
      return match[2] || match[1]
    }
    return null
  }, [])
  
  // 从SQL中解析数据库名
  const parseDatabaseFromSql = useCallback((sqlStr: string): string | null => {
    const match = sqlStr.match(/\bFROM\s+[`"]?(\w+)[`"]?\s*\.\s*[`"]?(\w+)[`"]?/i)
    if (match) {
      return match[1]  // 返回数据库名
    }
    return null
  }, [])
  
  // 保存修改到数据库（包括更新和删除）
  const handleSaveChanges = useCallback(async () => {
    if (!connectionId || (modifiedCells.size === 0 && deletedRows.size === 0)) return
    
    const tableName = parseTableNameFromSql(sql)
    if (!tableName) {
      alert('无法从SQL中解析表名，只支持简单的 SELECT ... FROM table_name 格式')
      return
    }
    
    const database = parseDatabaseFromSql(sql) || selectedDatabase
    if (!database) {
      alert('无法确定数据库，请先选择数据库')
      return
    }
    
    // 找到主键列
    const tableColumns = columns.get(`${database}.${tableName}`) || columns.get(tableName) || []
    let primaryKeyCol = tableColumns.find(c => c.key === 'PRI')?.name
    
    // 如果找不到主键，尝试用第一列
    if (!primaryKeyCol && tab.results?.columns.length) {
      primaryKeyCol = tab.results.columns[0]
    }
    
    if (!primaryKeyCol) {
      alert('无法确定主键列，无法保存修改')
      return
    }
    
    setIsSaving(true)
    
    try {
      let updateSuccessCount = 0
      let updateErrorCount = 0
      let deleteSuccessCount = 0
      let deleteErrorCount = 0
      
      // 1. 执行删除操作
      if (deletedRows.size > 0) {
        for (const rowIndex of deletedRows) {
          const originalRow = originalData[rowIndex]
          if (!originalRow) continue
          
          const primaryKeyValue = originalRow[primaryKeyCol]
          if (primaryKeyValue === null || primaryKeyValue === undefined) {
            deleteErrorCount++
            continue
          }
          
          const result = await api.deleteRow(
            connectionId,
            database,
            tableName,
            { column: primaryKeyCol, value: primaryKeyValue }
          )
          
          if (result.success) {
            deleteSuccessCount++
          } else {
            deleteErrorCount++
            console.error('删除失败:', result.error)
          }
        }
      }
      
      // 2. 执行更新操作（需要调整索引，因为有些行可能已删除）
      if (modifiedCells.size > 0) {
        // 按行分组修改
        const rowChanges = new Map<number, Record<string, any>>()
        modifiedCells.forEach(cellKey => {
          const idx = cellKey.indexOf('-')
          const rowIndex = parseInt(cellKey.substring(0, idx))
          const colName = cellKey.substring(idx + 1)
          
          if (!rowChanges.has(rowIndex)) {
            rowChanges.set(rowIndex, {})
          }
          rowChanges.get(rowIndex)![colName] = localData[rowIndex]?.[colName]
        })
        
        for (const [localRowIndex, updates] of rowChanges) {
          // 找到对应的原始行索引
          // localRowIndex 是当前 localData 中的索引，需要映射回原始数据的索引
          let originalRowIndex = localRowIndex
          const sortedDeletedIndices = [...deletedRows].sort((a, b) => a - b)
          for (const delIdx of sortedDeletedIndices) {
            if (delIdx <= originalRowIndex) {
              originalRowIndex++
            }
          }
          
          const originalRow = originalData[originalRowIndex]
          if (!originalRow) continue
          
          const primaryKeyValue = originalRow[primaryKeyCol]
          if (primaryKeyValue === null || primaryKeyValue === undefined) {
            updateErrorCount++
            continue
          }
          
          const result = await api.updateRow(
            connectionId,
            database,
            tableName,
            { column: primaryKeyCol, value: primaryKeyValue },
            updates
          )
          
          if (result.success) {
            updateSuccessCount++
          } else {
            updateErrorCount++
            console.error('更新失败:', result.error)
          }
        }
      }
      
      // 汇总结果
      const messages: string[] = []
      if (deleteSuccessCount > 0) messages.push(`删除 ${deleteSuccessCount} 行`)
      if (updateSuccessCount > 0) messages.push(`更新 ${updateSuccessCount} 行`)
      if (deleteErrorCount > 0) messages.push(`删除失败 ${deleteErrorCount} 行`)
      if (updateErrorCount > 0) messages.push(`更新失败 ${updateErrorCount} 行`)
      
      if (deleteSuccessCount > 0 || updateSuccessCount > 0) {
        // 更新原始数据
        setOriginalData(JSON.parse(JSON.stringify(localData)))
        setModifiedCells(new Set())
        setDeletedRows(new Set())
        alert(`操作完成：${messages.join('，')}`)
      } else if (deleteErrorCount > 0 || updateErrorCount > 0) {
        alert(`操作失败：${messages.join('，')}`)
      }
    } catch (err: any) {
      alert('保存失败: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }, [connectionId, selectedDatabase, sql, modifiedCells, deletedRows, localData, originalData, columns, tab.results, parseTableNameFromSql, parseDatabaseFromSql])

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
    if (!tab.results || localData.length === 0) return
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return
    const path = await electronAPI.saveDialog({ filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: `query_${Date.now()}.csv` })
    if (!path) return
    const header = tab.results.columns.join(',')
    const rows = localData.map(row => 
      tab.results!.columns.map(col => {
        const v = row[col]
        return v === null ? '' : typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : String(v)
      }).join(',')
    ).join('\n')
    await electronAPI.writeFile(path, `${header}\n${rows}`)
  }, [tab.results, localData])

  const handleExportSql = useCallback(async () => {
    if (!tab.results || localData.length === 0) return
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return
    const path = await electronAPI.saveDialog({ filters: [{ name: 'SQL', extensions: ['sql'] }], defaultPath: `query_${Date.now()}.sql` })
    if (!path) return
    let sqlContent = `-- ${new Date().toLocaleString()}\n-- ${localData.length} 条\n\n`
    localData.forEach(row => {
      const values = tab.results!.columns.map(col => {
        const val = row[col]
        return val === null ? 'NULL' : typeof val === 'number' ? val : `'${String(val).replace(/'/g, "''")}'`
      }).join(', ')
      sqlContent += `INSERT INTO table_name (\`${tab.results!.columns.join('`, `')}\`) VALUES (${values});\n`
    })
    await electronAPI.writeFile(path, sqlContent)
  }, [tab.results, localData])

  // 处理单元格编辑
  const handleCellChange = useCallback((rowIndex: number, colName: string, value: any) => {
    setLocalData(prev => {
      const newData = [...prev]
      if (newData[rowIndex]) {
        newData[rowIndex] = { ...newData[rowIndex], [colName]: value }
      }
      return newData
    })
    setModifiedCells(prev => new Set(prev).add(`${rowIndex}-${colName}`))
  }, [])
  
  // 处理删除单行
  const handleDeleteRow = useCallback((rowIndex: number) => {
    // 标记为待删除（保留原始索引用于数据库删除）
    setDeletedRows(prev => new Set(prev).add(rowIndex))
    // 从本地数据中移除
    setLocalData(prev => prev.filter((_, i) => i !== rowIndex))
    // 清理相关的修改记录（需要调整索引）
    setModifiedCells(prev => {
      const newSet = new Set<string>()
      prev.forEach(cellKey => {
        const idx = cellKey.indexOf('-')
        const cellRowIndex = parseInt(cellKey.substring(0, idx))
        const colName = cellKey.substring(idx + 1)
        if (cellRowIndex < rowIndex) {
          newSet.add(cellKey)
        } else if (cellRowIndex > rowIndex) {
          newSet.add(`${cellRowIndex - 1}-${colName}`)
        }
        // cellRowIndex === rowIndex 的记录被删除
      })
      return newSet
    })
  }, [])
  
  // 处理批量删除
  const handleDeleteRows = useCallback((rowIndices: number[]) => {
    // 从大到小排序，确保删除时索引不会乱
    const sortedIndices = [...rowIndices].sort((a, b) => b - a)
    
    // 标记所有待删除行
    setDeletedRows(prev => {
      const newSet = new Set(prev)
      sortedIndices.forEach(idx => newSet.add(idx))
      return newSet
    })
    
    // 从本地数据中移除
    setLocalData(prev => prev.filter((_, i) => !rowIndices.includes(i)))
    
    // 清理相关的修改记录
    setModifiedCells(prev => {
      const indexSet = new Set(rowIndices)
      const newSet = new Set<string>()
      prev.forEach(cellKey => {
        const idx = cellKey.indexOf('-')
        const cellRowIndex = parseInt(cellKey.substring(0, idx))
        const colName = cellKey.substring(idx + 1)
        if (!indexSet.has(cellRowIndex)) {
          // 计算删除后的新索引
          let newIndex = cellRowIndex
          for (const delIdx of sortedIndices) {
            if (delIdx < cellRowIndex) newIndex--
          }
          newSet.add(`${newIndex}-${colName}`)
        }
      })
      return newSet
    })
  }, [])

  const resultColumns = tab.results?.columns.map(col => {
    const colInfo = findColumnInfo(col)
    return { name: col, type: colInfo?.type, key: colInfo?.key, comment: colInfo?.comment }
  }) || []

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <div style={{ height: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderBottom: '1px solid #e2e8f0' }}>
        <div className="h-11 bg-light-surface flex items-center px-3 gap-2" style={{ flexShrink: 0 }}>
          {/* 连接选择器 */}
          <div className="relative">
            <button 
              onClick={() => setShowConnectionMenu(!showConnectionMenu)}
              className="h-8 px-3 bg-white hover:bg-light-hover border border-border-default flex items-center gap-2 text-sm text-text-primary rounded-lg transition-colors min-w-[140px]"
            >
              <Server size={14} className="text-primary-500" />
              <span className="truncate max-w-[100px]">{currentConnection?.name || '选择连接'}</span>
              <ChevronDown size={14} className="text-text-muted ml-auto" />
            </button>
            {showConnectionMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowConnectionMenu(false)} />
                <div className="absolute top-full left-0 mt-1 bg-white border border-border-default rounded-lg shadow-lg z-50 min-w-[180px] py-1 max-h-[300px] overflow-auto">
                  {connections.filter(c => connectedIds.has(c.id)).length === 0 ? (
                    <div className="px-3 py-2 text-sm text-text-muted">暂无已连接的数据库</div>
                  ) : (
                    connections.filter(c => connectedIds.has(c.id)).map(conn => (
                      <button
                        key={conn.id}
                        onClick={() => {
                          onSelectConnection?.(conn.id)
                          setShowConnectionMenu(false)
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-2 ${conn.id === connectionId ? 'bg-primary-50 text-primary-600' : 'text-text-primary'}`}
                      >
                        <Server size={14} className={conn.id === connectionId ? 'text-primary-500' : 'text-text-muted'} />
                        <span className="truncate">{conn.name}</span>
                        {conn.id === connectionId && <Check size={14} className="ml-auto text-primary-500" />}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* 数据库选择器 */}
          <div className="relative">
            <button 
              onClick={() => connectionId && setShowDatabaseMenu(!showDatabaseMenu)}
              disabled={!connectionId}
              className="h-8 px-3 bg-white hover:bg-light-hover border border-border-default flex items-center gap-2 text-sm text-text-primary rounded-lg transition-colors min-w-[140px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Database size={14} className="text-teal-500" />
              <span className="truncate max-w-[100px]">{selectedDatabase || '选择数据库'}</span>
              <ChevronDown size={14} className="text-text-muted ml-auto" />
            </button>
            {showDatabaseMenu && connectionId && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDatabaseMenu(false)} />
                <div className="absolute top-full left-0 mt-1 bg-white border border-border-default rounded-lg shadow-lg z-50 min-w-[180px] py-1 max-h-[300px] overflow-auto">
                  {currentDatabases.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-text-muted">暂无数据库</div>
                  ) : (
                    currentDatabases.map(db => (
                      <button
                        key={db}
                        onClick={() => {
                          onSelectDatabase?.(db, connectionId)
                          setShowDatabaseMenu(false)
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-light-hover flex items-center gap-2 ${db === selectedDatabase ? 'bg-primary-50 text-primary-600' : 'text-text-primary'}`}
                      >
                        <Database size={14} className={db === selectedDatabase ? 'text-teal-500' : 'text-text-muted'} />
                        <span className="truncate">{db}</span>
                        {db === selectedDatabase && <Check size={14} className="ml-auto text-primary-500" />}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="w-px h-5 bg-border-default mx-1" />
          
          <button onClick={handleRun}
            className="h-8 px-4 bg-success-500 hover:bg-success-600 text-white flex items-center gap-1.5 text-sm font-medium rounded-lg shadow-sm transition-all">
            <Play size={13} fill="currentColor" />
            执行
          </button>
          <div className="w-px h-5 bg-border-default mx-1" />
          <button onClick={handleOpenFile}
            className="h-8 px-3 bg-white hover:bg-light-hover border border-border-default flex items-center gap-1.5 text-sm text-text-primary rounded-lg transition-colors">
            <FolderOpen size={14} />
            打开
          </button>
          <button onClick={handleSaveFile}
            className="h-8 px-3 bg-white hover:bg-light-hover border border-border-default flex items-center gap-1.5 text-sm text-text-primary rounded-lg transition-colors">
            <Save size={14} />
            保存
          </button>
          <button onClick={handleFormat}
            className="h-8 px-3 bg-white hover:bg-light-hover border border-border-default flex items-center gap-1.5 text-sm text-text-primary rounded-lg transition-colors">
            <AlignLeft size={14} />
            格式化
          </button>
          <div className="w-px h-5 bg-border-default mx-1" />
          <div className="relative">
            <button onClick={() => setShowExportMenu(!showExportMenu)} disabled={!tab.results || tab.results.rows.length === 0}
              className="h-8 px-3 bg-white hover:bg-light-hover border border-border-default flex items-center gap-1.5 text-sm text-text-primary rounded-lg transition-colors disabled:opacity-40">
              <Download size={14} />
              导出
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0" onClick={() => setShowExportMenu(false)} />
                <div className="absolute top-full left-0 mt-1 bg-white border border-border-default rounded-lg shadow-lg z-50 min-w-[120px] py-1 menu">
                  <button onClick={() => { handleExportCsv(); setShowExportMenu(false) }}
                    className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-light-hover flex items-center gap-2">
                    <FileSpreadsheet size={14} className="text-success-500" /> CSV
                  </button>
                  <button onClick={() => { handleExportSql(); setShowExportMenu(false) }}
                    className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-light-hover flex items-center gap-2">
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
            {tab.results && (
              <span className="text-text-muted text-xs ml-2">
                ({localData.length.toLocaleString()} 行)
                {modifiedCells.size > 0 && <span className="text-warning-500 ml-2">· {modifiedCells.size} 已修改</span>}
                {deletedRows.size > 0 && <span className="text-danger-500 ml-2">· {deletedRows.size} 待删除</span>}
              </span>
            )}
          </span>
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: tab.results ? 32 : 0 }}>
            {tab.results ? (
              <VirtualDataTable 
                columns={resultColumns} 
                data={localData} 
                showColumnInfo={true} 
                editable={true}
                onRefresh={() => onRun(sql)}
                onCellChange={handleCellChange}
                onDeleteRow={handleDeleteRow}
                onDeleteRows={handleDeleteRows}
                modifiedCells={modifiedCells}
              />
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
          {/* 底部工具栏 */}
          {tab.results && (
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-light-surface border-t border-border-default flex items-center px-3 gap-1">
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleSaveChanges}
                  disabled={(modifiedCells.size === 0 && deletedRows.size === 0) || isSaving || !connectionId}
                  className={`w-7 h-7 flex items-center justify-center rounded ${(modifiedCells.size > 0 || deletedRows.size > 0) && connectionId ? 'hover:bg-success-50 text-success-500' : 'text-text-disabled'}`}
                  title={connectionId ? "保存修改到数据库" : "未连接数据库"}
                >
                  {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                </button>
                <button 
                  onClick={() => {
                    // 恢复原始数据
                    setLocalData(JSON.parse(JSON.stringify(originalData)))
                    setModifiedCells(new Set())
                    setDeletedRows(new Set())
                  }} 
                  disabled={(modifiedCells.size === 0 && deletedRows.size === 0) || isSaving}
                  className={`w-7 h-7 flex items-center justify-center rounded ${(modifiedCells.size > 0 || deletedRows.size > 0) ? 'hover:bg-danger-50 text-danger-500' : 'text-text-disabled'}`}
                  title="放弃修改"
                >
                  <X size={15} />
                </button>
                <button 
                  onClick={() => onRun(sql)}
                  disabled={isSaving}
                  className="w-7 h-7 flex items-center justify-center hover:bg-light-hover rounded text-text-tertiary disabled:opacity-40"
                  title="刷新数据 (重新执行查询)"
                >
                  <RefreshCw size={13} />
                </button>
              </div>
              <div className="flex-1 text-center text-xs text-text-muted">
                {isSaving ? '保存中...' : (modifiedCells.size > 0 || deletedRows.size > 0) 
                  ? `${modifiedCells.size > 0 ? `${modifiedCells.size} 项修改` : ''}${modifiedCells.size > 0 && deletedRows.size > 0 ? ' · ' : ''}${deletedRows.size > 0 ? `${deletedRows.size} 行删除` : ''}`
                  : `共 ${localData.length} 行`}
              </div>
              <div className="text-xs text-text-disabled font-mono truncate max-w-[300px]" title={sql}>
                {sql.length > 50 ? sql.substring(0, 50) + '...' : sql}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export default MainContent
