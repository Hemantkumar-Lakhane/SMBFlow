// frontend/src/pages/LandingPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// SMBFlow — Clean, High-Precision Architecture
// Autonomous Multi-Agent Workflow Engine for Modern SMBs
// Real workflows, honest capabilities, zero fake statistics.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import {
  ArrowRight,
  Play,
  Check,
  Shield,
  Zap,
  Mail,
  Receipt,
  CreditCard,
  Layers,
  Sparkles,
  ChevronDown,
  Lock,
  Database,
  RefreshCw,
  Cpu,
  BrainCircuit,
  MessageSquare,
  FileText,
  Sun,
  Moon,
  AlertTriangle,
  UserCheck,
  Workflow,
  Sliders,
  CheckCircle2,
  Boxes,
  KeyRound,
  History,
  Terminal,
  ExternalLink
} from 'lucide-react'

export default function LandingPage() {
  const navigate = useNavigate()
  const { theme, toggle: toggleTheme, isDark } = useTheme()

  // Mouse spotlight coordinates
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 })
  const heroRef = useRef(null)

  const handleMouseMove = (e) => {
    if (!heroRef.current) return
    const rect = heroRef.current.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }

  // Real Workflows built into SMBFlow
  const WORKFLOW_MODULES = [
    {
      id: 'email_summarizer',
      name: 'Email Triage & Summarizer',
      category: 'Communications',
      icon: Mail,
      tag: 'Autonomous',
      description: 'Ingests inbound emails via IMAP/Webhooks, classifies intent, extracts key action items, and prepares structured draft responses for human review.',
      nodes: [
        { title: 'Inbound Webhook', type: 'Trigger', tech: 'IMAP / REST' },
        { title: 'Intent & Entity Parser', type: 'LLM Agent', tech: 'Claude 3.7 / GPT-4o' },
        { title: 'Human Approval Gate', type: 'HITL Review', tech: 'Action Center' },
        { title: 'CRM & Draft Sync', type: 'Integration', tech: 'Gmail / HubSpot' }
      ]
    },
    {
      id: 'product_launch',
      name: 'Product Launch Sprint',
      category: 'Marketing Ops',
      icon: Sparkles,
      tag: 'Multi-Agent',
      description: 'Coordinates multi-agent launch planning: runs competitive analysis, synthesizes campaign briefs, generates visual marketing assets, and drafts multi-channel copy.',
      nodes: [
        { title: 'Launch Brief Intake', type: 'Trigger', tech: 'Form / API' },
        { title: 'Strategic Copywriter', type: 'LLM Agent', tech: 'Claude Sonnet' },
        { title: 'Image Asset Synthesis', type: 'AI Generation', tech: 'Gemini / SDXL' },
        { title: 'Campaign Review Gate', type: 'HITL Review', tech: 'Team Sign-off' }
      ]
    },
    {
      id: 'medical_tourism',
      name: 'Clinical Case Briefs',
      category: 'Healthcare & Services',
      icon: FileText,
      tag: 'Structured',
      description: 'Processes patient intake records, extracts medical histories, matches verified specialists, and organizes structured case briefs with immutable audit trails.',
      nodes: [
        { title: 'Intake Record Intake', type: 'Trigger', tech: 'Secure Upload' },
        { title: 'Clinical Parser', type: 'LLM Agent', tech: 'Deterministic Schema' },
        { title: 'Physician Sign-Off', type: 'HITL Review', tech: 'Escalations' },
        { title: 'EHR / Drive Archive', type: 'Integration', tech: 'Vault Storage' }
      ]
    },
    {
      id: 'reviews',
      name: 'Review Sentiment & Response',
      category: 'Reputation',
      icon: MessageSquare,
      tag: 'Real-time',
      description: 'Monitors customer reviews across public platforms, analyzes sentiment trends, auto-drafts brand-compliant responses, and alerts management on low ratings.',
      nodes: [
        { title: 'Review Stream Hook', type: 'Trigger', tech: 'Webhook' },
        { title: 'Sentiment Classifier', type: 'LLM Agent', tech: 'Llama 3.3 / Groq' },
        { title: 'Negative Rating Gate', type: 'HITL Review', tech: 'Slack Alert' },
        { title: 'Response Dispatch', type: 'Integration', tech: 'API Commit' }
      ]
    }
  ]

  const [selectedWorkflowId, setSelectedWorkflowId] = useState('email_summarizer')
  const [activeTab, setActiveTab] = useState(0)
  const activeWorkflow = WORKFLOW_MODULES.find(w => w.id === selectedWorkflowId) || WORKFLOW_MODULES[0]

  // Pricing state
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [openFaqIndex, setOpenFaqIndex] = useState(null)
  const [ctaEmail, setCtaEmail] = useState('')

  const handleCtaSubmit = (e) => {
    e.preventDefault()
    if (ctaEmail.trim()) {
      navigate('/auth/signup', { state: { email: ctaEmail.trim() } })
    } else {
      navigate('/auth/signup')
    }
  }

  const faqs = [
    {
      q: "How does SMBFlow execute workflows?",
      a: "SMBFlow uses Directed Acyclic Graphs (DAGs) powered by LangGraph and FastAPI. Each node represents a discrete task (e.g. LLM reasoning, schema validation, human approval, or API integration) executed in deterministic order with state persistence in PostgreSQL."
    },
    {
      q: "What is Human-in-the-Loop (HITL) governance?",
      a: "For sensitive operations (financial transactions, outgoing customer emails, or high-risk actions), the workflow pauses and creates an Approval Item in your Action Center. Execution only proceeds once an authorized team member approves or modifies the draft."
    },
    {
      q: "Which AI models and providers are supported?",
      a: "SMBFlow supports Anthropic (Claude 3.7 / 3.5), OpenAI (GPT-4o), Google (Gemini 2.5), and open-source models via Groq (Llama 3.3). You can supply your own API keys via the encrypted Key Vault."
    },
    {
      q: "Is data isolated between tenants?",
      a: "Yes. SMBFlow enforces complete multi-tenant database isolation at the schema and query layer. Your credentials, workflow state, and customer data are never accessible across organizations."
    },
    {
      q: "Can I build custom workflows?",
      a: "Yes. In addition to pre-built catalog workflows, SMBFlow includes a visual Workflow Studio and an AI Workflow Generator that can assemble custom DAGs from natural language prompts."
    }
  ]

  return (
    <div className={`min-h-screen transition-colors duration-200 ${
      isDark
        ? 'bg-[#0a0d14] text-slate-100 selection:bg-indigo-500 selection:text-white'
        : 'bg-[#fafbfc] text-slate-900 selection:bg-blue-600 selection:text-white font-sans'
    }`}>

      {/* NAVIGATION BAR */}
      <header className={`sticky top-0 z-50 w-full backdrop-blur-md border-b transition-colors ${
        isDark
          ? 'bg-[#0a0d14]/90 border-slate-800/80 text-white'
          : 'bg-white/90 border-slate-200/90 text-slate-900'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white transition-colors ${
              isDark ? 'bg-indigo-600' : 'bg-slate-950 group-hover:bg-blue-600'
            }`}>
              <BrainCircuit className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-bold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                SMBFlow
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold uppercase tracking-wider ${
                isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
              }`}>
                v3.0
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className={`hidden md:flex items-center gap-7 text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            <a href="#workflows" className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`}>Workflows</a>
            <a href="#architecture" className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`}>Architecture</a>
            <a href="#integrations" className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`}>Integrations</a>
            <a href="#pricing" className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`}>Pricing</a>
            <a href="#faq" className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`}>Docs & FAQ</a>
          </nav>

          {/* Nav Actions + Theme Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg border transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-amber-300 hover:bg-slate-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title={isDark ? "Switch to Light Theme" : "Switch to Dark Theme"}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <Link
              to="/auth"
              className={`text-sm font-medium px-3 py-2 transition-colors ${
                isDark ? 'text-slate-300 hover:text-white' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Sign in
            </Link>
            <Link
              to="/auth/signup"
              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold shadow-xs transition-all duration-150 ${
                isDark
                  ? 'bg-white text-slate-950 hover:bg-slate-100'
                  : 'bg-slate-950 text-white hover:bg-blue-600'
              }`}
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="w-full">
        {/* HERO SECTION */}
        <section
          ref={heroRef}
          onMouseMove={handleMouseMove}
          className={`relative pt-20 pb-24 md:pt-28 md:pb-32 overflow-hidden transition-colors border-b ${
            isDark
              ? 'bg-[#0a0d14] border-slate-800/80'
              : 'bg-white border-slate-200/80'
          }`}
        >
          {/* Subtle Grid */}
          <div
            className={`absolute inset-0 pointer-events-none ${isDark ? 'opacity-20' : 'opacity-40'}`}
            style={{
              backgroundImage: isDark
                ? `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`
                : `linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)`,
              backgroundSize: '40px 40px'
            }}
          />

          {/* Clean Cursor Spotlight */}
          <div
            className="absolute inset-0 pointer-events-none transition-all duration-100 ease-out"
            style={{
              background: isDark
                ? `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(99, 102, 241, 0.15) 0%, rgba(56, 189, 248, 0.04) 40%, transparent 70%)`
                : `radial-gradient(550px circle at ${mousePos.x}px ${mousePos.y}px, rgba(37, 99, 235, 0.12) 0%, rgba(99, 102, 241, 0.05) 35%, transparent 65%)`
            }}
          />

          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center relative z-10">
            {/* Tag Badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-8 border ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-indigo-300'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Autonomous Multi-Agent Workflow Engine</span>
            </div>

            {/* Headline */}
            <h1 className={`text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight max-w-3xl leading-[1.15] ${
              isDark ? 'text-white' : 'text-slate-950'
            }`}>
              Autonomous workflows with{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
                human-in-the-loop
              </span>{' '}
              precision.
            </h1>

            {/* Subtitle */}
            <p className={`mt-6 text-lg max-w-2xl font-normal leading-relaxed ${
              isDark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              SMBFlow coordinates multi-agent pipelines for customer communications, product launches, clinical briefs, and review operations with verifiable execution state.
            </p>

            {/* Actions */}
            <div className="mt-8 flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
              <Link
                to="/auth/signup"
                className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm shadow-xs transition-all ${
                  isDark
                    ? 'bg-white text-slate-950 hover:bg-slate-100'
                    : 'bg-slate-950 text-white hover:bg-blue-600'
                }`}
              >
                <span>Create Free Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#workflows"
                className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-semibold text-sm border transition-all ${
                  isDark
                    ? 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Workflow className="w-4 h-4 text-blue-600" />
                <span>Explore Workflows</span>
              </a>
            </div>

            {/* Capabilities Pill Strip */}
            <div className={`mt-12 flex flex-wrap items-center justify-center gap-6 text-xs font-medium ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> Deterministic DAG State Machine</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> Multi-Tenant Isolation</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> Encrypted Key Vault</span>
            </div>
          </div>
        </section>

        {/* WORKFLOW PIPELINE STUDIO (CLEAN REAL DEMO) */}
        <section className={`py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto`} id="workflows">
          <div className="mb-10 text-center max-w-2xl mx-auto">
            <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Production Workflows Built In
            </h2>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Inspect actual execution pipelines designed for operational workflows.
            </p>
          </div>

          {/* Workflow Selector */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            {WORKFLOW_MODULES.map((wf) => {
              const Icon = wf.icon
              const isSelected = selectedWorkflowId === wf.id
              return (
                <button
                  key={wf.id}
                  onClick={() => setSelectedWorkflowId(wf.id)}
                  className={`px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
                    isSelected
                      ? isDark
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-xs'
                        : 'bg-slate-950 border-slate-950 text-white shadow-xs'
                      : isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{wf.name}</span>
                </button>
              )
            })}
          </div>

          {/* Clean Visual DAG Canvas */}
          <div className={`rounded-xl border shadow-sm overflow-hidden transition-colors ${
            isDark ? 'bg-[#0f141f] border-slate-800' : 'bg-white border-slate-200'
          }`}>
            {/* Header */}
            <div className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4 ${
              isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50/70 border-slate-200'
            }`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {activeWorkflow.name}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                    isDark ? 'bg-slate-800 text-indigo-300' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {activeWorkflow.category}
                  </span>
                </div>
                <p className={`text-xs mt-1 max-w-xl ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  {activeWorkflow.description}
                </p>
              </div>

              <Link
                to="/auth/signup"
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  isDark ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-900 text-white hover:bg-blue-600'
                }`}
              >
                <span>Deploy Workflow</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* DAG Nodes Sequence */}
            <div className="p-6 md:p-8">
              <span className={`text-[11px] font-mono font-bold uppercase tracking-wider block mb-4 ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}>
                Execution Graph (Directed Acyclic Graph)
              </span>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {activeWorkflow.nodes.map((node, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border transition-all ${
                      isDark
                        ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-mono text-[10px] text-slate-400">STEP 0{idx + 1}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        node.type === 'Trigger' ? 'bg-blue-500/10 text-blue-500' :
                        node.type === 'LLM Agent' ? 'bg-purple-500/10 text-purple-500' :
                        node.type === 'HITL Review' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-emerald-500/10 text-emerald-500'
                      }`}>
                        {node.type}
                      </span>
                    </div>

                    <h4 className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {node.title}
                    </h4>
                    <p className="text-xs text-slate-500 font-mono mt-1">
                      {node.tech}
                    </p>
                  </div>
                ))}
              </div>

              {/* Action Center Feature Highlight */}
              <div className={`mt-6 p-4 rounded-lg border flex items-center justify-between text-xs ${
                isDark ? 'bg-slate-900/30 border-slate-800/80 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-amber-500" />
                  <span><strong>Human-in-the-Loop Safe Mode:</strong> Automated actions requiring supervisor sign-off wait in the Action Center until approved.</span>
                </div>
                <span className="font-mono text-[11px] text-emerald-500 hidden sm:inline">Zero Blind Automation</span>
              </div>
            </div>
          </div>
        </section>

        {/* CORE ARCHITECTURAL PILLARS */}
        <section className={`py-20 border-t transition-colors ${
          isDark ? 'bg-[#080b11] border-slate-800' : 'bg-slate-50/80 border-slate-200'
        }`} id="architecture">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
                Engineered for Operational Reliability
              </h2>
              <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Designed specifically for businesses that need verifiable, stateful automation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1 */}
              <div className={`p-6 rounded-xl border transition-all ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${
                  isDark ? 'bg-indigo-500/10 text-indigo-400' : 'bg-blue-50 text-blue-600'
                }`}>
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Multi-LLM Provider Engine
                </h3>
                <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Route different workflow tasks to the most optimal model. Use Claude for complex reasoning, GPT-4o for document synthesis, and Groq/Llama for sub-second classification.
                </p>
              </div>

              {/* Card 2 */}
              <div className={`p-6 rounded-xl border transition-all ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                  <UserCheck className="w-5 h-5" />
                </div>
                <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Action Center Approvals
                </h3>
                <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Configure custom escalation thresholds. If a draft response, financial transaction, or booking exceeds confidence parameters, it waits for 1-click human verification.
                </p>
              </div>

              {/* Card 3 */}
              <div className={`p-6 rounded-xl border transition-all ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Encrypted Key Vault
                </h3>
                <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Store OpenAI, Anthropic, Google, and SaaS integration credentials with AES-256 fernet encryption. API keys are masked in the UI and never leaked to logs.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* INTEGRATIONS */}
        <section className={`py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-b ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`} id="integrations">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Connects with Your Operational Stack
            </h2>
            <p className={`text-xs mt-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Direct OAuth and API connectors for core business tools.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {['Gmail', 'Google Drive', 'QuickBooks Online', 'Stripe', 'HubSpot CRM', 'Slack', 'Shopify', 'Custom Webhooks'].map((tool, idx) => (
              <div
                key={idx}
                className={`px-4 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                  isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                <Boxes className="w-3.5 h-3.5 text-blue-500" />
                <span>{tool}</span>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" id="pricing">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Simple, Predictable Plans
            </h2>
            <p className={`text-sm mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Get started for free or scale your workflow capacity as your business grows.
            </p>

            <div className={`mt-6 inline-flex items-center gap-2 p-1 rounded-lg border ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  billingCycle === 'monthly'
                    ? isDark ? 'bg-slate-800 text-white' : 'bg-white text-slate-900 shadow-xs'
                    : isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  billingCycle === 'annual'
                    ? isDark ? 'bg-slate-800 text-white' : 'bg-white text-slate-900 shadow-xs'
                    : isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Annual (20% off)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Free */}
            <div className={`p-6 rounded-xl border flex flex-col justify-between ${
              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Free Tier</span>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>$0</span>
                  <span className="text-xs text-slate-500">/ month</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">Explore multi-agent workflows with pre-built templates.</p>

                <ul className="mt-6 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> 1 Team Seat</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> 2 Active Workflows</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Standard Email & Webhook Connectors</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Action Center Approvals</li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Link
                  to="/auth/signup"
                  className={`w-full inline-flex items-center justify-center py-2 rounded-lg border text-xs font-semibold ${
                    isDark ? 'border-slate-700 text-white hover:bg-slate-800' : 'border-slate-300 text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  Start Free
                </Link>
              </div>
            </div>

            {/* Starter */}
            <div className={`p-6 rounded-xl border-2 flex flex-col justify-between relative ${
              isDark ? 'bg-slate-900 border-indigo-500' : 'bg-white border-blue-600'
            }`}>
              <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider text-white ${
                isDark ? 'bg-indigo-600' : 'bg-blue-600'
              }`}>
                Recommended
              </div>
              <div>
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-indigo-400' : 'text-blue-600'}`}>
                  Starter Plan
                </span>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                    {billingCycle === 'monthly' ? '$49' : '$39'}
                  </span>
                  <span className="text-xs text-slate-500">/ month</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">For growing businesses automating day-to-day operations.</p>

                <ul className="mt-6 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> 5 Team Seats</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Unlimited Active Workflows</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Multi-Model Routing (Claude + GPT)</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Visual Workflow Studio & Generator</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Encrypted Key Vault Access</li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Link
                  to="/auth/signup"
                  className={`w-full inline-flex items-center justify-center py-2 rounded-lg text-xs font-semibold text-white ${
                    isDark ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  Start 14-Day Free Trial
                </Link>
              </div>
            </div>

            {/* Enterprise */}
            <div className={`p-6 rounded-xl border flex flex-col justify-between ${
              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Enterprise</span>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Custom</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">For teams requiring dedicated VPCs, custom ERPs, and SLAs.</p>

                <ul className="mt-6 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Unlimited Seats & Workflows</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Custom NetSuite / ERP Integrations</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Single-Tenant Isolation & Audit Vault</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> 99.99% Uptime Guarantee & Support</li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <a
                  href="#faq"
                  className={`w-full inline-flex items-center justify-center py-2 rounded-lg border text-xs font-semibold ${
                    isDark ? 'border-slate-700 text-white hover:bg-slate-800' : 'border-slate-300 text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  Contact Sales
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className={`py-20 border-t transition-colors ${
          isDark ? 'bg-[#080b11] border-slate-800' : 'bg-slate-50/80 border-slate-200'
        }`} id="faq">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-3">
              {faqs.map((faq, idx) => {
                const isOpen = openFaqIndex === idx
                return (
                  <div key={idx} className={`rounded-lg border overflow-hidden transition-colors ${
                    isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
                  }`}>
                    <button
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      className={`w-full p-4 text-left flex items-center justify-between font-semibold text-sm cursor-pointer ${
                        isDark ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      <span>{faq.q}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      } ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                    </button>
                    {isOpen && (
                      <div className={`px-4 pb-4 text-xs leading-relaxed ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        {faq.a}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* CLOSING CTA */}
        <section className="py-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className={`rounded-2xl p-8 sm:p-12 border ${
            isDark
              ? 'bg-slate-900/80 border-slate-800 text-white'
              : 'bg-slate-950 border-slate-900 text-white shadow-lg'
          }`}>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Automate your operations with precision.
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-md mx-auto">
              Create your workspace in seconds. Connect your providers and run your first autonomous agentic workflow.
            </p>

            <form onSubmit={handleCtaSubmit} className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2 max-w-sm mx-auto">
              <input
                type="email"
                value={ctaEmail}
                onChange={(e) => setCtaEmail(e.target.value)}
                placeholder="Enter work email"
                required
                className="w-full px-3.5 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-slate-400 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="w-full sm:w-auto px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs whitespace-nowrap transition-all cursor-pointer"
              >
                Get Started
              </button>
            </form>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className={`border-t py-12 transition-colors ${
        isDark ? 'bg-[#080b11] border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-slate-700 dark:text-slate-200">SMBFlow</span>
            <span>— Autonomous Multi-Tenant Workflow Engine</span>
          </div>
          <p>© 2026 SMBFlow. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
