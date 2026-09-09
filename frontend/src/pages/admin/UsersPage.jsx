// frontend/src/pages/admin/UsersPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin: Platform & Organization Users management with controlled invitation.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { User, Search, Plus, X, ShieldCheck, UserCheck, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../utils/helpers'

function InviteAdminModal({ open, onClose, api, onDone }) {
  const [form, setForm] = useState({ email: '', full_name: '', role: 'platform_admin' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    setLoading(true)
    setError('')
    setSuccessMsg('')
    try {
      await api.post('/admin/users/invite', {
        email: form.email.trim(),
        full_name: form.full_name.trim() || undefined,
        role: form.role,
      })
      setSuccessMsg(`Invitation sent successfully to ${form.email.trim()}`)
      setTimeout(() => {
        onDone()
        onClose()
        setForm({ email: '', full_name: '', role: 'platform_admin' })
        setSuccessMsg('')
      }, 1200)
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to send invitation.')
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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <ShieldCheck size={18} />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Invite Platform User</h2>
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
            <UserCheck size={15} className="text-green-600 shrink-0 mt-0.5" />
            <p className="text-xs text-green-700">{successMsg}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email address *</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="admin@company.com"
              required
              autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full name (optional)</label>
            <input
              type="text"
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="Jane Smith"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Role *</label>
            <select
              value={form.role}
              onChange={e => set('role', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            >
              <option value="platform_admin">Platform Admin (Full system access)</option>
              <option value="org_user">Organization User (Standard workspace access)</option>
            </select>
          </div>

          <div className="flex gap-3 pt-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Sending invitation...</span>
                </>
              ) : (
                'Send Invitation'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RoleBadge({ role }) {
  const isPlatformAdmin = role === 'platform_admin' || role === 'super_admin'
  return (
    <span
      className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 ${
        isPlatformAdmin
          ? 'bg-purple-50 text-purple-700 border border-purple-200'
          : 'bg-slate-100 text-slate-700 border border-slate-200'
      }`}
    >
      {isPlatformAdmin ? <ShieldCheck size={12} /> : <User size={12} />}
      {isPlatformAdmin ? 'Platform Admin' : 'Organization User'}
    </span>
  )
}

export default function UsersPage() {
  const { api } = useAuth()
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [deactivating, setDeactivating] = useState({})

  const load = useCallback(async () => {
    try {
      const u = await api.get('/admin/users').catch(() => api.get('/users').catch(() => []))
      setUsers(Array.isArray(u) ? u : [])
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  const deactivate = async (id) => {
    setDeactivating(p => ({ ...p, [id]: true }))
    try {
      await api.patch(`/users/${id}/deactivate`, {})
      load()
    } catch (_) {
    } finally {
      setDeactivating(p => {
        const n = { ...p }
        delete n[id]
        return n
      })
    }
  }

  const filtered = users.filter(
    u =>
      !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.organization_name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalUsers = users.length
  const activeUsers = users.filter(u => u.is_active !== false).length
  const adminUsers = users.filter(u => u.role === 'platform_admin' || u.role === 'super_admin').length

  return (
    <div className="p-6 bg-slate-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Platform & Organization Users</h1>
            <p className="text-xs text-slate-500">{totalUsers} registered accounts across the platform</p>
          </div>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors shadow-xs"
        >
          <Plus size={16} />
          <span>Invite Platform Admin</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <p className="text-xs font-medium text-slate-500 mb-1">Total Users</p>
          <p className="text-2xl font-bold text-slate-900">{totalUsers}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <p className="text-xs font-medium text-slate-500 mb-1">Active Accounts</p>
          <p className="text-2xl font-bold text-green-600">{activeUsers}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <p className="text-xs font-medium text-slate-500 mb-1">Platform Admins</p>
          <p className="text-2xl font-bold text-purple-600">{adminUsers}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or organization..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-2xs"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">User Roster</h2>
          <span className="text-xs font-medium text-slate-400">{filtered.length} shown</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
            <Loader2 size={18} className="animate-spin mr-2" />
            <span>Loading user accounts...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <User size={32} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 text-xs font-medium uppercase tracking-wider">
                  <th className="px-5 py-3.5">User</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Workspace / Organization</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Joined</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(u => {
                  const isAdmin = u.role === 'platform_admin' || u.role === 'super_admin'
                  const isActive = u.is_active !== false
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-900">{u.email}</p>
                        {u.full_name && <p className="text-xs text-slate-400">{u.full_name}</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {u.organization_name || '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isActive
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-slate-400'}`} />
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 text-xs">
                        {timeAgo(u.created_at) || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {!isAdmin && isActive && (
                          <button
                            onClick={() => deactivate(u.id)}
                            disabled={!!deactivating[u.id]}
                            className="px-3 py-1 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            {deactivating[u.id] ? 'Deactivating…' : 'Deactivate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InviteAdminModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        api={api}
        onDone={load}
      />
    </div>
  )
}
