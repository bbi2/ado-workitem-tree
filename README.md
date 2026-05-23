# ado-workitem-tree

Reusable Azure DevOps work item tree module: Express API + vanilla browser UI.

Copy this folder into another project, or depend on it via a relative path (as the Estimation app does).

## Contents

| Path | Purpose |
|------|---------|
| `client/shared.js` | Shared parsing, state colors, hour totals |
| `client/adoWorkItemPanel.js` | Link UI, tree render, OAuth sign-in hooks |
| `client/ado-workitem-tree.css` | Panel + ADO-style tree styles |
| `client/ado-panel.html` | HTML fragment to paste into your page |
| `server/adoWorkItemUtils.js` | Field mapping, URL helpers |
| `server/adoWorkItemService.js` | ADO REST fetch + hierarchy builder |
| `server/mountAdoRoutes.js` | Express route factory |
| `test/` | Unit + integration tests |

## Backend integration

```javascript
const express = require('express')
const { mountAdoRoutes } = require('./packages/ado-workitem-tree/server')

const app = express()

mountAdoRoutes(app, {
  getAdoOrg: () => process.env.ADO_ORG || 'your-org',
  getAdoProject: () => process.env.ADO_PROJECT || 'your-project',
  resolveAdoOrg: (value) => value || process.env.ADO_ORG || 'your-org',
  getClientId: () => process.env.AZURE_CLIENT_ID,
  getAuthorizationHeader: async (req) => {
    // OAuth token from session, or PAT from env:
    const pat = process.env.ADO_PAT?.trim()
    if (pat) return `Basic ${Buffer.from(`:${pat}`, 'utf8').toString('base64')}`
    return null
  },
})
```

Environment variables commonly used:

- `ADO_ORG` — Azure DevOps organization
- `ADO_PROJECT` — preferred team project (speeds up lookup)
- `ADO_PAT` — personal access token (server-side)
- `AZURE_CLIENT_ID` — optional OAuth sign-in (host app must mount auth routes)

API endpoint (default): `GET /api/azure-devops/workitems/:id?org=&project=`

## Frontend integration

1. Copy or link `client/ado-panel.html` markup into your page (see `client/ado-panel.html`).
2. Include CSS and scripts **in this order**:

```html
<link rel="stylesheet" href="packages/ado-workitem-tree/client/ado-workitem-tree.css" />
<script src="packages/ado-workitem-tree/client/shared.js"></script>
<script src="packages/ado-workitem-tree/client/adoWorkItemPanel.js"></script>
```

3. Initialize the panel:

```javascript
const panel = AdoWorkItemPanel.create({
  pageOriginSupportsSameOriginApi: () =>
    location.protocol === 'http:' || location.protocol === 'https:',
  sameOriginHelpText: () => 'Open this app from the API server URL.',
  fmtWorkingDays: (n) => String(Math.round(n * 10) / 10),
  onSnapshotChange: (snap) => console.log('linked', snap),
})

panel.init()

// Optional: restore saved id / show cached totals
panel.applyFromSaved({ adoId: '2667072', actualMdays: 7 })

// Optional: auto-fetch tree on load
await panel.autoLinkIfSaved({ adoId: '2667072', actualMdays: 7 })

// Read linked state
panel.getCurrentId()
panel.getSnapshot() // { id, actualMdays, webUrl } | null
```

## Tests

From this package directory:

```bash
npm test
```

From the Estimation repo root, ADO tests run as part of `npm test`.

## Auth note

OAuth sign-in (`/auth/azure/start`) is **not** included in this package. The host application must provide Azure OAuth routes and pass tokens via `getAuthorizationHeader`. PAT auth works with only `mountAdoRoutes` and `ADO_PAT`.
