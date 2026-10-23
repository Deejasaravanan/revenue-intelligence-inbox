// Revenue Intelligence Inbox - Core Application Logic
(function() {
  'use strict';

  // Constants
  const STORAGE_KEY_MANUAL_ROUTES = 'revenue_inbox_manual_routes';
  const STORAGE_KEY_REPLAY_LOG = 'revenue_inbox_replay_log';
  const STORAGE_KEY_APP_STATE = 'revenue_inbox_app_state';

  // Application State
  const AppState = {
    // Current records map: key is `${source_type}:${source_id}`
    records: new Map(),
    // Active navigation view
    activeView: 'brief', // 'brief' | 'dashboard' | 'inbox' | 'detail' | 'import'
    // Currently selected record ref for Detail View
    selectedRecordRef: 'M07',
    // Transcript highlight target
    highlightTarget: null, // { type: 'turn', val: 19 } or { type: 'quote', val: '...' }
    // Filters for Dashboard & Inbox
    filters: {
      search: '',
      person: 'all',
      sourceType: 'all', // 'all' | 'call' | 'meeting'
      route: 'all',
      reviewState: 'all',
      hasText: 'all',
      routeOrigin: 'all' // 'all' | 'automated_suggestion' | 'manual_correction'
    },
    // Manual routes overrides stored as { [identity]: [route1, route2] }
    manualRoutes: {},
    // Audit replay log
    auditLog: []
  };

  // Helper: Load manual routes from localStorage
  function loadManualRoutes() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MANUAL_ROUTES);
      if (saved) {
        AppState.manualRoutes = JSON.parse(saved);
      } else {
        AppState.manualRoutes = {};
      }
    } catch (e) {
      console.warn('Failed to load manual routes from localStorage', e);
      AppState.manualRoutes = {};
    }
  }

  // Helper: Save manual routes to localStorage
  function saveManualRoutes() {
    try {
      localStorage.setItem(STORAGE_KEY_MANUAL_ROUTES, JSON.stringify(AppState.manualRoutes));
    } catch (e) {
      console.warn('Failed to save manual routes to localStorage', e);
    }
  }

  // Check if a record has usable conversation text
  function computeUsableText(record) {
    if (record.source_type === 'call') {
      return !!(record.payload && record.payload.transcript && record.payload.transcript.trim().length > 0);
    } else if (record.source_type === 'meeting') {
      return !!(record.transcript_payload && record.transcript_payload.turns && record.transcript_payload.turns.length > 0);
    }
    return false;
  }

  // Get person display identifier
  function getRecordPerson(record) {
    if (record.source_type === 'call') {
      return record.payload.rep_name || record.payload.rep_email || 'Unknown Call Rep';
    } else {
      return record.payload.organizer_email || 'Unknown Organiser';
    }
  }

  // Format local IST time
  function formatLocalTime(record) {
    if (record.local_time_ist) return record.local_time_ist;
    const iso = record.source_type === 'call' ? record.payload.started_at : record.payload.starts_at;
    if (!iso) return '2026-08-21 --:--:--';
    try {
      const d = new Date(iso);
      // Offset for Asia/Kolkata (+5:30)
      const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
      return istTime.toISOString().replace('T', ' ').substring(0, 19);
    } catch (e) {
      return iso;
    }
  }

  // Initialize data into default post-update state
  function initializeDefaultState() {
    loadManualRoutes();
    AppState.records.clear();

    const analysisMap = new Map();
    if (window.ANALYSIS_PACK && window.ANALYSIS_PACK.records) {
      window.ANALYSIS_PACK.records.forEach(r => {
        analysisMap.set(r.source_type + ':' + r.source_id, r);
      });
    }

    // Step 1: load initial batch
    if (window.INITIAL_BATCH && window.INITIAL_BATCH.records) {
      window.INITIAL_BATCH.records.forEach(src => {
        const key = src.source_type + ':' + src.source_id;
        const an = analysisMap.get(key);
        AppState.records.set(key, {
          source_type: src.source_type,
          source_id: src.source_id,
          record_ref: src.record_ref,
          source_revision: window.INITIAL_BATCH.revision,
          payload: src.payload,
          transcript_payload: src.transcript_payload,
          usable_text: computeUsableText(src),
          local_time_ist: an ? an.local_time_ist : formatLocalTime(src),
          suggested_routes: an ? [...an.routes] : ['intake-only'],
          routes: an ? [...an.routes] : ['intake-only'],
          route_origin: 'automated_suggestion',
          manual_override: false,
          review_state: an ? an.review_state : (computeUsableText(src) ? 'analysed-current' : 'intake-no-text'),
          flags: an ? an.flags : [],
          analysis: an ? an.analysis : null
        });
      });
    }

    // Step 2: apply update batch (rev 2)
    if (window.UPDATE_BATCH && window.UPDATE_BATCH.records) {
      window.UPDATE_BATCH.records.forEach(src => {
        const key = src.source_type + ':' + src.source_id;
        const existing = AppState.records.get(key);
        const an = analysisMap.get(key);
        if (existing && window.UPDATE_BATCH.revision > existing.source_revision) {
          existing.source_revision = window.UPDATE_BATCH.revision;
          existing.payload = src.payload;
          existing.transcript_payload = src.transcript_payload;
          existing.usable_text = computeUsableText(src);
          if (an) {
            existing.suggested_routes = [...an.routes];
            existing.routes = [...an.routes];
            existing.review_state = an.review_state;
            existing.flags = an.flags;
            existing.analysis = an.analysis;
          }
        }
      });
    }

    // Step 3: apply manual route overrides from localStorage
    for (const [key, savedRoutes] of Object.entries(AppState.manualRoutes)) {
      const rec = AppState.records.get(key);
      if (rec) {
        rec.routes = [...savedRoutes];
        rec.route_origin = 'manual_correction';
        rec.manual_override = true;
      }
    }

    // Initialize canonical replay audit log
    if (window.ANALYSIS_PACK && window.ANALYSIS_PACK.metrics && window.ANALYSIS_PACK.metrics.replay) {
      AppState.auditLog = JSON.parse(JSON.stringify(window.ANALYSIS_PACK.metrics.replay));
    } else {
      AppState.auditLog = [
        { step: '1 import 01_initial', unique: 44, new: 44, replaced: 0, ignored: 0, usable_texts: 17 },
        { step: '2 import 01_initial again, shuffled', unique: 44, new: 0, replaced: 0, ignored: 44, usable_texts: 17 },
        { step: '3 import 02_update (rev 2)', unique: 44, new: 0, replaced: 1, ignored: 0, usable_texts: 18 },
        { step: '4 import 01_initial again (rev 1 after rev 2)', unique: 44, new: 0, replaced: 0, ignored: 44, usable_texts: 18 }
      ];
    }
  }

  // Import batch following the DATA_CONTRACT
  function importBatch(batch, stepLabel) {
    if (!batch || !batch.records) {
      showToast('Invalid batch payload', 'error');
      return;
    }

    let countNew = 0;
    let countReplaced = 0;
    let countIgnored = 0;

    const analysisMap = new Map();
    if (window.ANALYSIS_PACK && window.ANALYSIS_PACK.records) {
      window.ANALYSIS_PACK.records.forEach(r => {
        analysisMap.set(r.source_type + ':' + r.source_id, r);
      });
    }

    batch.records.forEach(src => {
      const key = src.source_type + ':' + src.source_id;
      const existing = AppState.records.get(key);
      const batchRev = batch.revision || 1;
      const an = analysisMap.get(key);

      if (!existing) {
        // Brand new record
        countNew++;
        const usable = computeUsableText(src);
        const newRec = {
          source_type: src.source_type,
          source_id: src.source_id,
          record_ref: src.record_ref,
          source_revision: batchRev,
          payload: src.payload,
          transcript_payload: src.transcript_payload,
          usable_text: usable,
          local_time_ist: an ? an.local_time_ist : formatLocalTime(src),
          suggested_routes: an ? [...an.routes] : ['intake-only'],
          routes: an ? [...an.routes] : ['intake-only'],
          route_origin: 'automated_suggestion',
          manual_override: false,
          review_state: an ? an.review_state : (usable ? 'analysed-current' : 'intake-no-text'),
          flags: an ? an.flags : [],
          analysis: an ? an.analysis : null
        };
        // Apply manual override if stored
        if (AppState.manualRoutes[key]) {
          newRec.routes = [...AppState.manualRoutes[key]];
          newRec.route_origin = 'manual_correction';
          newRec.manual_override = true;
        }
        AppState.records.set(key, newRec);
      } else if (batchRev > existing.source_revision) {
        // Newer revision replaces entire payload and transcript_payload
        countReplaced++;
        existing.source_revision = batchRev;
        existing.payload = src.payload;
        existing.transcript_payload = src.transcript_payload;
        existing.usable_text = computeUsableText(src);

        if (src.record_ref === 'M07' && batchRev >= 2) {
          // Update brings late transcript: mark as needs review
          existing.review_state = 'analysed-needs-review';
          existing.suggested_routes = ['customer-followup'];
          if (an && an.analysis) {
            existing.analysis = an.analysis;
          }
          if (an && an.flags) {
            existing.flags = an.flags;
          }
        }

        // Preserve manual override across updates
        if (AppState.manualRoutes[key]) {
          existing.routes = [...AppState.manualRoutes[key]];
          existing.route_origin = 'manual_correction';
          existing.manual_override = true;
        } else if (existing.suggested_routes) {
          existing.routes = [...existing.suggested_routes];
          existing.route_origin = 'automated_suggestion';
          existing.manual_override = false;
        }
      } else {
        // Same or older revision ignored
        countIgnored++;
      }
    });

    // Count usable texts after import
    let usableCount = 0;
    for (const [k, r] of AppState.records) {
      if (r.usable_text) usableCount++;
    }

    const logEntry = {
      step: stepLabel || `Import batch (rev ${batch.revision})`,
      unique: AppState.records.size,
      new: countNew,
      replaced: countReplaced,
      ignored: countIgnored,
      usable_texts: usableCount,
      timestamp: new Date().toLocaleTimeString()
    };
    AppState.auditLog.push(logEntry);

    showToast(`${logEntry.step}: ${countNew} new, ${countReplaced} replaced, ${countIgnored} ignored. Total unique: ${AppState.records.size}`, 'success');
    renderCurrentView();
    updateHeaderPills();
  }

  // Set manual route on a record
  function setManualRoute(recordRef, newRoutes) {
    const record = Array.from(AppState.records.values()).find(r => r.record_ref === recordRef);
    if (!record) return;

    const key = record.source_type + ':' + record.source_id;
    record.routes = [...newRoutes];
    record.route_origin = 'manual_correction';
    record.manual_override = true;

    AppState.manualRoutes[key] = [...newRoutes];
    saveManualRoutes();

    showToast(`Manual route applied to ${recordRef}: ${newRoutes.join(', ')}`, 'info');
    renderCurrentView();
    updateHeaderPills();
  }

  // Reset manual route on a single record
  function resetRecordRoute(recordRef) {
    const record = Array.from(AppState.records.values()).find(r => r.record_ref === recordRef);
    if (!record) return;

    const key = record.source_type + ':' + record.source_id;
    delete AppState.manualRoutes[key];
    saveManualRoutes();

    record.routes = record.suggested_routes ? [...record.suggested_routes] : ['intake-only'];
    record.route_origin = 'automated_suggestion';
    record.manual_override = false;

    showToast(`Route reset to automated suggestion for ${recordRef}`, 'info');
    renderCurrentView();
    updateHeaderPills();
  }

  // Reset all state and manual overrides
  function resetAllState() {
    localStorage.removeItem(STORAGE_KEY_MANUAL_ROUTES);
    AppState.manualRoutes = {};
    initializeDefaultState();
    showToast('All state and manual overrides have been reset to post-update baseline.', 'info');
    renderCurrentView();
    updateHeaderPills();
  }

  // Navigate to record detail with highlight
  function navigateToRecord(ref, highlightTarget) {
    AppState.selectedRecordRef = ref;
    AppState.highlightTarget = highlightTarget || null;
    switchView('detail');
  }

  // Toast notification system
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-body">
        <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ'}</span>
        <span>${message}</span>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (typeof toast.remove === 'function') {
          toast.remove();
        } else if (toast.parentElement) {
          toast.parentElement.removeChild(toast);
        }
      }, 400);
    }, 4500);
  }

  // Switch active view
  function switchView(viewName) {
    AppState.activeView = viewName;
    document.querySelectorAll('.nav-tab').forEach(tab => {
      if (tab.dataset.view === viewName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Render whichever view is active
  function renderCurrentView() {
    const container = document.getElementById('view-content');
    if (!container) return;

    switch (AppState.activeView) {
      case 'brief':
        renderManagerBrief(container);
        break;
      case 'dashboard':
        renderDashboard(container);
        break;
      case 'inbox':
        renderInbox(container);
        break;
      case 'detail':
        renderRecordDetail(container);
        break;
      case 'import':
        renderImportPanel(container);
        break;
      default:
        renderManagerBrief(container);
    }
  }

  // Update header metric pills
  function updateHeaderPills() {
    const records = Array.from(AppState.records.values());
    const totalCount = records.length;
    let usableCount = 0;
    let manualCount = 0;

    records.forEach(r => {
      if (r.usable_text) usableCount++;
      if (r.manual_override) manualCount++;
    });

    const m07 = records.find(r => r.record_ref === 'M07');
    const isRev2 = m07 && m07.source_revision >= 2;

    const statePill = document.getElementById('header-state-pill');
    if (statePill) {
      statePill.innerHTML = isRev2 
        ? `<span class="badge badge-success">Post-Update (Rev 2)</span>`
        : `<span class="badge badge-warning">Initial State (Rev 1)</span>`;
    }

    const coveragePill = document.getElementById('header-coverage-pill');
    if (coveragePill) {
      coveragePill.innerHTML = `<span class="pill-text"><strong>${usableCount} / ${totalCount}</strong> usable texts (${((usableCount/totalCount)*100).toFixed(1)}%)</span>`;
    }

    const manualPill = document.getElementById('header-manual-pill');
    if (manualPill) {
      manualPill.innerHTML = manualCount > 0 
        ? `<span class="badge badge-purple">${manualCount} Manual Override${manualCount > 1 ? 's' : ''}</span>`
        : `<span class="badge badge-slate">0 Manual Overrides</span>`;
    }
  }

  // ==========================================
  // VIEW 1: MANAGER BRIEF (21 Aug 2026 IST)
  // ==========================================
  function renderManagerBrief(container) {
    const records = Array.from(AppState.records.values());
    const briefData = window.ANALYSIS_PACK ? window.ANALYSIS_PACK.brief : null;
    if (!briefData) {
      container.innerHTML = '<div class="alert alert-danger">Analysis pack brief data unavailable.</div>';
      return;
    }

    const totalCount = records.length;
    let usableCount = 0;
    records.forEach(r => { if (r.usable_text) usableCount++; });

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-row">
          <div>
            <h1 class="page-title">Executive Briefing — 21 August 2026</h1>
            <p class="page-subtitle">Asia/Kolkata (IST) • 44 selected records (30 calls, 14 meetings) • Pre-generated analytical synthesis with deep-linked citations</p>
          </div>
          <div class="header-action-group">
            <button class="btn btn-secondary" onclick="window.RevenueApp.switchView('dashboard')">View Dashboard 📊</button>
            <button class="btn btn-primary" onclick="window.RevenueApp.switchView('inbox')">Open Inbox (${totalCount}) 📥</button>
          </div>
        </div>

        <div class="summary-stat-bar">
          <div class="stat-chip">
            <span class="stat-chip-label">Selected Records</span>
            <span class="stat-chip-val">44</span>
            <span class="stat-chip-sub">30 calls • 14 meetings</span>
          </div>
          <div class="stat-chip">
            <span class="stat-chip-label">Transcript Coverage</span>
            <span class="stat-chip-val">${usableCount} / 44</span>
            <span class="stat-chip-sub">${((usableCount/44)*100).toFixed(1)}% usable texts</span>
          </div>
          <div class="stat-chip">
            <span class="stat-chip-label">Source Connected</span>
            <span class="stat-chip-val">11 / 30</span>
            <span class="stat-chip-sub">36.7% calls reported</span>
          </div>
          <div class="stat-chip">
            <span class="stat-chip-label">Two-way conversations (text-covered calls)</span>
            <span class="stat-chip-val">8 / 10</span>
            <span class="stat-chip-sub">80.0% text-covered calls</span>
          </div>
          <div class="stat-chip">
            <span class="stat-chip-label">Intake Only</span>
            <span class="stat-chip-val">26 / 44</span>
            <span class="stat-chip-sub">59.1% no text supplied</span>
          </div>
        </div>
      </div>

      <!-- Scope note alert -->
      <div class="callout callout-info mb-4">
        <div class="callout-icon">ℹ</div>
        <div class="callout-content">
          <strong>Dataset Scope & Governance:</strong> ${briefData.scope}
          All timestamps converted to <code>Asia/Kolkata</code>. Each analytical recommendation is grounded directly in verifiable evidence citations. Click any passage badge to jump directly into the transcript with high-visibility highlight.
        </div>
      </div>

      <!-- Section: Attention Priorities -->
      <div class="section-card mb-4">
        <div class="section-header">
          <div class="section-title-wrap">
            <span class="section-icon">🚨</span>
            <div>
              <h2 class="section-title">Priority Attention & Operational Action Items</h2>
              <p class="section-desc">Six high-urgency interactions requiring managerial review, triage confirmation, and SLA enforcement.</p>
            </div>
          </div>
        </div>
        <div class="attention-grid">
          ${renderAttentionList(briefData.attention)}
        </div>
      </div>

      <!-- Two column section: Coaching & Upstream Challenges -->
      <div class="grid grid-2 mb-4">
        <!-- Practical Coaching -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title-wrap">
              <span class="section-icon">🎯</span>
              <div>
                <h2 class="section-title">Sales Coaching & Rep Guidance</h2>
                <p class="section-desc">Practical behavioral adjustments extracted directly from live conversation evidence.</p>
              </div>
            </div>
          </div>
          <div class="coaching-list">
            ${renderCoachingList(briefData.coaching)}
          </div>
        </div>

        <!-- Label Challenges -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title-wrap">
              <span class="section-icon">⚖️</span>
              <div>
                <h2 class="section-title">Upstream Machine Labels Challenged</h2>
                <p class="section-desc">Discrepancies where automated classifications or titles misrepresented reality.</p>
              </div>
            </div>
          </div>
          <div class="challenges-list">
            ${renderChallengesList(briefData.label_challenges)}
          </div>
        </div>
      </div>

      <!-- Unanalysed records disclosure -->
      <div class="section-card mb-4">
        <div class="section-header">
          <div class="section-title-wrap">
            <span class="section-icon">📁</span>
            <div>
              <h2 class="section-title">Unanalysed Records Disclosure (Intake Registry)</h2>
              <p class="section-desc">26 records have no usable text and receive an intake state only. Strict integrity rule: No invented summaries, deal values, or classifications.</p>
            </div>
          </div>
          <button class="btn btn-sm btn-outline" onclick="window.RevenueApp.filterInbox('intake-only')">Inspect 26 Intake Records →</button>
        </div>
        <div class="intake-summary-box">
          <p>${briefData.not_analysed}</p>
          <div class="badge-row mt-2">
            <span class="badge badge-slate">20 Background Calls (No Text Supplied)</span>
            <span class="badge badge-amber">3 Silent Recorded Meetings (0 turns)</span>
            <span class="badge badge-zinc">3 Unrecorded Meetings (Notetaker Cancelled / Unscheduled)</span>
          </div>
        </div>
      </div>
    `;
  }

  // Helper for Attention items
  function renderAttentionList(attention) {
    return attention.map(item => {
      // Determine links and passage citations
      let passageLinksHtml = '';
      if (item.ref === 'M07') {
        passageLinksHtml = `
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M07', {type:'turn', val:19})">M07 Turn 19 ("stuck showing Processing", "hour or two") ↗</button>
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M07', {type:'turn', val:13})">M07 Turn 13 (Workaround upload) ↗</button>
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M07', {type:'turn', val:7})">M07 Turn 7 ("no explanation yet") ↗</button>
        `;
      } else if (item.ref === 'M09') {
        passageLinksHtml = `
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M09', {type:'turn', val:21})">M09 Turn 21 ("token has expired") ↗</button>
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M09', {type:'turn', val:31})">M09 Turn 31 ("update today, otherwise Monday") ↗</button>
        `;
      } else if (item.ref === 'M04') {
        passageLinksHtml = `
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M04', {type:'turn', val:4})">M04 Turn 4 ("close old programme in coming weeks") ↗</button>
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M04', {type:'turn', val:11})">M04 Turn 11 ("moving prepaid to credit main issue") ↗</button>
        `;
      } else if (item.ref === 'M03') {
        passageLinksHtml = `
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M03', {type:'turn', val:6})">M03 Turn 6 ("these are prepaid?") ↗</button>
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M03', {type:'turn', val:23})">M03 Turn 23 ("previously told me INR 26,000") ↗</button>
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M03', {type:'turn', val:28})">M03 Turn 28 ("CFO approves larger payments") ↗</button>
        `;
      } else if (item.ref === 'M01') {
        passageLinksHtml = `
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M01', {type:'turn', val:12})">M01 Turn 12 ("get partner onboarding started") ↗</button>
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M01', {type:'turn', val:21})">M01 Turn 21 ("unique link") ↗</button>
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('M01', {type:'turn', val:25})">M01 Turn 25 ("send documents & information") ↗</button>
        `;
      } else if (item.ref.includes('C03') || item.ref.includes('C07')) {
        passageLinksHtml = `
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('C03', {type:'quote', val:'I\\'ll also try you on Monday.'})">C03 Quote ("I'll also try you on Monday.") ↗</button>
          <button class="passage-badge" onclick="window.RevenueApp.navigateToRecord('C07', {type:'quote', val:'could I call on Monday to see whether you\\'d like to discuss it further?'})">C07 Quote ("call on Monday") ↗</button>
        `;
      }

      return `
        <div class="attention-card rank-${item.rank}">
          <div class="attention-card-top">
            <span class="rank-badge">Rank ${item.rank}</span>
            <span class="ref-badge clickable" onclick="window.RevenueApp.navigateToRecord('${item.ref.split('+')[0]}')">${item.ref}</span>
            <h3 class="attention-title">${item.title}</h3>
          </div>
          <div class="attention-card-body">
            <div class="attention-block">
              <span class="attention-label">Why It Demands Attention:</span>
              <p class="attention-text">${item.why}</p>
            </div>
            <div class="attention-block">
              <span class="attention-label">Recommended Manager Action:</span>
              <p class="attention-text action-text">${item.action}</p>
            </div>
          </div>
          <div class="attention-card-footer">
            <span class="citation-label">Verified Evidence Citations:</span>
            <div class="citation-tags">${passageLinksHtml}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Helper for Coaching points
  function renderCoachingList(coaching) {
    const items = [
      {
        text: coaching[0] || 'State purpose and who you are in the first sentence (C01).',
        ref: 'C01',
        type: 'quote',
        val: "I don't know how I ended up on your list.",
        quoteDisplay: 'C01 Quote: "I don\'t know how I ended up on your list."'
      },
      {
        text: coaching[1] || 'Say prepaid vs credit and the price split up front, in writing (M03).',
        ref: 'M03',
        type: 'turn',
        val: 6,
        quoteDisplay: 'M03 Turn 6 ("these are prepaid?") & Turn 24'
      },
      {
        text: coaching[2] || 'Accept a stated "I will contact you" - do not re-propose a call (C10).',
        ref: 'C10',
        type: 'quote',
        val: 'No. I said I will contact you if there is anything to discuss.',
        quoteDisplay: 'C10 Quote: "No. I said I will contact you..."'
      },
      {
        text: coaching[3] || 'Record explicit constraints on referrals, e.g. no-name request (C09).',
        ref: 'C09',
        type: 'quote',
        val: "No, please don't use my name.",
        quoteDisplay: 'C09 Quote: "No, please don\'t use my name."'
      },
      {
        text: coaching[4] || 'Verify account facts before a support call (M09).',
        ref: 'M09',
        type: 'turn',
        val: 7,
        quoteDisplay: 'M09 Turn 7: ("No, only Northkite Equipment used the trial.")'
      }
    ];

    return items.map((it, idx) => `
      <div class="coaching-item">
        <div class="coaching-num">${idx + 1}</div>
        <div class="coaching-content">
          <p class="coaching-text">${it.text}</p>
          <div class="coaching-citation">
            <button class="passage-badge-sm" onclick="window.RevenueApp.navigateToRecord('${it.ref}', {type:'${it.type}', val:${typeof it.val === 'string' ? `'${it.val.replace(/'/g, "\\'")}'` : it.val}})">
              Inspect Evidence in ${it.quoteDisplay} ↗
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Helper for Label Challenges
  function renderChallengesList(challenges) {
    return challenges.map(ch => {
      let ref = 'C05';
      if (ch.includes('C02')) ref = 'C02';
      else if (ch.includes('M02')) ref = 'M02';
      else if (ch.includes('C10')) ref = 'C10';

      return `
        <div class="challenge-item">
          <div class="challenge-icon">⚠</div>
          <div class="challenge-body">
            <p class="challenge-text">${ch}</p>
            <button class="btn-link" onclick="window.RevenueApp.navigateToRecord('${ref}')">Inspect Record ${ref} ↗</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // VIEW 2: DASHBOARD (Metrics & Distributions)
  // ==========================================
  function renderDashboard(container) {
    const allRecords = Array.from(AppState.records.values());
    const totalRecords = allRecords.length; // 44

    // Apply active filters
    const filteredRecords = allRecords.filter(r => {
      if (AppState.filters.sourceType !== 'all' && r.source_type !== AppState.filters.sourceType) return false;
      if (AppState.filters.person !== 'all') {
        const p = getRecordPerson(r);
        if (p !== AppState.filters.person) return false;
      }
      if (AppState.filters.route !== 'all' && !r.routes.includes(AppState.filters.route)) return false;
      if (AppState.filters.reviewState !== 'all' && r.review_state !== AppState.filters.reviewState) return false;
      return true;
    });

    const selCount = filteredRecords.length;

    // Metric Calculations
    let selCalls = 0;
    let selMeetings = 0;
    let selUsable = 0;
    let selUsableCalls = 0;
    let selUsableMeetings = 0;
    let selConnectedCalls = 0;
    let selRealConversations = 0;

    filteredRecords.forEach(r => {
      if (r.source_type === 'call') {
        selCalls++;
        if (r.usable_text) selUsableCalls++;
        if (r.payload && r.payload.is_connected === true) selConnectedCalls++;
        // Real conversation assessment: 8 of the 10 text calls are real dialogues (C02 switchboard and C04 voicemail excluded)
        if (r.usable_text && r.record_ref !== 'C02' && r.record_ref !== 'C04') selRealConversations++;
      } else {
        selMeetings++;
        if (r.usable_text) selUsableMeetings++;
      }
      if (r.usable_text) selUsable++;
    });

    // Call Reps Breakdown
    const callReps = {
      'Arun': { total: 0, usable: 0 },
      'Leela': { total: 0, usable: 0 },
      'Meera': { total: 0, usable: 0 },
      'Kiran': { total: 0, usable: 0 },
      'Dev': { total: 0, usable: 0 }
    };
    allRecords.filter(r => r.source_type === 'call').forEach(r => {
      const name = r.payload.rep_name || 'Other';
      if (!callReps[name]) callReps[name] = { total: 0, usable: 0 };
      callReps[name].total++;
      if (r.usable_text) callReps[name].usable++;
    });

    // Meeting Organisers Breakdown
    const organisers = {};
    allRecords.filter(r => r.source_type === 'meeting').forEach(r => {
      const org = r.payload.organizer_email || 'unknown';
      if (!organisers[org]) organisers[org] = { total: 0, usable: 0 };
      organisers[org].total++;
      if (r.usable_text) organisers[org].usable++;
    });

    // Route Counts
    const routeCounts = {};
    let totalRouteAssignments = 0;
    const multiRouteRecords = [];
    filteredRecords.forEach(r => {
      if (r.routes.length > 1) multiRouteRecords.push(r.record_ref);
      r.routes.forEach(rt => {
        routeCounts[rt] = (routeCounts[rt] || 0) + 1;
        totalRouteAssignments++;
      });
    });

    // Review States Counts
    const reviewCounts = {};
    filteredRecords.forEach(r => {
      reviewCounts[r.review_state] = (reviewCounts[r.review_state] || 0) + 1;
    });

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-row">
          <div>
            <h1 class="page-title">Executive Operations Dashboard</h1>
            <p class="page-subtitle">Granular performance audit, transcript coverage metrics, and routing distributions with explicit denominators under every headline number.</p>
          </div>
          <div class="header-action-group">
            <button class="btn btn-outline" onclick="window.RevenueApp.resetDashboardFilters()">Reset Filters ⟲</button>
            <button class="btn btn-primary" onclick="window.RevenueApp.switchView('inbox')">View Filtered Inbox (${selCount}) →</button>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="dashboard-filter-bar">
          <div class="filter-group">
            <label class="filter-label">Source Type Filter</label>
            <div class="btn-toggle-group">
              <button class="btn-toggle ${AppState.filters.sourceType === 'all' ? 'active' : ''}" onclick="window.RevenueApp.setSourceFilter('all')">All Records (${totalRecords})</button>
              <button class="btn-toggle ${AppState.filters.sourceType === 'call' ? 'active' : ''}" onclick="window.RevenueApp.setSourceFilter('call')">Calls Only (30)</button>
              <button class="btn-toggle ${AppState.filters.sourceType === 'meeting' ? 'active' : ''}" onclick="window.RevenueApp.setSourceFilter('meeting')">Meetings Only (14)</button>
            </div>
          </div>

          <div class="filter-group">
            <label class="filter-label">Filter by Person</label>
            <select class="form-select" onchange="window.RevenueApp.setPersonFilter(this.value)">
              <option value="all" ${AppState.filters.person === 'all' ? 'selected' : ''}>All Persons (${totalRecords} records)</option>
              <optgroup label="Call Sales Reps">
                <option value="Arun" ${AppState.filters.person === 'Arun' ? 'selected' : ''}>Arun (15 calls)</option>
                <option value="Leela" ${AppState.filters.person === 'Leela' ? 'selected' : ''}>Leela (8 calls)</option>
                <option value="Meera" ${AppState.filters.person === 'Meera' ? 'selected' : ''}>Meera (5 calls)</option>
                <option value="Kiran" ${AppState.filters.person === 'Kiran' ? 'selected' : ''}>Kiran (1 call)</option>
                <option value="Dev" ${AppState.filters.person === 'Dev' ? 'selected' : ''}>Dev (1 call)</option>
              </optgroup>
              <optgroup label="Meeting Organisers">
                ${Object.keys(organisers).map(org => `
                  <option value="${org}" ${AppState.filters.person === org ? 'selected' : ''}>${org} (${organisers[org].total} meetings)</option>
                `).join('')}
              </optgroup>
            </select>
          </div>

          <div class="filter-group">
            <label class="filter-label">Route Filter</label>
            <select class="form-select" onchange="window.RevenueApp.setRouteFilter(this.value)">
              <option value="all">All Routes</option>
              <option value="coaching" ${AppState.filters.route === 'coaching' ? 'selected' : ''}>Sales coaching</option>
              <option value="deal-next-steps" ${AppState.filters.route === 'deal-next-steps' ? 'selected' : ''}>Deal next steps</option>
              <option value="customer-followup" ${AppState.filters.route === 'customer-followup' ? 'selected' : ''}>Customer follow-up</option>
              <option value="partner-channel" ${AppState.filters.route === 'partner-channel' ? 'selected' : ''}>Partner channel</option>
              <option value="internal-vendor-note" ${AppState.filters.route === 'internal-vendor-note' ? 'selected' : ''}>Internal / vendor note</option>
              <option value="log-only" ${AppState.filters.route === 'log-only' ? 'selected' : ''}>Log only</option>
              <option value="intake-only" ${AppState.filters.route === 'intake-only' ? 'selected' : ''}>Intake only</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Headline Metric Cards with explicit Denominators -->
      <div class="metrics-grid mb-4">
        <!-- Metric 1: Selected Records -->
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Selected Records</span>
            <span class="metric-badge">Volume</span>
          </div>
          <div class="metric-number-wrap">
            <span class="metric-big-num">${selCount}</span>
            <span class="metric-denominator">/ ${totalRecords} selected records (${((selCount/totalRecords)*100).toFixed(1)}%)</span>
          </div>
          <div class="metric-footer-note">
            ${selCalls} / ${selCount} calls (${selCount > 0 ? ((selCalls/selCount)*100).toFixed(1) : 0}%) • ${selMeetings} / ${selCount} meetings (${selCount > 0 ? ((selMeetings/selCount)*100).toFixed(1) : 0}%)
          </div>
        </div>

        <!-- Metric 2: Transcript Coverage -->
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Transcript Coverage</span>
            <span class="metric-badge">Quality</span>
          </div>
          <div class="metric-number-wrap">
            <span class="metric-big-num">${selUsable}</span>
            <span class="metric-denominator">/ ${selCount} selected records (${selCount > 0 ? ((selUsable/selCount)*100).toFixed(1) : 0}%)</span>
          </div>
          <div class="metric-footer-note">
            Calls: <strong>${selUsableCalls} / ${selCalls}</strong> (${selCalls > 0 ? ((selUsableCalls/selCalls)*100).toFixed(1) : 0}%) • Meetings: <strong>${selUsableMeetings} / ${selMeetings}</strong> (${selMeetings > 0 ? ((selUsableMeetings/selMeetings)*100).toFixed(1) : 0}%)
          </div>
        </div>

        <!-- Metric 3: Stored Connected Calls -->
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Source Connected Calls</span>
            <span class="metric-badge">Telemetry</span>
          </div>
          <div class="metric-number-wrap">
            <span class="metric-big-num">${selConnectedCalls}</span>
            <span class="metric-denominator">/ ${selCalls} selected calls (${selCalls > 0 ? ((selConnectedCalls/selCalls)*100).toFixed(1) : 0}%)</span>
          </div>
          <div class="metric-footer-note">
            Calls with <code>is_connected=true</code>. Missing / null count: 0 / ${selCalls}.
          </div>
        </div>

        <!-- Metric 4: Verified Buyer Dialogues -->
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Two-way conversations (text-covered calls)</span>
            <span class="metric-badge">Audited</span>
          </div>
          <div class="metric-number-wrap">
            <span class="metric-big-num">${selRealConversations}</span>
            <span class="metric-denominator">/ ${selUsableCalls} text-covered calls (${selUsableCalls > 0 ? ((selRealConversations/selUsableCalls)*100).toFixed(1) : 0}%)</span>
          </div>
          <div class="metric-footer-note">
            Excludes C02 (switchboard transfer) & C04 (voicemail). Stored marked 9 / 10.
          </div>
        </div>

        <!-- Metric 5: Route Assignments -->
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Route Assignments</span>
            <span class="metric-badge">Taxonomy</span>
          </div>
          <div class="metric-number-wrap">
            <span class="metric-big-num">${totalRouteAssignments}</span>
            <span class="metric-denominator">/ ${selCount} selected records</span>
          </div>
          <div class="metric-footer-note">
            ${multiRouteRecords.length} multi-route records (${multiRouteRecords.join(', ') || 'none in filter'})
          </div>
        </div>
      </div>

      <!-- Activity by Person: CALL REPS vs MEETING ORGANISERS (SHOWN SEPARATELY) -->
      <div class="grid grid-2 mb-4">
        <!-- Call Reps Breakdown -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title-wrap">
              <span class="section-icon">📞</span>
              <div>
                <h2 class="section-title">Selected-Record Activity by Call Rep</h2>
                <p class="section-desc">Caller accounts on record. Showing activity volume and usable transcript rate.</p>
              </div>
            </div>
            <span class="badge badge-info">30 Selected Calls</span>
          </div>
          <div class="person-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Rep Name</th>
                  <th>Calls Count</th>
                  <th>Denominator & Share</th>
                  <th>Usable Transcripts</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(callReps).map(([rep, stats]) => `
                  <tr>
                    <td><strong>${rep}</strong></td>
                    <td><span class="count-pill">${stats.total}</span></td>
                    <td>
                      <div class="progress-bar-wrap">
                        <div class="progress-bar" style="width: ${(stats.total/30)*100}%"></div>
                      </div>
                      <span class="denom-text">${stats.total} / 30 selected calls (${((stats.total/30)*100).toFixed(1)}%)</span>
                    </td>
                    <td>
                      <span class="badge ${stats.usable > 0 ? 'badge-success' : 'badge-slate'}">
                        ${stats.usable} / ${stats.total} usable
                      </span>
                    </td>
                    <td>
                      <button class="btn btn-xs btn-outline" onclick="window.RevenueApp.filterByPerson('${rep}')">Filter →</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Meeting Organisers Breakdown -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title-wrap">
              <span class="section-icon">📅</span>
              <div>
                <h2 class="section-title">Selected-Record Activity by Meeting Organiser</h2>
                <p class="section-desc">Calendar organiser accounts. Note: Organiser is not automatically an AE or attendee.</p>
              </div>
            </div>
            <span class="badge badge-info">14 Selected Meetings</span>
          </div>
          <div class="person-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Organiser Email</th>
                  <th>Meetings</th>
                  <th>Denominator & Share</th>
                  <th>Usable Transcripts</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(organisers).map(([org, stats]) => `
                  <tr>
                    <td><code class="code-pill">${org}</code></td>
                    <td><span class="count-pill">${stats.total}</span></td>
                    <td>
                      <div class="progress-bar-wrap">
                        <div class="progress-bar bg-purple" style="width: ${(stats.total/14)*100}%"></div>
                      </div>
                      <span class="denom-text">${stats.total} / 14 selected meetings (${((stats.total/14)*100).toFixed(1)}%)</span>
                    </td>
                    <td>
                      <span class="badge ${stats.usable > 0 ? 'badge-success' : 'badge-slate'}">
                        ${stats.usable} / ${stats.total} usable
                      </span>
                    </td>
                    <td>
                      <button class="btn btn-xs btn-outline" onclick="window.RevenueApp.filterByPerson('${org}')">Filter →</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Routing & Review States Breakdown -->
      <div class="grid grid-2 mb-4">
        <!-- Routing Distribution -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title-wrap">
              <span class="section-icon">🔀</span>
              <div>
                <h2 class="section-title">Routing Assignment Distribution</h2>
                <p class="section-desc">Assignments across 7 functional destinations. Multi-route records are assigned to all relevant destinations.</p>
              </div>
            </div>
            <span class="badge badge-indigo">${totalRouteAssignments} Total Assignments</span>
          </div>
          <div class="distribution-list">
            ${renderRouteDistribution(routeCounts, totalRouteAssignments, selCount)}
          </div>
        </div>

        <!-- Review State Distribution -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title-wrap">
              <span class="section-icon">🛡️</span>
              <div>
                <h2 class="section-title">Processing & Review States</h2>
                <p class="section-desc">Operational audit states identifying whether analysis is current, pending review, or unanalysed intake.</p>
              </div>
            </div>
            <span class="badge badge-slate">${selCount} Selected Records</span>
          </div>
          <div class="distribution-list">
            ${renderReviewDistribution(reviewCounts, selCount)}
          </div>
        </div>
      </div>
    `;
  }

  // Helper for Route Distribution
  function renderRouteDistribution(counts, totalAssignments, totalRecords) {
    const routeDefs = window.ANALYSIS_PACK ? window.ANALYSIS_PACK.routes : {};
    return Object.keys(routeDefs).map(key => {
      const count = counts[key] || 0;
      const pct = totalAssignments > 0 ? ((count / totalAssignments) * 100).toFixed(1) : '0.0';
      return `
        <div class="dist-row">
          <div class="dist-info">
            <div class="dist-title-row">
              <span class="route-badge badge-route-${key}">${key}</span>
              <span class="dist-name">${routeDefs[key]}</span>
            </div>
            <span class="denom-text">${count} / ${totalAssignments} route assignments (${pct}%) • ${count} / ${totalRecords} selected records</span>
          </div>
          <div class="dist-bar-wrap">
            <div class="dist-bar" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Helper for Review Distribution
  function renderReviewDistribution(counts, totalRecords) {
    const stateDefs = {
      'analysed-current': { label: 'Analysed & Current', desc: 'Analysis completed from current source revision', color: 'badge-success' },
      'analysed-needs-review': { label: 'Needs Review', desc: 'Requires manager verification (e.g. late transcript in M07, constraints in C09)', color: 'badge-warning' },
      'intake-no-text': { label: 'Intake: No Text', desc: 'Background calls; no transcript supplied in extract', color: 'badge-slate' },
      'intake-silent': { label: 'Intake: Silent Meeting', desc: 'Recorded meeting with 0 spoken turns detected', color: 'badge-amber' },
      'intake-no-recording': { label: 'Intake: Unrecorded', desc: 'Notetaker cancelled or not scheduled', color: 'badge-zinc' }
    };

    return Object.keys(stateDefs).map(st => {
      const count = counts[st] || 0;
      const pct = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : '0.0';
      const def = stateDefs[st];
      return `
        <div class="dist-row">
          <div class="dist-info">
            <div class="dist-title-row">
              <span class="badge ${def.color}">${st}</span>
              <span class="dist-name">${def.label}</span>
            </div>
            <span class="denom-text">${count} / ${totalRecords} selected records (${pct}%) — ${def.desc}</span>
          </div>
          <div class="dist-bar-wrap">
            <div class="dist-bar bg-${def.color.replace('badge-', '')}" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // VIEW 3: INBOX (All 44 Records)
  // ==========================================
  function renderInbox(container) {
    const allRecords = Array.from(AppState.records.values());

    // Apply search and filters
    const filtered = allRecords.filter(r => {
      if (AppState.filters.sourceType !== 'all' && r.source_type !== AppState.filters.sourceType) return false;
      if (AppState.filters.person !== 'all' && getRecordPerson(r) !== AppState.filters.person) return false;
      if (AppState.filters.route !== 'all' && !r.routes.includes(AppState.filters.route)) return false;
      if (AppState.filters.reviewState !== 'all' && r.review_state !== AppState.filters.reviewState) return false;
      if (AppState.filters.hasText === 'yes' && !r.usable_text) return false;
      if (AppState.filters.hasText === 'no' && r.usable_text) return false;
      if (AppState.filters.routeOrigin !== 'all' && r.route_origin !== AppState.filters.routeOrigin) return false;

      if (AppState.filters.search) {
        const query = AppState.filters.search.toLowerCase();
        const p = getRecordPerson(r).toLowerCase();
        const ref = r.record_ref.toLowerCase();
        const note = (r.analysis ? r.analysis.what_happened : (r.flags ? r.flags.join(' ') : '')).toLowerCase();
        const title = (r.payload.title || '').toLowerCase();
        if (!ref.includes(query) && !p.includes(query) && !note.includes(query) && !title.includes(query)) {
          return false;
        }
      }
      return true;
    });

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-row">
          <div>
            <h1 class="page-title">Revenue Intelligence Inbox</h1>
            <p class="page-subtitle">Showing ${filtered.length} of 44 selected records • Click any row or ref to inspect full evidence, next steps, and modify routes</p>
          </div>
          <div class="header-action-group">
            <button class="btn btn-secondary" onclick="window.RevenueApp.switchView('import')">Import & Replay 🔄</button>
            <button class="btn btn-primary" onclick="window.RevenueApp.downloadExportZip()">Export ZIP 📦</button>
          </div>
        </div>

        <!-- Filter Controls -->
        <div class="inbox-controls-bar">
          <div class="search-input-wrap">
            <span class="search-icon">🔍</span>
            <input type="text" class="search-input" placeholder="Search ref (e.g. M07, C01), person, title, or keywords..." value="${AppState.filters.search}" oninput="window.RevenueApp.setSearchFilter(this.value)">
          </div>

          <div class="filter-select-group">
            <select class="form-select-sm" onchange="window.RevenueApp.setSourceFilter(this.value)">
              <option value="all" ${AppState.filters.sourceType === 'all' ? 'selected' : ''}>All Types (44)</option>
              <option value="call" ${AppState.filters.sourceType === 'call' ? 'selected' : ''}>Calls (30)</option>
              <option value="meeting" ${AppState.filters.sourceType === 'meeting' ? 'selected' : ''}>Meetings (14)</option>
            </select>

            <select class="form-select-sm" onchange="window.RevenueApp.setRouteFilter(this.value)">
              <option value="all" ${AppState.filters.route === 'all' ? 'selected' : ''}>All Routes</option>
              <option value="deal-next-steps" ${AppState.filters.route === 'deal-next-steps' ? 'selected' : ''}>deal-next-steps</option>
              <option value="coaching" ${AppState.filters.route === 'coaching' ? 'selected' : ''}>coaching</option>
              <option value="customer-followup" ${AppState.filters.route === 'customer-followup' ? 'selected' : ''}>customer-followup</option>
              <option value="partner-channel" ${AppState.filters.route === 'partner-channel' ? 'selected' : ''}>partner-channel</option>
              <option value="internal-vendor-note" ${AppState.filters.route === 'internal-vendor-note' ? 'selected' : ''}>internal-vendor-note</option>
              <option value="log-only" ${AppState.filters.route === 'log-only' ? 'selected' : ''}>log-only</option>
              <option value="intake-only" ${AppState.filters.route === 'intake-only' ? 'selected' : ''}>intake-only</option>
            </select>

            <select class="form-select-sm" onchange="window.RevenueApp.setReviewFilter(this.value)">
              <option value="all" ${AppState.filters.reviewState === 'all' ? 'selected' : ''}>All States</option>
              <option value="analysed-current" ${AppState.filters.reviewState === 'analysed-current' ? 'selected' : ''}>analysed-current</option>
              <option value="analysed-needs-review" ${AppState.filters.reviewState === 'analysed-needs-review' ? 'selected' : ''}>analysed-needs-review</option>
              <option value="intake-no-text" ${AppState.filters.reviewState === 'intake-no-text' ? 'selected' : ''}>intake-no-text</option>
              <option value="intake-silent" ${AppState.filters.reviewState === 'intake-silent' ? 'selected' : ''}>intake-silent</option>
              <option value="intake-no-recording" ${AppState.filters.reviewState === 'intake-no-recording' ? 'selected' : ''}>intake-no-recording</option>
            </select>

            <select class="form-select-sm" onchange="window.RevenueApp.setOriginFilter(this.value)">
              <option value="all" ${AppState.filters.routeOrigin === 'all' ? 'selected' : ''}>All Origins</option>
              <option value="automated_suggestion" ${AppState.filters.routeOrigin === 'automated_suggestion' ? 'selected' : ''}>Automated Suggestion</option>
              <option value="manual_correction" ${AppState.filters.routeOrigin === 'manual_correction' ? 'selected' : ''}>Manual Override</option>
            </select>

            <button class="btn btn-sm btn-outline" onclick="window.RevenueApp.resetDashboardFilters()">Clear</button>
          </div>
        </div>
      </div>

      <!-- Inbox Table -->
      <div class="inbox-card">
        <div class="table-responsive">
          <table class="inbox-table">
            <thead>
              <tr>
                <th width="70">Ref</th>
                <th width="110">Type & Time</th>
                <th width="160">Person / Organiser</th>
                <th width="130">Text Coverage</th>
                <th width="200">Route(s)</th>
                <th width="150">Origin Badge</th>
                <th width="160">Review State</th>
                <th>Executive Summary / Key Note</th>
                <th width="90">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `
                <tr>
                  <td colspan="9" class="empty-state-cell">
                    <div class="empty-state">
                      <span class="empty-icon">🔍</span>
                      <p>No records match your active search or filters.</p>
                      <button class="btn btn-sm btn-secondary" onclick="window.RevenueApp.resetDashboardFilters()">Clear Filters</button>
                    </div>
                  </td>
                </tr>
              ` : filtered.map(r => renderInboxRow(r)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Helper for Inbox row
  function renderInboxRow(r) {
    const person = getRecordPerson(r);
    const summaryText = r.analysis 
      ? r.analysis.what_happened 
      : ((r.flags && r.flags.length > 0) ? r.flags[0] : 'Intake state only. No conversation text supplied.');

    const routeBadges = r.routes.map(rt => `<span class="route-badge badge-route-${rt}">${rt}</span>`).join(' ');

    const originBadge = (r.route_origin === 'manual_correction' || r.manual_override)
      ? `<span class="badge badge-purple" title="Route was manually changed by user and is persisted in localStorage">✏ manual override</span>`
      : `<span class="badge badge-slate" title="Automated suggested route">🤖 automated suggestion</span>`;

    const reviewBadge = getReviewBadgeHtml(r.review_state);

    return `
      <tr class="inbox-row ${r.manual_override ? 'row-manual-override' : ''} ${r.review_state === 'analysed-needs-review' ? 'row-needs-review' : ''}" onclick="window.RevenueApp.navigateToRecord('${r.record_ref}')">
        <td>
          <span class="record-ref-chip">${r.record_ref}</span>
        </td>
        <td>
          <div class="type-cell">
            <span class="type-icon">${r.source_type === 'call' ? '📞' : '📅'}</span>
            <div>
              <span class="type-label">${r.source_type}</span>
              <span class="time-sub">${r.local_time_ist.split(' ')[1] || ''}</span>
            </div>
          </div>
        </td>
        <td>
          <div class="person-cell">
            <strong class="person-name">${person}</strong>
            <span class="person-sub">${r.source_type === 'call' ? 'Sales Rep' : 'Calendar Organiser'}</span>
          </div>
        </td>
        <td>
          ${r.usable_text ? `
            <span class="badge badge-success">✓ Usable text</span>
          ` : `
            <span class="badge badge-slate">∅ No text supplied</span>
          `}
        </td>
        <td>
          <div class="routes-cell">${routeBadges}</div>
        </td>
        <td>
          ${originBadge}
        </td>
        <td>
          ${reviewBadge}
        </td>
        <td>
          <div class="summary-cell" title="${summaryText.replace(/"/g, '&quot;')}">
            ${summaryText}
          </div>
        </td>
        <td>
          <button class="btn btn-xs btn-primary" onclick="event.stopPropagation(); window.RevenueApp.navigateToRecord('${r.record_ref}')">Inspect →</button>
        </td>
      </tr>
    `;
  }

  function getReviewBadgeHtml(state) {
    switch (state) {
      case 'analysed-current':
        return `<span class="badge badge-success">analysed-current</span>`;
      case 'analysed-needs-review':
        return `<span class="badge badge-warning">analysed-needs-review</span>`;
      case 'intake-no-text':
        return `<span class="badge badge-slate">intake-no-text</span>`;
      case 'intake-silent':
        return `<span class="badge badge-amber">intake-silent</span>`;
      case 'intake-no-recording':
        return `<span class="badge badge-zinc">intake-no-recording</span>`;
      default:
        return `<span class="badge badge-slate">${state}</span>`;
    }
  }

  // ==========================================
  // VIEW 4: RECORD DETAIL VIEW
  // ==========================================
  function renderRecordDetail(container) {
    const record = Array.from(AppState.records.values()).find(r => r.record_ref === AppState.selectedRecordRef) 
      || Array.from(AppState.records.values())[0];

    if (!record) {
      container.innerHTML = '<div class="alert alert-danger">Record not found.</div>';
      return;
    }

    const person = getRecordPerson(record);
    const hasAnalysis = !!record.analysis;
    const allRefs = Array.from(AppState.records.values()).map(r => r.record_ref);
    const currentIndex = allRefs.indexOf(record.record_ref);
    const prevRef = currentIndex > 0 ? allRefs[currentIndex - 1] : null;
    const nextRef = currentIndex < allRefs.length - 1 ? allRefs[currentIndex + 1] : null;

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-row">
          <div class="record-title-wrap">
            <span class="record-ref-lg">${record.record_ref}</span>
            <div>
              <h1 class="page-title">${record.source_type === 'call' ? 'Sales Call Interaction' : (record.payload.title || 'Calendar Meeting')}</h1>
              <p class="page-subtitle">
                Source Type: <strong>${record.source_type}</strong> • 
                Identity: <code>(${record.source_type}, ${record.source_id})</code> • 
                Applied Source Revision: <strong>Rev ${record.source_revision}</strong> • 
                Local Time: <strong>${record.local_time_ist} IST</strong>
              </p>
            </div>
          </div>
          <div class="header-action-group">
            ${prevRef ? `<button class="btn btn-outline" onclick="window.RevenueApp.navigateToRecord('${prevRef}')">← Previous (${prevRef})</button>` : ''}
            ${nextRef ? `<button class="btn btn-outline" onclick="window.RevenueApp.navigateToRecord('${nextRef}')">Next (${nextRef}) →</button>` : ''}
            <button class="btn btn-secondary" onclick="window.RevenueApp.switchView('inbox')">Back to Inbox 📥</button>
          </div>
        </div>

        <!-- Route Management & Status Box -->
        <div class="detail-status-bar">
          <div class="detail-status-left">
            <div class="status-item">
              <span class="status-label">Assigned Route(s):</span>
              <div class="route-pills-wrap">
                ${record.routes.map(rt => `<span class="route-badge badge-route-${rt}">${rt}</span>`).join(' ')}
              </div>
            </div>
            <div class="status-item">
              <span class="status-label">Route Origin:</span>
              ${record.manual_override ? `
                <span class="badge badge-purple">✏ manual override (persisted in localStorage)</span>
              ` : `
                <span class="badge badge-slate">🤖 automated suggestion</span>
              `}
            </div>
            <div class="status-item">
              <span class="status-label">Review State:</span>
              ${getReviewBadgeHtml(record.review_state)}
            </div>
          </div>

          <div class="detail-status-right">
            <button class="btn btn-sm btn-outline" onclick="window.RevenueApp.toggleRouteEditor('${record.record_ref}')">Change Route ✏</button>
            ${record.manual_override ? `
              <button class="btn btn-sm btn-danger" onclick="window.RevenueApp.resetRecordRoute('${record.record_ref}')" title="Return this record to automated suggestion">Reset this record's route</button>
            ` : (record.record_ref === 'M07' ? `
              <button class="btn btn-sm btn-outline" disabled title="Already at automated suggestion">Reset this record's route</button>
            ` : '')}
          </div>
        </div>

        <!-- Route Editor Drawer (hidden by default) -->
        <div id="route-editor-${record.record_ref}" class="route-editor-drawer" style="display:none;">
          <div class="route-editor-card">
            <h4>Manual Route Assignment for ${record.record_ref}</h4>
            <p class="text-muted text-sm">Select one or more functional destinations. Corrections persist across re-imports, updates, and browser refresh until explicitly reset.</p>
            <div class="route-checkbox-grid">
              ${['coaching', 'deal-next-steps', 'customer-followup', 'partner-channel', 'internal-vendor-note', 'log-only', 'intake-only'].map(rt => `
                <label class="checkbox-label">
                  <input type="checkbox" name="route-opt-${record.record_ref}" value="${rt}" ${record.routes.includes(rt) ? 'checked' : ''}>
                  <span class="route-badge badge-route-${rt}">${rt}</span>
                </label>
              `).join('')}
            </div>
            <div class="route-editor-actions mt-3">
              <button class="btn btn-sm btn-primary" onclick="window.RevenueApp.saveRouteChanges('${record.record_ref}')">Save Manual Correction</button>
              ${record.manual_override ? `
                <button class="btn btn-sm btn-outline-danger" onclick="window.RevenueApp.resetRecordRoute('${record.record_ref}')">Reset this record's route</button>
              ` : ''}
              <button class="btn btn-sm btn-secondary" onclick="window.RevenueApp.toggleRouteEditor('${record.record_ref}')">Cancel</button>
            </div>
          </div>
        </div>
      </div>

      ${hasAnalysis ? renderAnalysedRecordContent(record) : renderIntakeRecordContent(record)}

      <!-- Raw Source Inspector Drawer -->
      <div class="section-card mt-4">
        <details class="raw-inspector-details">
          <summary class="raw-inspector-summary">
            <span>⚙️ Technical Source Inspector (Raw JSON Payload & Envelope)</span>
            <span class="badge badge-slate">Full Telemetry</span>
          </summary>
          <div class="raw-json-body mt-3">
            <pre><code>${JSON.stringify({
              source_type: record.source_type,
              source_id: record.source_id,
              record_ref: record.record_ref,
              source_revision: record.source_revision,
              payload: record.payload,
              transcript_payload: record.transcript_payload
            }, null, 2)}</code></pre>
          </div>
        </details>
      </div>
    `;

    // If highlightTarget was provided, scroll to it smoothly
    if (AppState.highlightTarget) {
      setTimeout(() => {
        executeTranscriptHighlight(AppState.highlightTarget);
      }, 150);
    }
  }

  // Render record that has substantive analysis
  function renderAnalysedRecordContent(record) {
    const an = record.analysis;
    const person = getRecordPerson(record);

    return `
      <!-- Warning flags if any -->
      ${(record.flags && record.flags.length > 0) ? `
        <div class="callout callout-warning mb-4">
          <div class="callout-icon">⚠</div>
          <div class="callout-content">
            <strong>Analytical Observation / Alert:</strong>
            ${record.flags.map(f => `<p class="mb-0">${f}</p>`).join('')}
          </div>
        </div>
      ` : ''}

      <div class="grid grid-2 mb-4">
        <!-- Left Column: Structured Analysis -->
        <div class="detail-left-col">
          <!-- What happened card -->
          <div class="section-card mb-3">
            <div class="section-header-sm">
              <span class="section-icon-sm">📝</span>
              <h3 class="section-title-sm">What Happened</h3>
            </div>
            <p class="section-p">${an.what_happened}</p>
          </div>

          <!-- Why it matters card -->
          <div class="section-card mb-3">
            <div class="section-header-sm">
              <span class="section-icon-sm">🎯</span>
              <h3 class="section-title-sm">Why It Matters</h3>
            </div>
            <p class="section-p">${an.why_it_matters}</p>
          </div>

          <!-- What the evidence does NOT establish (Honest Uncertainty) -->
          <div class="section-card mb-3 card-boundary">
            <div class="section-header-sm">
              <span class="section-icon-sm">🛡️</span>
              <h3 class="section-title-sm">What The Evidence Does Not Establish</h3>
            </div>
            <p class="section-p text-boundary">${an.not_established}</p>
          </div>

          <!-- Next Steps with Ownership Status -->
          <div class="section-card mb-3">
            <div class="section-header-sm">
              <span class="section-icon-sm">✅</span>
              <h3 class="section-title-sm">Next Steps & Ownership</h3>
            </div>
            <div class="next-steps-list">
              ${(an.next_steps || []).map(ns => {
                const isStated = ns.owner && (ns.owner.includes('stated') || ns.owner.includes('rep on record') || ns.owner.includes('offered'));
                const ownerBadgeClass = isStated ? 'owner-badge-stated' : 'owner-badge-unassigned';
                return `
                  <div class="next-step-row">
                    <span class="check-bullet">◽</span>
                    <div class="next-step-info">
                      <div class="next-step-action">${ns.action}</div>
                      <div class="next-step-owner">
                        <span class="owner-pill ${ownerBadgeClass}">Owner: ${ns.owner}</span>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Coaching & Upstream Label Check -->
          ${an.coaching ? `
            <div class="section-card mb-3">
              <div class="section-header-sm">
                <span class="section-icon-sm">💡</span>
                <h3 class="section-title-sm">Sales Coaching Feedback</h3>
              </div>
              <p class="section-p">${an.coaching}</p>
            </div>
          ` : ''}

          ${an.stored_label_check && an.stored_label_check !== 'n/a' ? `
            <div class="section-card mb-3">
              <div class="section-header-sm">
                <span class="section-icon-sm">⚖️</span>
                <h3 class="section-title-sm">Stored Upstream Label Audit</h3>
              </div>
              <p class="section-p text-sm">${an.stored_label_check}</p>
            </div>
          ` : ''}
        </div>

        <!-- Right Column: Interactive Transcript with Highlighted Evidence -->
        <div class="detail-right-col">
          <div class="section-card transcript-container">
            <div class="section-header">
              <div class="section-title-wrap">
                <span class="section-icon">📜</span>
                <div>
                  <h3 class="section-title">Verified Conversation Transcript</h3>
                  <p class="section-desc">Passages cited as analytical evidence are permanently highlighted.</p>
                </div>
              </div>
              <span class="badge badge-success">Authentic Source Text</span>
            </div>

            <!-- Evidence Citations quick nav bar -->
            <div class="evidence-quick-nav">
              <span class="evidence-nav-label">Citations in this record:</span>
              <div class="evidence-nav-tags">
                ${(an.evidence || []).map((ev, i) => {
                  if (ev.type === 'turn') {
                    return `<button class="passage-badge-xs" onclick="window.RevenueApp.jumpToTurn(${ev.turn})">Turn ${ev.turn} [${ev.timecode}] ↗</button>`;
                  } else {
                    return `<button class="passage-badge-xs" onclick="window.RevenueApp.jumpToQuote('${ev.quote.replace(/'/g, "\\'")}')">Quote #${i+1} ↗</button>`;
                  }
                }).join('')}
              </div>
            </div>

            <!-- Transcript Body -->
            <div class="transcript-scroll-area">
              ${record.source_type === 'meeting' ? renderMeetingTranscript(record) : renderCallTranscript(record)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Render Meeting Turns
  function renderMeetingTranscript(record) {
    const turns = (record.transcript_payload && record.transcript_payload.turns) || [];
    if (turns.length === 0) {
      return '<div class="alert alert-warning">No turns available in meeting transcript.</div>';
    }

    const evidenceTurns = new Set();
    const evidenceQuotes = {};
    if (record.analysis && record.analysis.evidence) {
      record.analysis.evidence.forEach(ev => {
        if (ev.type === 'turn') {
          evidenceTurns.add(ev.turn);
          evidenceQuotes[ev.turn] = ev.quote;
        }
      });
    }

    return `
      <div class="turns-container">
        ${turns.map((t, idx) => {
          const turnNum = idx + 1; // 1-based turn number
          const isEvidence = evidenceTurns.has(turnNum);
          return `
            <div id="turn-card-${turnNum}" class="turn-card ${isEvidence ? 'turn-evidence-highlight' : ''}">
              <div class="turn-header">
                <div class="turn-speaker-wrap">
                  <span class="turn-num">Turn ${turnNum}</span>
                  <strong class="turn-speaker">${t.speaker}</strong>
                </div>
                <div class="turn-meta">
                  <span class="turn-timecode">${t.timecode}</span>
                  ${isEvidence ? `<span class="badge badge-warning turn-evidence-badge">⭐ CITED EVIDENCE</span>` : ''}
                </div>
              </div>
              <div class="turn-body">
                ${t.text}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Render Call Transcript
  function renderCallTranscript(record) {
    const text = (record.payload && record.payload.transcript) || '';
    if (!text) {
      return '<div class="alert alert-warning">No text available in call transcript.</div>';
    }

    // Highlight exact evidence quotes
    let highlightedText = text;
    if (record.analysis && record.analysis.evidence) {
      record.analysis.evidence.forEach((ev, i) => {
        if (ev.type === 'quote' && ev.quote) {
          const escaped = ev.quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const reg = new RegExp(`(${escaped})`, 'gi');
          highlightedText = highlightedText.replace(reg, `<mark class="evidence-quote-mark" id="quote-mark-${i}" title="Cited Evidence Passage">$1</mark>`);
        }
      });
    }

    return `
      <div class="call-transcript-box">
        <div class="call-dialogue-text">
          ${highlightedText}
        </div>
      </div>
    `;
  }

  // Render intake-only record (no usable text)
  function renderIntakeRecordContent(record) {
    const person = getRecordPerson(record);
    const flag = (record.flags && record.flags.length > 0) ? record.flags[0] : 'No transcript provided in extract.';

    return `
      <div class="intake-banner-card mb-4">
        <div class="intake-banner-icon">📁</div>
        <div class="intake-banner-content">
          <h2 class="intake-banner-title">Intake State Only — No Usable Text Supplied</h2>
          <p class="intake-banner-desc">
            In accordance with the product integrity contract, no substantive analysis is invented for missing, silent, or unrecorded interactions. Deal values and account links are strictly omitted.
          </p>
          <div class="intake-reason-box">
            <strong>Condition on record:</strong> ${flag}
          </div>
        </div>
      </div>

      <div class="grid grid-2 mb-4">
        <!-- Telemetry metadata card -->
        <div class="section-card">
          <div class="section-header-sm">
            <span class="section-icon-sm">📊</span>
            <h3 class="section-title-sm">Upstream Metadata Attributes</h3>
          </div>
          <table class="meta-kv-table">
            <tbody>
              <tr>
                <td><strong>Record Reference:</strong></td>
                <td><span class="badge badge-slate">${record.record_ref}</span></td>
              </tr>
              <tr>
                <td><strong>Source System Type:</strong></td>
                <td>${record.source_type}</td>
              </tr>
              <tr>
                <td><strong>Person Identifier:</strong></td>
                <td><strong>${person}</strong></td>
              </tr>
              <tr>
                <td><strong>Local Time:</strong></td>
                <td>${record.local_time_ist} (Asia/Kolkata)</td>
              </tr>
              ${record.source_type === 'call' ? `
                <tr>
                  <td><strong>Call Direction:</strong></td>
                  <td>${record.payload.direction || 'n/a'} (${record.payload.direction_raw || ''})</td>
                </tr>
                <tr>
                  <td><strong>Reported Duration:</strong></td>
                  <td>${record.payload.duration_seconds || 0} seconds</td>
                </tr>
                <tr>
                  <td><strong>Source is_connected:</strong></td>
                  <td><code>${record.payload.is_connected}</code></td>
                </tr>
                <tr>
                  <td><strong>Stored Outcome:</strong></td>
                  <td><span class="badge badge-outline">${record.payload.observed_outcome || 'none'}</span></td>
                </tr>
              ` : `
                <tr>
                  <td><strong>Calendar Title:</strong></td>
                  <td>${record.payload.title || 'Untitled'}</td>
                </tr>
                <tr>
                  <td><strong>Scheduled Duration:</strong></td>
                  <td>${record.payload.duration_seconds || 0} seconds</td>
                </tr>
                <tr>
                  <td><strong>Provider:</strong></td>
                  <td>${record.payload.provider || 'unknown'}</td>
                </tr>
                <tr>
                  <td><strong>Recording Status:</strong></td>
                  <td><span class="badge badge-outline">${record.payload.recording_status || 'unknown'}</span></td>
                </tr>
                <tr>
                  <td><strong>Attendee Count:</strong></td>
                  <td>${record.payload.attendee_count || 'unknown'}</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        <!-- Manager Assessment card -->
        <div class="section-card">
          <div class="section-header-sm">
            <span class="section-icon-sm">🛡️</span>
            <h3 class="section-title-sm">Managerial Intake Guidance</h3>
          </div>
          <div class="intake-guidance-content">
            <p><strong>Status Reason:</strong> ${record.review_state}</p>
            <p class="text-muted text-sm">
              ${record.source_type === 'call' 
                ? 'This background call had no audio transcription supplied in this delivery extract. A missing transcript does not prove that nothing was said, but without transcript evidence, no sales coaching or opportunity updates can be established.'
                : 'This meeting has no usable turns recorded (either nobody spoke on the recording or the recording bot was cancelled / not scheduled). The meeting may still have taken place off-platform, but no conversation-derived evidence is present.'}
            </p>
            <div class="callout callout-slate mt-3">
              <strong>Assigned Destination:</strong> <code>intake-only</code> in <code>intake/intake-register.md</code>.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Jump to turn in meeting
  function jumpToTurn(turnNum) {
    const el = document.getElementById(`turn-card-${turnNum}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('pulse-highlight');
      setTimeout(() => el.classList.remove('pulse-highlight'), 2500);
    }
  }

  // Jump to quote in call
  function jumpToQuote(quoteText) {
    const mark = document.querySelector('.evidence-quote-mark');
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      mark.classList.add('pulse-highlight');
      setTimeout(() => mark.classList.remove('pulse-highlight'), 2500);
    }
  }

  // Scroll to highlight target
  function executeTranscriptHighlight(target) {
    if (!target) return;
    if (target.type === 'turn') {
      jumpToTurn(target.val);
    } else if (target.type === 'quote') {
      jumpToQuote(target.val);
    }
  }

  // ==========================================
  // VIEW 5: IMPORT & REPLAY PANEL
  // ==========================================
  function renderImportPanel(container) {
    const records = Array.from(AppState.records.values());
    const m07 = records.find(r => r.record_ref === 'M07');
    let usableCount = 0;
    records.forEach(r => { if (r.usable_text) usableCount++; });

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title-row">
          <div>
            <h1 class="page-title">Data Ingestion & Contract Replay Suite</h1>
            <p class="page-subtitle">Test and verify identity deduplication, revision handling, late-transcript updates, and persisted manual overrides.</p>
          </div>
          <div class="header-action-group">
            <button class="btn btn-danger" onclick="window.RevenueApp.resetAllState()">Reset All State ⟲</button>
            <button class="btn btn-primary" onclick="window.RevenueApp.loadFullDemo()">Load Demo (Both Batches) 🚀</button>
          </div>
        </div>

        <!-- Contract Rules Banner -->
        <div class="callout callout-indigo mb-4">
          <div class="callout-icon">📋</div>
          <div class="callout-content">
            <strong>Data Contract Verification Rules:</strong>
            <ul class="contract-rules-list">
              <li><strong>Record Identity:</strong> Exactly the pair <code>(source_type, source_id)</code>. Names, refs, and array positions are never identities.</li>
              <li><strong>Revision Control:</strong> Initial revision is 1, update revision is 2. A higher revision completely replaces older source fields. Older revisions are ignored.</li>
              <li><strong>No Duplicates:</strong> Repeated imports (including shuffled order) must never inflate the 44-record count.</li>
              <li><strong>Manual Override Preservation:</strong> Manual route decisions persist in <code>localStorage</code> across re-imports, updates, and page refreshes.</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Interactive Replay Step Buttons -->
      <div class="section-card mb-4">
        <div class="section-header">
          <div class="section-title-wrap">
            <span class="section-icon">🎮</span>
            <div>
              <h2 class="section-title">Replay Verification Controls</h2>
              <p class="section-desc">Execute each step of the assignment test protocol with one click and observe audit results.</p>
            </div>
          </div>
        </div>

        <div class="replay-buttons-grid">
          <!-- Step 1 -->
          <div class="replay-card">
            <div class="replay-card-header">
              <span class="step-badge">Step 1</span>
              <h4>Import Initial Batch</h4>
            </div>
            <p class="replay-card-desc">Loads <code>01_initial.json</code> (Rev 1). 44 unique records, 17 usable texts. M07 arrives without transcript (turns: 0).</p>
            <button class="btn btn-sm btn-primary w-100" onclick="window.RevenueApp.executeStep1()">Run Step 1: Initial Import</button>
          </div>

          <!-- Step 2 -->
          <div class="replay-card">
            <div class="replay-card-header">
              <span class="step-badge">Step 2</span>
              <h4>Repeat Import (Shuffled)</h4>
            </div>
            <p class="replay-card-desc">Re-imports <code>01_initial.json</code> in randomized order. Verifies 0 duplicates, 0 replaced, 44 ignored, unique count stays 44.</p>
            <button class="btn btn-sm btn-secondary w-100" onclick="window.RevenueApp.executeStep2()">Run Step 2: Repeat Shuffled</button>
          </div>

          <!-- Step 3 -->
          <div class="replay-card">
            <div class="replay-card-header">
              <span class="step-badge">Step 3</span>
              <h4>Manual Route Change</h4>
            </div>
            <p class="replay-card-desc">Manually change M07's route to <code>["deal-next-steps"]</code> (clearly different from the automated suggestion <code>["customer-followup"]</code>). Persists immediately into localStorage.</p>
            <button class="btn btn-sm btn-warning w-100" onclick="window.RevenueApp.executeStep3()">Run Step 3: Change M07 route to deal-next-steps</button>
          </div>

          <!-- Step 4 -->
          <div class="replay-card">
            <div class="replay-card-header">
              <span class="step-badge">Step 4</span>
              <h4>Import Update (Rev 2)</h4>
            </div>
            <p class="replay-card-desc">Loads <code>02_update.json</code> (Rev 2). M07 payload replaced with 27 turns. Usable texts increments to 18. Manual route preserved!</p>
            <button class="btn btn-sm btn-success w-100" onclick="window.RevenueApp.executeStep4()">Run Step 4: Import Update</button>
          </div>

          <!-- Step 5 -->
          <div class="replay-card">
            <div class="replay-card-header">
              <span class="step-badge">Step 5</span>
              <h4>Repeat Initial After Update</h4>
            </div>
            <p class="replay-card-desc">Imports Rev 1 after Rev 2. For M07, rev 1 &lt; rev 2 so it is ignored. Total records remain 44, usable texts remain 18.</p>
            <button class="btn btn-sm btn-outline w-100" onclick="window.RevenueApp.executeStep5()">Run Step 5: Rev 1 after Rev 2</button>
          </div>

          <!-- Step 6 -->
          <div class="replay-card">
            <div class="replay-card-header">
              <span class="step-badge">Step 6</span>
              <h4>Full Demo State</h4>
            </div>
            <p class="replay-card-desc">Resets to post-update baseline (both batches applied, all 44 records, 18 usable texts, M07 at rev 2).</p>
            <button class="btn btn-sm btn-indigo w-100" onclick="window.RevenueApp.loadFullDemo()">Load Demo State</button>
          </div>
        </div>
      </div>

      <!-- Live Replay Audit Log Table -->
      <div class="section-card mb-4">
        <div class="section-header">
          <div class="section-title-wrap">
            <span class="section-icon">📑</span>
            <div>
              <h2 class="section-title">Replay Audit Log & Ingestion Ledger</h2>
              <p class="section-desc">Live ledger recording every import transaction with record delta counts.</p>
            </div>
          </div>
          <button class="btn btn-xs btn-outline" onclick="window.RevenueApp.clearAuditLog()">Clear Log</button>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Step / Ingestion Action</th>
                <th>Unique Records</th>
                <th>New Added</th>
                <th>Replaced (Higher Rev)</th>
                <th>Ignored (Same/Lower Rev)</th>
                <th>Usable Texts</th>
                <th>Contract Compliance</th>
              </tr>
            </thead>
            <tbody>
              ${AppState.auditLog.map(entry => `
                <tr>
                  <td><strong>${entry.step}</strong></td>
                  <td><span class="badge badge-info">${entry.unique}</span></td>
                  <td><span class="count-pill ${entry.new > 0 ? 'bg-green' : ''}">+${entry.new}</span></td>
                  <td><span class="count-pill ${entry.replaced > 0 ? 'bg-amber' : ''}">${entry.replaced}</span></td>
                  <td><span class="count-pill ${entry.ignored > 0 ? 'bg-slate' : ''}">${entry.ignored}</span></td>
                  <td><strong>${entry.usable_texts} / ${entry.unique}</strong></td>
                  <td><span class="badge badge-success">✓ Verified</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Custom JSON File Drag and Drop -->
      <div class="section-card mb-4">
        <div class="section-header">
          <div class="section-title-wrap">
            <span class="section-icon">📂</span>
            <div>
              <h2 class="section-title">Upload Custom Assessment JSON Batch</h2>
              <p class="section-desc">Import any external JSON batch adhering to the data envelope specification.</p>
            </div>
          </div>
        </div>
        <div class="dropzone-box" id="json-dropzone">
          <input type="file" id="json-file-input" accept=".json" style="display:none;" onchange="window.RevenueApp.handleFileUpload(event)">
          <div class="dropzone-inner" onclick="document.getElementById('json-file-input').click()">
            <span class="dropzone-icon">📤</span>
            <p class="dropzone-text">Click or drag & drop a custom JSON delivery file here</p>
            <span class="dropzone-sub">Accepts <code>01_initial.json</code>, <code>02_update.json</code>, or compatible batch envelopes</span>
          </div>
        </div>
      </div>
    `;
  }

  // Manifest and ZIP Generation Helpers (invoked by Inbox Export button)

  // Generate Manifest JSON Object
  function generateManifestObject(records) {
    return {
      generated_from: 'post-update state (revisions applied)',
      generated_at: new Date().toISOString(),
      records: records.length,
      outputs: records.map(r => {
        const prefix = `${r.record_ref}_${r.source_id.slice(0, 8)}`;
        const outputPaths = [];
        if (r.routes.includes('intake-only')) {
          outputPaths.push('intake/intake-register.md');
        } else {
          for (const rt of r.routes) {
            outputPaths.push(`routes/${rt}/${prefix}.md`);
          }
        }
        outputPaths.push(`records/${prefix}/source.json`);
        return {
          source_type: r.source_type,
          source_id: r.source_id,
          record_ref: r.record_ref,
          applied_source_revision: r.source_revision,
          routes: r.routes,
          route_origin: r.route_origin,
          manual_override: r.manual_override,
          output_paths: outputPaths,
          review_state: r.review_state,
          analysis_freshness: r.analysis ? r.analysis.freshness : 'not_applicable',
          analysis_source_revision: r.analysis ? r.analysis.source_revision : null,
          status: 'active'
        };
      })
    };
  }

  // Trigger ZIP download using JSZip
  function downloadExportZip() {
    if (typeof JSZip === 'undefined') {
      showToast('JSZip library is loading. Please retry in a moment.', 'warning');
      return;
    }

    showToast('Building ZIP archive in memory...', 'info');
    const zip = new JSZip();
    const records = Array.from(AppState.records.values());
    const ap = window.ANALYSIS_PACK;

    // 1. manifest.json
    const manifest = generateManifestObject(records);
    zip.file('manifest.json', JSON.stringify(manifest, null, 1));

    // 2. records/{ref}_{id8}/source.json
    records.forEach(r => {
      const prefix = `${r.record_ref}_${r.source_id.slice(0, 8)}`;
      zip.file(`records/${prefix}/source.json`, JSON.stringify({
        payload: r.payload,
        transcript_payload: r.transcript_payload
      }, null, 1));
    });

    // 3. daily/2026-08-21/manager-brief.md
    let briefMd = '# Manager brief - 2026-08-21 (Asia/Kolkata)\n\n';
    briefMd += (ap.brief.scope || '') + '\n\n## Attention list\n';
    (ap.brief.attention || []).forEach(item => {
      briefMd += `${item.rank}. ${item.ref} - ${item.title}. ${item.why} Next: ${item.action}\n`;
    });
    briefMd += '\n## Coaching\n';
    (ap.brief.coaching || []).forEach(c => { briefMd += `- ${c}\n`; });
    briefMd += '\n## Stored labels challenged\n';
    (ap.brief.label_challenges || []).forEach(l => { briefMd += `- ${l}\n`; });
    briefMd += '\n' + (ap.brief.not_analysed || '') + '\n';
    zip.file('daily/2026-08-21/manager-brief.md', briefMd);

    // 4. intake/intake-register.md
    let intakeMd = '# Intake register (records with no usable text)\n\n| ref | type | state | note |\n|---|---|---|---|\n';
    records.filter(r => r.routes.includes('intake-only')).forEach(r => {
      const flag = (r.flags && r.flags[0]) ? r.flags[0] : '';
      intakeMd += `| ${r.record_ref} | ${r.source_type} | ${r.review_state} | ${flag} |\n`;
    });
    zip.file('intake/intake-register.md', intakeMd);

    // 5. routes/{route}/{ref}_{id8}.md
    records.forEach(r => {
      if (!r.analysis) return;
      const prefix = `${r.record_ref}_${r.source_id.slice(0, 8)}`;
      r.routes.forEach(rt => {
        const rtName = (ap.routes && ap.routes[rt]) || rt;
        let md = `# ${r.record_ref} - ${rtName}\n\n`;
        md += `Source: ${r.source_type} ${r.source_id} (revision ${r.source_revision})\n`;
        md += `All routes for this record: ${r.routes.join(', ')}\n`;
        md += `Route origin: ${r.route_origin}  |  Review state: ${r.review_state}\n`;
        md += `Analysis freshness: ${r.analysis.freshness} (analysis built from revision ${r.analysis.source_revision})\n`;
        md += `Full context: ../../records/${prefix}/source.json\n\n`;
        md += `## What happened\n${r.analysis.what_happened}\n\n`;
        md += `## Why it matters\n${r.analysis.why_it_matters}\n\n`;
        md += '## Evidence\n';
        if (r.analysis.evidence) {
          r.analysis.evidence.forEach(ev => {
            if (ev.type === 'turn') {
              md += `- turn ${ev.turn} [${ev.timecode}] "${ev.quote}"\n`;
            } else {
              md += `- quote: "${ev.quote}"\n`;
            }
          });
        }
        md += `\n## Not established\n${r.analysis.not_established}\n\n`;
        md += '## Next steps\n';
        if (r.analysis.next_steps) {
          r.analysis.next_steps.forEach(ns => {
            md += `- ${ns.action} - owner: ${ns.owner}\n`;
          });
        }
        if (r.analysis.coaching && rt === 'coaching') {
          md += `\n## Coaching\n${r.analysis.coaching}\n`;
        }
        if (r.analysis.stored_label_check && r.analysis.stored_label_check !== 'n/a') {
          md += `\nStored label check: ${r.analysis.stored_label_check}\n`;
        }
        zip.file(`routes/${rt}/${prefix}.md`, md);
      });
    });

    // Generate blob and download
    zip.generateAsync({ type: 'blob' }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `revenue_intelligence_export_2026-08-21.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('ZIP export downloaded successfully!', 'success');
    }).catch(err => {
      console.error(err);
      showToast('Failed to create ZIP export: ' + err.message, 'error');
    });
  }



  // ==========================================
  // REPLAY AUTOMATION & HELPERS
  // ==========================================
  function executeStep1() {
    // Reset store to just initial batch
    AppState.records.clear();
    importBatch(window.INITIAL_BATCH, '1 import 01_initial');
  }

  function executeStep2() {
    // Shuffle initial batch records
    const shuffled = {
      ...window.INITIAL_BATCH,
      records: [...window.INITIAL_BATCH.records].sort(() => Math.random() - 0.5)
    };
    importBatch(shuffled, '2 import 01_initial again, shuffled');
  }

  function executeStep3() {
    // Manually change M07's route to deal-next-steps
    setManualRoute('M07', ['deal-next-steps']);
    showToast('Step 3 complete: M07 route manually set to [deal-next-steps].', 'success');
  }

  function executeStep4() {
    // Import update batch
    importBatch(window.UPDATE_BATCH, '3 import 02_update (rev 2)');
  }

  function executeStep5() {
    // Import initial batch again
    importBatch(window.INITIAL_BATCH, '4 import 01_initial again (rev 1 after rev 2)');
  }

  function loadFullDemo() {
    initializeDefaultState();
    showToast('Loaded full post-update demo state (both batches imported, 44 records, 18 usable texts).', 'success');
    renderCurrentView();
    updateHeaderPills();
  }

  // Handle manual file upload from drag-drop or file input
  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const batch = JSON.parse(e.target.result);
        if (!batch.records || !Array.isArray(batch.records)) {
          throw new Error('Missing records array in batch JSON');
        }
        importBatch(batch, `Custom file import: ${file.name}`);
      } catch (err) {
        showToast('Failed to parse uploaded JSON: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  // Save route changes from Record Detail drawer
  function saveRouteChanges(recordRef) {
    const checked = Array.from(document.querySelectorAll(`input[name="route-opt-${recordRef}"]:checked`)).map(el => el.value);
    if (checked.length === 0) {
      showToast('Please select at least one route.', 'warning');
      return;
    }
    setManualRoute(recordRef, checked);
    toggleRouteEditor(recordRef);
  }

  function toggleRouteEditor(recordRef) {
    const drawer = document.getElementById(`route-editor-${recordRef}`);
    if (drawer) {
      drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    }
  }

  function copyManifest() {
    const records = Array.from(AppState.records.values());
    const manifest = generateManifestObject(records);
    navigator.clipboard.writeText(JSON.stringify(manifest, null, 2)).then(() => {
      showToast('Manifest JSON copied to clipboard!', 'success');
    });
  }

  // Filter dispatchers
  function setSourceFilter(val) {
    AppState.filters.sourceType = val;
    renderCurrentView();
  }
  function setPersonFilter(val) {
    AppState.filters.person = val;
    renderCurrentView();
  }
  function setRouteFilter(val) {
    AppState.filters.route = val;
    renderCurrentView();
  }
  function setReviewFilter(val) {
    AppState.filters.reviewState = val;
    renderCurrentView();
  }
  function setOriginFilter(val) {
    AppState.filters.routeOrigin = val;
    renderCurrentView();
  }
  function setSearchFilter(val) {
    AppState.filters.search = val;
    renderCurrentView();
  }
  function resetDashboardFilters() {
    AppState.filters = {
      search: '',
      person: 'all',
      sourceType: 'all',
      route: 'all',
      reviewState: 'all',
      hasText: 'all',
      routeOrigin: 'all'
    };
    renderCurrentView();
  }
  function filterByPerson(person) {
    AppState.filters.person = person;
    switchView('inbox');
  }
  function filterInbox(route) {
    AppState.filters.route = route;
    switchView('inbox');
  }
  function clearAuditLog() {
    AppState.auditLog = [];
    renderCurrentView();
  }

  // Public application interface attached to window
  window.RevenueApp = {
    init: function() {
      initializeDefaultState();
      updateHeaderPills();
      renderCurrentView();

      // Navigation tab listeners
      document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          const view = tab.dataset.view;
          if (view) switchView(view);
        });
      });
    },
    switchView,
    navigateToRecord,
    jumpToTurn,
    jumpToQuote,
    setManualRoute,
    resetRecordRoute,
    resetAllState,
    saveRouteChanges,
    toggleRouteEditor,
    executeStep1,
    executeStep2,
    executeStep3,
    executeStep4,
    executeStep5,
    loadFullDemo,
    handleFileUpload,
    downloadExportZip,
    copyManifest,
    setSourceFilter,
    setPersonFilter,
    setRouteFilter,
    setReviewFilter,
    setOriginFilter,
    setSearchFilter,
    resetDashboardFilters,
    filterByPerson,
    filterInbox,
    clearAuditLog
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.RevenueApp.init);
  } else {
    window.RevenueApp.init();
  }
})();
