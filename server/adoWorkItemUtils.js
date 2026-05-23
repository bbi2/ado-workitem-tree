'use strict'

function assignedToDisplay(v) {
  if (v == null || v === '') return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v.displayName) return String(v.displayName)
  if (typeof v === 'object' && v.uniqueName) return String(v.uniqueName)
  return ''
}

/** Query `org` / `project` must be safe in URL paths (no slashes, traversal). */
function safeAdoPathSegment(raw) {
  const s = raw != null && String(raw).trim()
  if (!s || s.length > 260) return ''
  if (s.includes('\0') || /[/\\]/.test(s) || /\.\.(\/|\\)/.test(s)) return ''
  return s
}

function adoGuessWorkItemWebUrl(org, envProject, id) {
  if (!org || !id || !/^\d+$/.test(String(id))) return ''
  const oid = encodeURIComponent(org)
  const iid = encodeURIComponent(id)
  if (envProject && String(envProject).trim()) {
    const p = encodeURIComponent(String(envProject).trim())
    return `https://dev.azure.com/${oid}/${p}/_workitems/edit/${iid}`
  }
  return `https://dev.azure.com/${oid}/_workitems/edit/${iid}`
}

function hierarchyForwardChildIds(relations) {
  if (!Array.isArray(relations)) return []
  const ids = []
  for (const rel of relations) {
    if (!rel || !rel.rel || !String(rel.rel).includes('Hierarchy-Forward')) continue
    const m = String(rel.url || '').match(/workItems\/(\d+)/i)
    if (m) ids.push(Number(m[1]))
  }
  return ids
}

function normalizeWorkItemType(type) {
  return String(type || '')
    .trim()
    .toLowerCase()
}

function isTestCaseType(type) {
  const t = normalizeWorkItemType(type)
  return t === 'test case' || t === 'testcase'
}

function shouldIncludeWorkItemType(type) {
  return !isTestCaseType(type)
}

function completedWorkFromFields(fields) {
  const v = fields && fields['Microsoft.VSTS.Scheduling.CompletedWork']
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function adoWorkItemWebUrl(org, teamProject, id) {
  if (!org || !id) return ''
  const oid = encodeURIComponent(org)
  const iid = encodeURIComponent(id)
  if (teamProject && String(teamProject).trim()) {
    return `https://dev.azure.com/${oid}/${encodeURIComponent(String(teamProject).trim())}/_workitems/edit/${iid}`
  }
  return `https://dev.azure.com/${oid}/_workitems/edit/${iid}`
}

function workItemTreeNodeFromBody(body, org) {
  const f = body.fields || {}
  const id = body.id ?? f['System.Id']
  const teamProject =
    (typeof f['System.TeamProject'] === 'string' && f['System.TeamProject']) || ''
  return {
    id: Number(id),
    workItemType: f['System.WorkItemType'] ?? '',
    title: f['System.Title'] ?? '',
    state: f['System.State'] ?? '',
    assignee: assignedToDisplay(f['System.AssignedTo']),
    completedWork: completedWorkFromFields(f),
    webUrl: adoWorkItemWebUrl(org, teamProject, id),
    children: [],
  }
}

module.exports = {
  assignedToDisplay,
  safeAdoPathSegment,
  adoGuessWorkItemWebUrl,
  hierarchyForwardChildIds,
  normalizeWorkItemType,
  isTestCaseType,
  shouldIncludeWorkItemType,
  completedWorkFromFields,
  adoWorkItemWebUrl,
  workItemTreeNodeFromBody,
}
