import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface Props {
  isOpen: boolean
  title: string
  label: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  onClose: () => void
  onSubmit: (value: string) => void
  icon?: React.ReactNode
  // 用于复制表的额外选项
  showDataOption?: boolean
  onSubmitWithData?: (value: string, withData: boolean) => void
}

export default function InputDialog({
  isOpen,
  title,
  label,
  placeholder,
  defaultValue = '',
  confirmText = '确定',
  onClose,
  onSubmit,
  icon,
  showDataOption,
  onSubmitWithData,
}: Props) {
  const [value, setValue] = useState(defaultValue)
  const [withData, setWithData] = useState(false)

  useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue, isOpen])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) {
      if (showDataOption && onSubmitWithData) {
        onSubmitWithData(value.trim(), withData)
      } else {
        onSubmit(value.trim())
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-metro-card border border-metro-border w-[380px] shadow-metro-lg animate-fade-in">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-metro-border bg-metro-surface">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-medium">{title}</span>
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
              {label} <span className="text-accent-red">*</span>
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="w-full h-9 px-3 bg-metro-surface border border-metro-border text-sm
                         focus:border-accent-blue focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          {showDataOption && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="withData"
                checked={withData}
                onChange={(e) => setWithData(e.target.checked)}
                className="w-4 h-4 accent-accent-blue"
              />
              <label htmlFor="withData" className="text-sm text-text-secondary cursor-pointer">
                同时复制表数据
              </label>
            </div>
          )}

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
              disabled={!value.trim()}
              className="px-4 py-2 text-sm bg-accent-blue hover:bg-accent-blue-hover disabled:opacity-50 
                         disabled:cursor-not-allowed transition-colors"
            >
              {confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

