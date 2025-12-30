import { Minus, Square, X, Database, Copy } from 'lucide-react'
import { memo, useState } from 'react'
import api from '../lib/tauri-api'

const TitleBar = memo(function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  
  const handleMaximize = async () => {
    await api.maximize()
    setIsMaximized(!isMaximized)
  }
  
  return (
    <div className="h-9 bg-metro-dark flex items-center justify-between drag select-none border-b border-metro-border/30 relative">
      {/* 微妙的顶部高光效果 */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      
      {/* Logo */}
      <div className="flex items-center h-full px-4 no-drag gap-2.5">
        <div className="relative">
          <Database size={16} className="text-accent-blue" />
          <div className="absolute inset-0 bg-accent-blue/20 blur-md -z-10" />
        </div>
        <span className="text-sm font-semibold tracking-wide text-white/90">EasySQL</span>
        <span className="text-[10px] text-white/30 font-medium ml-1">v2.0</span>
      </div>

      {/* Window Controls - Windows 11 风格 */}
      <div className="flex h-full no-drag">
        <button
          onClick={() => api.minimize()}
          className="w-12 h-full flex items-center justify-center hover:bg-white/10 transition-colors duration-150 group"
          title="最小化"
        >
          <Minus size={16} className="text-white/60 group-hover:text-white/90" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-full flex items-center justify-center hover:bg-white/10 transition-colors duration-150 group"
          title={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? (
            <Copy size={11} className="text-white/60 group-hover:text-white/90" />
          ) : (
            <Square size={11} className="text-white/60 group-hover:text-white/90" />
          )}
        </button>
        <button
          onClick={() => api.close()}
          className="w-12 h-full flex items-center justify-center hover:bg-accent-red transition-colors duration-150 group"
          title="关闭"
        >
          <X size={16} className="text-white/60 group-hover:text-white" />
        </button>
      </div>
    </div>
  )
})

export default TitleBar
