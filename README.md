# insomnia-plugin-local-snapshot

[![npm version](https://img.shields.io/npm/v/insomnia-plugin-local-snapshot.svg)](https://www.npmjs.com/package/insomnia-plugin-local-snapshot)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Local-only redacted workspace snapshots for Insomnia.

Local Snapshot exports a Markdown file containing a redacted workspace export plus a small resource summary. It is intended as a quick safety backup before risky API work, migrations, imports, or destructive request sessions.

## Features

- Exports a local Markdown snapshot
- Uses Insomnia export with `includePrivate: false`
- Redacts secret-like values
- Counts requests, folders, environments, specs, and total resources
- No sync backend
- No cloud account
- No telemetry
- No dependencies

## Install

From Insomnia:

1. Open **Preferences** → **Plugins**
2. Enter `insomnia-plugin-local-snapshot`
3. Click **Install Plugin**

Manual macOS install:

```bash
cd "$HOME/Library/Application Support/Insomnia/plugins"
npm install insomnia-plugin-local-snapshot
```

## Usage

Run:

```text
Local Snapshot: Export Redacted Snapshot
```

The action is exposed through `workspaceActions`, `requestGroupActions`, and `requestActions`. In Insomnia 13 it may appear in the New Request dropdown.

## Privacy

- Local-only
- No network calls
- No analytics
- No account required
- Exports with `includePrivate: false`
- Secret-like values are redacted before writing the snapshot

## Development

```bash
git clone https://github.com/oliviajohns5/insomnia-plugin-local-snapshot.git
cd insomnia-plugin-local-snapshot
npm test
npm run test:packaged
npm pack --dry-run
```

## Verified QA

- `node --check main.js`
- `node --check test.js`
- `node --check real-insomnia-packaged-test.js`
- `node --check qa-packaged.js`
- `npm test`
- `npm run test:packaged`
- `npm pack --dry-run`
- isolated tarball install
- package metadata validation
- credential literal scan

## License

MIT
