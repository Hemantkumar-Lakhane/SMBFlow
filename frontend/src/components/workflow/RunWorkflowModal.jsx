// frontend/src/components/workflow/RunWorkflowModal.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, X, Mail, Sparkles, CheckCircle2, AlertCircle, RefreshCw, Sliders, Layers } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Modal, Button, Badge, Spinner, Alert } from '../ui'

export default function RunWorkflowModal({
  open,
  onClose,
  workflowName = 'email_summarizer',
  displayName = 'Email Summarizer',
  onSuccess,
}) {
  const navigate = useNavigate()
  const { api, user } = useAuth()
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [triggerInfo, setTriggerInfo] = useState(null)
  const [limit, setLimit] = useState(40)
  const [isAll, setIsAll] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState('')
  const [successRun, setSuccessRun] = useState(null)

  useEffect(() => {
    if (!open) {
      setError('')
      setSuccessRun(null)
      return
    }

    let isMounted = true
    setLoadingInfo(true)
    setError('')
    setSuccessRun(null)

    async function fetchInfo() {
      try {
        const info = await api.get(`/workflows/${workflowName}/trigger-info`)
        if (isMounted) {
          setTriggerInfo(info)
          const avail = info.available_messages_count || 40
          setLimit(avail)
        }
      } catch (err) {
        console.warn('Could not fetch trigger-info, using fallback defaults', err)
        if (isMounted) {
          setTriggerInfo({
            workflow_name: workflowName,
            display_name: displayName,
            trigger_type: 'New Email',
            source: 'Synthetic Inbox',
            available_messages_count: 40,
            status: 'active',
          })
          setLimit(40)
        }
      } finally {
        if (isMounted) setLoadingInfo(false)
      }
    }

    fetchInfo()
    return () => { isMounted = false }
  }, [open, workflowName, displayName, api])

  const handleRun = async () => {
    setExecuting(true)
    setError('')
    try {
      const payload = {
        workflow_name: workflowName,
        tenant_id: user?.organization_id || user?.tenant_id || undefined,
        trigger_signal: {
          source: 'manual_ui',
          limit: isAll ? (triggerInfo?.available_messages_count || 40) : parseInt(limit, 10) || 10,
        },
      }

      const res = await api.post('/workflows/trigger', payload)
      setSuccessRun(res)
      if (onSuccess) {
        onSuccess(res)
      }
    } catch (err) {
      const detail = err?.response?.data?.detail
      let msg = 'Failed to trigger workflow'
      if (typeof detail === 'string') {
        msg = detail
      } else if (detail?.message) {
        msg = detail.message
      } else if (err?.message) {
        msg = err.message
      }
      setError(msg)
    } finally {
      setExecuting(false)
    }
  }

  const availCount = triggerInfo?.available_messages_count ?? 40
  const isEmail = workflowName.includes('email') || triggerInfo?.trigger_type === 'New Email'

  return (
    <Modal
      open={open}
      onClose={() => !executing && onClose()}
      title="Run Workflow"
      subtitle={triggerInfo?.display_name || displayName}
      width="max-w-lg"
    >
      <div className="space-y-5">
        {/* Success Banner */}
        {successRun ? (
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2.5 text-green-800 font-semibold text-sm">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span>Workflow Successfully Queued!</span>
            </div>
            <p className="text-xs text-green-700">
              Run ID: <code className="font-mono font-semibold">{successRun.run_id}</code>
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  onClose()
                  navigate(`/workflows/${successRun.run_id}`)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                View Live Run <Play className="w-3 h-3" />
              </button>
              <button
                onClick={onClose}
                className="px-3 py-1.5 border border-green-300 hover:bg-green-100 text-green-800 rounded-lg text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <Alert type="danger" dismissible onDismiss={() => setError('')}>
                {error}
              </Alert>
            )}

            {/* Workflow summary card */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{triggerInfo?.display_name || displayName}</h4>
                    <p className="text-[11px] text-slate-500 font-mono">{workflowName}</p>
                  </div>
                </div>
                <Badge variant="success">Active</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Trigger Mode</span>
                  <span className="font-semibold text-slate-700 flex items-center gap-1 mt-0.5">
                    <Play className="w-3 h-3 text-blue-600" /> Manual Run
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Data Source</span>
                  <span className="font-semibold text-slate-700 flex items-center gap-1 mt-0.5">
                    <Layers className="w-3 h-3 text-purple-600" /> {triggerInfo?.source || 'Synthetic Inbox'}
                  </span>
                </div>
              </div>
            </div>

            {/* Messages / Input Dataset Info */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-blue-600" />
                    Available Fixture Messages
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Live count from runtime environment data store
                  </p>
                </div>
                {loadingInfo ? (
                  <Spinner className="w-4 h-4 text-blue-600" />
                ) : (
                  <span className="text-sm font-bold text-blue-600 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg">
                    {availCount} {availCount === 1 ? 'message' : 'messages'}
                  </span>
                )}
              </div>

              {/* Message Limit Toggle / Input */}
              {isEmail && availCount > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isAll}
                        onChange={(e) => {
                          setIsAll(e.target.checked)
                          if (e.target.checked) setLimit(availCount)
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-slate-700 font-medium">Process all available ({availCount})</span>
                    </label>
                  </div>

                  {!isAll && (
                    <div className="flex items-center gap-3 pt-1">
                      <label className="text-xs text-slate-500 whitespace-nowrap">Limit batch size:</label>
                      <input
                        type="number"
                        min={1}
                        max={availCount}
                        value={limit}
                        onChange={(e) => setLimit(Math.max(1, Math.min(availCount, parseInt(e.target.value, 10) || 1)))}
                        className="w-24 px-2.5 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-[11px] text-slate-400">emails</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={executing}
              >
                Cancel
              </Button>
              <Button
                variant="gradient"
                size="sm"
                onClick={handleRun}
                loading={executing}
                icon={<Play className="w-3.5 h-3.5 fill-white" />}
              >
                Run Workflow
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
