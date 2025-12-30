import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

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

