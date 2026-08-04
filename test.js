'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const plugin = require('./main');
const t = plugin.__test;

const fake = 'sk-' + 'a'.repeat(30);
const workspace = JSON.stringify({
  resources: [
    { _type: 'request', name: 'A', url: 'https://x.test?a=' + fake },
    { _type: 'request_group', name: 'Folder' },
    { _type: 'environment', name: 'Env', data: { api_key: fake } },
    { _type: 'apiSpec', contents: '{}' }
  ]
});

function ctx(out) {
  const alerts = [];
  return {
    alerts,
    data: { export: { insomnia: async () => workspace } },
    app: {
      showSaveDialog: async () => out,
      getPath: async k => k === 'documents' ? os.tmpdir() : '',
      alert: async (t, m) => alerts.push({ t, m })
    }
  };
}

async function main() {
  assert(Array.isArray(plugin.workspaceActions));
  assert(Array.isArray(plugin.requestGroupActions));
  assert(Array.isArray(plugin.requestActions));

  const counts = t.countResources(workspace);
  assert.strictEqual(counts.total, 4);
  assert.strictEqual(counts.requests, 1);
  assert.strictEqual(counts.folders, 1);
  assert.strictEqual(counts.environments, 1);
  assert.strictEqual(counts.specs, 1);

  assert(!t.redactText(workspace).includes(fake));

  const snap = t.makeSnapshot(workspace);
  assert(snap.includes('# Insomnia Local Snapshot'));
  assert(snap.includes('Resources: 4'));
  assert(snap.includes('Redacted SHA-256:'));
  assert.strictEqual(t.snapshotHash(workspace).length, 64);
  assert(t.timestampSlug(new Date('2026-01-01T00:00:00.000Z')).includes('2026-01-01T00-00-00-000Z'));
  assert(!snap.includes(fake));

  const jsonText = t.makeSnapshotJson(workspace);
  const json = JSON.parse(jsonText);
  assert.strictEqual(json.schema, 'insomnia-local-snapshot/v1');
  assert.deepStrictEqual(json.counts, counts);
  assert.strictEqual(json.redactedSha256, t.snapshotHash(workspace));
  assert(json.redactedExport.resources, 'redacted export is structured JSON');
  assert(!jsonText.includes(fake), 'JSON sidecar redacts secrets');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-snapshot-'));
  try {
    for (const action of [plugin.workspaceActions[0], plugin.requestGroupActions[0], plugin.requestActions[0]]) {
      const out = path.join(tmp, Math.random().toString(36).slice(2) + '.md');
      const c = ctx(out);
      await action.action(c);
      const text = fs.readFileSync(out, 'utf8');
      assert(text.includes('Insomnia Local Snapshot'));
      assert(!text.includes(fake));
      const sidecar = out.replace(/\.md$/i, '.json');
      assert(fs.existsSync(sidecar), 'JSON sidecar written next to Markdown');
      const sidecarText = fs.readFileSync(sidecar, 'utf8');
      assert(JSON.parse(sidecarText).redactedExport.resources);
      assert(!sidecarText.includes(fake));
      assert.strictEqual(c.alerts.length, 1);
      assert(c.alerts[0].m.includes('.md'));
      assert(c.alerts[0].m.includes('.json'));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('PASS: all tests');
}

main().catch(e => { console.error(e.stack || e); process.exit(1); });
