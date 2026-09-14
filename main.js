'use strict';

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:api[_-]?key|access[_-]?token|secret|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9_\-.]{12,}["']?/gi,
];
const SECRET_KEY_PATTERN = /(?:^|[_-])(api[_-]?key|access[_-]?token|auth(?:orization)?|bearer|client[_-]?secret|cookie|password|passwd|private[_-]?key|secret|session[_-]?id|signature|token)(?:$|[_-])/i;
const EXPORT_UNAVAILABLE_MESSAGE = 'Insomnia workspace export API is unavailable in this context. Snapshot contains only this warning.';

function safeString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
function redact(value) {
  const s = safeString(value);
  if (s.length <= 8) return '[REDACTED]';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
function isSecretKey(key) {
  const normalized = String(key || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  return SECRET_KEY_PATTERN.test(normalized);
}
function redactText(text) {
  let out = safeString(text);
  for (const re of SECRET_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, m => redact(m));
  }
  out = out.replace(/([?&](?:access_token|api_key|apikey|key|token|auth|authorization|client_secret|secret|password|signature|sig)=)[^&#\s"]+/gi, '$1[REDACTED]');
  return out;
}
function parseJson(raw) {
  return JSON.parse(safeString(raw));
}
function isObject(value) {
  return value !== null && typeof value === 'object';
}
function redactStructured(value, parentKey, seen) {
  if (isSecretKey(parentKey)) return '[REDACTED]';
  if (typeof value === 'string') return redactText(value);
  if (!isObject(value)) return value;

  const active = seen || new WeakSet();
  if (active.has(value)) return '[Circular]';
  active.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => redactStructured(item, '', active));
    const out = {};
    const namedSecret = isSecretKey(value.name) || isSecretKey(value.key);
    for (const [key, item] of Object.entries(value)) {
      out[key] = namedSecret && /^(value|values)$/i.test(key) ? '[REDACTED]' : redactStructured(item, key, active);
    }
    return out;
  } finally {
    active.delete(value);
  }
}
function redactedExport(raw) {
  try { return redactStructured(parseJson(raw)); } catch { return null; }
}
function formatRedactedExport(raw) {
  const structured = redactedExport(raw);
  if (structured) return JSON.stringify(structured, null, 2);
  return redactText(raw);
}
function countResources(raw) {
  try {
    const parsed = parseJson(raw);
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
function routeInventory(raw) {
  try {
    const parsed = parseJson(raw);
    const resources = Array.isArray(parsed.resources) ? parsed.resources : [];
    const methods = {};
    const hosts = {};
    for (const r of resources) {
      const t = String(r._type || r.type || '').toLowerCase();
      if (!(t.includes('request') && !t.includes('group'))) continue;
      const method = String(r.method || 'GET').toUpperCase();
      methods[method] = (methods[method] || 0) + 1;
      try {
        const host = new URL(String(r.url || '')).hostname;
        if (host) hosts[host] = (hosts[host] || 0) + 1;
      } catch {}
    }
    return { methods, hosts };
  } catch { return { methods: {}, hosts: {} }; }
}
function snapshotHash(raw) {
  return require('crypto').createHash('sha256').update(formatRedactedExport(raw), 'utf8').digest('hex');
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function makeSnapshot(raw) {
  const counts = countResources(raw);
  const inventory = routeInventory(raw);
  const redacted = formatRedactedExport(raw);
  const hash = snapshotHash(raw);
  const methodLines = Object.entries(inventory.methods).sort().map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- none';
  const hostLines = Object.entries(inventory.hosts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- none';
  return `# Insomnia Local Snapshot\n\nGenerated: ${new Date().toISOString()}\n\nLocal-only snapshot. Secret-like keys and values are redacted. Export requested with includePrivate=false.\n\n## Summary\n\n- Resources: ${counts.total}\n- Requests: ${counts.requests}\n- Folders: ${counts.folders}\n- Environments: ${counts.environments}\n- Specs: ${counts.specs}\n- Redacted SHA-256: ${hash}\n\n## Route Inventory\n\n### Methods\n\n${methodLines}\n\n### Hosts\n\n${hostLines}\n\n## Sidecar JSON\n\nA compact redacted JSON sidecar is written next to this Markdown file for diffing and automation.\n\n## Redacted Workspace Export\n\n\`\`\`json\n${redacted}\n\`\`\`\n`;
}
function parseRedactedExport(raw) {
  const structured = redactedExport(raw);
  if (structured) return structured;
  return { raw: redactText(raw) };
}
function makeSnapshotJson(raw) {
  const counts = countResources(raw);
  const redactedSha256 = snapshotHash(raw);
  return JSON.stringify({
    schema: 'insomnia-local-snapshot/v1',
    generatedAt: new Date().toISOString(),
    localOnly: true,
    includePrivate: false,
    counts,
    routeInventory: routeInventory(raw),
    redactedSha256,
    redactedExport: parseRedactedExport(raw),
  }, null, 2) + '\n';
}
function jsonSidecarPath(markdownPath) {
  return String(markdownPath).replace(/\.md$/i, '') + '.json';
}
async function getWritableExportPath(context, fileName) {
  const path = require('path'); const candidates = [];
  if (context.app && typeof context.app.getPath === 'function') for (const key of ['documents', 'desktop', 'downloads', 'userData', 'home']) { try { const v = await context.app.getPath(key); if (v) candidates.push(v); } catch {} }
  candidates.push(process.env.HOME || process.env.USERPROFILE || process.cwd());
  return path.join(candidates.find(Boolean) || '.', fileName);
}
function fallbackExport(error) {
  const warning = error ? `${EXPORT_UNAVAILABLE_MESSAGE} (${error.message || String(error)})` : EXPORT_UNAVAILABLE_MESSAGE;
  return JSON.stringify({
    resources: [],
    snapshotWarnings: [warning],
  }, null, 2);
}
async function exportInsomnia(context) {
  const fn = context && context.data && context.data.export && context.data.export.insomnia;
  if (typeof fn !== 'function') return { raw: fallbackExport(), warning: EXPORT_UNAVAILABLE_MESSAGE };
  try {
    return { raw: safeString(await fn({ includePrivate: false, format: 'json' })), warning: null };
  } catch (error) {
    return { raw: fallbackExport(error), warning: error.message || String(error) };
  }
}
const action = { label: 'Local Snapshot: Export Redacted Snapshot', icon: 'fa-camera', action: async (context) => {
  const exported = await exportInsomnia(context);
  const raw = exported.raw;
  const report = makeSnapshot(raw);
  const jsonReport = makeSnapshotJson(raw);
  const fs = require('fs'); let output = null;
  if (context.app && typeof context.app.showSaveDialog === 'function') output = await context.app.showSaveDialog({ defaultPath: `insomnia-local-snapshot-${timestampSlug()}.md` });
  if (!output) output = await getWritableExportPath(context, `insomnia-local-snapshot-${timestampSlug()}.md`);
  const jsonOutput = jsonSidecarPath(output);
  fs.writeFileSync(output, report, 'utf8');
  fs.writeFileSync(jsonOutput, jsonReport, 'utf8');
  if (context.app && typeof context.app.alert === 'function') {
    const suffix = exported.warning ? `\n\nWarning: ${exported.warning}` : '';
    await context.app.alert('Local Snapshot exported', `Markdown: ${output}\nJSON: ${jsonOutput}${suffix}`);
  }
}};
module.exports.workspaceActions = [action];
module.exports.requestGroupActions = [action];
module.exports.requestActions = [action];
module.exports.__test = { countResources, exportInsomnia, fallbackExport, formatRedactedExport, getWritableExportPath, isSecretKey, jsonSidecarPath, makeSnapshot, makeSnapshotJson, parseRedactedExport, redact, redactStructured, redactText, routeInventory, snapshotHash, timestampSlug };
