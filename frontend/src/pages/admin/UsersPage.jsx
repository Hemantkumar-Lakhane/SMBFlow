// Admin: Users page — matches Figma screenshot exactly
import { useState, useEffect, useCallback } from 'react'
import { User, Search, Plus, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../utils/helpers'

// ── Create User Modal ────────────────────────────────────────────────────────
function CreateUserModal({ open, onClose, api, onDone, tenants }) {
  const [form, setForm] = useState({ email: '', password: '', full_name: '', tenant_id: '', role: 'tenant_user' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.email || !form.password) { setError('Email and password required'); return }
    setLoading(true); setError('')
    try {
      await api.post('/users', { email: form.email, password: form.password, full_name: form.full_name, tenant_id: form.tenant_id || null })
      onDone(); onClose(); setForm({ email: '', password: '', full_name: '', tenant_id: '', role: 'tenant_user' })
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Create User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Jane Smith"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
            <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="user@company.com" type="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
            <input value={form.password} onChange={e => set('password', e.target.value)} type="password" placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization</label>
            <select value={form.tenant_id} onChange={e => set('tenant_id', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">— None (admin) —</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={submit} disabled={loading}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              {loading ? 'Creating…' : 'Create User'}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Role Badge ────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const map = {
    super_admin:  'bg-purple-600 text-white',
    tenant_user:  'bg-gray-800 text-white',
    admin:        'bg-blue-600 text-white',
  }
  return (
    <span className={`px-2.5 py-1 rounded text-[11px] font-bold ${map[role] || map.tenant_user}`}>
      {role}
    </span>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { api } = useAuth()
  const [users,   setUsers]   = useState([])
  const [tenants, setTenants] = useState([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deactivating, setDeactivating] = useState({})

  const load = useCallback(async () => {
    try {
      const [u, t] = await Promise.all([
        api.get('/users').catch(() => []),
        api.get('/tenants').catch(() => []),
      ])
      setUsers(Array.isArray(u) ? u : [])
      setTenants(Array.isArray(t) ? t : [])
    } finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const deactivate = async (id) => {
    setDeactivating(p => ({ ...p, [id]: true }))
    try { await api.patch(`/users/${id}/deactivate`, {}); load() } catch {}
    finally { setDeactivating(p => { const n = { ...p }; delete n[id]; return n }) }
  }

  const filtered = users.filter(u =>
    !search ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalUsers  = users.length
  const activeUsers = users.filter(u => u.is_active !== false).length
  const adminUsers  = users.filter(u => u.role === 'super_admin').length

  const getTenantName = (tid) => tenants.find(t => t.id === tid)?.name || '—'

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <User className="w-8 h-8 text-gray-400" />
          <div>
            <p className="text-sm text-gray-500">{totalUsers} users registered</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Create User
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by email or name..."
          className="w-full pl-11 pr-4 py-3 bg-gray-900 text-white placeholder-gray-500 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col items-center justify-center">
          <p className="text-sm text-gray-500 mb-1">Total Users</p>
          <p className="text-2xl font-bold text-gray-900">{totalUsers || ''}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col items-center justify-center">
          <p className="text-sm text-gray-500 mb-1">Active</p>
          <p className="text-2xl font-bold text-green-500">{activeUsers}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col items-center justify-center">
          <p className="text-sm text-gray-500 mb-1">Admins</p>
          <p className="text-2xl font-bold text-purple-500">{adminUsers}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Users</h2>
          <span className="text-sm text-gray-400">{filtered.length} shown</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <User className="w-10 h-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No users found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['User','Role','Tenant','Status','Created','Actions'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const isAdmin = u.role === 'super_admin'
                const isActive = u.is_active !== false
                return (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-gray-900">{u.email}</p>
                      {u.full_name && <p className="text-xs text-gray-400 mt-0.5">{u.full_name}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">
                      {u.tenant_id ? getTenantName(u.tenant_id) : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`flex items-center gap-1.5 text-xs font-semibold w-fit px-2.5 py-1 rounded-full ${isActive ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-400'}`} />
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-400">
                      {timeAgo(u.created_at) || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      {!isAdmin && isActive && (
                        <button
                          onClick={() => deactivate(u.id)}
                          disabled={!!deactivating[u.id]}
                          className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          {deactivating[u.id] ? '…' : 'Deactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <CreateUserModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        api={api}
        onDone={load}
        tenants={tenants}
      />
    </div>
  )
}
