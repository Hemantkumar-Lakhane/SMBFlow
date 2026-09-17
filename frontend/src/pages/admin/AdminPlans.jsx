// AdminPlans — Plans & Pricing
// Manage billing plans and their workflow entitlements.
// Data from: GET /api/v1/admin/plans, GET /api/v1/admin/workflows/catalog
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  CreditCard, Plus, RefreshCw, Edit2, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Tag,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Modal, Button, Input, Select, EmptyState } from '../../components/ui'

const STATUS_COLORS = {
  active:   'bg-emerald-100 text-emerald-700',
  archived: 'bg-slate-100 text-slate-500',
  hidden:   'bg-yellow-100 text-yellow-700',
}

// ── Plan form modal ───────────────────────────────────────────────────────────
function PlanModal({ open, onClose, api, existing, catalog, onDone }) {
  const isEdit = !!existing
  const blank = {
    name: '', slug: '', description: '',
    monthly_price_usd: '0', annual_price_usd: '0',
    included_workflow_runs: '0', included_ai_tokens: '0',
    included_image_gens: '0', included_users: '1',
    max_workflow_runs: '0', max_users: '0',
    overage_run_price_usd: '0', overage_token_price_usd: '0',
    overage_image_price_usd: '0',
    status: 'active', is_public: true,
  }
  const [form, setForm]       = useState(blank)
  const [entitlements, setEnt] = useState([])   // workflow ids
  const [loading, setLoading]  = useState(false)
  const [error, setError]      = useState('')

  useEffect(() => {
    if (existing) {
      setForm({
        name:                    existing.name              || '',
        slug:                    existing.slug              || '',
        description:             existing.description       || '',
        monthly_price_usd:       String(existing.monthly_price_usd  ?? 0),
        annual_price_usd:        String(existing.annual_price_usd   ?? 0),
        included_workflow_runs:  String(existing.included_workflow_runs  ?? 0),
        included_ai_tokens:      String(existing.included_ai_tokens      ?? 0),
        included_image_gens:     String(existing.included_image_gens     ?? 0),
        included_users:          String(existing.included_users           ?? 1),
        max_workflow_runs:       String(existing.max_workflow_runs        ?? 0),
        max_users:               String(existing.max_users               ?? 0),
        overage_run_price_usd:   String(existing.overage_run_price_usd   ?? 0),
        overage_token_price_usd: String(existing.overage_token_price_usd ?? 0),
        overage_image_price_usd: String(existing.overage_image_price_usd ?? 0),
        status:                  existing.status    || 'active',
        is_public:               existing.is_public ?? true,
      })
      setEnt(existing.entitlements || [])
    } else {
      setForm(blank)
      setEnt([])
    }
    setError('')
  }, [existing, open])

  function set(f, v) { setForm(s => ({ ...s, [f]: v })) }

  function toggleEnt(id) {
    setEnt(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id])
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.slug.trim()) { setError('Name and slug are required'); return }
    setLoading(true); setError('')
    try {
      const num = v => parseFloat(v) || 0
      const int = v => parseInt(v)  || 0
      const payload = {
        name:                    form.name.trim(),
        slug:                    form.slug.trim().toLowerCase().replace(/\s+/g, '-'),
        description:             form.description.trim() || undefined,
        monthly_price_usd:       num(form.monthly_price_usd),
        annual_price_usd:        num(form.annual_price_usd),
        included_workflow_runs:  int(form.included_workflow_runs),
        included_ai_tokens:      int(form.included_ai_tokens),
        included_image_gens:     int(form.included_image_gens),
        included_users:          int(form.included_users),
        max_workflow_runs:       int(form.max_workflow_runs),
        max_users:               int(form.max_users),
        overage_run_price_usd:   num(form.overage_run_price_usd),
        overage_token_price_usd: num(form.overage_token_price_usd),
        overage_image_price_usd: num(form.overage_image_price_usd),
        status:                  form.status,
        is_public:               form.is_public,
      }
      let planId
      if (isEdit) {
        await api.patch(`/admin/plans/${existing.id}`, payload)
        planId = existing.id
      } else {
        const created = await api.post('/admin/plans', payload)
        planId = created.id
      }
      // Update entitlements
      await api.put(`/admin/plans/${planId}/entitlements`, { workflow_ids: entitlements })
      onDone(); onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Save failed')
    } finally { setLoading(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit Plan: ${existing?.name}` : 'New Billing Plan'}
      subtitle="Configure pricing, limits, and included workflows"
      width="max-w-2xl"
    >
      <form onSubmit={submit} className="flex flex-col gap-5">
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <XCircle size={14} className="shrink-0" />{error}
          </div>
        )}

        {/* Identity */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Plan Identity</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Plan Name" required value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="Starter" />
            <Input label="Slug" required value={form.slug}
              onChange={e => set('slug', e.target.value)} placeholder="starter"
              hint="Lowercase, hyphens. Used in API." />
            <Input label="Description" value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="For small teams getting started"
              className="col-span-2" />
            <Select label="Status" value={form.status}
              onChange={e => set('status', e.target.value)}
              options={[
                { value: 'active',   label: 'Active'   },
                { value: 'hidden',   label: 'Hidden'   },
                { value: 'archived', label: 'Archived' },
              ]} />
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="is_public" checked={form.is_public}
                onChange={e => set('is_public', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded" />
              <label htmlFor="is_public" className="text-sm text-slate-700">Public (visible on pricing page)</label>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Pricing (USD)</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Monthly Price" type="number" step="0.01" min="0"
              value={form.monthly_price_usd} onChange={e => set('monthly_price_usd', e.target.value)} />
            <Input label="Annual Price" type="number" step="0.01" min="0"
              value={form.annual_price_usd} onChange={e => set('annual_price_usd', e.target.value)} />
          </div>
        </div>

        {/* Included */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Included Quotas</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Workflow Runs" type="number" min="0"
              value={form.included_workflow_runs} onChange={e => set('included_workflow_runs', e.target.value)} />
            <Input label="AI Tokens" type="number" min="0"
              value={form.included_ai_tokens} onChange={e => set('included_ai_tokens', e.target.value)} />
            <Input label="Image Generations" type="number" min="0"
              value={form.included_image_gens} onChange={e => set('included_image_gens', e.target.value)} />
            <Input label="Users" type="number" min="1"
              value={form.included_users} onChange={e => set('included_users', e.target.value)} />
          </div>
        </div>

        {/* Limits */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Hard Limits <span className="font-normal normal-case">(0 = unlimited)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Max Workflow Runs" type="number" min="0"
              value={form.max_workflow_runs} onChange={e => set('max_workflow_runs', e.target.value)} />
            <Input label="Max Users" type="number" min="0"
              value={form.max_users} onChange={e => set('max_users', e.target.value)} />
          </div>
        </div>

        {/* Overages */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Overage Pricing (USD)</p>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Per Run" type="number" step="0.000001" min="0"
              value={form.overage_run_price_usd} onChange={e => set('overage_run_price_usd', e.target.value)} />
            <Input label="Per 1K Tokens" type="number" step="0.000000001" min="0"
              value={form.overage_token_price_usd} onChange={e => set('overage_token_price_usd', e.target.value)} />
            <Input label="Per Image" type="number" step="0.000001" min="0"
              value={form.overage_image_price_usd} onChange={e => set('overage_image_price_usd', e.target.value)} />
          </div>
        </div>

        {/* Workflow entitlements */}
        {catalog.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Included Workflows <span className="font-normal normal-case text-slate-400">({entitlements.length} selected)</span>
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {catalog.filter(w => w.active).map(w => (
                <label key={w.id}
                  className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    entitlements.includes(w.id)
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <input type="checkbox" checked={entitlements.includes(w.id)}
                    onChange={() => toggleEnt(w.id)}
                    className="w-3.5 h-3.5 text-blue-600 rounded mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 leading-tight">{w.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{w.key}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={loading} type="submit">
            {isEdit ? 'Save Changes' : 'Create Plan'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Plan card ─────────────────────────────────────────────────────────────────
function PlanCard({ plan, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  const price = plan.monthly_price_usd
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900">{plan.name}</h3>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[plan.status] || 'bg-slate-100 text-slate-500'}`}>
                {plan.status}
              </span>
              {!plan.is_public && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">private</span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono">{plan.slug}</p>
            {plan.description && <p className="text-xs text-slate-500 mt-1">{plan.description}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-slate-900">
              {Number(price) === 0 ? 'Free' : `$${Number(price).toFixed(2)}`}
            </p>
            {Number(price) > 0 && <p className="text-[11px] text-slate-400">/month</p>}
          </div>
        </div>

        {/* Quotas row */}
        <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
          <span>{plan.included_workflow_runs === 0 ? '∞' : plan.included_workflow_runs.toLocaleString()} runs</span>
          <span>{plan.included_ai_tokens === 0 ? '∞' : (plan.included_ai_tokens / 1_000_000).toFixed(1) + 'M'} tokens</span>
          <span>{plan.included_users === 0 ? '∞' : plan.included_users} users</span>
          {plan.entitlements?.length > 0 && (
            <span className="flex items-center gap-1">
              <Tag size={10} /> {plan.entitlements.length} workflow{plan.entitlements.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? 'Hide details' : 'View details'}
        </button>
        <Button variant="secondary" size="xs" icon={<Edit2 size={11} />} onClick={() => onEdit(plan)}>
          Edit
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 grid grid-cols-2 gap-2 text-xs text-slate-600">
          <div><span className="font-semibold text-slate-500">Annual price:</span> {Number(plan.annual_price_usd) === 0 ? 'Free' : `$${Number(plan.annual_price_usd).toFixed(2)}/yr`}</div>
          <div><span className="font-semibold text-slate-500">Max runs:</span> {plan.max_workflow_runs === 0 ? 'Unlimited' : plan.max_workflow_runs.toLocaleString()}</div>
          <div><span className="font-semibold text-slate-500">Max users:</span> {plan.max_users === 0 ? 'Unlimited' : plan.max_users}</div>
          <div><span className="font-semibold text-slate-500">Image gens:</span> {plan.included_image_gens === 0 ? '0' : plan.included_image_gens.toLocaleString()}</div>
          <div className="col-span-2">
            <span className="font-semibold text-slate-500">Overage:</span>
            {' '}${Number(plan.overage_run_price_usd).toFixed(6)}/run
            {' '} · ${Number(plan.overage_token_price_usd).toFixed(9)}/token
            {' '} · ${Number(plan.overage_image_price_usd).toFixed(6)}/image
          </div>
          {plan.entitlements?.length > 0 && (
            <div className="col-span-2">
              <span className="font-semibold text-slate-500">Workflows:</span>
              {' '}{plan.entitlements.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminPlans() {
  const { api }      = useAuth()
  const [plans, setPlans]       = useState([])
  const [catalog, setCatalog]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [editPlan, setEditPlan] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [p, c] = await Promise.all([
        api.get(`/admin/plans?include_archived=true`),
        api.get('/admin/workflows/catalog').catch(() => []),
      ])
      setPlans(Array.isArray(p) ? p : [])
      setCatalog(Array.isArray(c) ? c : [])
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load plans')
    } finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const visible = useMemo(
    () => showArchived ? plans : plans.filter(p => p.status !== 'archived'),
    [plans, showArchived]
  )

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Plans &amp; Pricing</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${plans.filter(p => p.status === 'active').length} active plan${plans.filter(p => p.status === 'active').length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            New Plan
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle size={15} className="shrink-0" />{error}
        </div>
      )}

      {/* Toggle archived */}
      {plans.some(p => p.status === 'archived') && (
        <label className="flex items-center gap-2 text-sm text-slate-500 self-start cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
            className="w-3.5 h-3.5 text-blue-600 rounded" />
          Show archived plans
        </label>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading…</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={CreditCard} title="No plans yet"
          description="Create your first billing plan to start onboarding organizations."
          action={<Button size="sm" icon={<Plus size={13} />} onClick={() => setShowCreate(true)}>Create Plan</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map(p => (
            <PlanCard key={p.id} plan={p} onEdit={setEditPlan} />
          ))}
        </div>
      )}

      <PlanModal open={showCreate} onClose={() => setShowCreate(false)} api={api} existing={null} catalog={catalog} onDone={load} />
      <PlanModal open={!!editPlan}  onClose={() => setEditPlan(null)}   api={api} existing={editPlan} catalog={catalog} onDone={load} />
    </div>
  )
}
