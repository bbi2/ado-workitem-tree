'use strict'

const {
  safeAdoPathSegment,
  adoGuessWorkItemWebUrl,
  workItemTreeNodeFromBody,
} = require('./adoWorkItemUtils')
const { buildWorkItemChildTree, fetchAzureDevOpsWorkItem } = require('./adoWorkItemService')

const ADO_PAT_HELP_URL =
  'https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops'

function attachAzureDevOpsHelpPayload(payload, org, envProject, id, httpStatus, options) {
  const out = { ...payload, status: httpStatus, adoPatUrl: ADO_PAT_HELP_URL }
  const guess = adoGuessWorkItemWebUrl(org, envProject, id)
  if (guess) out.workItemWebUrl = guess
  if (options.getClientId && options.getClientId()) {
    out.adoSignInUrl = options.loginPath || '/auth/azure/start'
  }
  return out
}

/**
 * Mount Azure DevOps work item tree API on an Express app.
 *
 * @param {import('express').Express} app
 * @param {object} options
 * @param {() => string} [options.getAdoOrg]
 * @param {() => string} [options.getAdoProject]
 * @param {(value: string) => string} [options.resolveAdoOrg]
 * @param {(req: import('express').Request) => Promise<string|null>} options.getAuthorizationHeader
 * @param {() => string|null|undefined} [options.getClientId]
 * @param {string} [options.loginPath='/auth/azure/start']
 * @param {string} [options.apiPath='/api/azure-devops/workitems/:id']
 */
function mountAdoRoutes(app, options) {
  if (!options || typeof options.getAuthorizationHeader !== 'function') {
    throw new Error('mountAdoRoutes requires getAuthorizationHeader(req) => Promise<string|null>')
  }

  const getAdoOrg = options.getAdoOrg || (() => process.env.ADO_ORG || '')
  const getAdoProject = options.getAdoProject || (() => process.env.ADO_PROJECT || '')
  const resolveAdoOrg =
    options.resolveAdoOrg ||
    ((value) => {
      const v = value && String(value).trim()
      return v || getAdoOrg()
    })
  const loginPath = options.loginPath || '/auth/azure/start'
  const apiPath = options.apiPath || '/api/azure-devops/workitems/:id'

  app.get(apiPath, async (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!/^\d+$/.test(id)) {
      res.status(400).json({ error: 'Work item id must be a positive integer' })
      return
    }
    const qOrg = safeAdoPathSegment(req.query && req.query.org)
    const qProject = safeAdoPathSegment(req.query && req.query.project)
    const org = resolveAdoOrg(qOrg || getAdoOrg())
    const preferredProject = qProject || getAdoProject()

    const authorizationHeader = await options.getAuthorizationHeader(req)
    if (!authorizationHeader) {
      if (options.getClientId && options.getClientId()) {
        res.status(401).json(
          attachAzureDevOpsHelpPayload(
            {
              needsLogin: true,
              error: 'Sign in to Azure DevOps to link work items.',
              loginPath,
            },
            org,
            preferredProject,
            id,
            401,
            options,
          ),
        )
        return
      }
      res.status(503).json(
        attachAzureDevOpsHelpPayload(
          {
            error:
              'Azure DevOps auth not configured. Set ADO_PAT in .env (recommended) or AZURE_CLIENT_ID for sign-in, then restart the server.',
          },
          org,
          preferredProject,
          id,
          503,
          options,
        ),
      )
      return
    }

    try {
      const result = await fetchAzureDevOpsWorkItem(org, preferredProject, id, authorizationHeader)
      if (!result.ok) {
        const body = result.body || {}
        const msg =
          body.message ||
          body.Message ||
          (typeof body.value === 'string' ? body.value : null) ||
          (result.text && result.text.slice(0, 200)) ||
          `HTTP ${result.status}`
        const httpStatus =
          result.status >= 400 && result.status < 600 ? result.status : 502
        const payload = { error: msg }
        if (httpStatus === 401 && options.getClientId && options.getClientId()) {
          payload.needsLogin = true
          payload.loginPath = loginPath
        }
        res
          .status(httpStatus)
          .json(attachAzureDevOpsHelpPayload(payload, org, preferredProject, id, httpStatus, options))
        return
      }
      const body = result.body
      const f = body.fields || {}
      const teamProject =
        (typeof f['System.TeamProject'] === 'string' && f['System.TeamProject']) ||
        preferredProject ||
        ''
      const children = await buildWorkItemChildTree(org, teamProject, id, authorizationHeader)
      const node = workItemTreeNodeFromBody(body, org)
      node.children = children
      res.json(node)
    } catch (e) {
      res
        .status(502)
        .json(
          attachAzureDevOpsHelpPayload(
            { error: String(e.message || e) },
            org,
            preferredProject,
            id,
            502,
            options,
          ),
        )
    }
  })
}

module.exports = {
  mountAdoRoutes,
  ADO_PAT_HELP_URL,
}
