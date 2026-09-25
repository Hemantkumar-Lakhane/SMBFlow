// frontend/src/pages/client/CopilotPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Clean, Modern Enterprise AI Assistant & Workflow Orchestrator
// Features:
//   • Dual-theme responsive design (light slate & dark enterprise obsidian)
//   • Custom Tool Logo Loader with image path support (/assets/tools/{name}.png)
//   • Real-time Voice / Microphone Input (Web Speech API + Backend Whisper fallback)
//   • Clean, unified category pills without rainbow coloring
//   • Dynamic live SVG Canvas Node Graph with authentic tool brand logos & flow pulses
//   • Smooth full-page vertical scrolling (overflow-y-auto)
//   • Conversational Execution Mode with Node Inspection Drawers
//   • Zero saffron/orange, zero purple, pure enterprise aesthetics
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, Zap, Bot, ArrowRight, Play, CheckCircle2,
  Clock, ChevronDown, ChevronRight, Inbox, ShieldAlert,
  BarChart3, Rocket, RefreshCw, Cpu, Layers, HelpCircle,
  ArrowUpRight, Check, Copy, Plus, Mic, ArrowUp, FileText,
  Calendar, Database, MessageSquare, Mail, Share2, CornerDownRight,
  Sliders, ArrowLeft, Terminal, Server, Square
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

// ── Tool Logo with Image Asset Support & Vector Fallback ──────────────────────
function ToolLogo({ name, className = 'w-4 h-4' }) {
  const [imgSrc, setImgSrc] = useState(() => {
    if (!name) return null
    if (name === 'sheets' || name === 'sheet') return '/assets/tools/sheet.png'
    return `/assets/tools/${name}.png`
  })
  const [useFallback, setUseFallback] = useState(false)

  // Clean fallback SVG icons if image fails to load
  const svgFallbacks = {
    gmail: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6Z" fill="#EA4335" fillOpacity="0.15" />
        <path d="M20 4H4C2.9 4 2 4.9 2 6L12 13L22 6C22 4.9 21.1 4 20 4Z" fill="#EA4335" />
        <path d="M2 18V6L12 13L22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18Z" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    sheets: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#0F9D58" fillOpacity="0.2" stroke="#0F9D58" strokeWidth="1.5" />
        <path d="M7 8H17M7 12H17M7 16H17M12 8V16" stroke="#0F9D58" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    sheet: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#0F9D58" fillOpacity="0.2" stroke="#0F9D58" strokeWidth="1.5" />
        <path d="M7 8H17M7 12H17M7 16H17M12 8V16" stroke="#0F9D58" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    calendar: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="17" rx="3" fill="#4285F4" fillOpacity="0.2" stroke="#4285F4" strokeWidth="1.5" />
        <path d="M16 2V6M8 2V6M3 9H21" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="14" r="1.5" fill="#4285F4" />
      </svg>
    ),
    claude: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.5 3L11.5 8L15 11.5L9.5 13L8 21L11.5 15.5L16 17L14.5 11L19.5 9.5L13.5 3Z" fill="#D97706" />
      </svg>
    ),
    openai: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2z" fill="#10B981" fillOpacity="0.15" />
        <path d="M12 6v12M6 12h12M7.75 7.75l8.5 8.5M7.75 16.25l8.5-8.5" />
      </svg>
    ),
    slack: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="4" fill="#EC4899" fillOpacity="0.15" stroke="#EC4899" strokeWidth="1.5" />
        <path d="M8 12H16M12 8V16" stroke="#EC4899" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    telegram: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M21.5 3.5L2 11.5L8.5 14.5L18 6.5L11 16.5L17.5 20.5L21.5 3.5Z" fill="#229ED9" fillOpacity="0.2" stroke="#229ED9" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    hubspot: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="5" fill="#FF7A59" fillOpacity="0.2" stroke="#FF7A59" strokeWidth="1.5" />
        <path d="M12 3V7M12 17V21M3 12H7M17 12H21" stroke="#FF7A59" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    postgres: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#336791" strokeWidth="1.5">
        <ellipse cx="12" cy="5" rx="9" ry="3" fill="#336791" fillOpacity="0.2" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
    webhook: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="12" r="3" fill="#3B82F6" fillOpacity="0.2" />
        <circle cx="18" cy="6" r="3" fill="#3B82F6" fillOpacity="0.2" />
        <circle cx="18" cy="18" r="3" fill="#3B82F6" fillOpacity="0.2" />
        <path d="M9 12H12M12 12L15 6M12 12L15 18" />
      </svg>
    ),
  }

  function handleError() {
    if (imgSrc === '/assets/tools/sheets.png') {
      setImgSrc('/assets/tools/sheet.png')
    } else if (imgSrc === '/assets/tools/sheet.png') {
      setImgSrc('/assets/tools/sheets.png')
    } else {
      setUseFallback(true)
    }
  }

  if (!useFallback && imgSrc) {
    return (
      <img
        src={imgSrc}
        alt={name}
        className={`${className} object-contain`}
        onError={handleError}
      />
    )
  }

  return svgFallbacks[name] || <Zap className={className} />
}

// ── Workflow Templates ────────────────────────────────────────────────────────
// ── Workflow Templates with Rich Inspection Properties ────────────────────────
const TEMPLATES = [
  {
    id: 'invoices',
    label: 'Process invoices',
    iconName: 'sheets',
    prompt:
      'Every morning, scan Gmail for new invoices, use Claude to extract details and cross-check them against purchase orders in Google Sheets, flag any discrepancies for review, and add all payment due dates to Google Calendar automatically.',
    nodes: [
      {
        id: '1',
        title: 'INVOICE RECEIVED',
        subtitle: 'Trigger: 08:00 AM Daily',
        brand: 'Gmail',
        tool: 'gmail',
        color: '#EA4335',
        type: 'Trigger (Cron & Polling)',
        x: 40,
        y: 110,
        config: {
          schedule: '0 8 * * 1-5 (Mon-Fri 08:00 AM)',
          query: 'from:invoices@* has:attachment filename:pdf',
          batchSize: 25,
          autoAcknowledge: true,
        },
        sampleInput: {
          event: 'cron_tick',
          timestamp: '2026-09-25T08:00:00Z',
          mailbox: 'accounts@company.com',
        },
        sampleOutput: {
          messageId: 'msg_9847291a',
          sender: 'billing@vendor-saas.io',
          subject: 'Monthly Cloud Infrastructure Invoice #INV-2026-891',
          hasAttachment: true,
          attachmentCount: 1,
        },
      },
      {
        id: '2',
        title: 'Fetch attachment',
        subtitle: 'Gmail API',
        brand: 'Gmail',
        tool: 'gmail',
        color: '#EA4335',
        type: 'Integration Action',
        x: 230,
        y: 110,
        config: {
          format: 'binary/pdf',
          extractTextOCR: true,
          saveToVault: true,
        },
        sampleInput: {
          messageId: 'msg_9847291a',
          attachmentId: 'att_014298fa',
        },
        sampleOutput: {
          fileName: 'Invoice_INV_2026_891.pdf',
          fileSizeKB: 245,
          contentType: 'application/pdf',
          ocrConfidence: 0.994,
        },
      },
      {
        id: '3',
        title: 'Extract invoice data',
        subtitle: 'Claude 3.5 Sonnet',
        brand: 'Claude',
        tool: 'claude',
        color: '#D97706',
        type: 'AI LLM Agent',
        x: 420,
        y: 110,
        config: {
          model: 'claude-3-5-sonnet-20241022',
          temperature: 0.1,
          jsonSchema: '{ vendor: string, amount: number, po_number: string, due_date: string }',
        },
        sampleInput: {
          rawText: 'INVOICE INV-2026-891\nVendor: Cloud Infra Ltd\nTotal: $1,450.00\nPO: PO-8921\nDue: 2026-10-15',
        },
        sampleOutput: {
          vendor: 'Cloud Infra Ltd',
          amount: 1450.0,
          currency: 'USD',
          poNumber: 'PO-8921',
          dueDate: '2026-10-15',
          confidence: 0.98,
        },
      },
      {
        id: '4',
        title: 'Check discrepancy',
        subtitle: 'Switch Node',
        brand: 'Switch',
        tool: 'webhook',
        color: '#10B981',
        type: 'Conditional Router',
        x: 610,
        y: 110,
        config: {
          expression: 'invoice.amount == sheets.po_amount && invoice.vendor == sheets.vendor',
          trueRoute: 'Add to Calendar',
          falseRoute: 'Flag Invoice',
        },
        sampleInput: {
          invoiceAmount: 1450.0,
          expectedPoAmount: 1450.0,
          vendorMatch: true,
        },
        sampleOutput: {
          decision: 'Approved',
          matchedRow: 42,
          varianceUsd: 0.0,
        },
      },
      {
        id: '5',
        title: 'Flag Invoice',
        subtitle: 'Google Sheets',
        brand: 'Sheets',
        tool: 'sheets',
        color: '#0F9D58',
        type: 'Exception Handler',
        x: 800,
        y: 50,
        config: {
          spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          sheetName: 'Discrepancies_Review',
          statusColumn: 'FLAGGED_VARIANCE',
        },
        sampleInput: {
          status: 'PENDING_HUMAN_REVIEW',
          variance: 150.0,
        },
        sampleOutput: {
          rowUpdated: 114,
          escalationCreated: true,
        },
      },
      {
        id: '6',
        title: 'Add to Calendar',
        subtitle: 'Google Calendar',
        brand: 'Calendar',
        tool: 'calendar',
        color: '#4285F4',
        type: 'Destination Sync',
        x: 800,
        y: 170,
        config: {
          calendarId: 'primary',
          eventTitle: 'Pay Invoice #INV-2026-891 ($1,450.00)',
          reminderDaysBefore: 2,
        },
        sampleInput: {
          summary: 'Pay Invoice #INV-2026-891',
          date: '2026-10-15',
          attendees: ['finance@company.com'],
        },
        sampleOutput: {
          calendarEventId: 'cal_event_81726a',
          eventLink: 'https://calendar.google.com/event?id=cal_event_81726a',
          status: 'confirmed',
        },
      },
    ],
    edges: [
      { from: '1', to: '2' },
      { from: '2', to: '3' },
      { from: '3', to: '4' },
      { from: '4', to: '5', label: 'Discrepancy' },
      { from: '4', to: '6', label: 'Approved' },
    ],
  },
  {
    id: 'leads',
    label: 'Score my leads',
    iconName: 'openai',
    prompt:
      'When a new lead submits our website contact form, enrich company data with Clearbit, score conversion intent with GPT-4o, automatically update HubSpot CRM, and alert our sales team in Slack if the score is above 80.',
    nodes: [
      {
        id: '1',
        title: 'Lead Form Submit',
        subtitle: 'Webhook Trigger',
        brand: 'Webhook',
        tool: 'webhook',
        color: '#3B82F6',
        type: 'Inbound Webhook',
        x: 40,
        y: 110,
        config: { path: '/v1/leads/inbound', method: 'POST', authHeader: 'Bearer x-opsgrid-key' },
        sampleInput: { email: 'sarah.j@acme-corp.com', name: 'Sarah Jenkins', employees: '250+' },
        sampleOutput: { status: 'received', leadId: 'lead_781290' },
      },
      {
        id: '2',
        title: 'Company Intelligence',
        subtitle: 'Enrich data',
        brand: 'Clearbit',
        tool: 'postgres',
        color: '#3B82F6',
        type: 'Data Enrichment',
        x: 230,
        y: 110,
        config: { endpoint: 'api.clearbit.com/v2/companies/find', matchConfidence: 0.95 },
        sampleInput: { domain: 'acme-corp.com' },
        sampleOutput: { industry: 'Enterprise SaaS', funding: '$45M Series B', techStack: ['AWS', 'Stripe'] },
      },
      {
        id: '3',
        title: 'Intent Scoring',
        subtitle: 'GPT-4o Mini',
        brand: 'OpenAI',
        tool: 'openai',
        color: '#10B981',
        type: 'AI LLM Agent',
        x: 420,
        y: 110,
        config: { model: 'gpt-4o-mini', temperature: 0.2, rubric: 'B2B SMB suitability 0-100' },
        sampleInput: { companyProfile: 'Enterprise SaaS 250+ employees', userRole: 'VP of Ops' },
        sampleOutput: { intentScore: 92, tier: 'Tier-1 High Intent', reason: 'Decision maker with active budget' },
      },
      {
        id: '4',
        title: 'Score Filter',
        subtitle: 'Score > 80?',
        brand: 'Filter',
        tool: 'webhook',
        color: '#F59E0B',
        type: 'Routing Rule',
        x: 610,
        y: 110,
        config: { condition: 'lead.intentScore >= 80', fallback: 'Nurture Campaign' },
        sampleInput: { intentScore: 92 },
        sampleOutput: { passed: true, route: 'VIP Escalation' },
      },
      {
        id: '5',
        title: 'Update CRM Contact',
        subtitle: 'HubSpot',
        brand: 'HubSpot',
        tool: 'hubspot',
        color: '#FF7A59',
        type: 'CRM Mutation',
        x: 800,
        y: 50,
        config: { objectType: 'contacts', updateLifecycleStage: 'salesqualifiedlead' },
        sampleInput: { email: 'sarah.j@acme-corp.com', score: 92 },
        sampleOutput: { contactId: 'hs_902184', status: 'updated' },
      },
      {
        id: '6',
        title: 'Sales VIP Alert',
        subtitle: 'Slack Channel',
        brand: 'Slack',
        tool: 'slack',
        color: '#EC4899',
        type: 'Real-time Alert',
        x: 800,
        y: 170,
        config: { channel: '#sales-tier1-leads', mentions: ['@account-execs'], includeOneClickBook: true },
        sampleInput: { lead: 'Sarah Jenkins (VP Ops - Acme)', score: 92 },
        sampleOutput: { messageTs: '1727271920.001900', delivered: true },
      },
    ],
    edges: [
      { from: '1', to: '2' },
      { from: '2', to: '3' },
      { from: '3', to: '4' },
      { from: '4', to: '5' },
      { from: '4', to: '6', label: 'VIP Lead' },
    ],
  },
  {
    id: 'social',
    label: 'Schedule social posts',
    iconName: 'calendar',
    prompt:
      'Extract new article drafts from our CMS, use Claude to generate tailored promotional posts for LinkedIn and Twitter/X, create custom banner graphics with ImageRouter, and stage them for human review in Action Center.',
    nodes: [
      {
        id: '1',
        title: 'New Article Draft',
        subtitle: 'CMS Webhook',
        brand: 'CMS',
        tool: 'webhook',
        color: '#6366F1',
        type: 'Webhook Trigger',
        x: 40,
        y: 110,
        config: { event: 'article.published_draft', source: 'Ghost / Sanity CMS' },
        sampleInput: { slug: 'automating-smb-ops-in-2026', title: 'How AI Streamlines SMB Workflows' },
        sampleOutput: { words: 1200, author: 'Alex Chen', ready: true },
      },
      {
        id: '2',
        title: 'Multi-Channel Copy',
        subtitle: 'Claude 3.5 Sonnet',
        brand: 'Claude',
        tool: 'claude',
        color: '#D97706',
        type: 'AI LLM Agent',
        x: 230,
        y: 110,
        config: { model: 'claude-3-5-sonnet-20241022', channels: ['linkedin', 'twitter'] },
        sampleInput: { articleText: 'Full 1,200 word draft text...' },
        sampleOutput: { linkedinPost: 'Excited to share our insights...', twitterThread: ['1/4 SMB ops is broken...'] },
      },
      {
        id: '3',
        title: 'Visual Generator',
        subtitle: 'ImageRouter AI',
        brand: 'ImageRouter',
        tool: 'openai',
        color: '#3B82F6',
        type: 'Generative AI',
        x: 420,
        y: 110,
        config: { aspect: '16:9', style: 'clean corporate tech infographic' },
        sampleInput: { prompt: 'Minimalist workflow orchestration dashboard illustration' },
        sampleOutput: { imageUrl: 'https://cdn.smbflow.io/assets/banner_9812.png', width: 1200, height: 675 },
      },
      {
        id: '4',
        title: 'Action Center HITL',
        subtitle: 'Human Approval',
        brand: 'SMBFlow',
        tool: 'webhook',
        color: '#F59E0B',
        type: 'Human-in-the-Loop',
        x: 610,
        y: 110,
        config: { queue: 'marketing_review', timeoutHours: 24, autoApproveFallback: false },
        sampleInput: { copyReviewId: 'rev_89128', pendingAssignee: 'marketing_lead' },
        sampleOutput: { decision: 'approved', signedBy: 'Marketing Lead' },
      },
      {
        id: '5',
        title: 'LinkedIn Post',
        subtitle: 'Buffer / API',
        brand: 'LinkedIn',
        tool: 'slack',
        color: '#0077B5',
        type: 'Social Publishing',
        x: 800,
        y: 50,
        config: { network: 'linkedin_organization', scheduleFor: '2026-09-26T14:00:00Z' },
        sampleInput: { content: 'Approved copy & graphic' },
        sampleOutput: { queuePosition: 1, scheduledTime: 'Tomorrow 2:00 PM' },
      },
      {
        id: '6',
        title: 'Twitter/X Post',
        subtitle: 'X API v2',
        brand: 'Twitter',
        tool: 'telegram',
        color: '#64748B',
        type: 'Social Publishing',
        x: 800,
        y: 170,
        config: { network: 'twitter_x_v2', threadMode: true },
        sampleInput: { tweetsCount: 3 },
        sampleOutput: { scheduledId: 'tweet_sched_8912', status: 'queued' },
      },
    ],
    edges: [
      { from: '1', to: '2' },
      { from: '2', to: '3' },
      { from: '3', to: '4' },
      { from: '4', to: '5', label: 'Approved' },
      { from: '4', to: '6', label: 'Approved' },
    ],
  },
  {
    id: 'telegram',
    label: 'Telegram support agent',
    iconName: 'telegram',
    prompt:
      'Listen for incoming customer queries on Telegram, search our company knowledge base in PostgreSQL vector embeddings, generate accurate support answers with Gemini, and escalate any refund tickets directly to human operators.',
    nodes: [
      {
        id: '1',
        title: 'New Message',
        subtitle: 'Telegram Bot API',
        brand: 'Telegram',
        tool: 'telegram',
        color: '#229ED9',
        type: 'Bot Webhook Trigger',
        x: 40,
        y: 110,
        config: { botTokenConfig: 'vault://telegram_token', polling: 'webhook_realtime' },
        sampleInput: { chatId: 98129038, text: 'Hi, I need assistance with my last order refund' },
        sampleOutput: { sender: '@customer_user', messageId: 4410 },
      },
      {
        id: '2',
        title: 'Vector Search',
        subtitle: 'PGVector KB',
        brand: 'PostgreSQL',
        tool: 'postgres',
        color: '#336791',
        type: 'Vector Embedding Retrieval',
        x: 230,
        y: 110,
        config: { embeddingModel: 'text-embedding-3-small', similarityThreshold: 0.82, topK: 3 },
        sampleInput: { query: 'refund policy order terms' },
        sampleOutput: { matchedChunks: 3, topScore: 0.91, docTitle: 'Refund_Policy_2026.pdf' },
      },
      {
        id: '3',
        title: 'Draft Solution',
        subtitle: 'Gemini 1.5 Pro',
        brand: 'Gemini',
        tool: 'openai',
        color: '#4285F4',
        type: 'AI LLM Agent',
        x: 420,
        y: 110,
        config: { model: 'gemini-1.5-pro', tone: 'helpful, professional', maxTokens: 400 },
        sampleInput: { context: 'Refund policy chunk...', userQuestion: 'I need assistance...' },
        sampleOutput: { answer: 'I understand you are requesting a refund. I am transferring your request to our support specialist...' },
      },
      {
        id: '4',
        title: 'Intent Classifier',
        subtitle: 'Refund Check',
        brand: 'Classifier',
        tool: 'webhook',
        color: '#10B981',
        type: 'Intent Classifier',
        x: 610,
        y: 110,
        config: { classes: ['General_Inquiry', 'Refund_Escalation', 'Technical_Bug'] },
        sampleInput: { intent: 'Refund_Escalation', confidence: 0.96 },
        sampleOutput: { route: 'Human Escalation' },
      },
      {
        id: '5',
        title: 'Instant Reply',
        subtitle: 'Send to Customer',
        brand: 'Telegram',
        tool: 'telegram',
        color: '#229ED9',
        type: 'Outgoing Message',
        x: 800,
        y: 50,
        config: { parseMode: 'MarkdownV2', replyToMessage: true },
        sampleInput: { chatId: 98129038, text: 'Your refund case has been transferred to an agent...' },
        sampleOutput: { messageSent: true, telegramMsgId: 4411 },
      },
      {
        id: '6',
        title: 'Human Escalation',
        subtitle: 'Action Center',
        brand: 'SMBFlow',
        tool: 'webhook',
        color: '#EF4444',
        type: 'HITL Escalation',
        x: 800,
        y: 170,
        config: { priority: 'P1_HIGH', targetTeam: 'Customer Success Leads', notifyEmail: true },
        sampleInput: { customerId: 'cust_8912', reason: 'Refund request on order #ORD-980' },
        sampleOutput: { escalationTicket: 'ESC-2026-092', status: 'Pending Review' },
      },
    ],
    edges: [
      { from: '1', to: '2' },
      { from: '2', to: '3' },
      { from: '3', to: '4' },
      { from: '4', to: '5', label: 'Standard' },
      { from: '4', to: '6', label: 'Refund' },
    ],
  },
]

// ── Interactive Canvas Node Graph Component ───────────────────────────────────
function CanvasPreview({ template }) {
  const nodeWidth = 150
  const nodeHeight = 56
  const [selectedNode, setSelectedNode] = useState(template.nodes[0] || null)
  const [zoom, setZoom] = useState(1)
  const [isTestingStep, setIsTestingStep] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [copiedPayload, setCopiedPayload] = useState(null)
  const containerRef = useRef(null)

  // Reset selected node when template changes
  useEffect(() => {
    if (template?.nodes?.length > 0) {
      setSelectedNode(template.nodes[0])
      setTestResult(null)
    }
  }, [template])

  function handleCopy(label, data) {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopiedPayload(label)
    setTimeout(() => setCopiedPayload(null), 2000)
  }

  function handleTestStep() {
    if (!selectedNode || isTestingStep) return
    setIsTestingStep(true)
    setTestResult(null)
    setTimeout(() => {
      setIsTestingStep(false)
      setTestResult({
        status: 'success',
        durationMs: Math.floor(Math.random() * 80) + 35,
        timestamp: new Date().toLocaleTimeString(),
      })
    }, 600)
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-6 bg-white dark:bg-[#121826] rounded-2xl border border-slate-200 dark:border-[#233048] shadow-md overflow-hidden relative transition-all flex flex-col">
      {/* Canvas Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-[#233048] bg-slate-50 dark:bg-[#0b0f17]/90 z-10 relative">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-mono text-slate-700 dark:text-slate-300 font-medium">
            Pipeline Preview: <span className="text-blue-600 dark:text-blue-400 font-semibold">{template.label}</span>
          </span>
        </div>

        {/* Zoom & Scroll controls */}
        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
          <div className="hidden sm:flex items-center bg-slate-100 dark:bg-[#182234] border border-slate-300 dark:border-[#233048] rounded-lg p-0.5">
            <button
              onClick={() => setZoom(z => Math.max(0.7, Number((z - 0.1).toFixed(1))))}
              className="px-2 py-0.5 hover:bg-white dark:hover:bg-[#202c42] rounded text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Zoom out"
            >
              -
            </button>
            <span className="px-1.5 text-[9.5px] text-slate-600 dark:text-slate-300 select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(1.4, Number((z + 0.1).toFixed(1))))}
              className="px-2 py-0.5 hover:bg-white dark:hover:bg-[#202c42] rounded text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Zoom in"
            >
              +
            </button>
            <button
              onClick={() => setZoom(1)}
              className="px-1.5 py-0.5 hover:bg-white dark:hover:bg-[#202c42] rounded text-[9px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              title="Reset Zoom"
            >
              Reset
            </button>
          </div>

          <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-[#182234] border border-slate-300 dark:border-[#233048] text-slate-700 dark:text-slate-300">
            Interactive Canvas
          </span>
        </div>
      </div>

      {/* SVG Canvas Graph with Smooth Scrolling & Panning */}
      <div
        ref={containerRef}
        className="p-4 sm:p-6 overflow-x-auto overflow-y-auto max-h-[300px] flex items-center justify-start sm:justify-center relative bg-slate-50/50 dark:bg-[#0b0f17]/40 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 select-none cursor-grab active:cursor-grabbing"
      >
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }}
          className="shrink-0"
        >
          <svg className="w-[980px] h-[240px] overflow-visible">
            {/* Edge Connectors */}
            {template.edges.map((edge, idx) => {
              const fromNode = template.nodes.find(n => n.id === edge.from)
              const toNode = template.nodes.find(n => n.id === edge.to)
              if (!fromNode || !toNode) return null

              const startX = fromNode.x + nodeWidth
              const startY = fromNode.y + nodeHeight / 2
              const endX = toNode.x
              const endY = toNode.y + nodeHeight / 2
              const midX = (startX + endX) / 2

              const pathData = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`

              return (
                <g key={idx}>
                  {/* Glow Line */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    strokeOpacity="0.2"
                  />
                  {/* Main Connector Line */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke="#64748b"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                  />
                  {/* Flow Pulse */}
                  <circle r="3" fill="#3b82f6">
                    <animateMotion
                      path={pathData}
                      dur="2.5s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  {/* Edge Label */}
                  {edge.label && (
                    <text
                      x={midX}
                      y={(startY + endY) / 2 - 6}
                      fill="#64748b"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Interactive Clickable Nodes */}
            {template.nodes.map((node, nIdx) => {
              const isSelected = selectedNode?.id === node.id

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedNode(node)
                  }}
                  className="cursor-pointer group"
                >
                  {/* Active Selected Halo */}
                  {isSelected && (
                    <rect
                      x="-4"
                      y="-4"
                      width={nodeWidth + 8}
                      height={nodeHeight + 8}
                      rx="14"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2.5"
                      strokeDasharray="4 2"
                      className="animate-pulse"
                    />
                  )}

                  {/* Node Box */}
                  <rect
                    width={nodeWidth}
                    height={nodeHeight}
                    rx="10"
                    fill="currentColor"
                    className={`text-white dark:text-[#182030] fill-current transition-all shadow-xs ${
                      isSelected
                        ? 'stroke-blue-500 shadow-md'
                        : 'stroke-slate-300 dark:stroke-[#2b374c] group-hover:stroke-blue-400'
                    }`}
                    strokeWidth={isSelected ? '2' : '1.5'}
                  />

                  {/* Left Colored Accent Bar */}
                  <rect
                    x="0"
                    y="0"
                    width="4"
                    height={nodeHeight}
                    rx="2"
                    fill={node.color}
                  />

                  {/* Icon Container */}
                  <g transform="translate(10, 14)">
                    <rect
                      width="26"
                      height="26"
                      rx="6"
                      fill={node.color}
                      fillOpacity="0.15"
                    />
                    <foreignObject width="26" height="26">
                      <div className="w-full h-full flex items-center justify-center pointer-events-none">
                        <ToolLogo name={node.tool} className="w-4 h-4" />
                      </div>
                    </foreignObject>
                  </g>

                  {/* Text Content */}
                  <text
                    x="42"
                    y="24"
                    className="fill-slate-900 dark:fill-slate-100 select-none"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {node.title.length > 14 ? node.title.slice(0, 13) + '…' : node.title}
                  </text>
                  <text
                    x="42"
                    y="39"
                    className="fill-slate-500 dark:fill-slate-400 select-none"
                    fontSize="9.5"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {node.subtitle.length > 16 ? node.subtitle.slice(0, 15) + '…' : node.subtitle}
                  </text>

                  {/* Status Check Badge */}
                  <circle cx={nodeWidth - 10} cy="12" r="4" fill="#10b981" />
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* ── Interactive Node Inspection Panel (Displays When Node is Clicked) ── */}
      {selectedNode && (
        <div className="border-t border-slate-200 dark:border-[#233048] bg-slate-50 dark:bg-[#0b0f17] p-4 transition-all">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-200 dark:border-[#233048]">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center p-1.5 shadow-2xs"
                style={{ backgroundColor: `${selectedNode.color}20`, border: `1px solid ${selectedNode.color}50` }}
              >
                <ToolLogo name={selectedNode.tool} className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">{selectedNode.title}</h4>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-slate-200 dark:bg-[#182234] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-[#233048]">
                    {selectedNode.type}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  {selectedNode.subtitle} · Connected Brand: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedNode.brand}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTestStep}
                disabled={isTestingStep}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                <Play size={12} className={isTestingStep ? 'animate-spin' : 'fill-white'} />
                <span>{isTestingStep ? 'Executing step...' : 'Test Step'}</span>
              </button>

              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                title="Close inspector"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Test Execution Result Banner */}
          {testResult && (
            <div className="mb-3 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                <span>Node test executed successfully in <strong>{testResult.durationMs}ms</strong> at {testResult.timestamp}</span>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 rounded">
                HTTP 200 OK
              </span>
            </div>
          )}

          {/* Configuration & Payload Data Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* 1. Step Parameters */}
            <div className="p-3 bg-white dark:bg-[#121826] rounded-xl border border-slate-200 dark:border-[#233048]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Node Configuration
                </span>
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="space-y-1.5 font-mono text-[10.5px]">
                {selectedNode.config &&
                  Object.entries(selectedNode.config).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-[#1a2336] pb-1 last:border-0 last:pb-0">
                      <span className="text-slate-500 dark:text-slate-400 truncate">{k}:</span>
                      <span className="text-slate-900 dark:text-slate-200 font-semibold truncate text-right max-w-[130px]">
                        {typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* 2. Mock Input Payload */}
            <div className="p-3 bg-white dark:bg-[#121826] rounded-xl border border-slate-200 dark:border-[#233048]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Input Stream
                </span>
                <button
                  onClick={() => handleCopy('input', selectedNode.sampleInput)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  title="Copy Input JSON"
                >
                  {copiedPayload === 'input' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </button>
              </div>
              <pre className="text-[10px] font-mono text-slate-700 dark:text-slate-300 max-h-24 overflow-x-auto overflow-y-auto leading-tight bg-slate-50 dark:bg-[#0b0f17] p-2 rounded border border-slate-100 dark:border-[#1a2336]">
                {JSON.stringify(selectedNode.sampleInput, null, 2)}
              </pre>
            </div>

            {/* 3. Output Stream */}
            <div className="p-3 bg-white dark:bg-[#121826] rounded-xl border border-slate-200 dark:border-[#233048]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Output Result
                </span>
                <button
                  onClick={() => handleCopy('output', selectedNode.sampleOutput)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  title="Copy Output JSON"
                >
                  {copiedPayload === 'output' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </button>
              </div>
              <pre className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 max-h-24 overflow-x-auto overflow-y-auto leading-tight bg-slate-50 dark:bg-[#0b0f17] p-2 rounded border border-slate-100 dark:border-[#1a2336]">
                {JSON.stringify(selectedNode.sampleOutput, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Node Execution Drawer (Conversation View) ─────────────────────────────────
function NodeExecutionPipeline({ nodes }) {
  const [expandedNodeId, setExpandedNodeId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  if (!nodes || nodes.length === 0) return null

  function handleCopy(id, data) {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="my-3 p-3.5 bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-[#233048] shadow-2xs">
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200 dark:border-[#233048] text-xs font-semibold text-slate-700 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="tracking-wide uppercase text-[11px] text-slate-500 dark:text-slate-400 font-mono">Execution Pipeline</span>
        </div>
        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 rounded-full">
          {nodes.length} Nodes Executed · Success
        </span>
      </div>

      <div className="space-y-2">
        {nodes.map((node, idx) => {
          const isExpanded = expandedNodeId === node.id
          const hasData = node.input_data || node.output_data

          return (
            <div key={node.id || idx} className="rounded-lg border border-slate-200 dark:border-[#233048] bg-white dark:bg-[#121826] overflow-hidden transition-all">
              <div
                onClick={() => hasData && setExpandedNodeId(isExpanded ? null : node.id)}
                className={`flex items-center justify-between p-2.5 ${hasData ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-[#182234]' : ''}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-200 truncate">{node.name}</p>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider">{node.type}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> {node.duration_ms}ms
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/40">
                    <CheckCircle2 className="w-2.5 h-2.5" /> OK
                  </span>
                  {hasData && (
                    <button type="button" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && hasData && (
                <div className="p-3 bg-slate-50 dark:bg-[#0b0f17] border-t border-slate-200 dark:border-[#233048] text-[11px] font-mono text-slate-800 dark:text-slate-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {node.input_data && (
                      <div className="bg-white dark:bg-[#121826] rounded p-2 border border-slate-200 dark:border-[#233048]">
                        <div className="flex justify-between items-center mb-1 text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">
                          <span>Input Payload</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopy(`in_${node.id}`, node.input_data) }}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {copiedId === `in_${node.id}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <pre className="overflow-x-auto max-h-32 text-[10px] text-slate-800 dark:text-slate-300">
                          {JSON.stringify(node.input_data, null, 2)}
                        </pre>
                      </div>
                    )}

                    {node.output_data && (
                      <div className="bg-white dark:bg-[#121826] rounded p-2 border border-slate-200 dark:border-[#233048]">
                        <div className="flex justify-between items-center mb-1 text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">
                          <span>Output Result</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopy(`out_${node.id}`, node.output_data) }}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {copiedId === `out_${node.id}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <pre className="overflow-x-auto max-h-32 text-[10px] text-emerald-600 dark:text-emerald-300">
                          {JSON.stringify(node.output_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Copilot / Assistant Page Component ───────────────────────────────────
export default function CopilotPage() {
  const navigate = useNavigate()
  const { user, api } = useAuth()

  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0])
  const [hoveredTemplate, setHoveredTemplate] = useState(null)
  const [promptText, setPromptText] = useState('')
  const [hasStartedConversation, setHasStartedConversation] = useState(false)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [insights, setInsights] = useState(null)

  // Voice recognition state
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState('')
  const recognitionRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  const activeDisplayTemplate = hoveredTemplate || selectedTemplate
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    api.get('/copilot/insights')
      .then(res => setInsights(res))
      .catch(() => {})
  }, [api])

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      const recognizer = new SpeechRecognition()
      recognizer.continuous = false
      recognizer.interimResults = true
      recognizer.lang = 'en-US'

      recognizer.onstart = () => {
        setIsListening(true)
        setVoiceNotice('Listening... speak now')
      }

      recognizer.onresult = (event) => {
        let currentTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript
        }
        if (currentTranscript) {
          setPromptText((prev) => {
            const trimmed = prev.trim()
            return trimmed ? `${trimmed} ${currentTranscript}` : currentTranscript
          })
        }
      }

      recognizer.onerror = (event) => {
        console.warn('Speech recognition error:', event.error)
        setIsListening(false)
        setVoiceNotice('')
      }

      recognizer.onend = () => {
        setIsListening(false)
        setVoiceNotice('')
      }

      recognitionRef.current = recognizer
    }
  }, [])

  // Toggle Voice Input
  async function toggleVoiceInput() {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      setIsListening(false)
      setVoiceNotice('')
      return
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start()
        return
      } catch (err) {
        console.warn('Native speech recognition start failed, fallback to audio recorder', err)
      }
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert('Microphone access is not supported in this browser.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream)

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setIsListening(false)
        setIsTranscribing(true)
        setVoiceNotice('Transcribing audio...')

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const formData = new FormData()
        formData.append('audio', audioBlob, 'prompt_audio.webm')

        try {
          const res = await api.post('/copilot/transcribe', formData)
          if (res?.text) {
            setPromptText((prev) => (prev ? `${prev} ${res.text}` : res.text))
          }
        } catch (err) {
          console.error('Transcription error:', err)
        } finally {
          setIsTranscribing(false)
          setVoiceNotice('')
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsListening(true)
      setVoiceNotice('Recording audio... click mic again to finish')
    } catch (err) {
      console.error('Microphone access denied:', err)
      setVoiceNotice('Microphone permission required')
      setTimeout(() => setVoiceNotice(''), 3000)
    }
  }

  function handleSelectTemplate(tpl) {
    setSelectedTemplate(tpl)
    setPromptText(tpl.prompt)
  }

  async function handleSend(customText) {
    const query = (customText || promptText).trim()
    if (!query || loading) return

    setHasStartedConversation(true)

    const userMsg = {
      id: String(Date.now()),
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const currentHistory = messages.length === 0 ? [] : messages
    setMessages([...currentHistory, userMsg])
    setPromptText('')
    setLoading(true)

    try {
      const payload = {
        messages: [...currentHistory, userMsg].map(m => ({ role: m.role, content: m.content })),
      }

      const res = await api.post('/copilot/chat', payload)

      const assistantMsg = {
        id: res.message_id || String(Date.now() + 1),
        role: 'assistant',
        content: res.reply || 'Workflow task synthesized successfully.',
        execution_nodes: res.execution_nodes || [],
        action_cta: res.action_cta || null,
        suggested_followups: res.suggested_followups || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      const errorMsg = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: `I encountered an issue connecting to the workflow execution engine: ${err?.message || 'Network error'}. You can still navigate directly to your workflows from the sidebar.`,
        execution_nodes: [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full min-h-full bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 font-sans flex flex-col transition-colors">
      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-slate-200 dark:border-[#233048] bg-white dark:bg-[#121826] flex items-center justify-between shrink-0 sticky top-0 z-20 transition-colors">
        <div className="flex items-center gap-3">
          {hasStartedConversation && (
            <button
              onClick={() => {
                setHasStartedConversation(false)
                setMessages([])
                setPromptText('')
              }}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#182234] hover:bg-slate-200 dark:hover:bg-[#233048] text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="New Automation Canvas"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-blue-600 dark:text-blue-500" />
              <span>AI Assistant</span>
            </span>
            <span className="text-[10px] uppercase font-bold bg-slate-100 dark:bg-[#182234] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#233048] px-2 py-0.5 rounded-full font-mono">
              Preview
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-[#182234] border border-slate-200 dark:border-[#233048] text-slate-700 dark:text-slate-300 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Active Runs: {insights?.active_runs ?? 0}</span>
          </div>

          <button
            onClick={() => navigate('/workflows')}
            className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all shadow-xs cursor-pointer"
          >
            <span>Workflows</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Main Canvas / Conversation Area ─────────────────────────────────── */}
      {!hasStartedConversation ? (
        /* ── HERO VIEW ─────────────────────────────────────────────────────── */
        <div className="flex-1 px-4 py-8 md:py-12 flex flex-col items-center justify-start max-w-4xl mx-auto w-full pb-16">
          {/* Centered Heading */}
          <div className="flex items-center gap-2.5 text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-6">
            <Terminal className="w-5 h-5 text-blue-600 dark:text-blue-500" />
            <h2>What do you want to automate?</h2>
          </div>

          {/* Clean Prompt Card */}
          <div className="w-full bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] focus-within:border-blue-500 rounded-2xl p-4 shadow-md dark:shadow-xl transition-all relative">
            {voiceNotice && (
              <div className="mb-2.5 flex items-center justify-between px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-xs font-mono animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  <span>{voiceNotice}</span>
                </div>
                {isListening && (
                  <button
                    onClick={toggleVoiceInput}
                    className="text-[10px] text-blue-700 dark:text-blue-200 underline hover:text-black dark:hover:text-white"
                  >
                    Finish
                  </button>
                )}
              </div>
            )}

            <textarea
              rows={4}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Tell me what to build or ask a question – add context with +"
              className="w-full bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm md:text-base leading-relaxed resize-none focus:outline-hidden"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />

            {/* Bottom Tools inside Prompt Box */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#233048] mt-2">
              <button
                type="button"
                className="w-7 h-7 rounded-lg border border-slate-200 dark:border-[#233048] bg-slate-50 dark:bg-[#182234] hover:bg-slate-100 dark:hover:bg-[#233048] text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                title="Add context"
              >
                <Plus className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                {/* Microphone Voice Button */}
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    isListening
                      ? 'bg-red-500 text-white animate-pulse ring-2 ring-red-400'
                      : isTranscribing
                      ? 'bg-blue-600 text-white animate-spin'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#182234]'
                  }`}
                  title={isListening ? 'Stop listening' : 'Voice input (Speak to AI)'}
                >
                  {isListening ? <Square className="w-3.5 h-3.5 fill-white" /> : <Mic className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleSend(promptText || TEMPLATES[0].prompt)}
                  className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs shadow-blue-600/30"
                  title="Run Automation"
                >
                  <ArrowUp className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Clean, Unified Category Pill Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4 max-w-4xl w-full">
            {TEMPLATES.map((tpl) => {
              const isSelected = activeDisplayTemplate.id === tpl.id

              return (
                <button
                  key={tpl.id}
                  onMouseEnter={() => setHoveredTemplate(tpl)}
                  onMouseLeave={() => setHoveredTemplate(null)}
                  onClick={() => handleSelectTemplate(tpl)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-[#182234] text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-[#233048] bg-white dark:bg-[#121826] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#182234]'
                  }`}
                >
                  <ToolLogo name={tpl.iconName} className="w-3.5 h-3.5" />
                  <span>{tpl.label}</span>
                </button>
              )
            })}

            <button
              onClick={() => navigate('/workflow-library')}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium ml-1 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>See all</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Interactive Live Canvas Node Graph Preview */}
          <CanvasPreview template={activeDisplayTemplate} />
        </div>
      ) : (
        /* ── CONVERSATION & EXECUTION VIEW ─────────────────────────────────── */
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 max-w-4xl mx-auto w-full">
            {messages.map((msg) => {
              const isUser = msg.role === 'user'

              return (
                <div key={msg.id} className={`flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-[85%] md:max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`p-4 rounded-2xl text-sm leading-relaxed ${
                        isUser
                          ? 'bg-blue-600 text-white rounded-tr-xs shadow-sm'
                          : 'bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] text-slate-900 dark:text-slate-100 rounded-tl-xs shadow-2xs'
                      }`}
                    >
                      <div className="whitespace-pre-wrap font-normal">
                        {msg.content.split('\n').map((line, lIdx) => {
                          if (line.startsWith('### ')) {
                            return <h3 key={lIdx} className="text-base font-bold text-slate-900 dark:text-white my-1">{line.replace('### ', '')}</h3>
                          }
                          return <p key={lIdx} className={line === '' ? 'h-2' : ''}>{line}</p>
                        })}
                      </div>

                      {/* Visual Execution Pipeline Nodes */}
                      {!isUser && msg.execution_nodes && msg.execution_nodes.length > 0 && (
                        <NodeExecutionPipeline nodes={msg.execution_nodes} />
                      )}

                      {/* Interactive Action CTA */}
                      {!isUser && msg.action_cta && (
                        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[#233048]">
                          <button
                            onClick={() => navigate(msg.action_cta.to)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>{msg.action_cta.label}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className={`text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-1 ${isUser ? 'text-right' : 'text-left'}`}>
                      {msg.timestamp}
                    </div>

                    {/* Suggested Followups */}
                    {!isUser && msg.suggested_followups && msg.suggested_followups.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {msg.suggested_followups.map((sug, sIdx) => (
                          <button
                            key={sIdx}
                            onClick={() => handleSend(sug)}
                            className="text-xs px-3 py-1.5 bg-white dark:bg-[#121826] hover:bg-slate-100 dark:hover:bg-[#182234] border border-slate-200 dark:border-[#233048] hover:border-blue-400 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer text-left"
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold border border-slate-300 dark:border-slate-700">
                      {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
                    </div>
                  )}
                </div>
              )
            })}

            {loading && (
              <div className="flex gap-3.5 justify-start">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Bot className="w-4 h-4 animate-bounce" />
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] text-slate-700 dark:text-slate-300 rounded-tl-xs shadow-2xs flex items-center gap-2.5">
                  <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                  <span className="text-xs font-medium">Orchestrating workflow nodes & executing pipeline...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Conversation Input Box */}
          <div className="p-4 bg-white dark:bg-[#121826] border-t border-slate-200 dark:border-[#233048] shrink-0 transition-colors">
            <div className="max-w-4xl mx-auto">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSend()
                }}
                className="flex items-center gap-2 bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#233048] focus-within:border-blue-500 rounded-2xl p-2 transition-all shadow-inner"
              >
                <input
                  type="text"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="Ask AI Assistant to build a workflow, extract data, triage inbox..."
                  disabled={loading}
                  className="flex-1 bg-transparent px-3.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden disabled:opacity-50"
                />

                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`p-2 rounded-xl transition-colors ${
                    isListening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Voice input"
                >
                  <Mic className="w-4 h-4" />
                </button>

                <button
                  type="submit"
                  disabled={!promptText.trim() || loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
