// frontend/src/pages/client/EvidencePage.jsx
// Full rewrite — rich evidence viewer with per-agent breakdown

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Card, Button, Alert, Spinner, EmptyState, Modal, Badge } from '../../components/ui'
import { timeAgo, fmtCost, fmtTokens, AGENT_ICONS, AGENT_LABELS } from '../../utils/helpers'

const POLL_MS = 15000

function TrustBadge({ type }) {
  if (type === 'json_summary' || type === 'workflow_summary') {
    return (
      <span className="px-2 py-0.5 bg-blue-900/40 border border-blue-700/40 text-blue-300 text-xs rounded font-mono">
        📋 Summary
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 bg-green-900/40 border border-green-700/40 text-green-300 text-xs rounded font-mono">
      🔒 EPI Signed
    </span>
  )
}

function AgentDetailCard({ run }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = AGENT_ICONS[run.agent_type]
  const label = AGENT_LABELS[run.agent_type] || run.agent_type || run.node_id
  const isOk  = run.status === 'success'

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      isOk ? 'border-gray-700/50 bg-gray-800/20' : 'border-red-700/30 bg-red-900/10'
    }`}>
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-800/30 transition-colors"
        onClick={() => setExpanded(p => !p)}
      >
        <span className="text-xl flex-shrink-0"><Icon className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-white text-sm font-semibold">{label}</span>
            <code className="text-[10px] text-gray-600 bg-gray-900 px-1 rounded">{run.node_id}</code>
            <span className={`text-xs font-mono ${isOk ? 'text-green-400' : 'text-red-400'}`}>
              {isOk ? '✓' : '✗'} {run.status}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-gray-500">
            {run.model_used  && <span className="text-purple-300">{run.model_used.split('/').pop()}</span>}
            {run.cost_usd > 0 && <span className="text-yellow-400">{fmtCost(run.cost_usd)}</span>}
            {run.confidence != null && (
              <span className={run.confidence >= 0.75 ? 'text-green-400' : run.confidence >= 0.5 ? 'text-yellow-400' : 'text-red-400'}>
                {Math.round(run.confidence * 100)}% conf
              </span>
            )}
            {run.tokens_in > 0 && <span>In: {fmtTokens(run.tokens_in)} / Out: {fmtTokens(run.tokens_out)}</span>}
            {run.duration_ms && (
              <span>{run.duration_ms < 1000 ? `${run.duration_ms}ms` : `${(run.duration_ms/1000).toFixed(1)}s`}</span>
            )}
          </div>
        </div>
        <span className="text-gray-600 text-xs flex-shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-800 p-3 space-y-3 bg-gray-900/20">
          {/* Tools called */}
          {run.tools_used?.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider font-semibold">Tools Called</div>
              <div className="flex flex-wrap gap-1.5">
                {run.tools_used.map(t => (
                  <span key={t} className="text-[10px] bg-blue-900/30 border border-blue-800/40 text-blue-300 rounded px-1.5 py-0.5 font-mono">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Verification judge/prosecutor */}
          {(run._prosecutor_issues != null || run._judge_verdict) && (
            <div>
              <div className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider font-semibold">Verification Audit</div>
              <div className="flex gap-4 text-xs">
                {run._prosecutor_issues != null && (
                  <span className="text-orange-400">⚖ {run._prosecutor_issues} fault{run._prosecutor_issues !== 1 ? 's' : ''} reviewed</span>
                )}
                {run._judge_verdict && (
                  <span className={run._judge_verdict === 'PASS' ? 'text-green-400' : 'text-red-400'}>
                    Judge: {run._judge_verdict}
                  </span>
                )}
              </div>
              {run._prosecutor_faults?.length > 0 && (
                <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                  {run._prosecutor_faults.slice(0, 10).map((f, i) => (
                    <div key={i} className="text-[10px] text-orange-300/80 leading-relaxed">{f}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Memory delta */}
          {run.delta_analysis && (
            <div>
              <div className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider font-semibold">Learning Delta</div>
              <div className="bg-purple-900/10 border border-purple-800/20 rounded-lg p-2.5 text-xs text-gray-300 leading-relaxed">
                {run.delta_analysis.summary || 'No summary'}
                <div className="flex gap-4 mt-1 text-[10px]">
                  <span className={run.delta_vs_history === 'better' ? 'text-green-400' : run.delta_vs_history === 'worse' ? 'text-red-400' : 'text-gray-500'}>
                    vs history: {run.delta_vs_history || 'n/a'}
                  </span>
                  {run.delta_trend && <span className="text-gray-600">trend: {run.delta_trend}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {run.error && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-2.5 text-xs text-red-300 font-mono leading-relaxed">
              {run.error.slice(0, 500)}
            </div>
          )}

          {/* Description */}
          {run.node_description && (
            <p className="text-xs text-gray-500 leading-relaxed">{run.node_description}</p>
          )}
        </div>
      )}
    </div>
  )
}

function EvidenceDetailModal({ artifact, open, onClose, api }) {
  const navigate = useNavigate()
  const [loading,     setLoading]     = useState(false)
  const [wfData,      setWfData]      = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [showRaw,     setShowRaw]     = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    if (!open || !artifact) return
    setLoading(true); setError(''); setWfData(null); setFileContent(null); setShowRaw(false)

    const load = async () => {
      try {
        // 1. Load the evidence file content
        let fc = null
        try {
          fc = await api.get(`/evidence/${encodeURIComponent(artifact.filename)}/content`)
          setFileContent(fc)
        } catch (_) {}

        // 2. Load full DB state if we have a run_id
        const runId = artifact.run_id || fc?.data?.run_id
        if (runId) {
          try {
            const wf = await api.get(`/workflows/${runId}/status`)
            setWfData(wf)
          } catch (_) {}
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [open, artifact?.filename]) // eslint-disable-line

  if (!open || !artifact) return null

  const data           = wfData || fileContent?.data || {}
  const outcome        = data.outcome || {}
  const agentRuns      = data.agent_runs || outcome.agent_runs || []
  const runId          = artifact.run_id || data.run_id
  const totalCost      = data.total_cost_usd   || outcome.total_cost_usd   || 0
  const totalTokensIn  = data.total_tokens_in  || outcome.total_tokens_in  || 0
  const totalTokensOut = data.total_tokens_out || outcome.total_tokens_out || 0
  const durationSec    = (data.started_at && data.completed_at)
    ? Math.round((new Date(data.completed_at) - new Date(data.started_at)) / 1000)
    : null

  const rawData = fileContent?.data || data
  const isEpiBinary = fileContent?.type === 'epi_binary'

  return (
    <Modal open onClose={onClose} title={`📄 ${artifact.filename}`} width="max-w-3xl">
      <div className="space-y-4 overflow-y-auto max-h-[75vh] pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <>
            {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap">
              {(data.status || artifact.status) && <Badge status={data.status || artifact.status} />}
              <TrustBadge type={artifact.type || fileContent?.type} />
              {runId && (
                <code className="text-[10px] text-gray-500 bg-gray-900 border border-gray-800 px-2 py-0.5 rounded">
                  {runId.slice(0, 8)}
                </code>
              )}
              {(artifact.workflow_name || data.workflow_name) && (
                <span className="text-sm text-gray-300">{artifact.workflow_name || data.workflow_name}</span>
              )}
              <span className="text-xs text-gray-600 ml-auto">{timeAgo(artifact.created)}</span>
            </div>

            {/* EPI binary notice */}
            {isEpiBinary && (
              <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-4 text-xs text-yellow-300">
                <span className="font-semibold">Binary EPI artifact</span> — signed by epi-recorder.
                {' '}View full audit trail with: <code className="bg-yellow-900/30 px-1 rounded">epi view evidence/{artifact.filename}</code>
              </div>
            )}

            {/* Cost / metrics ribbon */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-center">
                <div className="text-[10px] text-gray-500 mb-1">Total Cost</div>
                <div className="text-sm font-bold text-yellow-400">{fmtCost(totalCost)}</div>
              </div>
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-center">
                <div className="text-[10px] text-gray-500 mb-1">Tokens In</div>
                <div className="text-sm font-bold text-green-400">{fmtTokens(totalTokensIn)}</div>
              </div>
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-center">
                <div className="text-[10px] text-gray-500 mb-1">Tokens Out</div>
                <div className="text-sm font-bold text-blue-400">{fmtTokens(totalTokensOut)}</div>
              </div>
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-center">
                <div className="text-[10px] text-gray-500 mb-1">Duration</div>
                <div className="text-sm font-bold text-gray-300">
                  {durationSec != null ? (durationSec < 60 ? `${durationSec}s` : `${Math.floor(durationSec/60)}m ${durationSec%60}s`) : '—'}
                </div>
              </div>
            </div>

            {/* Situation summary */}
            {outcome.situation_summary && (
              <div className="bg-blue-900/10 border border-blue-800/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-blue-400 font-semibold uppercase tracking-wide">Situation Analysis</span>
                  {outcome.urgency && (
                    <span className="text-[10px] px-2 py-0.5 border rounded font-mono uppercase text-yellow-300 border-yellow-700/40 bg-yellow-900/20">
                      {outcome.urgency}
                    </span>
                  )}
                  {outcome.reasoning_confidence != null && (
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                      outcome.reasoning_confidence >= 0.75 ? 'text-green-400 bg-green-900/20' : 'text-yellow-400 bg-yellow-900/20'
                    }`}>
                      {Math.round(outcome.reasoning_confidence * 100)}% conf
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{outcome.situation_summary}</p>
              </div>
            )}

            {/* Per-agent breakdown */}
            {agentRuns.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-semibold">
                  Agent Pipeline — {agentRuns.length} agents
                </div>
                <div className="space-y-2">
                  {agentRuns.map((run, i) => (
                    <AgentDetailCard key={run.node_id || i} run={run} />
                  ))}
                </div>
              </div>
            )}

            {/* Actions taken */}
            {outcome.actions_summary?.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-semibold">
                  Actions Taken — {outcome.actions_summary.length}
                </div>
                <div className="space-y-1.5">
                  {outcome.actions_summary.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-gray-800/30 rounded-lg px-3 py-2">
                      <span className={a.status === 'success' ? 'text-green-400' : 'text-red-400'}>
                        {a.status === 'success' ? '✓' : '✗'}
                      </span>
                      <span className="text-gray-300 font-mono">{a.action}</span>
                      {a.account_id && (
                        <span className="text-gray-600 ml-auto truncate max-w-[100px]">{a.account_id}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verification summary */}
            {outcome.verification_summary && (outcome.verification_summary.approved_count > 0 || outcome.verification_summary.rejected_count > 0) && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-green-400">{outcome.verification_summary.approved_count}</div>
                  <div className="text-[10px] text-gray-500">Approved</div>
                </div>
                <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-red-400">{outcome.verification_summary.rejected_count}</div>
                  <div className="text-[10px] text-gray-500">Rejected</div>
                </div>
                <div className={`border rounded-xl p-3 text-center ${
                  outcome.verification_summary.passed ? 'bg-green-900/20 border-green-700/30' : 'bg-red-900/20 border-red-700/30'
                }`}>
                  <div className={`text-xl font-bold ${outcome.verification_summary.passed ? 'text-green-400' : 'text-red-400'}`}>
                    {outcome.verification_summary.passed ? 'PASS' : 'FAIL'}
                  </div>
                  <div className="text-[10px] text-gray-500">Judge</div>
                </div>
              </div>
            )}

            {/* Memory summary */}
            {outcome.memory_summary && (
              <div className="bg-purple-900/10 border border-purple-800/20 rounded-xl p-3">
                <div className="text-xs text-purple-400 font-semibold mb-1">Memory Agent — Learning Update</div>
                <p className="text-xs text-gray-400 leading-relaxed">{outcome.memory_summary}</p>
              </div>
            )}

            {/* Raw JSON toggle */}
            <div>
              <button
                onClick={() => setShowRaw(p => !p)}
                className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1.5 transition-colors"
              >
                <span>{showRaw ? '▲' : '▼'}</span>
                <span>Raw JSON ({artifact.size_kb} KB)</span>
              </button>
              {showRaw && (
                <div className="mt-2 bg-gray-950 border border-gray-800 rounded-xl p-4 font-mono text-[10px] text-green-400 overflow-auto max-h-72 whitespace-pre leading-relaxed">
                  {JSON.stringify(rawData, null, 2)}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-gray-800">
              {runId && (
                <Button size="sm" variant="success" onClick={() => { onClose(); navigate(`/workflows/${runId}`) }}>
                  View Full Run →
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default function EvidencePage() {
  const { api }                   = useAuth()
  const [artifacts, setArtifacts] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await api.get('/evidence')
      setArtifacts(Array.isArray(data) ? data : [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const filtered = artifacts.filter(a =>
    !search ||
    a.filename.toLowerCase().includes(search.toLowerCase()) ||
    (a.workflow_name || '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">🔒 Evidence Artifacts</h1>
          <p className="text-gray-400 text-xs mt-0.5">
            Tamper-evident audit trail · {artifacts.length} artifacts · Click any file to inspect
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={load}>↻ Refresh</Button>
      </div>

      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      <div className="bg-blue-900/10 border border-blue-800/30 rounded-xl p-4 text-xs text-blue-300">
        <span className="font-semibold">ℹ️ Evidence Files</span>
        {' '}Click any artifact to view per-agent breakdown, token costs, tool calls, and outputs.
        {' '}<code className="bg-blue-900/30 px-1 rounded">.epi</code> files are cryptographically signed audit trails.
        {' '}<code className="bg-blue-900/30 px-1 rounded">.json</code> files are workflow summaries.
      </div>

      <div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter by filename or workflow name…"
          className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <Card title="Evidence Files" noPad>
        {filtered.length === 0 ? (
          <div className="px-5 pb-5 pt-3">
            <EmptyState
              icon="🔒"
              title={search ? 'No files match' : 'No evidence artifacts yet'}
              description={search ? 'Try a different search term' : 'Evidence files appear after workflows run with EPI recorder enabled'}
            />
          </div>
        ) : (
          <div>
            {filtered.map((a, i) => (
              <div
                key={a.filename}
                className={`flex items-center gap-4 px-5 py-4 hover:bg-gray-800/30 cursor-pointer transition-colors ${
                  i < filtered.length - 1 ? 'border-b border-gray-800/50' : ''
                }`}
                onClick={() => setSelected(a)}
              >
                <div className="text-2xl flex-shrink-0">📄</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium font-mono truncate">{a.filename}</div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    {a.workflow_name && <span className="text-gray-400">{a.workflow_name}</span>}
                    <span>{a.size_kb} KB</span>
                    <span>·</span>
                    <span>{timeAgo(a.created)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {a.total_cost_usd !== undefined && a.total_cost_usd > 0 && (
                    <span className="text-xs text-yellow-400 font-mono">{fmtCost(a.total_cost_usd)}</span>
                  )}
                  {a.status && <Badge status={a.status} />}
                  <TrustBadge type={a.type} />
                  <Button size="xs" variant="ghost" onClick={e => { e.stopPropagation(); setSelected(a) }}>
                    Inspect →
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="CLI Commands">
        <div className="space-y-3 font-mono text-xs">
          <div>
            <div className="text-gray-500 mb-1"># Verify integrity</div>
            <div className="bg-gray-950 border border-gray-800 rounded px-3 py-2 text-green-400">epi verify evidence/{'<filename>'}.epi</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1"># Open full viewer in browser</div>
            <div className="bg-gray-950 border border-gray-800 rounded px-3 py-2 text-green-400">epi view evidence/{'<filename>'}.epi</div>
          </div>
        </div>
      </Card>

      <EvidenceDetailModal
        artifact={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        api={api}
      />
    </div>
  )
}