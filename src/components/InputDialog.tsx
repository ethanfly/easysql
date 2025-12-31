import { useState, useEffect } from 'react'
import { X, Check } from 'lucide-react'

interface Props {
  isOpen: boolean
  title: string
  label: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  onClose: () => void
  onConfirm: (value: string) => void
  icon?: React.ReactNode
  showDataOption?: boolean
  onConfirmWithData?: (value: string, withData: boolean) => void
}

export default function InputDialog({
  isOpen,
  title,
  label,
  placeholder,
  defaultValue = '',
  confirmText = '确定',
  onClose,
  onConfirm,
  icon,
  showDataOption,
  onConfirmWithData,
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
      if (showDataOption && onConfirmWithData) {
        onConfirmWithData(value.trim(), withData)
      } else {
        onConfirm(value.trim())
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-[380px] rounded-2xl shadow-modal animate-scale-in overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-8 h-8 rounded-lg bg-light-elevated flex items-center justify-center">
                {icon}
              </div>
            )}
            <span className="font-semibold text-text-primary">{title}</span>
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
            <label className="block text-sm text-text-secondary mb-2 font-medium">
              {label} <span className="text-danger-500">*</span>
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="w-full h-10 px-3 bg-light-surface border border-border-default rounded-lg
                         focus:border-primary-500 focus:shadow-focus text-sm transition-all"
              autoFocus
            />
          </div>

          {showDataOption && (
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                ${withData 
                  ? 'bg-primary-500 border-primary-500' 
                  : 'border-border-strong group-hover:border-primary-300'}`}>
                {withData && <Check size={12} className="text-white" />}
              </div>
              <input
                type="checkbox"
                checked={withData}
                onChange={(e) => setWithData(e.target.checked)}
                className="sr-only"
              />
              <span className="text-sm text-text-secondary">同时复制表数据</span>
            </label>
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
              disabled={!value.trim()}
              className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white
                         disabled:opacity-50 disabled:cursor-not-allowed 
                         rounded-lg transition-all font-medium shadow-btn hover:shadow-btn-hover"
            >
              {confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
