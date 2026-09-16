import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Building2, Search, Plus, RefreshCw, Users, GitBranch,
  DollarSign, CheckCircle2, X, AlertCircle, Loader2, Globe, Shield
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo, fmtCost } from '../../utils/helpers'

function AddOrganizationModal({ open, onClose, api, onDone }) {
  const [form, setForm] = useState({ name: '', industry: 'saas' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Organization name is required.')
      return
    }
    setLoading(true)
    setError('')
    setSuccessMsg('')
    try {
      await api.post('/tenants', {
        name: form.name.trim(),
        industry: form.industry,
        config: {
          client_name: form.name.trim(),
          industry: form.industry,
        },
      })
      setSuccessMsg(`Organization "${form.name.trim()}" onboarded successfully!`)
      setTimeout(() => {
        onDone()
        onClose()
        setForm({ name: '', industry: 'saas' })
        setSuccessMsg('')
      }, 1000)
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to onboard organization.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 p-6">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 size={18} />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Onboard Organization</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <CheckCircle2 size={15} className="text-green-600 shrink-0 mt-0.5" />
            <p className="text-xs text-green-700">{successMsg}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Organization Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Acme Health Corp"
              required
              autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Industry Sector</label>
            <select
              value={form.industry}
              onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="saas">SaaS & Software</option>
              <option value="medical_tourism">Medical Tourism & Healthcare</option>
              <option value="e_commerce">E-Commerce & Retail</option>
              <option value="financial_services">Financial Services</option>
              <option value="agency">Agency & Consulting</option>
              <option value="general">General Enterprise</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Onboard Organization
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminOrganizations() {
  const { api } = useAuth()
  const [tenants, setTenants] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, godRes] = await Promise.all([
        api.get('/tenants').catch(() => null),
        api.get('/admin/god-view').catch(() => null),
      ])

      const rawList = Array.isArray(tRes) ? tRes : godRes?.tenants || []
      
      // Enrich tenant list with godView stats if tenant endpoint is minimal
      const godTenants = godRes?.tenants || []
      const godRuns = godRes?.all_workflows || []
      const godUsers = godRes?.users || []

      const enriched = rawList.map(t => {
        const tId = str(t.id)
        const matchedGod = godTenants.find(g => str(g.id) === tId)
        const tRuns = godRuns.filter(r => str(r.tenant_id) === tId)
        const tUsers = godUsers.filter(u => str(u.tenant_id) === tId)
        const tCost = tRuns.reduce((sum, r) => sum + (r.total_cost_usd || 0), 0)

        return {
          id: tId,
          name: t.name || matchedGod?.name || 'Unnamed Org',
          industry: t.industry || matchedGod?.industry || 'saas',
          active: t.active !== false,
          user_count: t.user_count ?? tUsers.length,
          run_count: t.run_count ?? tRuns.length,
          total_cost_usd: t.total_cost_usd ?? tCost,
          created_at: t.created_at || matchedGod?.created_at,
        }
      })

      setTenants(enriched)
    } finally {
      setLoading(false)
    }
  }, [api])

  function str(val) {
    return val ? String(val) : ''
  }

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    return tenants.filter(t => {
      const matchSearch = !search ||
        t.name?.toLowerCase().includes(search.toLowerCase()) ||
        t.industry?.toLowerCase().includes(search.toLowerCase())
      const matchStatus =
        statusFilter === 'All statuses' ||
        (statusFilter === 'Active' && t.active) ||
        (statusFilter === 'Inactive' && !t.active)
      return matchSearch && matchStatus
    })
  }, [tenants, search, statusFilter])

  const totalOrgs = tenants.length
  const activeOrgs = tenants.filter(t => t.active).length
  const totalUsers = tenants.reduce((sum, t) => sum + (t.user_count || 0), 0)
  const totalRuns = tenants.reduce((sum, t) => sum + (t.run_count || 0), 0)

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <AddOrganizationModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        api={api}
        onDone={load}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations & Tenants</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage customer organizations, their users, workflow execution capacity, and platform billing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 border border-gray-200 bg-white rounded-lg text-gray-500 hover:bg-gray-50 transition-colors shadow-sm"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Organization
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Orgs</span>
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{loading ? '...' : totalOrgs}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Tenants</span>
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">{loading ? '...' : activeOrgs}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Org Users</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-600">{loading ? '...' : totalUsers}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Workflow Runs</span>
            <GitBranch className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-indigo-600">{loading ? '...' : totalRuns}</p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search organizations or industry..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All statuses">All statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <span className="text-sm text-gray-400">{filtered.length} records</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600 mr-2" /> Loading organizations…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Building2 className="w-10 h-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No organizations found</p>
            <p className="text-xs text-gray-400 text-center max-w-xs">
              No organization records match your filter. Use the button above to onboard a new organization.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['ORGANIZATION NAME', 'INDUSTRY', 'USERS', 'WORKFLOW RUNS', 'TOTAL SPEND', 'STATUS', 'CREATED'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                        {t.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{t.name}</p>
                        <p className="text-[11px] font-mono text-gray-400">ID: {t.id.slice(0, 12)}...</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-600 capitalize font-medium">
                    {t.industry ? t.industry.replace('_', ' ') : 'SaaS'}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-semibold text-gray-700">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      <Users className="w-3 h-3 text-slate-500" />
                      {t.user_count ?? 0}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs font-semibold text-gray-700">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                      <GitBranch className="w-3 h-3 text-indigo-500" />
                      {t.run_count ?? 0}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs font-semibold text-gray-800">
                    {t.total_cost_usd > 0 ? fmtCost(t.total_cost_usd) : '$0.00'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                      t.active
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                      {t.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-400">
                    {t.created_at ? timeAgo(t.created_at) : 'Active'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
