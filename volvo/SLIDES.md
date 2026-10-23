# Revenue Intelligence Inbox — Five Slide Defense

---

## Slide 1: The Manager Problem & Main Findings
**Header:** Sorting Signal from Noise in Multi-Source Revenue Data

### 1. The Real Manager Problem
Sales managers do not suffer from a lack of data; they drown in ungrounded telemetry. Across 44 raw records, upstream systems claimed 11 connects, multiple 'follow-ups', and vague prospect interest. A manager needs to separate actionable buyer commitments from noisy CRM placeholders.

### 2. Finding 1: Overstated Follow-Up Telemetry
Stored outcome `follow_up` was assigned to C03, C05, C07, and C10. However, transcript inspection reveals only C03 (Kiran) and C07 (Dev) had mutually agreed next contact. In C05, the buyer asked for an email just to exit; in C10, the contact explicitly rejected a follow-up call: *"No. I said I will contact you if there is anything to discuss."* Telemetry alone would have wasted rep capacity.

### 3. Finding 2: Silent Friction in Card Migration (M04)
Existing customer M04 faces a mandatory card programme closure in 'coming weeks'. While SpendNest pitched a new prepaid card, the customer's core requirement is credit. Without addressing the credit eligibility checks owed, SpendNest faces imminent churn.

### 4. Finding 3: Upstream Misrepresentation of Vendor Conversations (M02)
M02 looks like an inbound pipeline meeting ('LedgerBridge discussion'), but the transcript proves SpendNest is evaluating LedgerBridge as a supplier for e-invoicing. Routing M02 to sales pipeline would corrupt pipeline velocity metrics.

---

## Slide 2: Interface Architecture & Deliberate Omissions
**Header:** Designing for Trust, Speed, and Strict Data Governance

### 1. Grounded Navigation with Deep Passage Links
Every claim in the Manager Brief directly links to the exact transcript passage (turn number or call quote). Clicking any link takes the manager directly to that passage with an animated highlight pulse, eliminating guesswork.

### 2. Explicit Denominators Everywhere
Every metric displays its denominator (e.g., '18 / 44 usable texts', '10 / 30 calls'). Percentages without denominators conceal small sample sizes and distorted base rates.

### 3. Call Reps vs Meeting Organisers Separated
Meeting organisers are often calendar bots or executive assistants, not sales reps or attendees. We strictly separate call reps (Arun, Leela, Meera, Kiran, Dev) from calendar organisers to prevent misleading quota comparisons.

### 4. Deliberately Omitted Features
We rejected hypothetical deal value formulas, speculative account linking, and automated sentiment scores. The dataset contains no authoritative opportunity table; guessing currency values would destroy managerial trust.

---

## Slide 3: Routing Taxonomy & Difficult Edge Cases
**Header:** Multi-Destination Routing without Context Loss

### 1. 7-Category Functional Taxonomy
We defined 7 actionable destinations: `coaching`, `deal-next-steps`, `customer-followup`, `partner-channel`, `internal-vendor-note`, `log-only`, and `intake-only`. Each route answers a specific operational team workflow.

### 2. Multi-Route Preservation
Conversations frequently serve more than one purpose. M03 requires both deal next steps (CFO review) and coaching (prepaid surprise). Instead of forcing single-choice silos, our model assigns both destinations while linking back to one authoritative source record.

### 3. The Difficult Case: C09 Referral with 'No-Name' Constraint
In C09, the contact provided a referral to a business head on LinkedIn, but stated explicitly: *"No, please don't use my name."* Standard CRM automation would have sent a templated email saying *"As discussed with [Contact]"*. Our system routes this to `deal-next-steps` with an urgent review flag to prevent relationship damage.

### 4. Persisted Manual Overrides
Managers can correct automated routes with one click. These decisions persist in `localStorage` across re-imports, batch updates, and browser restarts until explicitly reset.

---

## Slide 4: Number Verification & Analytical Rigor
**Header:** Audit Proofs and Safe Baseline Calculations

### 1. Transcript Coverage Audit
Overall coverage: `18 / 44 = 40.9%` (`17 / 44 = 38.6%` before update). Call coverage: `10 / 30 = 33.3%`. Meeting coverage: `8 / 14 = 57.1%` (`7 / 14` before update). All 26 unanalysed records are clearly isolated in the intake registry.

### 2. Stored Connection Rate vs Text-Verified Conversations
Upstream telemetry reported `11 / 30` calls connected (`36.7%`, 0 null). However, when reading the 10 text-covered calls, only 8 are real two-way buyer conversations. C02 was a switchboard transfer; C04 was a voicemail. We report both rates clearly without conflation.

### 3. Deterministic Deduplication Contract
Identity is strictly `(source_type, source_id)`. When `01_initial` is imported a second time (even shuffled), our ledger records exactly 0 new, 0 replaced, 44 ignored, verifying duplicate immunity.

### 4. Late Transcript State Transition (M07)
When `02_update` arrives with Revision 2 for M07, the record transitions from `intake-no-text` to `analysed-needs-review`. Usable texts increments from 17 to 18. Any manual route assigned before the update survives intact.

---

## Slide 5: Trade-offs, AI Disclosure & Future Roadmap
**Header:** Engineering Pragmatism and Production Readiness

### 1. Trade-offs Accepted
We chose a 100% static, client-side single page app (HTML/CSS/JS) with in-browser ZIP generation. This enables instant local evaluation, zero external API keys, and complete privacy compliance, while sacrificing server-side persistence across different devices.

### 2. AI Usage Disclosure
Analytical summaries, coaching notes, and passage extractions were pre-generated using Claude and verified against source transcripts. The application dynamically computes all metrics, filtering, revision merges, and live ZIP exports in pure client-side JavaScript.

### 3. Known Limitations
No live CRM webhook connector is implemented. Cross-meeting entity resolution (e.g. associating M04 and M13 by company title) is reported as an unconfirmed hypothesis rather than an automated database join.

### 4. What We Would Improve Next
1. Direct bi-directional CRM write-backs for next steps.
2. Audio playback sync highlighting text in real time.
3. Configurable webhook alerts when time-sensitive commitments (like M07's 2-hour promise) are near breach.
