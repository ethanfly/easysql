import { useState, useEffect } from 'react'
import { X, Database, Settings } from 'lucide-react'
import api from '../lib/electron-api'

interface Props {
  isOpen: boolean
  connectionId: string | null
  onClose: () => void
  onCreated: () => void
}

// MySQL 字符集和排序规则
const CHARSETS = [
  { name: 'utf8mb4', collations: ['utf8mb4_general_ci', 'utf8mb4_unicode_ci', 'utf8mb4_bin', 'utf8mb4_0900_ai_ci'] },
  { name: 'utf8', collations: ['utf8_general_ci', 'utf8_unicode_ci', 'utf8_bin'] },
  { name: 'latin1', collations: ['latin1_swedish_ci', 'latin1_general_ci', 'latin1_bin'] },
  { name: 'gbk', collations: ['gbk_chinese_ci', 'gbk_bin'] },
  { name: 'gb2312', collations: ['gb2312_chinese_ci', 'gb2312_bin'] },
]

export default function CreateDatabaseModal({ isOpen, connectionId, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [charset, setCharset] = useState('utf8mb4')
  const [collation, setCollation] = useState('utf8mb4_general_ci')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setName('')
      setCharset('utf8mb4')
      setCollation('utf8mb4_general_ci')
      setError('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const currentCharset = CHARSETS.find(c => c.name === charset)
  const collations = currentCharset?.collations || []

  const handleCharsetChange = (newCharset: string) => {
    setCharset(newCharset)
    const charsetInfo = CHARSETS.find(c => c.name === newCharset)
    if (charsetInfo && charsetInfo.collations.length > 0) {
      setCollation(charsetInfo.collations[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !connectionId) return

    setLoading(true)
    setError('')

    try {
      await api.createDatabase(connectionId, name.trim(), charset, collation)
      onCreated()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-[420px] rounded-2xl shadow-modal animate-scale-in overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
              <Database size={18} className="text-teal-500" />
            </div>
            <div>
              <h2 className="font-semibold text-text-primary">新建数据库</h2>
              <p className="text-xs text-text-muted">创建新的数据库</p>
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm text-text-secondary mb-2 font-medium">
              <Database size={14} className="text-primary-500" />
              数据库名称 <span className="text-danger-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入数据库名称"
              className="w-full h-10 px-3 bg-light-surface border border-border-default rounded-lg
                         focus:border-primary-500 focus:shadow-focus text-sm transition-all"
              autoFocus
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-text-secondary mb-2 font-medium">
              <Settings size={14} className="text-info-500" />
              字符集
            </label>
            <select
              value={charset}
              onChange={(e) => handleCharsetChange(e.target.value)}
              className="w-full h-10 px-3 bg-light-surface border border-border-default rounded-lg
                         focus:border-primary-500 text-sm transition-all cursor-pointer"
            >
              {CHARSETS.map(cs => (
                <option key={cs.name} value={cs.name}>{cs.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-2 font-medium">排序规则</label>
            <select
              value={collation}
              onChange={(e) => setCollation(e.target.value)}
              className="w-full h-10 px-3 bg-light-surface border border-border-default rounded-lg
                         focus:border-primary-500 text-sm transition-all cursor-pointer"
            >
              {collations.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="px-3 py-2 bg-danger-50 text-danger-600 text-sm rounded-lg border border-danger-200">
              {error}
            </div>
          )}

          {/* 按钮 */}
          <div className="flex justify-end gap-2 pt-2">
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
              disabled={!name.trim() || loading}
              className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white
                         disabled:opacity-50 disabled:cursor-not-allowed 
                         rounded-lg transition-all font-medium shadow-btn hover:shadow-btn-hover"
            >
              {loading ? '创建中...' : '创建数据库'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
