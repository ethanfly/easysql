import { X, Database, Check, AlertCircle, ChevronDown, ChevronRight, Shield, Globe, Server, Key, User, Folder, FileText } from 'lucide-react'
import { Connection, DB_INFO, DatabaseType } from '../types'
import { useState, useEffect, useRef } from 'react'
import api from '../lib/electron-api'

interface Props {
  isOpen: boolean
  editingConnection?: Connection | null
  initialType?: DatabaseType
  onClose: () => void
  onSave: (conn: Omit<Connection, 'id'> & { id?: string }) => void
}

export default function ConnectionModal({ isOpen, editingConnection, initialType, onClose, onSave }: Props) {
  const [selectedType, setSelectedType] = useState<DatabaseType>(editingConnection?.type || initialType || 'mysql')
  const [name, setName] = useState(editingConnection?.name || '')
  const [host, setHost] = useState(editingConnection?.host || 'localhost')
  const [port, setPort] = useState(editingConnection?.port || DB_INFO[selectedType].defaultPort)
  const [username, setUsername] = useState(editingConnection?.username || '')
  const [password, setPassword] = useState(editingConnection?.password || '')
  const [database, setDatabase] = useState(editingConnection?.database || '')
  const [file, setFile] = useState(editingConnection?.file || '')
  const [useSSH, setUseSSH] = useState(editingConnection?.ssh?.enabled || false)
  const [sshHost, setSshHost] = useState(editingConnection?.ssh?.host || '')
  const [sshPort, setSshPort] = useState(editingConnection?.ssh?.port || 22)
  const [sshUser, setSshUser] = useState(editingConnection?.ssh?.username || '')
  const [sshPassword, setSshPassword] = useState(editingConnection?.ssh?.password || '')
  const [sshKeyFile, setSshKeyFile] = useState(editingConnection?.ssh?.privateKeyPath || '')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => nameInputRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  useEffect(() => {
    if (editingConnection) {
      setSelectedType(editingConnection.type)
      setName(editingConnection.name)
      setHost(editingConnection.host || 'localhost')
      setPort(editingConnection.port || DB_INFO[editingConnection.type].defaultPort)
      setUsername(editingConnection.username || '')
      setPassword(editingConnection.password || '')
      setDatabase(editingConnection.database || '')
      setFile(editingConnection.file || '')
      setUseSSH(editingConnection.ssh?.enabled || false)
      setSshHost(editingConnection.ssh?.host || '')
      setSshPort(editingConnection.ssh?.port || 22)
      setSshUser(editingConnection.ssh?.username || '')
      setSshPassword(editingConnection.ssh?.password || '')
      setSshKeyFile(editingConnection.ssh?.privateKeyPath || '')
    } else {
      const type = initialType || 'mysql'
      setSelectedType(type)
      setName('')
      setHost('localhost')
      setPort(DB_INFO[type].defaultPort)
      setUsername('')
      setPassword('')
      setDatabase('')
      setFile('')
      setUseSSH(false)
      setSshHost('')
      setSshPort(22)
      setSshUser('')
      setSshPassword('')
      setSshKeyFile('')
    }
    setMessage(null)
  }, [editingConnection, isOpen, initialType])

  const handleTypeChange = (type: DatabaseType) => {
    setSelectedType(type)
    setPort(DB_INFO[type].defaultPort)
    setMessage(null)
  }

  const handleTest = async () => {
    try {
      const connData = buildConnection()
      const result = await api.testConnection(connData)
      if (result.success) {
        setMessage({ type: 'success', text: '连接成功！' })
      } else {
        setMessage({ type: 'error', text: result.error || '连接失败' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: '测试失败：' + (err as Error).message })
    }
    setTimeout(() => setMessage(null), 3000)
  }

  const buildConnection = (): Omit<Connection, 'id'> & { id?: string } => {
    const info = DB_INFO[selectedType]
    return {
      ...(editingConnection?.id ? { id: editingConnection.id } : {}),
      type: selectedType,
      name: name || `${info.name} 连接`,
      host: info.needsHost ? host : undefined,
      port: info.needsHost ? port : undefined,
      username: info.needsAuth ? username : undefined,
      password: info.needsAuth ? password : undefined,
      database: database || undefined,
      file: info.needsFile ? file : undefined,
      ssh: useSSH && info.needsHost ? { enabled: true, host: sshHost, port: sshPort, username: sshUser, password: sshPassword || undefined, privateKeyPath: sshKeyFile || undefined } : undefined,
    }
  }

  const handleSave = () => {
    if (!name.trim()) {
      setMessage({ type: 'error', text: '请输入连接名称' })
      setTimeout(() => setMessage(null), 3000)
      return
    }
    onSave(buildConnection())
    onClose()
  }

  const handleSelectFile = async () => {
    const filePath = await api.selectFile([{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }])
    if (filePath) setFile(filePath)
  }

  const handleSelectKeyFile = async () => {
    const filePath = await api.selectFile([{ name: 'PEM', extensions: ['pem', 'key', 'ppk'] }])
    if (filePath) setSshKeyFile(filePath)
  }

  if (!isOpen) return null

  const info = DB_INFO[selectedType]
  const isEditing = !!editingConnection

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm" onClick={onClose}>
      <div className="w-[520px] max-h-[90vh] bg-white flex flex-col overflow-hidden rounded-2xl shadow-modal animate-scale-in" onClick={e => e.stopPropagation()}>
        {/* 标题 */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-border-default">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: info.color + '15' }}>
              <span className="text-xl">{info.icon}</span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                {isEditing ? '编辑连接' : '新建连接'}
              </h2>
              <p className="text-xs text-text-muted">{info.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-light-hover rounded-lg transition-colors">
            <X size={18} className="text-text-tertiary" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-5 space-y-5">
            {/* 数据库类型选择 */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">数据库类型</label>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(DB_INFO) as [DatabaseType, typeof DB_INFO[DatabaseType]][])
                  .filter(([, i]) => i.supported)
                  .map(([type, i]) => (
                    <button
                      key={type}
                      onClick={() => handleTypeChange(type)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all
                        ${selectedType === type 
                          ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-focus' 
                          : 'border-border-default hover:border-border-strong text-text-primary hover:bg-light-hover'}`}
                    >
                      <span className="text-lg">{i.icon}</span>
                      <span className="font-medium">{i.name}</span>
                    </button>
                  ))}
              </div>
            </div>

            {/* 连接名称 */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                <User size={12} className="inline mr-1" />
                连接名称
              </label>
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`我的${info.name}连接`}
                className="w-full h-10 px-3 bg-light-surface border border-border-default rounded-lg focus:border-primary-500 focus:shadow-focus transition-all"
              />
            </div>

            {/* SQLite 文件路径 */}
            {info.needsFile && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  <FileText size={12} className="inline mr-1" />
                  数据库文件
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={file}
                    onChange={(e) => setFile(e.target.value)}
                    placeholder="选择或输入 .db 文件路径"
                    className="flex-1 h-10 px-3 bg-light-surface border border-border-default rounded-lg focus:border-primary-500 focus:shadow-focus transition-all"
                  />
                  <button
                    onClick={handleSelectFile}
                    className="h-10 px-4 bg-white hover:bg-light-hover border border-border-default rounded-lg text-sm text-text-primary transition-colors flex items-center gap-1.5"
                  >
                    <Folder size={14} />
                    浏览
                  </button>
                </div>
              </div>
            )}

            {/* 主机和端口 */}
            {info.needsHost && (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-text-secondary mb-2">
                    <Globe size={12} className="inline mr-1" />
                    主机
                  </label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="localhost"
                    className="w-full h-10 px-3 bg-light-surface border border-border-default rounded-lg focus:border-primary-500 focus:shadow-focus transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-2">
                    <Server size={12} className="inline mr-1" />
                    端口
                  </label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(parseInt(e.target.value) || 0)}
                    className="w-full h-10 px-3 bg-light-surface border border-border-default rounded-lg focus:border-primary-500 focus:shadow-focus transition-all"
                  />
                </div>
              </div>
            )}

            {/* 认证信息 */}
            {info.needsAuth && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-2">
                    <User size={12} className="inline mr-1" />
                    用户名
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="root"
                    className="w-full h-10 px-3 bg-light-surface border border-border-default rounded-lg focus:border-primary-500 focus:shadow-focus transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-2">
                    <Key size={12} className="inline mr-1" />
                    密码
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10 px-3 bg-light-surface border border-border-default rounded-lg focus:border-primary-500 focus:shadow-focus transition-all"
                  />
                </div>
              </div>
            )}

            {/* 数据库名称 */}
            {info.needsHost && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  <Database size={12} className="inline mr-1" />
                  默认数据库
                  <span className="text-text-muted font-normal ml-1">(可选)</span>
                </label>
                <input
                  type="text"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder="连接后自动选择的数据库"
                  className="w-full h-10 px-3 bg-light-surface border border-border-default rounded-lg focus:border-primary-500 focus:shadow-focus transition-all"
                />
              </div>
            )}

            {/* SSH 设置 */}
            {info.needsHost && (
              <div className="border border-border-default rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-light-hover transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-teal-500" />
                    <span className="text-sm font-medium text-text-primary">SSH 隧道</span>
                  </div>
                  {showAdvanced ? <ChevronDown size={16} className="text-text-tertiary" /> : <ChevronRight size={16} className="text-text-tertiary" />}
                </button>
                
                {showAdvanced && (
                  <div className="px-4 pb-4 pt-2 border-t border-border-light bg-light-surface space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useSSH}
                        onChange={(e) => setUseSSH(e.target.checked)}
                        className="w-4 h-4 rounded border-border-strong text-primary-500 focus:ring-primary-500"
                      />
                      <span className="text-sm text-text-secondary">启用 SSH 隧道</span>
                    </label>
                    
                    {useSSH && (
                      <div className="space-y-3 mt-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2">
                            <label className="block text-xs text-text-muted mb-1">SSH 主机</label>
                            <input
                              type="text"
                              value={sshHost}
                              onChange={(e) => setSshHost(e.target.value)}
                              className="w-full h-9 px-3 bg-white border border-border-default rounded-lg text-sm focus:border-primary-500 focus:shadow-focus"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-text-muted mb-1">端口</label>
                            <input
                              type="number"
                              value={sshPort}
                              onChange={(e) => setSshPort(parseInt(e.target.value) || 22)}
                              className="w-full h-9 px-3 bg-white border border-border-default rounded-lg text-sm focus:border-primary-500 focus:shadow-focus"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-text-muted mb-1">用户名</label>
                            <input
                              type="text"
                              value={sshUser}
                              onChange={(e) => setSshUser(e.target.value)}
                              className="w-full h-9 px-3 bg-white border border-border-default rounded-lg text-sm focus:border-primary-500 focus:shadow-focus"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-text-muted mb-1">密码</label>
                            <input
                              type="password"
                              value={sshPassword}
                              onChange={(e) => setSshPassword(e.target.value)}
                              className="w-full h-9 px-3 bg-white border border-border-default rounded-lg text-sm focus:border-primary-500 focus:shadow-focus"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-text-muted mb-1">私钥文件 <span className="text-text-disabled">(可选)</span></label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={sshKeyFile}
                              onChange={(e) => setSshKeyFile(e.target.value)}
                              placeholder="~/.ssh/id_rsa"
                              className="flex-1 h-9 px-3 bg-white border border-border-default rounded-lg text-sm focus:border-primary-500 focus:shadow-focus"
                            />
                            <button onClick={handleSelectKeyFile}
                              className="h-9 px-3 bg-white hover:bg-light-hover border border-border-default rounded-lg text-sm">
                              浏览
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 消息提示 */}
            {message && (
              <div className={`flex items-center gap-2 px-4 py-3 rounded-lg animate-slide-up
                ${message.type === 'success' ? 'bg-success-50 text-success-600 border border-success-200' : 'bg-danger-50 text-danger-600 border border-danger-200'}`}>
                {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                <span className="text-sm">{message.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="h-16 flex items-center justify-end gap-3 px-5 border-t border-border-default bg-light-surface">
          <button onClick={handleTest}
            className="h-9 px-4 bg-white hover:bg-light-hover border border-border-default rounded-lg text-sm font-medium text-text-primary transition-colors">
            测试连接
          </button>
          <button onClick={onClose}
            className="h-9 px-4 bg-white hover:bg-light-hover border border-border-default rounded-lg text-sm font-medium text-text-primary transition-colors">
            取消
          </button>
          <button onClick={handleSave}
            className="h-9 px-5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium shadow-btn hover:shadow-btn-hover transition-all">
            {isEditing ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}
