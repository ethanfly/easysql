import { Minus, Square, X, Database, Maximize2, Minimize2 } from 'lucide-react'
import { memo, useState } from 'react'
import api from '../lib/electron-api'

const TitleBar = memo(function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  
  const handleMaximize = async () => {
    await api.maximize()
    setIsMaximized(!isMaximized)
  }
  
  return (
    <div className="h-10 bg-white flex items-center justify-between drag select-none border-b border-border-default">
      {/* Logo 区域 */}
      <div className="flex items-center h-full px-4 no-drag gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center">
          <Database size={15} className="text-white" />
        </div>
        <span className="text-sm font-semibold text-text-primary">EasySQL</span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary-50 text-primary-600">
          v2.0
        </span>
      </div>

      {/* 窗口控制按钮 */}
      <div className="flex h-full no-drag">
        <button
          onClick={() => api.minimize()}
          className="w-11 h-full flex items-center justify-center hover:bg-light-hover transition-colors"
          title="最小化"
        >
          <Minus size={15} className="text-text-tertiary" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-full flex items-center justify-center hover:bg-light-hover transition-colors"
          title={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? (
            <Minimize2 size={13} className="text-text-tertiary" />
          ) : (
            <Maximize2 size={13} className="text-text-tertiary" />
          )}
        </button>
        <button
          onClick={() => api.close()}
          className="w-11 h-full flex items-center justify-center hover:bg-danger-500 hover:text-white transition-colors group"
          title="关闭"
        >
          <X size={15} className="text-text-tertiary group-hover:text-white" />
        </button>
      </div>
    </div>
  )
})

export default TitleBar
