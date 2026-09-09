# Product Requirements Document
## Accountable Medical Journey Platform for International Patients Seeking Care in India

**Document status:** Decision-ready v1.0  
**Audience:** Founder/stakeholders, product lead, four technical interns, clinical/operations advisors  
**Pilot focus:** Fertility/IVF in India; complex or revision orthopedics as a secondary discovery track  
**Internship constraint:** Four CS/AI-focused interns, four months  
**Product principle:** The platform assists patients and operations; it does not diagnose, prescribe, recommend a clinical treatment, or replace a licensed clinician.

---

## 1. Executive summary

### 1.1 Product decision
Build one integrated product with two controlled surfaces:

1. **AI Operations & Trust Engine (internal):** a coordinator-facing workspace that turns fragmented medical records, provider information, quotes, logistics information, and correspondence into structured, reviewable case data.
2. **Patient Journey Platform (public + secure patient area):** a trustworthy discovery, comparison, education, and concierge-entry experience. It surfaces only approved, de-identified, appropriately fresh information from the Trust Engine and converts qualified visitors into managed coordination cases.

The product should not be positioned as a generic directory or a self-serve medical-booking site. It is an **accountable medical journey management platform**: patients can research India, compare vetted options, organize their journey, and engage a human coordinator who remains responsible for coordination execution.

### 1.2 North Star

**North Star statement:** Make India the most understandable, verifiable, and manageable destination for an international patient’s complex treatment journey—by transforming opaque provider, cost, documentation, travel, and recovery information into a human-reviewed decision and execution plan.

Over time, the platform becomes the trusted operating system for international care in India. Its patient-facing experience is powered by the same structured, evidence-linked data and human-review workflows used by internal coordinators. A patient can explore care options confidently, understand what a quoted package does and does not include, prepare for travel, and receive continuity support after returning home—without the platform claiming to make clinical decisions. The defensible asset is not a large list of hospitals; it is a verified data network plus accountable execution layer.

### 1.3 Strategic objective

Create a category advantage over commission-funded medical-tourism marketplaces by delivering four things patients can see and feel:

- **Evidence-backed transparency:** Every public claim, cost range, inclusion/exclusion, credential, and freshness date is traceable to an internal evidence record and coordinator review.
- **Decision readiness:** Patients receive a structured comparison and question set that helps them discuss options with their own clinician and family; they do not receive an algorithmic treatment recommendation.
- **Accountable execution:** One named coordinator and a shared journey plan own non-clinical coordination from inquiry through post-return handoff.
- **Continuity beyond travel:** The platform organizes records, discharge documents, medication lists, follow-up tasks, and home-provider handoff rather than ending at hospital selection.

---

## 2. Market and customer implications

### 2.1 Competitive baseline

Established medical-travel facilitators already advertise provider selection, appointment coordination, visa assistance, travel/accommodation support, interpretation, and follow-up. MediGence, for example, markets hospital and doctor selection, consultation coordination, visa and travel assistance, and post-treatment follow-up. This means basic comparison, quote requests, and concierge promises are table stakes rather than differentiation.

The platform must therefore compete on **trust quality and execution quality**, not on the number of listings or lowest advertised price.

### 2.2 What patients actually need

A prospective international patient or family member is trying to answer five high-stakes questions:

1. **Is India and this provider appropriate for my situation?** They need credible specialty, provider, facility, and practical-care context without the platform making a clinical recommendation.
2. **What will this really cost?** They need a normalized view of the quote, assumptions, included services, excluded services, payment milestones, and uncertainty—not a misleading “starting from” number.
3. **What happens from now until I am safely home?** They need a visible, personalized journey plan spanning medical-document preparation, consultation, visa, arrival, hospital stay, discharge, recovery, and follow-up.
4. **Who is accountable when coordination breaks down?** They need a named human, a response promise, escalation path, and a written scope of service.
5. **Can I trust the information and control my records?** They need transparent verification labels, source/freshness dates, consent controls, document access, and an understandable privacy posture.

### 2.3 Customer segments and jobs to be done

| Segment | Primary job | Key anxiety | Product response |
|---|---|---|---|
| IVF patient/couple abroad | Understand realistic options, timing, cost, and travel requirements before committing | Emotional stress, confusing success claims, multi-step planning | Curated fertility discovery, quote normalization, fertility-specific journey checklist, coordinator-led inquiry |
| Complex/revision orthopedic patient | Assess whether a provider can handle a difficult prior-treatment history | Need for records synthesis, implant/imaging review, recovery planning | Secure record intake, timeline extraction, specialist-consultation coordination, rehab and follow-up plan |
| Family decision maker/attendant | Coordinate documents, money, travel, and support while protecting the patient | Administrative burden and fear of missed steps | Shared checklist, attendant workflow, expense/quote view, communications hub |
| Referring physician/physiotherapist abroad | Help a patient access an option while retaining continuity of care | Poor information exchange and unclear follow-up | Later-phase referral intake, consented record-sharing, milestone updates, discharge/handoff packet |
| Internal coordinator | Move cases quickly without losing accuracy or patient context | Manual document work, fragmented communication, missed follow-ups | AI-assisted extraction, review queue, case timeline, templates, task orchestration |

### 2.4 Positioning

**Patient-facing promise:** “Understand your treatment journey in India before you commit—and have a named team accountable for coordinating it.”

**Proof points:**

- Vetted, dated listings rather than unverified self-submitted profiles.
- Side-by-side quote inclusions/exclusions and source dates.
- Clear distinction among verified facts, provider-supplied statements, estimates, and pending confirmations.
- A coordinator-reviewed journey plan, not only a lead form.
- Post-treatment records and follow-up handoff support.

**Claims to avoid:** “Best doctor,” “guaranteed outcomes,” “lowest price,” “risk-free,” “AI medical diagnosis,” or any comparative clinical-quality claim without legal, clinical, and evidence review.

---

## 3. Product principles and boundaries

### 3.1 Non-negotiable principles

1. **Human authority over AI.** AI may extract, summarize, draft, classify, prioritize, and flag. It may not autonomously publish patient-facing facts, send external messages, approve records, provide individualized clinical advice, or make treatment/provider decisions.
2. **Evidence before presentation.** A public datum must have a source, verification status, reviewer, effective date, expiry/review date, and audit history.
3. **No clinical decision-making.** The platform helps patients prepare questions and coordinate consultations. It does not diagnose, triage emergencies, interpret images, choose a treatment, or rank providers based on individualized medical suitability.
4. **Explain uncertainty.** Cost and availability are estimates unless confirmed in writing; the interface must show assumptions, exclusions, and “last verified” dates.
5. **Minimum necessary data.** Collect only what is necessary for the selected purpose, isolate patient data from public-content data, and do not reuse medical records for marketing without a distinct lawful basis/consent.
6. **Accountability is visible.** Each active case has a case owner, service scope, response expectation, escalation route, and task-based journey plan.
7. **Narrow before broad.** One excellent specialty and a small verified provider set is strategically better than a broad but thin marketplace.

### 3.2 Explicit non-goals for the four-month pilot

- No self-serve booking, hospital admission, treatment booking, or medical-payment checkout.
- No autonomous patient-facing medical chatbot or treatment recommendation engine.
- No direct diagnosis, clinical triage, medication advice, image interpretation, or outcome prediction.
- No public hospital self-service onboarding or unmoderated listing edits.
- No publishing of raw medical documents, patient reviews containing health details, or patient-identifying data.
- No broad “all treatments in India” directory.
- No production-scale, multi-country regulatory deployment claim.
- No integration dependency on hospital EHRs, insurers, visa systems, or government systems for the pilot.
- No automatic outbound email/WhatsApp/SMS from AI without coordinator approval.

---

## 4. Product architecture

### 4.1 Integrated-system design

The product must be implemented as a shared data and policy layer with different views—not as two disconnected applications.

```
Raw records / quotes / correspondence / provider evidence
            ↓
Secure internal document store + source registry
            ↓
AI extraction and normalization (non-authoritative)
            ↓
Coordinator review, correction, verification, and approval
            ↓
Canonical operational data model + audit trail
            ↓
Publication policy gate (de-identification + freshness + approval)
            ↓
Public provider/listing/comparison content and patient journey content
            ↓
Qualified inquiry → consented case → coordinator-led execution
```

### 4.2 System-of-record rule

- The internal Trust Engine is the system of record for operational cases, sources, quotes, extracted fields, reviews, provider verification, and listing publish state.
- The public site is a read-only projection of approved content. It must never read from raw documents or patient/case tables.
- The secure patient area may show only data related to the authenticated patient’s case, governed by consent and access rules.

### 4.3 Content segregation

| Data class | Example | Who can access | Can be public? |
|---|---|---|---|
| Raw sensitive case data | Reports, imaging, passport copy, quote PDF, correspondence | Authorized internal case team only | Never |
| Internal normalized case data | Extracted diagnosis wording, quote line items, case notes | Authorized internal case team | Never |
| Provider evidence | Accreditation proof, provider CV, official quote template, service confirmation | Authorized operations/reviewers | Only approved derivative facts |
| Public listing data | Facility city, approved specialty scope, dated cost range, inclusions, verification label | Anyone | Yes, after publication gate |
| Patient portal data | Journey tasks, approved quote comparison, confirmed appointments, patient-owned documents | Patient and authorized case team | No |

---

## 5. Product scope and requirements

## 5.1 Surface A: Public discovery and trust platform

### Goal
Help patients understand available treatment-related offerings in India, assess whether to engage the concierge service, and submit a high-intent inquiry—without creating unsafe self-service clinical decisioning.

### A1. Public information architecture

**Must-have in pilot**

- Home page that clearly explains scope: international medical journey coordination in India, not medical advice or emergency care.
- One specialty landing area for fertility/IVF with patient-oriented education, “what to expect,” preparation questions, and journey stages.
- Curated provider/facility listing index limited to reviewed pilot providers.
- Provider/facility profile pages with only approved fields: location, specialty scope, verified credentials/accreditation evidence where validated, international-patient support capabilities, languages, patient-support logistics, and last-verified date.
- Treatment/journey information pages that are reviewed editorial content, not individualized advice.
- “How coordination works” page: scope, what is included/excluded, service tiers or indicative fees, response expectations, and escalation/contact paths.
- A high-intent inquiry flow with consent and structured intake.
- Country/source-market guidance pages only after legal/content review; do not publish visa advice as authoritative legal guidance.
- Trust center explaining verification labels, freshness rules, data privacy, editorial policy, and conflict-of-interest/compensation disclosure.

**Stretch**

- Multi-language public content with professionally reviewed translations.
- Search and filters for city, specialty, patient-support capabilities, and verification recency.
- Referring-provider landing pages and digital referral form.
- Structured FAQ search augmented by a policy-grounded, non-clinical assistant.
- De-identified educational cost explainers based on verified quote patterns.

### A2. Listing and comparison requirements

**Must-have in pilot**

- A listing cannot be public without an approved `published` state.
- Each listing displays: scope of service, location, “last verified” date, verification level, and how to request a current case-specific quote.
- Where cost is shown, display a range only when supported by reviewed evidence and always show quote date, currency, scope assumptions, likely inclusions/exclusions, and the statement that a patient-specific written quote controls.
- Comparison view limited to a small number of compatible fields and never uses “best match” or personalized clinical ranking.
- Every listing includes an action to “Request a coordinator-reviewed comparison” rather than “Book now.”
- A stale listing is automatically hidden or visibly marked non-actionable according to policy.
- Every public statement is traceable to an internal source/evidence ID and reviewer approval, even if the public page does not expose the raw evidence.

**Stretch**

- Comparison worksheet export for patients, clearly labeled educational/non-clinical.
- Provider response-time or service-fulfillment metrics only after reliable operational measurement and legal review.
- Structured, moderated patient-experience content with explicit consent and privacy safeguards.

### A3. Inquiry and conversion flow

**Must-have in pilot**

1. Patient selects a specialty/journey topic or provider listing.
2. Patient chooses “Request a coordinator-reviewed plan/comparison.”
3. System explains that it is not emergency or clinical advice and displays emergency guidance.
4. Patient provides contact information, country, broad need, target timeline, and consent choices.
5. Medical-document upload is optional at first contact; show a separate specific consent notice before upload.
6. System creates an internal lead/case record, assigns a triage queue, and acknowledges receipt with expected human response time.
7. Coordinator reviews and decides whether to open a coordination case, request information, or decline/redirect based on published eligibility rules.

**Stretch**

- Secure patient account with status tracking, document vault, and shared family/attendant access.
- Referral-specific intake flow with patient authorization and status notifications.
- Lead-scoring support for internal prioritization; never auto-reject solely based on a model score.

### A4. Patient-facing AI use

**Pilot rule:** No free-form AI agent that responds to case-specific medical questions. The public experience may use constrained AI only for content retrieval and navigation against approved knowledge content.

**Permitted, if built safely**

- Retrieval-based “find the right page/checklist” assistant grounded only in approved public content.
- Answers must include source links, “not medical advice” framing, and a handoff path to a human coordinator.
- Hard refusal and escalation for symptoms, emergencies, diagnosis, treatment choice, medication, dose, pregnancy/acute-risk questions, or individualized prognosis.

**Not permitted**

- Medical advice, provider recommendations based on patient records, clinical risk scoring, differential diagnosis, or autonomous care planning.

---

## 5.2 Surface B: Secure patient journey workspace

### Goal
Once a lead becomes a case, give the patient/family a simple, shared, non-clinical operating view of their journey while reducing coordinator follow-up burden.

### B1. Patient journey features

**Must-have in pilot**

- Secure case access after verified invitation/authentication.
- Case stage tracker: intake, record collection, consultation coordination, quote comparison, decision support, travel/document preparation, arrival, treatment coordination, discharge, return-home follow-up.
- Personalized task checklist generated from templates and coordinator edits.
- Secure document request/upload status, with document categories and expiry flags.
- Approved quote comparison view: provider-specific quote, normalized items, inclusions, exclusions, assumptions, currency, validity date, and questions outstanding.
- Appointment and key-milestone timeline.
- Secure coordinator-message request form or inbox; coordinator approval is required for any AI-assisted outgoing response.
- Important contacts, emergency boundary statement, and escalation instructions.
- Post-discharge document checklist and handoff package status.

**Stretch**

- Shared access for an attendant/family member with granular permissions.
- Automated—but coordinator-approved—reminders for missing documents, visa milestones, appointment preparation, and follow-up tasks.
- Travel/accommodation planning with human-reviewed options.
- Secure export/share packet for the home clinician, subject to explicit patient authorization.
- Multilingual UI and document translation workflow with human review.

### B2. Patient value standard

The patient should be able to answer, in under one minute:

- What stage is my case in?
- What do I need to do next?
- What is confirmed versus still pending?
- What does each quote include and exclude?
- Who is my coordinator and when should I expect a response?
- Where are my approved documents and follow-up instructions?

---

## 5.3 Surface C: AI Operations & Trust Engine

### Goal
Enable a small coordinator team to manage high-touch complex cases with lower administrative effort, consistent quality, verifiable data, and safe human control.

### C1. Case workspace

**Must-have in pilot**

- Case/lead creation from public inquiry, referral, and manual entry.
- Unified case timeline: intake, documents, communications, provider outreach, quotes, tasks, appointments, travel milestones, and final outcome.
- Case stage, owner, priority, target dates, source channel, service tier, fee/payment status, and reason codes.
- Contact model for patient, attendant, referring clinician, provider contacts, and internal team.
- Task management with ownership, due dates, dependencies, status, and escalation flags.
- Time tracking per case and activity type to establish operational baseline and margin visibility.
- Case notes with access controls and audit trail.
- Template library for non-clinical intake questions, provider quote requests, missing-document requests, and journey checklists.

### C2. Document intelligence pipeline

**Must-have in pilot**

- Secure upload of PDFs, images, and office documents.
- Document classification: medical report, imaging report, prescription, quote, passport/identity, referral, discharge summary, correspondence, other.
- OCR/text extraction where needed.
- LLM extraction into defined schemas with field-level source citations/page references.
- Confidence score per field and document, with low-confidence routing to review.
- Human-review UI showing source document next to extracted structured fields.
- Reviewer actions: approve, edit, reject, mark unknown, request clarification.
- Versioning and provenance: preserve raw file, extracted version, reviewer, timestamp, model/prompt version, and approved canonical value.
- Explicit distinction between clinical-document summarization for administrative coordination and clinical interpretation. The platform may summarize stated facts from records but must not infer a diagnosis or recommend treatment.

**Pilot extraction schemas**

- **Quote:** provider, facility, procedure/service label, currency, price items, total, taxes, package inclusions, exclusions, validity, estimated length of stay, payment terms, quote conditions, source date.
- **Provider/facility evidence:** identity, specialty/service scope, city, stated accreditations/credentials, international-patient contact, languages, source and expiry/verification date.
- **Record inventory:** document date, issuing facility, author, document type, key stated diagnoses/procedures/history/medication/allergy fields only when present, missing-data flags, page references.
- **Logistics document:** passport validity status, visa invitation status, appointment confirmation, travel/arrival details, insurance/travel-document checklist.

**Stretch**

- Cross-document conflict detection: different procedure names, inconsistent amounts, conflicting dates, expired credentials, quote validity expired.
- Structured translation assistance with source/translated text retained and human confirmation.
- Batch processing queue and operations dashboard.
- Document redaction assistant for creating public-safe or referral-safe derivatives; human approval mandatory.

### C3. Quote normalization and comparison

**Must-have in pilot**

- Canonical cost taxonomy for fertility/IVF pilot: consultation, diagnostic work-up, stimulation medication, retrieval/procedure, laboratory/embryology services, transfer, cryopreservation/storage, donor-related elements where applicable, anesthesia, facility charges, tests, accommodation/logistics if separately quoted, taxes, and exclusions/contingencies.
- Quote normalization mapping from provider-specific terms to canonical categories.
- Original language/value retained alongside normalized value.
- Currency conversion display only as an indicative comparison aid; store conversion source/date and make clear that payments follow provider quote currency/terms.
- Comparison UI that highlights missing items, exclusions, conflicting assumptions, quote expiration, and coordinator questions—not a single “cheapest/best” rank.
- Approval requirement before a normalized comparison becomes patient-visible.

**Stretch**

- Configurable specialty taxonomies for revision orthopedics.
- Quote variance analytics across providers and time.
- Suggested clarification questions generated from quote gaps, reviewed before send.

### C4. Provider and content verification

**Must-have in pilot**

- Provider/facility record with source-backed facts, relationship status, verification date, next review date, reviewer, and evidence attachments.
- Verification checklist requiring at minimum: legal/facility identity confirmation, specialty/service scope confirmation, international-patient contact confirmation, credential/accreditation evidence where claimed, quote/source recency, and operational capability confirmation relevant to the pilot.
- Evidence statuses: `unverified`, `provider-supplied`, `independently-verified`, `review-needed`, `expired`, `not-publishable`.
- Separate content publishing workflow: draft → reviewer-approved → published → stale/archived.
- Scheduled review queue for expiring quotes and stale public listings.
- Conflict-of-interest/compensation field and internal disclosure workflow.

**Stretch**

- Provider performance scorecard based on operational evidence: quote responsiveness, documentation completeness, appointment reliability, support fulfillment, dispute/escalation outcomes. Do not publish externally until methodology, sample size, and legal review are mature.
- Credential/accreditation renewal alerts.

### C5. Communications copilot

**Must-have in pilot**

- Draft-only messages for coordinators based on approved templates and current case facts.
- Drafted provider requests for quote clarification and missing information.
- Drafted patient updates that reflect case status and next steps.
- Mandatory human edit/approval before sending through any channel.
- Communication log linked to case, contact, purpose, sender, approval status, and delivery result.
- Safe prompt context boundaries: no use of one patient’s data in another case; no model training on case data without explicit governance decision.

**Stretch**

- Conversation summarization for coordinator handoffs.
- Suggested next tasks based on missing milestones; coordinator accepts/rejects.
- Policy-controlled WhatsApp/email integration with approved send actions.

---

## 5.4 Surface D: Referral partner workspace (later phase)

### Goal
Support the B2B2C acquisition model without creating major scope expansion during the pilot.

**Pilot:** Do not build a portal. Provide a secure referral intake form and manual coordinator communication workflow.

**Later phase requirements**

- Referring provider account, verified organization profile, and consented patient referral submission.
- Clear patient authorization for sharing status or documents back to the referrer.
- High-level milestone status—not unrestricted access to the patient case.
- Structured discharge/follow-up packet sharing after patient approval.
- Referral attribution and outcome analytics.

---

## 6. AI, GenAI, and agentic-AI operating model

### 6.1 Design objective

Use AI to remove administrative friction and improve consistency, not to automate high-risk authority. The operating model should let a small team handle more cases by automating preparation, routing, extraction, quality checks, and task follow-through while reserving external commitments and judgment for people.

### 6.2 Capability map

| Capability | AI/agent role | Human control | Pilot priority |
|---|---|---|---|
| Intake classification | Categorize inquiry, detect missing fields, route queue | Coordinator accepts/changes classification | Must-have |
| Document extraction | Extract structured facts with page citations and confidence | Reviewer approves/edits each authoritative field | Must-have |
| Quote normalization | Map items to taxonomy; flag omissions and contradictions | Coordinator validates mapping and patient-facing output | Must-have |
| Record summarization | Create administrative case brief from stated record facts | Coordinator reviews; no clinical inference | Must-have |
| Communication drafts | Draft updates, requests, and reminders from approved data | Human edits and sends | Must-have |
| Task orchestration | Suggest next tasks from stage/templates/missing items | Coordinator accepts/rejects; no autonomous action | Must-have |
| Public content assistant | Retrieve approved educational content and route to humans | Guardrails, answer logging, escalation policy | Stretch |
| Provider-data freshness agent | Detect expired sources and create review tasks | Reviewer decides status/publishing | Stretch |
| Multi-step autonomous outreach | Research contacts, request data, negotiate, send messages | Not allowed in pilot | Later |
| Clinical advisor/recommender | Diagnose, rank individualized options, interpret images | Not allowed | Never without clinical/legal program |

### 6.3 Agent architecture: bounded workflows, not open autonomy

Use narrowly scoped workflow agents with typed inputs/outputs and tool permissions. Each agent must have:

- A defined purpose and limited tool access.
- Structured output schema validated by the application.
- Evidence/citation requirements for extracted facts.
- Confidence thresholds and deterministic escalation rules.
- Full execution log: input document IDs, prompts/version, model/version, outputs, reviewer outcome, and downstream use.
- No direct permission to publish, send, delete, commit payment, or alter authoritative data without a human approval event.

**Recommended pilot agents**

1. **Intake Triage Agent**
   - Inputs: inquiry form, selected specialty, optional free-text request.
   - Outputs: category, missing information, urgency/safety flag, suggested intake checklist.
   - Safety: if emergency/acute-risk language appears, show emergency guidance and create priority human review; do not diagnose.

2. **Document Intake Agent**
   - Inputs: uploaded file and metadata.
   - Outputs: document type, OCR requirement, candidate fields, confidence, source-page references.
   - Safety: all outputs remain non-authoritative until reviewed.

3. **Quote Comparison Agent**
   - Inputs: reviewed quote extraction plus canonical taxonomy.
   - Outputs: normalized line items, missing/ambiguous terms, comparison notes, suggested clarification questions.
   - Safety: cannot designate a “winner” or publish a comparison.

4. **Case Brief Agent**
   - Inputs: coordinator-approved structured facts and communications.
   - Outputs: concise operational brief, outstanding items, upcoming milestones, risks/flags.
   - Safety: label as coordination summary; no clinical inference.

5. **Freshness & Publishing Agent**
   - Inputs: public listing fields, evidence dates, publication rules.
   - Outputs: stale-risk alerts, required review tasks, publish eligibility calculation.
   - Safety: may block or flag publication but cannot publish.

6. **Coordinator Copilot**
   - Inputs: approved case context and template.
   - Outputs: editable message/task drafts.
   - Safety: draft-only, with no automatic transmission.

### 6.4 Evaluation and quality program

The interns must treat AI quality as a product requirement, not an afterthought.

**Evaluation dataset**

- Build a de-identified, permissioned evaluation set of representative documents: at least 30–50 quotes and 30–50 relevant case documents where feasible, with a separate held-out test set.
- Create a human-reviewed “gold” schema for key fields.
- Include difficult examples: scanned PDFs, inconsistent terminology, multi-currency quotes, missing inclusions, tables, handwritten annotations where permitted, and conflicting dates.

**Metrics**

- Field-level precision, recall, and F1 for quote/provider/document fields.
- Exact-match or normalized-value accuracy for high-risk fields: total amount, currency, quote validity, facility, procedure label, inclusion/exclusion flags.
- Citation/page-grounding accuracy: whether the cited source supports the extracted field.
- Review burden: median corrections per document and review time per document.
- Unsafe-output rate: unsupported facts, wrong patient/document association, inappropriate clinical language, or blocked-action bypass attempts.
- Public publishing defect rate: target **zero** unapproved, stale, or unsupported public facts.

**Release gates**

- AI extraction may appear to internal reviewers only until evaluation thresholds are approved by product/operations leadership.
- Any field below threshold must either require mandatory manual entry/review or be removed from the AI-assisted pilot scope.
- Public content publication requires a human reviewer regardless of model performance.
- Prompt/model changes must be versioned and regression-tested against the held-out set before release.

---

## 7. Shared data model

### 7.1 Core entities

| Entity | Purpose | Key fields |
|---|---|---|
| Contact | Represents patient, attendant, provider contact, referrer, coordinator | role, identity/contact fields, consent status, communication preferences |
| Case | Operational container for a prospective/active patient journey | case ID, stage, specialty, owner, priority, source, service tier, outcome, timestamps |
| Consent | Purpose-specific authorization and withdrawal record | contact/case, purpose, notice version, method, timestamp, status, withdrawal timestamp |
| Document | Raw uploaded or received artifact | document ID, case ID, type, source, storage pointer, uploader, access class, checksum, retention status |
| Extraction run | Non-authoritative AI/OCR output | document ID, model/prompt version, schema, output, confidence, citations, run status |
| Reviewed fact | Human-approved canonical datum from source evidence | entity/field, value, source document/evidence ID, reviewer, review timestamp, confidence, status |
| Provider/facility | Vetted care organization or provider profile | identity, location, scope, contact, relationship, verification status, next review date |
| Provider evidence | Evidence supporting provider/public claims | evidence type, source, received date, expiry, reviewer, status, attachment/reference |
| Quote | Raw and canonical commercial offer | provider, case, raw document ID, issue/validity dates, currency, total, terms, review status |
| Quote line item | Normalized cost component | quote ID, canonical category, raw label, amount/range, inclusion/exclusion, confidence, reviewer status |
| Listing | Public-facing derivative of verified provider data | provider ID, specialty, approved fields, verification label, publish state, last verified, stale date |
| Publication approval | Human approval event for a listing/content version | object/version, reviewer, evidence references, approval date, expiration/review date |
| Task | Work item for coordinator/team | case ID, task type, owner, due date, dependency, status, escalation state |
| Time entry | Operational effort measurement | case ID, user, activity type, duration, date |
| Communication | Inbound/outbound case interaction | channel, participants, body/attachment references, drafted-by-AI flag, reviewer/sender, status |
| Appointment/milestone | Confirmed or planned event | case ID, provider, type, date/time, status, confirmation evidence |
| Payment | Coordination-fee tracking, not hospital payment processing | case ID, fee/tier, invoice status, payment status, method/reference |
| Audit event | Immutable event history | actor, entity, action, before/after, timestamp, reason |

### 7.2 Essential controlled vocabularies

- Case stage and outcome reason.
- Document type.
- Consent purpose.
- Provider verification status.
- Listing publication status: `draft`, `review-needed`, `approved`, `published`, `stale`, `archived`.
- Quote taxonomy category.
- AI extraction/review status: `not-run`, `extracted`, `low-confidence`, `in-review`, `approved`, `corrected`, `rejected`.
- Data classification: `public`, `internal`, `confidential`, `restricted-health/identity`.

---

## 8. Verification, editorial, and service policy

### 8.1 Operational definition of “vetted” for pilot

“Vetted” must not be a vague marketing term. In the pilot, a provider/facility can be marked vetted only if the following are completed and recorded:

1. Verified legal/facility identity and current official contact channel.
2. Confirmed service/specialty scope relevant to the pilot.
3. Reviewed evidence for material credential/accreditation claims before those claims are displayed.
4. Confirmed international-patient coordination capability and named contact/process.
5. At least one current, source-traceable quote or service confirmation where cost/service information is shown.
6. Defined review cadence and automated stale-date policy.
7. Internal reviewer approval and conflict/compensation disclosure assessment.

This is a verification of operational and factual claims—not a blanket clinical-quality endorsement and not a promise that a provider is suitable for every patient.

### 8.2 Public verification labels

Use plain-language labels that communicate scope and recency:

- **Verified profile:** identity, service scope, and relevant supporting evidence reviewed as of a displayed date.
- **Quote information reviewed:** a recent source quote has been normalized; amounts are examples/estimates unless a patient-specific written quote is issued.
- **Information needs refresh:** listing remains visible only if policy allows; cost/availability actions disabled or prominent refresh warning shown.
- **Not currently accepting inquiries:** hidden from comparison/inquiry routes if verification or operational capability has expired.

### 8.3 Content governance

- Editorial content must have author, clinical/legal reviewer where appropriate, source list, review date, and next review date.
- Any medical statement must be educational and sourced; it cannot become individualized advice through personalization.
- Marketing claims must pass legal/claims review before public release.
- Paid relationship, referral fee, hospital commission, or other material financial interest must be disclosed according to final legal and business policy.

### 8.4 Service-level commitment design

The patient-paid model must translate into a concrete, contractually reviewable service proposition. Pilot examples:

- Named case owner after conversion to an active coordination case.
- Published intake acknowledgement target.
- Defined cadence for patient updates.
- Defined quote/consultation request process and visible pending items.
- Written service scope, exclusions, escalation path, cancellation/refund policy, and liability boundaries.

Do not make clinical outcome guarantees.

---

## 9. Privacy, security, safety, and compliance-by-design

### 9.1 Product requirements

- Role-based access control with least-privilege roles: administrator, coordinator, reviewer, content publisher, finance, patient, attendant, referral partner.
- Separate public database/API from internal sensitive-data store.
- Encryption in transit and at rest; secrets managed outside application code.
- MFA for internal privileged roles; secure invitation/authentication for patient portal.
- Immutable audit events for access, extraction, edits, approvals, publication, download, and deletion/retention actions.
- Purpose-specific consent capture before collection/use/share of medical records, marketing communications, referral updates, and document sharing.
- Consent withdrawal workflow that is as usable as consent capture, subject to legitimate retention/legal needs determined by counsel.
- Data minimization, retention schedule, deletion/anonymization workflow, and access/correction request workflow.
- Vendor inventory and data-processing review for OCR, LLM, storage, email, analytics, and communications providers.
- Prohibit raw patient data from public analytics, error monitoring, prompt logs, or developer test fixtures unless properly de-identified and authorized.
- Red-team testing for prompt injection, unauthorized cross-case retrieval, PII leakage, access-control bypass, and unsafe medical-response prompts.
- Security incident logging and escalation process.

### 9.2 Legal/compliance workstream boundary

The interns should implement privacy- and audit-friendly architecture, but formal legal determination is outside their remit. Before handling real patient records at scale or making public claims, obtain qualified review covering, at minimum:

- India’s Digital Personal Data Protection Act and rules/implementation status.
- Applicable laws in patient source countries, including cross-border transfer and health-data requirements.
- Consumer protection, advertising, medical/health claims, referral/commission, and travel/visa communications requirements.
- Contractual roles and obligations among the platform, facilitators, providers/hospitals, and patients.
- Data-processing agreements and vendor/model terms.

The product must not assume that one generic consent checkbox authorizes all processing. Maintain purpose-specific notices and consent records.

### 9.3 Medical safety boundaries

- Persistent banner and routing for emergencies: contact local emergency services/qualified clinicians; the platform is not an emergency service.
- AI and human scripts must avoid interpreting test results, advising treatment, or advising medication.
- For clinical questions, provide a safe bridge: “This needs discussion with a licensed treating clinician. We can help coordinate a consultation and organize the questions/documents.”
- Any health content or provider comparison field that could be construed as a clinical endorsement requires designated review before publication.

---

## 10. Technology approach for a four-intern build

### 10.1 Recommended prototype stack

Use a conventional, modular web architecture to minimize infrastructure burden while allowing substantive AI engineering work.

| Layer | Recommendation | Rationale |
|---|---|---|
| Public/patient web UI | Next.js + TypeScript | Fast web delivery, SEO-friendly public content, shared component system |
| Internal operations UI | Next.js + TypeScript in protected routes | One codebase with strict role boundaries and faster delivery |
| Backend/API | Python FastAPI or TypeScript NestJS; select one based on strongest team skill | Typed APIs, background jobs, testability |
| Database | PostgreSQL with row-level security or application-enforced tenant/case access | Relational data, auditability, structured workflow model |
| Object storage | Private encrypted object storage with signed access URLs | Secure document handling |
| Background jobs | Celery/RQ/Temporal-lite or managed queue | OCR/extraction workflows and retryability |
| AI orchestration | Typed workflow layer (e.g., Pydantic schemas + LangGraph or equivalent) | Bounded agents, validations, traceability |
| LLM/OCR provider | Enterprise-appropriate API configuration; abstraction layer | Keep model/provider swappable and avoid hard-coded prompts |
| Observability | Structured logs, error monitoring with PII scrubbing, evaluation dashboard | Safe operations and AI quality measurement |
| Authentication | Managed provider or robust standards-based auth; MFA for internal roles | Avoid building auth from scratch |
| Analytics | Privacy-conscious event tracking with no sensitive payloads | Funnel/product measurement |

### 10.2 Build-not-buy decisions

**Build during internship**

- Shared data model and review/publish workflow.
- Quote normalization model and interface.
- Evidence-linked extraction/review pipeline.
- Narrow provider/listing experience.
- Case/task timeline and controlled patient journey view.
- Evaluation harness and audit trail.

**Use managed services or defer**

- Authentication, email delivery, file storage, payment invoicing, OCR where appropriate, analytics, monitoring.
- Full CRM, comprehensive EHR integration, hospital integration, insurance eligibility, travel booking, visa submission, translation marketplace, and 24/7 contact center.

### 10.3 Architecture acceptance criteria

- No public API can query patient, case, raw document, or unapproved extraction tables.
- Every public listing request is served only from a published-content projection.
- Every AI output is linked to model/prompt version and source input IDs.
- Every authoritative field/published record has a human reviewer and approval timestamp.
- Role tests demonstrate one patient/coordinator cannot access another case without authorization.
- Removing/withdrawing a listing or consent takes effect through controlled workflow and audit record.

---

## 11. Success metrics and pilot targets

### 11.1 North Star metric

**Percentage of active coordination cases with an on-time, coordinator-approved journey plan and no unresolved critical administrative gap at each stage.**

This aligns product value with accountable execution rather than raw traffic or lead volume.

### 11.2 Funnel metrics

| Area | Metric | Pilot target / decision use |
|---|---|---|
| Trust/discovery | Verified IVF listings live | Start with 5–10 thoroughly vetted listings, not volume for its own sake |
| Conversion | Visitor-to-qualified-inquiry rate | Establish baseline; optimize only after trust/content quality is sound |
| Conversion | Inquiry-to-paid-coordination conversion | Test willingness to pay for verified comparison + execution |
| Referral | Referrer-to-qualified-case conversion | Validate B2B2C hypothesis |
| Engagement | Completion rate for high-intent inquiry | Detect friction in the intake flow |

### 11.3 Operations metrics

| Area | Metric | Pilot target / decision use |
|---|---|---|
| Efficiency | Coordinator administrative hours per case | Measure baseline and aim for meaningful reduction without reduced quality |
| Intake | Median time from inquiry to human acknowledgement | Test service promise and staffing model |
| Quote workflow | Median time to create coordinator-approved normalized comparison | Primary AI-ops productivity measure |
| Document AI | Extraction accuracy and citation-grounding accuracy on held-out set | Gate AI release scope |
| Review | Median review/correction time per document | Determine whether automation truly saves time |
| Data quality | Percentage of public fields with current evidence and approval | Must remain 100% for active listings |
| Trust/safety | Unverified/stale public-data incidents | Target: 0 |
| Safety | AI policy violation or cross-case access incident | Target: 0 |
| Service | Missed critical task/milestone rate | Use task escalation and retrospective root cause analysis |

### 11.4 Qualitative research

For each pilot case/interview, capture:

- “What made you trust or distrust this platform?”
- “Which comparison field changed your decision or reduced uncertainty?”
- “Where did you still need human help?”
- “Would you pay for this coordination; if yes, which deliverable justified the fee?”
- “What did the platform fail to explain about cost, process, or recovery?”

---

## 12. Four-month delivery plan

### 12.1 Scope decision

**Recommendation:** Build Surface C (AI Operations & Trust Engine) first, in parallel with a minimal public shell. The public experience must remain narrow until it is fed by approved data. If time slips, cut public breadth, patient portal sophistication, referral portal, and chatbot features before cutting document provenance, review controls, quote normalization, audit logging, or listing freshness controls.

### 12.2 Team roles

| Intern | Primary responsibility | Secondary responsibility |
|---|---|---|
| Intern 1: Full-stack/product systems | Shared schema, APIs, auth/access control, public site shell | Deployment, analytics events |
| Intern 2: AI/document intelligence | OCR/extraction workflows, schemas, evaluation harness, provenance | Quote normalization logic |
| Intern 3: Operations workflow UX | Coordinator workspace, case/task/quote review UX, audit interactions | Patient journey workspace |
| Intern 4: Public experience/data QA | Listing/comparison UI, content workflow, freshness rules, test automation | Research/data seeding and dashboard |

A product owner and designated operations reviewer must be available weekly. Interns cannot independently determine clinical, legal, or public-claims policy.

### 12.3 Week-by-week plan

| Weeks | Outcome | Required deliverables |
|---|---|---|
| 1–2 | Scope, safety, and data foundation | Product backlog; user flows; controlled vocabularies; data classification; consent placeholders; pilot-provider criteria; evaluation-set plan; architecture decision record |
| 3–4 | Core platform skeleton | Auth/roles; PostgreSQL schema; document storage; case/lead creation; audit-event framework; public-site shell; design system |
| 5–6 | Document intelligence v1 | Upload/classification; OCR; extraction schemas; field-level evidence links; reviewer queue; initial gold dataset |
| 7–8 | Coordinator workflow v1 | Case timeline; task management; contacts; intake conversion; document review; time tracking; templates |
| 9–10 | Quote normalization and verification | Quote schema/taxonomy; comparison workspace; provider evidence checklist; listing draft/review/publish state; stale rules |
| 11–12 | Narrow public marketplace | IVF listing pages; comparison view; trust center; inquiry flow; public-content projection with strict separation |
| 13–14 | Secure patient workspace and integration | Journey tracker; task checklist; approved comparison; secure document status; coordinator communication draft workflow |
| 15 | Evaluation, security, and pilot rehearsal | AI benchmark results; regression tests; role/access tests; PII log review; publishing gate tests; operational dry run |
| 16 | Pilot launch and handoff | Small controlled pilot; backlog/risk register; architecture/docs; admin guide; evaluation report; next-phase roadmap |

### 12.4 Pilot exit criteria

Do not expose the pilot publicly beyond a controlled cohort unless all are true:

- At least a small set of provider listings meets the written vetted criteria.
- Public listings are served solely from approved published records.
- Stale/expired listing behavior is tested.
- Quote comparison has human approval and source traceability.
- Internal access controls and cross-case authorization tests pass.
- AI evaluation report is complete and release scope is documented.
- Consent, emergency boundary, privacy notice placeholders, and terms have stakeholder/legal review appropriate to pilot use.
- Operations owner can perform normal case tasks without developer assistance.

---

## 13. Risks and mitigations

| Risk | Why it matters | Product/operating mitigation |
|---|---|---|
| Generic listings-site drift | Patients see no reason to choose a paid service over free competitor lead-gen | Make verification date, evidence standard, quote comparison, named coordinator, service scope, and journey ownership visible in product and messaging |
| Team spreads too thin | Four interns may ship two incomplete products | Stage delivery around Trust Engine; cut breadth first; use one shared model/codebase; limit pilot specialty and providers |
| Unreviewed AI data reaches patients | Incorrect costs, credentials, or logistics undermine trust and create liability | Default-deny publication; human approval; evidence links; stale policy; separate public projection; automated tests |
| AI hallucination/poor extraction | Incorrect structured data creates operational errors | Typed schemas, citations, confidence thresholds, gold dataset, reviewer UI, regression tests, manual fallback |
| Clinical-practice boundary breach | Medical advice or implied recommendation creates patient safety/regulatory risk | Guardrails, scripts, escalation paths, no clinical agents, legal/clinical review workflow |
| Privacy/security failure | Medical records and identity documents are highly sensitive | Least privilege, encrypted storage, consent ledger, audit logs, PII-safe observability, security testing, vendor review |
| Cost comparison misleads | “Package” labels vary, excluded costs are material | Canonical taxonomy, quote validity/assumptions, unresolved-question flags, no lowest-price ranking |
| Provider information becomes stale | Public trust collapses if outdated facts persist | Evidence expiration, review queue, automatic stale state, hide/disable action policy |
| Paid model lacks perceived value | Patients may expect free facilitator service | Productize tangible deliverables: verified comparison, journey plan, named coordinator, document/quote clarity, continuity handoff |
| Referral partners lack confidence | B2B2C model depends on trust and clear handoff | Start with secure manual referral process, explicit consent, status transparency, outcome feedback loop |

---

## 14. Backlog prioritization

### P0: Must ship before pilot

- Shared data model and RBAC.
- Case/lead, contact, task, timeline, and time-entry workflow.
- Secure document store and classification.
- AI extraction with source citations/confidence plus human review.
- Quote raw-to-normalized workflow and patient-view approval gate.
- Provider evidence/verification workflow.
- Listing publication lifecycle and stale rules.
- Public IVF content/listings, trust center, and high-intent inquiry form.
- Audit log and basic security/privacy controls.
- AI evaluation harness and manual fallback process.

### P1: Ship if P0 is stable

- Secure patient journey workspace.
- Coordinator communications copilot.
- Automated review/freshness task generation.
- Referral intake form and attribution dashboard.
- Basic dashboard for operational/funnel metrics.

### P2: Later phase

- Multi-specialty expansion.
- Referral portal.
- Patient/attendant collaborative workspace.
- Approved-content retrieval assistant.
- Provider operational scorecards.
- Integrations with CRM, communications, payment/invoicing, travel partners, or hospital systems.
- Multi-language scale-up and country-specific compliance content.

---

## 15. Decisions required before development

Stakeholders must resolve these within the first two weeks:

1. What is the precise paid service package, fee range, refund/cancellation policy, and service-level commitment for the pilot?
2. Which geography/source patient segment is the initial target, and which languages must be supported at launch?
3. Which 5–10 fertility providers/facilities are eligible for initial vetting, and who has authority to approve them?
4. What evidence qualifies an accreditation, credential, outcome, price, or patient-support claim for publication?
5. What does “accountability” mean contractually and operationally when a provider, visa, flight, or patient decision changes?
6. Which data/LLM/OCR vendors are acceptable under privacy and contractual review?
7. Will the pilot use real patient records? If yes, what consent, legal review, security posture, and incident response are required before intake?
8. Who is the designated operational reviewer for quote normalization and public publication?
9. What timeline/freshness standard applies to provider profiles, costs, accreditations, and availability?
10. What are the launch and stop conditions for a controlled pilot?

---

## 16. Final recommendation

The platform should aspire to become the go-to starting point for treatment-related discovery and medical-journey coordination in India, but it earns that position through reliability rather than breadth. The first build should prove a narrower proposition:

> For a complex IVF journey to India, this platform makes the choices, costs, documents, logistics, and follow-through more understandable—and assigns a human team accountable for coordinating the non-clinical journey.

If the team proves that it can consistently convert raw evidence into accurate, reviewed comparison data and execute an organized patient journey with less coordinator effort, it will have created the reusable trust engine required to expand into orthopedics and eventually broader India medical-travel discovery. If it instead attempts to become a comprehensive portal in four months, it risks reproducing the weakest part of incumbent marketplaces: broad information with unclear verification and no visible accountability.
