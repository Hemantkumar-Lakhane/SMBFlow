import { AlertCircle } from 'lucide-react'

const TASKS = [
  { name:'Business Reasoning',    desc:'Complex multi-step evaluation of lead quality and business context.' },
  { name:'Drafting / Generation', desc:'Producing follow-up recommendations and structured text outputs.' },
  { name:'Classification',        desc:'Categorizing leads, intents, and outcomes.' },
  { name:'Summarization',         desc:'Condensing workflow results and evidence into audit records.' },
  { name:'Tool Calling',          desc:'Agents that invoke external APIs during workflow execution.' },
  { name:'Structured Output',     desc:'Generating validated JSON payloads for downstream steps.' },
]

const AGENTS = [
  { name:'Business Reasoning Agent', type:'LLM Agent',    cls:'bg-blue-50 text-blue-700 border-blue-200' },
  { name:'Follow-up Agent',          type:'LLM Agent',    cls:'bg-blue-50 text-blue-700 border-blue-200' },
  { name:'Lead Scoring Model',       type:'ML Model',     cls:'bg-amber-50 text-amber-700 border-amber-200' },
  { name:'Risk / Policy Gate',       type:'Rule Engine',  cls:'bg-gray-100 text-gray-600 border-gray-200' },
  { name:'CRM Connector',            type:'API Tool',     cls:'bg-green-50 text-green-700 border-green-200' },
]

const FALLBACKS = [
  'On primary model failure',
  'On provider outage',
  'Retry policy',
  'Timeout policy',
]

export default function AdminRoutingAssignments() {
  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Routing &amp; Assignments</h1>
        <p className="text-sm text-gray-500 mt-0.5">Define which model handles each AI task and agent. Platform defaults cascade through task defaults, agent assignments, and workflow overrides.</p>
      </div>

      <div className="space-y-4">
        {/* Assignment hierarchy */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-gray-400" />
            <h2 className="text-sm font-bold text-gray-900">Assignment hierarchy</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
            {['Platform Default','Task Default','Agent Assignment','Workflow Override'].map((s,i,a)=>(
              <span key={s} className="flex items-center gap-2">
                <span className="font-medium text-gray-700">{s}</span>
                {i<a.length-1 && <span className="text-gray-300">›</span>}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500">The most specific valid configuration applies. A workflow override takes precedence over an agent assignment, which takes precedence over the task default. If no assignment exists at a level, the next level up is used.</p>
          <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">No models are available for assignment. Connect a provider and register models in the <span className="text-blue-600 cursor-pointer font-medium">Model Catalog</span> before configuring routing.</p>
          </div>
        </div>

        {/* Task-based routing */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Task-based routing</h2>
            <p className="text-xs text-gray-500 mt-0.5">Assign a primary and fallback model to each AI task type used by the platform.</p>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">{['TASK','PRIMARY MODEL','FALLBACK MODEL','PROVIDER','STATUS',''].map(h=><th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{TASKS.map(t=>(
              <tr key={t.name} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3"><p className="text-sm font-semibold text-gray-900">{t.name}</p><p className="text-xs text-gray-400 mt-0.5 max-w-[200px]">{t.desc}</p></td>
                <td className="px-5 py-3 text-xs text-gray-400 italic">No model assigned</td>
                <td className="px-5 py-3 text-xs text-gray-400 italic">No fallback configured</td>
                <td className="px-5 py-3 text-xs text-gray-400">—</td>
                <td className="px-5 py-3"><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">No assignment</span></td>
                <td className="px-5 py-3"><button className="text-xs text-blue-600 font-semibold hover:underline">Assign</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        {/* Agent assignments */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Agent assignments</h2>
            <p className="text-xs text-gray-500 mt-0.5">Assign models at the agent level. These override task defaults for the specific agent. LLM agents can be assigned LLM models only — ML models, rule engines, and tools are managed separately.</p>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">{['AGENT','TYPE','PRIMARY MODEL','FALLBACK','PROVIDER','STATUS',''].map(h=><th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{AGENTS.map(a=>(
              <tr key={a.name} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 text-sm font-semibold text-gray-900">{a.name}</td>
                <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${a.cls}`}>{a.type}</span></td>
                <td className="px-5 py-3 text-xs text-gray-400 italic">Uses task default when available</td>
                <td className="px-5 py-3 text-xs text-gray-400 italic">No fallback</td>
                <td className="px-5 py-3 text-xs text-gray-400">—</td>
                <td className="px-5 py-3"><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">No assignment</span></td>
                <td className="px-5 py-3"><button className="text-xs text-blue-600 font-semibold hover:underline">Assign</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        {/* Fallback policy */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Fallback policy</h2>
            <p className="text-xs text-gray-500 mt-0.5">Configure behaviour when a primary model or provider is unavailable.</p>
          </div>
          <div className="divide-y divide-gray-50">
            {FALLBACKS.map(f=>(
              <div key={f} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{f}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{
                    f==='On primary model failure'?'Configure to use fallback model automatically.':
                    f==='On provider outage'?'Configure to route to an alternative provider.':
                    f==='Retry policy'?'Number of retries before falling back.':
                    'Time to wait before treating a response as a failure.'
                  }</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">Not configured</span>
                  <button className="text-xs text-blue-600 font-semibold hover:underline">Configure</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
