import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Connection, QueryTab, TableInfo, ColumnInfo, TableTab } from '../types'
import api from './electron-api'

// 防抖 Hook
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}

// 防抖回调 Hook
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout>()
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  return useCallback(
    ((...args: any[]) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args)
      }, delay)
    }) as T,
    [delay]
  )
}

// 节流 Hook
export function useThrottle<T>(value: T, limit: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value)
  const lastRan = useRef(Date.now())

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= limit) {
        setThrottledValue(value)
        lastRan.current = Date.now()
      }
    }, limit - (Date.now() - lastRan.current))

    return () => {
      clearTimeout(handler)
    }
  }, [value, limit])

  return throttledValue
}

// 虚拟列表 Hook - 简单实现
export function useVirtualList<T>(
  items: T[],
  containerRef: React.RefObject<HTMLElement>,
  itemHeight: number,
  overscan: number = 5
) {
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateContainerHeight = () => {
      setContainerHeight(container.clientHeight)
    }

    const handleScroll = () => {
      setScrollTop(container.scrollTop)
    }

    updateContainerHeight()
    container.addEventListener('scroll', handleScroll, { passive: true })
    
    const resizeObserver = new ResizeObserver(updateContainerHeight)
    resizeObserver.observe(container)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
    }
  }, [containerRef])

  const { startIndex, endIndex, visibleItems, totalHeight, offsetY } = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const visibleCount = Math.ceil(containerHeight / itemHeight)
    const endIndex = Math.min(items.length - 1, startIndex + visibleCount + overscan * 2)
    
    return {
      startIndex,
      endIndex,
      visibleItems: items.slice(startIndex, endIndex + 1),
      totalHeight: items.length * itemHeight,
      offsetY: startIndex * itemHeight
    }
  }, [items, scrollTop, containerHeight, itemHeight, overscan])

  return {
    visibleItems,
    totalHeight,
    offsetY,
    startIndex,
    endIndex
  }
}

// 加载状态管理 Hook
export function useLoadingState(initialState: boolean = false) {
  const [isLoading, setIsLoading] = useState(initialState)
  const [error, setError] = useState<string | null>(null)

  const startLoading = useCallback(() => {
    setIsLoading(true)
    setError(null)
  }, [])

  const stopLoading = useCallback(() => {
    setIsLoading(false)
  }, [])

  const setLoadingError = useCallback((err: string) => {
    setIsLoading(false)
    setError(err)
  }, [])

  const withLoading = useCallback(async <T>(
    fn: () => Promise<T>
  ): Promise<T | null> => {
    startLoading()
    try {
      const result = await fn()
      stopLoading()
      return result
    } catch (err: any) {
      setLoadingError(err.message || '操作失败')
      return null
    }
  }, [startLoading, stopLoading, setLoadingError])

  return {
    isLoading,
    error,
    startLoading,
    stopLoading,
    setError: setLoadingError,
    withLoading
  }
}

// 快捷键 Hook
export function useHotkey(
  key: string,
  callback: () => void,
  options: { ctrl?: boolean; shift?: boolean; alt?: boolean; enabled?: boolean } = {}
) {
  const { ctrl = false, shift = false, alt = false, enabled = true } = options

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = ctrl ? (e.ctrlKey || e.metaKey) : true
      const isShift = shift ? e.shiftKey : !e.shiftKey
      const isAlt = alt ? e.altKey : !e.altKey
      const isKey = e.key.toLowerCase() === key.toLowerCase()

      if (isCtrl && isShift && isAlt && isKey) {
        e.preventDefault()
        callback()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [key, callback, ctrl, shift, alt, enabled])
}

// 本地存储 Hook
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      window.localStorage.setItem(key, JSON.stringify(valueToStore))
    } catch (error) {
      console.error(`Error saving to localStorage:`, error)
    }
  }, [key, storedValue])

  return [storedValue, setValue] as const
}

// ============================================
// 业务 Hooks
// ============================================

// 连接管理 Hook
export function useConnections() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set())

  // 加载保存的连接
  useEffect(() => {
    const doLoadConnections = async () => {
      try {
        const saved = await api.loadConnections()
        if (saved && Array.isArray(saved)) {
          setConnections(saved)
        }
      } catch (err) {
        console.error('加载连接失败:', err)
      }
    }
    doLoadConnections()
  }, [])

  // 添加连接
  const addConnection = useCallback((conn: Omit<Connection, 'id'>) => {
    const newConn: Connection = { ...conn, id: `conn-${Date.now()}` } as Connection
    setConnections(prev => {
      const updated = [...prev, newConn]
      api.saveConnections(updated)
      return updated
    })
  }, [])

  // 删除连接
  const deleteConnection = useCallback((id: string) => {
    setConnections(prev => {
      const updated = prev.filter(c => c.id !== id)
      api.saveConnections(updated)
      return updated
    })
  }, [])

  // 更新连接
  const updateConnection = useCallback((conn: Connection) => {
    setConnections(prev => {
      const updated = prev.map(c => c.id === conn.id ? conn : c)
      api.saveConnections(updated)
      return updated
    })
  }, [])

  return {
    connections,
    setConnections,
    connectedIds,
    setConnectedIds,
    addConnection,
    deleteConnection,
    updateConnection
  }
}

// 数据库操作 Hook
export function useDatabaseOperations(showNotification: (type: 'success' | 'error' | 'info', msg: string) => void) {
  const [databasesMap, setDatabasesMap] = useState<Map<string, string[]>>(new Map())
  const [loadingDbSet, setLoadingDbSet] = useState<Set<string>>(new Set())
  const [loadingConnectionsSet, setLoadingConnectionsSet] = useState<Set<string>>(new Set())

  const fetchDatabases = useCallback(async (connectionId: string) => {
    // 标记开始加载
    setLoadingConnectionsSet(prev => new Set(prev).add(connectionId))
    try {
      const dbs = await api.getDatabases(connectionId)
      console.log('获取到数据库列表:', connectionId, dbs)
      setDatabasesMap(prev => new Map(prev).set(connectionId, dbs || []))
      if (!dbs || dbs.length === 0) {
        showNotification('info', '未发现数据库或无权限访问')
      }
    } catch (err) {
      console.error('获取数据库列表失败:', err)
      showNotification('error', '获取数据库列表失败: ' + (err as Error).message)
      setDatabasesMap(prev => new Map(prev).set(connectionId, []))
    } finally {
      // 标记加载完成
      setLoadingConnectionsSet(prev => {
        const next = new Set(prev)
        next.delete(connectionId)
        return next
      })
    }
  }, [showNotification])

  return {
    databasesMap,
    setDatabasesMap,
    loadingDbSet,
    setLoadingDbSet,
    loadingConnectionsSet,
    fetchDatabases
  }
}

// 表操作 Hook
export function useTableOperations(showNotification: (type: 'success' | 'error' | 'info', msg: string) => void) {
  const [tablesMap, setTablesMap] = useState<Map<string, TableInfo[]>>(new Map())
  const [columnsMap, setColumnsMap] = useState<Map<string, ColumnInfo[]>>(new Map())

  const fetchTables = useCallback(async (connectionId: string, database: string): Promise<TableInfo[]> => {
    try {
      const tables = await api.getTables(connectionId, database)
      // 使用 connectionId_database 作为 key，避免不同连接同名数据库冲突
      const key = `${connectionId}_${database}`
      setTablesMap(prev => new Map(prev).set(key, tables))
      return tables
    } catch (err) {
      showNotification('error', '获取表列表失败')
      return []
    }
  }, [showNotification])

  const fetchColumns = useCallback(async (connectionId: string, database: string, table: string) => {
    try {
      const cols = await api.getTableColumns(connectionId, database, table)
      setColumnsMap(prev => new Map(prev).set(table, cols))
    } catch (err) {
      // 忽略列获取失败
    }
  }, [])

  return {
    tablesMap,
    setTablesMap,
    columnsMap,
    setColumnsMap,
    fetchTables,
    fetchColumns
  }
}

// Tab 操作 Hook
export function useTabOperations() {
  const [tabs, setTabs] = useState<(QueryTab | TableTab)[]>([])
  const [activeTab, setActiveTab] = useState<string>('welcome')
  const [loadingTables, setLoadingTables] = useState<Set<string>>(new Set())

  return {
    tabs,
    setTabs,
    activeTab,
    setActiveTab,
    loadingTables,
    setLoadingTables
  }
}

// 查询操作 Hook
export function useQueryOperations(
  tabs: (QueryTab | TableTab)[],
  setTabs: React.Dispatch<React.SetStateAction<(QueryTab | TableTab)[]>>,
  showNotification: (type: 'success' | 'error' | 'info', msg: string) => void
) {
  const runQuery = useCallback(async (tabId: string, connectionId: string, sql: string) => {
    try {
      const result = await api.executeQuery(connectionId, sql)
      setTabs(prev => prev.map(t => {
        if (t.id === tabId && !('tableName' in t)) {
          return { ...t, results: result }
        }
        return t
      }))
    } catch (err) {
      showNotification('error', '查询失败：' + (err as Error).message)
    }
  }, [setTabs, showNotification])

  return { runQuery }
}

// 导入导出 Hook
export function useImportExport(
  connections: Connection[],
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>,
  showNotification: (type: 'success' | 'error' | 'info', msg: string) => void
) {
  const importConnections = useCallback(async () => {
    try {
      const result = await api.importConnections()
      if (result.cancelled) {
        return // 用户取消了选择
      }
      if (!result.success) {
        showNotification('error', result.error || '导入失败')
        return
      }
      if (result.connections && result.connections.length > 0) {
        setConnections(prev => {
          // 根据连接名称判断是否已存在，存在则覆盖
          const existingMap = new Map(prev.map(c => [c.name, c]))
          let updatedCount = 0
          let newCount = 0
          
          for (const importedConn of result.connections!) {
            const existing = existingMap.get(importedConn.name)
            if (existing) {
              // 保留原有 ID，覆盖其他信息
              existingMap.set(importedConn.name, {
                ...importedConn,
                id: existing.id
              })
              updatedCount++
            } else {
              // 新增连接
              existingMap.set(importedConn.name, importedConn)
              newCount++
            }
          }
          
          const updated = Array.from(existingMap.values())
          api.saveConnections(updated)
          
          // 显示详细的导入信息
          const messages: string[] = []
          if (newCount > 0) messages.push(`新增 ${newCount} 个`)
          if (updatedCount > 0) messages.push(`覆盖 ${updatedCount} 个`)
          showNotification('success', `已从 ${result.source || '文件'} 导入连接：${messages.join('，')}`)
          
          return updated
        })
      } else {
        showNotification('info', '文件中没有找到连接信息')
      }
    } catch (err) {
      showNotification('error', '导入失败：' + (err as Error).message)
    }
  }, [setConnections, showNotification])

  const exportConnections = useCallback(async (format: 'json' | 'ncx') => {
    try {
      await api.exportConnections(connections, format)
      showNotification('success', '导出成功')
    } catch (err) {
      showNotification('error', '导出失败：' + (err as Error).message)
    }
  }, [connections, showNotification])

  return {
    importConnections,
    exportConnections
  }
}
