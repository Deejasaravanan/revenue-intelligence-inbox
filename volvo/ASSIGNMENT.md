# Build a Revenue Intelligence Inbox

## Your challenge

A sales manager receives calls, meeting records, transcripts and automated notes from several systems. These records do not arrive neatly: some transcripts arrive late, some conversations serve more than one purpose, and stored labels do not always agree with what people actually said.

Build a clickable workspace that turns this incoming information into something a manager can use every day. Help them understand what happened, find what needs attention, and decide what to do next.

This is a paid exercise. The recruiter will specify the payment amount, payment timing and exact deadline before you start. You have **24 hours from the agreed start time to submit**. We expect **6–8 hours of work**. You may use ChatGPT, coding assistants, templates and other tools. There is no live interview or live coding component in this exercise. We will review your submitted product, source files and explanation.

## Start here

1. Read this brief and the data dictionary.
2. Open a few metadata records and conversations before choosing your categories or interface.
3. Decide which manager questions your first screen should answer.
4. Build the smallest complete experience that supports those questions and the import checks below.
5. Explain important decisions and limitations honestly.

The source records and conversations have been de-identified and adapted for this exercise. Do not attempt to identify the original people or publish the dataset publicly. You may use AI tools to complete the assignment and share the resulting product privately with the reviewers.

You do not need prior sales experience. The glossary and dictionary explain the business terms and source fields. There is no single correct page layout, folder tree or routing taxonomy.

## What you receive

The package contains 44 source records: 30 calls and 14 meetings. Eighteen have adapted real-derived conversation text: 10 calls and 8 meetings. Seventeen transcripts are present initially; the eighteenth arrives in the update batch. The other records intentionally have no usable supplied text. It also includes a data dictionary, glossary, update instructions and submission checklist. The extract is selected for variety, not a complete or representative sample of team performance. Use the pair (source_type, source_id) as record identity. See DATA_CONTRACT.md for the exact import rules. Names, record_ref and array positions are not identities. Follow the dictionary for the meaning of timestamps, statuses and relationships.

Treat source records as evidence to inspect. A stored summary or classification is a previous system's output; it is not necessarily the correct answer. A missing transcript does not establish that a conversation never happened. Use only relationships supported by the supplied data.

## Build one connected experience

### 1. A useful manager dashboard

Choose the metrics, conversation groups and exceptions that make this dataset useful to a manager. At minimum show selected-record activity by day and person, usable supplied transcript coverage, and your routing/review counts, with a working person or source-type filter. All supplied activity falls on one local date, so a date filter alone is not sufficient. Define each denominator. Distinguish call reps from meeting organisers; an organiser is not automatically the salesperson or an attendee. Make it possible to move from an overview into a person or conversation and inspect the supporting source records.

A good dashboard answers meaningful questions and makes definitions clear. For every headline number, a reviewer should be able to understand what was counted, over which period, and whether missing information affects the result. Use the dictionary's units. Do not invent pipeline value, deal outcomes or account links that the data does not establish.

You choose what deserves prominence, what belongs behind a click, and what does not help the manager.

### 2. Routing and appropriate analysis

Here, **routing** means deciding which kind of analysis a conversation needs and where its outputs belong.

Design your own categories and rules. A conversation may need one destination, several destinations, or a human decision. Explain the reason for each route and let the manager correct it.

Do not generate the same generic summary for every conversation. Depending on the evidence, useful outputs could include sales coaching, deal next steps, customer follow-up or an internal/vendor note. These are suggestions, not a required taxonomy.

Useful analysis should make clear:

- What happened and why it matters.
- Which statements support a conclusion, with an identifiable transcript passage.
- What the evidence does not establish.
- What someone should do next, and who owns it when ownership is actually stated.

Include a manager brief for 21 August 2026 (Asia/Kolkata). Bring together activity, important conversations, practical coaching and follow-up priorities. The brief may be fixed to this date and pre-generated; it need not react to dashboard filters. Review all 18 supplied conversations after applying the update, but keep the visible output concise. Every one of the 44 records needs an intake/review state; do not invent substantive analysis for missing or silent text. Let the manager inspect the evidence behind its recommendations.

### 3. An understandable folder and export structure

Decide how generated outputs should be organised so another person can find them later. Implement a downloadable archive or a local output folder. Include a machine-readable manifest in JSON or CSV.

At minimum, the manifest should identify the source record, assigned route or routes, output file path or paths, processing/review state, and whether a route was manually corrected. You may add useful fields.

Show how the structure avoids losing context when one conversation produces more than one output. Do not merely draw a proposed folder tree: produce the exported files.

### 4. Imports, late information and corrections

The product must support the replay steps below through a simple interface or a clearly documented local command. Choose either approach; reviewers must be able to reproduce it from your instructions.

| Step | Action | Expected behaviour |
|---|---|---|
| Initial import | Import the initial batch. | Each logical source record is represented once. Missing or unusable material is visible. |
| Repeat | Import that same batch again, optionally with records in a different order. | No duplicate source records or inflated activity counts. |
| Correction | Manually change a conversation's route in your product. | The correction is saved and visible. |
| Update | Import the supplied update batch. | Apply the newer information to the existing source record. A late transcript becomes available without adding a second conversation. |
| Preserve judgment | Inspect the corrected conversation after replay/update and browser refresh or application restart, as appropriate. | The manual route remains in effect unless the user explicitly resets it. New source information remains inspectable. |

Treat (source_type, source_id) as the record identity; names, record_ref and array positions are not identities. The dictionary describes the update format and revision ordering. Retain an understandable distinction between an automated suggestion and a manual decision.

Updated content does not have to trigger a paid AI service. Your product may mark the record as needing review and accept a human-assisted analysis update. Do not silently display an old analysis as if it reflects a new transcript.

## AI and implementation choices

You may prepare analyses with AI before running the application, run models inside it, use deterministic rules, or combine these approaches. **Pre-generated analysis is allowed.** If you use it, make clear which content is pre-generated, what the application actually computes, and how new content is handled.

A static set of screenshots is not sufficient: the interface, imports, corrections and exports must work. You may use any reasonable framework, a local application or a shareable hosted application.

We do not require authentication, live CRM integration, Google Drive/Discord integration, recording capture, production deployment or a paid AI account. Never include API keys or credentials in your submission. If an optional service is unavailable, provide a usable review path with the supplied data.

## What we want you to decide

Draw your own conclusions from the records. Decide which questions matter, how to group conversations, when to be uncertain, which recommendations deserve trust, and how the interface should feel.

We are looking for your taste and reasoning in the finished experience. Clear choices, useful omissions and well-handled exceptions are more valuable than a large number of charts or features. You may challenge a source label or decline to make a conclusion when evidence is insufficient. Explain why.

## Submit

1. **Working application:** a usable link or an application that runs locally with clear instructions.
2. **Editable source:** include the files needed to run and change it.
3. **Generated export:** actual organised output files and the JSON/CSV manifest.
4. **Five slides:**
   - The manager problem you chose to solve and your main findings.
   - Your interface choices and what you deliberately left out.
   - Your routing/folder design and one difficult case.
   - How you checked a key number and a key analytical conclusion.
   - Trade-offs, AI usage, known limitations and what you would improve next.
5. **Short README:** setup/run steps, how to reproduce the replay checks, where outputs are written, metric definitions (or a link to their explanation in the app), and whether analysis is pre-generated or generated at runtime. Include the approximate time you spent.

### Include these three things in your first submission

1. **A three-minute screen recording with your own spoken narration:** show one useful manager workflow, one difficult routing decision and the duplicate/update test. Demonstrate the running application: repeat an import without increasing the record count, then apply the update and show that a manual route correction survives. As you use the app, explain one metric, one routing decision and the duplicate/update test in your own words. Captions may support your narration, but they cannot replace it. Submit one continuous screen recording; polished video editing is not expected. We assess your reasoning, not your accent or audio quality.
2. **Your three most important findings:** for each, state what you noticed, link to the supporting source passage, and show exactly where it affected the product. Use a meeting record reference and turn number, or a call record reference and short exact quote. Name the relevant screen, rule or output so we can check it. Draw your own conclusions; repeating the brief is not a finding.
3. **One decision you deliberately rejected:** describe the alternative you considered, why you rejected it and the trade-off you accepted. Point to the resulting choice in your product.

Put the findings and rejected decision in your existing five slides or README; no additional deck or report is needed. Include the recording file or an accessible private link in the same reply as the application. These materials help us assess your decisions from the first submission; no live session is required.

You do not need to submit a prompt diary or every intermediate experiment. Include enough explanation for us to assess the decisions you made.

## How we assess the work

| Area | Points | What we look for |
|---|---:|---|
| Interface usefulness and design | 25 | Clear priorities, easy navigation, understandable states and useful detail views. |
| Routing and output organisation | 25 | Thoughtful categories, appropriate differentiated outputs, traceable destinations and working corrections. |
| Numbers and evidence | 25 | Correct calculations, source-backed conclusions, useful coaching and honest uncertainty. |
| Imports and updates | 15 | Repeatable behaviour, no duplicate counting, correct update handling and preserved overrides. |
| Decisions and explanation | 10 | Clear trade-offs, reproducible instructions and an accurate explanation of AI usage and limitations. |
| **Total** | **100** | |

The four numbered capabilities above are required. Within each, keep the implementation small. Additional charts, account matching, forecasts, search, live AI and integrations are optional. Stop after eight hours and disclose unfinished work.


## Practical boundaries

Submit a private link or ZIP by replying to the recruiter who sent the assignment. Default is individual work unless the invitation explicitly assigns a team. No live session is required. For team submissions identify each person’s contribution.

No CRM opportunity table, authoritative deal value, full account history or confirmed staff-role directory is supplied. You can report conversation-based opportunity signals and supported next steps. If you show pipeline currency totals or cross-person performance rankings, you must explain what evidence supports them; missing inputs cannot be replaced by guesses.

The two input files are test deliveries, not historical production exports. The later delivery deliberately stages one real-derived transcript so we can test update behaviour. The public replay contract is the complete required behavioural test.

Your submitted app should open in the final post-update state, or provide one clearly documented demo-load action that imports both batches. Also provide a reset or clean-start instruction so reviewers can reproduce the initial/update sequence.
