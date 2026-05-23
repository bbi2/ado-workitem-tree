'use strict'

;(function (root, factory) {
  const api = factory(root.AdoWorkItemShared || {})
  root.AdoWorkItemPanel = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function (shared) {
  const {
    adoStateCategory,
    adoWiIconKind,
    parseWorkItemFromUserInput,
    sumChildTaskCompletedHours,
    formatCompletedHours,
    displayCompletedHours,
    isTaskWorkItemType,
  } = shared

  function el(id) {
    return document.getElementById(id)
  }

  function defaultPageOriginSupportsSameOriginApi() {
    return (
      window.location.protocol === 'http:' || window.location.protocol === 'https:'
    )
  }

  function defaultFmtWorkingDays(n) {
    return formatCompletedHours(n)
  }

  /**
   * @param {object} options
   * @param {() => boolean} [options.pageOriginSupportsSameOriginApi]
   * @param {() => string} [options.sameOriginHelpText]
   * @param {(n: number) => string} [options.fmtWorkingDays]
   * @param {number} [options.hoursPerDay=8]
   * @param {string} [options.apiPath='/api/azure-devops/workitems']
   * @param {string} [options.authStatusUrl='/api/auth/status']
   * @param {string} [options.signInPath='/auth/azure/start']
   * @param {() => void} [options.onSnapshotChange]
   * @param {() => void} [options.onInputChange]
   */
  function create(options) {
    const opts = options && typeof options === 'object' ? options : {}
    const pageOriginSupportsSameOriginApi =
      opts.pageOriginSupportsSameOriginApi || defaultPageOriginSupportsSameOriginApi
    const sameOriginHelpText =
      opts.sameOriginHelpText ||
      (() =>
        'Open this page from the same http(s) origin as the API server (not file://).')
    const fmtWorkingDays = opts.fmtWorkingDays || defaultFmtWorkingDays
    const hoursPerDay = opts.hoursPerDay != null ? Number(opts.hoursPerDay) : 8
    const apiPath = opts.apiPath || '/api/azure-devops/workitems'
    const authStatusUrl = opts.authStatusUrl || '/api/auth/status'
    const signInPath = opts.signInPath || '/auth/azure/start'
    const onSnapshotChange = typeof opts.onSnapshotChange === 'function' ? opts.onSnapshotChange : () => {}
    const onInputChange = typeof opts.onInputChange === 'function' ? opts.onInputChange : () => {}

    /** @type {{ id: string, actualMdays: number, webUrl: string } | null} */
    let linkedSnapshot = null

    function getSnapshot() {
      return linkedSnapshot
    }

    function resetSnapshot() {
      linkedSnapshot = null
    }

    function getCurrentId() {
      const input = el('ado-workitem-input')
      if (!input) return ''
      return parseWorkItemFromUserInput(input.value).id || ''
    }

    function azureDevOpsSignInUrl() {
      const ret = `${window.location.pathname}${window.location.search}`
      return `${signInPath}?return=${encodeURIComponent(ret)}`
    }

    function azureSignInWrongOriginMessage() {
      return (
        'Sign-in is not available on this address. Open the app at the http:// URL served by the API. ' +
        'Using another preview port causes this unless the dev server proxies /auth to the API.'
      )
    }

    function isSaveLikelyNetworkError(e) {
      if (e instanceof TypeError) return true
      const m = e && typeof e.message === 'string' ? e.message : ''
      return /failed to fetch|networkerror|load failed|aborted|network request failed/i.test(m)
    }

    async function applyAuthStatus() {
      const signInBtn = el('btn-ado-signin')
      const hintRow = el('ado-auth-hint')
      if (!signInBtn) return

      if (!pageOriginSupportsSameOriginApi()) {
        signInBtn.hidden = true
        if (hintRow) hintRow.hidden = true
        return
      }

      try {
        const r = await fetch(authStatusUrl, { credentials: 'same-origin' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = await r.json()
        const oauth = data && data.mode === 'oauth'
        signInBtn.hidden = !oauth
        if (hintRow) hintRow.hidden = !oauth
      } catch {
        signInBtn.hidden = true
        if (hintRow) hintRow.hidden = true
      }
    }

    async function navigateToAzureSignIn() {
      const statusEl = el('ado-workitem-status')
      const url = azureDevOpsSignInUrl()
      if (!pageOriginSupportsSameOriginApi()) {
        const msg = `Sign in: ${sameOriginHelpText()}`
        if (statusEl) {
          statusEl.classList.add('is-error')
          statusEl.textContent = msg
        } else {
          window.alert(msg)
        }
        return
      }
      try {
        const r = await fetch(url, { redirect: 'manual', credentials: 'same-origin' })
        if (r.status === 404) {
          const err = azureSignInWrongOriginMessage()
          if (statusEl) {
            statusEl.classList.add('is-error')
            statusEl.textContent = err
          } else {
            window.alert(err)
          }
          return
        }
        if (r.status === 503) {
          const text = (await r.text()).trim()
          const err =
            text ||
            'Azure sign-in is not configured. Set AZURE_CLIENT_ID or ADO_PAT for local development.'
          if (statusEl) {
            statusEl.classList.add('is-error')
            statusEl.textContent = err
          } else {
            window.alert(err)
          }
          return
        }
        window.location.href = url
      } catch {
        const err = azureSignInWrongOriginMessage()
        if (statusEl) {
          statusEl.classList.add('is-error')
          statusEl.textContent = err
        } else {
          window.alert(err)
        }
      }
    }

    function setTaskHoursTotal(hours) {
      const totalEl = el('ado-task-hours-total')
      if (!totalEl) return
      if (hours == null) {
        totalEl.hidden = true
        totalEl.textContent = ''
        return
      }
      const hrsText = formatCompletedHours(hours)
      const workingDays = fmtWorkingDays(hours / hoursPerDay)
      totalEl.hidden = false
      totalEl.textContent = `Total: ${hrsText} hrs ( ${workingDays} working days )`
    }

    function setLinkLoading(loading) {
      const spinner = el('ado-link-loading')
      const linkBtn = el('btn-ado-link')
      const statusEl = el('ado-workitem-status')
      if (spinner) spinner.hidden = !loading
      if (linkBtn) linkBtn.disabled = Boolean(loading)
      if (statusEl) {
        statusEl.textContent = loading ? 'Loading Azure DevOps work items…' : ''
      }
    }

    function clearPanelUi() {
      const input = el('ado-workitem-input')
      if (input) input.value = ''
      setLinkLoading(false)
      setTaskHoursTotal(null)
      const resultEl = el('ado-workitem-result')
      if (resultEl) {
        resultEl.hidden = true
        resultEl.replaceChildren()
        resultEl.classList.remove('is-error')
      }
    }

    function applyFromSaved(saved) {
      const input = el('ado-workitem-input')
      const adoId = saved && saved.adoId != null ? String(saved.adoId) : ''
      const actualMdays =
        saved && saved.actualMdays != null && Number.isFinite(Number(saved.actualMdays))
          ? Number(saved.actualMdays)
          : null
      if (input && document.activeElement !== input) {
        input.value = adoId
      }
      if (actualMdays != null) {
        setTaskHoursTotal(actualMdays * hoursPerDay)
      } else {
        setTaskHoursTotal(null)
      }
    }

    function adoTreeRowVisible(tbody, row) {
      let parentId = row.dataset.adoParentId || ''
      while (parentId) {
        const parentRow = tbody.querySelector(
          `tr.ado-tree-row[data-ado-node-id="${CSS.escape(parentId)}"]`,
        )
        if (!parentRow) break
        const toggle = parentRow.querySelector('.ado-tree-toggle')
        if (toggle && toggle.getAttribute('aria-expanded') === 'false') return false
        parentId = parentRow.dataset.adoParentId || ''
      }
      return true
    }

    function refreshAdoTreeVisibility(tbody) {
      for (const row of tbody.querySelectorAll('tr.ado-tree-row[data-ado-parent-id]')) {
        const parentId = row.dataset.adoParentId
        if (!parentId) continue
        row.hidden = !adoTreeRowVisible(tbody, row)
      }
    }

    function setAdoTreeToggleExpanded(toggle, expanded) {
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
      toggle.setAttribute(
        'aria-label',
        expanded ? 'Collapse child work items' : 'Expand child work items',
      )
    }

    function setAllAdoTreeExpanded(tbody, expanded) {
      for (const toggle of tbody.querySelectorAll('.ado-tree-toggle')) {
        setAdoTreeToggleExpanded(toggle, expanded)
      }
      refreshAdoTreeVisibility(tbody)
    }

    function createAdoStateBadge(state) {
      const wrap = document.createElement('span')
      wrap.className = 'ado-state-badge'
      const dot = document.createElement('span')
      dot.className = `ado-state-dot ado-state-dot--${adoStateCategory(state)}`
      dot.setAttribute('aria-hidden', 'true')
      const text = document.createElement('span')
      text.className = 'ado-state-text'
      text.textContent = state ? String(state) : '—'
      wrap.append(dot, text)
      return wrap
    }

    function createAdoWiIcon(workItemType) {
      const icon = document.createElement('span')
      const kind = adoWiIconKind(workItemType)
      icon.className =
        kind === 'default' ? 'ado-wi-icon' : `ado-wi-icon ado-wi-icon--${kind}`
      icon.setAttribute('aria-hidden', 'true')
      return icon
    }

    function createAdoTreeHeaderToolBtn(label, symbol, onClick) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ado-tree-header-btn'
      btn.title = label
      btn.setAttribute('aria-label', label)
      btn.textContent = symbol
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
        btn.blur()
      })
      return btn
    }

    function buildAdoTreeColgroup() {
      const colgroup = document.createElement('colgroup')
      for (const [className, width] of [
        ['ado-tree-gutter', '3.25rem'],
        ['ado-col-id', '5.5rem'],
        ['ado-col-type', '6.5rem'],
        ['ado-col-title', null],
        ['ado-col-assignee', '11rem'],
        ['ado-col-state', '7.5rem'],
        ['ado-col-hours', '6.5rem'],
      ]) {
        const col = document.createElement('col')
        col.className = className
        if (width) col.style.width = width
        colgroup.appendChild(col)
      }
      return colgroup
    }

    function buildAdoTreeHeader(tbody) {
      const thead = document.createElement('thead')
      const headRow = document.createElement('tr')

      const toolsTh = document.createElement('th')
      toolsTh.scope = 'col'
      toolsTh.className = 'ado-tree-gutter'
      const tools = document.createElement('div')
      tools.className = 'ado-tree-header-tools'
      if (tbody.querySelector('.ado-tree-toggle')) {
        tools.append(
          createAdoTreeHeaderToolBtn('Expand all', '+', () => setAllAdoTreeExpanded(tbody, true)),
          createAdoTreeHeaderToolBtn('Collapse all', '−', () => setAllAdoTreeExpanded(tbody, false)),
        )
      }
      toolsTh.appendChild(tools)
      headRow.appendChild(toolsTh)

      for (const [label, className] of [
        ['ID', 'ado-col-id'],
        ['Type', 'ado-col-type'],
        ['Title', 'ado-col-title'],
        ['Assigned To', 'ado-col-assignee'],
        ['State', 'ado-col-state'],
        ['Completed hrs', 'ado-col-hours th-num'],
      ]) {
        const th = document.createElement('th')
        th.scope = 'col'
        th.className = className
        th.textContent = label
        headRow.appendChild(th)
      }

      thead.appendChild(headRow)
      return thead
    }

    function renderAdoWorkItemTreeRow(tbody, node, depth, parentNodeId) {
      const tr = document.createElement('tr')
      tr.className = 'ado-tree-row'
      if (depth === 0) tr.classList.add('ado-tree-row-root')
      tr.dataset.depth = String(depth)
      tr.dataset.adoNodeId = String(node.id ?? '')
      tr.dataset.adoParentId = parentNodeId ? String(parentNodeId) : ''

      const gutterCell = document.createElement('td')
      gutterCell.className = 'ado-tree-gutter'
      tr.appendChild(gutterCell)

      const idCell = document.createElement('td')
      idCell.className = 'ado-tree-id'
      const idLink = document.createElement('a')
      idLink.href = node.webUrl || '#'
      idLink.target = '_blank'
      idLink.rel = 'noopener noreferrer'
      idLink.className = 'ado-tree-id-link'
      idLink.textContent = String(node.id ?? '')
      idCell.appendChild(idLink)

      const typeCell = document.createElement('td')
      typeCell.className = 'ado-tree-type'
      typeCell.textContent = node.workItemType ? String(node.workItemType) : '—'

      const titleCell = document.createElement('td')
      titleCell.className = 'ado-tree-title'
      const titleWrap = document.createElement('div')
      titleWrap.className = 'ado-tree-title-wrap'
      titleWrap.style.paddingLeft = `${depth * 1.25}rem`

      const hasChildren = Array.isArray(node.children) && node.children.length > 0
      if (hasChildren) {
        const toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.className = 'ado-tree-toggle'
        toggle.setAttribute('aria-expanded', 'true')
        toggle.setAttribute('aria-label', 'Collapse child work items')
        toggle.addEventListener('click', (e) => {
          e.preventDefault()
          const expanded = toggle.getAttribute('aria-expanded') === 'true'
          setAdoTreeToggleExpanded(toggle, !expanded)
          refreshAdoTreeVisibility(tbody)
        })
        titleWrap.appendChild(toggle)
      } else {
        const spacer = document.createElement('span')
        spacer.className = 'ado-tree-toggle-spacer'
        spacer.setAttribute('aria-hidden', 'true')
        titleWrap.appendChild(spacer)
      }

      titleWrap.appendChild(createAdoWiIcon(node.workItemType))
      const titleLink = document.createElement('a')
      titleLink.href = node.webUrl || '#'
      titleLink.target = '_blank'
      titleLink.rel = 'noopener noreferrer'
      titleLink.className = 'ado-tree-title-link'
      titleLink.textContent =
        node.title != null && String(node.title).trim() ? String(node.title) : '—'
      titleLink.title = titleLink.textContent
      titleWrap.appendChild(titleLink)
      titleCell.appendChild(titleWrap)

      const assigneeCell = document.createElement('td')
      assigneeCell.className = 'ado-tree-assignee'
      assigneeCell.textContent = node.assignee ? String(node.assignee) : '—'

      const stateCell = document.createElement('td')
      stateCell.className = 'ado-tree-state'
      stateCell.appendChild(createAdoStateBadge(node.state))

      const hoursCell = document.createElement('td')
      hoursCell.className = 'ado-tree-hours num'
      if (!isTaskWorkItemType(node.workItemType)) {
        hoursCell.classList.add('ado-tree-hours--rollup')
      }
      hoursCell.textContent = displayCompletedHours(node)

      tr.append(idCell, typeCell, titleCell, assigneeCell, stateCell, hoursCell)
      tbody.appendChild(tr)

      for (const child of node.children || []) {
        renderAdoWorkItemTreeRow(tbody, child, depth + 1, node.id)
      }
    }

    function renderAdoWorkItemDetails(resultEl, data) {
      resultEl.hidden = false
      resultEl.replaceChildren()
      resultEl.classList.remove('is-error')

      const tableWrap = document.createElement('div')
      tableWrap.className = 'ado-tree-wrap'

      const table = document.createElement('table')
      table.className = 'ado-workitem-tree'

      const tbody = document.createElement('tbody')
      renderAdoWorkItemTreeRow(tbody, data, 0, '')
      table.appendChild(buildAdoTreeColgroup())
      table.appendChild(buildAdoTreeHeader(tbody))
      table.appendChild(tbody)
      tableWrap.appendChild(table)
      resultEl.appendChild(tableWrap)

      const childCount = Array.isArray(data.children) ? data.children.length : 0
      if (childCount === 0) {
        const empty = document.createElement('p')
        empty.className = 'ado-tree-empty'
        empty.textContent = 'No child work items (Test Cases are excluded).'
        resultEl.appendChild(empty)
      }
    }

    function renderAdoLinkError(resultEl, message, data, linkOptions) {
      if (!linkOptions || !linkOptions.keepTotals) setTaskHoursTotal(null)
      resultEl.hidden = false
      resultEl.replaceChildren()
      resultEl.classList.add('is-error')

      const p = document.createElement('p')
      p.className = 'ado-workitem-error'
      p.textContent = message
      resultEl.appendChild(p)

      if (data && data.needsLogin) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'ado-signin-btn'
        btn.textContent = 'Sign in to Azure DevOps'
        btn.addEventListener('click', () => void navigateToAzureSignIn())
        resultEl.appendChild(btn)
      }
    }

    async function linkWorkItem(linkOptions) {
      const linkOpts = linkOptions && typeof linkOptions === 'object' ? linkOptions : {}
      const input = el('ado-workitem-input')
      const statusEl = el('ado-workitem-status')
      const resultEl = el('ado-workitem-result')
      if (!input || !statusEl || !resultEl) return null

      if (!pageOriginSupportsSameOriginApi()) {
        statusEl.textContent = ''
        renderAdoLinkError(resultEl, `Link work item: ${sameOriginHelpText()}`)
        return null
      }

      const parsed = parseWorkItemFromUserInput(input.value)
      const id = parsed.id
      if (!id) {
        statusEl.textContent = ''
        renderAdoLinkError(
          resultEl,
          'Enter a work item ID, or paste a full dev.azure.com work item URL.',
        )
        return null
      }

      function restoreSavedTotalsIfNeeded() {
        if (!linkOpts.restoreSavedTotalsOnError) return
        if (linkOpts.savedActualMdays != null) {
          setTaskHoursTotal(Number(linkOpts.savedActualMdays) * hoursPerDay)
        }
      }

      statusEl.textContent = 'Loading work item and children…'
      if (!linkOpts.keepTotalsWhileLoading) setTaskHoursTotal(null)
      resultEl.hidden = true
      resultEl.replaceChildren()
      resultEl.classList.remove('is-error')
      setLinkLoading(true)

      try {
        const qs = new URLSearchParams()
        if (parsed.org) qs.set('org', parsed.org)
        if (parsed.project) qs.set('project', parsed.project)
        const q = qs.toString()
        const apiUrl = `${apiPath}/${encodeURIComponent(id)}${q ? `?${q}` : ''}`
        const res = await fetch(apiUrl, { credentials: 'same-origin' })
        let data = {}
        try {
          data = await res.json()
        } catch {
          data = {}
        }
        statusEl.textContent = ''
        if (!res.ok) {
          const msg =
            typeof data.error === 'string' ? data.error : `Request failed (${res.status})`
          renderAdoLinkError(resultEl, msg, data, { keepTotals: linkOpts.restoreSavedTotalsOnError })
          restoreSavedTotalsIfNeeded()
          return null
        }

        renderAdoWorkItemDetails(resultEl, data)
        const totalHours = sumChildTaskCompletedHours(data)
        setTaskHoursTotal(totalHours)
        linkedSnapshot = {
          id: String(data.id),
          actualMdays: Math.round((totalHours / hoursPerDay) * 10) / 10,
          webUrl: data.webUrl || '',
        }
        onSnapshotChange(linkedSnapshot)
        return linkedSnapshot
      } catch (e) {
        statusEl.textContent = ''
        renderAdoLinkError(
          resultEl,
          isSaveLikelyNetworkError(e)
            ? `Network error. ${sameOriginHelpText()}`
            : String(e.message || e),
          null,
          { keepTotals: linkOpts.restoreSavedTotalsOnError },
        )
        restoreSavedTotalsIfNeeded()
        return null
      } finally {
        setLinkLoading(false)
      }
    }

    async function autoLinkIfSaved(saved) {
      if (!pageOriginSupportsSameOriginApi()) return null
      const adoId = saved && saved.adoId && String(saved.adoId).trim()
      if (!adoId) return null
      const input = el('ado-workitem-input')
      if (input && !input.value.trim()) input.value = adoId
      const snap = await linkWorkItem({
        keepTotalsWhileLoading: true,
        restoreSavedTotalsOnError: true,
        savedActualMdays: saved && saved.actualMdays,
      })
      return snap
    }

    function init() {
      const adoInput = el('ado-workitem-input')
      const adoBtn = el('btn-ado-link')
      if (adoInput && adoBtn) {
        adoBtn.addEventListener('click', () => void linkWorkItem())
        adoInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void linkWorkItem()
          }
        })
        adoInput.addEventListener('input', () => onInputChange())
      }
      const adoSignIn = el('btn-ado-signin')
      if (adoSignIn) {
        adoSignIn.addEventListener('click', () => void navigateToAzureSignIn())
      }
    }

    async function start() {
      init()
      await applyAuthStatus()
    }

    return {
      init,
      start,
      applyAuthStatus,
      applyFromSaved,
      autoLinkIfSaved,
      clearPanelUi,
      getCurrentId,
      getSnapshot,
      linkWorkItem,
      navigateToAzureSignIn,
      resetSnapshot,
    }
  }

  return { create }
})
