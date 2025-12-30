import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Key, Info, Pin, PinOff, Trash2, Search, X, ChevronLeft, ChevronRight } from 'lucide-react'

// 高性能虚拟滚动数据表格
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
  modifiedCells?: Set<string>
  rowHeight?: number
  overscan?: number
}

// 使用 memo 包装整个组件
const VirtualDataTable = memo(function VirtualDataTable({
  columns,
  data,
  showColumnInfo = false,
  editable = false,
  primaryKeyColumn,
  onCellChange,
  onDeleteRow,
  onDeleteRows,
  modifiedCells,
  rowHeight = 36,
  overscan = 10
}: VirtualDataTableProps) {
  const [pinnedColumns, setPinnedColumns] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  
  // 编辑状态
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // 搜索功能
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  
  // 选择状态
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: string } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [activeCell, setActiveCell] = useState<{ row: number; col: string } | null>(null)
  
  // 排序后的列（固定列在前）
  const sortedColumns = useMemo(() => 
    [...columns].sort((a, b) => {
      const aPinned = pinnedColumns.has(a.name) ? 0 : 1
      const bPinned = pinnedColumns.has(b.name) ? 0 : 1
      return aPinned - bPinned
    }), 
  [columns, pinnedColumns])
  
  // 搜索匹配
  const searchMatches = useMemo(() => {
    if (!searchQuery) return new Set<string>()
    const matches = new Set<string>()
    const query = searchQuery.toLowerCase()
    data.forEach((row, rowIndex) => {
      sortedColumns.forEach(col => {
        const value = row[col.name]
        if (value !== null && value !== undefined) {
          if (String(value).toLowerCase().includes(query)) {
            matches.add(`${rowIndex}-${col.name}`)
          }
        }
      })
    })
    return matches
  }, [searchQuery, data, sortedColumns])
  
  const matchesArray = useMemo(() => [...searchMatches], [searchMatches])
  
  // 虚拟滚动计算
  const { visibleRows, totalHeight, offsetY, startIndex, endIndex } = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    const visibleCount = Math.ceil(containerHeight / rowHeight)
    const endIndex = Math.min(data.length - 1, startIndex + visibleCount + overscan * 2)
    
    return {
      startIndex,
      endIndex,
      visibleRows: data.slice(startIndex, endIndex + 1),
      totalHeight: data.length * rowHeight,
      offsetY: startIndex * rowHeight
    }
  }, [data, scrollTop, containerHeight, rowHeight, overscan])
  
  // 监听滚动和尺寸变化
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    const updateSize = () => setContainerHeight(container.clientHeight)
    const handleScroll = () => {
      setScrollTop(container.scrollTop)
      setScrollLeft(container.scrollLeft)
    }
    
    updateSize()
    container.addEventListener('scroll', handleScroll, { passive: true })
    
    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(container)
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
    }
  }, [])
  
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
        if (sortedColumns[c]) {
          cells.add(`${r}-${sortedColumns[c].name}`)
        }
      }
    }
    return cells
  }, [sortedColumns, getColIndex])
  
  // 获取选中的行
  const getSelectedRows = useCallback(() => {
    const rows = new Set<number>()
    selectedCells.forEach(cell => {
      const [rowStr] = cell.split('-')
      rows.add(parseInt(rowStr))
    })
    return rows
  }, [selectedCells])
  
  // 单元格点击
  const handleCellMouseDown = (rowIndex: number, colName: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    
    const actualRowIndex = startIndex + rowIndex
    const cellKey = `${actualRowIndex}-${colName}`
    
    if (e.shiftKey && activeCell) {
      const cells = getSelectedCellsFromRange(activeCell, { row: actualRowIndex, col: colName })
      setSelectedCells(cells)
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedCells(prev => {
        const next = new Set(prev)
        if (next.has(cellKey)) {
          next.delete(cellKey)
        } else {
          next.add(cellKey)
        }
        return next
      })
      setActiveCell({ row: actualRowIndex, col: colName })
    } else {
      setSelectedCells(new Set([cellKey]))
      setSelectionStart({ row: actualRowIndex, col: colName })
      setActiveCell({ row: actualRowIndex, col: colName })
      setIsSelecting(true)
    }
  }
  
  // 框选移动
  const handleCellMouseEnter = (rowIndex: number, colName: string) => {
    if (isSelecting && selectionStart) {
      const actualRowIndex = startIndex + rowIndex
      const cells = getSelectedCellsFromRange(selectionStart, { row: actualRowIndex, col: colName })
      setSelectedCells(cells)
    }
  }
  
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
    const [rowStr, colName] = match.split('-')
    const rowIndex = parseInt(rowStr)
    
    // 滚动到行
    const container = containerRef.current
    if (container) {
      const targetScrollTop = rowIndex * rowHeight - containerHeight / 2
      container.scrollTop = Math.max(0, targetScrollTop)
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
  
  // 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused, showSearch])
  
  // 全选
  const handleSelectAll = useCallback(() => {
    if (selectedCells.size === data.length * sortedColumns.length) {
      setSelectedCells(new Set())
    } else {
      const all = new Set<string>()
      data.forEach((_, r) => {
        sortedColumns.forEach(col => {
          all.add(`${r}-${col.name}`)
        })
      })
      setSelectedCells(all)
    }
  }, [data, sortedColumns, selectedCells.size])
  
  // 计算固定列宽度
  const pinnedColumnWidth = 150
  const rowNumberWidth = editable ? 50 : 0
  
  return (
    <div 
      style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}
      tabIndex={0}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsFocused(false)
        }
      }}
      onMouseEnter={() => setIsFocused(true)}
    >
      {/* 搜索框 */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-2 bg-metro-surface border-b border-metro-border/50 flex-shrink-0">
          <Search size={14} className="text-text-disabled flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索数据... (Enter 下一个)"
            className="flex-1 h-7 px-2 bg-metro-bg text-sm text-white placeholder-text-disabled
                       border border-transparent focus:border-accent-blue transition-all rounded-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                nextMatch()
              } else if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault()
                prevMatch()
              }
            }}
          />
          {searchQuery && (
            <span className="text-xs text-text-tertiary flex-shrink-0">
              {matchesArray.length > 0 ? `${currentMatchIndex + 1}/${matchesArray.length}` : '0/0'}
            </span>
          )}
          <button onClick={prevMatch} disabled={matchesArray.length === 0}
            className="p-1 hover:bg-metro-hover rounded-sm disabled:opacity-30 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button onClick={nextMatch} disabled={matchesArray.length === 0}
            className="p-1 hover:bg-metro-hover rounded-sm disabled:opacity-30 transition-colors">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => { setShowSearch(false); setSearchQuery('') }}
            className="p-1 hover:bg-metro-hover rounded-sm transition-colors">
            <X size={16} />
          </button>
        </div>
      )}
      
      {/* 主容器 */}
      <div 
        ref={containerRef}
        style={{ flex: 1, overflow: 'auto', position: 'relative' }}
      >
        {/* 表头 */}
        <div 
          className="sticky top-0 z-20 flex"
          style={{ 
            minWidth: 'max-content',
            background: '#252525'
          }}
        >
          {editable && (
            <div 
              className="sticky left-0 z-30 px-3 py-2.5 text-center border-b border-r border-metro-border/50 
                         text-text-disabled text-xs font-medium cursor-pointer hover:bg-metro-hover transition-colors"
              style={{ background: '#252525', width: rowNumberWidth, minWidth: rowNumberWidth }}
              onClick={handleSelectAll}
            >
              #
            </div>
          )}
          {sortedColumns.map((col, i) => {
            const isPinned = pinnedColumns.has(col.name)
            const pinnedIndex = isPinned ? [...pinnedColumns].indexOf(col.name) : -1
            
            return (
              <div 
                key={col.name}
                onClick={() => togglePin(col.name)}
                className={`px-4 py-2.5 text-left font-medium border-b border-r border-metro-border/50 
                           whitespace-nowrap select-none cursor-pointer transition-colors
                           ${isPinned ? 'z-30' : 'hover:bg-metro-hover'}`}
                style={{ 
                  background: isPinned ? '#1e3a4a' : '#252525',
                  position: isPinned ? 'sticky' : 'relative',
                  left: isPinned ? `${rowNumberWidth + pinnedIndex * pinnedColumnWidth}px` : 'auto',
                  minWidth: '120px',
                  boxShadow: isPinned && scrollLeft > 0 ? '2px 0 8px rgba(0,0,0,0.4)' : 'none',
                }}
                title={isPinned ? `取消固定 ${col.name}` : `固定 ${col.name}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`transition-colors ${isPinned ? 'text-accent-blue' : 'text-text-disabled'}`}>
                    {isPinned ? <Pin size={12} /> : <PinOff size={12} />}
                  </span>
                  {showColumnInfo && col.key === 'PRI' && <Key size={12} className="text-accent-orange" />}
                  <span className="text-accent-blue-light font-semibold">{col.name}</span>
                  {showColumnInfo && col.type && (
                    <span className="text-text-disabled font-normal text-xs">({col.type})</span>
                  )}
                  {showColumnInfo && col.comment && (
                    <span className="text-accent-teal text-xs" title={col.comment}>
                      <Info size={12} />
                    </span>
                  )}
                </div>
                {showColumnInfo && col.comment && (
                  <div className="text-xs text-white/40 font-normal mt-0.5 max-w-[200px] truncate">
                    {col.comment}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        
        {/* 数据区域 - 虚拟滚动 */}
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)`, minWidth: 'max-content' }}>
            {visibleRows.map((row, visibleIndex) => {
              const actualRowIndex = startIndex + visibleIndex
              const rowHasSelection = [...selectedCells].some(cell => cell.startsWith(`${actualRowIndex}-`))
              
              return (
                <div 
                  key={actualRowIndex}
                  className="flex group"
                  style={{ height: rowHeight }}
                  onContextMenu={(e) => {
                    if (editable) {
                      e.preventDefault()
                      const selectedRows = getSelectedRows()
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
                      className={`sticky left-0 z-10 px-2 border-b border-r border-metro-border/50 
                                  text-center text-xs cursor-pointer select-none flex items-center justify-center
                                  ${rowHasSelection ? 'text-white font-medium' : 'text-white/40'}`}
                      style={{ 
                        background: rowHasSelection ? '#1a5a8a' : '#1a1a1a', 
                        width: rowNumberWidth, 
                        minWidth: rowNumberWidth,
                        height: rowHeight
                      }}
                      onClick={(e) => {
                        const rowCells = new Set<string>()
                        sortedColumns.forEach(col => rowCells.add(`${actualRowIndex}-${col.name}`))
                        
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
                  
                  {/* 单元格 */}
                  {sortedColumns.map((col) => {
                    const isPinned = pinnedColumns.has(col.name)
                    const pinnedIndex = isPinned ? [...pinnedColumns].indexOf(col.name) : -1
                    const value = row[col.name]
                    const cellKey = `${actualRowIndex}-${col.name}`
                    const isEditing = editingCell?.row === actualRowIndex && editingCell?.col === col.name
                    const isCellSelected = selectedCells.has(cellKey)
                    const isActiveCell = activeCell?.row === actualRowIndex && activeCell?.col === col.name
                    const isModified = modifiedCells?.has(cellKey)
                    const isSearchMatch = searchMatches.has(cellKey)
                    const isCurrentMatch = matchesArray[currentMatchIndex] === cellKey
                    
                    const getCellBg = () => {
                      if (isCurrentMatch) return 'rgba(255, 200, 0, 0.4)'
                      if (isSearchMatch) return 'rgba(255, 200, 0, 0.15)'
                      if (isActiveCell) return '#1a5a8a'
                      if (isCellSelected) return 'rgba(59, 130, 246, 0.25)'
                      if (isModified) return 'rgba(249, 115, 22, 0.15)'
                      if (isPinned) return '#1a3040'
                      return 'transparent'
                    }
                    
                    return (
                      <div 
                        key={col.name}
                        className={`border-b border-r border-metro-border/50 font-mono text-white/80 
                                    whitespace-nowrap relative flex items-center
                                    ${isPinned ? 'z-10' : ''}
                                    ${editable ? 'cursor-cell' : ''}`}
                        style={{ 
                          background: getCellBg(),
                          position: isPinned ? 'sticky' : 'relative',
                          left: isPinned ? `${rowNumberWidth + pinnedIndex * pinnedColumnWidth}px` : 'auto',
                          minWidth: '120px',
                          height: rowHeight,
                          padding: '0 16px',
                          boxShadow: isPinned && scrollLeft > 0 ? '2px 0 4px rgba(0,0,0,0.2)' : 'none',
                          outline: isCurrentMatch ? '2px solid #ffd800' : (isActiveCell ? '2px solid #3b82f6' : 'none'),
                          outlineOffset: '-1px',
                        }}
                        onMouseDown={(e) => handleCellMouseDown(visibleIndex, col.name, e)}
                        onMouseEnter={() => handleCellMouseEnter(visibleIndex, col.name)}
                        onDoubleClick={() => {
                          if (editable) {
                            setEditingCell({ row: actualRowIndex, col: col.name })
                            setEditValue(value === null ? '' : String(value))
                            setTimeout(() => inputRef.current?.focus(), 0)
                          }
                        }}
                        onContextMenu={(e) => {
                          if (editable) {
                            e.preventDefault()
                            e.stopPropagation()
                            if (!selectedCells.has(cellKey)) {
                              setSelectedCells(new Set([cellKey]))
                              setActiveCell({ row: actualRowIndex, col: col.name })
                            }
                            setContextMenu({ x: e.clientX, y: e.clientY, row: actualRowIndex, col: col.name })
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
                                onCellChange?.(actualRowIndex, col.name, editValue === '' ? null : editValue)
                              }
                              setEditingCell(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (editValue !== (value === null ? '' : String(value))) {
                                  onCellChange?.(actualRowIndex, col.name, editValue === '' ? null : editValue)
                                }
                                setEditingCell(null)
                              } else if (e.key === 'Escape') {
                                setEditingCell(null)
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-full h-full bg-transparent text-white outline-none border-none text-sm"
                            autoFocus
                          />
                        ) : value === null ? (
                          <span className="text-white/30 italic text-sm">NULL</span>
                        ) : typeof value === 'object' ? (
                          <span className="text-accent-purple text-sm">{JSON.stringify(value)}</span>
                        ) : (
                          <span className="text-sm truncate">{String(value)}</span>
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
          <div className="absolute inset-0 flex items-center justify-center text-white/30">
            暂无数据
          </div>
        )}
      </div>
      
      {/* 右键菜单 */}
      {contextMenu && editable && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setContextMenu(null); setSelectedCells(new Set()) }} />
          <div
            className="fixed z-50 bg-metro-card border border-metro-border py-1.5 min-w-[200px] shadow-metro-lg animate-fade-in"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {getSelectedRows().size > 0 && (
              <div className="px-4 py-2 text-xs text-text-disabled border-b border-metro-border mb-1">
                已选中 {selectedCells.size} 个单元格 · {getSelectedRows().size} 行
              </div>
            )}
            
            {contextMenu.col && selectedCells.size === 1 && (
              <>
                <button
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-metro-hover flex items-center gap-3 transition-colors"
                  onClick={() => {
                    onCellChange?.(contextMenu.row, contextMenu.col, null)
                    setContextMenu(null)
                  }}
                >
                  <span className="text-text-tertiary font-mono text-xs">NULL</span>
                  设为 NULL
                </button>
                <div className="my-1.5 border-t border-metro-border" />
              </>
            )}
            
            <button
              className="w-full px-4 py-2.5 text-left text-sm hover:bg-accent-red/20 flex items-center gap-3 text-accent-red transition-colors"
              onClick={() => {
                const selectedRowsSet = getSelectedRows()
                if (selectedRowsSet.size > 1) {
                  const sortedIndices = [...selectedRowsSet].sort((a, b) => b - a)
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
              <Trash2 size={14} />
              {getSelectedRows().size > 1 ? `删除 ${getSelectedRows().size} 行` : '删除此行'}
            </button>
          </div>
        </>
      )}
    </div>
  )
})

export default VirtualDataTable

