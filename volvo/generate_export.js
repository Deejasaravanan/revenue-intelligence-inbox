const fs = require('fs');
const path = require('path');
global.window = {};
require('./data.js');
const JSZip = require('./jszip.min.js');

const ap = window.ANALYSIS_PACK;
const initialBatch = window.INITIAL_BATCH;
const updateBatch = window.UPDATE_BATCH;

const records = ap.records.map(r => {
  const init = initialBatch.records.find(x => x.source_id === r.source_id);
  const upd = updateBatch.records.find(x => x.source_id === r.source_id);
  const src = upd || init;
  return {
    ...r,
    payload: src.payload,
    transcript_payload: src.transcript_payload,
    manual_override: false,
    route_origin: 'automated_suggestion'
  };
});

const zip = new JSZip();

// 1. Manifest
const manifest = {
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
zip.file('manifest.json', JSON.stringify(manifest, null, 1));

// 2. Source records
for (const r of records) {
  const prefix = `${r.record_ref}_${r.source_id.slice(0, 8)}`;
  zip.file(`records/${prefix}/source.json`, JSON.stringify({
    payload: r.payload,
    transcript_payload: r.transcript_payload
  }, null, 1));
}

// 3. Daily brief
let briefMd = '# Manager brief - 2026-08-21 (Asia/Kolkata)\n\n';
briefMd += `${ap.brief.scope || ''}\n\n## Attention list\n`;
(ap.brief.attention || []).forEach(item => {
  briefMd += `${item.rank}. ${item.ref} - ${item.title}. ${item.why} Next: ${item.action}\n`;
});
briefMd += '\n## Coaching\n';
(ap.brief.coaching || []).forEach(c => { briefMd += `- ${c}\n`; });
briefMd += '\n## Stored labels challenged\n';
(ap.brief.label_challenges || []).forEach(l => { briefMd += `- ${l}\n`; });
briefMd += `\n${ap.brief.not_analysed || ''}\n`;
zip.file('daily/2026-08-21/manager-brief.md', briefMd);

// 4. Intake register
let intakeMd = '# Intake register (records with no usable text)\n\n| ref | type | state | note |\n|---|---|---|---|\n';
records.filter(r => r.routes.includes('intake-only')).forEach(r => {
  const flag = (r.flags && r.flags[0]) ? r.flags[0] : '';
  intakeMd += `| ${r.record_ref} | ${r.source_type} | ${r.review_state} | ${flag} |\n`;
});
zip.file('intake/intake-register.md', intakeMd);

// 5. Routes
for (const r of records) {
  if (!r.analysis) continue;
  const prefix = `${r.record_ref}_${r.source_id.slice(0, 8)}`;
  for (const rt of r.routes) {
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
      for (const ev of r.analysis.evidence) {
        if (ev.type === 'turn') {
          md += `- turn ${ev.turn} [${ev.timecode}] "${ev.quote}"\n`;
        } else {
          md += `- quote: "${ev.quote}"\n`;
        }
      }
    }
    md += `\n## Not established\n${r.analysis.not_established}\n\n`;
    md += '## Next steps\n';
    if (r.analysis.next_steps) {
      for (const ns of r.analysis.next_steps) {
        md += `- ${ns.action} - owner: ${ns.owner}\n`;
      }
    }
    if (r.analysis.coaching && rt === 'coaching') {
      md += `\n## Coaching\n${r.analysis.coaching}\n`;
    }
    if (r.analysis.stored_label_check && r.analysis.stored_label_check !== 'n/a') {
      md += `\nStored label check: ${r.analysis.stored_label_check}\n`;
    }
    zip.file(`routes/${rt}/${prefix}.md`, md);
  }
}

zip.generateAsync({ type: 'nodebuffer' }).then(buf => {
  fs.writeFileSync('revenue_intelligence_export_2026-08-21.zip', buf);
  console.log('Saved revenue_intelligence_export_2026-08-21.zip:', buf.length, 'bytes');

  // Extract files into export/ directory
  const exportDir = path.join(__dirname, 'export');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  const filePromises = [];
  zip.forEach((relPath, file) => {
    if (!file.dir) {
      const fullPath = path.join(exportDir, relPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      filePromises.push(file.async('nodebuffer').then(content => fs.writeFileSync(fullPath, content)));
    }
  });
  Promise.all(filePromises).then(() => {
    console.log('Export folder populated successfully with', filePromises.length, 'files');
  });
});
