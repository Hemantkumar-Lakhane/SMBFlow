// AdminSubscriptions — Organization Subscriptions
// Data from: GET /api/v1/admin/subscriptions
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ReceiptText, RefreshCw, Search, XCircle, ChevronRight,
  AlertCircle, CheckCircle2, Clock, PauseCircle,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { EmptyState, Modal, Button, Select } from '../../components/ui'

const STATUS_META = {
  active:     { label: 'Active',     cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  trialing:   { label: 'Trial',      cls: 'bg-blue-100 text-blue-700',       icon: Clock },
  past_due:   { label: 'Past Due',   cls: 'bg-red-100 text-red-700',         icon: AlertCircle },
  cancelled:  { label: 'Cancelled',  cls: 'bg-slate-100 text-slate-500',     icon: XCircle },
  paused:     { label: 'Paused',     cls: 'bg-yellow-100 text-yellow-700',   icon: PauseCircle },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, cls: 'bg-slate-100 text-slate-500', icon: AlertCircle }
  const Icon = m.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.cls}`}>
      <Icon size={10} />{m.label}
    </span>
  )
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Edit subscription modal ───────────────────────────────────────────────────
function EditSubModal({ open, onClose, api, sub, plans, onDone }) {
  const [form, setForm] = useState({ status: '', billing_cycle: '', plan_id: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (sub) {
      setForm({
        status:        sub.status        || 'active',
        billing_cycle: sub.billing_cycle || 'monthly',
        plan_id:       sub.plan_id       || '',
      })
    }
    setError('')
  }, [sub, open])

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await api.patch(`/admin/subscriptions/${sub.organization_id}`, form)
      onDone(); onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Update failed')
    } finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose}
      title={`Edit Subscription — ${sub?.organization_name || ''}`}
      subtitle="Update plan, status, or billing cycle"
      width="max-w-md"
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <XCircle size={14} />{error}
          </div>
        )}
        <Select label="Plan" value={form.plan_id} onChange={e => setForm(f => ({ ...f, plan_id: e.target.value }))}
          options={[{ value: '', label: 'Keep current plan' }, ...plans.map(p => ({ value: p.id, label: p.name }))]} />
        <Select label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
          options={Object.entries(STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))} />
        <Select label="Billing Cycle" value={form.billing_cycle} onChange={e => setForm(f => ({ ...f, billing_cycle: e.target.value }))}
          options={[{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }]} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={loading} type="submit">Save Changes</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminSubscriptions() {
  const { api } = useAuth()
  const navigate = useNavigate()
  const [subs, setSubs]     = useState([])
  const [plans, setPlans]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [editSub, setEditSub] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, p] = await Promise.all([
        api.get('/admin/subscriptions'),
        api.get('/admin/plans').catch(() => []),
      ])
      setSubs(Array.isArray(s) ? s : [])
      setPlans(Array.isArray(p) ? p : [])
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load subscriptions')
    } finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let list = subs
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.organization_name?.toLowerCase().includes(q) ||
        s.plan_name?.toLowerCase().includes(q) ||
        s.plan_slug?.toLowerCase().includes(q)
      )
    }
    if (filterStatus !== 'all') list = list.filter(s => s.status === filterStatus)
    return list
  }, [subs, search, filterStatus])

  const counts = useMemo(() => ({
    active:   subs.filter(s => s.status === 'active').length,
    trialing: subs.filter(s => s.status === 'trialing').length,
    past_due: subs.filter(s => s.status === 'past_due').length,
  }), [subs])

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Subscriptions</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${subs.length} subscription${subs.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary cards */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Active',   value: counts.active,   cls: 'text-emerald-600' },
            { label: 'Trialing', value: counts.trialing, cls: 'text-blue-600'    },
            { label: 'Past Due', value: counts.past_due, cls: 'text-red-600'     },
          ].map(c => (
            <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${c.cls}`}>{c.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle size={15} className="shrink-0" />{error}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Search by organization or plan…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="all">All statuses</option>
          {Object.entries(STATUS_META).map(([v, m]) => (
            <option key={v} value={v}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No subscriptions found"
          description={search || filterStatus !== 'all' ? 'Try a different filter.' : 'No subscriptions yet.'} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['Organization', 'Plan', 'Status', 'Cycle', 'Period End', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => navigate(`/admin/organizations/${s.organization_id}`)}
                      className="text-sm font-semibold text-blue-600 hover:underline text-left"
                    >
                      {s.organization_name || 'Unknown'}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-700">{s.plan_name || s.plan_slug || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 capitalize">{s.billing_cycle}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">{fmt(s.current_period_end)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditSub(s)}
                        className="px-2.5 py-1 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => navigate(`/admin/organizations/${s.organization_id}`)}
                        className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                        title="View org"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditSubModal
        open={!!editSub}
        onClose={() => setEditSub(null)}
        api={api}
        sub={editSub}
        plans={plans}
        onDone={load}
      />
    </div>
  )
}
