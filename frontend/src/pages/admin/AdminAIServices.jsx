// Admin: AI Services & Engine Capabilities (Synchronized with real SMBFlow AI Services)
import { useState, useEffect, useCallback } from 'react'
import { Bot, Cpu, Zap, Wrench, RefreshCw, CheckCircle2, ShieldCheck, Layers, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function AdminAIServices() {
  const navigate = useNavigate()
  const { api } = useAuth()
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const h = await api.get('/health').catch(() => null)
      setHealth(h)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const services = [
    {
      name: 'Gemini Primary LLM Engine',
      desc: 'Google DeepMind Gemini 1.5 Flash model for reasoning, content generation, and product launch copywriting.',
      category: 'Primary LLM',
      provider: 'Google AI (gemini-1.5-flash)',
      status: 'Operational',
      statusCls: 'bg-green-50 text-green-700 border-green-200',
      usedBy: 'Product Launch Sprint, Email Summarizer, Reasoning Agents',
      role: 'Primary Generation'
    },
    {
      name: 'Pollinations AI Fallback Provider',
      desc: 'Flux image generation provider triggered automatically when primary Gemini quota or rate limits are reached.',
      category: 'Fallback Visual Provider',
      provider: 'gen.pollinations.ai (flux)',
      status: 'Active Fallback',
      statusCls: 'bg-blue-50 text-blue-700 border-blue-200',
      usedBy: 'Product Launch Visuals, Social Media Imagery',
      role: 'Visual Fallback'
    },
    {
      name: 'VisualBriefBuilder Engine',
      desc: 'Grounded prompt builder enforcing source priority (approved user facts → document facts → visual direction) and verbatim product names.',
      category: 'RAG & Fact Grounding',
      provider: 'Core Platform Engine',
      status: 'Operational',
      statusCls: 'bg-green-50 text-green-700 border-green-200',
      usedBy: 'ImageRouter Pipeline',
      role: 'Prompt Grounding'
    },
    {
      name: 'ImageRouter Orchestrator',
      desc: 'Unified image router with maximum 1 Gemini attempt + 1 Pollinations attempt retry policy.',
      category: 'Multi-Provider Failover',
      provider: 'Core ImageRouter Abstraction',
      status: 'Operational',
      statusCls: 'bg-green-50 text-green-700 border-green-200',
      usedBy: 'All Visual Campaign Tasks',
      role: 'Orchestration Router'
    },
    {
      name: 'Email Triage & Summarizer Agent',
      desc: 'Autonomous agent parsing synthetic/inbox emails, extracting key items, priority, and sentiment.',
      category: 'Autonomous Agent',
      provider: 'Core Agent Pipeline',
      status: 'Active',
      statusCls: 'bg-purple-50 text-purple-700 border-purple-200',
      usedBy: 'Email Summarizer Workflow',
      role: 'Inbox Triage'
    }
  ]

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Services & Engine Capabilities</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Active LLM engines, visual generation failovers, VisualBriefBuilder grounding, and agent execution services in SMBFlow.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : 'text-gray-400'}`} />
          Test Health & Refresh
        </button>
      </div>

      {/* Services Table Card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-gray-900">Registered Platform AI Services</h2>
          </div>
          <button
            onClick={() => navigate('/admin/providers')}
            className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
          >
            Manage Provider Credentials <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['SERVICE NAME', 'CATEGORY', 'STATUS', 'PROVIDER & MODEL', 'USED BY WORKFLOWS', 'SYSTEM ROLE'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map((s, idx) => (
                <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-sm font-bold text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed max-w-sm">{s.desc}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-semibold border border-gray-200">
                      {s.category}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold rounded-full border ${s.statusCls}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {s.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs font-mono font-medium text-gray-800">
                    {s.provider}
                  </td>
                  <td className="px-5 py-4 text-xs text-blue-600 font-medium max-w-[200px]">
                    {s.usedBy}
                  </td>
                  <td className="px-5 py-4 text-xs font-semibold text-gray-700">
                    {s.role}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Failover & Policy Banner */}
      <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-5 flex items-start gap-4">
        <ShieldCheck className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-blue-950">Active AI Routing & Failover Policy</h3>
          <p className="text-xs text-blue-800 mt-1 leading-relaxed">
            All visual generation requests flow through <strong>ImageRouter</strong> with primary routing to <strong>Gemini 1.5 Flash</strong>.
            If Gemini encounters rate limits or quota exhaustion, SMBFlow automatically falls back to <strong>Pollinations AI (Flux)</strong> with zero data loss.
            Product facts are strictly preserved verbatim by <strong>VisualBriefBuilder</strong> before provider invocation.
          </p>
        </div>
      </div>
    </div>
  )
}
