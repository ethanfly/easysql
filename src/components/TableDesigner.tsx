import React, { useState, useEffect, useMemo, useRef } from 'react'
import { 
  X, Table2, Plus, Trash2, Key, ArrowUp, ArrowDown, Save, 
  FileCode, Settings, Link2, List, Database, Play, Eye, GripVertical
} from 'lucide-react'

// ============ 类型定义 ============
interface ColumnDef {
  id: string
  name: string
  type: string
  length: string
  decimals: string
  nullable: boolean
  primaryKey: boolean
  autoIncrement: boolean
  unsigned: boolean
  zerofill: boolean
  defaultValue: string
  comment: string
  isVirtual: boolean
  virtualExpression: string
  // 原始数据用于对比
  _original?: ColumnDef
  _isNew?: boolean
  _isDeleted?: boolean
}

interface IndexDef {
  id: string
  name: string
  columns: string[]  // 字段名数组，支持多列索引
  type: 'NORMAL' | 'UNIQUE' | 'FULLTEXT' | 'SPATIAL'
  method: 'BTREE' | 'HASH'
  comment: string
  _original?: IndexDef
  _isNew?: boolean
  _isDeleted?: boolean
}

interface ForeignKeyDef {
  id: string
  name: string
  columns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
  onDelete: 'CASCADE' | 'SET NULL' | 'NO ACTION' | 'RESTRICT' | 'SET DEFAULT'
  onUpdate: 'CASCADE' | 'SET NULL' | 'NO ACTION' | 'RESTRICT' | 'SET DEFAULT'
  _original?: ForeignKeyDef
  _isNew?: boolean
  _isDeleted?: boolean
}

interface TableOptions {
  engine: string
  charset: string
  collation: string
  comment: string
  autoIncrement: string
  rowFormat: string
}

interface Props {
  isOpen: boolean
  mode: 'create' | 'edit'
  database: string
  tableName?: string  // 编辑模式时传入
  connectionId: string
  dbType: string
  onClose: () => void
  onSave: (sql: string) => Promise<{ success: boolean; message: string }>
  // 用于获取数据库信息
  onGetTableInfo?: () => Promise<{
    columns: ColumnDef[]
    indexes: IndexDef[]
    foreignKeys: ForeignKeyDef[]
    options: TableOptions
  }>
  onGetDatabases?: () => Promise<string[]>
  onGetTables?: (database: string) => Promise<string[]>
  onGetColumns?: (database: string, table: string) => Promise<string[]>
}

// ============ 常量 ============
const DATA_TYPES = {
  mysql: [
    { group: '整数', types: ['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT'] },
    { group: '小数', types: ['DECIMAL', 'FLOAT', 'DOUBLE'] },
    { group: '字符串', types: ['CHAR', 'VARCHAR', 'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT'] },
    { group: '日期时间', types: ['DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR'] },
    { group: '二进制', types: ['BINARY', 'VARBINARY', 'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB'] },
    { group: '其他', types: ['JSON', 'ENUM', 'SET', 'BOOLEAN', 'BIT'] },
  ],
  postgres: [
    { group: '整数', types: ['SMALLINT', 'INTEGER', 'BIGINT', 'SERIAL', 'BIGSERIAL'] },
    { group: '小数', types: ['DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE PRECISION'] },
    { group: '字符串', types: ['CHAR', 'VARCHAR', 'TEXT'] },
    { group: '日期时间', types: ['DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL'] },
    { group: '布尔', types: ['BOOLEAN'] },
    { group: '其他', types: ['JSON', 'JSONB', 'UUID', 'BYTEA', 'ARRAY'] },
  ],
  sqlserver: [
    { group: '整数', types: ['TINYINT', 'SMALLINT', 'INT', 'BIGINT'] },
    { group: '小数', types: ['DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'MONEY'] },
    { group: '字符串', types: ['CHAR', 'VARCHAR', 'NCHAR', 'NVARCHAR', 'TEXT', 'NTEXT'] },
    { group: '日期时间', types: ['DATE', 'TIME', 'DATETIME', 'DATETIME2', 'DATETIMEOFFSET'] },
    { group: '二进制', types: ['BINARY', 'VARBINARY', 'IMAGE'] },
    { group: '其他', types: ['BIT', 'UNIQUEIDENTIFIER', 'XML'] },
  ],
  sqlite: [
    { group: '基本', types: ['INTEGER', 'REAL', 'TEXT', 'BLOB', 'NUMERIC'] },
  ],
}

const ENGINES = ['InnoDB', 'MyISAM', 'Memory', 'CSV', 'Archive', 'Blackhole', 'Federated', 'NDB']

const CHARSETS = [
  'utf8mb4', 'utf8mb3', 'utf8', 'latin1', 'gbk', 'gb2312', 'big5', 'ascii', 'binary'
]

const COLLATIONS: Record<string, string[]> = {
  'utf8mb4': ['utf8mb4_general_ci', 'utf8mb4_unicode_ci', 'utf8mb4_bin', 'utf8mb4_0900_ai_ci'],
  'utf8': ['utf8_general_ci', 'utf8_unicode_ci', 'utf8_bin'],
  'latin1': ['latin1_swedish_ci', 'latin1_general_ci', 'latin1_bin'],
  'gbk': ['gbk_chinese_ci', 'gbk_bin'],
}

const ROW_FORMATS = ['DEFAULT', 'DYNAMIC', 'FIXED', 'COMPRESSED', 'REDUNDANT', 'COMPACT']

// ============ 可搜索下拉框组件 ============
interface SearchableSelectProps {
  value: string
  options: { label: string; value: string }[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

function SearchableSelect({ value, options, onChange, placeholder = '选择...', className = '', disabled = false }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(search.toLowerCase()) ||
    opt.value.toLowerCase().includes(search.toLowerCase())
  )

  const selectedOption = options.find(opt => opt.value === value)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div 
      ref={containerRef} 
      className={`relative flex items-center justify-between cursor-pointer ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) setIsOpen(!isOpen)
      }}
    >
      <span className={`text-xs ${selectedOption ? 'text-text-primary' : 'text-text-secondary'} ${disabled ? 'opacity-50' : ''}`}>
        {selectedOption?.label || placeholder}
      </span>
      <span className="text-text-secondary text-[10px]">▼</span>
      {isOpen && (
        <div className="absolute z-50 top-full left-0 w-full min-w-[120px] mt-0.5 bg-metro-surface border border-metro-border shadow-lg max-h-48 overflow-hidden flex flex-col">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="搜索..."
            className="w-full h-7 px-2 bg-metro-hover border-b border-metro-border text-xs focus:outline-none"
            autoFocus
          />
          <div className="overflow-auto flex-1">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-text-secondary">无匹配项</div>
            ) : (
              filteredOptions.map(opt => (
                <div
                  key={opt.value}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(opt.value)
                    setIsOpen(false)
                    setSearch('')
                  }}
                  className={`px-2 py-1.5 text-xs cursor-pointer hover:bg-metro-hover
                    ${opt.value === value ? 'bg-accent-blue/20 text-accent-blue' : ''}`}
                >
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// 多选可搜索下拉框
interface MultiSelectProps {
  values: string[]
  options: { label: string; value: string }[]
  onChange: (values: string[]) => void
  placeholder?: string
  className?: string
}

function MultiSelect({ values, options, onChange, placeholder = '选择...', className = '' }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleValue = (val: string) => {
    if (values.includes(val)) {
      onChange(values.filter(v => v !== val))
    } else {
      onChange([...values, val])
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="w-full min-h-[28px] px-2 py-1 bg-transparent border border-transparent hover:border-metro-border 
                   text-xs flex items-center gap-1 flex-wrap cursor-pointer"
      >
        {values.length === 0 ? (
          <span className="text-text-secondary">{placeholder}</span>
        ) : (
          values.map(v => (
            <span key={v} className="bg-accent-blue/20 text-accent-blue px-1.5 py-0.5 rounded text-[10px]">
              {v}
            </span>
          ))
        )}
      </div>
      {isOpen && (
        <div className="absolute z-50 top-full left-0 w-full min-w-[150px] mt-0.5 bg-metro-surface border border-metro-border shadow-lg max-h-48 overflow-hidden flex flex-col">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="搜索..."
            className="w-full h-7 px-2 bg-metro-hover border-b border-metro-border text-xs focus:outline-none"
            autoFocus
          />
          <div className="overflow-auto flex-1">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-text-secondary">无匹配项</div>
            ) : (
              filteredOptions.map(opt => (
                <div
                  key={opt.value}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleValue(opt.value)
                  }}
                  className={`px-2 py-1.5 text-xs cursor-pointer hover:bg-metro-hover flex items-center gap-2
                    ${values.includes(opt.value) ? 'bg-accent-blue/10' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={values.includes(opt.value)}
                    onChange={() => {}}
                    className="w-3 h-3 accent-accent-blue"
                  />
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const DEFAULT_COLUMN: Omit<ColumnDef, 'id'> = {
  name: '',
  type: 'INT',
  length: '',
  decimals: '',
  nullable: true,
  primaryKey: false,
  autoIncrement: false,
  unsigned: false,
  zerofill: false,
  defaultValue: '',
  comment: '',
  isVirtual: false,
  virtualExpression: '',
}

const DEFAULT_INDEX: Omit<IndexDef, 'id'> = {
  name: '',
  columns: [],
  type: 'NORMAL',
  method: 'BTREE',
  comment: '',
}

const DEFAULT_FK: Omit<ForeignKeyDef, 'id'> = {
  name: '',
  columns: [],
  refSchema: '',
  refTable: '',
  refColumns: [],
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION',
}

const DEFAULT_OPTIONS: TableOptions = {
  engine: 'InnoDB',
  charset: 'utf8mb4',
  collation: 'utf8mb4_general_ci',
  comment: '',
  autoIncrement: '',
  rowFormat: 'DEFAULT',
}

// ============ 主组件 ============
export default function TableDesigner({ 
  isOpen, mode, database, tableName: initialTableName, connectionId, dbType,
  onClose, onSave, onGetTableInfo, onGetDatabases, onGetTables, onGetColumns
}: Props) {
  const [activeTab, setActiveTab] = useState<'columns' | 'indexes' | 'foreignKeys' | 'options' | 'sql'>('columns')
  const [tableName, setTableName] = useState(initialTableName || '')
  const [columns, setColumns] = useState<ColumnDef[]>([])
  const [indexes, setIndexes] = useState<IndexDef[]>([])
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyDef[]>([])
  const [options, setOptions] = useState<TableOptions>(DEFAULT_OPTIONS)
  const [originalOptions, setOriginalOptions] = useState<TableOptions | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null)
  const [selectedIndexId, setSelectedIndexId] = useState<string | null>(null)
  const [selectedFkId, setSelectedFkId] = useState<string | null>(null)

  // 加载表信息（编辑模式）
  useEffect(() => {
    if (isOpen && mode === 'edit' && onGetTableInfo) {
      setTableName(initialTableName || '')
      setError('')
      loadTableInfo()
    } else if (isOpen && mode === 'create') {
      // 创建模式初始化
      setColumns([{
        ...DEFAULT_COLUMN,
        id: crypto.randomUUID(),
        name: 'id',
        primaryKey: true,
        autoIncrement: true,
        nullable: false,
        _isNew: true,
      }])
      setIndexes([])
      setForeignKeys([])
      setOptions(DEFAULT_OPTIONS)
      setOriginalOptions(null)
      setTableName('')
      setError('')
      setLoading(false)
    }
  }, [isOpen, mode, initialTableName])

  const loadTableInfo = async () => {
    if (!onGetTableInfo) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const info = await onGetTableInfo()
      if (info && info.columns) {
        setColumns(info.columns.map(c => ({ ...c, _original: { ...c } })))
      } else {
        setColumns([])
      }
      if (info && info.indexes) {
        setIndexes(info.indexes.map(i => ({ ...i, _original: { ...i } })))
      } else {
        setIndexes([])
      }
      if (info && info.foreignKeys) {
        setForeignKeys(info.foreignKeys.map(fk => ({ ...fk, _original: { ...fk } })))
      } else {
        setForeignKeys([])
      }
      if (info && info.options) {
        setOptions(info.options)
        setOriginalOptions(info.options)
      } else {
        setOriginalOptions(null)
      }
    } catch (e: any) {
      console.error('Load table info error:', e)
      setError(e.message || '加载表信息失败')
    } finally {
      setLoading(false)
    }
  }

  // 获取数据类型列表
  const dataTypes = useMemo(() => {
    const type = dbType.toLowerCase()
    if (type === 'mysql' || type === 'mariadb') return DATA_TYPES.mysql
    if (type === 'postgres' || type === 'postgresql') return DATA_TYPES.postgres
    if (type === 'sqlserver') return DATA_TYPES.sqlserver
    if (type === 'sqlite') return DATA_TYPES.sqlite
    return DATA_TYPES.mysql
  }, [dbType])

  // 检查类型是否需要长度
  const needsLength = (type: string) => {
    const t = type.toUpperCase()
    return ['VARCHAR', 'CHAR', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'BINARY', 'VARBINARY', 'BIT'].includes(t)
  }

  // 检查类型是否需要小数位
  const needsDecimals = (type: string) => {
    const t = type.toUpperCase()
    return ['DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE'].includes(t)
  }

  // 是否支持 UNSIGNED
  const supportsUnsigned = (type: string) => {
    const t = type.toUpperCase()
    return ['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'INTEGER', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL'].includes(t)
  }

  // ============ 字段操作 ============
  const addColumn = () => {
    const newCol: ColumnDef = { 
      ...DEFAULT_COLUMN, 
      id: crypto.randomUUID(),
      _isNew: true,
    }
    setColumns([...columns, newCol])
    setSelectedColumnId(newCol.id)
  }

  const removeColumn = (id: string) => {
    const col = columns.find(c => c.id === id)
    if (!col) return
    
    if (col._isNew) {
      // 新增的直接删除
      setColumns(columns.filter(c => c.id !== id))
    } else {
      // 已存在的标记为删除
      setColumns(columns.map(c => c.id === id ? { ...c, _isDeleted: true } : c))
    }
  }

  const updateColumn = (id: string, field: keyof ColumnDef, value: any) => {
    setColumns(columns.map(col => {
      if (col.id !== id) return col
      const updated = { ...col, [field]: value }
      
      // 主键不能为空
      if (field === 'primaryKey' && value) {
        updated.nullable = false
      }
      // 自增必须是主键且不为空
      if (field === 'autoIncrement' && value) {
        updated.primaryKey = true
        updated.nullable = false
      }
      return updated
    }))
  }

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const visibleColumns = columns.filter(c => !c._isDeleted)
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= visibleColumns.length) return
    
    const newColumns = [...visibleColumns]
    const temp = newColumns[index]
    newColumns[index] = newColumns[newIndex]
    newColumns[newIndex] = temp
    
    // 保留已删除的列
    setColumns([...newColumns, ...columns.filter(c => c._isDeleted)])
  }

  // ============ 索引操作 ============
  const addIndex = () => {
    const newIdx: IndexDef = { 
      ...DEFAULT_INDEX, 
      id: crypto.randomUUID(),
      _isNew: true,
    }
    setIndexes([...indexes, newIdx])
    setSelectedIndexId(newIdx.id)
  }

  const removeIndex = (id: string) => {
    const idx = indexes.find(i => i.id === id)
    if (!idx) return
    
    if (idx._isNew) {
      setIndexes(indexes.filter(i => i.id !== id))
    } else {
      setIndexes(indexes.map(i => i.id === id ? { ...i, _isDeleted: true } : i))
    }
  }

  // 生成索引名称
  const generateIndexName = (cols: string[], type: string) => {
    if (cols.length === 0 || !cols.some(c => c)) return ''
    const prefix = type === 'UNIQUE' ? 'uk' : type === 'FULLTEXT' ? 'ft' : 'idx'
    const tbl = tableName || 'table'
    return `${prefix}_${tbl}_${cols.filter(c => c).join('_')}`
  }

  const updateIndex = (id: string, field: keyof IndexDef, value: any) => {
    setIndexes(indexes.map(idx => {
      if (idx.id !== id) return idx
      const updated = { ...idx, [field]: value }
      
      // 当选择字段时，自动生成索引名（如果名称为空或以 idx_/uk_/ft_ 开头）
      if (field === 'columns' && Array.isArray(value) && value.length > 0 && value.some((c: string) => c)) {
        const autoName = generateIndexName(value, idx.type)
        if (!idx.name || idx.name.startsWith('idx_') || idx.name.startsWith('uk_') || idx.name.startsWith('ft_')) {
          updated.name = autoName
        }
      }
      // 当修改索引类型时，也更新名称前缀
      if (field === 'type' && idx.columns.length > 0 && idx.columns.some(c => c)) {
        const autoName = generateIndexName(idx.columns, value)
        if (!idx.name || idx.name.startsWith('idx_') || idx.name.startsWith('uk_') || idx.name.startsWith('ft_')) {
          updated.name = autoName
        }
      }
      return updated
    }))
  }

  // ============ 外键操作 ============
  // 生成外键名称
  const generateForeignKeyName = (cols: string[]) => {
    if (cols.length === 0 || !cols[0]) return ''
    const tbl = tableName || 'table'
    return `fk_${tbl}_${cols.filter(c => c).join('_')}`
  }

  const addForeignKey = () => {
    const newFk: ForeignKeyDef = { 
      ...DEFAULT_FK, 
      id: crypto.randomUUID(),
      _isNew: true,
    }
    setForeignKeys([...foreignKeys, newFk])
    setSelectedFkId(newFk.id)
  }

  const removeForeignKey = (id: string) => {
    const fk = foreignKeys.find(f => f.id === id)
    if (!fk) return
    
    if (fk._isNew) {
      setForeignKeys(foreignKeys.filter(f => f.id !== id))
    } else {
      setForeignKeys(foreignKeys.map(f => f.id === id ? { ...f, _isDeleted: true } : f))
    }
  }

  const updateForeignKey = (id: string, field: keyof ForeignKeyDef, value: any) => {
    setForeignKeys(foreignKeys.map(fk => {
      if (fk.id !== id) return fk
      const updated = { ...fk, [field]: value }
      
      // 当选择字段时，自动生成外键名（如果名称为空或以 fk_ 开头）
      if (field === 'columns' && Array.isArray(value) && value.length > 0 && value[0]) {
        const autoName = generateForeignKeyName(value)
        if (!fk.name || fk.name.startsWith('fk_')) {
          updated.name = autoName
        }
      }
      return updated
    }))
  }

  // 检查列是否被修改
  const isColumnModified = (col: ColumnDef): boolean => {
    if (!col._original) return false
    const orig = col._original
    return col.name !== orig.name ||
           col.type !== orig.type ||
           col.length !== orig.length ||
           col.decimals !== orig.decimals ||
           col.nullable !== orig.nullable ||
           col.defaultValue !== orig.defaultValue ||
           col.comment !== orig.comment ||
           col.unsigned !== orig.unsigned ||
           col.autoIncrement !== orig.autoIncrement
  }

  // ============ SQL 生成 ============
  const generateSQL = useMemo(() => {
    const dbTypeLower = dbType.toLowerCase()
    const quote = (name: string) => {
      if (dbTypeLower === 'mysql' || dbTypeLower === 'mariadb') return `\`${name}\``
      if (dbTypeLower === 'postgres' || dbTypeLower === 'postgresql') return `"${name}"`
      if (dbTypeLower === 'sqlserver') return `[${name}]`
      return `"${name}"`
    }

    const formatColumnType = (col: ColumnDef) => {
      let type = col.type.toUpperCase()
      if (col.length) {
        if (col.decimals && needsDecimals(col.type)) {
          type += `(${col.length},${col.decimals})`
        } else {
          type += `(${col.length})`
        }
      }
      return type
    }

    const formatColumnDef = (col: ColumnDef, forCreate = false) => {
      let def = `${quote(col.name)} ${formatColumnType(col)}`
      
      if (supportsUnsigned(col.type) && col.unsigned && (dbTypeLower === 'mysql' || dbTypeLower === 'mariadb')) {
        def += ' UNSIGNED'
      }
      if (col.zerofill && (dbTypeLower === 'mysql' || dbTypeLower === 'mariadb')) {
        def += ' ZEROFILL'
      }
      if (!col.nullable) {
        def += ' NOT NULL'
      }
      if (col.autoIncrement) {
        if (dbTypeLower === 'mysql' || dbTypeLower === 'mariadb') {
          def += ' AUTO_INCREMENT'
        } else if (dbTypeLower === 'sqlserver') {
          def += ' IDENTITY(1,1)'
        }
      }
      if (col.defaultValue !== undefined && col.defaultValue !== '') {
        const val = col.defaultValue
        if (val.toUpperCase() === 'NULL') {
          def += ' DEFAULT NULL'
        } else if (val.toUpperCase() === 'CURRENT_TIMESTAMP' || val.toUpperCase().startsWith('NOW')) {
          def += ` DEFAULT ${val}`
        } else {
          def += ` DEFAULT '${val}'`
        }
      }
      if (col.comment && (dbTypeLower === 'mysql' || dbTypeLower === 'mariadb')) {
        def += ` COMMENT '${col.comment.replace(/'/g, "''")}'`
      }
      return def
    }

    if (mode === 'create') {
      // CREATE TABLE
      const visibleColumns = columns.filter(c => !c._isDeleted && c.name)
      if (!tableName || visibleColumns.length === 0) return '-- 请填写表名和至少一个字段'

      const colDefs = visibleColumns.map(col => '  ' + formatColumnDef(col, true))
      
      // 主键
      const pkCols = visibleColumns.filter(c => c.primaryKey)
      if (pkCols.length > 0) {
        colDefs.push(`  PRIMARY KEY (${pkCols.map(c => quote(c.name)).join(', ')})`)
      }

      // 索引（需要有名称和至少一个有效字段）
      const visibleIndexes = indexes.filter(i => !i._isDeleted && i.name && i.columns.length > 0 && i.columns.some(c => c))
      for (const idx of visibleIndexes) {
        let indexDef = '  '
        if (idx.type === 'UNIQUE') indexDef += 'UNIQUE '
        else if (idx.type === 'FULLTEXT') indexDef += 'FULLTEXT '
        else if (idx.type === 'SPATIAL') indexDef += 'SPATIAL '
        indexDef += `INDEX ${quote(idx.name)} (${idx.columns.map(c => quote(c)).join(', ')})`
        if (idx.method && idx.method !== 'BTREE' && (dbTypeLower === 'mysql' || dbTypeLower === 'mariadb')) {
          indexDef += ` USING ${idx.method}`
        }
        colDefs.push(indexDef)
      }

      // 外键（需要有名称、至少一个有效字段、引用表和引用字段）
      const visibleFKs = foreignKeys.filter(fk => !fk._isDeleted && fk.name && fk.columns.length > 0 && fk.columns[0] && fk.refTable && fk.refColumns.length > 0 && fk.refColumns[0])
      for (const fk of visibleFKs) {
        let fkDef = `  CONSTRAINT ${quote(fk.name)} FOREIGN KEY (${fk.columns.map(c => quote(c)).join(', ')}) `
        fkDef += `REFERENCES ${fk.refSchema ? quote(fk.refSchema) + '.' : ''}${quote(fk.refTable)} (${fk.refColumns.map(c => quote(c)).join(', ')})`
        if (fk.onDelete !== 'NO ACTION') fkDef += ` ON DELETE ${fk.onDelete}`
        if (fk.onUpdate !== 'NO ACTION') fkDef += ` ON UPDATE ${fk.onUpdate}`
        colDefs.push(fkDef)
      }

      let sql = `CREATE TABLE ${quote(database)}.${quote(tableName)} (\n${colDefs.join(',\n')}\n)`

      // 表选项
      if (dbTypeLower === 'mysql' || dbTypeLower === 'mariadb') {
        const opts: string[] = []
        if (options.engine) opts.push(`ENGINE=${options.engine}`)
        if (options.charset) opts.push(`DEFAULT CHARSET=${options.charset}`)
        if (options.collation) opts.push(`COLLATE=${options.collation}`)
        if (options.rowFormat && options.rowFormat !== 'DEFAULT') opts.push(`ROW_FORMAT=${options.rowFormat}`)
        if (options.comment) opts.push(`COMMENT='${options.comment.replace(/'/g, "''")}'`)
        if (options.autoIncrement) opts.push(`AUTO_INCREMENT=${options.autoIncrement}`)
        if (opts.length > 0) {
          sql += '\n' + opts.join('\n')
        }
      }

      return sql + ';'
    } else {
      // ALTER TABLE
      const sqls: string[] = []
      const tbl = `${quote(database)}.${quote(tableName)}`

      // 删除的列
      const deletedCols = columns.filter(c => c._isDeleted && c._original)
      for (const col of deletedCols) {
        sqls.push(`ALTER TABLE ${tbl} DROP COLUMN ${quote(col.name)};`)
      }

      // 新增的列
      const newCols = columns.filter(c => c._isNew && !c._isDeleted && c.name)
      for (const col of newCols) {
        sqls.push(`ALTER TABLE ${tbl} ADD COLUMN ${formatColumnDef(col)};`)
      }

      // 修改的列
      const modifiedCols = columns.filter(c => !c._isNew && !c._isDeleted && c._original && isColumnModified(c))
      for (const col of modifiedCols) {
        if (dbTypeLower === 'mysql' || dbTypeLower === 'mariadb') {
          sqls.push(`ALTER TABLE ${tbl}\nCHANGE COLUMN ${quote(col._original!.name)} ${formatColumnDef(col)};`)
        } else if (dbTypeLower === 'postgres' || dbTypeLower === 'postgresql') {
          if (col._original!.name !== col.name) {
            sqls.push(`ALTER TABLE ${tbl} RENAME COLUMN ${quote(col._original!.name)} TO ${quote(col.name)};`)
          }
          sqls.push(`ALTER TABLE ${tbl} ALTER COLUMN ${quote(col.name)} TYPE ${formatColumnType(col)};`)
          if (col.nullable !== col._original!.nullable) {
            sqls.push(`ALTER TABLE ${tbl} ALTER COLUMN ${quote(col.name)} ${col.nullable ? 'DROP' : 'SET'} NOT NULL;`)
          }
        } else if (dbTypeLower === 'sqlserver') {
          if (col._original!.name !== col.name) {
            sqls.push(`EXEC sp_rename '${tableName}.${col._original!.name}', '${col.name}', 'COLUMN';`)
          }
          sqls.push(`ALTER TABLE ${tbl} ALTER COLUMN ${quote(col.name)} ${formatColumnType(col)}${col.nullable ? '' : ' NOT NULL'};`)
        }
      }

      // 删除的索引
      const deletedIndexes = indexes.filter(i => i._isDeleted && i._original)
      for (const idx of deletedIndexes) {
        if (dbTypeLower === 'mysql' || dbTypeLower === 'mariadb') {
          sqls.push(`ALTER TABLE ${tbl} DROP INDEX ${quote(idx.name)};`)
        } else if (dbTypeLower === 'postgres' || dbTypeLower === 'postgresql') {
          sqls.push(`DROP INDEX ${quote(idx.name)};`)
        } else if (dbTypeLower === 'sqlserver') {
          sqls.push(`DROP INDEX ${quote(idx.name)} ON ${tbl};`)
        }
      }

      // 新增的索引（需要有名称和至少一个有效字段）
      const newIndexes = indexes.filter(i => i._isNew && !i._isDeleted && i.name && i.columns.length > 0 && i.columns.some(c => c))
      for (const idx of newIndexes) {
        let sql = ''
        if (dbTypeLower === 'mysql' || dbTypeLower === 'mariadb') {
          sql = `ALTER TABLE ${tbl} ADD `
          if (idx.type === 'UNIQUE') sql += 'UNIQUE '
          else if (idx.type === 'FULLTEXT') sql += 'FULLTEXT '
          else if (idx.type === 'SPATIAL') sql += 'SPATIAL '
          sql += `INDEX ${quote(idx.name)} (${idx.columns.map(c => quote(c)).join(', ')})`
          if (idx.method && idx.method !== 'BTREE') sql += ` USING ${idx.method}`
        } else {
          sql = `CREATE ${idx.type === 'UNIQUE' ? 'UNIQUE ' : ''}INDEX ${quote(idx.name)} ON ${tbl} (${idx.columns.map(c => quote(c)).join(', ')})`
        }
        sqls.push(sql + ';')
      }

      // 删除的外键
      const deletedFKs = foreignKeys.filter(fk => fk._isDeleted && fk._original)
      for (const fk of deletedFKs) {
        if (dbTypeLower === 'mysql' || dbTypeLower === 'mariadb') {
          sqls.push(`ALTER TABLE ${tbl} DROP FOREIGN KEY ${quote(fk.name)};`)
        } else {
          sqls.push(`ALTER TABLE ${tbl} DROP CONSTRAINT ${quote(fk.name)};`)
        }
      }

      // 新增的外键（需要有名称、至少一个有效字段、引用表和引用字段）
      const newFKs = foreignKeys.filter(fk => fk._isNew && !fk._isDeleted && fk.name && fk.columns.length > 0 && fk.columns[0] && fk.refTable && fk.refColumns.length > 0 && fk.refColumns[0])
      for (const fk of newFKs) {
        let sql = `ALTER TABLE ${tbl} ADD CONSTRAINT ${quote(fk.name)} FOREIGN KEY (${fk.columns.map(c => quote(c)).join(', ')}) `
        sql += `REFERENCES ${fk.refSchema ? quote(fk.refSchema) + '.' : ''}${quote(fk.refTable)} (${fk.refColumns.map(c => quote(c)).join(', ')})`
        if (fk.onDelete !== 'NO ACTION') sql += ` ON DELETE ${fk.onDelete}`
        if (fk.onUpdate !== 'NO ACTION') sql += ` ON UPDATE ${fk.onUpdate}`
        sqls.push(sql + ';')
      }

      // 表选项修改（仅 MySQL，对比原选项）
      if (dbTypeLower === 'mysql' || dbTypeLower === 'mariadb') {
        const origOpts = originalOptions || { comment: '', engine: '', charset: '', collation: '', rowFormat: '', autoIncrement: '' }
        // 只有注释发生变化时才生成 SQL
        if (options.comment !== origOpts.comment) {
          if (options.comment) {
            sqls.push(`ALTER TABLE ${tbl} COMMENT='${options.comment.replace(/'/g, "''")}';`)
          } else {
            sqls.push(`ALTER TABLE ${tbl} COMMENT='';`)
          }
        }
        // 引擎变化
        if (options.engine && options.engine !== origOpts.engine) {
          sqls.push(`ALTER TABLE ${tbl} ENGINE=${options.engine};`)
        }
        // 字符集变化
        if (options.charset && options.charset !== origOpts.charset) {
          let alterCharset = `ALTER TABLE ${tbl} CONVERT TO CHARACTER SET ${options.charset}`
          if (options.collation) {
            alterCharset += ` COLLATE ${options.collation}`
          }
          sqls.push(alterCharset + ';')
        }
      }

      return sqls.length > 0 ? sqls.join('\n\n') : '-- 没有需要执行的修改'
    }
  }, [mode, tableName, columns, indexes, foreignKeys, options, originalOptions, database, dbType])

  // ============ 保存 ============
  const handleSave = async () => {
    if (!tableName) {
      setError('请输入表名')
      return
    }
    const visibleCols = columns.filter(c => !c._isDeleted && c.name)
    if (visibleCols.length === 0) {
      setError('请至少添加一个字段')
      return
    }

    setSaving(true)
    setError('')
    try {
      const result = await onSave(generateSQL)
      if (!result.success) {
        setError(result.message)
      } else {
        // 保存成功后，重置所有状态标记，使 SQL 预览显示"没有需要执行的修改"
        // 对于编辑模式，重新加载表信息
        if (mode === 'edit' && onGetTableInfo) {
          try {
            const tableInfo = await onGetTableInfo()
            if (tableInfo) {
              const loadedColumns = tableInfo.columns.map((col: any) => ({
                ...col,
                id: crypto.randomUUID(),
                _original: { ...col, id: crypto.randomUUID() },
              }))
              const loadedIndexes = tableInfo.indexes.map((idx: any) => ({
                ...idx,
                id: crypto.randomUUID(),
                _original: { ...idx, id: crypto.randomUUID() },
              }))
              const loadedForeignKeys = tableInfo.foreignKeys.map((fk: any) => ({
                ...fk,
                id: crypto.randomUUID(),
                _original: { ...fk, id: crypto.randomUUID() },
              }))
              setColumns(loadedColumns)
              setIndexes(loadedIndexes)
              setForeignKeys(loadedForeignKeys)
              if (tableInfo.options) {
                setOptions(tableInfo.options)
                setOriginalOptions(tableInfo.options)
              }
            }
          } catch (e) {
            // 忽略重新加载错误
          }
        } else {
          // 创建模式，保存成功后关闭
          onClose()
        }
      }
    } catch (e: any) {
      setError(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 如果 isOpen 为 false，组件不会被父组件渲染，这里做个保险
  if (!isOpen) {
    return null
  }

  const visibleColumns = columns.filter(c => !c._isDeleted)
  const visibleIndexes = indexes.filter(i => !i._isDeleted)
  const visibleForeignKeys = foreignKeys.filter(fk => !fk._isDeleted)

  const tabs = [
    { id: 'columns', label: '字段', icon: List, count: visibleColumns.length },
    { id: 'indexes', label: '索引', icon: Database, count: visibleIndexes.length },
    { id: 'foreignKeys', label: '外键', icon: Link2, count: visibleForeignKeys.length },
    { id: 'options', label: '选项', icon: Settings },
    { id: 'sql', label: 'SQL 预览', icon: FileCode },
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-metro-card border border-metro-border w-[1100px] h-[700px] flex flex-col shadow-metro-lg animate-fade-in">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-metro-border bg-metro-surface flex-shrink-0">
          <div className="flex items-center gap-3">
            <Table2 size={18} className="text-accent-teal" />
            <span className="font-medium">
              {mode === 'create' ? '新建表' : '编辑表'} - {database}
            </span>
            {mode === 'edit' && initialTableName && (
              <span className="text-text-secondary">({initialTableName})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-blue hover:bg-accent-blue-hover 
                         disabled:opacity-50 transition-colors"
            >
              <Save size={14} />
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-metro-hover rounded-sm transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 表名 & 注释 & 标签页 */}
        <div className="border-b border-metro-border bg-metro-surface/50 flex-shrink-0">
          {/* 表名和注释 */}
          <div className="flex items-center gap-6 px-4 py-2 border-b border-metro-border/50">
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary w-12">表名:</span>
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="输入表名"
                disabled={mode === 'edit'}
                className="w-48 h-8 px-3 bg-metro-surface border border-metro-border text-sm
                           focus:border-accent-blue focus:outline-none transition-colors
                           disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-sm text-text-secondary w-12">注释:</span>
              <input
                type="text"
                value={options.comment}
                onChange={(e) => setOptions({ ...options, comment: e.target.value })}
                placeholder="表注释"
                className="flex-1 max-w-md h-8 px-3 bg-metro-surface border border-metro-border text-sm
                           focus:border-accent-blue focus:outline-none transition-colors"
              />
            </div>
          </div>
          {/* 标签页 */}
          <div className="flex px-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors
                  ${activeTab === tab.id 
                    ? 'border-accent-blue text-accent-blue' 
                    : 'border-transparent text-text-secondary hover:text-text-primary'}`}
              >
                <tab.icon size={14} />
                {tab.label}
                {'count' in tab && tab.count !== undefined && (
                  <span className="ml-1 text-xs bg-metro-hover px-1.5 rounded">{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="px-4 py-2 bg-accent-red/20 border-b border-accent-red/30 text-sm text-accent-red flex-shrink-0">
            {error}
          </div>
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full text-text-secondary">
              加载中...
            </div>
          ) : (
            <>
              {/* 字段标签页 */}
              {activeTab === 'columns' && (
                <ColumnsTab
                  columns={visibleColumns}
                  dataTypes={dataTypes}
                  dbType={dbType}
                  selectedId={selectedColumnId}
                  onSelect={setSelectedColumnId}
                  onAdd={addColumn}
                  onRemove={removeColumn}
                  onUpdate={updateColumn}
                  onMove={moveColumn}
                  needsLength={needsLength}
                  needsDecimals={needsDecimals}
                  supportsUnsigned={supportsUnsigned}
                />
              )}

              {/* 索引标签页 */}
              {activeTab === 'indexes' && (
                <IndexesTab
                  indexes={visibleIndexes}
                  columns={visibleColumns}
                  selectedId={selectedIndexId}
                  onSelect={setSelectedIndexId}
                  onAdd={addIndex}
                  onRemove={removeIndex}
                  onUpdate={updateIndex}
                  dbType={dbType}
                />
              )}

              {/* 外键标签页 */}
              {activeTab === 'foreignKeys' && (
                <ForeignKeysTab
                  foreignKeys={visibleForeignKeys}
                  columns={visibleColumns}
                  selectedId={selectedFkId}
                  onSelect={setSelectedFkId}
                  onAdd={addForeignKey}
                  onRemove={removeForeignKey}
                  onUpdate={updateForeignKey}
                  onGetDatabases={onGetDatabases}
                  onGetTables={onGetTables}
                  onGetColumns={onGetColumns}
                  currentDatabase={database}
                />
              )}

              {/* 选项标签页 */}
              {activeTab === 'options' && (
                <OptionsTab
                  options={options}
                  dbType={dbType}
                  onChange={setOptions}
                />
              )}

              {/* SQL 预览标签页 */}
              {activeTab === 'sql' && (
                <SqlPreviewTab sql={generateSQL} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ 字段标签页 ============
interface ColumnsTabProps {
  columns: ColumnDef[]
  dataTypes: { group: string; types: string[] }[]
  dbType: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof ColumnDef, value: any) => void
  onMove: (index: number, direction: 'up' | 'down') => void
  needsLength: (type: string) => boolean
  needsDecimals: (type: string) => boolean
  supportsUnsigned: (type: string) => boolean
}

function ColumnsTab({ 
  columns, dataTypes, dbType, selectedId, onSelect, onAdd, onRemove, onUpdate, onMove,
  needsLength, needsDecimals, supportsUnsigned
}: ColumnsTabProps) {
  const isMysql = dbType.toLowerCase() === 'mysql' || dbType.toLowerCase() === 'mariadb'
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      // 执行移动
      if (dragOverIndex < dragIndex) {
        // 向上移动
        for (let i = dragIndex; i > dragOverIndex; i--) {
          onMove(i, 'up')
        }
      } else {
        // 向下移动
        for (let i = dragIndex; i < dragOverIndex; i++) {
          onMove(i, 'down')
        }
      }
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-metro-border bg-metro-surface/30 flex-shrink-0">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-green hover:bg-accent-green/80 transition-colors"
        >
          <Plus size={14} />
          添加字段
        </button>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-metro-surface sticky top-0">
            <tr className="border-b border-metro-border">
              <th className="w-8 px-1 py-2"></th>
              <th className="w-36 px-3 py-2 text-left font-medium">名称</th>
              <th className="w-28 px-3 py-2 text-left font-medium">类型</th>
              <th className="w-16 px-3 py-2 text-left font-medium">长度</th>
              <th className="w-16 px-3 py-2 text-left font-medium">小数点</th>
              <th className="w-16 px-3 py-2 text-center font-medium">不是 null</th>
              {isMysql && <th className="w-16 px-3 py-2 text-center font-medium">无符号</th>}
              <th className="w-14 px-3 py-2 text-center font-medium">键</th>
              <th className="w-36 px-3 py-2 text-left font-medium">默认值</th>
              <th className="px-3 py-2 text-left font-medium">注释</th>
              <th className="w-12 px-2 py-2 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col, index) => (
              <tr
                key={col.id}
                onDragOver={(e) => handleDragOver(e, index)}
                onClick={() => onSelect(col.id)}
                className={`border-b border-metro-border/50 cursor-pointer transition-colors
                  ${selectedId === col.id ? 'bg-accent-blue/20' : 'hover:bg-metro-hover/50'}
                  ${col._isNew ? 'bg-accent-green/10' : ''}
                  ${dragOverIndex === index ? 'border-t-2 border-t-accent-blue' : ''}`}
              >
                <td 
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnd={handleDragEnd}
                  className="px-1 py-1.5 text-center cursor-grab active:cursor-grabbing"
                >
                  <GripVertical size={14} className="text-text-secondary mx-auto" />
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={col.name}
                    onChange={(e) => onUpdate(col.id, 'name', e.target.value)}
                    onFocus={() => onSelect(col.id)}
                    placeholder="字段名"
                    className="w-full h-7 px-2 bg-transparent border border-transparent hover:border-metro-border 
                               focus:border-accent-blue focus:bg-metro-surface focus:outline-none text-xs
                               selection:bg-accent-blue selection:text-white"
                  />
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={col.type}
                    onChange={(e) => onUpdate(col.id, 'type', e.target.value)}
                    onFocus={() => onSelect(col.id)}
                    className="w-full h-7 px-2 bg-transparent border border-transparent hover:border-metro-border 
                               focus:border-accent-blue focus:bg-metro-surface focus:outline-none text-xs"
                  >
                    {dataTypes.map(group => (
                      <optgroup key={group.group} label={group.group}>
                        {group.types.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={col.length}
                    onChange={(e) => onUpdate(col.id, 'length', e.target.value)}
                    onFocus={() => onSelect(col.id)}
                    disabled={!needsLength(col.type)}
                    placeholder={needsLength(col.type) ? '' : '-'}
                    className="w-full h-7 px-2 bg-transparent border border-transparent hover:border-metro-border 
                               focus:border-accent-blue focus:bg-metro-surface focus:outline-none text-xs
                               disabled:opacity-40 disabled:cursor-not-allowed selection:bg-accent-blue selection:text-white"
                  />
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={col.decimals}
                    onChange={(e) => onUpdate(col.id, 'decimals', e.target.value)}
                    onFocus={() => onSelect(col.id)}
                    disabled={!needsDecimals(col.type)}
                    placeholder={needsDecimals(col.type) ? '' : '-'}
                    className="w-full h-7 px-2 bg-transparent border border-transparent hover:border-metro-border 
                               focus:border-accent-blue focus:bg-metro-surface focus:outline-none text-xs
                               disabled:opacity-40 disabled:cursor-not-allowed selection:bg-accent-blue selection:text-white"
                  />
                </td>
                <td className="px-3 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={!col.nullable}
                    onChange={(e) => {
                      onSelect(col.id)
                      onUpdate(col.id, 'nullable', !e.target.checked)
                    }}
                    disabled={col.primaryKey}
                    className="w-4 h-4 accent-accent-blue disabled:opacity-50"
                  />
                </td>
                {isMysql && (
                  <td className="px-3 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={col.unsigned}
                      onChange={(e) => {
                        onSelect(col.id)
                        onUpdate(col.id, 'unsigned', e.target.checked)
                      }}
                      disabled={!supportsUnsigned(col.type)}
                      className="w-4 h-4 accent-accent-blue disabled:opacity-50"
                    />
                  </td>
                )}
                <td className="px-3 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => {
                      onSelect(col.id)
                      onUpdate(col.id, 'primaryKey', !col.primaryKey)
                    }}
                    className={`p-1 rounded-sm transition-colors ${col.primaryKey ? 'bg-accent-orange text-white' : 'hover:bg-metro-hover'}`}
                    title={col.primaryKey ? '主键' : '设为主键'}
                  >
                    <Key size={12} />
                  </button>
                  {col.autoIncrement && (
                    <span className="ml-1 text-xs text-accent-blue" title="自增">A</span>
                  )}
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={col.defaultValue}
                    onChange={(e) => onUpdate(col.id, 'defaultValue', e.target.value)}
                    onFocus={() => onSelect(col.id)}
                    placeholder=""
                    className="w-full h-7 px-2 bg-transparent border border-transparent hover:border-metro-border 
                               focus:border-accent-blue focus:bg-metro-surface focus:outline-none text-xs
                               selection:bg-accent-blue selection:text-white"
                  />
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={col.comment}
                    onChange={(e) => onUpdate(col.id, 'comment', e.target.value)}
                    onFocus={() => onSelect(col.id)}
                    placeholder=""
                    className="w-full h-7 px-2 bg-transparent border border-transparent hover:border-metro-border 
                               focus:border-accent-blue focus:bg-metro-surface focus:outline-none text-xs
                               selection:bg-accent-blue selection:text-white"
                  />
                </td>
                <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => {
                      onSelect(col.id)
                      if (columns.length > 1) onRemove(col.id)
                    }}
                    disabled={columns.length <= 1}
                    className="p-1 text-text-secondary hover:text-accent-red hover:bg-accent-red/10 rounded transition-colors
                               disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-secondary disabled:hover:bg-transparent"
                    title="删除字段"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 底部详情区 */}
      {selectedId && (
        <ColumnDetailPanel
          column={columns.find(c => c.id === selectedId)!}
          onUpdate={(field, value) => onUpdate(selectedId, field, value)}
          isMysql={isMysql}
        />
      )}
    </div>
  )
}

// 字段详情面板
function ColumnDetailPanel({ column, onUpdate, isMysql }: { 
  column: ColumnDef
  onUpdate: (field: keyof ColumnDef, value: any) => void
  isMysql: boolean
}) {
  return (
    <div className="border-t border-metro-border bg-metro-surface/50 px-4 py-3 flex-shrink-0">
      <div className="grid grid-cols-4 gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={column.autoIncrement}
            onChange={(e) => onUpdate('autoIncrement', e.target.checked)}
            className="w-4 h-4 accent-accent-blue"
          />
          <span>自动递增</span>
        </label>
        {isMysql && (
          <>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={column.zerofill}
                onChange={(e) => onUpdate('zerofill', e.target.checked)}
                className="w-4 h-4 accent-accent-blue"
              />
              <span>填充零</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={column.isVirtual}
                onChange={(e) => onUpdate('isVirtual', e.target.checked)}
                className="w-4 h-4 accent-accent-blue"
              />
              <span>虚拟</span>
            </label>
          </>
        )}
      </div>
    </div>
  )
}

// ============ 索引标签页 ============
interface IndexesTabProps {
  indexes: IndexDef[]
  columns: ColumnDef[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof IndexDef, value: any) => void
  dbType: string
}

function IndexesTab({ indexes, columns, selectedId, onSelect, onAdd, onRemove, onUpdate, dbType }: IndexesTabProps) {
  const isMysql = dbType.toLowerCase() === 'mysql' || dbType.toLowerCase() === 'mariadb'
  const columnOptions = columns.filter(c => c.name).map(c => ({ label: c.name, value: c.name }))
  const indexTypeOptions = [
    { label: 'NORMAL', value: 'NORMAL' },
    { label: 'UNIQUE', value: 'UNIQUE' },
    ...(isMysql ? [{ label: 'FULLTEXT', value: 'FULLTEXT' }, { label: 'SPATIAL', value: 'SPATIAL' }] : [])
  ]
  const indexMethodOptions = [
    { label: 'BTREE', value: 'BTREE' },
    { label: 'HASH', value: 'HASH' }
  ]

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-metro-border bg-metro-surface/30 flex-shrink-0">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-green hover:bg-accent-green/80 transition-colors"
        >
          <Plus size={14} />
          添加索引
        </button>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-metro-surface sticky top-0">
            <tr className="border-b border-metro-border">
              <th className="w-40 px-3 py-2 text-left font-medium">名称</th>
              <th className="w-64 px-3 py-2 text-left font-medium">字段</th>
              <th className="w-28 px-3 py-2 text-left font-medium">索引类型</th>
              {isMysql && <th className="w-24 px-3 py-2 text-left font-medium">索引方法</th>}
              <th className="px-3 py-2 text-left font-medium">注释</th>
              <th className="w-16 px-3 py-2 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {indexes.map((idx) => (
              <tr
                key={idx.id}
                onClick={() => onSelect(idx.id)}
                className={`border-b border-metro-border/50 cursor-pointer transition-colors
                  ${selectedId === idx.id ? 'bg-accent-blue/20' : 'hover:bg-metro-hover/50'}
                  ${idx._isNew ? 'bg-accent-green/10' : ''}`}
              >
                <td className="px-3 py-1.5">
                  <input
                    type="text"
                    value={idx.name}
                    onChange={(e) => onUpdate(idx.id, 'name', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="索引名"
                    className="w-full h-7 px-2 bg-transparent border border-transparent hover:border-metro-border 
                               focus:border-accent-blue focus:bg-metro-surface focus:outline-none text-xs"
                  />
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <MultiSelect
                    values={idx.columns}
                    options={columnOptions}
                    onChange={(vals) => onUpdate(idx.id, 'columns', vals)}
                    placeholder="选择字段..."
                  />
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <SearchableSelect
                    value={idx.type}
                    options={indexTypeOptions}
                    onChange={(val) => onUpdate(idx.id, 'type', val)}
                    placeholder="索引类型"
                  />
                </td>
                {isMysql && (
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <SearchableSelect
                      value={idx.method}
                      options={indexMethodOptions}
                      onChange={(val) => onUpdate(idx.id, 'method', val)}
                      placeholder="索引方法"
                    />
                  </td>
                )}
                <td className="px-3 py-1.5">
                  <input
                    type="text"
                    value={idx.comment}
                    onChange={(e) => onUpdate(idx.id, 'comment', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder=""
                    className="w-full h-7 px-2 bg-transparent border border-transparent hover:border-metro-border 
                               focus:border-accent-blue focus:bg-metro-surface focus:outline-none text-xs"
                  />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(idx.id)
                    }}
                    className="p-1 text-text-secondary hover:text-accent-red hover:bg-accent-red/10 rounded transition-colors"
                    title="删除索引"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {indexes.length === 0 && (
          <div className="text-center py-8 text-text-secondary text-sm">
            暂无索引，点击"添加索引"创建
          </div>
        )}
      </div>
    </div>
  )
}

// ============ 外键标签页 ============
interface ForeignKeysTabProps {
  foreignKeys: ForeignKeyDef[]
  columns: ColumnDef[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof ForeignKeyDef, value: any) => void
  onGetDatabases?: () => Promise<string[]>
  onGetTables?: (database: string) => Promise<string[]>
  onGetColumns?: (database: string, table: string) => Promise<string[]>
  currentDatabase: string
}

function ForeignKeysTab({ 
  foreignKeys, columns, selectedId, onSelect, onAdd, onRemove, onUpdate,
  onGetDatabases, onGetTables, onGetColumns, currentDatabase
}: ForeignKeysTabProps) {
  const [databases, setDatabases] = useState<string[]>([currentDatabase])
  const [refTables, setRefTables] = useState<Record<string, string[]>>({})
  const [refColumns, setRefColumns] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (onGetDatabases) {
      onGetDatabases().then(dbs => setDatabases(dbs))
    }
  }, [])

  const loadRefTables = async (fkId: string, schema: string) => {
    if (!onGetTables) return
    const tables = await onGetTables(schema)
    setRefTables(prev => ({ ...prev, [fkId]: tables }))
  }

  const loadRefColumns = async (fkId: string, schema: string, table: string) => {
    if (!onGetColumns) return
    const cols = await onGetColumns(schema, table)
    setRefColumns(prev => ({ ...prev, [fkId]: cols }))
  }

  const FK_ACTIONS = ['CASCADE', 'SET NULL', 'NO ACTION', 'RESTRICT', 'SET DEFAULT']
  const columnOptions = columns.filter(c => c.name).map(c => ({ label: c.name, value: c.name }))
  const dbOptions = databases.map(db => ({ label: db, value: db }))
  const fkActionOptions = FK_ACTIONS.map(a => ({ label: a, value: a }))

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-metro-border bg-metro-surface/30 flex-shrink-0">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-green hover:bg-accent-green/80 transition-colors"
        >
          <Plus size={14} />
          添加外键
        </button>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-metro-surface sticky top-0">
            <tr className="border-b border-metro-border">
              <th className="w-36 px-3 py-2 text-left font-medium">名称</th>
              <th className="w-28 px-3 py-2 text-left font-medium">字段</th>
              <th className="w-28 px-3 py-2 text-left font-medium">被引用的模式</th>
              <th className="w-28 px-3 py-2 text-left font-medium">被引用的表</th>
              <th className="w-28 px-3 py-2 text-left font-medium">被引用的字段</th>
              <th className="w-24 px-3 py-2 text-left font-medium">删除时</th>
              <th className="w-24 px-3 py-2 text-left font-medium">更新时</th>
              <th className="w-16 px-3 py-2 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {foreignKeys.map((fk) => (
              <tr
                key={fk.id}
                onClick={() => onSelect(fk.id)}
                className={`border-b border-metro-border/50 cursor-pointer transition-colors
                  ${selectedId === fk.id ? 'bg-accent-blue/20' : 'hover:bg-metro-hover/50'}
                  ${fk._isNew ? 'bg-accent-green/10' : ''}`}
              >
                <td className="px-3 py-1.5">
                  <input
                    type="text"
                    value={fk.name}
                    onChange={(e) => onUpdate(fk.id, 'name', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="外键名"
                    className="w-full h-7 px-2 bg-transparent border border-transparent hover:border-metro-border 
                               focus:border-accent-blue focus:bg-metro-surface focus:outline-none text-xs"
                  />
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <SearchableSelect
                    value={fk.columns[0] || ''}
                    options={columnOptions}
                    onChange={(val) => onUpdate(fk.id, 'columns', [val])}
                    placeholder="选择字段"
                  />
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <SearchableSelect
                    value={fk.refSchema || currentDatabase}
                    options={dbOptions}
                    onChange={(val) => {
                      onUpdate(fk.id, 'refSchema', val)
                      loadRefTables(fk.id, val)
                    }}
                    placeholder="选择模式"
                  />
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <SearchableSelect
                    value={fk.refTable}
                    options={(refTables[fk.id] || []).map(t => ({ label: t, value: t }))}
                    onChange={(val) => {
                      onUpdate(fk.id, 'refTable', val)
                      loadRefColumns(fk.id, fk.refSchema || currentDatabase, val)
                    }}
                    placeholder="选择表"
                  />
                  {!refTables[fk.id] && (
                    <button
                      onClick={() => loadRefTables(fk.id, fk.refSchema || currentDatabase)}
                      className="text-[10px] text-accent-blue hover:underline mt-0.5"
                    >
                      加载表列表
                    </button>
                  )}
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <SearchableSelect
                    value={fk.refColumns[0] || ''}
                    options={(refColumns[fk.id] || []).map(c => ({ label: c, value: c }))}
                    onChange={(val) => onUpdate(fk.id, 'refColumns', [val])}
                    placeholder="选择字段"
                  />
                  {fk.refTable && !refColumns[fk.id] && (
                    <button
                      onClick={() => loadRefColumns(fk.id, fk.refSchema || currentDatabase, fk.refTable)}
                      className="text-[10px] text-accent-blue hover:underline mt-0.5"
                    >
                      加载字段
                    </button>
                  )}
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <SearchableSelect
                    value={fk.onDelete}
                    options={fkActionOptions}
                    onChange={(val) => onUpdate(fk.id, 'onDelete', val)}
                  />
                </td>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <SearchableSelect
                    value={fk.onUpdate}
                    options={fkActionOptions}
                    onChange={(val) => onUpdate(fk.id, 'onUpdate', val)}
                  />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(fk.id)
                    }}
                    className="p-1 text-text-secondary hover:text-accent-red hover:bg-accent-red/10 rounded transition-colors"
                    title="删除外键"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {foreignKeys.length === 0 && (
          <div className="text-center py-8 text-text-secondary text-sm">
            暂无外键，点击"添加外键"创建
          </div>
        )}
      </div>
    </div>
  )
}

// ============ 选项标签页 ============
interface OptionsTabProps {
  options: TableOptions
  dbType: string
  onChange: (options: TableOptions) => void
}

function OptionsTab({ options, dbType, onChange }: OptionsTabProps) {
  const isMysql = dbType.toLowerCase() === 'mysql' || dbType.toLowerCase() === 'mariadb'

  const engineOptions = ENGINES.map(e => ({ label: e, value: e }))
  const rowFormatOptions = ROW_FORMATS.map(r => ({ label: r, value: r }))
  const charsetOptions = CHARSETS.map(c => ({ label: c, value: c }))
  const collationOptions = (COLLATIONS[options.charset] || []).map(c => ({ label: c, value: c }))

  if (!isMysql) {
    return (
      <div className="p-4 text-text-secondary text-sm">
        表选项仅适用于 MySQL / MariaDB
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1.5">数据库引擎</label>
          <SearchableSelect
            value={options.engine}
            options={engineOptions}
            onChange={(val) => onChange({ ...options, engine: val })}
            placeholder="选择引擎"
            className="h-9 bg-metro-surface border border-metro-border px-2"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1.5">行格式</label>
          <SearchableSelect
            value={options.rowFormat}
            options={rowFormatOptions}
            onChange={(val) => onChange({ ...options, rowFormat: val })}
            placeholder="选择行格式"
            className="h-9 bg-metro-surface border border-metro-border px-2"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1.5">字符集</label>
          <SearchableSelect
            value={options.charset}
            options={charsetOptions}
            onChange={(val) => {
              const collations = COLLATIONS[val] || []
              onChange({ 
                ...options, 
                charset: val,
                collation: collations[0] || ''
              })
            }}
            placeholder="选择字符集"
            className="h-9 bg-metro-surface border border-metro-border px-2"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1.5">排序规则</label>
          <SearchableSelect
            value={options.collation}
            options={collationOptions}
            onChange={(val) => onChange({ ...options, collation: val })}
            placeholder="选择排序规则"
            className="h-9 bg-metro-surface border border-metro-border px-2"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1.5">自增值</label>
          <input
            type="text"
            value={options.autoIncrement}
            onChange={(e) => onChange({ ...options, autoIncrement: e.target.value })}
            placeholder="默认"
            className="w-full h-9 px-3 bg-metro-surface border border-metro-border text-sm
                       focus:border-accent-blue focus:outline-none transition-colors"
          />
        </div>
      </div>
    </div>
  )
}

// ============ SQL 预览标签页 ============
function SqlPreviewTab({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-metro-border bg-metro-surface/30 flex-shrink-0">
        <span className="text-sm text-text-secondary">将要执行的 SQL 语句</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-metro-surface hover:bg-metro-hover border border-metro-border transition-colors"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-sm font-mono text-accent-teal whitespace-pre-wrap break-all">
          {sql}
        </pre>
      </div>
    </div>
  )
}
