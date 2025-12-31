import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Key, Pin, PinOff, Trash2, Search, X, ChevronLeft, ChevronRight, RefreshCw, FileX, Type, Copy, ClipboardPaste } from 'lucide-react'

// 高性能虚拟滚动数据表格 - Navicat风格
interface DataTableColumn {
  name: string
  type?: string
  key?: string
  comment?: string
}

interface VirtualDataTableProps {
  columns: DataTableColumn[]
  data: any[]
  showColumnInfo?: boolean
  editable?: boolean
  primaryKeyColumn?: string
  onCellChange?: (rowIndex: number, colName: string, value: any) => void
  onDeleteRow?: (rowIndex: number) => void
  onDeleteRows?: (rowIndices: number[]) => void
  onRefresh?: () => void
  onSave?: () => void  // 保存回调
  onAddRow?: () => void  // 新增行回调
  onBatchUpdate?: (updates: { rowIndex: number; colName: string; value: any }[]) => void  // 批量更新回调
  modifiedCells?: Set<string>
  rowHeight?: number
  overscan?: number
}

// 格式化日期时间 - 缓存结果
const dateTimeCache = new Map<string, string>()
const formatDateTime = (value: any, colType: string): string => {
  if (value === null || value === undefined) return ''
  
  const cacheKey = `${value}-${colType}`
  if (dateTimeCache.has(cacheKey)) return dateTimeCache.get(cacheKey)!
  
  const strValue = String(value)
  const type = (colType || '').toLowerCase()
  
  const isDateTimeType = type.includes('datetime') || type.includes('timestamp')
  const isDateType = type.includes('date') && !isDateTimeType
  
  const dateTimeRegex = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/
  const dateOnlyRegex = /^(\d{4})-(\d{2})-(\d{2})$/
  
  let result = strValue
  const dtMatch = strValue.match(dateTimeRegex)
  const dMatch = strValue.match(dateOnlyRegex)
  
  if (isDateTimeType || dtMatch) {
    if (dtMatch) {
      const [, year, month, day, hour, min, sec] = dtMatch
      result = `${year}/${month}/${day} ${hour}:${min}:${sec}`
    }
  } else if (isDateType || dMatch) {
    if (dMatch) {
      const [, year, month, day] = dMatch
      result = `${year}/${month}/${day}`
    }
  }
  
  // 限制缓存大小
  if (dateTimeCache.size > 10000) dateTimeCache.clear()
  dateTimeCache.set(cacheKey, result)
  return result
}

// 计算文本显示宽度
const estimateTextWidth = (text: string): number => {
  if (!text) return 0
  let width = 0
  for (let i = 0; i < text.length; i++) {
    width += text.charCodeAt(i) > 255 ? 14 : 8
  }
  return width
}

// 主组件
const VirtualDataTable = memo(function VirtualDataTable({
  columns,
  data,
  showColumnInfo = false,
  editable = false,
  primaryKeyColumn,
  onCellChange,
  onDeleteRow,
  onDeleteRows,
  onRefresh,
  onSave,
  onAddRow,
  onBatchUpdate,
  modifiedCells,
  rowHeight = 28,
  overscan = 20
}: VirtualDataTableProps) {
  const [pinnedColumns, setPinnedColumns] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)
  const scrollLeftRef = useRef(0)
  const [, forceUpdate] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: string } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [activeCell, setActiveCell] = useState<{ row: number; col: string } | null>(null)
  
  // 选中行缓存
  const selectedRows = useMemo(() => {
    const rows = new Set<number>()
    selectedCells.forEach(cell => {
      const idx = cell.indexOf('-')
      if (idx > 0) rows.add(parseInt(cell.substring(0, idx)))
    })
    return rows
  }, [selectedCells])

  // 表头高度
  const hasComments = useMemo(() => columns.some(c => c.comment), [columns])
  const headerHeight = showColumnInfo ? (hasComments ? 58 : 44) : 28
  const rowNumberWidth = editable ? 48 : 0

  // 排序后的列
  const sortedColumns = useMemo(() => 
    [...columns].sort((a, b) => {
      const aPinned = pinnedColumns.has(a.name) ? 0 : 1
      const bPinned = pinnedColumns.has(b.name) ? 0 : 1
      return aPinned - bPinned
    }), 
  [columns, pinnedColumns])

  // 计算列宽 - 只在数据变化时计算
  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = {}
    const MIN_WIDTH = 70
    const MAX_WIDTH = 350
    const PADDING = 24
    
    for (const col of sortedColumns) {
      let headerWidth = estimateTextWidth(col.name) + PADDING + 20
      if (showColumnInfo && col.type) {
        headerWidth = Math.max(headerWidth, estimateTextWidth(col.type) + PADDING)
      }
      
      let maxDataWidth = 0
      const sampleSize = Math.min(data.length, 100)
      for (let i = 0; i < sampleSize; i++) {
        const value = data[i]?.[col.name]
        if (value !== null && value !== undefined) {
          const displayText = typeof value === 'object' 
            ? JSON.stringify(value) 
            : formatDateTime(value, col.type || '')
          maxDataWidth = Math.max(maxDataWidth, estimateTextWidth(displayText))
        }
      }
      
      widths[col.name] = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(Math.max(headerWidth, maxDataWidth + PADDING))))
    }
    
    return widths
  }, [sortedColumns, data, showColumnInfo])

  // 计算固定列偏移
  const pinnedLeftOffsets = useMemo(() => {
    const offsets: Record<string, number> = {}
    let offset = rowNumberWidth
    for (const col of sortedColumns) {
      if (pinnedColumns.has(col.name)) {
        offsets[col.name] = offset
        offset += columnWidths[col.name] || 100
      }
    }
    return offsets
  }, [sortedColumns, pinnedColumns, columnWidths, rowNumberWidth])

  // 搜索匹配
  const searchMatches = useMemo(() => {
    if (!searchQuery) return new Set<string>()
    const matches = new Set<string>()
    const query = searchQuery.toLowerCase()
    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex]
      for (const col of sortedColumns) {
        const value = row[col.name]
        if (value !== null && value !== undefined && String(value).toLowerCase().includes(query)) {
          matches.add(`${rowIndex}-${col.name}`)
        }
      }
    }
    return matches
  }, [searchQuery, data, sortedColumns])

  const matchesArray = useMemo(() => [...searchMatches], [searchMatches])

  // 虚拟滚动计算
  const virtualState = useMemo(() => {
    const scrollTop = scrollTopRef.current
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    const visibleCount = Math.ceil(containerHeight / rowHeight)
    const end = Math.min(data.length - 1, start + visibleCount + overscan * 2)
    
    return {
      startIndex: start,
      endIndex: end,
      totalHeight: data.length * rowHeight,
      offsetY: start * rowHeight
    }
  }, [data.length, scrollTopRef.current, containerHeight, rowHeight, overscan])

  // 总宽度
  const totalWidth = useMemo(() => {
    return rowNumberWidth + sortedColumns.reduce((sum, col) => sum + (columnWidths[col.name] || 100), 0)
  }, [sortedColumns, columnWidths, rowNumberWidth])

  // 滚动监听 - 使用RAF节流
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    const updateSize = () => setContainerHeight(container.clientHeight - headerHeight)
    
    let rafId: number | null = null
    const handleScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        scrollTopRef.current = container.scrollTop
        scrollLeftRef.current = container.scrollLeft
        forceUpdate(n => n + 1)
        rafId = null
      })
    }
    
    updateSize()
    container.addEventListener('scroll', handleScroll, { passive: true })
    
    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(container)
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [headerHeight])

  // 切换列固定
  const togglePin = useCallback((colName: string) => {
    setPinnedColumns(prev => {
      const next = new Set(prev)
      if (next.has(colName)) next.delete(colName)
      else next.add(colName)
      return next
    })
  }, [])

  // 获取列索引
  const getColIndex = useCallback((colName: string) => 
    sortedColumns.findIndex(c => c.name === colName), 
  [sortedColumns])

  // 计算选中区域
  const getSelectedCellsFromRange = useCallback((start: { row: number; col: string }, end: { row: number; col: string }) => {
    const cells = new Set<string>()
    const startRow = Math.min(start.row, end.row)
    const endRow = Math.max(start.row, end.row)
    const startColIdx = Math.min(getColIndex(start.col), getColIndex(end.col))
    const endColIdx = Math.max(getColIndex(start.col), getColIndex(end.col))
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startColIdx; c <= endColIdx; c++) {
        if (sortedColumns[c]) cells.add(`${r}-${sortedColumns[c].name}`)
      }
    }
    return cells
  }, [sortedColumns, getColIndex])

  // 单元格鼠标事件
  const handleCellMouseDown = useCallback((actualRowIndex: number, colName: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    
    const cellKey = `${actualRowIndex}-${colName}`
    
    if (e.shiftKey && activeCell) {
      setSelectedCells(getSelectedCellsFromRange(activeCell, { row: actualRowIndex, col: colName }))
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedCells(prev => {
        const next = new Set(prev)
        if (next.has(cellKey)) next.delete(cellKey)
        else next.add(cellKey)
        return next
      })
      setActiveCell({ row: actualRowIndex, col: colName })
    } else {
      setSelectedCells(new Set([cellKey]))
      setSelectionStart({ row: actualRowIndex, col: colName })
      setActiveCell({ row: actualRowIndex, col: colName })
      setIsSelecting(true)
    }
  }, [activeCell, getSelectedCellsFromRange])

  const handleCellMouseEnter = useCallback((actualRowIndex: number, colName: string) => {
    if (isSelecting && selectionStart) {
      setSelectedCells(getSelectedCellsFromRange(selectionStart, { row: actualRowIndex, col: colName }))
    }
  }, [isSelecting, selectionStart, getSelectedCellsFromRange])

  // 框选结束
  useEffect(() => {
    const handleMouseUp = () => setIsSelecting(false)
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  // 搜索导航
  const jumpToMatch = useCallback((index: number) => {
    if (matchesArray.length === 0) return
    const match = matchesArray[index]
    if (!match) return
    const idx = match.indexOf('-')
    const rowIndex = parseInt(match.substring(0, idx))
    const colName = match.substring(idx + 1)
    
    const container = containerRef.current
    if (container) {
      container.scrollTop = Math.max(0, rowIndex * rowHeight - containerHeight / 2)
    }
    
    setSelectedCells(new Set([match]))
    setActiveCell({ row: rowIndex, col: colName })
  }, [matchesArray, rowHeight, containerHeight])

  const nextMatch = useCallback(() => {
    if (matchesArray.length === 0) return
    const nextIndex = (currentMatchIndex + 1) % matchesArray.length
    setCurrentMatchIndex(nextIndex)
    jumpToMatch(nextIndex)
  }, [currentMatchIndex, matchesArray.length, jumpToMatch])

  const prevMatch = useCallback(() => {
    if (matchesArray.length === 0) return
    const prevIndex = (currentMatchIndex - 1 + matchesArray.length) % matchesArray.length
    setCurrentMatchIndex(prevIndex)
    jumpToMatch(prevIndex)
  }, [currentMatchIndex, matchesArray.length, jumpToMatch])

  // 移动到下一个单元格
  const moveToNextCell = useCallback((currentRow: number, currentCol: string, direction: 'next' | 'prev' = 'next') => {
    const currentColIndex = getColIndex(currentCol)
    let nextRow = currentRow
    let nextColIndex = direction === 'next' ? currentColIndex + 1 : currentColIndex - 1
    
    if (direction === 'next') {
      if (nextColIndex >= sortedColumns.length) {
        nextColIndex = 0
        nextRow = currentRow + 1
        if (nextRow >= data.length) {
          nextRow = data.length - 1
          nextColIndex = sortedColumns.length - 1
        }
      }
    } else {
      if (nextColIndex < 0) {
        nextColIndex = sortedColumns.length - 1
        nextRow = currentRow - 1
        if (nextRow < 0) {
          nextRow = 0
          nextColIndex = 0
        }
      }
    }
    
    const nextColName = sortedColumns[nextColIndex]?.name
    if (nextColName) {
      setActiveCell({ row: nextRow, col: nextColName })
      setSelectedCells(new Set([`${nextRow}-${nextColName}`]))
      
      // 自动滚动到可见区域
      const container = containerRef.current
      if (container) {
        const targetTop = nextRow * rowHeight
        const visibleTop = container.scrollTop
        const visibleBottom = visibleTop + containerHeight
        
        if (targetTop < visibleTop) {
          container.scrollTop = targetTop
        } else if (targetTop + rowHeight > visibleBottom) {
          container.scrollTop = targetTop - containerHeight + rowHeight
        }
      }
    }
    
    return { row: nextRow, col: sortedColumns[nextColIndex]?.name }
  }, [getColIndex, sortedColumns, data.length, rowHeight, containerHeight])

  // 复制选中的单元格数据（Navicat风格：制表符分隔列，换行符分隔行）
  const copySelectedCells = useCallback(async () => {
    if (selectedCells.size === 0) return
    
    // 解析选中的单元格，获取行列范围
    const cellsArray = [...selectedCells]
    const rowIndices = new Set<number>()
    const colIndices = new Set<number>()
    
    cellsArray.forEach(cellKey => {
      const idx = cellKey.indexOf('-')
      const rowIndex = parseInt(cellKey.substring(0, idx))
      const colName = cellKey.substring(idx + 1)
      rowIndices.add(rowIndex)
      colIndices.add(getColIndex(colName))
    })
    
    const sortedRows = [...rowIndices].sort((a, b) => a - b)
    const sortedColIndices = [...colIndices].sort((a, b) => a - b)
    
    // 构建复制的文本（制表符分隔列，换行符分隔行）
    const lines: string[] = []
    for (const rowIndex of sortedRows) {
      const row = data[rowIndex]
      if (!row) continue
      
      const values: string[] = []
      for (const colIdx of sortedColIndices) {
        const col = sortedColumns[colIdx]
        if (!col) continue
        const cellKey = `${rowIndex}-${col.name}`
        // 只复制选中的单元格
        if (selectedCells.has(cellKey)) {
          const value = row[col.name]
          values.push(value === null || value === undefined ? '' : String(value))
        } else {
          values.push('')
        }
      }
      lines.push(values.join('\t'))
    }
    
    const text = lines.join('\n')
    await navigator.clipboard.writeText(text)
    return { rows: sortedRows.length, cols: sortedColIndices.length }
  }, [selectedCells, data, sortedColumns, getColIndex])

  // 粘贴数据到选中的单元格（Navicat风格：自动扩展到多个单元格，超出则新增行）
  const pasteToSelectedCells = useCallback(async () => {
    if (!activeCell || !editable) return
    
    const text = await navigator.clipboard.readText()
    if (!text) return
    
    // 解析粘贴的数据（制表符分隔列，换行符分隔行）
    const lines = text.split('\n').map(line => line.split('\t'))
    if (lines.length === 0) return
    
    const startRow = activeCell.row
    const startColIdx = getColIndex(activeCell.col)
    
    const updates: { rowIndex: number; colName: string; value: any }[] = []
    let needNewRows = 0
    
    for (let i = 0; i < lines.length; i++) {
      const rowIndex = startRow + i
      const lineData = lines[i]
      
      // 检查是否需要新增行
      if (rowIndex >= data.length) {
        needNewRows++
      }
      
      for (let j = 0; j < lineData.length; j++) {
        const colIdx = startColIdx + j
        if (colIdx >= sortedColumns.length) continue
        
        const col = sortedColumns[colIdx]
        const value = lineData[j]
        
        updates.push({
          rowIndex,
          colName: col.name,
          value: value === '' ? null : value
        })
      }
    }
    
    // 先新增需要的行
    for (let i = 0; i < needNewRows; i++) {
      onAddRow?.()
    }
    
    // 批量更新或逐个更新
    if (onBatchUpdate && updates.length > 0) {
      // 稍微延迟以确保新增行已经创建
      setTimeout(() => {
        onBatchUpdate(updates)
      }, needNewRows > 0 ? 50 : 0)
    } else {
      // 逐个更新
      setTimeout(() => {
        updates.forEach(({ rowIndex, colName, value }) => {
          onCellChange?.(rowIndex, colName, value)
        })
      }, needNewRows > 0 ? 50 : 0)
    }
    
    // 更新选中区域
    const newSelectedCells = new Set<string>()
    for (let i = 0; i < lines.length; i++) {
      for (let j = 0; j < lines[i].length; j++) {
        const colIdx = startColIdx + j
        if (colIdx >= sortedColumns.length) continue
        newSelectedCells.add(`${startRow + i}-${sortedColumns[colIdx].name}`)
      }
    }
    setSelectedCells(newSelectedCells)
    
    return { rows: lines.length, cols: lines[0]?.length || 0, newRows: needNewRows }
  }, [activeCell, editable, data, sortedColumns, getColIndex, onAddRow, onBatchUpdate, onCellChange])

  // 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F 搜索
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && isFocused) {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
      // Escape 关闭搜索
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false)
        setSearchQuery('')
      }
      // Ctrl+S 保存
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && isFocused && editable) {
        e.preventDefault()
        onSave?.()
      }
      // Ctrl+C 复制
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && isFocused && !editingCell && selectedCells.size > 0) {
        e.preventDefault()
        copySelectedCells()
      }
      // Ctrl+V 粘贴
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && isFocused && !editingCell && editable && activeCell) {
        e.preventDefault()
        pasteToSelectedCells()
      }
      // F5 刷新
      if (e.key === 'F5' && isFocused) {
        e.preventDefault()
        onRefresh?.()
      }
      // Tab 键导航（当不在编辑状态时）
      if (e.key === 'Tab' && isFocused && !editingCell && activeCell) {
        e.preventDefault()
        moveToNextCell(activeCell.row, activeCell.col, e.shiftKey ? 'prev' : 'next')
      }
      // 方向键导航
      if (isFocused && !editingCell && activeCell) {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          moveToNextCell(activeCell.row, activeCell.col, 'next')
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          moveToNextCell(activeCell.row, activeCell.col, 'prev')
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          const newRow = Math.min(activeCell.row + 1, data.length - 1)
          setActiveCell({ row: newRow, col: activeCell.col })
          setSelectedCells(new Set([`${newRow}-${activeCell.col}`]))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          const newRow = Math.max(activeCell.row - 1, 0)
          setActiveCell({ row: newRow, col: activeCell.col })
          setSelectedCells(new Set([`${newRow}-${activeCell.col}`]))
        }
      }
      // Enter 进入编辑模式
      if (e.key === 'Enter' && isFocused && !editingCell && activeCell && editable) {
        e.preventDefault()
        const value = data[activeCell.row]?.[activeCell.col]
        setEditingCell({ row: activeCell.row, col: activeCell.col })
        setEditValue(value === null ? '' : String(value))
        setTimeout(() => inputRef.current?.focus(), 0)
      }
      // Delete 或 Backspace 清空单元格
      if ((e.key === 'Delete' || e.key === 'Backspace') && isFocused && !editingCell && activeCell && editable) {
        e.preventDefault()
        onCellChange?.(activeCell.row, activeCell.col, null)
      }
      // 直接输入进入编辑模式（可打印字符）
      if (isFocused && !editingCell && activeCell && editable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setEditingCell({ row: activeCell.row, col: activeCell.col })
        setEditValue(e.key) // 直接用输入的字符作为初始值
        setTimeout(() => {
          const input = inputRef.current
          if (input) {
            input.focus()
            // 将光标移到末尾
            input.setSelectionRange(input.value.length, input.value.length)
          }
        }, 0)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused, showSearch, editable, onSave, onRefresh, editingCell, activeCell, moveToNextCell, data, onCellChange, selectedCells, copySelectedCells, pasteToSelectedCells])

  // 全选
  const handleSelectAll = useCallback(() => {
    if (selectedCells.size === data.length * sortedColumns.length) {
      setSelectedCells(new Set())
    } else {
      const all = new Set<string>()
      for (let r = 0; r < data.length; r++) {
        for (const col of sortedColumns) {
          all.add(`${r}-${col.name}`)
        }
      }
      setSelectedCells(all)
    }
  }, [data.length, sortedColumns, selectedCells.size])

  // 取消选择
  const clearSelection = useCallback(() => {
    setSelectedCells(new Set())
    setActiveCell(null)
    setEditingCell(null)
  }, [])

  // 渲染可见行
  const { startIndex, endIndex, totalHeight, offsetY } = virtualState
  const scrollLeft = scrollLeftRef.current

  return (
    <div 
      className="navi-table-container"
      tabIndex={0}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsFocused(false)
      }}
      onMouseEnter={() => setIsFocused(true)}
    >
      {/* 搜索框 */}
      {showSearch && (
        <div className="navi-search-bar">
          <Search size={14} className="text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索数据... (Enter 下一个)"
            className="navi-search-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); nextMatch() }
              else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); prevMatch() }
            }}
          />
          {searchQuery && (
            <span className="text-xs text-gray-500">
              {matchesArray.length > 0 ? `${currentMatchIndex + 1}/${matchesArray.length}` : '0/0'}
            </span>
          )}
          <button onClick={prevMatch} disabled={matchesArray.length === 0} className="navi-search-btn">
            <ChevronLeft size={16} />
          </button>
          <button onClick={nextMatch} disabled={matchesArray.length === 0} className="navi-search-btn">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => { setShowSearch(false); setSearchQuery('') }} className="navi-search-btn">
            <X size={16} />
          </button>
        </div>
      )}
      
      {/* 主滚动容器 */}
      <div 
        ref={containerRef} 
        className="navi-scroll-container"
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('navi-body')) {
            clearSelection()
          }
        }}
      >
        {/* 表头 */}
        <div className="navi-header" style={{ minWidth: totalWidth }}>
          {editable && (
            <div 
              className="navi-row-number-header"
              style={{ width: rowNumberWidth }}
              onClick={handleSelectAll}
            >
              #
            </div>
          )}
          {sortedColumns.map((col) => {
            const isPinned = pinnedColumns.has(col.name)
            const colWidth = columnWidths[col.name] || 100
            
            return (
              <div 
                key={col.name}
                onClick={() => togglePin(col.name)}
                className={`navi-header-cell ${isPinned ? 'pinned' : ''}`}
                style={{ 
                  width: colWidth,
                  minWidth: colWidth,
                  position: isPinned ? 'sticky' : 'relative',
                  left: isPinned ? pinnedLeftOffsets[col.name] : 'auto',
                  boxShadow: isPinned && scrollLeft > 0 ? '2px 0 4px rgba(0,0,0,0.3)' : 'none',
                  height: headerHeight,
                }}
                title={isPinned ? `取消固定 ${col.name}` : `固定 ${col.name}`}
              >
                <div className="navi-header-content">
                  <div className="navi-header-row">
                    <span className="navi-col-name">{col.name}</span>
                    {showColumnInfo && col.key === 'PRI' && <Key size={10} className="text-amber-500" />}
                    <span className={`navi-pin-icon ${isPinned ? 'active' : ''}`}>
                      {isPinned ? <Pin size={10} /> : <PinOff size={10} />}
                    </span>
                  </div>
                  {showColumnInfo && col.type && (
                    <div className="navi-col-type">{col.type}</div>
                  )}
                  {showColumnInfo && col.comment && (
                    <div className="navi-col-comment" title={col.comment}>{col.comment}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        
        {/* 数据区域 */}
        <div 
          className="navi-body" 
          style={{ height: Math.max(totalHeight, containerHeight), minWidth: totalWidth }}
          onClick={(e) => {
            if (e.target === e.currentTarget) clearSelection()
          }}
        >
          <div className="navi-rows-container" style={{ transform: `translateY(${offsetY}px)` }}>
            {Array.from({ length: endIndex - startIndex + 1 }, (_, i) => {
              const actualRowIndex = startIndex + i
              const row = data[actualRowIndex]
              if (!row) return null
              
              const rowHasSelection = selectedRows.has(actualRowIndex)
              
              return (
                <div 
                  key={actualRowIndex}
                  className={`navi-row ${rowHasSelection ? 'selected' : ''}`}
                  style={{ height: rowHeight }}
                  onContextMenu={(e) => {
                    if (editable) {
                      e.preventDefault()
                      if (selectedRows.size === 0) {
                        const firstCol = sortedColumns[0]?.name
                        if (firstCol) {
                          setSelectedCells(new Set([`${actualRowIndex}-${firstCol}`]))
                          setActiveCell({ row: actualRowIndex, col: firstCol })
                        }
                      }
                      setContextMenu({ x: e.clientX, y: e.clientY, row: actualRowIndex, col: '' })
                    }
                  }}
                >
                  {/* 行号 */}
                  {editable && (
                    <div 
                      className={`navi-row-number ${rowHasSelection ? 'selected' : ''}`}
                      style={{ width: rowNumberWidth, height: rowHeight }}
                      onClick={(e) => {
                        const rowCells = new Set<string>()
                        for (const col of sortedColumns) {
                          rowCells.add(`${actualRowIndex}-${col.name}`)
                        }
                        
                        if (e.ctrlKey || e.metaKey) {
                          setSelectedCells(prev => {
                            const next = new Set(prev)
                            rowCells.forEach(cell => {
                              if (next.has(cell)) next.delete(cell)
                              else next.add(cell)
                            })
                            return next
                          })
                        } else {
                          setSelectedCells(rowCells)
                          setActiveCell({ row: actualRowIndex, col: sortedColumns[0]?.name || '' })
                        }
                      }}
                    >
                      {actualRowIndex + 1}
                    </div>
                  )}
                  
                  {/* 单元格 - 内联渲染提升性能 */}
                  {sortedColumns.map((col) => {
                    const isPinned = pinnedColumns.has(col.name)
                    const colWidth = columnWidths[col.name] || 100
                    const value = row[col.name]
                    const cellKey = `${actualRowIndex}-${col.name}`
                    const isEditing = editingCell?.row === actualRowIndex && editingCell?.col === col.name
                    const isCellSelected = selectedCells.has(cellKey)
                    const isActiveCell = activeCell?.row === actualRowIndex && activeCell?.col === col.name
                    const isModified = modifiedCells?.has(cellKey)
                    const isSearchMatch = searchMatches.has(cellKey)
                    const isCurrentMatch = matchesArray[currentMatchIndex] === cellKey
                    
                    // 计算显示值
                    let displayValue: string | null = null
                    if (value !== null && value !== undefined) {
                      displayValue = typeof value === 'object' 
                        ? JSON.stringify(value) 
                        : formatDateTime(value, col.type || '')
                    }
                    
                    // 计算背景色
                    let bgColor = 'transparent'
                    if (isCurrentMatch) bgColor = '#665500'
                    else if (isSearchMatch) bgColor = 'rgba(255, 200, 0, 0.15)'
                    else if (isActiveCell) bgColor = '#264f78'
                    else if (isCellSelected) bgColor = 'rgba(38, 79, 120, 0.5)'
                    else if (isModified) bgColor = 'rgba(249, 115, 22, 0.15)'
                    else if (isPinned) bgColor = '#1e2d3d'
                    
                    return (
                      <div
                        key={col.name}
                        className="navi-cell"
                        style={{
                          background: bgColor,
                          position: isPinned ? 'sticky' : 'relative',
                          left: isPinned ? pinnedLeftOffsets[col.name] : 'auto',
                          width: colWidth,
                          minWidth: colWidth,
                          maxWidth: colWidth,
                          height: rowHeight,
                          boxShadow: isPinned && scrollLeft > 0 ? '2px 0 4px rgba(0,0,0,0.3)' : 'none',
                          outline: isActiveCell && !isEditing ? '1px solid #007acc' : 'none',
                          outlineOffset: '-1px',
                          zIndex: isPinned ? 10 : 1,
                        }}
                        onMouseDown={(e) => handleCellMouseDown(actualRowIndex, col.name, e)}
                        onMouseEnter={() => handleCellMouseEnter(actualRowIndex, col.name)}
                        onDoubleClick={() => {
                          if (editable) {
                            setEditingCell({ row: actualRowIndex, col: col.name })
                            setEditValue(value === null ? '' : String(value))
                            setTimeout(() => inputRef.current?.focus(), 0)
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (!selectedCells.has(cellKey)) {
                            setSelectedCells(new Set([cellKey]))
                            setActiveCell({ row: actualRowIndex, col: col.name })
                          }
                          setContextMenu({ x: e.clientX, y: e.clientY, row: actualRowIndex, col: col.name })
                        }}
                        title={displayValue || ''}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => {
                              if (editValue !== (value === null ? '' : String(value))) {
                                onCellChange?.(actualRowIndex, col.name, editValue === '' ? null : editValue)
                              }
                              setEditingCell(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                // 保存当前单元格
                                if (editValue !== (value === null ? '' : String(value))) {
                                  onCellChange?.(actualRowIndex, col.name, editValue === '' ? null : editValue)
                                }
                                setEditingCell(null)
                                // 移动到下一行同列
                                const newRow = Math.min(actualRowIndex + 1, data.length - 1)
                                setActiveCell({ row: newRow, col: col.name })
                                setSelectedCells(new Set([`${newRow}-${col.name}`]))
                              } else if (e.key === 'Tab') {
                                e.preventDefault()
                                // 保存当前单元格
                                if (editValue !== (value === null ? '' : String(value))) {
                                  onCellChange?.(actualRowIndex, col.name, editValue === '' ? null : editValue)
                                }
                                // 计算下一个单元格位置
                                const currentColIndex = getColIndex(col.name)
                                let nextRow = actualRowIndex
                                let nextColIndex = e.shiftKey ? currentColIndex - 1 : currentColIndex + 1
                                
                                if (!e.shiftKey) {
                                  if (nextColIndex >= sortedColumns.length) {
                                    nextColIndex = 0
                                    nextRow = actualRowIndex + 1
                                    if (nextRow >= data.length) {
                                      nextRow = data.length - 1
                                      nextColIndex = sortedColumns.length - 1
                                    }
                                  }
                                } else {
                                  if (nextColIndex < 0) {
                                    nextColIndex = sortedColumns.length - 1
                                    nextRow = actualRowIndex - 1
                                    if (nextRow < 0) {
                                      nextRow = 0
                                      nextColIndex = 0
                                    }
                                  }
                                }
                                
                                const nextColName = sortedColumns[nextColIndex]?.name
                                if (nextColName) {
                                  // 直接切换到下一个单元格的编辑状态
                                  const nextValue = data[nextRow]?.[nextColName]
                                  setEditingCell({ row: nextRow, col: nextColName })
                                  setEditValue(nextValue === null ? '' : String(nextValue))
                                  setActiveCell({ row: nextRow, col: nextColName })
                                  setSelectedCells(new Set([`${nextRow}-${nextColName}`]))
                                  setTimeout(() => inputRef.current?.focus(), 0)
                                }
                              } else if (e.key === 'Escape') {
                                setEditingCell(null)
                              } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                                e.preventDefault()
                                // 保存当前单元格
                                if (editValue !== (value === null ? '' : String(value))) {
                                  onCellChange?.(actualRowIndex, col.name, editValue === '' ? null : editValue)
                                }
                                setEditingCell(null)
                                // 触发保存
                                onSave?.()
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="navi-cell-input"
                            autoFocus
                          />
                        ) : value === null ? (
                          <span className="navi-null">NULL</span>
                        ) : value === '' ? (
                          <span className="navi-empty"></span>
                        ) : typeof value === 'object' ? (
                          <span className="navi-json">{displayValue}</span>
                        ) : (
                          <span className="navi-value">{displayValue}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
        
        {data.length === 0 && (
          <div className="navi-empty">暂无数据</div>
        )}
      </div>
      
      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setContextMenu(null); setSelectedCells(new Set()) }} />
          <div
            className="navi-context-menu"
            style={{ 
              left: Math.min(contextMenu.x, window.innerWidth - 200), 
              top: Math.min(contextMenu.y, window.innerHeight - 300) 
            }}
          >
            {selectedCells.size > 0 && (
              <div className="navi-context-info">
                已选 {selectedCells.size} 格 · {selectedRows.size} 行
              </div>
            )}
            
            <button
              className="navi-context-item"
              onClick={async () => {
                await copySelectedCells()
                setContextMenu(null)
              }}
            >
              <Copy size={13} />
              <span>复制</span>
              <span className="navi-shortcut">Ctrl+C</span>
            </button>

            {editable && (
              <>
                <button
                  className="navi-context-item"
                  onClick={async () => {
                    await pasteToSelectedCells()
                    setContextMenu(null)
                  }}
                >
                  <ClipboardPaste size={13} />
                  <span>粘贴</span>
                  <span className="navi-shortcut">Ctrl+V</span>
                </button>

                <div className="navi-context-divider" />

                <button
                  className="navi-context-item warning"
                  onClick={() => {
                    selectedCells.forEach(cellKey => {
                      const idx = cellKey.indexOf('-')
                      const rowIndex = parseInt(cellKey.substring(0, idx))
                      const colName = cellKey.substring(idx + 1)
                      onCellChange?.(rowIndex, colName, null)
                    })
                    setContextMenu(null)
                  }}
                >
                  <FileX size={13} />
                  <span>设为 <span className="font-mono">NULL</span></span>
                  {selectedCells.size > 1 && <span className="navi-shortcut">{selectedCells.size}格</span>}
                </button>

                <button
                  className="navi-context-item"
                  onClick={() => {
                    selectedCells.forEach(cellKey => {
                      const idx = cellKey.indexOf('-')
                      const rowIndex = parseInt(cellKey.substring(0, idx))
                      const colName = cellKey.substring(idx + 1)
                      onCellChange?.(rowIndex, colName, '')
                    })
                    setContextMenu(null)
                  }}
                >
                  <Type size={13} />
                  <span>设为空字符串</span>
                  {selectedCells.size > 1 && <span className="navi-shortcut">{selectedCells.size}格</span>}
                </button>

                <div className="navi-context-divider" />

                <button
                  className="navi-context-item danger"
                  onClick={() => {
                    if (selectedRows.size > 1) {
                      const sortedIndices = [...selectedRows].sort((a, b) => b - a)
                      if (onDeleteRows) {
                        onDeleteRows(sortedIndices)
                      } else {
                        sortedIndices.forEach(rowIndex => onDeleteRow?.(rowIndex))
                      }
                    } else {
                      onDeleteRow?.(contextMenu.row)
                    }
                    setContextMenu(null)
                    setSelectedCells(new Set())
                  }}
                >
                  <Trash2 size={13} />
                  {selectedRows.size > 1 ? `删除 ${selectedRows.size} 行` : '删除此行'}
                </button>
              </>
            )}

            <div className="navi-context-divider" />

            <button
              className="navi-context-item success"
              onClick={() => {
                onRefresh?.()
                setContextMenu(null)
                setSelectedCells(new Set())
              }}
            >
              <RefreshCw size={13} />
              <span>刷新数据</span>
              <span className="navi-shortcut">F5</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
})

export default VirtualDataTable
