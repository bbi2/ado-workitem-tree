'use strict'

const {
  hierarchyForwardChildIds,
  shouldIncludeWorkItemType,
  workItemTreeNodeFromBody,
} = require('./adoWorkItemUtils')

const ADO_WIT_TREE_FIELDS = [
  'System.Id',
  'System.WorkItemType',
  'System.Title',
  'System.State',
  'System.AssignedTo',
  'Microsoft.VSTS.Scheduling.CompletedWork',
  'System.TeamProject',
]

/**
 * List team project names (Core API). OAuth needs vso.project; PAT needs Project and team (read).
 * GET work item by id is only supported with /{org}/{project}/... per Microsoft REST docs.
 */
async function listAdoProjectNames(org, authorizationHeader) {
  const names = []
  let continuationToken = null
  let pages = 0
  try {
    do {
      pages += 1
      if (pages > 60) break
      const qs = new URLSearchParams({ 'api-version': '7.1', $top: '100' })
      if (continuationToken) qs.set('continuationToken', continuationToken)
      const apiUrl = `https://dev.azure.com/${encodeURIComponent(org)}/_apis/projects?${qs.toString()}`
      const r = await fetch(apiUrl, {
        headers: {
          Authorization: authorizationHeader,
          Accept: 'application/json',
        },
      })
      const nextHdr = r.headers.get('x-ms-continuationtoken')
      continuationToken = nextHdr && String(nextHdr).trim() ? String(nextHdr).trim() : null

      const text = await r.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        return {
          ok: false,
          status: r.status,
          names,
          message: text.slice(0, 280),
        }
      }
      if (!r.ok) {
        const msg =
          data.message ||
          data.Message ||
          (typeof data.value === 'string' ? data.value : null) ||
          text.slice(0, 280)
        return { ok: false, status: r.status, names, message: msg || `HTTP ${r.status}` }
      }
      for (const p of data.value || []) {
        if (p && p.name) names.push(String(p.name))
      }
    } while (continuationToken)
    return { ok: true, status: 200, names }
  } catch (e) {
    return { ok: false, status: 502, names, message: String(e.message || e) }
  }
}

async function fetchWorkItemInProject(org, projectName, id, authorizationHeader, options) {
  const qs = new URLSearchParams({ 'api-version': '7.1' })
  if (options && options.expandRelations) qs.set('$expand', 'Relations')
  const apiUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(projectName)}/_apis/wit/workitems/${encodeURIComponent(id)}?${qs.toString()}`
  const r = await fetch(apiUrl, {
    headers: {
      Authorization: authorizationHeader,
      Accept: 'application/json',
    },
  })
  const text = await r.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return { ok: false, status: r.status, body: null, text }
  }
  if (r.ok) return { ok: true, body }
  return { ok: false, status: r.status, body, text }
}

async function batchFetchWorkItemsInProject(org, projectName, ids, authorizationHeader) {
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))]
  if (!unique.length) return { ok: true, items: [] }
  const apiUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(projectName)}/_apis/wit/workitemsbatch?api-version=7.1`
  const r = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: authorizationHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ ids: unique, fields: ADO_WIT_TREE_FIELDS }),
  })
  const text = await r.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return { ok: false, status: r.status, items: [], text }
  }
  if (!r.ok) {
    const msg =
      body.message ||
      body.Message ||
      (typeof body.value === 'string' ? body.value : null) ||
      text.slice(0, 280)
    return { ok: false, status: r.status, items: [], message: msg || `HTTP ${r.status}` }
  }
  return { ok: true, items: body.value || [] }
}

/** Recursively load hierarchy children; excludes Test Case work items. */
async function buildSubtreeFromChildIds(org, projectName, childIds, authorizationHeader) {
  if (!childIds.length) return []

  const batchRes = await batchFetchWorkItemsInProject(org, projectName, childIds, authorizationHeader)
  if (!batchRes.ok) return []

  const byId = new Map(batchRes.items.map((item) => [Number(item.id), item]))
  const included = []

  for (const cid of childIds) {
    const item = byId.get(cid)
    if (!item) continue
    const type = item.fields && item.fields['System.WorkItemType']
    if (!shouldIncludeWorkItemType(type)) continue
    included.push({ cid, node: workItemTreeNodeFromBody(item, org) })
  }

  if (!included.length) return []

  const relationResults = await Promise.all(
    included.map(({ cid }) =>
      fetchWorkItemInProject(org, projectName, cid, authorizationHeader, {
        expandRelations: true,
      }),
    ),
  )

  await Promise.all(
    included.map(async ({ node }, index) => {
      const relRes = relationResults[index]
      const subIds = relRes.ok ? hierarchyForwardChildIds(relRes.body.relations) : []
      node.children = await buildSubtreeFromChildIds(org, projectName, subIds, authorizationHeader)
    }),
  )

  return included.map(({ node }) => node)
}

async function buildWorkItemChildTree(org, projectName, parentId, authorizationHeader) {
  const parentRes = await fetchWorkItemInProject(org, projectName, parentId, authorizationHeader, {
    expandRelations: true,
  })
  if (!parentRes.ok) return []

  const childIds = hierarchyForwardChildIds(parentRes.body.relations)
  return buildSubtreeFromChildIds(org, projectName, childIds, authorizationHeader)
}

/** Resolve work item by probing team projects (Microsoft requires {org}/{project} in the Wit GET path). */
async function fetchAzureDevOpsWorkItem(org, envProject, id, authorizationHeader) {
  const listRes = await listAdoProjectNames(org, authorizationHeader)
  const candidates = []
  const seen = new Set()
  const add = (p) => {
    const n = p && String(p).trim()
    if (!n || seen.has(n)) return
    seen.add(n)
    candidates.push(n)
  }
  add(envProject)
  if (listRes.ok) {
    for (const n of listRes.names) add(n)
  }

  if (candidates.length === 0) {
    if (!listRes.ok) {
      const st = listRes.status >= 400 && listRes.status < 600 ? listRes.status : 502
      return {
        ok: false,
        status: st,
        body: {
          message:
            listRes.message ||
            `Could not list team projects (HTTP ${listRes.status}). Set ADO_PROJECT, or grant vso.project / Project and team (read) and sign in again.`,
        },
        text: '',
      }
    }
    return {
      ok: false,
      status: 404,
      body: {
        message:
          'No team projects returned for this organization. Check ADO_ORG or permissions.',
      },
      text: '',
    }
  }

  const BATCH = 12
  let last = { ok: false, status: 404, body: null, text: '' }
  for (let i = 0; i < candidates.length; i += BATCH) {
    const chunk = candidates.slice(i, i + BATCH)
    const results = await Promise.all(
      chunk.map((projectName) => fetchWorkItemInProject(org, projectName, id, authorizationHeader)),
    )
    for (const res of results) {
      if (res.ok) return res
      if (res.status !== 404) return res
      last = res
    }
  }

  if (!listRes.ok && candidates.length <= 1) {
    const hint =
      listRes.status === 403 || listRes.status === 401
        ? ` Cannot list team projects (${listRes.status}). Add scope vso.project (Project and team read) on the Entra app, grant consent, clear this site session and sign in again — or set ADO_PROJECT to the exact team project name. PATs need "Project and team (read)".`
        : listRes.message
          ? ` Project list failed: ${listRes.message}`
          : ''
    if (last.body && typeof last.body === 'object') {
      const m = last.body.message || last.body.Message
      last.body = {
        ...last.body,
        message: `${m || 'Work item not found'}${hint}`,
      }
    } else if (hint) {
      last.body = { message: `Work item not found (404).${hint}` }
    }
  } else if (listRes.ok && candidates.length > 0 && !last.ok) {
    const extra =
      ' Not found in any listed team project for this organization; check the id and ADO_ORG, or open the item in Azure DevOps to confirm the org.'
    if (last.body && typeof last.body === 'object') {
      const m = last.body.message || last.body.Message
      last.body = { ...last.body, message: `${m || 'Work item not found'}${extra}` }
    } else {
      last.body = { message: `Work item not found (404).${extra}` }
    }
  }

  return last
}

module.exports = {
  listAdoProjectNames,
  fetchWorkItemInProject,
  batchFetchWorkItemsInProject,
  buildSubtreeFromChildIds,
  buildWorkItemChildTree,
  fetchAzureDevOpsWorkItem,
}
