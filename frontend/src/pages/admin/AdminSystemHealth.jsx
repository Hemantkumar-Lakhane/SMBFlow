import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Server, Database, Layers, Wifi, GitBranch, Cpu, Plug, Info } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const SERVICES = [
  { id:'backend',    icon: Server,    title:'Backend API',          sub:'Core SMBFlow FastAPI application' },
  { id:'postgres',   icon: Database,  title:'PostgreSQL',           sub:'Primary relational database' },
  { id:'redis',      icon: Layers,    title:'Redis',                sub:'Cache and session store' },
  { id:'websocket',  icon: Wifi,      title:'WebSocket',            sub:'Real-time event streaming' },
  { id:'workflow',   icon: GitBranch, title:'Workflow Engine',      sub:'Workflow orchestration runtime' },
  { id:'ai',         icon: Cpu,       title:'AI / Model Services',  sub:'LLM and ML model endpoints' },
  { id:'external',   icon: Plug,      title:'External Integrations',sub:'Third-party service connectors' },
]

function ServiceCard({ service, health }) {
  const Icon = service.icon
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
          <Icon className="w-4 h-4 text-gray-400" />
        </div>
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          Status unavailable
        </span>
      </div>
      <h3 className="text-sm font-bold text-gray-900">{service.title}</h3>
      <p className="text-xs text-gray-500 mt-0.5">{service.sub}</p>
      <p className="text-xs text-gray-400 mt-3">Last checked: —</p>
    </div>
  )
}

export default function AdminSystemHealth() {
  const { api } = useAuth()
  const [health,   setHealth]  = useState(null)
  const [loading,  setLoading] = useState(true)

  const load = useCallback(async () => {
    try { setHealth(await api.get('/health')) } catch {}
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Health</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monitor SMBFlow platform services and integrations</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors bg-white">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="mb-4 flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <p className="text-xs text-blue-700">Health data unavailable. Connect the platform health API to monitor service status in real time.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SERVICES.map(s => <ServiceCard key={s.id} service={s} health={health} />)}
      </div>
    </div>
  )
}
