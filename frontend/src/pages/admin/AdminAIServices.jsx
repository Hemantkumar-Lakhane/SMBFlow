import { Bot, Cpu, Zap, Wrench, AlertCircle } from 'lucide-react'

function ServiceTable({ rows }) {
  return (
    <table className="w-full text-sm mt-3">
      <thead><tr className="border-b border-gray-100">{['NAME','TYPE','STATUS','PROVIDER','USED BY','LAST HEALTH CHECK'].map(h=><th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r,i)=>(
        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
          <td className="px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">{r.name}</p>
            {r.desc && <p className="text-xs text-gray-400 mt-0.5 max-w-[200px] leading-relaxed">{r.desc}</p>}
          </td>
          <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${r.typeCls||'bg-blue-50 text-blue-700 border-blue-200'}`}>{r.type}</span></td>
          <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${r.statusCls||'bg-gray-100 text-gray-500 border-gray-200'}`}>{r.status}</span></td>
          <td className="px-4 py-3 text-xs text-gray-500">{r.provider||'Not assigned'}</td>
          <td className="px-4 py-3"><span className="text-xs text-blue-600 font-medium">{r.usedBy||'None'}</span></td>
          <td className="px-4 py-3 text-xs text-gray-400">{r.lastCheck||'Never'}</td>
        </tr>
      ))}</tbody>
    </table>
  )
}

function Section({ icon: Icon, iconBg, title, subtitle, warning, rows }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}><Icon className="w-4 h-4" /></div>
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {warning && (
        <div className="mx-5 mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">{warning}</p>
        </div>
      )}
      <div className="px-5 pb-4"><ServiceTable rows={rows} /></div>
    </div>
  )
}

export default function AdminAIServices() {
  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Services</h1>
        <p className="text-sm text-gray-500 mt-0.5">All AI execution capabilities available to the platform, organized by service type. LLM agents, ML models, rule engines, and integration tools are distinct and managed separately.</p>
      </div>

      <div className="space-y-4">
        <Section icon={Bot} iconBg="bg-purple-50 text-purple-600" title="LLM Services" subtitle="Large language model capabilities: reasoning, generation, summarization, and classification." rows={[
          { name:'Business Reasoning', desc:'Evaluates lead quality, generates structured business justifications.', type:'LLM Agent', typeCls:'bg-blue-50 text-blue-700 border-blue-200', status:'Not configured', provider:'Not assigned', usedBy:'Lead Assessment', lastCheck:'Never' },
          { name:'Follow-up Recommendation', desc:'Produces prioritized action recommendations based on lead score and context.', type:'LLM Agent', typeCls:'bg-blue-50 text-blue-700 border-blue-200', status:'Not configured', provider:'Not assigned', usedBy:'Lead Assessment', lastCheck:'Never' },
          { name:'Risk Narrative Generation', desc:'Converts structured risk scores into human-readable summaries for Review Queue.', type:'LLM Generation', typeCls:'bg-purple-50 text-purple-700 border-purple-200', status:'Not configured', provider:'Not assigned', usedBy:'None', lastCheck:'Never' },
        ]} />

        <Section icon={Cpu} iconBg="bg-blue-50 text-blue-600" title="Predictive ML Services" subtitle="Statistical and machine learning models for scoring, classification, and probability estimation."
          warning="ML models are distinct from LLMs. They require training data, feature pipelines, and deployment infrastructure independent of any LLM provider."
          rows={[
            { name:'Lead Scoring Model', desc:'POC — Not deployed. Reference: UCI Bank Marketing Dataset. Requires training, validation, and deployment before production use.', type:'ML Model', typeCls:'bg-blue-50 text-blue-700 border-blue-200', status:'POC — not deployed', statusCls:'bg-amber-50 text-amber-700 border-amber-200', provider:'Internal ML pipeline', usedBy:'Lead Assessment', lastCheck:'Never' },
            { name:'Conversion Probability Estimator', desc:'Planned — requires training data and a deployment pipeline.', type:'ML Model', typeCls:'bg-blue-50 text-blue-700 border-blue-200', status:'Not configured', provider:'Not assigned', usedBy:'None', lastCheck:'Never' },
          ]} />

        <Section icon={Zap} iconBg="bg-amber-50 text-amber-600" title="Rule & Policy Services" subtitle="Deterministic rule evaluation, threshold gating, and policy enforcement. No ML or LLM required." rows={[
          { name:'Input Validation Rules', desc:'Schema validation and data completeness checks at workflow input step.', type:'Rule Engine', typeCls:'bg-amber-50 text-amber-700 border-amber-200', status:'Not configured', provider:'Internal', usedBy:'Lead Assessment', lastCheck:'Never' },
          { name:'Risk / Impact Gate', desc:'Structured threshold check before the human approval step. Routes high-risk items to Review Queue.', type:'Policy Engine', typeCls:'bg-gray-100 text-gray-600 border-gray-200', status:'Not configured', provider:'Internal', usedBy:'Lead Assessment', lastCheck:'Never' },
          { name:'Confidence Threshold Policy', desc:'Routes to Review Queue when AI confidence falls below the configured threshold.', type:'Policy Engine', typeCls:'bg-gray-100 text-gray-600 border-gray-200', status:'Not configured', provider:'Internal', usedBy:'None', lastCheck:'Never' },
        ]} />

        <Section icon={Wrench} iconBg="bg-green-50 text-green-600" title="Integration Tools" subtitle="External API connectors and data tools used by agents during workflow execution." rows={[
          { name:'CRM Data Connector', desc:'Reads lead and contact data from the connected CRM during workflow execution.', type:'API Tool', typeCls:'bg-green-50 text-green-700 border-green-200', status:'Not configured', provider:'Not connected', usedBy:'Lead Assessment', lastCheck:'Never' },
          { name:'Outcome Tracking Writer', desc:'Writes workflow outcomes back to source system for feedback loop and model improvement.', type:'API Tool', typeCls:'bg-green-50 text-green-700 border-green-200', status:'Not configured', provider:'Not connected', usedBy:'Lead Assessment', lastCheck:'Never' },
        ]} />
      </div>

      <div className="mt-4 text-xs text-gray-500">
        <span className="text-blue-600 font-medium cursor-pointer">Service architecture</span> — Services are configured per agent or workflow step on the Routing & Assignments page. Use Provider Connections to configure LLM API access. ML models require a separate training and deployment pipeline — they cannot be configured through LLM provider credentials. Rule and policy engines require no external provider.
      </div>
    </div>
  )
}
