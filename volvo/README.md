# Revenue Intelligence Inbox — Documentation & Submission Defense

A static, browser-only revenue intelligence workspace for sales managers. Processes multi-channel interactions (calls, meetings, transcripts), provides actionable executive briefing with passage-level evidence citations, enforces deterministic identity deduplication and revision handling, preserves manual routing corrections across updates, and generates audit-ready export packages.

---

## 1. Quick Start & How to Run

1. **Zero Dependencies & Zero Setup:**
   The entire application runs directly in any modern browser (Chrome, Edge, Firefox, Safari) without any backend server, npm installation, or external API keys.
2. **Open the Application:**
   - Double-click [`index.html`](file:///c:/Users/Noodles/Desktop/volvo/index.html) or open it directly in your browser:
     ```
     c:/Users/Noodles/Desktop/volvo/index.html
     ```
   - Alternatively, serve with any local static HTTP server if desired:
     ```bash
     npx serve .
     # or python -m http.server 8000
     ```
3. **Default State:**
   The application opens by default in the **final post-update state** (both batches applied, 44 selected records, 18 usable transcripts, M07 at Revision 2).

---

## 2. Metric Definitions & Grounded Denominators

Every metric displayed in the dashboard and briefing displays an explicit denominator under the headline figure to avoid base-rate fallacies:

| Metric | Formula & Value | Upstream Telemetry vs Grounded Reality |
|---|---|---|
| **Selected Records** | **44** (`30 calls`, `14 meetings`) | Selected extract for 21 Aug 2026 (Asia/Kolkata), not an all-time team census. |
| **Transcript Coverage (Post-Update)** | **18 / 44** (`40.9%`) | Usable texts after Revision 2 arrives. Calls: `10 / 30` (33.3%); Meetings: `8 / 14` (57.1%). |
| **Transcript Coverage (Initial)** | **17 / 44** (`38.6%`) | Initial state before M07 update arrived (Calls: `10 / 30`, Meetings: `7 / 14`). |
| **Source-Reported Connection Rate** | **11 / 30** (`36.7%`) | Stored upstream classification (`is_connected=true`). Exactly 0 nulls across the 30 calls. |
| **Text-Verified Buyer Dialogues** | **8 / 10** (`80.0%`) | Two-way substantive conversations verified by transcript reading. Excludes **C02** (switchboard transfer) and **C04** (voicemail). Upstream stored label reported 9/10 (`is_conversation=true` on C02 challenged). |
| **Route Assignments** | **48 assignments / 44 records** | Reflects multi-destination routing: 4 records (C07, M03, M04, M06) serve two distinct business workflows. |

---

## 3. How to Reproduce the Contract Replay Checks

Navigate to the **Import & Replay (🔄)** tab in the application, or execute the interactive buttons sequentially:

| Step | Action | Expected Behaviour & Audit Assertion |
|---|---|---|
| **Step 1** | Click **Import initial batch** (`01_initial.json`) | `44` unique records loaded; `17` usable texts; M07 has `turns: []` and state `intake-no-text`. |
| **Step 2** | Click **Repeat import (shuffled)** | Ingestion ledger shows `0` new, `0` replaced, `44` ignored. Unique count remains strictly `44`. |
| **Step 3** | Click **Run Step 3: Change M07 route to deal-next-steps** | Sets M07's route to `["deal-next-steps"]`. Badge updates to `✏ manual override`, header displays `1 Manual Override`, and persists into `localStorage`. |
| **Step 4** | Click **Import update** (`02_update.json`) | M07 payload replaced with Revision 2 (27 turns). Usable texts increments to `18 / 44`. Review state transitions to `analysed-needs-review`. **Manual route override is preserved**. |
| **Step 5** | Click **Repeat initial after update** | Revision 1 arrives after Revision 2. M07 incoming rev 1 < existing rev 2, so it is ignored. Unique remains `44`, usable texts remains `18`. |
| **Step 6** | Refresh browser or click **Load Demo** | All state, audit history, and manual route overrides persist intact from `localStorage`. |

---

## 4. Where Generated Outputs Are Written

Outputs are generated both dynamically via the browser's in-memory ZIP engine and saved statically to disk in this repository:

1. **In-Browser ZIP Generation:**
   Clicking **Export ZIP** on the Inbox page dynamically compiles [`revenue_intelligence_export_2026-08-21.zip`](file:///c:/Users/Noodles/Desktop/volvo/revenue_intelligence_export_2026-08-21.zip) using JSZip.
2. **On-Disk Directory Structure:**
   The files are also available directly in the [`export/`](file:///c:/Users/Noodles/Desktop/volvo/export/) directory:
   - [`export/manifest.json`](file:///c:/Users/Noodles/Desktop/volvo/export/manifest.json): Machine-readable audit manifest (source identity, routes, output paths, review states, manual override flags).
   - [`export/daily/2026-08-21/manager-brief.md`](file:///c:/Users/Noodles/Desktop/volvo/export/daily/2026-08-21/manager-brief.md): Executive manager brief for 21 Aug 2026.
   - [`export/intake/intake-register.md`](file:///c:/Users/Noodles/Desktop/volvo/export/intake/intake-register.md): Complete ledger of all 26 unanalysed records with reasons.
   - [`export/routes/`](file:///c:/Users/Noodles/Desktop/volvo/export/routes/): 48 structured markdown files across the 7 functional route folders (`coaching/`, `deal-next-steps/`, `customer-followup/`, `partner-channel/`, `internal-vendor-note/`, `log-only/`).
   - [`export/records/`](file:///c:/Users/Noodles/Desktop/volvo/export/records/): 44 individual source bundles containing raw payload and transcript payload.

---

## 5. Three Most Important Analytical Findings

### Finding 1: Upstream Follow-Up Overstatement
- **Observation:** Stored CRM outcome `follow_up` was recorded for 4 calls (C03, C05, C07, C10). Transcript analysis reveals that only **2 of 4** (C03 and C07) actually had mutually agreed next contact.
  - In **C05**, the contact repeatedly claimed existing platforms (StoreHarbor) and asked for a presentation merely as an exit stall.
  - In **C10**, the contact explicitly declined a call: *"No. I said I will contact you if there is anything to discuss."*
- **Supporting Evidence:**
  - [C10 quote: `"No. I said I will contact you if there is anything to discuss."`](file:///c:/Users/Noodles/Desktop/volvo/index.html)
  - [C03 quote: `"I'll also try you on Monday."`](file:///c:/Users/Noodles/Desktop/volvo/index.html)
  - [C07 quote: `"could I call on Monday to see whether you'd like to discuss it further?"`](file:///c:/Users/Noodles/Desktop/volvo/index.html)
- **Product Impact:** Highlighted in the **Manager Brief** under *Upstream Stored Labels Challenged* and flagged in the Record Detail view for C05 and C10 so reps do not waste time chasing false leads.

### Finding 2: Imminent Retention Risk in Mandatory Card Migration (M04)
- **Observation:** SpendNest planned to shut down an existing customer's legacy card programme in "coming weeks". The rep pitched a replacement card, but mid-call the customer reiterated that their fundamental requirement is **credit**, not prepaid. Three eligibility questions regarding bank credit card integration remained unconfirmed.
- **Supporting Evidence:**
  - [M04 Turn 4: `"The plan is to close the old programme in the coming weeks"`](file:///c:/Users/Noodles/Desktop/volvo/index.html)
  - [M04 Turn 10: `"The replacement I described is still prepaid."`](file:///c:/Users/Noodles/Desktop/volvo/index.html)
  - [M04 Turn 11: `"moving from prepaid to credit is the main issue for us"`](file:///c:/Users/Noodles/Desktop/volvo/index.html)
  - [M04 Turn 23: `"I cannot confirm the existing-card eligibility on this call."`](file:///c:/Users/Noodles/Desktop/volvo/index.html)
- **Product Impact:** Ranked #3 on the **Manager Brief Attention List**, assigned dual routing to both `customer-followup` and `deal-next-steps`, and marked `analysed-needs-review`.

### Finding 3: Pipeline Contamination by Vendor Evaluation (M02)
- **Observation:** Calendar title `LedgerBridge discussion` mimics an inbound customer demo. However, transcript reading establishes that SpendNest is the buyer evaluating LedgerBridge for an e-invoicing API integration.
- **Supporting Evidence:**
  - [M02 Turn 1: `"whether LedgerBridge can give us compliant invoicing coverage"`](file:///c:/Users/Noodles/Desktop/volvo/index.html)
  - [M02 Turn 31: `"The basic setup begins at EUR 2,600"`](file:///c:/Users/Noodles/Desktop/volvo/index.html)
- **Product Impact:** Diverted away from sales pipeline into `internal-vendor-note`. Prevents artificial inflation of pipeline metrics and stops sales managers from forecasting supplier negotiations as revenue opportunities.

---

## 6. One Deliberately Rejected Decision

- **Rejected Decision:** We deliberately rejected building an automated **"Estimated Deal Value / Pipeline Revenue Forecast"** or attempting automated CRM account matching based on calendar title similarity (e.g. merging M04 and M13).
- **Rationale & Trade-off:**
  - The dataset provides no verified account directory, CRM opportunity master, or validated contract values. Any monetary amounts mentioned in speech (e.g. M03's INR 26,000 subscription vs INR 39,000 setup fee; M07's INR 18,200 reimbursement issue; M02's EUR 2,600 vendor cost) represent disparate financial contexts.
  - Inventing pipeline formulas or silently matching accounts based on keyword overlap gives a false illusion of precision that destroys managerial trust when tested against reality.
  - We accepted the trade-off of displaying strict conversation-level evidence without invented financial aggregations, explicitly noting unconfirmed linkages (such as M04 and M13) as inspectable hypotheses rather than confirmed facts.

---

## 7. AI Usage Disclosure & Engineering Boundaries

- **Pre-Generated Analysis:**
  The substantive qualitative analyses, coaching points, and passage citations for the 18 text-covered records were pre-generated with Claude and audited against source transcripts. Pre-generating qualitative summaries respects the 6–8 hour constraint and avoids exposing expensive runtime API keys in client-side code.
- **Dynamic Runtime Operations:**
  The web app dynamically executes:
  - Ingestion engine: (source_type, source_id) deduplication and revision comparison.
  - State management: `localStorage` persistence of manual overrides across updates and restarts.
  - Filtering & Search: dynamic multi-axis slicing across persons, source types, routes, and review states.
  - In-browser ZIP generation: dynamic assembly of `manifest.json`, markdown hierarchies, and source JSONs via JSZip.
- **Approximate Time Spent:** ~7.5 hours.
