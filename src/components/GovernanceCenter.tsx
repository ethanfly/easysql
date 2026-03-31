import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ClipboardList, EyeOff, RefreshCw, Save, Shield, X } from 'lucide-react'
import api from '../lib/electron-api'
import type {
  GovernanceAuditRecord,
  GovernanceConfig,
  GovernanceDecision,
  GovernanceFlashbackRecord,
  GovernanceMaskRule,
} from '../types'

const DEFAULT_CONFIG: GovernanceConfig = {
  enabled: true,
  maskingEnabled: true,
  auditEnabled: true,
  defaultUnknownDecision: 'confirm',
  highRiskMode: 'confirm',
  decisionPolicy: {
    DQL: 'allow',
    DML: 'allow',
    DDL: 'confirm',
    TCL: 'allow',
    UNKNOWN: 'confirm',
  },
  maskRules: [],
}

const DECISION_OPTIONS: GovernanceDecision[] = ['allow', 'confirm', 'block']

interface Props {
  isOpen: boolean
  onClose: () => void
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void
}

function createRule(): GovernanceMaskRule {
  return {
    id: `mask-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    enabled: true,
    matchMode: 'keyword',
    pattern: '',
    maskType: 'custom-partial',
    prefix: 2,
    suffix: 2,
    maskChar: '*',
  }
}

export default function GovernanceCenter({ isOpen, onClose, onNotify }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'masking' | 'audit'>('overview')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [config, setConfig] = useState<GovernanceConfig>(DEFAULT_CONFIG)
  const [auditLogs, setAuditLogs] = useState<GovernanceAuditRecord[]>([])
  const [flashbackLogs, setFlashbackLogs] = useState<GovernanceFlashbackRecord[]>([])

  const summary = useMemo(() => {
    return auditLogs.reduce<Record<string, number>>((acc, record) => {
      const key = record.classification || 'UNKNOWN'
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
  }, [auditLogs])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    void refreshData()
  }, [isOpen])

  const refreshData = async () => {
    setIsLoading(true)
    try {
      const [nextConfig, nextAuditLogs, nextFlashbacks] = await Promise.all([
        api.loadGovernanceConfig(),
        api.listAuditLogs({ limit: 30 }),
        api.listFlashbackLogs({ limit: 20 }),
      ])

      setConfig(nextConfig ?? DEFAULT_CONFIG)
      setAuditLogs(nextAuditLogs)
      setFlashbackLogs(nextFlashbacks)
    } catch (error: any) {
      onNotify('error', `加载治理数据失败: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const saveConfig = async () => {
    setIsSaving(true)
    try {
      const result = await api.saveGovernanceConfig(config)
      if (!result.success) {
        onNotify('error', result.message || '保存治理配置失败')
        return
      }
      onNotify('success', '治理配置已保存')
    } catch (error: any) {
      onNotify('error', `保存治理配置失败: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const updateRule = (ruleId: string, patch: Partial<GovernanceMaskRule>) => {
    setConfig((prev) => ({
      ...prev,
      maskRules: prev.maskRules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
    }))
  }

  const removeRule = (ruleId: string) => {
    setConfig((prev) => ({
      ...prev,
      maskRules: prev.maskRules.filter((rule) => rule.id !== ruleId),
    }))
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-6">
      <div className="flex h-[82vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Governance Center</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">数据访问治理</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void refreshData()}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              刷新
            </button>
            <button
              onClick={() => void saveConfig()}
              className="flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <Save size={14} />
              {isSaving ? '保存中' : '保存配置'}
            </button>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
          <div className="border-r border-slate-200 bg-slate-50/70 p-4">
            <button
              onClick={() => setActiveTab('overview')}
              className={`mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                activeTab === 'overview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <Shield size={16} />
              访问分类与风险
            </button>
            <button
              onClick={() => setActiveTab('masking')}
              className={`mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                activeTab === 'masking' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <EyeOff size={16} />
              数据脱敏
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                activeTab === 'audit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <ClipboardList size={16} />
              审计与闪回
            </button>
          </div>

          <div className="min-h-0 overflow-y-auto p-6">
            {activeTab === 'overview' && (
              <div>
                <div className="grid gap-4 md:grid-cols-4">
                  {(['DQL', 'DML', 'DDL', 'UNKNOWN'] as const).map((label) => (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
                      <div className="mt-3 text-2xl font-semibold text-slate-900">{summary[label] ?? 0}</div>
                      <div className="mt-1 text-sm text-slate-500">最近 30 条审计记录</div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <section className="rounded-2xl border border-slate-200 p-5">
                    <h3 className="text-base font-semibold text-slate-900">执行决策</h3>
                    <p className="mt-1 text-sm text-slate-500">高风险策略优先于分类策略。UNKNOWN 和多语句保持保守默认值。</p>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <label className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
                        <div className="font-medium text-slate-900">启用治理</div>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(event) => setConfig((prev) => ({ ...prev, enabled: event.target.checked }))}
                          />
                          <span>所有 SQL 和结构化操作经过主进程治理链</span>
                        </div>
                      </label>

                      <label className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
                        <div className="font-medium text-slate-900">启用审计</div>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.auditEnabled}
                            onChange={(event) => setConfig((prev) => ({ ...prev, auditEnabled: event.target.checked }))}
                          />
                          <span>落完整审计记录和闪回辅助记录</span>
                        </div>
                      </label>

                      <label className="text-sm text-slate-700">
                        <div className="mb-2 font-medium text-slate-900">高风险策略</div>
                        <select
                          value={config.highRiskMode}
                          onChange={(event) => setConfig((prev) => ({ ...prev, highRiskMode: event.target.value as GovernanceDecision }))}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3"
                        >
                          {DECISION_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm text-slate-700">
                        <div className="mb-2 font-medium text-slate-900">UNKNOWN 默认策略</div>
                        <select
                          value={config.defaultUnknownDecision}
                          onChange={(event) => setConfig((prev) => ({ ...prev, defaultUnknownDecision: event.target.value as GovernanceDecision }))}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3"
                        >
                          {DECISION_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-4">
                      {(['DQL', 'DML', 'DDL', 'TCL'] as const).map((classification) => (
                        <label key={classification} className="text-sm text-slate-700">
                          <div className="mb-2 font-medium text-slate-900">{classification} 策略</div>
                          <select
                            value={config.decisionPolicy[classification]}
                            onChange={(event) =>
                              setConfig((prev) => ({
                                ...prev,
                                decisionPolicy: {
                                  ...prev.decisionPolicy,
                                  [classification]: event.target.value as GovernanceDecision,
                                },
                              }))
                            }
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3"
                          >
                            {DECISION_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 p-5">
                    <div className="flex items-center gap-2 text-slate-900">
                      <AlertTriangle size={16} className="text-amber-500" />
                      <h3 className="text-base font-semibold">最近高风险操作</h3>
                    </div>
                    <div className="mt-4 space-y-3">
                      {auditLogs.filter((record) => record.riskLevel === 'high').slice(0, 8).map((record) => (
                        <div key={record.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-slate-900">{record.statementType}</div>
                            <div className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">{record.decision}</div>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {record.connectionName} · {record.timestamp}
                          </div>
                          <div className="mt-2 truncate text-sm text-slate-700">{record.sqlText || record.operationKind}</div>
                        </div>
                      ))}
                      {auditLogs.filter((record) => record.riskLevel === 'high').length === 0 && (
                        <div className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                          还没有高风险记录。
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {activeTab === 'masking' && (
              <div>
                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">敏感字段脱敏规则</h3>
                      <p className="mt-1 text-sm text-slate-500">查询结果和表格浏览结果在返回 renderer 前按列名规则脱敏。</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={config.maskingEnabled}
                        onChange={(event) => setConfig((prev) => ({ ...prev, maskingEnabled: event.target.checked }))}
                      />
                      启用脱敏
                    </label>
                  </div>

                  <div className="mt-5 space-y-3">
                    {config.maskRules.map((rule) => (
                      <div key={rule.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[110px_110px_1fr_140px_80px_80px_90px_44px]">
                        <label className="text-xs text-slate-500">
                          开启
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })}
                            className="mt-2 block"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          匹配方式
                          <select
                            value={rule.matchMode}
                            onChange={(event) => updateRule(rule.id, { matchMode: event.target.value as GovernanceMaskRule['matchMode'] })}
                            className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                          >
                            <option value="keyword">keyword</option>
                            <option value="exact">exact</option>
                          </select>
                        </label>
                        <label className="text-xs text-slate-500">
                          列名模式
                          <input
                            value={rule.pattern}
                            onChange={(event) => updateRule(rule.id, { pattern: event.target.value })}
                            placeholder="phone / email / id_card"
                            className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          脱敏类型
                          <select
                            value={rule.maskType}
                            onChange={(event) => updateRule(rule.id, { maskType: event.target.value as GovernanceMaskRule['maskType'] })}
                            className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                          >
                            <option value="phone">phone</option>
                            <option value="email">email</option>
                            <option value="id-card">id-card</option>
                            <option value="bank-card">bank-card</option>
                            <option value="name">name</option>
                            <option value="custom-partial">custom-partial</option>
                          </select>
                        </label>
                        <label className="text-xs text-slate-500">
                          前缀
                          <input
                            type="number"
                            value={rule.prefix ?? 0}
                            onChange={(event) => updateRule(rule.id, { prefix: Number(event.target.value) })}
                            className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          后缀
                          <input
                            type="number"
                            value={rule.suffix ?? 0}
                            onChange={(event) => updateRule(rule.id, { suffix: Number(event.target.value) })}
                            className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          掩码字符
                          <input
                            value={rule.maskChar ?? '*'}
                            onChange={(event) => updateRule(rule.id, { maskChar: event.target.value || '*' })}
                            className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                          />
                        </label>
                        <button
                          onClick={() => removeRule(rule.id)}
                          className="mt-5 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {config.maskRules.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                        还没有脱敏规则。建议先加 `phone`、`email`、`id_card`、`bank_card` 这些关键字规则。
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setConfig((prev) => ({ ...prev, maskRules: [...prev.maskRules, createRule()] }))}
                    className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    新增规则
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <section className="rounded-2xl border border-slate-200 p-5">
                  <h3 className="text-base font-semibold text-slate-900">最近审计记录</h3>
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">时间</th>
                          <th className="px-3 py-2 font-medium">操作</th>
                          <th className="px-3 py-2 font-medium">分类</th>
                          <th className="px-3 py-2 font-medium">风险</th>
                          <th className="px-3 py-2 font-medium">结果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((record) => (
                          <tr key={record.id} className="border-t border-slate-200">
                            <td className="px-3 py-2 text-slate-500">{record.timestamp}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-900">{record.statementType}</div>
                              <div className="max-w-[320px] truncate text-xs text-slate-500">{record.sqlText || record.operationKind}</div>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{record.classification}</td>
                            <td className="px-3 py-2 text-slate-700">{record.riskLevel}</td>
                            <td className="px-3 py-2 text-slate-700">{record.result.success ? 'success' : 'failed'}</td>
                          </tr>
                        ))}
                        {auditLogs.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">还没有审计记录。</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 p-5">
                  <h3 className="text-base font-semibold text-slate-900">闪回辅助</h3>
                  <div className="mt-4 space-y-3">
                    {flashbackLogs.map((record) => (
                      <div key={record.flashbackId ?? `${record.auditId}-${record.operationKind}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-slate-900">{record.operationKind || 'unknown'}</div>
                          <div className={`rounded-full px-2 py-1 text-xs font-medium ${record.available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                            {record.available ? '可恢复' : '仅记录'}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {(record.target?.tableName || 'unknown table')}
                          {record.target?.primaryKey ? ` · PK ${record.target.primaryKey}` : ''}
                        </div>
                        <div className="mt-3 rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">
                          {record.recoverySql || record.reasonCodes.join(', ')}
                        </div>
                      </div>
                    ))}
                    {flashbackLogs.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                        还没有可展示的闪回记录。
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
