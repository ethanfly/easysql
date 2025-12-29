import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Connection, DatabaseType, DB_INFO } from '../types'

interface Props {
  connection: Connection | null
  defaultType?: DatabaseType
  onSave: (conn: Connection) => void
  onClose: () => void
}

export default function ConnectionModal({ connection, defaultType, onSave, onClose }: Props) {
  const initialType = defaultType || 'mysql'
  const initialPort = DB_INFO[initialType]?.port || 3306
  
  const [form, setForm] = useState<Connection>({
    id: '',
    name: '',
    type: initialType,
    host: 'localhost',
    port: initialPort,
    username: '',
    password: '',
    database: '',
    sshEnabled: false,
    sshHost: '',
    sshPort: 22,
    sshUser: '',
    sshPassword: '',
    sshKey: '',
  })
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (connection) {
      setForm(connection)
    } else {
      const type = defaultType || 'mysql'
      const port = DB_INFO[type]?.port || 3306
      setForm(prev => ({ 
        ...prev, 
        id: `conn-${Date.now()}`,
        type,
        port,
        name: DB_INFO[type]?.name || ''
      }))
    }
  }, [connection, defaultType])

  const handleTypeChange = (type: DatabaseType) => {
    const info = DB_INFO[type]
    setForm(prev => ({ ...prev, type, port: info?.port || prev.port }))
  }

  const handleTest = async () => {
    setTesting(true)
    setMessage(null)
    
    const result = await window.electronAPI?.testConnection(form)
    setMessage({
      text: result?.message || '测试失败',
      type: result?.success ? 'success' : 'error'
    })
    setTesting(false)
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      setMessage({ text: '请输入连接名称', type: 'error' })
      return
    }
    onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      
      {/* Metro 风格弹窗 */}
      <div className="relative w-[520px] max-h-[90vh] bg-metro-bg flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="h-12 bg-accent-blue flex items-center justify-between px-4">
          <span className="font-medium">{connection ? '编辑连接' : '新建连接'}</span>
          <button onClick={onClose} className="p-1 hover:bg-white/20 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 连接名称 */}
          <div>
            <label className="block text-sm text-white/60 mb-1">连接名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="输入名称"
              className="w-full h-9 px-3 bg-metro-surface border-2 border-transparent 
                         focus:border-accent-blue text-sm transition-colors"
            />
          </div>

          {/* 数据库类型 - Metro 磁贴选择 */}
          <div>
            <label className="block text-sm text-white/60 mb-2">数据库类型</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(DB_INFO) as [DatabaseType, typeof DB_INFO[DatabaseType]][]).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => handleTypeChange(key)}
                  className={`h-14 flex items-center gap-3 px-3 transition-all
                    ${form.type === key 
                      ? 'ring-2 ring-white ring-inset' 
                      : 'opacity-70 hover:opacity-100'}`}
                  style={{ backgroundColor: info.color }}
                >
                  <span className="text-xl">{info.icon}</span>
                  <span className="text-xs font-medium">{info.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 主机和端口 */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3">
              <label className="block text-sm text-white/60 mb-1">主机</label>
              <input
                type="text"
                value={form.host}
                onChange={(e) => setForm(prev => ({ ...prev, host: e.target.value }))}
                placeholder="localhost"
                className="w-full h-9 px-3 bg-metro-surface border-2 border-transparent 
                           focus:border-accent-blue text-sm transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1">端口</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => setForm(prev => ({ ...prev, port: parseInt(e.target.value) || 0 }))}
                className="w-full h-9 px-3 bg-metro-surface border-2 border-transparent 
                           focus:border-accent-blue text-sm transition-colors"
              />
            </div>
          </div>

          {/* 用户名密码 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-white/60 mb-1">用户名</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="root"
                className="w-full h-9 px-3 bg-metro-surface border-2 border-transparent 
                           focus:border-accent-blue text-sm transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1">密码</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
                className="w-full h-9 px-3 bg-metro-surface border-2 border-transparent 
                           focus:border-accent-blue text-sm transition-colors"
              />
            </div>
          </div>

          {/* 数据库 */}
          <div>
            <label className="block text-sm text-white/60 mb-1">数据库</label>
            <input
              type="text"
              value={form.database}
              onChange={(e) => setForm(prev => ({ ...prev, database: e.target.value }))}
              placeholder="可选"
              className="w-full h-9 px-3 bg-metro-surface border-2 border-transparent 
                         focus:border-accent-blue text-sm transition-colors"
            />
          </div>

          {/* SSH */}
          <div className="pt-2 border-t border-metro-border">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.sshEnabled}
                onChange={(e) => setForm(prev => ({ ...prev, sshEnabled: e.target.checked }))}
                className="w-4 h-4 accent-accent-blue"
              />
              <span className="text-sm">SSH 隧道</span>
            </label>

            {form.sshEnabled && (
              <div className="mt-3 p-3 bg-metro-surface space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-3">
                    <label className="block text-xs text-white/50 mb-1">SSH 主机</label>
                    <input
                      type="text"
                      value={form.sshHost}
                      onChange={(e) => setForm(prev => ({ ...prev, sshHost: e.target.value }))}
                      className="w-full h-8 px-2 bg-metro-bg border-2 border-transparent 
                                 focus:border-accent-blue text-sm transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">端口</label>
                    <input
                      type="number"
                      value={form.sshPort}
                      onChange={(e) => setForm(prev => ({ ...prev, sshPort: parseInt(e.target.value) || 22 }))}
                      className="w-full h-8 px-2 bg-metro-bg border-2 border-transparent 
                                 focus:border-accent-blue text-sm transition-colors"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-white/50 mb-1">用户名</label>
                    <input
                      type="text"
                      value={form.sshUser}
                      onChange={(e) => setForm(prev => ({ ...prev, sshUser: e.target.value }))}
                      className="w-full h-8 px-2 bg-metro-bg border-2 border-transparent 
                                 focus:border-accent-blue text-sm transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">密码</label>
                    <input
                      type="password"
                      value={form.sshPassword}
                      onChange={(e) => setForm(prev => ({ ...prev, sshPassword: e.target.value }))}
                      className="w-full h-8 px-2 bg-metro-bg border-2 border-transparent 
                                 focus:border-accent-blue text-sm transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 消息 */}
          {message && (
            <div className={`p-3 text-sm ${message.type === 'success' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'}`}>
              {message.text}
            </div>
          )}
        </div>

        {/* 底部按钮 - Metro 风格 */}
        <div className="h-14 bg-metro-surface flex items-center justify-end gap-2 px-4">
          <button
            onClick={handleTest}
            disabled={testing}
            className="h-9 px-4 bg-transparent border border-white/30 hover:bg-white/10 
                       text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {testing && <Loader2 size={14} className="animate-spin" />}
            测试连接
          </button>
          <button
            onClick={handleSave}
            className="h-9 px-6 bg-accent-blue hover:bg-accent-blue/90 text-sm transition-colors"
          >
            保存
          </button>
          <button
            onClick={onClose}
            className="h-9 px-4 bg-metro-hover hover:bg-metro-border text-sm transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
