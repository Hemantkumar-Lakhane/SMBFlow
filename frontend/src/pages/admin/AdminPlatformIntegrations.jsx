import { Bot, Briefcase, Server, AlertCircle } from 'lucide-react'

function IntRow({ name, status, type, desc }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-gray-900">{name}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">{status}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100">{type}</span>
        </div>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
      <button className="ml-4 text-sm font-semibold text-blue-600 hover:underline flex-shrink-0">Configure</button>
    </div>
  )
}

function Section({ icon: Icon, title, subtitle, rows }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
          <Icon className="w-4 h-4 text-gray-500" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="px-5">{rows.map((r,i) => <IntRow key={i} {...r} />)}</div>
    </div>
  )
}

export default function AdminPlatformIntegrations() {
  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Platform Integrations</h1>
        <p className="text-sm text-gray-500 mt-0.5">All external connections the platform depends on: AI providers, business tools, and infrastructure services.</p>
      </div>

      <div className="mb-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">No integrations are configured. The platform requires at minimum one AI provider connection and the infrastructure services to operate. Connect the backend API to manage integration credentials and status.</p>
      </div>

      <div className="space-y-4">
        <Section icon={Bot} title="AI Providers" subtitle="External LLM and model API connections used by workflow agents." rows={[
          { name:'Anthropic API',    status:'Not configured', type:'LLM Provider', desc:'Claude models for LLM agent tasks.' },
          { name:'OpenAI API',       status:'Not configured', type:'LLM Provider', desc:'GPT-4 series for general purpose reasoning.' },
          { name:'Google AI Studio', status:'Not configured', type:'LLM Provider', desc:'Gemini models for multimodal tasks.' },
          { name:'Groq',             status:'Not configured', type:'LLM Provider', desc:'High-throughput inference for open-weight models.' },
        ]} />

        <Section icon={Briefcase} title="Business Integrations" subtitle="CRM, notification, and automation tools connected to workflows." rows={[
          { name:'Salesforce CRM', status:'Not configured', type:'CRM',           desc:'Lead and contact data source for workflow triggers.' },
          { name:'HubSpot',        status:'Not configured', type:'CRM',           desc:'Marketing and CRM integration.' },
          { name:'Slack',          status:'Not configured', type:'Notifications', desc:'Notification delivery for workflow events and alerts.' },
          { name:'Email (SMTP)',   status:'Not configured', type:'Notifications', desc:'Transactional email for workflow outcomes and reports.' },
          { name:'Zapier',         status:'Not configured', type:'Automation',    desc:'No-code webhook bridge for third-party tools.' },
        ]} />

        <Section icon={Server} title="Infrastructure Services" subtitle="Databases, caches, and platform infrastructure the backend depends on." rows={[
          { name:'PostgreSQL',        status:'Not configured', type:'Database',       desc:'Primary relational database.' },
          { name:'Redis',             status:'Not configured', type:'Cache',          desc:'Caching, pub/sub, and session management.' },
          { name:'Webhook Receiver',  status:'Not configured', type:'Infrastructure', desc:'Inbound webhook endpoint for external triggers.' },
          { name:'S3 / Object Storage',status:'Not configured', type:'Storage',      desc:'Evidence file storage and export archiving.' },
        ]} />
      </div>
    </div>
  )
}
