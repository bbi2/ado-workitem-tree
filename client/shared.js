'use strict'

;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  root.AdoWorkItemShared = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function decodeUriComponentSafe(seg) {
    try {
      return decodeURIComponent(String(seg).replace(/\+/g, '%20'))
    } catch {
      return String(seg)
    }
  }

  function adoStateCategory(state) {
    const s = String(state || '')
      .trim()
      .toLowerCase()
    if (s === 'resolved') return 'resolved'
    if (['closed', 'done', 'completed', 'removed'].includes(s)) return 'closed'
    if (s === 'new') return 'new'
    if (
      ['active', 'approved', 'committed', 'in progress', 'in review', 'design'].includes(s)
    ) {
      return 'active'
    }
    return 'other'
  }

  function adoWiIconKind(workItemType) {
    const t = String(workItemType || '')
      .trim()
      .toLowerCase()
    if (t === 'requirement') return 'requirement'
    if (t === 'initiative') return 'initiative'
    if (t === 'user story') return 'user-story'
    if (t === 'task') return 'task'
    if (t === 'bug') return 'bug'
    return 'default'
  }

  function isTaskWorkItemType(type) {
    return (
      String(type || '')
        .trim()
        .toLowerCase() === 'task'
    )
  }

  function sumDescendantTaskHours(node) {
    let total = 0
    let hasTask = false
    function walk(n) {
      if (isTaskWorkItemType(n.workItemType)) {
        hasTask = true
        const hours = Number(n.completedWork)
        if (Number.isFinite(hours)) total += hours
      }
      for (const child of n.children || []) walk(child)
    }
    for (const child of node.children || []) walk(child)
    return { hasTask, total }
  }

  function sumChildTaskCompletedHours(data) {
    return sumDescendantTaskHours(data).total
  }

  function formatCompletedHours(value) {
    if (value == null || value === '') return '—'
    const n = Number(value)
    if (!Number.isFinite(n)) return '—'
    const r = Math.round(n * 10) / 10
    return Number.isInteger(r) ? String(r) : r.toFixed(1)
  }

  /** Task: direct Completed Work; other types: sum of all nested task hours as (value). */
  function displayCompletedHours(node) {
    if (isTaskWorkItemType(node && node.workItemType)) {
      return formatCompletedHours(node.completedWork)
    }
    const { hasTask, total } = sumDescendantTaskHours(node)
    if (!hasTask) return '(—)'
    return `(${formatCompletedHours(total)})`
  }

  /** Plain id, pasted id from a partial URL, or full dev.azure.com work item URL. */
  function parseWorkItemFromUserInput(raw) {
    const s = String(raw || '').trim()
    if (!s) return { id: '', org: '', project: '' }
    const mAdo = s.match(/dev\.azure\.com\/([^/?#]+)\/([^/?#]+)\/_workitems\/edit\/(\d+)/i)
    if (mAdo) {
      return {
        id: mAdo[3],
        org: decodeUriComponentSafe(mAdo[1]),
        project: decodeUriComponentSafe(mAdo[2]),
      }
    }
    const fromUrl =
      s.match(/_workitems\/edit\/(\d+)/i) ||
      s.match(/workitems\/(\d+)/i) ||
      s.match(/[?&]id=(\d+)/i)
    if (fromUrl) return { id: fromUrl[1], org: '', project: '' }
    if (/^\d+$/.test(s)) return { id: s, org: '', project: '' }
    const digits = s.replace(/\D/g, '')
    return digits ? { id: digits, org: '', project: '' } : { id: '', org: '', project: '' }
  }

  /** Comma-separated work item ids or URLs (one entry per segment). */
  function parseWorkItemsFromUserInput(raw) {
    const s = String(raw || '').trim()
    if (!s) return []
    return s
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => ({ ...parseWorkItemFromUserInput(part), raw: part }))
  }

  function normalizeAdoIdList(raw) {
    return parseWorkItemsFromUserInput(raw)
      .map((item) => item.id || item.raw)
      .join(', ')
  }

  return {
    adoStateCategory,
    adoWiIconKind,
    isTaskWorkItemType,
    sumChildTaskCompletedHours,
    formatCompletedHours,
    displayCompletedHours,
    parseWorkItemFromUserInput,
    parseWorkItemsFromUserInput,
    normalizeAdoIdList,
  }
})
