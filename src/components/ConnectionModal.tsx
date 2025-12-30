import { useState, useEffect } from 'react'
import { X, Loader2, Shield, FolderOpen } from 'lucide-react'
import { Connection, DatabaseType, DB_INFO } from '../types'
import api from '../lib/tauri-api'

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
    
    const result = await api.testConnection(form)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      {/* Metro 风格弹窗 */}
      <div className="relative w-[560px] max-h-[90vh] bg-metro-bg flex flex-col overflow-hidden shadow-metro-xl animate-slide-up">
        {/* 标题栏 */}
        <div className="h-14 bg-accent-blue flex items-center justify-between px-5">
          <span className="font-semibold text-lg">{connection ? '编辑连接' : '新建连接'}</span>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 transition-colors rounded-sm">
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 连接名称 */}
          <div>
            <label className="block text-sm text-text-secondary mb-2 font-medium">连接名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="输入名称"
              className="w-full h-10 px-4 bg-metro-surface border-2 border-transparent 
                         focus:border-accent-blue text-sm transition-all rounded-sm"
            />
          </div>

          {/* 数据库类型 - Metro 磁贴选择 */}
          <div>
            <label className="block text-sm text-text-secondary mb-3 font-medium">数据库类型</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(DB_INFO) as [DatabaseType, typeof DB_INFO[DatabaseType]][]).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => info.supported && handleTypeChange(key)}
                  className={`h-16 flex items-center gap-3 px-4 transition-all metro-tile relative
                    ${!info.supported ? 'cursor-not-allowed' : ''}
                    ${form.type === key && info.supported
                      ? 'ring-2 ring-white ring-inset shadow-metro-lg' 
                      : info.supported ? 'opacity-60 hover:opacity-100' : ''}`}
                  style={{ 
                    backgroundColor: info.color,
                    opacity: info.supported ? (form.type === key ? 1 : 0.6) : 0.3,
                    filter: info.supported ? 'none' : 'grayscale(60%)'
                  }}
                  disabled={!info.supported}
                  title={info.supported ? info.name : `${info.name} - 即将支持`}
                >
                  <span className="text-2xl">{info.icon}</span>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium">{info.name}</span>
                    {!info.supported && (
                      <span className="text-[10px] text-white/60">即将支持</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* SQLite 文件选择 */}
          {form.type === 'sqlite' ? (
            <div>
              <label className="block text-sm text-text-secondary mb-2 font-medium">数据库文件</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.database}
                  onChange={(e) => setForm(prev => ({ ...prev, database: e.target.value }))}
                  placeholder="选择或输入 .db 文件路径"
                  className="flex-1 h-10 px-4 bg-metro-surface border-2 border-transparent 
                             focus:border-accent-blue text-sm transition-all rounded-sm"
                />
                <button
                  onClick={async () => {
                    const result = await api.selectFile(['db', 'sqlite', 'sqlite3'])
                    if (result?.path) {
                      setForm(prev => ({ ...prev, database: result.path }))
                    }
                  }}
                  className="h-10 px-4 bg-metro-surface hover:bg-metro-hover flex items-center gap-2 text-sm transition-colors rounded-sm"
                >
                  <FolderOpen size={16} />
                  浏览
                </button>
              </div>
              <p className="text-xs text-text-disabled mt-2">如果文件不存在，将创建新的数据库</p>
            </div>
          ) : (
            <>
              {/* 主机和端口 */}
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3">
                  <label className="block text-sm text-text-secondary mb-2 font-medium">主机</label>
                  <input
                    type="text"
                    value={form.host}
                    onChange={(e) => setForm(prev => ({ ...prev, host: e.target.value }))}
                    placeholder="localhost"
                    className="w-full h-10 px-4 bg-metro-surface border-2 border-transparent 
                               focus:border-accent-blue text-sm transition-all rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-2 font-medium">端口</label>
                  <input
                    type="number"
                    value={form.port}
                    onChange={(e) => setForm(prev => ({ ...prev, port: parseInt(e.target.value) || 0 }))}
                    className="w-full h-10 px-4 bg-metro-surface border-2 border-transparent 
                               focus:border-accent-blue text-sm transition-all rounded-sm"
                  />
                </div>
              </div>

              {/* 用户名密码 - Redis 只需要密码 */}
              {form.type === 'redis' ? (
                <div>
                  <label className="block text-sm text-text-secondary mb-2 font-medium">
                    密码 <span className="text-text-disabled font-normal">(可选)</span>
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="无密码时留空"
                    className="w-full h-10 px-4 bg-metro-surface border-2 border-transparent 
                               focus:border-accent-blue text-sm transition-all rounded-sm"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-text-secondary mb-2 font-medium">
                      用户名 {form.type === 'mongodb' && <span className="text-text-disabled font-normal">(可选)</span>}
                    </label>
                    <input
                      type="text"
                      value={form.username}
                      onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value }))}
                      placeholder={form.type === 'mongodb' ? '无认证时留空' : 'root'}
                      className="w-full h-10 px-4 bg-metro-surface border-2 border-transparent 
                                 focus:border-accent-blue text-sm transition-all rounded-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-2 font-medium">
                      密码 {form.type === 'mongodb' && <span className="text-text-disabled font-normal">(可选)</span>}
                    </label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder={form.type === 'mongodb' ? '无认证时留空' : ''}
                      className="w-full h-10 px-4 bg-metro-surface border-2 border-transparent 
                                 focus:border-accent-blue text-sm transition-all rounded-sm"
                    />
                  </div>
                </div>
              )}

              {/* 数据库 */}
              <div>
                <label className="block text-sm text-text-secondary mb-2 font-medium">
                  数据库 <span className="text-text-disabled font-normal">(可选)</span>
                </label>
                <input
                  type="text"
                  value={form.database}
                  onChange={(e) => setForm(prev => ({ ...prev, database: e.target.value }))}
                  placeholder={form.type === 'mongodb' ? '默认 admin' : '留空表示连接所有数据库'}
                  className="w-full h-10 px-4 bg-metro-surface border-2 border-transparent 
                             focus:border-accent-blue text-sm transition-all rounded-sm"
                />
              </div>
            </>
          )}

          {/* SSH */}
          <div className="pt-4 border-t border-metro-border">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.sshEnabled}
                onChange={(e) => setForm(prev => ({ ...prev, sshEnabled: e.target.checked }))}
                className="w-5 h-5 accent-accent-blue cursor-pointer"
              />
              <Shield size={18} className={form.sshEnabled ? 'text-accent-green' : 'text-text-disabled'} />
              <span className="text-sm font-medium group-hover:text-white transition-colors">SSH 隧道连接</span>
            </label>

            {form.sshEnabled && (
              <div className="mt-4 p-4 bg-metro-surface rounded-sm space-y-4 border-l-2 border-accent-green">
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-3">
                    <label className="block text-xs text-text-tertiary mb-1.5">SSH 主机</label>
                    <input
                      type="text"
                      value={form.sshHost}
                      onChange={(e) => setForm(prev => ({ ...prev, sshHost: e.target.value }))}
                      className="w-full h-9 px-3 bg-metro-bg border-2 border-transparent 
                                 focus:border-accent-blue text-sm transition-all rounded-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1.5">端口</label>
                    <input
                      type="number"
                      value={form.sshPort}
                      onChange={(e) => setForm(prev => ({ ...prev, sshPort: parseInt(e.target.value) || 22 }))}
                      className="w-full h-9 px-3 bg-metro-bg border-2 border-transparent 
                                 focus:border-accent-blue text-sm transition-all rounded-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1.5">SSH 用户名</label>
                    <input
                      type="text"
                      value={form.sshUser}
                      onChange={(e) => setForm(prev => ({ ...prev, sshUser: e.target.value }))}
                      className="w-full h-9 px-3 bg-metro-bg border-2 border-transparent 
                                 focus:border-accent-blue text-sm transition-all rounded-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1.5">SSH 密码</label>
                    <input
                      type="password"
                      value={form.sshPassword}
                      onChange={(e) => setForm(prev => ({ ...prev, sshPassword: e.target.value }))}
                      className="w-full h-9 px-3 bg-metro-bg border-2 border-transparent 
                                 focus:border-accent-blue text-sm transition-all rounded-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 消息 */}
          {message && (
            <div className={`p-4 text-sm rounded-sm ${message.type === 'success' ? 'bg-accent-green/20 text-accent-green border-l-2 border-accent-green' : 'bg-accent-red/20 text-accent-red border-l-2 border-accent-red'}`}>
              {message.text}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="h-16 bg-metro-surface flex items-center justify-end gap-3 px-5 border-t border-metro-border/50">
          <button
            onClick={handleTest}
            disabled={testing}
            className="h-10 px-5 bg-transparent border border-text-tertiary hover:border-white hover:bg-white/5
                       text-sm transition-all disabled:opacity-50 flex items-center gap-2 rounded-sm"
          >
            {testing && <Loader2 size={14} className="animate-spin" />}
            测试连接
          </button>
          <button
            onClick={handleSave}
            className="h-10 px-8 bg-accent-blue hover:bg-accent-blue-hover text-sm font-medium transition-all shadow-metro rounded-sm"
          >
            保存
          </button>
          <button
            onClick={onClose}
            className="h-10 px-5 bg-metro-hover hover:bg-metro-border text-sm transition-all rounded-sm"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
