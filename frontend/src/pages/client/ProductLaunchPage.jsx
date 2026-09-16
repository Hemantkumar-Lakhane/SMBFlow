// frontend/src/pages/client/ProductLaunchPage.jsx
// SMBFlow — Product Launch Sprint Workflow (AI-First Streamlined UX with Collapsible Advanced Fields)

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  Zap, Check, ArrowRight, ArrowLeft, Upload, Image as ImageIcon,
  Sparkles, Calendar as CalendarIcon, Clock, Globe, ShieldAlert, CheckCircle2,
  Edit3, RefreshCw, FileText, Share2, Layers, Filter, Plus, X, Paperclip, Download,
  ExternalLink, ChevronRight, ChevronDown, HelpCircle, Star, RotateCcw, AlertCircle, Grid, List, Wand2, Sliders
} from 'lucide-react'

// Helper for document text reading (TXT, MD, JSON, CSV, PDF/DOCX text extraction fallback)
const readDocumentText = async (file) => {
  if (!file) return ''
  try {
    if (file.type.includes('text') || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.json') || file.name.endsWith('.csv')) {
      return await file.text()
    }
    const buffer = await file.arrayBuffer()
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const rawText = decoder.decode(buffer)
    const cleanedText = rawText
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return cleanedText.length > 20 ? cleanedText : await file.text()
  } catch (err) {
    console.warn("Document text extraction fallback", err)
    return await file.text()
  }
}

// Helper for timezone detection
const getDetectedTimezone = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz || 'Eastern (ET)'
  } catch {
    return 'Eastern (ET)'
  }
}

// Default empty form state
const emptyFormState = {
  // Step 1: Product (Core)
  productName: '',
  shortDescription: '',
  launchDate: '',
  desiredCta: '',

  // Step 1: Product (Advanced / Optional)
  launchDescription: '',
  websiteUrl: '',

  // Step 2: Audience (Core)
  targetAudience: '',
  customerType: 'B2B', // B2B, B2C, B2B2C, Consumer

  // Step 2: Audience (Advanced / Optional)
  industrySegment: '',
  geography: '',
  customerProblem: '',
  primaryBenefit: '',
  immediateMessage: '',

  // Step 3: Message (Core)
  valueProposition: '',
  topBenefit1: '',
  topBenefit2: '',
  topBenefit3: '',
  toneOfVoice: 'Professional', // Professional, Friendly, Bold, Technical, Simple
  launchObjective: 'Product adoption', // Awareness, Leads, Product adoption, Announcement

  // Step 3: Message (Advanced / Optional)
  keyFeatures: '',
  differentiator: '',
  thingsToAvoid: '',

  // Step 4: Assets (Optional)
  productImages: [],
  logoFile: null,
  brandKitFile: null,
  letSMBFlowCreateVisual: true,

  // Step 5: Platforms (Core)
  platforms: {
    linkedin: { name: 'LinkedIn', connected: true, selected: true, icon: 'in', color: 'bg-blue-600' },
    instagram: { name: 'Instagram', connected: false, selected: false, icon: 'Ig', color: 'bg-pink-600' },
    twitter: { name: 'X', connected: true, selected: true, icon: 'X', color: 'bg-black' },
    facebook: { name: 'Facebook', connected: false, selected: false, icon: 'f', color: 'bg-blue-700' },
  },
  scheduleType: 'week',
  startDate: '',
  postingTime: '9:00 AM',
  timezone: getDetectedTimezone(),
  autoSuggestPostingTime: true,
}

// Pre-filled sample state used when user triggers AI Brief Extraction
const sampleExtractedBrief = {
  productName: 'TaskFlow Pro',
  shortDescription: 'Project management built for small businesses',
  launchDescription: "TaskFlow Pro is a lightweight project management tool designed for small teams of 2–20 people. Unlike enterprise tools, it's built to be usable in 10 minutes — no training required.",
  websiteUrl: 'https://taskflowpro.com',
  launchDate: 'Oct 1, 2026',
  desiredCta: 'Try it free',

  targetAudience: 'Small business owners and team leads (5–50 people)',
  customerType: 'B2B',
  industrySegment: 'SMB across all industries',
  geography: 'United States, Canada',
  customerProblem: 'Small teams lose hours every week to disorganized tasks, unclear ownership, and missed deadlines.',
  primaryBenefit: 'Get your team aligned and save 5+ hours per week',
  immediateMessage: 'Project management that works out of the box — no training required',

  valueProposition: "TaskFlow Pro gives small teams a shared workspace that's actually easy to use — so you spend less time managing work and more time doing it.",
  topBenefit1: 'Save 5+ hours per week on project coordination',
  topBenefit2: "Clear task ownership — no more 'who owns this?'",
  topBenefit3: 'Up and running in 10 minutes, no training needed',
  keyFeatures: 'Task boards, smart deadlines, team weekly digest, real-time collaboration',
  differentiator: 'Built for teams of 5–50, not enterprise departments — no IT setup, no training required',
  toneOfVoice: 'Professional',
  launchObjective: 'Product adoption',
  thingsToAvoid: 'Avoid comparing to Jira or Asana by name. Keep language simple — our audience is non-technical.',

  productImages: [],
  logoFile: null,
  brandKitFile: null,
  letSMBFlowCreateVisual: true,

  platforms: {
    linkedin: { name: 'LinkedIn', connected: true, selected: true, icon: 'in', color: 'bg-blue-600' },
    instagram: { name: 'Instagram', connected: false, selected: false, icon: 'Ig', color: 'bg-pink-600' },
    twitter: { name: 'X', connected: true, selected: true, icon: 'X', color: 'bg-black' },
    facebook: { name: 'Facebook', connected: false, selected: false, icon: 'f', color: 'bg-blue-700' },
  },
  scheduleType: 'week',
  startDate: 'Oct 1, 2026',
  postingTime: '9:00 AM',
  timezone: getDetectedTimezone(),
  autoSuggestPostingTime: true,
}

const STEPS = [
  { id: 1, label: 'Product' },
  { id: 2, label: 'Audience' },
  { id: 3, label: 'Message' },
  { id: 4, label: 'Assets' },
  { id: 5, label: 'Platforms' },
  { id: 6, label: 'Review' },
]

export default function ProductLaunchPage() {
  const navigate = useNavigate()
  const { api } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState(emptyFormState)

  // AI Brief Quick Input & Document Attachment State
  const [rawBriefText, setRawBriefText] = useState('')
  const [attachedDocument, setAttachedDocument] = useState(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [aiAutofilled, setAiAutofilled] = useState(false)
  const [aiFilledFields, setAiFilledFields] = useState({})
  const [errorMessage, setErrorMessage] = useState(null)
  const [chatFeedbackMessage, setChatFeedbackMessage] = useState(null)

  // Collapsible section toggles for advanced fields
  const [showStep1Advanced, setShowStep1Advanced] = useState(false)
  const [showStep2Advanced, setShowStep2Advanced] = useState(false)
  const [showStep3Advanced, setShowStep3Advanced] = useState(false)
  const [showStep4Advanced, setShowStep4Advanced] = useState(false)

  // Navigation states: 'wizard' | 'building' | 'campaign' | 'post-review'
  const [viewMode, setViewMode] = useState('wizard')
  const [activeTab, setActiveTab] = useState('overview')

  // Loading animation step tracker
  const [buildingStep, setBuildingStep] = useState(0)

  // Posts and Visuals state for campaign view
  const [posts, setPosts] = useState([])
  const [selectedPostId, setSelectedPostId] = useState(null)
  const [platformFilter, setPlatformFilter] = useState('All')
  const [campaignInstanceId, setCampaignInstanceId] = useState(null)
  const [campaignVisuals, setCampaignVisuals] = useState([
    {
      visual_id: 'vis-hero-1',
      visual_role: 'Product Hero',
      visual_prompt: 'Modern, sleek hero graphic featuring product launch banner.',
      aspect_ratio: '16:9',
      status: 'pending_generation',
      generated_asset_url: null,
    },
    {
      visual_id: 'vis-workflow-1',
      visual_role: 'Product / Workflow / Feature',
      visual_prompt: 'Clean UI workflow graphic showing product in action.',
      aspect_ratio: '16:9',
      status: 'pending_generation',
      generated_asset_url: null,
    },
    {
      visual_id: 'vis-problem-1',
      visual_role: 'Customer Problem / Founder Context',
      visual_prompt: 'Editorial graphic illustrating the customer challenge before solution.',
      aspect_ratio: '16:9',
      status: 'pending_generation',
      generated_asset_url: null,
    },
  ])
  const [isGeneratingVisual, setIsGeneratingVisual] = useState({})

  // Load existing draft from backend on mount
  useEffect(() => {
    async function loadDraft() {
      if (!api) return
      try {
        const resp = await api.get('/workflows/product-launch/draft')
        if (resp && resp.brief_data) {
          setFormData(prev => ({ ...prev, ...resp.brief_data }))
        }
      } catch (err) {
        console.warn('Failed to load Product Launch draft from server', err)
      }
    }
    loadDraft()
  }, [api])

  // Handler for form field changes — updates field value and clears AI-filled badge on manual edit
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setAiFilledFields(prev => {
      if (prev[field]) {
        const updated = { ...prev }
        delete updated[field]
        return updated
      }
      return prev
    })
  }

  // Save Draft to backend
  const handleSaveDraft = async () => {
    if (!api) return
    try {
      await api.post('/workflows/product-launch/draft', { brief_data: formData })
      alert('Product launch draft saved successfully!')
    } catch (err) {
      console.error('Failed to save product launch draft', err)
      alert('Saved locally. (Server draft update failed)')
    }
  }

  // AI Brief Extraction Trigger (Calls backend /extract-brief with prompt & document)
  const handleAiExtract = async () => {
    if (!rawBriefText.trim() && !attachedDocument) {
      setErrorMessage("Please describe your product launch or attach a document first.")
      return
    }

    setIsExtracting(true)
    setErrorMessage(null)
    setChatFeedbackMessage(null)

    try {
      if (!api) {
        throw new Error("Authentication session unavailable. Please log in.")
      }

      let docText = ''
      if (attachedDocument) {
        docText = await readDocumentText(attachedDocument)
      }

      const resp = await api.post('/workflows/product-launch/extract-brief', {
        launch_brief: rawBriefText.trim(),
        document_text: docText,
        document_name: attachedDocument ? attachedDocument.name : null
      })

      if (resp) {
        const extractData = (resp && typeof resp === 'object' && resp.data && typeof resp.data === 'object' && !Array.isArray(resp.data)) ? resp.data : resp
        const filledMap = { ...aiFilledFields }
        const updatedForm = { ...formData }

        const fieldsToExtract = [
          'productName', 'shortDescription', 'launchDescription', 'websiteUrl',
          'launchDate', 'desiredCta', 'targetAudience', 'customerType',
          'industrySegment', 'geography', 'customerProblem', 'primaryBenefit',
          'immediateMessage', 'valueProposition', 'topBenefit1', 'topBenefit2',
          'topBenefit3', 'keyFeatures', 'differentiator', 'toneOfVoice',
          'launchObjective', 'thingsToAvoid', 'scheduleType', 'startDate',
          'postingTime', 'timezone'
        ]

        const getFieldValue = (obj, field) => {
          if (!obj) return undefined
          if (obj[field] !== undefined && obj[field] !== null && obj[field] !== '') {
            return obj[field]
          }
          const snakeKey = field.replace(/([A-Z])/g, '_$1').toLowerCase()
          if (obj[snakeKey] !== undefined && obj[snakeKey] !== null && obj[snakeKey] !== '') {
            return obj[snakeKey]
          }
          return undefined
        }

        const respProvenance = extractData.provenance || {}

        fieldsToExtract.forEach(field => {
          const val = getFieldValue(extractData, field)
          if (val !== null && val !== undefined && val !== '') {
            updatedForm[field] = val
            const snakeKey = field.replace(/([A-Z])/g, '_$1').toLowerCase()
            const src = respProvenance[field] || respProvenance[snakeKey] || (attachedDocument ? 'uploaded_document' : 'user_message')
            filledMap[field] = src
          }
        })

        // Preserve extra product context (competitors, pricing, technical specs, restrictions)
        const addCtx = getFieldValue(extractData, 'additionalContext')
        if (addCtx) {
          if (updatedForm.additionalContext) {
            updatedForm.additionalContext = `${updatedForm.additionalContext}\n\n[${attachedDocument ? attachedDocument.name : 'Context'}]: ${addCtx}`
          } else {
            updatedForm.additionalContext = addCtx
          }
          filledMap.additionalContext = (respProvenance && (respProvenance.additionalContext || respProvenance.additional_context)) || (attachedDocument ? 'uploaded_document' : 'user_message')
        }

        // Map platform selection if returned by AI
        const rawPlatforms = getFieldValue(extractData, 'platforms') || extractData.platforms
        if (Array.isArray(rawPlatforms) && rawPlatforms.length > 0) {
          const platformNamesLower = rawPlatforms.map(p => String(p).toLowerCase())
          const updatedPlatforms = { ...updatedForm.platforms }

          Object.keys(updatedPlatforms).forEach(key => {
            const platObj = updatedPlatforms[key]
            const isSelected = platformNamesLower.some(p =>
              p.includes(key) ||
              p.includes(platObj.name.toLowerCase()) ||
              (key === 'twitter' && p === 'x')
            )
            updatedPlatforms[key] = {
              ...platObj,
              selected: isSelected
            }
          })

          updatedForm.platforms = updatedPlatforms
          filledMap.platforms = attachedDocument ? 'uploaded_document' : 'user_message'
        }

        // Align startDate with launchDate if startDate wasn't explicitly parsed
        if (!updatedForm.startDate && updatedForm.launchDate) {
          updatedForm.startDate = updatedForm.launchDate
          filledMap.startDate = filledMap.launchDate || 'ai_extraction'
        }

        // Expand advanced sections automatically if AI populated advanced fields
        if (filledMap.launchDescription || filledMap.websiteUrl) {
          setShowStep1Advanced(true)
        }
        if (filledMap.industrySegment || filledMap.geography || filledMap.customerProblem || filledMap.primaryBenefit || filledMap.immediateMessage) {
          setShowStep2Advanced(true)
        }
        if (filledMap.keyFeatures || filledMap.differentiator || filledMap.thingsToAvoid) {
          setShowStep3Advanced(true)
        }

        setFormData(updatedForm)
        setAiFilledFields(filledMap)
        setAiAutofilled(true)
        setAttachedDocument(null)
        setCurrentStep(1) // Automatically navigate to Step 1 after extraction

        const feedback = attachedDocument
          ? `Got it — I extracted product details from "${attachedDocument.name}" and filled the launch brief. I also kept additional product context for campaign generation.`
          : "Got it — I extracted the product details and filled the launch brief. I also kept additional product context for campaign generation."
        
        setChatFeedbackMessage(feedback)
      }
    } catch (err) {
      console.error('AI Extraction failed', err)
      const detail = err?.response?.data?.detail || err?.message || 'AI Provider unavailable'
      setErrorMessage(`AI Extraction Error: ${detail}`)
    } finally {
      setIsExtracting(false)
    }
  }

  // Toggle platform selection
  const togglePlatform = (key) => {
    setFormData(prev => ({
      ...prev,
      platforms: {
        ...prev.platforms,
        [key]: {
          ...prev.platforms[key],
          selected: !prev.platforms[key].selected,
        },
      },
    }))
  }

  // Toggle platform connection state
  const togglePlatformConnection = (key) => {
    setFormData(prev => ({
      ...prev,
      platforms: {
        ...prev.platforms,
        [key]: {
          ...prev.platforms[key],
          connected: !prev.platforms[key].connected,
          selected: !prev.platforms[key].connected ? true : prev.platforms[key].selected,
        },
      },
    }))
  }

  // Campaign Visual Asset Actions
  const handleGenerateVisual = async (visualId, promptOverride) => {
    const targetVis = campaignVisuals.find(v => v.visual_id === visualId) || {}
    const role = targetVis.visual_role || 'Product Highlight'

    if (!campaignInstanceId || !api) {
      // Offline fallback SVG Data URL generator
      const cleanProd = encodeURIComponent(formData.productName || 'SMBFlow Launch')
      const cleanRole = encodeURIComponent(role)
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="100%" height="100%" fill="#1e1b4b"/><text x="60" y="100" fill="#818cf8" font-size="20" font-family="sans-serif">${cleanRole}</text><text x="60" y="220" fill="#ffffff" font-size="48" font-family="sans-serif">${cleanProd}</text></svg>`
      const mockAsset = `data:image/svg+xml;base64,${btoa(svgStr)}`

      setCampaignVisuals(prev => prev.map(v => v.visual_id === visualId ? { ...v, status: 'generated', generated_asset_url: mockAsset } : v))
      setPosts(prev => prev.map(p => p.visual_id === visualId ? { ...p, visual_status: 'generated', generated_asset_url: mockAsset } : p))
      return
    }

    setIsGeneratingVisual(prev => ({ ...prev, [visualId]: true }))
    try {
      const resp = await api.post(`/workflows/product-launch/campaign/${campaignInstanceId}/visuals/${visualId}/generate`, {
        prompt: promptOverride
      })
      if (resp && resp.visual) {
        setCampaignVisuals(prev => prev.map(v => v.visual_id === visualId ? resp.visual : v))
      }
      if (resp && resp.posts) {
        setPosts(resp.posts)
      }
    } catch (err) {
      console.error(`Failed to generate visual ${visualId}`, err)
      alert(`Visual generation error: ${err?.response?.data?.detail || err?.message}`)
    } finally {
      setIsGeneratingVisual(prev => ({ ...prev, [visualId]: false }))
    }
  }

  const handleRegenerateVisual = async (visualId) => {
    await handleGenerateVisual(visualId)
  }

  const handleEditVisualPrompt = async (visualId) => {
    const currentVis = campaignVisuals.find(v => v.visual_id === visualId)
    const newPrompt = prompt('Edit visual prompt:', currentVis?.visual_prompt || '')
    if (newPrompt && newPrompt.trim()) {
      await handleGenerateVisual(visualId, newPrompt.trim())
    }
  }

  const handleApproveVisual = async (visualId) => {
    if (campaignInstanceId && api) {
      try {
        const resp = await api.post(`/workflows/product-launch/campaign/${campaignInstanceId}/visuals/${visualId}/approve`)
        if (resp && resp.visual) {
          setCampaignVisuals(prev => prev.map(v => v.visual_id === visualId ? resp.visual : v))
        }
        if (resp && resp.posts) {
          setPosts(resp.posts)
        }
      } catch (err) {
        console.error('Failed to approve visual', err)
      }
    } else {
      setCampaignVisuals(prev => prev.map(v => v.visual_id === visualId ? { ...v, status: 'approved' } : v))
      setPosts(prev => prev.map(p => p.visual_id === visualId ? { ...p, visual_status: 'approved' } : p))
    }
  }

  const handleCreateCustomVisual = async () => {
    const role = prompt('Enter visual role (e.g. Founder Story, Feature Demo):', 'Product Highlight')
    if (!role) return
    const vPrompt = prompt('Enter visual prompt for AI image generation:', `High contrast visual graphic for ${formData.productName || 'our launch'}`)
    if (!vPrompt) return

    if (campaignInstanceId && api) {
      try {
        const resp = await api.post(`/workflows/product-launch/campaign/${campaignInstanceId}/visuals`, {
          visual_role: role,
          visual_prompt: vPrompt,
          aspect_ratio: '16:9'
        })
        if (resp && resp.visuals) {
          setCampaignVisuals(resp.visuals)
        }
      } catch (err) {
        console.error('Failed to create custom visual', err)
      }
    } else {
      const newVis = {
        visual_id: `vis-custom-${Date.now()}`,
        visual_role: role,
        visual_prompt: vPrompt,
        aspect_ratio: '16:9',
        status: 'pending_generation',
        generated_asset_url: null,
      }
      setCampaignVisuals(prev => [...prev, newVis])
    }
  }

  const handleDeleteVisual = async (visualId) => {
    if (campaignInstanceId && api) {
      try {
        const resp = await api.delete(`/workflows/product-launch/campaign/${campaignInstanceId}/visuals/${visualId}`)
        if (resp && resp.visuals) {
          setCampaignVisuals(resp.visuals)
        }
      } catch (err) {
        console.error('Failed to delete visual', err)
      }
    } else {
      setCampaignVisuals(prev => prev.filter(v => v.visual_id !== visualId))
    }
  }

  // Trigger building launch campaign (Backend API call create-campaign)
  const startBuildingCampaign = async () => {
    setViewMode('building')
    setBuildingStep(0)

    const stepInterval = setInterval(() => {
      setBuildingStep(prev => (prev >= 5 ? 5 : prev + 1))
    }, 600)

    try {
      if (api) {
        const resp = await api.post('/workflows/product-launch/create-campaign', {
          brief_data: formData
        })
        clearInterval(stepInterval)
        setBuildingStep(5)
        if (resp) {
          if (resp.instance_id) setCampaignInstanceId(resp.instance_id)
          if (resp.visuals) setCampaignVisuals(resp.visuals)
          if (resp.posts) setPosts(resp.posts)
          setViewMode('campaign')
          return
        }
      }
    } catch (err) {
      console.error('Campaign creation error', err)
      setErrorMessage(`Campaign Creation Error: ${err?.response?.data?.detail || err?.message}`)
    }

    // Fallback completion
    setTimeout(() => {
      clearInterval(stepInterval)
      generateCampaignData()
      setViewMode('campaign')
    }, 3200)
  }


  // Generate campaign posts dynamically based on brief
  const generateCampaignData = () => {
    const selectedPlats = Object.entries(formData.platforms)
      .filter(([_, p]) => p.selected)
      .map(([k, p]) => p.name)

    const name = formData.productName || 'Your Product'
    const benefit = formData.topBenefit1 || formData.primaryBenefit || 'Save 5+ hours per week'
    const cta = formData.desiredCta || 'Learn more'
    const problem = formData.customerProblem || 'disorganized tasks'

    const generatedPosts = [
      {
        id: 'li-1',
        platform: 'LinkedIn',
        category: 'LAUNCH ANNOUNCEMENT',
        scheduledTime: 'Oct 1 - 9:00 AM',
        dateStr: 'Wed 1',
        timeStr: '9:00 AM',
        caption: `Excited to announce ${name} — ${formData.shortDescription || 'built for small businesses, not enterprise departments'}. ${formData.launchDescription || 'Designed to give your team clarity without the enterprise bloat.'}`,
        hashtags: ['#ProductLaunch', '#SmallBusiness', '#ProjectManagement', `#${name.replace(/\s+/g, '')}`],
        status: 'Needs review',
        actionLabel: cta,
      },
      {
        id: 'li-2',
        platform: 'LinkedIn',
        category: 'PRODUCT BENEFIT',
        scheduledTime: 'Oct 3 - 8:30 AM',
        dateStr: 'Fri 3',
        timeStr: '8:30 AM',
        caption: `Small teams lose hours every week to ${problem}. ${name} was built to give that time back. ${benefit}.\n\nHow does your team handle project tracking today?`,
        hashtags: ['#Productivity', '#SmallBusiness', '#WorkSmarter', `#${name.replace(/\s+/g, '')}`],
        status: 'Draft',
        actionLabel: 'See how it works',
      },
      {
        id: 'li-3',
        platform: 'LinkedIn',
        category: 'FEATURE HIGHLIGHT',
        scheduledTime: 'Oct 6 - 9:00 AM',
        dateStr: 'Mon 6',
        timeStr: '9:00 AM',
        caption: `Introducing ${formData.keyFeatures || 'Smart Deadlines'} in ${name}. Most tasks don't fail because the team didn't care — they fail because of lack of clear ownership.`,
        hashtags: ['#SmartDeadlines', '#ProjectManagement', `#${name.replace(/\s+/g, '')}`],
        status: 'Draft',
        actionLabel: cta,
      },
      {
        id: 'ig-1',
        platform: 'Instagram',
        category: 'LAUNCH ANNOUNCEMENT',
        scheduledTime: 'Oct 1 - 10:00 AM',
        dateStr: 'Wed 1',
        timeStr: '10:00 AM',
        caption: `Introducing ${name} ✨ ${formData.shortDescription || 'Project management that finally makes sense for small teams'}. Link in bio!`,
        hashtags: [`#${name.replace(/\s+/g, '')}`, '#ProductLaunch', '#SmallBusiness'],
        status: 'Needs review',
        actionLabel: cta,
      },
      {
        id: 'ig-2',
        platform: 'Instagram',
        category: 'VISUAL STORY',
        scheduledTime: 'Oct 2 - 11:00 AM',
        dateStr: 'Thu 2',
        timeStr: '11:00 AM',
        caption: `Before ${name}: 23 browser tabs, three Slack threads, and a sticky note. After ${name}: One place. Clear ownership. Happy team.`,
        hashtags: ['#BeforeAfter', '#Productivity', '#TeamWork'],
        status: 'Draft',
        actionLabel: cta,
      },
      {
        id: 'ig-3',
        platform: 'Instagram',
        category: 'PRODUCT BENEFIT',
        scheduledTime: 'Oct 5 - 12:00 PM',
        dateStr: 'Sun 5',
        timeStr: '12:00 PM',
        caption: `Your team is good at their jobs. Give them a tool that keeps up. ${name}: ${formData.differentiator || 'built for small teams, not enterprise budgets'}.`,
        hashtags: [`#${name.replace(/\s+/g, '')}`, '#Productivity', '#SmallTeams'],
        status: 'Draft',
        actionLabel: cta,
      },
      {
        id: 'tw-1',
        platform: 'X',
        category: 'LAUNCH ANNOUNCEMENT',
        scheduledTime: 'Oct 1 - 9:00 AM',
        dateStr: 'Wed 1',
        timeStr: '9:00 AM',
        caption: `Launching ${name} today — ${formData.shortDescription || 'project management for small teams'}. Free trial, no credit card required.`,
        hashtags: ['#ProductLaunch', `#${name.replace(/\s+/g, '')}`, '#BuildInPublic'],
        status: 'Needs review',
        actionLabel: cta,
      },
      {
        id: 'tw-2',
        platform: 'X',
        category: 'FEATURE HIGHLIGHT',
        scheduledTime: 'Oct 3 - 10:00 AM',
        dateStr: 'Fri 3',
        timeStr: '10:00 AM',
        caption: `The most underrated feature of ${name}: ${formData.keyFeatures?.split(',')[0] || 'Weekly Team Digest'}. Whole team stays aligned with zero meetings required.`,
        hashtags: ['#Productivity', `#${name.replace(/\s+/g, '')}`, '#RemoteWork'],
        status: 'Draft',
        actionLabel: cta,
      },
      {
        id: 'tw-3',
        platform: 'X',
        category: 'CTA',
        scheduledTime: 'Oct 7 - 9:30 AM',
        dateStr: 'Tue 7',
        timeStr: '9:30 AM',
        caption: `${name} has been live for a week! We're already seeing teams reclaim 5+ hours/week. ${cta} today!`,
        hashtags: [`#${name.replace(/\s+/g, '')}`, '#LastChance', '#SmallBusiness'],
        status: 'Draft',
        actionLabel: cta,
      },
      {
        id: 'fb-1',
        platform: 'Facebook',
        category: 'LAUNCH ANNOUNCEMENT',
        scheduledTime: 'Oct 1 - 11:00 AM',
        dateStr: 'Wed 1',
        timeStr: '11:00 AM',
        caption: `We built ${name} because we kept seeing the same problem: great teams held back by disorganized work. Today we're excited to share our solution!`,
        hashtags: [`#${name.replace(/\s+/g, '')}`, '#SmallBusiness', '#ProductLaunch'],
        status: 'Needs review',
        actionLabel: cta,
      },
      {
        id: 'fb-2',
        platform: 'Facebook',
        category: 'SOCIAL PROOF',
        scheduledTime: 'Oct 4 - 10:30 AM',
        dateStr: 'Sat 4',
        timeStr: '10:30 AM',
        caption: `"We used to lose track of tasks between Slack and email. ${name} gave us one place for everything." — Early customer. ${cta} today!`,
        hashtags: [`#${name.replace(/\s+/g, '')}`, '#CustomerStory', '#SmallBusiness'],
        status: 'Draft',
        actionLabel: cta,
      },
      {
        id: 'fb-3',
        platform: 'Facebook',
        category: 'FEATURE HIGHLIGHT',
        scheduledTime: 'Oct 6 - 11:00 AM',
        dateStr: 'Mon 6',
        timeStr: '11:00 AM',
        caption: `How does your team track projects today? Spreadsheet? Sticky notes? ${name} was built to replace the mess with one simple dashboard.`,
        hashtags: ['#Edit', '#Redo', '#Approve'],
        status: 'Draft',
        actionLabel: cta,
      }
    ]

    setPosts(generatedPosts)
  }

  // Toggle post status (Approve / Needs review)
  const togglePostApproval = async (postId) => {
    const targetPost = posts.find(p => p.id === postId)
    const approvalId = targetPost?.approval_id || targetPost?.id

    const newStatus = targetPost?.status === 'Approved' ? 'Needs review' : 'Approved'

    // Update state locally
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        return { ...p, status: newStatus }
      }
      return p
    }))

    if (api && approvalId) {
      try {
        if (newStatus === 'Approved') {
          await api.post(`/workflows/product-launch/posts/${approvalId}/approve`, {})
        } else {
          await api.post(`/workflows/product-launch/posts/${approvalId}/reject`, {})
        }
      } catch (err) {
        console.warn('Backend approval record call skipped/failed (non-fatal)', err)
      }
    }
  }

  // Export campaign schedule to CSV
  const handleExportCampaign = () => {
    if (!posts || posts.length === 0) {
      alert("No posts available to export.")
      return
    }

    const headers = ["Platform", "Category", "Scheduled Time", "Caption", "Hashtags", "Status", "Visual Prompt"]
    const rows = posts.map(p => [
      `"${p.platform || ''}"`,
      `"${p.category || ''}"`,
      `"${p.scheduledTime || ''}"`,
      `"${(p.caption || '').replace(/"/g, '""')}"`,
      `"${(p.hashtags || []).join(' ')}"`,
      `"${p.status || ''}"`,
      `"${(p.visual_prompt || p.visualPrompt || '').replace(/"/g, '""')}"`
    ])

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `${(formData.productName || 'product_launch').replace(/\s+/g, '_')}_campaign_schedule.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleAddHashtag = (postId, tag) => {
    if (!tag) return
    const formattedTag = tag.startsWith('#') ? tag : `#${tag}`
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        return { ...p, hashtags: [...p.hashtags, formattedTag] }
      }
      return p
    }))
  }

  const handleRemoveHashtag = (postId, tagIndex) => {
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        return { ...p, hashtags: p.hashtags.filter((_, i) => i !== tagIndex) }
      }
      return p
    }))
  }

  const currentPost = posts.find(p => p.id === selectedPostId) || posts[0]

  return (
    <div className="p-6 bg-slate-50/60 min-h-full font-sans text-slate-900">
      {/* ── BREADCRUMBS ─────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto mb-6">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-2">
          <span>SMBFlow</span>
          <span>/</span>
          <button onClick={() => navigate('/workflows')} className="hover:text-slate-800 transition-colors">Workflows</button>
          <span>/</span>
          <span className="text-slate-900 font-semibold">Product Launch Sprint</span>
        </div>

        {viewMode === 'wizard' && (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                <Zap className="w-5 h-5 fill-white text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Product Launch Sprint</h1>
                <p className="text-sm text-slate-500">AI-assisted product launch campaign builder.</p>
              </div>
            </div>

            <div className="mt-4 p-4 rounded-xl bg-blue-50/70 border border-blue-100 text-sm text-blue-900 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <p>
                Describe what you're launching in natural language. SMBFlow will pre-fill your brief, audience, and schedule so you only have to review and confirm.
              </p>
            </div>
          </div>
        )}

        {viewMode === 'campaign' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Campaign ready
              </span>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Your launch campaign is ready</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formData.productName || 'Your Launch'} • {posts.length} posts across {Object.values(formData.platforms).filter(p => p.selected).length} platforms • {formData.startDate || 'Oct 1'} - Oct 7
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setViewMode('wizard')} className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors">
                ← Edit brief
              </button>
              <button
                onClick={() => setActiveTab(activeTab === 'calendar' ? 'overview' : 'calendar')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
                  activeTab === 'calendar' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" /> {activeTab === 'calendar' ? 'Overview' : 'Calendar'}
              </button>
              <button className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> Review & approve
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── PROGRESS BAR ─────────────────────────────────────────────────── */}
      {viewMode === 'wizard' && (
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-4 left-6 right-6 h-0.5 bg-slate-200 -z-0" />
            <div
              className="absolute top-4 left-6 h-0.5 bg-blue-600 transition-all duration-300 -z-0"
              style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
            />

            {STEPS.map((step) => {
              const isDone = currentStep > step.id
              const isCurrent = currentStep === step.id

              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(step.id)}
                  className="flex flex-col items-center gap-1.5 relative z-10 group focus:outline-none"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-200 ${
                      isDone
                        ? 'bg-blue-600 text-white shadow-sm'
                        : isCurrent
                        ? 'bg-white text-blue-600 border-2 border-blue-600 shadow-sm ring-4 ring-blue-50'
                        : 'bg-white text-slate-400 border border-slate-300 group-hover:border-slate-400'
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4 stroke-[3]" /> : step.id}
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      isCurrent ? 'text-blue-600' : isDone ? 'text-slate-700' : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── WIZARD STEPS ────────────────────────────────────────────────── */}
      {viewMode === 'wizard' && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* STEP 1: PRODUCT */}
          {currentStep === 1 && (
            <div className="space-y-6">
              {/* ✨ PRIMARY ENTRY PATH: AI BRIEF QUICK-FILL & DOCUMENT ATTACHMENT */}
              <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-3xl p-6 shadow-md relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-blue-300" />
                    <h3 className="text-sm font-bold tracking-wide">Describe your launch or upload a product document</h3>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-800/80 text-blue-200 uppercase tracking-wider">
                    AI Assistant
                  </span>
                </div>
                <p className="text-xs text-blue-100/80 mb-3">
                  Paste your launch description or attach product briefs, technical specs, or marketing documents (PDF, DOCX, TXT/MD). SMBFlow will extract product details, target audience, key benefits, and schedule automatically.
                </p>

                <textarea
                  rows={3}
                  value={rawBriefText}
                  onChange={(e) => setRawBriefText(e.target.value)}
                  placeholder="e.g., We're launching TaskFlow Pro, a lightweight project management tool built for small teams of 5-50. Saves 5+ hours/week with zero IT setup. Launching Oct 1 with free trial..."
                  className="w-full p-3 rounded-xl bg-white/10 border border-white/20 text-white text-xs placeholder:text-blue-200/50 focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3"
                />

                {/* Document Attachment Pill / Button */}
                {attachedDocument ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/15 border border-white/20 text-xs mb-3">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="w-4 h-4 text-blue-300 shrink-0" />
                      <span className="font-semibold text-white truncate">{attachedDocument.name}</span>
                      <span className="text-[10px] text-blue-200 font-medium shrink-0">
                        ({(attachedDocument.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachedDocument(null)}
                      className="text-blue-200 hover:text-white p-1"
                      title="Remove document"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-3">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs text-blue-100 font-semibold transition-all">
                      <Paperclip className="w-3.5 h-3.5 text-blue-300" />
                      <span>Attach product document (PDF, DOCX, TXT/MD)</span>
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc,.txt,.md,.markdown,.json,.csv"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setAttachedDocument(e.target.files[0])
                          }
                        }}
                      />
                    </label>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleAiExtract}
                    disabled={isExtracting}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {isExtracting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Extracting brief & document with AI…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        ✨ {attachedDocument ? "Extract brief & document with AI" : "Quick-fill brief with AI"}
                      </>
                    )}
                  </button>

                  {aiAutofilled && !errorMessage && !chatFeedbackMessage && (
                    <span className="text-xs text-emerald-300 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Brief extracted! Review & edit core fields below.
                    </span>
                  )}
                </div>

                {chatFeedbackMessage && (
                  <div className="mt-3 p-3 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-xs text-emerald-100 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                    <p>{chatFeedbackMessage}</p>
                  </div>
                )}

                {errorMessage && (
                  <div className="mt-3 p-3 rounded-xl bg-red-500/20 border border-red-400/40 text-xs text-red-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAiExtract}
                      className="px-3 py-1 bg-white text-red-700 rounded-lg font-bold hover:bg-red-50 transition-colors shadow-2xs text-[11px] shrink-0"
                    >
                      Retry Quick Fill
                    </button>
                  </div>
                )}
              </div>

              {/* CORE PRODUCT FIELDS */}
              <StepCard title="What are you launching?">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Product / Feature name <span className="text-blue-600">*</span>
                        </label>
                        {aiFilledFields.productName && formData.productName && <AiFilledBadge source={aiFilledFields.productName} />}
                      </div>
                      <input
                        type="text"
                        value={formData.productName}
                        onChange={(e) => handleChange('productName', e.target.value)}
                        placeholder="e.g., TaskFlow Pro"
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Launch date <span className="text-blue-600">*</span>
                        </label>
                        {aiFilledFields.launchDate && formData.launchDate && <AiFilledBadge source={aiFilledFields.launchDate} />}
                      </div>
                      <input
                        type="text"
                        value={formData.launchDate}
                        onChange={(e) => handleChange('launchDate', e.target.value)}
                        placeholder="e.g., Oct 1, 2026"
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Short description / brief <span className="text-blue-600">*</span>
                      </label>
                      {aiFilledFields.shortDescription && formData.shortDescription && <AiFilledBadge source={aiFilledFields.shortDescription} />}
                    </div>
                    <input
                      type="text"
                      value={formData.shortDescription}
                      onChange={(e) => handleChange('shortDescription', e.target.value)}
                      placeholder="Project management built for small businesses"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">One sentence overview — used across all platforms.</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Desired CTA (Call to action) <span className="text-blue-600">*</span>
                      </label>
                      {aiFilledFields.desiredCta && formData.desiredCta && <AiFilledBadge source={aiFilledFields.desiredCta} />}
                    </div>
                    <input
                      type="text"
                      value={formData.desiredCta}
                      onChange={(e) => handleChange('desiredCta', e.target.value)}
                      placeholder="e.g., Try it free, Get Started, Join waitlist"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  {/* OPTIONAL / ADVANCED SECTION */}
                  <CollapsibleSection
                    title="Optional product details"
                    isOpen={showStep1Advanced}
                    onToggle={() => setShowStep1Advanced(!showStep1Advanced)}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Detailed launch description
                        </label>
                        {aiFilledFields.launchDescription && formData.launchDescription && <AiFilledBadge source={aiFilledFields.launchDescription} />}
                      </div>
                      <textarea
                        rows={3}
                        value={formData.launchDescription}
                        onChange={(e) => handleChange('launchDescription', e.target.value)}
                        placeholder="Additional context or full press release notes..."
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Website / Product URL
                        </label>
                        {aiFilledFields.websiteUrl && formData.websiteUrl && <AiFilledBadge source={aiFilledFields.websiteUrl} />}
                      </div>
                      <input
                        type="text"
                        value={formData.websiteUrl}
                        onChange={(e) => handleChange('websiteUrl', e.target.value)}
                        placeholder="https://taskflowpro.com"
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </CollapsibleSection>
                </div>

                <WizardFooter step={currentStep} onNext={() => setCurrentStep(2)} />
              </StepCard>
            </div>
          )}

          {/* STEP 2: AUDIENCE */}
          {currentStep === 2 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <StepCard title="Who is this launch for?">
                  <div className="space-y-4">
                    {/* CORE AUDIENCE FIELDS */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Target audience <span className="text-blue-600">*</span>
                        </label>
                        {aiFilledFields.targetAudience && formData.targetAudience && <AiFilledBadge source={aiFilledFields.targetAudience} />}
                      </div>
                      <input
                        type="text"
                        value={formData.targetAudience}
                        onChange={(e) => handleChange('targetAudience', e.target.value)}
                        placeholder="e.g., Small business owners and team leads (5–50 people)"
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Customer type <span className="text-blue-600">*</span>
                        </label>
                        {aiFilledFields.customerType && formData.customerType && <AiFilledBadge source={aiFilledFields.customerType} />}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['B2B', 'B2C', 'B2B2C', 'Consumer'].map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => handleChange('customerType', type)}
                            className={`px-4 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                              formData.customerType === type
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* OPTIONAL / ADVANCED AUDIENCE DETAILS */}
                    <CollapsibleSection
                      title="Optional audience details"
                      isOpen={showStep2Advanced}
                      onToggle={() => setShowStep2Advanced(!showStep2Advanced)}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                              Industry / Segment
                            </label>
                            {aiFilledFields.industrySegment && formData.industrySegment && <AiFilledBadge source={aiFilledFields.industrySegment} />}
                          </div>
                          <input
                            type="text"
                            value={formData.industrySegment}
                            onChange={(e) => handleChange('industrySegment', e.target.value)}
                            placeholder="e.g., SMB across all industries"
                            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                              Geography
                            </label>
                            {aiFilledFields.geography && formData.geography && <AiFilledBadge source={aiFilledFields.geography} />}
                          </div>
                          <input
                            type="text"
                            value={formData.geography}
                            onChange={(e) => handleChange('geography', e.target.value)}
                            placeholder="e.g., United States, Canada"
                            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                            Customer problem
                          </label>
                          {aiFilledFields.customerProblem && formData.customerProblem && <AiFilledBadge source={aiFilledFields.customerProblem} />}
                        </div>
                        <textarea
                          rows={2}
                          value={formData.customerProblem}
                          onChange={(e) => handleChange('customerProblem', e.target.value)}
                          placeholder="Small teams lose hours every week to disorganized tasks..."
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                            Primary benefit
                          </label>
                          {aiFilledFields.primaryBenefit && formData.primaryBenefit && <AiFilledBadge source={aiFilledFields.primaryBenefit} />}
                        </div>
                        <input
                          type="text"
                          value={formData.primaryBenefit}
                          onChange={(e) => handleChange('primaryBenefit', e.target.value)}
                          placeholder="Get your team aligned and save 5+ hours per week"
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                            Immediate message
                          </label>
                          {aiFilledFields.immediateMessage && formData.immediateMessage && <AiFilledBadge source={aiFilledFields.immediateMessage} />}
                        </div>
                        <input
                          type="text"
                          value={formData.immediateMessage}
                          onChange={(e) => handleChange('immediateMessage', e.target.value)}
                          placeholder="Project management that works out of the box"
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </CollapsibleSection>
                  </div>

                  <WizardFooter step={currentStep} onBack={() => setCurrentStep(1)} onNext={() => setCurrentStep(3)} />
                </StepCard>
              </div>

              {/* Sidebar Preview Card */}
              <div className="lg:col-span-1">
                <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-100/80 space-y-4 sticky top-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600">YOUR AUDIENCE</h3>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block">Who</span>
                    <p className="text-xs font-medium text-slate-800">{formData.targetAudience || '—'}</p>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block">Type</span>
                    <p className="text-xs font-medium text-slate-800">{formData.customerType || '—'}</p>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block">Where</span>
                    <p className="text-xs font-medium text-slate-800">{formData.geography || '—'}</p>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block">Problem</span>
                    <p className="text-xs font-medium text-slate-800">{formData.customerProblem || '—'}</p>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block">Benefit</span>
                    <p className="text-xs font-medium text-slate-800">{formData.primaryBenefit || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: MESSAGE */}
          {currentStep === 3 && (
            <StepCard title="What should your launch say?">
              <div className="space-y-4">
                {/* CORE MESSAGE FIELDS */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Main value proposition <span className="text-blue-600">*</span>
                    </label>
                    {aiFilledFields.valueProposition && formData.valueProposition && <AiFilledBadge source={aiFilledFields.valueProposition} />}
                  </div>
                  <textarea
                    rows={2}
                    value={formData.valueProposition}
                    onChange={(e) => handleChange('valueProposition', e.target.value)}
                    placeholder="TaskFlow Pro gives small teams a shared workspace that's actually easy to use..."
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Top 3 benefits <span className="text-blue-600">*</span>
                    </label>
                    {(aiFilledFields.topBenefit1 || aiFilledFields.topBenefit2 || aiFilledFields.topBenefit3) && (
                      <AiFilledBadge source={aiFilledFields.topBenefit1 || aiFilledFields.topBenefit2 || aiFilledFields.topBenefit3} />
                    )}
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-bold text-xs flex items-center justify-center shrink-0">1</span>
                      <input
                        type="text"
                        value={formData.topBenefit1}
                        onChange={(e) => handleChange('topBenefit1', e.target.value)}
                        placeholder="Save 5+ hours per week on project coordination"
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-bold text-xs flex items-center justify-center shrink-0">2</span>
                      <input
                        type="text"
                        value={formData.topBenefit2}
                        onChange={(e) => handleChange('topBenefit2', e.target.value)}
                        placeholder="Clear task ownership — no more 'who owns this?'"
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-bold text-xs flex items-center justify-center shrink-0">3</span>
                      <input
                        type="text"
                        value={formData.topBenefit3}
                        onChange={(e) => handleChange('topBenefit3', e.target.value)}
                        placeholder="Up and running in 10 minutes, no training needed"
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Tone of voice <span className="text-blue-600">*</span>
                      </label>
                      {aiFilledFields.toneOfVoice && formData.toneOfVoice && <AiFilledBadge source={aiFilledFields.toneOfVoice} />}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {['Professional', 'Friendly', 'Bold', 'Technical', 'Simple'].map((tone) => (
                        <button
                          key={tone}
                          type="button"
                          onClick={() => handleChange('toneOfVoice', tone)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                            formData.toneOfVoice === tone
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {tone}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Launch objective <span className="text-blue-600">*</span>
                      </label>
                      {aiFilledFields.launchObjective && formData.launchObjective && <AiFilledBadge source={aiFilledFields.launchObjective} />}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {['Awareness', 'Leads', 'Product adoption', 'Announcement'].map((obj) => (
                        <button
                          key={obj}
                          type="button"
                          onClick={() => handleChange('launchObjective', obj)}
                          className={`py-1.5 px-2.5 text-xs font-semibold rounded-lg border text-center transition-all ${
                            formData.launchObjective === obj
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-bold'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {obj}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* OPTIONAL / ADVANCED MESSAGE DETAILS */}
                <CollapsibleSection
                  title="Optional messaging details"
                  isOpen={showStep3Advanced}
                  onToggle={() => setShowStep3Advanced(!showStep3Advanced)}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Key features
                      </label>
                      {aiFilledFields.keyFeatures && formData.keyFeatures && <AiFilledBadge source={aiFilledFields.keyFeatures} />}
                    </div>
                    <input
                      type="text"
                      value={formData.keyFeatures}
                      onChange={(e) => handleChange('keyFeatures', e.target.value)}
                      placeholder="Task boards, smart deadlines, team weekly digest..."
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        What makes this different? (Differentiator)
                      </label>
                      {aiFilledFields.differentiator && formData.differentiator && <AiFilledBadge source={aiFilledFields.differentiator} />}
                    </div>
                    <input
                      type="text"
                      value={formData.differentiator}
                      onChange={(e) => handleChange('differentiator', e.target.value)}
                      placeholder="Built for teams of 5–50, not enterprise departments..."
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Anything SMBFlow should avoid?
                      </label>
                      {aiFilledFields.thingsToAvoid && formData.thingsToAvoid && <AiFilledBadge source={aiFilledFields.thingsToAvoid} />}
                    </div>
                    <input
                      type="text"
                      value={formData.thingsToAvoid}
                      onChange={(e) => handleChange('thingsToAvoid', e.target.value)}
                      placeholder="Avoid comparing to Jira or Asana by name..."
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </CollapsibleSection>
              </div>

              <WizardFooter step={currentStep} onBack={() => setCurrentStep(2)} onNext={() => setCurrentStep(4)} />
            </StepCard>
          )}

          {/* STEP 4: ASSETS (Streamlined & Optional) */}
          {currentStep === 4 && (
            <StepCard title="Add your launch assets (Optional)">
              <div className="space-y-4">
                <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-6 text-center bg-slate-50/40 hover:bg-blue-50/20 transition-all cursor-pointer relative group">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const newFiles = Array.from(e.target.files).map(f => ({
                          name: f.name,
                          size: (f.size / (1024 * 1024)).toFixed(1) + ' MB',
                          url: URL.createObjectURL(f),
                        }))
                        setFormData(prev => ({
                          ...prev,
                          productImages: [...prev.productImages, ...newFiles],
                        }))
                      }
                    }}
                  />
                  <div className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-blue-100 text-slate-500 group-hover:text-blue-600 flex items-center justify-center mx-auto mb-2 transition-colors">
                    <Upload className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 mb-0.5">Upload product images (Optional)</h4>
                  <p className="text-[11px] text-slate-400 mb-3">PNG, JPG, or WEBP — up to 10 MB each</p>
                  <button type="button" className="px-3.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 shadow-xs hover:bg-slate-50">
                    Choose files
                  </button>
                </div>

                {formData.productImages.length > 0 && (
                  <div className="space-y-2">
                    {formData.productImages.map((img, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 text-xs">
                        <div className="flex items-center gap-2.5">
                          <ImageIcon className="w-4 h-4 text-blue-600" />
                          <span className="font-semibold text-slate-800">{img.name}</span>
                          <span className="text-slate-400">({img.size})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, productImages: prev.productImages.filter((_, i) => i !== idx) }))}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI Visual Creation Card Option */}
                <div
                  onClick={() => handleChange('letSMBFlowCreateVisual', !formData.letSMBFlowCreateVisual)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                    formData.letSMBFlowCreateVisual
                      ? 'border-blue-200 bg-blue-50/40 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900">Let SMBFlow generate visuals automatically</h4>
                      <input
                        type="checkbox"
                        checked={formData.letSMBFlowCreateVisual}
                        onChange={() => {}}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      No images uploaded? SMBFlow will automatically generate launch visuals based on your brief.
                    </p>
                  </div>
                </div>

                {/* OPTIONAL LOGO & BRAND KIT ROWS */}
                <CollapsibleSection
                  title="Optional logo & brand assets"
                  isOpen={showStep4Advanced}
                  onToggle={() => setShowStep4Advanced(!showStep4Advanced)}
                >
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                        <ImageIcon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">Product logo</p>
                        <p className="text-[11px] text-slate-400">
                          {formData.logoFile ? formData.logoFile.name : 'No file selected'}
                        </p>
                      </div>
                    </div>
                    <label className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setFormData(prev => ({ ...prev, logoFile: e.target.files[0] }))
                          }
                        }}
                      />
                    </label>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                        <ImageIcon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">Brand kit / additional assets</p>
                        <p className="text-[11px] text-slate-400">
                          {formData.brandKitFile ? formData.brandKitFile.name : 'No file selected'}
                        </p>
                      </div>
                    </div>
                    <label className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer">
                      Upload
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setFormData(prev => ({ ...prev, brandKitFile: e.target.files[0] }))
                          }
                        }}
                      />
                    </label>
                  </div>
                </CollapsibleSection>
              </div>

              <WizardFooter step={currentStep} onBack={() => setCurrentStep(3)} onNext={() => setCurrentStep(5)} />
            </StepCard>
          )}

          {/* STEP 5: PLATFORMS & SCHEDULE */}
          {currentStep === 5 && (
            <StepCard title="Where & when should we launch?">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                    Target platforms <span className="text-blue-600">*</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(formData.platforms).map(([key, plat]) => (
                      <div
                        key={key}
                        onClick={() => togglePlatform(key)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                          plat.selected
                            ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-500/20'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl ${plat.color} text-white font-bold text-sm flex items-center justify-center shadow-xs`}>
                            {plat.icon}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{plat.name}</h4>
                            <span className="flex items-center gap-1.5 text-[11px] font-medium mt-0.5">
                              {plat.connected ? (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  <span className="text-emerald-700 font-semibold">Connected</span>
                                </>
                              ) : (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                  <span className="text-slate-400">Not connected</span>
                                </>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!plat.connected && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                togglePlatformConnection(key)
                              }}
                              className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg text-blue-600 hover:bg-blue-50"
                            >
                              Connect
                            </button>
                          )}
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                            plat.selected ? 'bg-blue-600 text-white' : 'border border-slate-300'
                          }`}>
                            {plat.selected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                    Publishing schedule <span className="text-blue-600">*</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          Start date
                        </label>
                        {aiFilledFields.startDate && formData.startDate && <AiFilledBadge source={aiFilledFields.startDate} />}
                      </div>
                      <input
                        type="text"
                        value={formData.startDate}
                        onChange={(e) => handleChange('startDate', e.target.value)}
                        placeholder="Oct 1, 2026"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          Posting time
                        </label>
                        {aiFilledFields.postingTime && formData.postingTime && <AiFilledBadge source={aiFilledFields.postingTime} />}
                      </div>
                      <input
                        type="text"
                        value={formData.postingTime}
                        onChange={(e) => handleChange('postingTime', e.target.value)}
                        placeholder="9:00 AM"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Timezone (Auto-detected)
                      </label>
                      <input
                        type="text"
                        value={formData.timezone}
                        onChange={(e) => handleChange('timezone', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium"
                      />
                    </div>
                  </div>

                  <div
                    onClick={() => handleChange('autoSuggestPostingTime', !formData.autoSuggestPostingTime)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      formData.autoSuggestPostingTime
                        ? 'border-blue-200 bg-blue-50/40'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Star className="w-4 h-4 text-blue-600 shrink-0" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">Let SMBFlow suggest the best posting times</h4>
                        <p className="text-[11px] text-slate-500">Optimizes schedule based on platform engagement patterns for your audience.</p>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      formData.autoSuggestPostingTime ? 'bg-blue-600 text-white' : 'border border-slate-300'
                    }`}>
                      {formData.autoSuggestPostingTime && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              </div>

              <WizardFooter
                step={currentStep}
                onBack={() => setCurrentStep(4)}
                onNext={() => setCurrentStep(6)}
                nextLabel="Review launch →"
              />
            </StepCard>
          )}

          {/* STEP 6: REVIEW BRIEF (Figma Screen 2) */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-slate-900">Review your launch brief</h2>
                <p className="text-xs text-slate-500 mt-1">Make sure everything looks right before SMBFlow creates your campaign.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BriefCard title="Product" onEdit={() => setCurrentStep(1)}>
                  <BriefRow label="Name" value={formData.productName || 'TaskFlow Pro'} />
                  <BriefRow label="Action" value={formData.desiredCta || 'Try it free'} />
                  <BriefRow label="Launch date" value={formData.launchDate || 'Oct 1, 2026'} />
                  <BriefRow label="Website" value={formData.websiteUrl || 'taskflowpro.com'} isLink />
                </BriefCard>

                <BriefCard title="Audience" onEdit={() => setCurrentStep(2)}>
                  <BriefRow label="Who" value={formData.targetAudience || 'Small business owners & team leads'} />
                  <BriefRow label="Type" value={formData.customerType || 'B2B'} />
                  <BriefRow label="Geography" value={formData.geography || 'US, Canada'} />
                  <BriefRow label="Problem" value={formData.customerProblem || 'Disorganized tasks & missed deadlines'} />
                </BriefCard>

                <BriefCard title="Core message" onEdit={() => setCurrentStep(3)}>
                  <BriefRow label="Value prop" value={formData.valueProposition || "Project management that works out of the box"} />
                  <BriefRow label="Differentiator" value={formData.differentiator || "Built for teams of 5–50, not enterprise"} />
                  <BriefRow label="Tone" value={formData.toneOfVoice || "Professional"} />
                  <BriefRow label="Objective" value={formData.launchObjective || "Product adoption"} />
                </BriefCard>

                <BriefCard title="Assets" onEdit={() => setCurrentStep(4)}>
                  <BriefRow label="Images" value={formData.productImages.length > 0 ? `${formData.productImages.length} uploaded` : "No images uploaded"} />
                  <BriefRow label="Logo" value={formData.logoFile ? formData.logoFile.name : "No logo uploaded"} />
                  <BriefRow label="Visuals" value={formData.letSMBFlowCreateVisual ? "SMBFlow will create a launch visual" : "Disabled"} />
                </BriefCard>

                <BriefCard title="Platforms" onEdit={() => setCurrentStep(5)}>
                  <BriefRow
                    label="Selected"
                    value={Object.values(formData.platforms).filter(p => p.selected && p.connected).map(p => p.name).join(', ') || 'LinkedIn, X (connected)'}
                  />
                  <BriefRow
                    label="Pending connection"
                    value={Object.values(formData.platforms).filter(p => p.selected && !p.connected).map(p => p.name).join(', ') || 'Instagram, Facebook'}
                  />
                </BriefCard>

                <BriefCard title="Schedule" onEdit={() => setCurrentStep(5)}>
                  <BriefRow label="Type" value={`Launch ${formData.scheduleType}`} />
                  <BriefRow label="Start" value={`${formData.startDate || 'Oct 1, 2026'} • ${formData.postingTime} ${formData.timezone}`} />
                  <BriefRow label="Optimized" value={formData.autoSuggestPostingTime ? "Yes — SMBFlow scheduling" : "No"} />
                </BriefCard>

                {formData.additionalContext && (
                  <div className="md:col-span-2">
                    <BriefCard title="Additional Product Context (Extracted from Document)" onEdit={() => setCurrentStep(3)}>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {formData.additionalContext}
                      </p>
                    </BriefCard>
                  </div>
                )}
              </div>

              <div className="p-6 rounded-2xl bg-blue-50/70 border border-blue-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Ready to create your campaign?</h3>
                  <p className="text-xs text-blue-900/80 mt-1 max-w-xl">
                    SMBFlow will generate platform-specific posts, visuals, and a publishing schedule. You'll review and approve everything before anything is published.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(5)}
                    className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={startBuildingCampaign}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 shrink-0"
                  >
                    <Zap className="w-4 h-4 fill-white" /> Create campaign
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BUILDING LAUNCH CAMPAIGN LOADING SCREEN (Figma Screen 3) ── */}
      {viewMode === 'building' && (
        <div className="max-w-xl mx-auto py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/30">
            <RefreshCw className="w-7 h-7 animate-spin" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1.5">Building your launch campaign</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-10">
            SMBFlow is turning your launch brief into a complete campaign.
          </p>

          <div className="max-w-sm mx-auto space-y-3.5 text-left mb-12">
            {[
              'Understanding your launch brief',
              'Building campaign strategy',
              'Creating platform-specific content',
              'Creating launch visuals',
              'Reviewing content consistency',
              'Preparing your publishing schedule',
            ].map((label, idx) => {
              const isCompleted = buildingStep > idx
              const isActive = buildingStep === idx

              return (
                <div key={idx} className="flex items-center gap-3">
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  ) : isActive ? (
                    <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-300 shrink-0" />
                  )}
                  <span className={`text-xs font-semibold ${
                    isCompleted ? 'text-slate-800' : isActive ? 'text-blue-600 font-bold' : 'text-slate-400'
                  }`}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-slate-400">
            You can leave this page. Your campaign will be available when it's ready.
          </p>
        </div>
      )}

      {/* ── CAMPAIGN OVERVIEW & CALENDAR VIEWS ────────────────────────── */}
      {viewMode === 'campaign' && (
        <div className="max-w-5xl mx-auto space-y-6">
          {activeTab === 'overview' ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Platforms" value={Object.values(formData.platforms).filter(p => p.selected).length} />
                <StatCard label="Posts created" value={posts.length} />
                <StatCard label="Core Visuals" value={campaignVisuals.length} />
                <StatCard label="Launch date" value={formData.startDate || 'Oct 1'} />
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Campaign strategy</h3>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Generated by SMBFlow</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {formData.productName || 'TaskFlow Pro'} enters a competitive but underserved niche: project management for small teams who need power without complexity. The campaign leads with the core insight that most SMB teams lose hours every week to disorganized tasks — not because they don't care, but because enterprise tools like Jira or Asana are built for companies 10× their size. The campaign strategy runs over 7 days across 4 platforms with 3 reusable core visual assets. LinkedIn content targets founders and operations managers with data-backed messaging around time savings and team clarity. Instagram leads with visual storytelling — the transformation from chaos to calm. X captures the launch moment with punchy announcements designed for share velocity. Facebook focuses on community trust and social proof. Every post ties back to a single CTA: start a free trial.
                </p>
              </div>

              {/* ── CAMPAIGN VISUALS LIBRARY (2-3 Core Visuals reused across posts) ────────── */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Campaign Visuals</h3>
                    <p className="text-xs text-slate-500">Core reusable visual assets shared across all campaign posts (Max 3 default)</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateCustomVisual}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Create another visual
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {campaignVisuals.map((vis) => {
                    const postsUsingVis = posts.filter(p => p.visual_id === vis.visual_id || p.visual_prompt === vis.visual_prompt)
                    const isLoading = isGeneratingVisual[vis.visual_id]

                    return (
                      <div key={vis.visual_id} className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50 flex flex-col justify-between">
                        <div className="p-3 bg-white border-b border-slate-100 flex items-center justify-between">
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                            {vis.visual_role}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {vis.aspect_ratio || '16:9'} • Used in {postsUsingVis.length} posts
                          </span>
                        </div>

                        <div className="p-3">
                          {vis.generated_asset_url ? (
                            <div className="relative group rounded-xl overflow-hidden border border-slate-200 bg-black/5">
                              <img src={vis.generated_asset_url} alt={vis.visual_role} className="w-full h-44 object-cover" />
                              <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                                <button
                                  onClick={() => handleRegenerateVisual(vis.visual_id)}
                                  className="p-2 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-100"
                                  title="Regenerate"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleEditVisualPrompt(vis.visual_id)}
                                  className="p-2 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-100"
                                  title="Edit prompt"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <a
                                  href={vis.generated_asset_url}
                                  download={`${vis.visual_role.replace(/\s+/g, '_')}.svg`}
                                  className="p-2 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-100"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-slate-100 rounded-xl p-4 border border-slate-200 space-y-3 text-center min-h-[160px] flex flex-col justify-between">
                              <div>
                                <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-700 mb-1">
                                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                  <span>AI Visual Brief</span>
                                </div>
                                <p className="text-[11px] text-slate-600 italic line-clamp-3 bg-white/80 p-2 rounded-lg border border-slate-200/60">
                                  "{vis.visual_prompt}"
                                </p>
                              </div>

                              <button
                                type="button"
                                disabled={isLoading}
                                onClick={() => handleGenerateVisual(vis.visual_id)}
                                className="w-full py-2 px-3 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                {isLoading ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-3.5 h-3.5" /> Generate Visual
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="p-2.5 bg-white border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                            vis.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            vis.status === 'generated' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {vis.status === 'approved' ? 'Approved' : (vis.status === 'generated' ? 'Generated' : 'Pending')}
                          </span>

                          <div className="flex items-center gap-1">
                            {vis.status === 'generated' && (
                              <button
                                onClick={() => handleApproveVisual(vis.visual_id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg"
                              >
                                ✓ Approve
                              </button>
                            )}
                            {vis.generated_asset_url && (
                              <button
                                onClick={() => handleRegenerateVisual(vis.visual_id)}
                                className="px-2.5 py-1 border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-semibold rounded-lg"
                              >
                                Regenerate
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteVisual(vis.visual_id)}
                              className="p-1 text-slate-400 hover:text-red-600"
                              title="Remove"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 mr-2">Your campaign</span>
                  {['All', 'LinkedIn', 'Instagram', 'X', 'Facebook'].map(plat => (
                    <button
                      key={plat}
                      onClick={() => setPlatformFilter(plat)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        platformFilter === plat
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {plat}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    Showing {posts.filter(p => platformFilter === 'All' || p.platform === platformFilter).length} posts
                  </span>
                  <button
                    type="button"
                    onClick={handleExportCampaign}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Schedule (CSV)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {posts
                  .filter(p => platformFilter === 'All' || p.platform === platformFilter)
                  .map(post => {
                    const assignedVis = campaignVisuals.find(v => v.visual_id === post.visual_id) || {}
                    const assetUrl = post.generated_asset_url || assignedVis.generated_asset_url
                    const isVisLoading = isGeneratingVisual[post.visual_id]

                    return (
                      <div key={post.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all">
                        {assetUrl ? (
                          <div className="relative group overflow-hidden border-b border-slate-100">
                            <img src={assetUrl} alt={post.category} className="w-full h-36 object-cover" />
                            <div className="absolute top-2 right-2">
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                                post.status === 'Approved'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-xs'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 shadow-xs'
                              }`}>
                                {post.status}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-slate-100/90 border-b border-slate-100 flex flex-col justify-between relative min-h-[110px]">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                                <span className="text-xs font-bold text-slate-800">AI Visual Brief</span>
                              </div>
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                                post.status === 'Approved'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : post.status === 'Needs review'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                                {post.status}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-600 italic line-clamp-2 mt-2 bg-white/70 p-2 rounded-lg border border-slate-200/60">
                              "{post.visual_prompt || assignedVis.visual_prompt || `Clean visual design for ${formData.productName}: ${post.category}`}"
                            </p>

                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-[10px] text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/80">
                                Pending Generation • {post.visual_aspect_ratio || '16:9'}
                              </span>
                              <button
                                type="button"
                                disabled={isVisLoading}
                                onClick={() => handleGenerateVisual(post.visual_id || 'vis-hero-1')}
                                className="px-2.5 py-1 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-colors flex items-center gap-1 disabled:opacity-50"
                              >
                                {isVisLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                Generate Visual
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="p-4 space-y-2 flex-grow">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold uppercase tracking-wider text-slate-400">{post.category}</span>
                            <span className="text-slate-400">{post.scheduledTime}</span>
                          </div>

                          <p className="text-xs text-slate-700 line-clamp-3 leading-relaxed">
                            {post.caption}
                          </p>

                          <div className="flex flex-wrap gap-1 pt-1">
                            {post.hashtags.map((h, i) => (
                              <span key={i} className="text-[10px] text-blue-600 font-medium">
                                {h}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-1">
                          <button
                            onClick={() => {
                              setSelectedPostId(post.id)
                              setViewMode('post-review')
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg bg-white hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleGenerateVisual(post.visual_id || 'vis-hero-1')}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg bg-white hover:bg-slate-50"
                          >
                            Redo Visual
                          </button>
                          <button
                            onClick={() => togglePostApproval(post.id)}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                              post.status === 'Approved'
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                          >
                            {post.status === 'Approved' ? '✓ Approved' : '✓ Approve'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </>
          ) : (
            /* CAMPAIGN CALENDAR VIEW (Figma Screen 5) */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setActiveTab('overview')}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
                >
                  ← Back to campaign
                </button>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                    <button className="px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-900 rounded-md">Week</button>
                    <button className="px-3 py-1 text-xs font-semibold text-slate-500 hover:text-slate-900">List</button>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportCampaign}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Schedule (CSV)
                  </button>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900">Campaign calendar</h2>
                <p className="text-xs text-slate-500">{formData.productName || 'TaskFlow Pro'} • Oct 1 – Oct 7</p>
              </div>

              <div className="grid grid-cols-7 gap-3 pt-2">
                {[
                  { day: 'Wed', date: '1', active: true },
                  { day: 'Thu', date: '2', active: false },
                  { day: 'Fri', date: '3', active: false },
                  { day: 'Sat', date: '4', active: false },
                  { day: 'Sun', date: '5', active: false },
                  { day: 'Mon', date: '6', active: false },
                  { day: 'Tue', date: '7', active: false },
                ].map(col => {
                  const dayPosts = posts.filter(p => p.dateStr === `${col.day} ${col.date}`)

                  return (
                    <div key={col.date} className="space-y-2">
                      <div className={`p-2.5 text-center rounded-xl text-xs font-bold ${
                        col.active ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100/80 text-slate-700'
                      }`}>
                        <span className="block text-[10px] uppercase tracking-wider font-semibold opacity-80">{col.day}</span>
                        <span className="text-sm">{col.date}</span>
                      </div>

                      <div className="space-y-2">
                        {dayPosts.map(p => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedPostId(p.id)
                              setViewMode('post-review')
                            }}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all hover:border-blue-400 ${
                              p.platform === 'LinkedIn' ? 'bg-blue-50/40 border-blue-100' :
                              p.platform === 'Instagram' ? 'bg-pink-50/40 border-pink-100' :
                              p.platform === 'X' ? 'bg-slate-100/60 border-slate-200' : 'bg-indigo-50/40 border-indigo-100'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700 mb-1">
                              <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] text-white font-bold ${
                                p.platform === 'LinkedIn' ? 'bg-blue-600' : p.platform === 'Instagram' ? 'bg-pink-600' : p.platform === 'X' ? 'bg-black' : 'bg-blue-700'
                              }`}>
                                {p.platform.charAt(0)}
                              </span>
                              <span>{p.timeStr}</span>
                            </div>
                            <p className="text-[11px] font-medium text-slate-800 line-clamp-1 mb-1.5">{p.category.toLowerCase()}</p>
                            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded ${
                              p.status === 'Needs review' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {p.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DETAILED POST REVIEW SCREEN (Figma Screen 4) ───────── */}
      {viewMode === 'post-review' && currentPost && (
        <div className="max-w-4xl mx-auto space-y-6">
          <button
            onClick={() => setViewMode('campaign')}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
          >
            ← Back to campaign
          </button>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl ${
                currentPost.platform === 'LinkedIn' ? 'bg-blue-600' : currentPost.platform === 'Instagram' ? 'bg-pink-600' : currentPost.platform === 'X' ? 'bg-black' : 'bg-blue-700'
              } text-white font-bold text-sm flex items-center justify-center shadow-xs`}>
                {currentPost.platform.charAt(0)}
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Review post</h1>
                <p className="text-xs text-slate-500">{currentPost.platform} • {currentPost.category.toLowerCase()}</p>
              </div>
            </div>
            <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {currentPost.status}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="md:col-span-2 space-y-4">
              {(() => {
                const assignedVis = campaignVisuals.find(v => v.visual_id === currentPost.visual_id) || {}
                const assetUrl = currentPost.generated_asset_url || assignedVis.generated_asset_url
                const isVisLoading = isGeneratingVisual[currentPost.visual_id]

                if (assetUrl) {
                  return (
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Campaign Visual</span>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                          {currentPost.visual_status || 'Generated'}
                        </span>
                      </div>
                      <div className="relative group rounded-xl overflow-hidden border border-slate-200">
                        <img src={assetUrl} alt={currentPost.category} className="w-full h-52 object-cover" />
                        <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                          <button
                            onClick={() => handleRegenerateVisual(currentPost.visual_id || 'vis-hero-1')}
                            className="p-2 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-100"
                            title="Regenerate"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditVisualPrompt(currentPost.visual_id || 'vis-hero-1')}
                            className="p-2 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-100"
                            title="Edit prompt"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <a
                            href={assetUrl}
                            download="campaign_visual.svg"
                            className="p-2 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-100"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => handleRegenerateVisual(currentPost.visual_id || 'vis-hero-1')}
                          className="w-full py-2 px-3 text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Regenerate Visual
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div className="bg-slate-100/90 rounded-2xl border border-slate-200 p-5 space-y-3 text-center relative">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-1">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">AI Visual Brief</h4>
                      <span className="inline-block px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded-full mt-1">
                        Pending generation ({currentPost.visual_aspect_ratio || '16:9'})
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 italic bg-white p-3 rounded-xl border border-slate-200 text-left leading-relaxed">
                      "{currentPost.visual_prompt || assignedVis.visual_prompt || `Clean visual design for ${formData.productName}: ${currentPost.category}`}"
                    </p>
                    <button
                      type="button"
                      disabled={isVisLoading}
                      onClick={() => handleGenerateVisual(currentPost.visual_id || 'vis-hero-1')}
                      className="w-full py-2 px-3 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isVisLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" /> Generate Visual
                        </>
                      )}
                    </button>
                  </div>
                )
              })()}

              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Platform</span>
                  <span className="font-semibold text-slate-800">{currentPost.platform}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Date</span>
                  <span className="font-semibold text-slate-800">{currentPost.scheduledTime.split(' - ')[0]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Time</span>
                  <span className="font-semibold text-slate-800">{currentPost.scheduledTime.split(' - ')[1]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Action</span>
                  <span className="font-semibold text-slate-800">{currentPost.actionLabel}</span>
                </div>
              </div>
            </div>

            <div className="md:col-span-3 space-y-4">
              <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Caption</h3>
                    <span className="text-[10px] text-slate-400">Suggested by SMBFlow</span>
                  </div>
                  <button className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                </div>

                <textarea
                  rows={8}
                  value={currentPost.caption}
                  onChange={(e) => {
                    const newCap = e.target.value
                    setPosts(prev => prev.map(p => p.id === currentPost.id ? { ...p, caption: newCap } : p))
                  }}
                  className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed"
                />
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Hashtags</h3>
                <div className="flex flex-wrap gap-2">
                  {currentPost.hashtags.map((tag, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1">
                      {tag}
                      <button onClick={() => handleRemoveHashtag(currentPost.id, idx)} className="hover:text-red-600">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={() => {
                      const tag = prompt('Enter new hashtag:')
                      if (tag) handleAddHashtag(currentPost.id, tag)
                    }}
                    className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-200"
                  >
                    + Add
                  </button>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-4">
                <div className="flex items-start gap-2 text-xs text-emerald-900">
                  <AlertCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p>
                    Your explicit approval is required before this post is scheduled. SMBFlow will not publish without your confirmation.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      togglePostApproval(currentPost.id)
                      setViewMode('campaign')
                    }}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex-1"
                  >
                    ✓ Approve post
                  </button>
                  <button
                    onClick={() => setViewMode('campaign')}
                    className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-50"
                  >
                    Save changes
                  </button>
                  <button
                    onClick={() => alert(`Refining prompt for post: ${currentPost.id}`)}
                    className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── SUBCOMPONENTS ─────────────────────────────────────────────────────────────

function StepCard({ title, children }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl p-6 md:p-8 shadow-xs">
      <h2 className="text-lg font-bold text-slate-900 mb-6">{title}</h2>
      {children}
    </div>
  )
}

function WizardFooter({ step, onBack, onNext, nextLabel = 'Continue →' }) {
  return (
    <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
      {step > 1 ? (
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl bg-white hover:bg-slate-50"
        >
          ← Back
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {}}
          className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-600"
        >
          Save draft
        </button>
      )}

      {step > 1 && (
        <button
          type="button"
          onClick={() => {}}
          className="text-xs font-medium text-slate-400 hover:text-slate-600 hidden md:block"
        >
          Save draft
        </button>
      )}

      <button
        type="button"
        onClick={onNext}
        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5"
      >
        {nextLabel}
      </button>
    </div>
  )
}

function CollapsibleSection({ title = "Optional & advanced details", isOpen, onToggle, children }) {
  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors py-1"
      >
        <span className="flex items-center gap-1.5 text-blue-600">
          <Sliders className="w-3.5 h-3.5" />
          {title}
        </span>
        <span className="text-[11px] font-normal text-slate-400 flex items-center gap-1">
          {isOpen ? 'Hide optional fields' : 'Show optional fields'}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {isOpen && <div className="pt-3 space-y-4">{children}</div>}
    </div>
  )
}

function BriefCard({ title, onEdit, children }) {
  return (
    <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">{title}</h4>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          Edit
        </button>
      </div>
      <div className="space-y-2 text-xs">{children}</div>
    </div>
  )
}

function BriefRow({ label, value, isLink = false }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span className="text-slate-400 font-medium">{label}</span>
      <span className={`col-span-2 font-medium ${isLink ? 'text-blue-600' : 'text-slate-800'}`}>
        {value}
      </span>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">{label}</span>
      <span className="text-2xl font-bold text-slate-900">{value}</span>
    </div>
  )
}

function AiFilledBadge({ source = 'ai_extraction' }) {
  if (source === 'uploaded_document') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 shadow-2xs">
        <FileText className="w-2.5 h-2.5 text-indigo-600" />
        From document
      </span>
    )
  }

  if (source === 'user_message') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
        <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
        From prompt
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 shadow-2xs">
      <Sparkles className="w-2.5 h-2.5 text-blue-600" />
      AI-filled
    </span>
  )
}
