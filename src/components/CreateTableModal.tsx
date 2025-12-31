import { useState } from 'react'
import { X, Table2, Plus, Trash2, Key, ArrowUp, ArrowDown } from 'lucide-react'

interface ColumnDef {
  id: string
  name: string
  type: string
  length: string
  nullable: boolean
  primaryKey: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
}

interface Props {
  isOpen: boolean
  database: string
  onClose: () => void
  onSubmit: (tableName: string, columns: ColumnDef[]) => void
}

// 常用数据类型
const DATA_TYPES = [
  { group: '整数', types: ['INT', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'BIGINT'] },
  { group: '小数', types: ['DECIMAL', 'FLOAT', 'DOUBLE'] },
  { group: '字符串', types: ['VARCHAR', 'CHAR', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT'] },
  { group: '日期时间', types: ['DATETIME', 'DATE', 'TIME', 'TIMESTAMP', 'YEAR'] },
  { group: '二进制', types: ['BLOB', 'MEDIUMBLOB', 'LONGBLOB', 'BINARY', 'VARBINARY'] },
  { group: '其他', types: ['JSON', 'ENUM', 'SET', 'BOOLEAN'] },
]

const DEFAULT_COLUMN: Omit<ColumnDef, 'id'> = {
  name: '',
  type: 'INT',
  length: '',
  nullable: true,
  primaryKey: false,
  autoIncrement: false,
  defaultValue: '',
  comment: '',
}

export default function CreateTableModal({ isOpen, database, onClose, onSubmit }: Props) {
  const [tableName, setTableName] = useState('')
  const [columns, setColumns] = useState<ColumnDef[]>([
    { ...DEFAULT_COLUMN, id: crypto.randomUUID(), name: 'id', primaryKey: true, autoIncrement: true, nullable: false }
  ])

  if (!isOpen) return null

  const addColumn = () => {
    setColumns([...columns, { ...DEFAULT_COLUMN, id: crypto.randomUUID() }])
  }

  const removeColumn = (id: string) => {
    if (columns.length > 1) {
      setColumns(columns.filter(c => c.id !== id))
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
      // 自增必须是主键
      if (field === 'autoIncrement' && value) {
        updated.primaryKey = true
        updated.nullable = false
      }
      return updated
    }))
  }

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= columns.length) return
    const newColumns = [...columns]
    const temp = newColumns[index]
    newColumns[index] = newColumns[newIndex]
    newColumns[newIndex] = temp
    setColumns(newColumns)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (tableName.trim() && columns.some(c => c.name.trim())) {
      onSubmit(tableName.trim(), columns.filter(c => c.name.trim()))
      setTableName('')
      setColumns([{ ...DEFAULT_COLUMN, id: crypto.randomUUID(), name: 'id', primaryKey: true, autoIncrement: true, nullable: false }])
    }
  }

  // 检查是否需要长度
  const needsLength = (type: string) => {
    return ['VARCHAR', 'CHAR', 'DECIMAL', 'FLOAT', 'DOUBLE', 'BINARY', 'VARBINARY'].includes(type)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-metro-card border border-metro-border w-[800px] max-h-[85vh] flex flex-col shadow-metro-lg animate-fade-in">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-metro-border bg-metro-surface flex-shrink-0">
          <div className="flex items-center gap-2">
            <Table2 size={18} className="text-accent-orange" />
            <span className="font-medium">新建表 - {database}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-metro-hover rounded-sm transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {/* 表名 */}
          <div className="p-4 border-b border-metro-border flex-shrink-0">
            <label className="block text-sm text-text-secondary mb-1.5">
              表名称 <span className="text-accent-red">*</span>
            </label>
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="输入表名称"
              className="w-64 h-9 px-3 bg-metro-surface border border-metro-border text-sm
                         focus:border-accent-blue focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          {/* 字段列表 */}
          <div className="flex-1 overflow-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-text-secondary">字段定义</span>
              <button
                type="button"
                onClick={addColumn}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-blue hover:bg-accent-blue-hover transition-colors"
              >
                <Plus size={14} />
                添加字段
              </button>
            </div>

            {/* 字段表头 */}
            <div className="flex items-center gap-2 px-2 py-2 bg-metro-surface text-xs text-text-secondary border-b border-metro-border">
              <div className="w-8"></div>
              <div className="w-32">字段名</div>
              <div className="w-28">类型</div>
              <div className="w-16">长度</div>
              <div className="w-12 text-center">主键</div>
              <div className="w-12 text-center">自增</div>
              <div className="w-12 text-center">可空</div>
              <div className="w-24">默认值</div>
              <div className="flex-1">备注</div>
              <div className="w-16"></div>
            </div>

            {/* 字段行 */}
            <div className="space-y-0.5">
              {columns.map((col, index) => (
                <div key={col.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-metro-hover/50 group">
                  {/* 排序按钮 */}
                  <div className="w-8 flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveColumn(index, 'up')}
                      disabled={index === 0}
                      className="p-0.5 hover:bg-metro-hover disabled:opacity-30 rounded-sm"
                    >
                      <ArrowUp size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveColumn(index, 'down')}
                      disabled={index === columns.length - 1}
                      className="p-0.5 hover:bg-metro-hover disabled:opacity-30 rounded-sm"
                    >
                      <ArrowDown size={10} />
                    </button>
                  </div>

                  {/* 字段名 */}
                  <input
                    type="text"
                    value={col.name}
                    onChange={(e) => updateColumn(col.id, 'name', e.target.value)}
                    placeholder="字段名"
                    className="w-32 h-7 px-2 bg-metro-surface border border-metro-border text-xs
                               focus:border-accent-blue focus:outline-none transition-colors"
                  />

                  {/* 类型 */}
                  <select
                    value={col.type}
                    onChange={(e) => updateColumn(col.id, 'type', e.target.value)}
                    className="w-28 h-7 px-2 bg-metro-surface border border-metro-border text-xs
                               focus:border-accent-blue focus:outline-none transition-colors"
                  >
                    {DATA_TYPES.map(group => (
                      <optgroup key={group.group} label={group.group}>
                        {group.types.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>

                  {/* 长度 */}
                  <input
                    type="text"
                    value={col.length}
                    onChange={(e) => updateColumn(col.id, 'length', e.target.value)}
                    placeholder={needsLength(col.type) ? '长度' : '-'}
                    disabled={!needsLength(col.type)}
                    className="w-16 h-7 px-2 bg-metro-surface border border-metro-border text-xs
                               focus:border-accent-blue focus:outline-none transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  />

                  {/* 主键 */}
                  <div className="w-12 flex justify-center">
                    <button
                      type="button"
                      onClick={() => updateColumn(col.id, 'primaryKey', !col.primaryKey)}
                      className={`p-1 rounded-sm transition-colors ${col.primaryKey ? 'bg-accent-orange text-white' : 'hover:bg-metro-hover'}`}
                    >
                      <Key size={12} />
                    </button>
                  </div>

                  {/* 自增 */}
                  <div className="w-12 flex justify-center">
                    <input
                      type="checkbox"
                      checked={col.autoIncrement}
                      onChange={(e) => updateColumn(col.id, 'autoIncrement', e.target.checked)}
                      className="w-4 h-4 accent-accent-blue"
                    />
                  </div>

                  {/* 可空 */}
                  <div className="w-12 flex justify-center">
                    <input
                      type="checkbox"
                      checked={col.nullable}
                      onChange={(e) => updateColumn(col.id, 'nullable', e.target.checked)}
                      disabled={col.primaryKey}
                      className="w-4 h-4 accent-accent-blue disabled:opacity-50"
                    />
                  </div>

                  {/* 默认值 */}
                  <input
                    type="text"
                    value={col.defaultValue}
                    onChange={(e) => updateColumn(col.id, 'defaultValue', e.target.value)}
                    placeholder="默认值"
                    className="w-24 h-7 px-2 bg-metro-surface border border-metro-border text-xs
                               focus:border-accent-blue focus:outline-none transition-colors"
                  />

                  {/* 备注 */}
                  <input
                    type="text"
                    value={col.comment}
                    onChange={(e) => updateColumn(col.id, 'comment', e.target.value)}
                    placeholder="备注"
                    className="flex-1 h-7 px-2 bg-metro-surface border border-metro-border text-xs
                               focus:border-accent-blue focus:outline-none transition-colors"
                  />

                  {/* 删除按钮 */}
                  <div className="w-16 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeColumn(col.id)}
                      disabled={columns.length === 1}
                      className="p-1.5 text-text-disabled hover:text-accent-red hover:bg-metro-hover 
                                 rounded-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 按钮 */}
          <div className="flex justify-end gap-2 p-4 border-t border-metro-border flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm bg-metro-surface hover:bg-metro-hover transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!tableName.trim() || !columns.some(c => c.name.trim())}
              className="px-4 py-2 text-sm bg-accent-blue hover:bg-accent-blue-hover disabled:opacity-50 
                         disabled:cursor-not-allowed transition-colors"
            >
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

