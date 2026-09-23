// AdminWorkflowCatalog — platform-level workflow product catalog
// Admins see the full catalog.  Each card shows scope (GLOBAL / INDUSTRY) and
// the applicable industry so admins understand who can access each workflow.
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Layers, Plus, RefreshCw, Search, XCircle,
  Edit2, ToggleLeft, ToggleRight, Tag, Plug, Globe, Building2,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Modal, Button, Input, Select, EmptyState } from '../../components/ui'

// ── helpers ───────────────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  productivity: 'bg-blue-100 text-blue-700',
  marketing:    'bg-purple-100 text-purple-700',
  healthcare:   'bg-emerald-100 text-emerald-700',
  finance:      'bg-orange-100 text-orange-700',
  sales:        'bg-pink-100 text-pink-700',
  operations:   'bg-slate-100 text-slate-600',
  compliance:   'bg-red-100 text-red-700',
  general:      'bg-slate-100 text-slate-600',
}

const STATUS_COLORS = {
  active:     'bg-emerald-100 text-emerald-700',
  beta:       'bg-yellow-100 text-yellow-700',
  deprecated: 'bg-red-100 text-red-700',
}

const SCOPE_COLORS = {
  GLOBAL:   'bg-indigo-50 text-indigo-700 border border-indigo-200',
  INDUSTRY: 'bg-amber-50  text-amber-700  border border-amber-200',
}

const CATEGORIES = ['general','productivity','marketing','healthcare','finance','sales','operations','compliance']
const STATUSES   = ['active','beta','deprecated']
const SCOPES     = ['GLOBAL','INDUSTRY']
const INDUSTRIES = ['saas','healthcare','finance','real_estate','retail','general']

// Human-readable industry labels
const INDUSTRY_LABELS = {
  saas:        'SaaS / Growth',
  healthcare:  'Healthcare / Medical Tourism',
  finance:     'Finance',
  real_estate: 'Real Estate',
  retail:      'Retail',
  general:     'General',
}

// ── Scope badge ───────────────────────────────────────────────────────────────
function ScopeBadge({ scope, industry }) {
  if (scope === 'GLOBAL') {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${SCOPE_COLORS.GLOBAL}`}>
        <Globe size={9} /> Global
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${SCOPE_COLORS.INDUSTRY}`}>
      <Building2 size={9} /> {INDUSTRY_LABELS[industry] || industry || 'Industry'}
    </span>
  )
}

// ── Edit / Create modal ───────────────────────────────────────────────────────
function WorkflowModal({ open, onClose, api, existing, onDone }) {
  const isEdit = !!existing
  const [form, setForm] = useState({
    name: '', key: '', description: '', category: 'general',
    status: 'active', version: '1.0.0', pricing_model: 'included',
    required_integrations: '', supported_modules: '',
    scope: 'GLOBAL', industry: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (existing) {
      setForm({
        name:                   existing.name || '',
        key:                    existing.key  || '',
        description:            existing.description || '',
        category:               existing.category || 'general',
        status:                 existing.status  || 'active',
        version:                existing.version || '1.0.0',
        pricing_model:          existing.pricing_model || 'included',
        required_integrations:  (existing.required_integrations || []).join(', '),
        supported_modules:      (existing.supported_modules || []).join(', '),
        scope:                  existing.scope    || 'GLOBAL',
        industry:               existing.industry || '',
      })
    } else {
      setForm({
        name:'', key:'', description:'', category:'general', status:'active',
        version:'1.0.0', pricing_model:'included', required_integrations:'',
        supported_modules:'', scope:'GLOBAL', industry:'',
      })
    }
    setError('')
  }, [existing, open])

  function set(f, v) { setForm(s => ({ ...s, [f]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.key.trim()) { setError('Name and key are required'); return }
    if (form.scope === 'INDUSTRY' && !form.industry.trim()) {
      setError('Industry is required when scope is INDUSTRY'); return
    }
    setLoading(true); setError('')
    try {
      const payload = {
        name:                  form.name.trim(),
        key:                   form.key.trim().toLowerCase().replace(/\s+/g,'_'),
        description:           form.description.trim() || undefined,
        category:              form.category,
        status:                form.status,
        version:               form.version.trim() || '1.0.0',
        pricing_model:         form.pricing_model,
        required_integrations: form.required_integrations.split(',').map(s=>s.trim()).filter(Boolean),
        supported_modules:     form.supported_modules.split(',').map(s=>s.trim()).filter(Boolean),
        scope:                 form.scope,
        industry:              form.scope === 'INDUSTRY' ? (form.industry.trim() || null) : null,
      }
      if (isEdit) {
        await api.patch(`/admin/workflows/catalog/${existing.id}`, payload)
      } else {
        await api.post('/admin/workflows/catalog', payload)
      }
      onDone(); onClose()
    } catch(e) {
      setError(e?.response?.data?.detail || e.message || 'Save failed')
    } finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose}
      title={isEdit ? `Edit: ${existing?.name}` : 'Add Workflow to Catalog'}
      subtitle="Platform-level workflow product definition"
      width="max-w-xl"
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <XCircle size={14} className="shrink-0" />{error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Workflow Name" required value={form.name}
            onChange={e => set('name', e.target.value)} className="col-span-2"
            placeholder="Patient Intake & Triage" />
          <Input label="Key (slug)" required value={form.key}
            onChange={e => set('key', e.target.value)}
            placeholder="patient_intake_triage"
            hint="Lowercase, underscores. Used in API + assignments." />
          <Input label="Version" value={form.version}
            onChange={e => set('version', e.target.value)} />
          <Select label="Category" value={form.category}
            onChange={e => set('category', e.target.value)}
            options={CATEGORIES.map(c => ({ value:c, label: c.charAt(0).toUpperCase()+c.slice(1) }))} />
          <Select label="Status" value={form.status}
            onChange={e => set('status', e.target.value)}
            options={STATUSES.map(s => ({ value:s, label: s.charAt(0).toUpperCase()+s.slice(1) }))} />
        </div>

        {/* Scope + Industry — grouped together */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Applicability</p>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Scope" value={form.scope}
              onChange={e => set('scope', e.target.value)}
              options={[
                { value: 'GLOBAL',   label: 'Global — all industries' },
                { value: 'INDUSTRY', label: 'Industry — specific vertical' },
              ]}
            />
            <Select label="Industry" value={form.industry}
              onChange={e => set('industry', e.target.value)}
              disabled={form.scope !== 'INDUSTRY'}
              options={[
                { value: '',           label: '— select industry —' },
                ...INDUSTRIES.map(i => ({ value: i, label: INDUSTRY_LABELS[i] || i })),
              ]}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            {form.scope === 'GLOBAL'
              ? 'This workflow will be available to all organizations (subject to plan + assignment).'
              : `Only organizations with industry = "${form.industry || '…'}" can see and run this workflow.`}
          </p>
        </div>

        <Select label="Pricing Model" value={form.pricing_model}
          onChange={e => set('pricing_model', e.target.value)}
          options={[
            { value:'included', label:'Included in plan' },
            { value:'per_run',  label:'Per run' },
            { value:'metered',  label:'Metered' },
          ]} />
        <Input label="Description" value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Brief description of what this workflow does" />
        <Input label="Required Integrations (comma-separated)" value={form.required_integrations}
          onChange={e => set('required_integrations', e.target.value)}
          placeholder="gmail, hubspot" />
        <Input label="Supported Modules (comma-separated)" value={form.supported_modules}
          onChange={e => set('supported_modules', e.target.value)}
          placeholder="email, medical_tourism" />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={loading} type="submit">
            {isEdit ? 'Save Changes' : 'Add to Catalog'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminWorkflowCatalog() {
  const { api }   = useAuth()
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')
  const [filterStatus,   setFilterStatus]   = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterScope,    setFilterScope]    = useState('all')  // all | GLOBAL | INDUSTRY
  const [editItem,     setEditItem]   = useState(null)
  const [showCreate,   setShowCreate] = useState(false)
  const [toggling,     setToggling]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await api.get('/admin/workflows/catalog')
      setCatalog(Array.isArray(data) ? data : [])
    } catch(e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load catalog')
    } finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  async function toggleActive(wf) {
    setToggling(wf.id)
    try {
      await api.patch(`/admin/workflows/catalog/${wf.id}`, { active: !wf.active })
      load()
    } finally { setToggling(null) }
  }

  const filtered = useMemo(() => {
    let list = catalog
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(w =>
        w.name?.toLowerCase().includes(q) ||
        w.key?.toLowerCase().includes(q) ||
        w.description?.toLowerCase().includes(q) ||
        (w.industry || '').toLowerCase().includes(q)
      )
    }
    if (filterStatus   !== 'all') list = list.filter(w => w.status   === filterStatus)
    if (filterCategory !== 'all') list = list.filter(w => w.category === filterCategory)
    if (filterScope    !== 'all') list = list.filter(w => (w.scope || 'GLOBAL') === filterScope)
    return list
  }, [catalog, search, filterStatus, filterCategory, filterScope])

  const categories = useMemo(() => [...new Set(catalog.map(w => w.category).filter(Boolean))], [catalog])
  const globalCount   = useMemo(() => catalog.filter(w => (w.scope || 'GLOBAL') === 'GLOBAL').length, [catalog])
  const industryCount = useMemo(() => catalog.filter(w => w.scope === 'INDUSTRY').length, [catalog])

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Workflow Catalog</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${catalog.length} workflows · ${globalCount} global · ${industryCount} industry-specific`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Add Workflow
          </Button>
        </div>
      </div>

      {/* Info banner — explains scope to admins */}
      <div className="flex items-start gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700">
        <Globe size={14} className="shrink-0 mt-0.5" />
        <p>
          <span className="font-semibold">Scope controls visibility.</span>{' '}
          <span className="inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 bg-indigo-100 rounded-full">Global</span>{' '}
          workflows appear for all organizations.{' '}
          <span className="inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 bg-amber-100 rounded-full text-amber-700">Industry</span>{' '}
          workflows only appear for organizations whose industry matches the workflow's industry field.
          Plan entitlement and admin assignment are still required in both cases.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Search by name, key, industry…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
        </div>
        <select value={filterScope} onChange={e => setFilterScope(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="all">All scopes</option>
          <option value="GLOBAL">Global only</option>
          <option value="INDUSTRY">Industry only</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle size={15} className="shrink-0" />{error}
        </div>
      )}

      {/* Catalog grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Layers} title="No workflows found"
          description={search ? 'Try a different search or filter' : 'Add the first workflow to the platform catalog.'}
          action={!search && <Button size="sm" icon={<Plus size={13} />} onClick={() => setShowCreate(true)}>Add Workflow</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(wf => (
            <div key={wf.id}
              className={`bg-white border rounded-xl p-5 flex flex-col gap-3 transition-all ${wf.active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    {/* Scope badge — key new element */}
                    <ScopeBadge scope={wf.scope || 'GLOBAL'} industry={wf.industry} />
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[wf.category] || CATEGORY_COLORS.general}`}>
                      {wf.category}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[wf.status] || 'bg-slate-100 text-slate-600'}`}>
                      {wf.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">{wf.name}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{wf.key}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditItem(wf)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => toggleActive(wf)} disabled={toggling === wf.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40">
                    {wf.active
                      ? <ToggleRight size={16} className="text-emerald-500" />
                      : <ToggleLeft size={16} />}
                  </button>
                </div>
              </div>

              {/* Description */}
              {wf.description && (
                <p className="text-xs text-slate-500 leading-relaxed">{wf.description}</p>
              )}

              {/* Meta row */}
              <div className="flex items-center gap-4 text-xs text-slate-400 border-t border-slate-100 pt-3 flex-wrap">
                <span className="flex items-center gap-1">
                  <Tag size={11} /> v{wf.version}
                </span>
                <span className="capitalize">{wf.pricing_model?.replace('_',' ')}</span>
                {wf.required_integrations?.length > 0 && (
                  <span className="flex items-center gap-1 truncate">
                    <Plug size={11} />{wf.required_integrations.join(', ')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <WorkflowModal open={showCreate} onClose={() => setShowCreate(false)} api={api} existing={null} onDone={load} />
      <WorkflowModal open={!!editItem}  onClose={() => setEditItem(null)}   api={api} existing={editItem} onDone={load} />
    </div>
  )
}
