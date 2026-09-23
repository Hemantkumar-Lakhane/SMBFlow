// AdminOrganizations — platform customer management
// Data from /api/v1/admin/organizations
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Search, Plus, RefreshCw, Users, Workflow,
  CheckCircle2, XCircle, ChevronRight, Clock,
  Power, PowerOff, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Modal, Button, Input, Select, EmptyState } from '../../components/ui'

// ── helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function trialDaysLeft(trial_ends_at) {
  if (!trial_ends_at) return null
  const diff = new Date(trial_ends_at).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86400000))
}

function planBadge(slug) {
  const map = {
    free:       'bg-slate-100 text-slate-600',
    starter:    'bg-blue-100 text-blue-700',
    growth:     'bg-purple-100 text-purple-700',
    enterprise: 'bg-orange-100 text-orange-700',
  }
  return map[slug] || 'bg-slate-100 text-slate-600'
}

function statusBadge(active) {
  return active
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-red-100 text-red-700'
}

const INDUSTRY_OPTIONS = [
  { value: 'saas',        label: 'SaaS' },
  { value: 'healthcare',  label: 'Healthcare' },
  { value: 'finance',     label: 'Finance' },
  { value: 'retail',      label: 'Retail' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'marketing',   label: 'Marketing Agency' },
  { value: 'general',     label: 'General' },
]

// ── Trial badge ───────────────────────────────────────────────────────────────
function TrialBadge({ sub_status, trial_ends_at }) {
  const effective = sub_status
  if (effective === 'trial_expired') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
        <AlertTriangle size={9} /> Trial expired
      </span>
    )
  }
  if (effective === 'trialing' && trial_ends_at) {
    const days = trialDaysLeft(trial_ends_at)
    const urgent = days <= 3
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${urgent ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
        <Clock size={9} /> {days}d trial
      </span>
    )
  }
  return null
}

// ── Create Org modal ──────────────────────────────────────────────────────────
function CreateOrgModal({ open, onClose, api, plans, catalog, onDone }) {
  const [form, setForm] = useState({
    name: '', industry: 'saas', plan_slug: 'free',
    billing_cycle: 'monthly', with_trial: false, trial_days: 14,
    owner_email: '', owner_name: '',
    workflow_keys: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Reset on open
  useEffect(() => {
    if (open) {
      setForm({ name: '', industry: 'saas', plan_slug: 'free', billing_cycle: 'monthly', with_trial: false, trial_days: 14, owner_email: '', owner_name: '', workflow_keys: [] })
      setError('')
    }
  }, [open])

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  function toggleWorkflow(key) {
    setForm(f => ({
      ...f,
      workflow_keys: f.workflow_keys.includes(key)
        ? f.workflow_keys.filter(k => k !== key)
        : [...f.workflow_keys, key],
    }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Organization name is required.'); return }
    setLoading(true); setError('')
    try {
      await api.post('/admin/organizations', {
        name:          form.name.trim(),
        industry:      form.industry,
        plan_slug:     form.plan_slug,
        billing_cycle: form.billing_cycle,
        with_trial:    form.with_trial,
        trial_days:    form.with_trial ? (form.trial_days || 14) : undefined,
        owner_email:   form.owner_email || undefined,
        owner_name:    form.owner_name  || undefined,
        workflow_keys: form.workflow_keys,
      })
      onDone()
      onClose()
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  // Filter catalog to workflows entitled by the selected plan
  const entitledWorkflows = useMemo(() => {
    const plan = plans.find(p => p.slug === form.plan_slug)
    if (!plan || !plan.entitlements?.length) return catalog.slice(0, 20)
    return catalog.filter(w => plan.entitlements.includes(w.id))
  }, [plans, catalog, form.plan_slug])

  return (
    <Modal open={open} onClose={onClose} title="Create Organization" subtitle="Set up a new customer workspace" width="max-w-xl">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <XCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Organization Name"
            required
            placeholder="Acme Consulting"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            className="col-span-2"
          />
          <Select
            label="Industry"
            value={form.industry}
            onChange={e => set('industry', e.target.value)}
            options={INDUSTRY_OPTIONS}
          />
          <Select
            label="Plan"
            value={form.plan_slug}
            onChange={e => set('plan_slug', e.target.value)}
            options={plans.map(p => ({
              value: p.slug,
              label: `${p.name}${p.monthly_price_usd ? ` — $${p.monthly_price_usd}/mo` : ''}`,
            }))}
          />
          <Select
            label="Billing Cycle"
            value={form.billing_cycle}
            onChange={e => set('billing_cycle', e.target.value)}
            options={[{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual (save ~17%)' }]}
          />
        </div>

        {/* 14-day Trial toggle */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
          <div>
            <p className="text-sm font-medium text-blue-900">Start 14-day trial</p>
            <p className="text-xs text-blue-600 mt-0.5">Subscription status will be <code className="bg-blue-100 px-1 rounded">trialing</code> until the trial ends.</p>
          </div>
          <button
            type="button"
            onClick={() => set('with_trial', !form.with_trial)}
            className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${form.with_trial ? 'bg-blue-600' : 'bg-slate-300'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.with_trial ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {form.with_trial && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-700 font-medium">Trial duration (days)</label>
            <input
              type="number" min={1} max={90} value={form.trial_days}
              onChange={e => set('trial_days', parseInt(e.target.value) || 14)}
              className="w-20 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        )}

        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Owner (optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Owner Email"
              type="email"
              placeholder="owner@company.com"
              value={form.owner_email}
              onChange={e => set('owner_email', e.target.value)}
            />
            <Input
              label="Owner Name"
              placeholder="Jane Smith"
              value={form.owner_name}
              onChange={e => set('owner_name', e.target.value)}
            />
          </div>
        </div>

        {entitledWorkflows.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Assign Workflows <span className="text-slate-400 font-normal">(available on {form.plan_slug} plan)</span>
            </p>
            <div className="max-h-40 overflow-y-auto grid grid-cols-2 gap-1.5">
              {entitledWorkflows.map(wf => (
                <label key={wf.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={form.workflow_keys.includes(wf.key)}
                    onChange={() => toggleWorkflow(wf.key)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{wf.name}</p>
                    <p className="text-[11px] text-slate-400 capitalize">{wf.category}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" type="submit" loading={loading}>Create Organization</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Suspend/activate action ───────────────────────────────────────────────────
function OrgActions({ org, api, onDone }) {
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    try {
      const ep = org.active
        ? `/admin/organizations/${org.id}/suspend`
        : `/admin/organizations/${org.id}/activate`
      await api.post(ep, {})
      onDone()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); toggle() }}
      disabled={loading}
      title={org.active ? 'Suspend organization' : 'Activate organization'}
      className={`p-1.5 rounded-lg transition-colors ${
        org.active
          ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
          : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
      } disabled:opacity-40`}
    >
      {org.active ? <PowerOff size={14} /> : <Power size={14} />}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminOrganizations() {
  const { api }  = useAuth()
  const navigate = useNavigate()

  const [orgs, setOrgs]       = useState([])
  const [plans, setPlans]     = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')
  const [filterStatus, setFilterStatus]   = useState('all')
  const [filterPlan, setFilterPlan]       = useState('all')
  const [filterTrial, setFilterTrial]     = useState('all')
  const [showCreate, setShowCreate]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [orgData, planData, catalogData] = await Promise.all([
        api.get('/admin/organizations'),
        api.get('/admin/plans').catch(() => []),
        api.get('/admin/workflows/catalog').catch(() => []),
      ])
      setOrgs(Array.isArray(orgData) ? orgData : [])
      setPlans(Array.isArray(planData) ? planData : [])
      setCatalog(Array.isArray(catalogData) ? catalogData : [])
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let list = orgs
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(o =>
        o.name?.toLowerCase().includes(q) ||
        o.industry?.toLowerCase().includes(q)
      )
    }
    if (filterStatus !== 'all') {
      list = list.filter(o => filterStatus === 'active' ? o.active : !o.active)
    }
    if (filterPlan !== 'all') {
      list = list.filter(o => o.plan_slug === filterPlan)
    }
    if (filterTrial === 'trialing') {
      list = list.filter(o => o.subscription_status === 'trialing')
    } else if (filterTrial === 'trial_expired') {
      list = list.filter(o => o.effective_subscription_status === 'trial_expired')
    }
    return list
  }, [orgs, search, filterStatus, filterPlan, filterTrial])

  // Counts for quick stats
  const trialingCount = orgs.filter(o => o.subscription_status === 'trialing').length
  const expiredCount  = orgs.filter(o => o.effective_subscription_status === 'trial_expired').length

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Organizations</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${orgs.length} organization${orgs.length !== 1 ? 's' : ''} on platform`}
            {trialingCount > 0 && (
              <span className="ml-2 text-blue-600 font-medium">· {trialingCount} trialing</span>
            )}
            {expiredCount > 0 && (
              <span className="ml-2 text-red-500 font-medium">· {expiredCount} trial expired</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Create Organization
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search organizations…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="all">All plans</option>
          {plans.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>
        <select value={filterTrial} onChange={e => setFilterTrial(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="all">All lifecycle</option>
          <option value="trialing">Trialing</option>
          <option value="trial_expired">Trial Expired</option>
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle size={15} className="shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No organizations found"
            description={search ? 'Try a different search term' : 'Create your first organization to get started.'}
            action={
              !search && (
                <Button size="sm" icon={<Plus size={13} />} onClick={() => setShowCreate(true)}>
                  Create Organization
                </Button>
              )
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['Organization', 'Status', 'Plan / Trial', 'Users', 'Workflows', 'Runs', 'Spend', 'Last Activity', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(org => (
                <tr
                  key={org.id}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/organizations/${org.id}`)}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                        <span className="text-blue-700 text-xs font-bold">
                          {(org.name || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{org.name}</p>
                        <p className="text-xs text-slate-400 capitalize">{org.industry}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusBadge(org.active)}`}>
                      {org.active
                        ? <><CheckCircle2 size={10} />Active</>
                        : <><XCircle size={10} />Suspended</>}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase w-fit ${planBadge(org.plan_slug)}`}>
                        {org.plan_name || org.plan_slug || '—'}
                      </span>
                      <TrialBadge
                        sub_status={org.effective_subscription_status || org.subscription_status}
                        trial_ends_at={org.trial_ends_at}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 text-slate-600">
                      <Users size={12} className="text-slate-400" />
                      {org.user_count ?? 0}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 text-slate-600">
                      <Workflow size={12} className="text-slate-400" />
                      {org.assigned_workflows ?? 0}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{org.run_count ?? 0}</td>
                  <td className="px-4 py-3.5 text-slate-600">
                    {org.total_spend_usd !== null && org.total_spend_usd !== undefined
                      ? `$${Number(org.total_spend_usd).toFixed(2)}`
                      : <span className="text-slate-400 italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs whitespace-nowrap">
                    {timeAgo(org.last_activity)}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <OrgActions org={org} api={api} onDone={load} />
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/admin/organizations/${org.id}`) }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateOrgModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        api={api}
        plans={plans}
        catalog={catalog}
        onDone={load}
      />
    </div>
  )
}
