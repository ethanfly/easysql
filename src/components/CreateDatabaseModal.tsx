import { useState } from 'react'
import { X, Database } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (name: string, charset: string, collation: string) => void
}

// MySQL 字符集和排序规则
const CHARSETS = [
  { name: 'utf8mb4', collations: ['utf8mb4_general_ci', 'utf8mb4_unicode_ci', 'utf8mb4_bin', 'utf8mb4_0900_ai_ci'] },
  { name: 'utf8', collations: ['utf8_general_ci', 'utf8_unicode_ci', 'utf8_bin'] },
  { name: 'latin1', collations: ['latin1_swedish_ci', 'latin1_general_ci', 'latin1_bin'] },
  { name: 'gbk', collations: ['gbk_chinese_ci', 'gbk_bin'] },
  { name: 'gb2312', collations: ['gb2312_chinese_ci', 'gb2312_bin'] },
]

export default function CreateDatabaseModal({ isOpen, onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [charset, setCharset] = useState('utf8mb4')
  const [collation, setCollation] = useState('utf8mb4_general_ci')

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit(name.trim(), charset, collation)
      setName('')
      setCharset('utf8mb4')
      setCollation('utf8mb4_general_ci')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-metro-card border border-metro-border w-[420px] shadow-metro-lg animate-fade-in">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-metro-border bg-metro-surface">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-accent-blue" />
            <span className="font-medium">新建数据库</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-metro-hover rounded-sm transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              数据库名称 <span className="text-accent-red">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入数据库名称"
              className="w-full h-9 px-3 bg-metro-surface border border-metro-border text-sm
                         focus:border-accent-blue focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">字符集</label>
            <select
              value={charset}
              onChange={(e) => handleCharsetChange(e.target.value)}
              className="w-full h-9 px-3 bg-metro-surface border border-metro-border text-sm
                         focus:border-accent-blue focus:outline-none transition-colors"
            >
              {CHARSETS.map(cs => (
                <option key={cs.name} value={cs.name}>{cs.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">排序规则</label>
            <select
              value={collation}
              onChange={(e) => setCollation(e.target.value)}
              className="w-full h-9 px-3 bg-metro-surface border border-metro-border text-sm
                         focus:border-accent-blue focus:outline-none transition-colors"
            >
              {collations.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>

          {/* 按钮 */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm bg-metro-surface hover:bg-metro-hover transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
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

