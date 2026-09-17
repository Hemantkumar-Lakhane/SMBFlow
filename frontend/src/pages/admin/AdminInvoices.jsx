// AdminInvoices — Platform Invoice Ledger
// Data from: GET /api/v1/admin/invoices
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileText, RefreshCw, Search, XCircle, ExternalLink,
  CheckCircle2, AlertCircle, Clock, Ban,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/ui'

const STATUS_META = {
  draft:           { label: 'Draft',          cls: 'bg-slate-100 text-slate-500',    icon: Clock       },
  open:            { label: 'Open',           cls: 'bg-blue-100 text-blue-700',      icon: AlertCircle },
  paid:            { label: 'Paid',           cls: 'bg-emerald-100 text-emerald-700',icon: CheckCircle2},
  void:            { label: 'Void',           cls: 'bg-slate-100 text-slate-400',    icon: Ban         },
  uncollectible:   { label: 'Uncollectible',  cls: 'bg-red-100 text-red-700',        icon: XCircle     },
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

function fmtUSD(v) {
  if (v === null || v === undefined) return '—'
  return `$${Number(v).toFixed(2)}`
}

export default function AdminInvoices() {
  const { api }    = useAuth()
  const navigate   = useNavigate()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await api.get('/admin/invoices?limit=500')
      setInvoices(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load invoices')
    } finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let list = invoices
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(inv =>
        inv.organization_name?.toLowerCase().includes(q) ||
        inv.invoice_number?.toLowerCase().includes(q)
      )
    }
    if (filterStatus !== 'all') list = list.filter(inv => inv.status === filterStatus)
    return list
  }, [invoices, search, filterStatus])

  const totals = useMemo(() => ({
    open:       invoices.filter(i => i.status === 'open').reduce((s, i) => s + Number(i.total_usd || 0), 0),
    paid:       invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_usd || 0), 0),
    openCount:  invoices.filter(i => i.status === 'open').length,
  }), [invoices])

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}
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
            { label: 'Open AR',     value: fmtUSD(totals.open),      sub: `${totals.openCount} invoice${totals.openCount !== 1 ? 's' : ''}`, cls: 'text-blue-600' },
            { label: 'Collected',   value: fmtUSD(totals.paid),       sub: `${invoices.filter(i => i.status === 'paid').length} paid`,       cls: 'text-emerald-600' },
            { label: 'Total',       value: invoices.length.toString(), sub: 'all time',                                                         cls: 'text-slate-700' },
          ].map(c => (
            <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className={`text-xl font-bold ${c.cls}`}>{c.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
              <p className="text-[11px] text-slate-400">{c.sub}</p>
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
          <input type="text" placeholder="Search by organization or invoice #…" value={search}
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
        <EmptyState icon={FileText} title="No invoices found"
          description={search || filterStatus !== 'all' ? 'Try a different filter.' : 'Invoices will appear here once billing periods close.'} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['Invoice #', 'Organization', 'Status', 'Subtotal', 'Tax', 'Total', 'Due Date', 'Paid At'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs text-slate-700">{inv.invoice_number || inv.id?.slice(0, 8)}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => navigate(`/admin/organizations/${inv.organization_id}`)}
                      className="text-sm font-semibold text-blue-600 hover:underline text-left"
                    >
                      {inv.organization_name || 'Unknown'}
                    </button>
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={inv.status} /></td>
                  <td className="px-5 py-3.5 text-xs text-slate-600 font-mono">{fmtUSD(inv.subtotal_usd)}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 font-mono">{fmtUSD(inv.tax_usd)}</td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-slate-800 font-mono">{fmtUSD(inv.total_usd)}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">{fmt(inv.due_date)}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">{fmt(inv.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
