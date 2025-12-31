import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Key, Pin, PinOff, Trash2, Search, X, ChevronLeft, ChevronRight, RefreshCw, FileX, Type, Copy, ClipboardPaste, Calendar, Clock, Check } from 'lucide-react'

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

// 判断是否是日期/时间类型
const isDateTimeType = (colType: string): boolean => {
  const type = (colType || '').toLowerCase()
  return type.includes('datetime') || type.includes('timestamp')
}

const isDateType = (colType: string): boolean => {
  const type = (colType || '').toLowerCase()
  return type.includes('date') && !isDateTimeType(type)
}

const isTimeType = (colType: string): boolean => {
  const type = (colType || '').toLowerCase()
  return type === 'time' || type.startsWith('time(')
}

// 获取编辑输入框类型
type InputType = 'text' | 'date' | 'datetime-local' | 'time'
const getInputType = (colType: string): InputType => {
  if (isDateTimeType(colType)) return 'datetime-local'
  if (isDateType(colType)) return 'date'
  if (isTimeType(colType)) return 'time'
  return 'text'
}

// 将数据库值转换为 input[type=datetime-local] 可用的格式（精确到秒）
const toDateTimeLocalFormat = (value: any): string => {
  if (value === null || value === undefined || value === '') return ''
  const strValue = String(value)
  // 匹配各种日期时间格式
  const dtMatch = strValue.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):?(\d{2})?/)
  if (dtMatch) {
    const [, year, month, day, hour, min, sec = '00'] = dtMatch
    return `${year}-${month}-${day}T${hour}:${min}:${sec}`
  }
  return strValue
}

// 将数据库值转换为 input[type=date] 可用的格式
const toDateFormat = (value: any): string => {
  if (value === null || value === undefined || value === '') return ''
  const strValue = String(value)
  // 匹配日期格式
  const dMatch = strValue.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dMatch) {
    const [, year, month, day] = dMatch
    return `${year}-${month}-${day}`
  }
  return strValue
}

// 将数据库值转换为 input[type=time] 可用的格式（精确到秒）
const toTimeFormat = (value: any): string => {
  if (value === null || value === undefined || value === '') return ''
  const strValue = String(value)
  // 匹配时间格式
  const tMatch = strValue.match(/(\d{2}):(\d{2}):?(\d{2})?/)
  if (tMatch) {
    const [, hour, min, sec = '00'] = tMatch
    return `${hour}:${min}:${sec}`
  }
  return strValue
}

// 将 input 值转换为数据库格式
const fromInputValue = (value: string, inputType: InputType): string | null => {
  if (value === '' || value.trim() === '') return null
  
  let result = value.trim()
  
  if (inputType === 'datetime-local') {
    // 支持多种格式：2025/12/31 23:59:30, 2025-12-31T23:59:30, 2025-12-31 23:59:30
    // 转换为数据库格式：2025-12-31 23:59:30
    result = result.replace('T', ' ').replace(/\//g, '-')
    
    // 如果没有秒，添加 :00
    const parts = result.split(' ')
    if (parts.length === 2) {
      const timeParts = parts[1].split(':')
      if (timeParts.length === 2) {
        result = `${parts[0]} ${parts[1]}:00`
      }
    }
    return result
  }
  
  if (inputType === 'date') {
    // 转换 / 为 -
    return result.replace(/\//g, '-')
  }
  
  return result
}

// 获取编辑值（根据字段类型转换格式）- 使用友好的显示格式
const getEditValue = (value: any, colType: string): string => {
  if (value === null || value === undefined) return ''
  const inputType = getInputType(colType)
  const strValue = String(value)
  
  if (inputType === 'datetime-local') {
    // 匹配日期时间格式并转换为 YYYY/MM/DD HH:MM:SS
    const match = strValue.match(/(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2}):?(\d{2})?/)
    if (match) {
      const [, y, m, d, h, mi, s = '00'] = match
      return `${y}/${m}/${d} ${h}:${mi}:${s}`
    }
  }
  if (inputType === 'date') {
    const match = strValue.match(/(\d{4})[-/](\d{2})[-/](\d{2})/)
    if (match) {
      const [, y, m, d] = match
      return `${y}/${m}/${d}`
    }
  }
  if (inputType === 'time') {
    const match = strValue.match(/(\d{2}):(\d{2}):?(\d{2})?/)
    if (match) {
      const [, h, mi, s = '00'] = match
      return `${h}:${mi}:${s}`
    }
  }
  return strValue
}

// 解析并标准化用户输入的日期时间格式（支持多种格式）
const parseAndNormalizeDateInput = (input: string, inputType: InputType): string => {
  if (!input || input.trim() === '') return ''
  
  const str = input.trim()
  
  // 支持的日期格式：
  // - 2025/12/29, 2025-12-29, 2025.12.29
  // - 12/29/2025, 29/12/2025 (根据数值大小判断)
  // - 20251229
  
  // 支持的时间格式：
  // - 14:30:00, 14:30, 143000, 1430
  
  // 支持的日期时间格式：
  // - 2025/12/29 14:30:00
  // - 2025-12-29T14:30:00
  // - 2025.12.29 14:30
  
  if (inputType === 'time') {
    // 匹配时间格式
    const timeMatch = str.match(/^(\d{1,2}):(\d{1,2}):?(\d{1,2})?$/)
    if (timeMatch) {
      const [, h, m, s = '0'] = timeMatch
      return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`
    }
    // 匹配紧凑时间格式 HHMMSS 或 HHMM
    const compactTime = str.match(/^(\d{2})(\d{2})(\d{2})?$/)
    if (compactTime) {
      const [, h, m, s = '00'] = compactTime
      return `${h}:${m}:${s}`
    }
    return str
  }
  
  // 提取日期和时间部分
  let datePart = ''
  let timePart = ''
  
  // 尝试分离日期和时间
  const dtMatch = str.match(/^(.+?)[T\s](\d{1,2}:\d{1,2}(?::\d{1,2})?)$/)
  if (dtMatch) {
    datePart = dtMatch[1]
    timePart = dtMatch[2]
  } else {
    datePart = str
    timePart = ''
  }
  
  // 解析日期部分
  let year = '', month = '', day = ''
  
  // 格式: YYYY/MM/DD, YYYY-MM-DD, YYYY.MM.DD
  const ymdMatch = datePart.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
  if (ymdMatch) {
    [, year, month, day] = ymdMatch
  }
  
  // 格式: YYYYMMDD
  const compactDate = datePart.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compactDate) {
    [, year, month, day] = compactDate
  }
  
  // 格式: MM/DD/YYYY 或 DD/MM/YYYY（根据数值判断）
  const mdyMatch = datePart.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (mdyMatch) {
    const [, a, b, y] = mdyMatch
    year = y
    // 如果第一个数字 > 12，则是 DD/MM/YYYY
    if (parseInt(a) > 12) {
      day = a
      month = b
    } else {
      month = a
      day = b
    }
  }
  
  if (!year || !month || !day) {
    return str // 无法解析，返回原值
  }
  
  // 标准化日期
  const normalizedDate = `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`
  
  if (inputType === 'date') {
    return normalizedDate
  }
  
  // datetime-local 需要处理时间部分
  if (timePart) {
    const tMatch = timePart.match(/^(\d{1,2}):(\d{1,2}):?(\d{1,2})?$/)
    if (tMatch) {
      const [, h, m, s = '0'] = tMatch
      return `${normalizedDate} ${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`
    }
  }
  
  // 如果没有时间部分，添加默认时间
  return inputType === 'datetime-local' ? `${normalizedDate} 00:00:00` : normalizedDate
}

// 格式化日期时间显示
const formatDateTime = (value: any, colType: string): string => {
  if (value === null || value === undefined) return ''
  
  const strValue = String(value)
  const type = (colType || '').toLowerCase()
  
  const isDateTime = type.includes('datetime') || type.includes('timestamp')
  const isDate = type.includes('date') && !isDateTime
  const isTime = type === 'time' || type.startsWith('time(')
  
  // 匹配日期时间格式：2025-12-29 14:49:28 或 2025-12-29T14:49:28 或 2025/12/29 14:49:28
  const dateTimeRegex = /^(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2}):?(\d{2})?/
  // 匹配纯日期格式
  const dateOnlyRegex = /^(\d{4})[-/](\d{2})[-/](\d{2})$/
  // 匹配纯时间格式
  const timeRegex = /^(\d{2}):(\d{2}):?(\d{2})?$/
  
  const dtMatch = strValue.match(dateTimeRegex)
  const dMatch = strValue.match(dateOnlyRegex)
  const tMatch = strValue.match(timeRegex)
  
  if (isTime && tMatch) {
    const [, hour, min, sec = '00'] = tMatch
    return `${hour}:${min}:${sec}`
  }
  
  if ((isDateTime || dtMatch) && dtMatch) {
    const [, year, month, day, hour, min, sec = '00'] = dtMatch
    return `${year}/${month}/${day} ${hour}:${min}:${sec}`
  }
  
  if ((isDate || dMatch) && dMatch) {
    const [, year, month, day] = dMatch
    return `${year}/${month}/${day}`
  }
  
  return strValue
}

// ============ 自定义日期时间选择器组件 ============
interface DateTimePickerProps {
  value: string
  type: 'date' | 'datetime-local' | 'time'
  onChange: (value: string) => void
  onClose: () => void
  position: { top: number; left: number }
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function DateTimePicker({ value, type, onChange, onClose, position }: DateTimePickerProps) {
  // 解析初始值
  const parseValue = () => {
    const now = new Date()
    if (!value) {
      return {
        year: now.getFullYear(),
        month: now.getMonth(),
        day: now.getDate(),
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds()
      }
    }
    
    if (type === 'time') {
      const match = value.match(/(\d{1,2}):(\d{1,2}):?(\d{1,2})?/)
      if (match) {
        return {
          year: now.getFullYear(),
          month: now.getMonth(),
          day: now.getDate(),
          hour: parseInt(match[1]),
          minute: parseInt(match[2]),
          second: parseInt(match[3] || '0')
        }
      }
    } else {
      // 支持多种格式：2025-12-29T14:49:28, 2025/12/29 14:49:28, 2025-12-29 14:49:28
      const match = value.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{1,2}):?(\d{1,2})?)?/)
      if (match) {
        return {
          year: parseInt(match[1]),
          month: parseInt(match[2]) - 1,
          day: parseInt(match[3]),
          hour: parseInt(match[4] || '0'),
          minute: parseInt(match[5] || '0'),
          second: parseInt(match[6] || '0')
        }
      }
    }
    
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      hour: 0,
      minute: 0,
      second: 0
    }
  }
  
  const initial = parseValue()
  const [viewYear, setViewYear] = useState(initial.year)
  const [viewMonth, setViewMonth] = useState(initial.month)
  const [selectedDate, setSelectedDate] = useState({ year: initial.year, month: initial.month, day: initial.day })
  const [selectedTime, setSelectedTime] = useState({ hour: initial.hour, minute: initial.minute, second: initial.second })
  const containerRef = useRef<HTMLDivElement>(null)
  
  // 构建输出值 - 统一使用 YYYY/MM/DD HH:mm:ss 格式
  const buildValue = (date: typeof selectedDate, time: typeof selectedTime) => {
    const pad = (n: number) => n.toString().padStart(2, '0')
    if (type === 'time') {
      return `${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`
    } else if (type === 'date') {
      return `${date.year}/${pad(date.month + 1)}/${pad(date.day)}`
    } else {
      return `${date.year}/${pad(date.month + 1)}/${pad(date.day)} ${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`
    }
  }
  
  // 获取某月的天数
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
  
  // 获取某月第一天是星期几（调整为周一开始）
  const getFirstDayOfMonth = (year: number, month: number) => {
    const day = new Date(year, month, 1).getDay()
    return day === 0 ? 6 : day - 1  // 周日变为6，其他减1
  }
  
  // 生成日历数据
  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth)
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
    const daysInPrevMonth = getDaysInMonth(viewYear, viewMonth - 1)
    
    const days: { day: number; isCurrentMonth: boolean; isToday: boolean }[] = []
    
    // 上月剩余天数
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, isCurrentMonth: false, isToday: false })
    }
    
    // 本月天数
    const today = new Date()
    for (let i = 1; i <= daysInMonth; i++) {
      const isToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && i === today.getDate()
      days.push({ day: i, isCurrentMonth: true, isToday })
    }
    
    // 下月开始天数
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, isCurrentMonth: false, isToday: false })
    }
    
    return days
  }
  
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1)
      setViewMonth(11)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }
  
  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1)
      setViewMonth(0)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }
  
  const handleSelectDay = (day: number, isCurrentMonth: boolean) => {
    if (isCurrentMonth) {
      const newDate = { year: viewYear, month: viewMonth, day }
      setSelectedDate(newDate)
      onChange(buildValue(newDate, selectedTime))
    }
  }
  
  const handleTimeChange = (field: 'hour' | 'minute' | 'second', value: number) => {
    const max = field === 'hour' ? 23 : 59
    const clampedValue = Math.max(0, Math.min(max, value))
    const newTime = { ...selectedTime, [field]: clampedValue }
    setSelectedTime(newTime)
    onChange(buildValue(selectedDate, newTime))
  }
  
  const handleToday = () => {
    const now = new Date()
    const newDate = { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() }
    const newTime = type !== 'date' 
      ? { hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds() }
      : selectedTime
    
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
    setSelectedDate(newDate)
    if (type !== 'date') {
      setSelectedTime(newTime)
    }
    onChange(buildValue(newDate, newTime))
  }
  
  const isSelected = (day: number, isCurrentMonth: boolean) => {
    return isCurrentMonth && selectedDate.year === viewYear && selectedDate.month === viewMonth && selectedDate.day === day
  }
  
  const calendarDays = generateCalendarDays()
  
  // 时间输入框组件
  const TimeInput = ({ value, onChange: onValueChange, max, label }: { value: number; onChange: (v: number) => void; max: number; label: string }) => {
    const [inputValue, setInputValue] = useState(value.toString().padStart(2, '0'))
    
    useEffect(() => {
      setInputValue(value.toString().padStart(2, '0'))
    }, [value])
    
    const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -1 : 1
      const newValue = value + delta
      if (newValue >= 0 && newValue <= max) {
        onValueChange(newValue)
      } else if (newValue < 0) {
        onValueChange(max)
      } else {
        onValueChange(0)
      }
    }
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.replace(/\D/g, '').slice(0, 2)
      setInputValue(val)
    }
    
    const handleBlur = () => {
      const num = parseInt(inputValue) || 0
      const clamped = Math.max(0, Math.min(max, num))
      setInputValue(clamped.toString().padStart(2, '0'))
      onValueChange(clamped)
    }
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onValueChange(value >= max ? 0 : value + 1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        onValueChange(value <= 0 ? max : value - 1)
      } else if (e.key === 'Enter') {
        handleBlur()
      }
    }
    
    return (
      <div className="flex flex-col items-center">
        <input
          type="text"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onWheel={handleWheel}
          className="w-10 h-7 text-center text-sm font-medium bg-primary-500 text-white rounded 
                     border-0 outline-none focus:ring-2 focus:ring-primary-300"
        />
        <span className="text-[10px] text-text-tertiary mt-0.5">{label}</span>
      </div>
    )
  }

  // 计算弹窗位置
  const getPopupPosition = () => {
    const popupWidth = type === 'time' ? 140 : (type === 'date' ? 220 : 220)
    const popupHeight = type === 'time' ? 80 : 320
    
    let top = position.top
    let left = position.left
    
    if (position.top + popupHeight > window.innerHeight - 20) {
      top = position.top - popupHeight - 40
    }
    if (left + popupWidth > window.innerWidth - 20) {
      left = window.innerWidth - popupWidth - 20
    }
    if (left < 20) left = 20
    if (top < 20) top = 20
    
    return { top, left }
  }
  
  const popupPos = getPopupPosition()
  const pad = (n: number) => n.toString().padStart(2, '0')

  return (
    <div 
      ref={containerRef}
      className="fixed bg-white rounded-lg shadow-xl border border-primary-200 overflow-hidden"
      style={{ 
        top: popupPos.top,
        left: popupPos.left,
        zIndex: 99999,
        animation: 'fadeIn 0.1s ease-out'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 时间选择部分（右侧或独立） */}
      {type !== 'date' && type === 'time' && (
        <div className="p-3 bg-primary-500">
          <div className="flex items-center gap-1 justify-center">
            <TimeInput value={selectedTime.hour} onChange={(v) => handleTimeChange('hour', v)} max={23} label="" />
            <span className="text-white font-bold text-lg">:</span>
            <TimeInput value={selectedTime.minute} onChange={(v) => handleTimeChange('minute', v)} max={59} label="" />
            <span className="text-white font-bold text-lg">:</span>
            <TimeInput value={selectedTime.second} onChange={(v) => handleTimeChange('second', v)} max={59} label="" />
          </div>
        </div>
      )}
      
      {/* 日历部分 */}
      {type !== 'time' && (
        <div className="p-2" style={{ width: 220 }}>
          {/* 月份导航 */}
          <div className="flex items-center justify-between mb-2">
            <button 
              onClick={handlePrevMonth}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-light-hover text-text-tertiary hover:text-text-primary"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-semibold text-text-primary">
              {viewYear}年{viewMonth + 1}月
            </span>
            <button 
              onClick={handleNextMonth}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-light-hover text-text-tertiary hover:text-text-primary"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          
          {/* 星期表头 */}
          <div className="grid grid-cols-7 gap-0 mb-1">
            {WEEKDAYS.map(d => (
              <div key={d} className="h-5 flex items-center justify-center text-[10px] font-medium text-primary-600">
                {d}
              </div>
            ))}
          </div>
          
          {/* 日期网格 */}
          <div className="grid grid-cols-7 gap-0">
            {calendarDays.map((d, i) => (
              <div
                key={i}
                onClick={() => handleSelectDay(d.day, d.isCurrentMonth)}
                className={`h-6 flex items-center justify-center text-xs cursor-pointer transition-all
                  ${!d.isCurrentMonth ? 'text-text-muted' : 'text-text-primary'}
                  ${d.isToday && !isSelected(d.day, d.isCurrentMonth) ? 'bg-gray-100 text-primary-600 font-medium' : ''}
                  ${isSelected(d.day, d.isCurrentMonth) 
                    ? 'bg-primary-500 text-white font-medium rounded' 
                    : d.isCurrentMonth ? 'hover:bg-light-hover' : ''}`}
              >
                {d.day}
              </div>
            ))}
          </div>
          
          {/* datetime 类型时显示时间选择器 */}
          {type === 'datetime-local' && (
            <div className="mt-2 pt-2 border-t border-border-light">
              <div className="flex items-center justify-center gap-1 bg-primary-500 rounded p-1.5">
                <TimeInput value={selectedTime.hour} onChange={(v) => handleTimeChange('hour', v)} max={23} label="" />
                <span className="text-white font-bold">:</span>
                <TimeInput value={selectedTime.minute} onChange={(v) => handleTimeChange('minute', v)} max={59} label="" />
                <span className="text-white font-bold">:</span>
                <TimeInput value={selectedTime.second} onChange={(v) => handleTimeChange('second', v)} max={59} label="" />
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 底部显示当前选择和快捷操作 */}
      <div className="px-2 py-1.5 bg-light-surface border-t border-border-light flex items-center justify-between text-[10px]">
        <span className="text-text-secondary font-mono">
          {type === 'time' 
            ? `${pad(selectedTime.hour)}:${pad(selectedTime.minute)}:${pad(selectedTime.second)}`
            : `今天: ${new Date().getFullYear()}/${pad(new Date().getMonth() + 1)}/${pad(new Date().getDate())}`
          }
        </span>
        <div className="flex gap-1">
          <button
            onClick={handleToday}
            className="px-1.5 py-0.5 text-primary-600 hover:bg-primary-50 rounded"
          >
            {type === 'time' ? '现在' : '今天'}
          </button>
        </div>
      </div>
    </div>
  )
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
  const [datePickerPos, setDatePickerPos] = useState<{ top: number; left: number } | null>(null)
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

  // 列宽状态
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [resizingCol, setResizingCol] = useState<string | null>(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  
  // 初始化列宽 - 只在列变化时计算
  useEffect(() => {
    const widths: Record<string, number> = {}
    const MIN_WIDTH = 70
    const MAX_WIDTH = 350
    const PADDING = 24
    
    for (const col of sortedColumns) {
      // 如果已经有用户设置的宽度，保持不变
      if (columnWidths[col.name]) {
        widths[col.name] = columnWidths[col.name]
        continue
      }
      
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
    
    setColumnWidths(widths)
  }, [sortedColumns.map(c => c.name).join(','), showColumnInfo])
  
  // 列宽拖动处理
  const handleResizeStart = useCallback((colName: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingCol(colName)
    resizeStartX.current = e.clientX
    resizeStartWidth.current = columnWidths[colName] || 100
  }, [columnWidths])
  
  useEffect(() => {
    if (!resizingCol) return
    
    // 添加全局拖动样式
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    
    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX.current
      const newWidth = Math.max(50, Math.min(600, resizeStartWidth.current + diff))
      setColumnWidths(prev => ({ ...prev, [resizingCol]: newWidth }))
    }
    
    const handleMouseUp = () => {
      setResizingCol(null)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizingCol])

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
    
    // 确保容器获得焦点
    setIsFocused(true)
    containerRef.current?.focus()
    
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

  // 用于跟踪是否刚结束拖动选择（防止拖动释放时清空选择，但单击应该清空）
  const justFinishedDraggingRef = useRef(false)
  
  // 框选结束
  useEffect(() => {
    const handleMouseUp = () => {
      // 只有真正进行了拖动选择（选择了多个单元格）才标记
      if (isSelecting && selectedCells.size > 1) {
        justFinishedDraggingRef.current = true
        setTimeout(() => {
          justFinishedDraggingRef.current = false
        }, 50)
      }
      setIsSelecting(false)
    }
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [isSelecting, selectedCells.size])

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
    
    // 尝试使用 navigator.clipboard，如果失败则使用回退方案
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // 回退方案：使用 textarea + execCommand
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        textarea.style.top = '-9999px'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
    } catch (err) {
      // 回退方案
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '-9999px'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      try {
        document.execCommand('copy')
      } catch (e) {
        console.error('复制失败:', e)
      }
      document.body.removeChild(textarea)
    }
    
    return { rows: sortedRows.length, cols: sortedColIndices.length }
  }, [selectedCells, data, sortedColumns, getColIndex])

  // 粘贴数据到选中的单元格（Navicat风格：自动扩展到多个单元格，超出则新增行）
  const pasteToSelectedCells = useCallback(async () => {
    if (!activeCell || !editable) return
    
    let text = ''
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText()
      }
    } catch (err) {
      console.error('读取剪贴板失败:', err)
      return
    }
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
        const col = sortedColumns.find(c => c.name === activeCell.col)
        const inputType = getInputType(col?.type || '')
        setEditingCell({ row: activeCell.row, col: activeCell.col })
        setEditValue(getEditValue(value, col?.type || ''))
        
        // 日期类型自动打开选择器
        if (inputType !== 'text') {
          // 需要获取单元格位置来定位选择器
          const cellEl = containerRef.current?.querySelector(`[data-row="${activeCell.row}"][data-col="${activeCell.col}"]`) as HTMLElement
          if (cellEl) {
            const rect = cellEl.getBoundingClientRect()
            setDatePickerPos({ top: rect.bottom + 4, left: rect.left })
          }
        }
        setTimeout(() => inputRef.current?.focus(), 0)
      }
      // Delete 或 Backspace 清空单元格
      if ((e.key === 'Delete' || e.key === 'Backspace') && isFocused && !editingCell && activeCell && editable) {
        e.preventDefault()
        onCellChange?.(activeCell.row, activeCell.col, null)
      }
      // 直接输入进入编辑模式（可打印字符）
      if (isFocused && !editingCell && activeCell && editable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const col = sortedColumns.find(c => c.name === activeCell.col)
        const inputType = getInputType(col?.type || '')
        
        e.preventDefault()
        setEditingCell({ row: activeCell.row, col: activeCell.col })
        setEditValue(e.key) // 直接用输入的字符作为初始值
        
        // 日期类型自动打开选择器
        if (inputType !== 'text') {
          const cellEl = containerRef.current?.querySelector(`[data-row="${activeCell.row}"][data-col="${activeCell.col}"]`) as HTMLElement
          if (cellEl) {
            const rect = cellEl.getBoundingClientRect()
            setDatePickerPos({ top: rect.bottom + 4, left: rect.left })
          }
        }
        
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
          // 如果刚结束拖动选择，不清空选择
          if (justFinishedDraggingRef.current) return
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
                className={`navi-header-cell ${isPinned ? 'pinned' : ''} ${resizingCol === col.name ? 'resizing' : ''}`}
                style={{ 
                  width: colWidth,
                  minWidth: colWidth,
                  position: isPinned ? 'sticky' : 'relative',
                  left: isPinned ? pinnedLeftOffsets[col.name] : 'auto',
                  boxShadow: isPinned && scrollLeft > 0 ? '2px 0 4px rgba(0,0,0,0.05)' : 'none',
                  height: headerHeight,
                }}
                title={isPinned ? `取消固定 ${col.name}` : `固定 ${col.name}`}
              >
                <div className="navi-header-content" onClick={() => togglePin(col.name)}>
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
                {/* 列宽拖动手柄 */}
                <div 
                  className="navi-resize-handle"
                  onMouseDown={(e) => handleResizeStart(col.name, e)}
                />
              </div>
            )
          })}
        </div>
        
        {/* 数据区域 */}
        <div 
          className="navi-body" 
          style={{ height: Math.max(totalHeight, containerHeight), minWidth: totalWidth }}
          onClick={(e) => {
            // 如果刚结束拖动选择，不清空选择
            if (justFinishedDraggingRef.current) return
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
                    
                    // 计算背景色 - 浅色主题
                    let bgColor = 'transparent'
                    if (isCurrentMatch) bgColor = '#fef08a'
                    else if (isSearchMatch) bgColor = 'rgba(250, 204, 21, 0.2)'
                    else if (isActiveCell) bgColor = 'rgba(59, 130, 246, 0.15)'
                    else if (isCellSelected) bgColor = 'rgba(59, 130, 246, 0.1)'
                    else if (isModified) bgColor = 'rgba(249, 115, 22, 0.1)'
                    else if (isPinned) bgColor = '#f8fafc'
                    
                    return (
                      <div
                        key={col.name}
                        data-row={actualRowIndex}
                        data-col={col.name}
                        className="navi-cell"
                        style={{
                          background: bgColor,
                          position: isPinned ? 'sticky' : 'relative',
                          left: isPinned ? pinnedLeftOffsets[col.name] : 'auto',
                          width: colWidth,
                          minWidth: colWidth,
                          maxWidth: colWidth,
                          height: rowHeight,
                          boxShadow: isPinned && scrollLeft > 0 ? '2px 0 4px rgba(0,0,0,0.05)' : 'none',
                          outline: isActiveCell && !isEditing ? '2px solid #3b82f6' : 'none',
                          outlineOffset: '-1px',
                          zIndex: isPinned ? 10 : 1,
                        }}
                        onMouseDown={(e) => handleCellMouseDown(actualRowIndex, col.name, e)}
                        onMouseEnter={() => handleCellMouseEnter(actualRowIndex, col.name)}
                        onDoubleClick={(e) => {
                          if (editable) {
                            const inputType = getInputType(col.type || '')
                            setEditingCell({ row: actualRowIndex, col: col.name })
                            setEditValue(getEditValue(value, col.type || ''))
                            
                            // 日期类型自动打开选择器
                            if (inputType !== 'text') {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setDatePickerPos({ top: rect.bottom + 4, left: rect.left })
                            } else {
                              setDatePickerPos(null)
                            }
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
                        {isEditing ? ((() => {
                          const inputType = getInputType(col.type || '')
                          const originalEditValue = getEditValue(value, col.type || '')
                          
                          const saveValue = () => {
                            const convertedValue = fromInputValue(editValue, inputType)
                            if (editValue !== originalEditValue) {
                              onCellChange?.(actualRowIndex, col.name, convertedValue)
                            }
                          }
                          
                          // 对于日期/时间类型，显示编辑状态（与非编辑状态样式一致）
                          if (inputType !== 'text') {
                            return (
                              <div className="navi-date-cell-edit">
                                <Calendar size={12} className="navi-date-icon" />
                                <input
                                  ref={inputRef}
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => {
                                    if (!datePickerPos) {
                                      const normalized = parseAndNormalizeDateInput(editValue, inputType)
                                      if (normalized !== editValue) {
                                        setEditValue(normalized)
                                      }
                                      saveValue()
                                      setEditingCell(null)
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const normalized = parseAndNormalizeDateInput(editValue, inputType)
                                      setEditValue(normalized)
                                      saveValue()
                                      setEditingCell(null)
                                      setDatePickerPos(null)
                                      const newRow = Math.min(actualRowIndex + 1, data.length - 1)
                                      setActiveCell({ row: newRow, col: col.name })
                                      setSelectedCells(new Set([`${newRow}-${col.name}`]))
                                    } else if (e.key === 'Escape') {
                                      setEditingCell(null)
                                      setDatePickerPos(null)
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  placeholder={inputType === 'date' ? 'YYYY/MM/DD' : inputType === 'time' ? 'HH:MM:SS' : 'YYYY/MM/DD HH:MM:SS'}
                                  className="navi-date-input-field"
                                  autoFocus
                                />
                              </div>
                            )
                          }
                          
                          return (
                            <input
                              ref={inputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => {
                                saveValue()
                                setEditingCell(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  // 保存当前单元格
                                  saveValue()
                                  setEditingCell(null)
                                  // 移动到下一行同列
                                  const newRow = Math.min(actualRowIndex + 1, data.length - 1)
                                  setActiveCell({ row: newRow, col: col.name })
                                  setSelectedCells(new Set([`${newRow}-${col.name}`]))
                                } else if (e.key === 'Tab') {
                                  e.preventDefault()
                                  // 保存当前单元格
                                  saveValue()
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
                                    const nextCol = sortedColumns[nextColIndex]
                                    const nextValue = data[nextRow]?.[nextColName]
                                    setEditingCell({ row: nextRow, col: nextColName })
                                    setEditValue(getEditValue(nextValue, nextCol?.type || ''))
                                    setActiveCell({ row: nextRow, col: nextColName })
                                    setSelectedCells(new Set([`${nextRow}-${nextColName}`]))
                                    setTimeout(() => inputRef.current?.focus(), 0)
                                  }
                                } else if (e.key === 'Escape') {
                                  setEditingCell(null)
                                } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                                  e.preventDefault()
                                  // 保存当前单元格
                                  saveValue()
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
                          )
                        })()) : value === null ? (
                          <span className="navi-null">NULL</span>
                        ) : value === '' ? (
                          <span className="navi-empty"></span>
                        ) : typeof value === 'object' ? (
                          <span className="navi-json">{displayValue}</span>
                        ) : (() => {
                          // 判断是否是日期类型字段
                          const inputType = getInputType(col.type || '')
                          if (inputType !== 'text') {
                            return (
                              <span className="navi-date-cell">
                                <Calendar size={12} className="navi-date-icon" />
                                <span className="navi-date-text">{displayValue}</span>
                              </span>
                            )
                          }
                          return <span className="navi-value">{displayValue}</span>
                        })()}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          
          {/* 空白填充行 - 当数据不够填满容器时 */}
          {(() => {
            const dataHeight = data.length * rowHeight
            const emptyRowsNeeded = Math.max(0, Math.ceil((containerHeight - dataHeight) / rowHeight))
            if (emptyRowsNeeded <= 0) return null
            
            return Array.from({ length: emptyRowsNeeded }, (_, i) => (
              <div 
                key={`empty-${i}`}
                className="navi-row empty-row"
                style={{ height: rowHeight }}
                onClick={() => {
                  // 点击空白行清空选择
                  if (!justFinishedDraggingRef.current) {
                    clearSelection()
                  }
                }}
              >
                {editable && (
                  <div 
                    className="navi-row-number empty"
                    style={{ width: rowNumberWidth, height: rowHeight }}
                  />
                )}
                {sortedColumns.map((col) => {
                  const isPinned = pinnedColumns.has(col.name)
                  const colWidth = columnWidths[col.name] || 100
                  return (
                    <div
                      key={col.name}
                      className="navi-cell empty"
                      style={{
                        position: isPinned ? 'sticky' : 'relative',
                        left: isPinned ? pinnedLeftOffsets[col.name] : 'auto',
                        width: colWidth,
                        minWidth: colWidth,
                        maxWidth: colWidth,
                        height: rowHeight,
                        zIndex: isPinned ? 10 : 1,
                      }}
                    />
                  )
                })}
              </div>
            ))
          })()}
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
      
      {/* 日期时间选择器 */}
      {editingCell && datePickerPos && (() => {
        const col = sortedColumns.find(c => c.name === editingCell.col)
        const inputType = getInputType(col?.type || '')
        if (inputType === 'text') return null
        
        return (
          <>
            <div 
              className="fixed inset-0 z-[9998]" 
              onClick={() => {
                setEditingCell(null)
                setDatePickerPos(null)
              }} 
            />
            <DateTimePicker
              value={editValue}
              type={inputType}
              position={datePickerPos}
              onChange={(val) => {
                // 直接更新编辑值和单元格
                setEditValue(val)
                const convertedValue = fromInputValue(val, inputType)
                if (onCellChange && editingCell) {
                  onCellChange(editingCell.row, editingCell.col, convertedValue)
                }
              }}
              onClose={() => {
                setEditingCell(null)
                setDatePickerPos(null)
              }}
            />
          </>
        )
      })()}
    </div>
  )
})

export default VirtualDataTable
