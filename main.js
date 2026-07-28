'use strict';

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:api[_-]?key|access[_-]?token|secret|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9_\-.]{12,}["']?/gi,
];

function safeString(value) { if (value == null) return ''; if (typeof value === 'string') return value; try { return JSON.stringify(value, null, 2); } catch { return String(value); } }
function redact(value) { const s = safeString(value); if (s.length <= 8) return '[REDACTED]'; return `${s.slice(0,4)}…${s.slice(-4)}`; }
function redactText(text) {
  let out = safeString(text);
  for (const re of SECRET_PATTERNS) { re.lastIndex = 0; out = out.replace(re, m => redact(m)); }
  out = out.replace(/([?&](?:access_token|api_key|apikey|key|token|auth|authorization|client_secret|secret|password|signature|sig)=)[^&#\s"]+/gi, '$1[REDACTED]');
  return out;
}
function countResources(raw) {
  try {
    const parsed = JSON.parse(safeString(raw));
    const resources = Array.isArray(parsed.resources) ? parsed.resources : [];
    const counts = { total: resources.length, requests: 0, folders: 0, environments: 0, specs: 0 };
    for (const r of resources) {
      const t = String(r._type || r.type || '').toLowerCase();
      if (t.includes('request') && !t.includes('group')) counts.requests += 1;
      else if (t.includes('request_group') || t.includes('folder')) counts.folders += 1;
      else if (t.includes('environment')) counts.environments += 1;
      else if (t.includes('api') || t.includes('spec')) counts.specs += 1;
    }
    return counts;
  } catch { return { total: 0, requests: 0, folders: 0, environments: 0, specs: 0 }; }
}
function makeSnapshot(raw) {
  const counts = countResources(raw);
  const redacted = redactText(raw);
  return `# Insomnia Local Snapshot\n\nGenerated: ${new Date().toISOString()}\n\nLocal-only snapshot. Secret-like values are redacted. Export requested with includePrivate=false.\n\n## Summary\n\n- Resources: ${counts.total}\n- Requests: ${counts.requests}\n- Folders: ${counts.folders}\n- Environments: ${counts.environments}\n- Specs: ${counts.specs}\n\n## Redacted Workspace Export\n\n\`\`\`json\n${redacted}\n\`\`\`\n`;
}
async function getWritableExportPath(context, fileName) {
  const path = require('path'); const candidates=[];
  if (context.app && typeof context.app.getPath === 'function') for (const key of ['documents','desktop','downloads','userData','home']) { try { const v=await context.app.getPath(key); if(v)candidates.push(v); } catch {} }
  candidates.push(process.env.HOME || process.env.USERPROFILE || process.cwd());
  return path.join(candidates.find(Boolean)||'.', fileName);
}
const action = { label: 'Local Snapshot: Export Redacted Snapshot', icon: 'fa-camera', action: async (context) => {
  const raw = await context.data.export.insomnia({ includePrivate: false, format: 'json' });
  const report = makeSnapshot(raw);
  const fs = require('fs'); let output=null;
  if (context.app && typeof context.app.showSaveDialog === 'function') output = await context.app.showSaveDialog({ defaultPath: 'insomnia-local-snapshot.md' });
  if (!output) output = await getWritableExportPath(context, 'insomnia-local-snapshot.md');
  fs.writeFileSync(output, report, 'utf8');
  if (context.app && typeof context.app.alert === 'function') await context.app.alert('Local Snapshot exported', output);
}};
module.exports.workspaceActions=[action];
module.exports.requestGroupActions=[action];
module.exports.requestActions=[action];
module.exports.__test={countResources,getWritableExportPath,makeSnapshot,redact,redactText};
