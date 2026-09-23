// LandingPage.jsx — SMBFlow Public B2B SaaS Landing Page
import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Zap, ArrowRight, Check, ShieldCheck, Cpu, Layers, GitBranch,
  BarChart3, CheckCircle2, ChevronDown, Sparkles, Building2,
  FileText, Activity, Lock, Globe, Server, UserCheck
} from 'lucide-react'

export default function LandingPage() {
  const navigate = useNavigate()
  const [openFaq, setOpenFaq] = useState(null)

  const toggleFaq = (idx) => {
    setOpenFaq(openFaq === idx ? null : idx)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500 selection:text-white">
      {/* ── Background Glow Effects ─────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-sky-600/15 rounded-full blur-3xl" />
      </div>

      {/* ── Header / Navigation ────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                SMBFlow
              </span>
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Control Plane
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a href="#capabilities" className="hover:text-white transition-colors">Capabilities</a>
            <a href="#workflows" className="hover:text-white transition-colors">Workflow Catalog</a>
            <a href="#solutions" className="hover:text-white transition-colors">Solutions</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/auth/signup"
              className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg shadow-lg shadow-blue-500/20 transition-all transform hover:-translate-y-0.5"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section ────────────────────────────────────────────────── */}
      <section className="relative z-10 pt-20 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 mb-8">
          <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
          <span>Production Control Plane & Multi-Model AI Orchestration</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight">
          Autonomous AI Workflows & Operating Control for Growing Businesses
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto font-normal leading-relaxed">
          Streamline multi-step operations with DB-backed entitlements, human-in-the-loop approval checkpoints, append-only usage metering, and multi-model AI routing.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/auth/signup"
            className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2 group"
          >
            Start 14-Day Free Trial
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a
            href="#workflows"
            className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            Explore Workflows
          </a>
        </div>

        {/* Feature Badges */}
        <div className="mt-12 flex flex-wrap justify-center items-center gap-6 text-xs font-medium text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Hard Backend Authorization Boundary</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
            <span>14-Day DB-Backed Trial Enforced</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            <span>Append-Only Usage Metering</span>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span>Multi-Provider AI Routing</span>
          </div>
        </div>

        {/* Interactive Dashboard Preview Graphic */}
        <div className="mt-16 relative rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="ml-2 text-xs font-mono text-slate-500">SMBFlow Platform Admin Control Plane</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Live Operational State
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-left">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <p className="text-xs font-medium text-slate-400">Canonical Workflows</p>
              <p className="text-2xl font-bold text-white mt-1">4 Active</p>
              <p className="text-[11px] text-emerald-400 mt-1">Product Launch, Email, Clinical, Finance</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <p className="text-xs font-medium text-slate-400">Security Access Policy</p>
              <p className="text-2xl font-bold text-white mt-1">Hard Boundary</p>
              <p className="text-[11px] text-blue-400 mt-1">Direct API & Access Assertions</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <p className="text-xs font-medium text-slate-400">AI Routing Engine</p>
              <p className="text-2xl font-bold text-white mt-1">Multi-Provider</p>
              <p className="text-[11px] text-indigo-400 mt-1">OpenAI, Anthropic, Gemini, Groq</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <p className="text-xs font-medium text-slate-400">Usage Metering</p>
              <p className="text-2xl font-bold text-white mt-1">Append-Only</p>
              <p className="text-[11px] text-sky-400 mt-1">Exact Token & Provider Cost Tracking</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Key Capabilities ────────────────────────────────────────────── */}
      <section id="capabilities" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="text-center mb-16">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-400">Built for Enterprise Reliability</h2>
          <p className="mt-2 text-3xl font-extrabold text-white">Platform Core Capabilities</p>
          <p className="mt-3 text-slate-400 max-w-2xl mx-auto">
            Architected for scalability, strict tenant isolation, and transparent operational control.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-blue-500/50 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-5 group-hover:scale-110 transition-transform">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Hard Backend Security Boundary</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Enforces tenant isolation with canonical backend checks (`assert_workflow_access`) across page loading, API triggers, background runs, and scheduled jobs.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 transition-transform">
              <UserCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">DB-Backed 14-Day Trial Enforcer</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Persisted trial state with backend-enforced timestamps guarantees trial integrity without relying solely on client state or scheduled cron jobs.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/50 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-5 group-hover:scale-110 transition-transform">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Append-Only Usage Ledger</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Detailed tracking of tokens, image generations, and provider costs. Displays "Unavailable" when provider cost data is missing—never false zeros.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/50 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-5 group-hover:scale-110 transition-transform">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Single Source AI Routing</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Persisted LLM routing configuration defines primary, fallback, and image generation providers with zero conflicting UI state.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-purple-500/50 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-5 group-hover:scale-110 transition-transform">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Human-in-the-Loop Approvals</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Built-in review checkpoints and evidence record archiving ensure high-stakes workflow actions are inspected before execution.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/50 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-5 group-hover:scale-110 transition-transform">
              <Server className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Live Service Health Monitoring</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Real connectivity checks for PostgreSQL, Redis, WebSocket event bus, workflow execution engine, and AI provider key status.
            </p>
          </div>
        </div>
      </section>

      {/* ── Workflow Catalog Showcase ────────────────────────────────────── */}
      <section id="workflows" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="text-center mb-16">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Canonical Automation Templates</h2>
          <p className="mt-2 text-3xl font-extrabold text-white">Production Workflow Catalog</p>
          <p className="mt-3 text-slate-400 max-w-2xl mx-auto">
            Ready-to-deploy workflows built on SMBFlow's core engine.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/40 transition-all">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                product_launch_sprint
              </span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Canonical
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Product Launch Sprint</h3>
            <p className="text-sm text-slate-400 mb-4">
              Multi-agent sprint generator: builds strategic product brief, visual image assets via Gemini/Pollinations, and targeted launch communications.
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="px-2 py-1 rounded bg-slate-800">Strategic Brief</span>
              <span className="px-2 py-1 rounded bg-slate-800">Visual Asset Gen</span>
              <span className="px-2 py-1 rounded bg-slate-800">Multi-Channel Copy</span>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/40 transition-all">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                email_summarizer
              </span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Canonical
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Customer Email Summarizer</h3>
            <p className="text-sm text-slate-400 mb-4">
              Autonomous email queue worker: parses incoming customer correspondence, scores urgency, extracts action items, and queues draft responses.
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="px-2 py-1 rounded bg-slate-800">Email Queue Worker</span>
              <span className="px-2 py-1 rounded bg-slate-800">Urgency Scoring</span>
              <span className="px-2 py-1 rounded bg-slate-800">Draft Responses</span>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-sky-500/40 transition-all">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
                medical_journey_operations
              </span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Canonical
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Medical Journey Operations</h3>
            <p className="text-sm text-slate-400 mb-4">
              Clinical operational assistant: tracks patient milestone progress, logs evidence records, and flags required review items for healthcare teams.
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="px-2 py-1 rounded bg-slate-800">Clinical Tasks</span>
              <span className="px-2 py-1 rounded bg-slate-800">Evidence Logging</span>
              <span className="px-2 py-1 rounded bg-slate-800">Care Checkpoints</span>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 transition-all">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                finance_operations
              </span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Canonical
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Financial Reconciliation & Audit</h3>
            <p className="text-sm text-slate-400 mb-4">
              Operational ledger verifier: cross-references usage records, verifies transaction statements, and generates invoice verification summaries.
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="px-2 py-1 rounded bg-slate-800">Ledger Auditing</span>
              <span className="px-2 py-1 rounded bg-slate-800">Cost Metering</span>
              <span className="px-2 py-1 rounded bg-slate-800">Invoice Audit</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Industry Solutions (Generic Architecture) ────────────────────── */}
      <section id="solutions" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="text-center mb-16">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-sky-400">Generic Industry Architecture</h2>
          <p className="mt-2 text-3xl font-extrabold text-white">Adaptable to Any SMB Sector</p>
          <p className="mt-3 text-slate-400 max-w-2xl mx-auto">
            Configured through Organization → Industry → Enabled Modules → Plan Entitlements → Workflow Assignments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800">
            <Building2 className="w-6 h-6 text-blue-400 mb-3" />
            <h4 className="font-bold text-white mb-1">Professional Services</h4>
            <p className="text-xs text-slate-400">Document summaries, client reporting, and internal workflow orchestration.</p>
          </div>
          <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800">
            <Globe className="w-6 h-6 text-indigo-400 mb-3" />
            <h4 className="font-bold text-white mb-1">Retail & E-Commerce</h4>
            <p className="text-xs text-slate-400">Automated campaign sprints, visual content creation, and product launches.</p>
          </div>
          <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800">
            <Activity className="w-6 h-6 text-sky-400 mb-3" />
            <h4 className="font-bold text-white mb-1">Healthcare Operations</h4>
            <p className="text-xs text-slate-400">Patient care milestones, evidence tracking, and review gate approvals.</p>
          </div>
          <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800">
            <FileText className="w-6 h-6 text-emerald-400 mb-3" />
            <h4 className="font-bold text-white mb-1">Operations & Logistics</h4>
            <p className="text-xs text-slate-400">Dispatch summaries, exception escalations, and resource allocations.</p>
          </div>
        </div>
      </section>

      {/* ── Transparent Pricing Section ─────────────────────────────────── */}
      <section id="pricing" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="text-center mb-16">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Transparent Plans</h2>
          <p className="mt-2 text-3xl font-extrabold text-white">Simple, Entitlement-Driven Pricing</p>
          <p className="mt-3 text-slate-400 max-w-2xl mx-auto">
            All paid plans include a 14-day fully-featured trial with persisted status tracking.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Free */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase">Free</span>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">$0</span>
                <span className="text-xs text-slate-500">/month</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">Basic trial access for evaluation.</p>
              <ul className="mt-6 space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> 1 User Seat</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> 1 Assigned Workflow</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Default AI Routing</li>
              </ul>
            </div>
            <Link
              to="/auth/signup"
              className="mt-8 w-full py-2.5 text-center text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Get Started Free
            </Link>
          </div>

          {/* Starter */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-blue-400 uppercase">Starter</span>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">$99</span>
                <span className="text-xs text-slate-500">/month</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">Essential automation for small teams.</p>
              <ul className="mt-6 space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> 5 User Seats</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> 2 Assigned Workflows</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> 14-Day Free Trial</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Standard Support</li>
              </ul>
            </div>
            <Link
              to="/auth/signup"
              className="mt-8 w-full py-2.5 text-center text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
            >
              Start 14-Day Trial
            </Link>
          </div>

          {/* Growth */}
          <div className="p-6 rounded-2xl bg-slate-900/90 border border-blue-500/50 shadow-xl shadow-blue-500/10 flex flex-col justify-between relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-blue-600 text-[10px] font-bold text-white uppercase tracking-wider">
              Most Popular
            </div>
            <div>
              <span className="text-xs font-bold text-indigo-400 uppercase">Growth</span>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">$299</span>
                <span className="text-xs text-slate-500">/month</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">Scaling businesses with multi-department needs.</p>
              <ul className="mt-6 space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> 25 User Seats</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> 5 Assigned Workflows</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> 14-Day Free Trial</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Advanced AI Fallbacks</li>
              </ul>
            </div>
            <Link
              to="/auth/signup"
              className="mt-8 w-full py-2.5 text-center text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg transition-all"
            >
              Start 14-Day Trial
            </Link>
          </div>

          {/* Enterprise */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-purple-400 uppercase">Enterprise</span>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">$999</span>
                <span className="text-xs text-slate-500">/month</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">Unlimited power and dedicated control.</p>
              <ul className="mt-6 space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Unlimited User Seats</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Unlimited Workflows</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Custom AI Provider Keys</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Dedicated Account Manager</li>
              </ul>
            </div>
            <Link
              to="/auth/signup"
              className="mt-8 w-full py-2.5 text-center text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ Section ─────────────────────────────────────────────────── */}
      <section id="faq" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-slate-800/80">
        <div className="text-center mb-16">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-400">Frequently Asked Questions</h2>
          <p className="mt-2 text-3xl font-extrabold text-white">Everything You Need to Know</p>
        </div>

        <div className="space-y-4">
          {[
            {
              q: 'How is workflow access enforced across the platform?',
              a: 'Workflow access is enforced strictly at the backend security boundary via `assert_workflow_access`. Access is granted only when an organization is active, has a valid active trial or subscription plan, and the specific workflow is assigned.'
            },
            {
              q: 'How does the 14-day free trial work?',
              a: 'Every new organization starts with a 14-day trial persisted in the database with exact start and expiration timestamps. Backend logic enforces the trial window automatically.'
            },
            {
              q: 'What happens if a provider model cost is unavailable?',
              a: 'SMBFlow tracks exact usage tokens and costs in an append-only ledger. When provider cost data is unavailable, the platform explicitly records and renders "Unavailable" rather than displaying inaccurate zero values.'
            },
            {
              q: 'Can we configure custom AI provider routing?',
              a: 'Yes. Platform Admins can set global primary, fallback, and image generation providers via the Routing Control Plane.'
            }
          ].map((item, idx) => (
            <div
              key={idx}
              className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden cursor-pointer transition-colors hover:border-slate-700"
              onClick={() => toggleFaq(idx)}
            >
              <div className="p-5 flex items-center justify-between font-semibold text-white text-sm">
                <span>{item.q}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openFaq === idx ? 'rotate-180 text-blue-400' : ''}`} />
              </div>
              {openFaq === idx && (
                <div className="px-5 pb-5 text-xs text-slate-400 leading-relaxed border-t border-slate-800/50 pt-3">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA Banner ────────────────────────────────────────────── */}
      <section className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="rounded-3xl bg-gradient-to-r from-blue-900/50 via-indigo-900/50 to-slate-900/90 border border-blue-500/30 p-10 md:p-16 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Ready to Automate Your Business Operations?</h2>
          <p className="mt-4 text-slate-300 max-w-xl mx-auto text-sm sm:text-base">
            Get started today with a 14-day fully-featured trial. No complex setup required.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              to="/auth/signup"
              className="px-8 py-3.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-xl shadow-blue-600/30 transition-all flex items-center gap-2 group"
            >
              Get Started Now
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-slate-800/80 py-12 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
              S
            </div>
            <span className="font-semibold text-slate-300">SMBFlow Platform</span>
            <span>© {new Date().getFullYear()} SMBFlow Inc. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/auth" className="hover:text-slate-300 transition-colors">Sign In</Link>
            <Link to="/auth/signup" className="hover:text-slate-300 transition-colors">Sign Up</Link>
            <a href="#privacy" className="hover:text-slate-300 transition-colors">Privacy Policy</a>
            <a href="#terms" className="hover:text-slate-300 transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
