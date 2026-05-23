'use strict'

const { describe, it, before, after, mock } = require('node:test')
const assert = require('node:assert/strict')
const {
  createTestContext,
  startServer,
  stopServer,
  apiFetch,
} = require('../helpers/adoTestServer')

function workItemFields(id, type, title, completedWork = 0) {
  return {
    'System.Id': id,
    'System.WorkItemType': type,
    'System.Title': title,
    'System.State': type === 'Task' ? 'Closed' : 'Active',
    'System.TeamProject': 'drillops-reporting',
    'Microsoft.VSTS.Scheduling.CompletedWork': completedWork,
  }
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === 'content-type') return 'application/json'
        return null
      },
    },
    async text() {
      return JSON.stringify(body)
    },
  }
}

describe('integration: Azure DevOps work item API', () => {
  /** @type {ReturnType<typeof createTestContext>} */
  let ctx
  /** @type {string} */
  let baseUrl
  /** @type {import('node:test').MockFunction<typeof fetch>} */
  let fetchMock
  const originalPat = process.env.ADO_PAT
  const originalClientId = process.env.AZURE_CLIENT_ID

  before(async () => {
    process.env.ADO_PAT = 'integration-test-pat'
    delete process.env.AZURE_CLIENT_ID
    ctx = createTestContext()
    baseUrl = await startServer(ctx.server)

    fetchMock = mock.method(global, 'fetch', async (url, init) => {
      const href = String(url)
      if (href.includes('/_apis/projects')) {
        return jsonResponse(200, { value: [{ name: 'drillops-reporting' }] })
      }
      if (href.includes('/workitemsbatch')) {
        const body = JSON.parse(String(init.body))
        return jsonResponse(200, {
          value: body.ids.map((id) => ({
            id,
            fields: workItemFields(
              id,
              id === 2667073 ? 'User Story' : 'Task',
              `Item ${id}`,
              id === 2667074 ? 4 : 0,
            ),
          })),
        })
      }
      if (href.includes('/workitems/2667072')) {
        return jsonResponse(200, {
          id: 2667072,
          fields: workItemFields(2667072, 'Requirement', 'Root requirement'),
          relations: [
            {
              rel: 'System.LinkTypes.Hierarchy-Forward',
              url: 'https://dev.azure.com/slb1-swt/_apis/wit/workItems/2667073',
            },
          ],
        })
      }
      if (href.includes('/workitems/2667073')) {
        return jsonResponse(200, {
          id: 2667073,
          fields: workItemFields(2667073, 'User Story', 'Child story'),
          relations: [
            {
              rel: 'System.LinkTypes.Hierarchy-Forward',
              url: 'https://dev.azure.com/slb1-swt/_apis/wit/workItems/2667074',
            },
          ],
        })
      }
      if (href.includes('/workitems/2667074')) {
        return jsonResponse(200, {
          id: 2667074,
          fields: workItemFields(2667074, 'Task', 'Child task', 4),
          relations: [],
        })
      }
      return jsonResponse(404, { message: `Unmocked fetch: ${href}` })
    })
  })

  after(async () => {
    fetchMock.mock.restore()
    if (originalPat === undefined) delete process.env.ADO_PAT
    else process.env.ADO_PAT = originalPat
    if (originalClientId === undefined) delete process.env.AZURE_CLIENT_ID
    else process.env.AZURE_CLIENT_ID = originalClientId
    await stopServer(ctx.server)
  })

  it('GET /api/azure-devops/workitems/:id returns tree without test cases', async () => {
    const res = await apiFetch(
      baseUrl,
      'GET',
      '/api/azure-devops/workitems/2667072?org=slb1-swt&project=drillops-reporting',
    )
    assert.equal(res.status, 200)
    assert.equal(res.body.id, 2667072)
    assert.equal(res.body.workItemType, 'Requirement')
    assert.equal(res.body.title, 'Root requirement')
    assert.equal(res.body.children.length, 1)
    assert.equal(res.body.children[0].workItemType, 'User Story')
    assert.equal(res.body.children[0].children.length, 1)
    assert.equal(res.body.children[0].children[0].workItemType, 'Task')
    assert.equal(res.body.children[0].children[0].completedWork, 4)
    assert.ok(res.body.webUrl.includes('2667072'))
  })

  it('GET /api/azure-devops/workitems/:id rejects non-numeric id', async () => {
    const res = await apiFetch(baseUrl, 'GET', '/api/azure-devops/workitems/not-a-id')
    assert.equal(res.status, 400)
    assert.match(res.body.error, /positive integer/i)
  })

  it('GET /api/azure-devops/workitems/:id returns 503 without auth', async () => {
    const savedPat = process.env.ADO_PAT
    delete process.env.ADO_PAT
    try {
      const res = await apiFetch(baseUrl, 'GET', '/api/azure-devops/workitems/2667072')
      assert.equal(res.status, 503)
    } finally {
      if (savedPat === undefined) delete process.env.ADO_PAT
      else process.env.ADO_PAT = savedPat
    }
  })
})
