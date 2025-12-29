import { Minus, Square, X } from 'lucide-react'

export default function TitleBar() {
  return (
    <div className="h-8 bg-metro-dark flex items-center justify-between drag select-none">
      {/* Logo */}
      <div className="flex items-center h-full px-3 no-drag">
        <span className="text-sm font-semibold text-white/90">EasySQL</span>
      </div>

      {/* Window Controls - Windows 11 风格 */}
      <div className="flex h-full no-drag">
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="w-12 h-full flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <Minus size={16} className="text-white/80" />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          className="w-12 h-full flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <Square size={12} className="text-white/80" />
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="w-12 h-full flex items-center justify-center hover:bg-accent-red transition-colors"
        >
          <X size={16} className="text-white/80" />
        </button>
      </div>
    </div>
  )
}
