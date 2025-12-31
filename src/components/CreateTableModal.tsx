import { useState, useEffect } from 'react'
import { X, Table2, Plus, Trash2, Key, ArrowUp, ArrowDown, Check } from 'lucide-react'
import api from '../lib/electron-api'

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
  connectionId: string | null
  database: string | null
  onClose: () => void
  onCreated: () => void
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

export default function CreateTableModal({ isOpen, connectionId, database, onClose, onCreated }: Props) {
  const [tableName, setTableName] = useState('')
  const [columns, setColumns] = useState<ColumnDef[]>([
    { ...DEFAULT_COLUMN, id: crypto.randomUUID(), name: 'id', primaryKey: true, autoIncrement: true, nullable: false }
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setTableName('')
      setColumns([{ ...DEFAULT_COLUMN, id: crypto.randomUUID(), name: 'id', primaryKey: true, autoIncrement: true, nullable: false }])
      setError('')
    }
  }, [isOpen])

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
      if (field === 'primaryKey' && value) {
        updated.nullable = false
      }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tableName.trim() || !columns.some(c => c.name.trim()) || !connectionId || !database) return

    setLoading(true)
    setError('')

    try {
      await api.createTable(connectionId, database, tableName.trim(), columns.filter(c => c.name.trim()))
      onCreated()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const needsLength = (type: string) => {
    return ['VARCHAR', 'CHAR', 'DECIMAL', 'FLOAT', 'DOUBLE', 'BINARY', 'VARBINARY'].includes(type)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-[850px] max-h-[85vh] flex flex-col rounded-2xl shadow-modal animate-scale-in overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-warning-50 flex items-center justify-center">
              <Table2 size={18} className="text-warning-500" />
            </div>
            <div>
              <h2 className="font-semibold text-text-primary">新建表</h2>
              <p className="text-xs text-text-muted">
                数据库: <span className="text-teal-600 font-mono">{database}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-light-hover rounded-lg transition-colors"
          >
            <X size={16} className="text-text-tertiary" />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {/* 表名 */}
          <div className="p-5 border-b border-border-default flex-shrink-0">
            <label className="block text-sm text-text-secondary mb-2 font-medium">
              表名称 <span className="text-danger-500">*</span>
            </label>
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="输入表名称"
              className="w-64 h-10 px-3 bg-light-surface border border-border-default rounded-lg
                         focus:border-primary-500 focus:shadow-focus text-sm transition-all"
              autoFocus
            />
          </div>

          {/* 字段列表 */}
          <div className="flex-1 overflow-auto p-5 scrollbar-thin">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-text-secondary font-medium">字段定义</span>
              <button
                type="button"
                onClick={addColumn}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white
                           rounded-lg transition-colors font-medium"
              >
                <Plus size={14} />
                添加字段
              </button>
            </div>

            {/* 字段表头 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-light-surface text-xs text-text-muted border-b border-border-default rounded-t-lg font-medium">
              <div className="w-8"></div>
              <div className="w-28">字段名</div>
              <div className="w-24">类型</div>
              <div className="w-14">长度</div>
              <div className="w-10 text-center">主键</div>
              <div className="w-10 text-center">自增</div>
              <div className="w-10 text-center">可空</div>
              <div className="w-20">默认值</div>
              <div className="flex-1">备注</div>
              <div className="w-10"></div>
            </div>

            {/* 字段行 */}
            <div className="border border-t-0 border-border-default rounded-b-lg overflow-hidden">
              {columns.map((col, index) => (
                <div key={col.id} className="flex items-center gap-2 px-3 py-2 hover:bg-light-hover group transition-colors border-b border-border-light last:border-b-0">
                  {/* 排序按钮 */}
                  <div className="w-8 flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveColumn(index, 'up')}
                      disabled={index === 0}
                      className="p-0.5 hover:bg-light-elevated disabled:opacity-30 rounded transition-colors"
                    >
                      <ArrowUp size={10} className="text-text-muted" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveColumn(index, 'down')}
                      disabled={index === columns.length - 1}
                      className="p-0.5 hover:bg-light-elevated disabled:opacity-30 rounded transition-colors"
                    >
                      <ArrowDown size={10} className="text-text-muted" />
                    </button>
                  </div>

                  {/* 字段名 */}
                  <input
                    type="text"
                    value={col.name}
                    onChange={(e) => updateColumn(col.id, 'name', e.target.value)}
                    placeholder="字段名"
                    className="w-28 h-8 px-2 bg-white border border-border-default rounded text-xs
                               focus:border-primary-500 focus:outline-none transition-colors font-mono"
                  />

                  {/* 类型 */}
                  <select
                    value={col.type}
                    onChange={(e) => updateColumn(col.id, 'type', e.target.value)}
                    className="w-24 h-8 px-2 bg-white border border-border-default rounded text-xs
                               focus:border-primary-500 focus:outline-none transition-colors cursor-pointer"
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
                    className="w-14 h-8 px-2 bg-white border border-border-default rounded text-xs text-center
                               focus:border-primary-500 focus:outline-none transition-colors
                               disabled:opacity-40 disabled:bg-light-surface disabled:cursor-not-allowed font-mono"
                  />

                  {/* 主键 */}
                  <div className="w-10 flex justify-center">
                    <button
                      type="button"
                      onClick={() => updateColumn(col.id, 'primaryKey', !col.primaryKey)}
                      className={`p-1.5 rounded transition-all ${
                        col.primaryKey 
                          ? 'bg-warning-500 text-white' 
                          : 'hover:bg-light-elevated text-text-muted'
                      }`}
                    >
                      <Key size={12} />
                    </button>
                  </div>

                  {/* 自增 */}
                  <div className="w-10 flex justify-center">
                    <label className="cursor-pointer">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all
                        ${col.autoIncrement 
                          ? 'bg-primary-500 border-primary-500' 
                          : 'border-border-strong hover:border-primary-300'}`}>
                        {col.autoIncrement && <Check size={10} className="text-white" />}
                      </div>
                      <input
                        type="checkbox"
                        checked={col.autoIncrement}
                        onChange={(e) => updateColumn(col.id, 'autoIncrement', e.target.checked)}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  {/* 可空 */}
                  <div className="w-10 flex justify-center">
                    <label className={`cursor-pointer ${col.primaryKey ? 'opacity-40 cursor-not-allowed' : ''}`}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all
                        ${col.nullable 
                          ? 'bg-success-500 border-success-500' 
                          : 'border-border-strong hover:border-success-300'}`}>
                        {col.nullable && <Check size={10} className="text-white" />}
                      </div>
                      <input
                        type="checkbox"
                        checked={col.nullable}
                        onChange={(e) => updateColumn(col.id, 'nullable', e.target.checked)}
                        disabled={col.primaryKey}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  {/* 默认值 */}
                  <input
                    type="text"
                    value={col.defaultValue}
                    onChange={(e) => updateColumn(col.id, 'defaultValue', e.target.value)}
                    placeholder="默认值"
                    className="w-20 h-8 px-2 bg-white border border-border-default rounded text-xs
                               focus:border-primary-500 focus:outline-none transition-colors"
                  />

                  {/* 备注 */}
                  <input
                    type="text"
                    value={col.comment}
                    onChange={(e) => updateColumn(col.id, 'comment', e.target.value)}
                    placeholder="备注"
                    className="flex-1 h-8 px-2 bg-white border border-border-default rounded text-xs
                               focus:border-primary-500 focus:outline-none transition-colors"
                  />

                  {/* 删除按钮 */}
                  <div className="w-10 flex justify-center">
                    <button
                      type="button"
                      onClick={() => removeColumn(col.id)}
                      disabled={columns.length === 1}
                      className="p-1.5 text-text-muted hover:text-danger-500 hover:bg-danger-50 
                                 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="mx-5 mb-3 px-3 py-2 bg-danger-50 text-danger-600 text-sm rounded-lg border border-danger-200">
              {error}
            </div>
          )}

          {/* 按钮 */}
          <div className="flex justify-end gap-2 p-5 border-t border-border-default flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm bg-light-elevated hover:bg-light-muted border border-border-default
                         rounded-lg transition-colors text-text-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!tableName.trim() || !columns.some(c => c.name.trim()) || loading}
              className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white
                         disabled:opacity-50 disabled:cursor-not-allowed 
                         rounded-lg transition-all font-medium shadow-btn hover:shadow-btn-hover"
            >
              {loading ? '创建中...' : '创建表'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
