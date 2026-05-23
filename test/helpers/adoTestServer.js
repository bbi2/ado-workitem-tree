'use strict'

const express = require('express')
const http = require('http')
const { mountAdoRoutes } = require('../../server/mountAdoRoutes')

function createAdoTestApp() {
  const app = express()
  mountAdoRoutes(app, {
    getAdoOrg: () => 'slb1-swt',
    getAdoProject: () => 'drillops-reporting',
    resolveAdoOrg: (value) => (value && String(value).trim()) || 'slb1-swt',
    getClientId: () => null,
    getAuthorizationHeader: async () => {
      const pat = process.env.ADO_PAT && String(process.env.ADO_PAT).trim()
      if (!pat) return null
      return `Basic ${Buffer.from(`:${pat}`, 'utf8').toString('base64')}`
    },
  })
  return app
}

function createTestContext() {
  const app = createAdoTestApp()
  const server = http.createServer(app)
  return { app, server }
}

async function startServer(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return `http://127.0.0.1:${port}`
}

async function stopServer(server) {
  if (!server.listening) return
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

async function apiFetch(baseUrl, method, urlPath, body) {
  const url = new URL(urlPath, baseUrl)
  const payload = body != null ? JSON.stringify(body) : null
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers:
          payload != null
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : undefined,
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json = null
          if (text) {
            try {
              json = JSON.parse(text)
            } catch {
              json = text
            }
          }
          resolve({ status: res.statusCode ?? 0, body: json })
        })
      },
    )
    req.on('error', reject)
    if (payload != null) req.write(payload)
    req.end()
  })
}

module.exports = {
  createAdoTestApp,
  createTestContext,
  startServer,
  stopServer,
  apiFetch,
}
