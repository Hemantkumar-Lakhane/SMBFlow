// frontend/src/pages/admin/UsersPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Card, Button, Modal, Input, Select, Alert, Spinner, EmptyState, Badge } from '../../components/ui'
import { timeAgo } from '../../utils/helpers'

// ── Create User Modal ──────────────────────────────────────────────────────────
function CreateUserModal({ open, onClose, tenants, api, onDone }) {
  const [form, setForm] = useState({ email: '', password: '', full_name: '', tenant_id: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.email || !form.password) { setError('Email and password required'); return }
    if (form.password.length < 6)      { setError('Password must be at least 6 characters'); return }
    setLoading(true); setError('')
    try {
      await api.post('/users', {
        email:     form.email.trim(),
        password:  form.password,
        full_name: form.full_name.trim() || undefined,
        tenant_id: form.tenant_id || undefined,
      })
      onDone()
      onClose()
      setForm({ email: '', password: '', full_name: '', tenant_id: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="➕ Create User">
      <div className="space-y-4">
        <Input
          label="Email *"
          type="email"
          value={form.email}
          onChange={e => set('email', e.target.value)}
          placeholder="user@company.com"
          required
        />
        <Input
          label="Password *"
          type="password"
          value={form.password}
          onChange={e => set('password', e.target.value)}
          placeholder="min 6 characters"
          required
        />
        <Input
          label="Full Name"
          value={form.full_name}
          onChange={e => set('full_name', e.target.value)}
          placeholder="Jane Smith"
        />
        <Select
          label="Assign to Tenant"
          value={form.tenant_id}
          onChange={e => set('tenant_id', e.target.value)}
          options={[
            { value: '', label: '— none (super admin) —' },
            ...tenants.map(t => ({ value: t.id, label: t.name })),
          ]}
        />
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
        <div className="flex gap-2 pt-2">
          <Button variant="success" loading={loading} onClick={submit} className="flex-1">
            ✓ Create User
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Deactivate Confirm Modal ───────────────────────────────────────────────────
function DeactivateModal({ user, onClose, api, onDone }) {
  const [loading, setLoading] = useState(false)
  if (!user) return null
  const go = async () => {
    setLoading(true)
    try { await api.patch(`/users/${user.id}/deactivate`, {}); onDone(); onClose() }
    finally { setLoading(false) }
  }
  return (
    <Modal open onClose={onClose} title="⚠️ Deactivate User" width="max-w-sm">
      <p className="text-gray-300 text-sm mb-4">
        Deactivate <strong className="text-white">{user.email}</strong>? They will no longer be able to log in.
      </p>
      <div className="flex gap-2">
        <Button variant="danger" loading={loading} onClick={go} className="flex-1">Deactivate</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  )
}

// ── Main UsersPage ─────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { api }           = useAuth()
  const [users,   setUsers]   = useState([])
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [search,  setSearch]  = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [deactivating,  setDeactivating]  = useState(null)

  const load = useCallback(async () => {
    try {
      const [u, t] = await Promise.all([
        api.get('/users'),
        api.get('/tenants'),
      ])
      setUsers(Array.isArray(u) ? u : [])
      setTenants(Array.isArray(t) ? t : [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = users.filter(u =>
    !search ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const getTenantName = (tid) => tenants.find(t => t.id === tid)?.name || '—'

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">👤 User Management</h1>
          <p className="text-gray-400 text-xs mt-0.5">{users.length} users registered</p>
        </div>
        <Button variant="success" size="sm" onClick={() => setShowCreate(true)}>➕ Create User</Button>
      </div>

      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      {/* Search */}
      <Card>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </Card>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="py-3 text-center">
          <div className="text-2xl font-bold text-white">{users.length}</div>
          <div className="text-xs text-gray-500">Total Users</div>
        </Card>
        <Card className="py-3 text-center">
          <div className="text-2xl font-bold text-green-400">{users.filter(u => u.is_active).length}</div>
          <div className="text-xs text-gray-500">Active</div>
        </Card>
        <Card className="py-3 text-center">
          <div className="text-2xl font-bold text-purple-400">{users.filter(u => u.role === 'super_admin').length}</div>
          <div className="text-xs text-gray-500">Admins</div>
        </Card>
      </div>

      {/* User table */}
      <Card title="Users" action={<span className="text-xs text-gray-500">{filtered.length} shown</span>} noPad>
        {filtered.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState icon="👤" title="No users found" description={search ? 'Try a different search term' : 'Create the first user'} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  {['User', 'Role', 'Tenant', 'Status', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3 text-left font-medium first:rounded-tl-xl">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                    <td className="px-5 py-3">
                      <div className="text-white text-sm font-medium">{u.full_name || '—'}</div>
                      <div className="text-gray-500 text-xs">{u.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                        u.role === 'super_admin' ? 'bg-purple-900/40 text-purple-300 border border-purple-700/40' : 'bg-gray-800 text-gray-400 border border-gray-700'
                      }`}>
                        {u.role === 'super_admin' ? '⚡ super_admin' : '👤 tenant_user'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-sm">{getTenantName(u.tenant_id)}</td>
                    <td className="px-5 py-3">
                      <Badge status={u.is_active ? 'running' : 'stopped'} />
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{timeAgo(u.created_at)}</td>
                    <td className="px-5 py-3">
                      {u.is_active && u.role !== 'super_admin' && (
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => setDeactivating(u)}
                        >
                          Deactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateUserModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        tenants={tenants}
        api={api}
        onDone={load}
      />
      <DeactivateModal
        user={deactivating}
        onClose={() => setDeactivating(null)}
        api={api}
        onDone={load}
      />
    </div>
  )
}