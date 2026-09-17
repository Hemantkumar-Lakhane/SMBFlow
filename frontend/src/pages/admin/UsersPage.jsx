// UsersPage — Platform user management (admin only)
// Data from /api/v1/admin/users
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, Search, Plus, RefreshCw, XCircle, CheckCircle2,
  ShieldCheck, UserX, UserCheck, ChevronDown, Mail,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Modal, Button, Input, Select, EmptyState } from '../../components/ui'

// ── helpers ───────────────────────────────────────────────────────────────────
function roleBadge(role) {
  if (!role) return 'bg-slate-100 text-slate-500'
  if (role.includes('platform_admin') || role.includes('super_admin'))
    return 'bg-orange-100 text-orange-700'
  if (role.startsWith('suspended_'))
    return 'bg-red-100 text-red-600'
  return 'bg-slate-100 text-slate-600'
}

function roleLabel(role) {
  if (!role) return '—'
  if (role.startsWith('suspended_')) return `Suspended (${role.replace('suspended_', '')})`
  if (role === 'platform_admin' || role === 'super_admin') return 'Platform Admin'
  if (role === 'org_user') return 'Org User'
  return role
}

// ── Invite modal ──────────────────────────────────────────────────────────────
function InviteModal({ open, onClose, api, orgs, onDone }) {
  const [form, setForm] = useState({ email: '', full_name: '', role: 'org_user', organization_id: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(f, v) { setForm(s => ({ ...s, [f]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.email.trim()) { setError('Email is required'); return }
    setLoading(true); setError('')
    try {
      await api.post('/admin/users/invite', {
        email:           form.email.trim(),
        full_name:       form.full_name.trim() || undefined,
        role:            form.role,
        organization_id: form.organization_id || undefined,
      })
      onDone(); onClose()
      setForm({ email: '', full_name: '', role: 'org_user', organization_id: '' })
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Invite failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite User" subtitle="Create a new platform or organization user">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <XCircle size={14} className="shrink-0" /> {error}
          </div>
        )}
        <Input
          label="Email" type="email" required
          value={form.email} onChange={e => set('email', e.target.value)}
          icon={Mail}
        />
        <Input
          label="Full Name (optional)"
          value={form.full_name} onChange={e => set('full_name', e.target.value)}
        />
        <Select
          label="Role"
          value={form.role}
          onChange={e => set('role', e.target.value)}
          options={[
            { value: 'org_user',       label: 'Org User — access to assigned workflows' },
            { value: 'platform_admin', label: 'Platform Admin — full control plane access' },
          ]}
        />
        {form.role === 'org_user' && (
          <Select
            label="Organization (optional)"
            value={form.organization_id}
            onChange={e => set('organization_id', e.target.value)}
            options={[
              { value: '', label: 'Auto-create pending workspace' },
              ...orgs.map(o => ({ value: o.id, label: o.name })),
            ]}
          />
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={loading} type="submit">Send Invite</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Row actions ───────────────────────────────────────────────────────────────
function UserRowActions({ user, api, orgs, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [changeRoleOpen, setChangeRoleOpen] = useState(false)
  const [changeOrgOpen, setChangeOrgOpen]   = useState(false)
  const [newRole, setNewRole] = useState(user.role)
  const [newOrg, setNewOrg]  = useState(user.organization_id || '')
  const [loading, setLoading] = useState(false)
  const isSuspended = user.role?.startsWith('suspended_')

  async function changeRole() {
    setLoading(true)
    try {
      await api.patch(`/admin/users/${user.id}/role`, { role: newRole })
      setChangeRoleOpen(false); onRefresh()
    } finally { setLoading(false) }
  }

  async function changeOrg() {
    if (!newOrg) return
    setLoading(true)
    try {
      await api.patch(`/admin/users/${user.id}/organization`, { organization_id: newOrg })
      setChangeOrgOpen(false); onRefresh()
    } finally { setLoading(false) }
  }

  async function toggleActive() {
    setLoading(true)
    try {
      const ep = isSuspended
        ? `/admin/users/${user.id}/reactivate`
        : `/admin/users/${user.id}/deactivate`
      await api.patch(ep, {})
      onRefresh()
    } finally { setLoading(false); setOpen(false) }
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <ChevronDown size={14} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-7 z-20 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-sm">
              <button
                onClick={e => { e.stopPropagation(); setOpen(false); setChangeRoleOpen(true) }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700"
              >
                <ShieldCheck size={13} /> Change Role
              </button>
              <button
                onClick={e => { e.stopPropagation(); setOpen(false); setChangeOrgOpen(true) }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700"
              >
                <Users size={13} /> Change Org
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button
                onClick={e => { e.stopPropagation(); toggleActive() }}
                disabled={loading}
                className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 disabled:opacity-40 ${isSuspended ? 'text-emerald-600' : 'text-red-600'}`}
              >
                {isSuspended ? <><UserCheck size={13} /> Reactivate</> : <><UserX size={13} /> Suspend</>}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Change role modal */}
      <Modal open={changeRoleOpen} onClose={() => setChangeRoleOpen(false)} title="Change Role" width="max-w-sm">
        <div className="flex flex-col gap-4">
          <Select
            label="New Role"
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            options={[
              { value: 'org_user',       label: 'Org User' },
              { value: 'platform_admin', label: 'Platform Admin' },
            ]}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setChangeRoleOpen(false)}>Cancel</Button>
            <Button size="sm" loading={loading} onClick={changeRole}>Update Role</Button>
          </div>
        </div>
      </Modal>

      {/* Change org modal */}
      <Modal open={changeOrgOpen} onClose={() => setChangeOrgOpen(false)} title="Change Organization" width="max-w-sm">
        <div className="flex flex-col gap-4">
          <Select
            label="Organization"
            value={newOrg}
            onChange={e => setNewOrg(e.target.value)}
            options={[
              { value: '', label: 'Select organization…' },
              ...orgs.map(o => ({ value: o.id, label: o.name })),
            ]}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setChangeOrgOpen(false)}>Cancel</Button>
            <Button size="sm" loading={loading} onClick={changeOrg}>Move User</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { api } = useAuth()
  const [users, setUsers]     = useState([])
  const [orgs, setOrgs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [filterOrg, setFilterOrg]   = useState('all')
  const [showInvite, setShowInvite] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [ud, od] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/organizations').catch(() => []),
      ])
      setUsers(Array.isArray(ud) ? ud : [])
      setOrgs(Array.isArray(od) ? od : [])
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let list = users
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(u =>
        u.email?.toLowerCase().includes(q) ||
        u.full_name?.toLowerCase().includes(q) ||
        u.organization_name?.toLowerCase().includes(q)
      )
    }
    if (filterRole !== 'all') {
      if (filterRole === 'platform_admin') list = list.filter(u => u.role === 'platform_admin' || u.role === 'super_admin')
      else if (filterRole === 'org_user')  list = list.filter(u => u.role === 'org_user')
      else if (filterRole === 'suspended') list = list.filter(u => u.role?.startsWith('suspended_'))
    }
    if (filterOrg !== 'all') {
      list = list.filter(u => u.organization_id === filterOrg)
    }
    return list
  }, [users, search, filterRole, filterOrg])

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${users.length} user${users.length !== 1 ? 's' : ''} across all organizations`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowInvite(true)}>
            Invite User
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="all">All roles</option>
          <option value="platform_admin">Platform Admin</option>
          <option value="org_user">Org User</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="all">All organizations</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {/* Error */}
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
            icon={Users}
            title="No users found"
            description={search ? 'Try a different search' : 'Invite the first user to get started.'}
            action={!search && <Button size="sm" icon={<Plus size={13} />} onClick={() => setShowInvite(true)}>Invite User</Button>}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['User', 'Role', 'Organization', 'Status', 'Joined', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <span className="text-blue-700 text-xs font-bold">
                          {(u.full_name || u.email || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{u.full_name || '—'}</p>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${roleBadge(u.role)}`}>
                      {u.role === 'platform_admin' && <ShieldCheck size={10} />}
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 text-sm">
                    {u.organization_name || <span className="text-slate-400 italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      u.status === 'suspended' || u.role?.startsWith('suspended_')
                        ? 'bg-red-100 text-red-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {u.status === 'suspended' || u.role?.startsWith('suspended_')
                        ? <><XCircle size={10} />Suspended</>
                        : <><CheckCircle2 size={10} />Active</>}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-400">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <UserRowActions user={u} api={api} orgs={orgs} onRefresh={load} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        api={api}
        orgs={orgs}
        onDone={load}
      />
    </div>
  )
}
