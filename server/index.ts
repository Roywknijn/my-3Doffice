import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type NextFunction, type Request, type Response } from 'express'
import { excludedFor, FolderError, listFolder, publicAgent, readFolderFile, resolveAgentFolders } from './folders.js'
import { API_VERSION } from './api-version.js'
import { interactionRecord, recordOfficeInteraction } from './office-interactions.js'
import { collectMemory } from './memory.js'
import { clearDataCaches, getActivity, getCalendar, getChannels, getCommandLog, getDashboard, getSkills, getLogs, getOffice, getSnapshot, getTaskBoard, getTaskDetail, getTranscript, testHermesConnection } from './my-office.js'
import { ConnectionConfigError, getConnectionConfig, hermesEnvironment, isRemoteConnection, updateConnectionConfig } from './connection-config.js'

const HOST = '127.0.0.1'
const PORT = Number(process.env.MY_OFFICE_PORT) || 7777
// The built UI sits next to the server: ../dist from server/*.ts (development, npm start)
// and ../../dist from build/server/*.js (the installed package).
const distDirectory = [new URL('../dist', import.meta.url), new URL('../../dist', import.meta.url)].map((url) => fileURLToPath(url)).find((path) => existsSync(join(path, 'index.html'))) ?? fileURLToPath(new URL('../dist', import.meta.url))

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '8kb' }))
app.use('/api', (_request, response, next) => {
  response.set('Cache-Control', 'no-store')
  next()
})

const startedAt = new Date().toISOString()
app.get('/api/health', (_request, response) => { response.json({ ok: true, apiVersion: API_VERSION, startedAt }) })
app.get('/api/settings/connection', (_request, response) => { response.json(getConnectionConfig()) })
app.post('/api/settings/connection', async (request, response) => {
  try {
    const connection = await updateConnectionConfig(request.body)
    clearDataCaches()
    response.json(connection)
  } catch (error) {
    const message = error instanceof ConnectionConfigError ? error.message : 'Could not save connection settings.'
    response.status(400).json({ error: message })
  }
})
app.post('/api/settings/connection/test', async (_request, response) => { response.json(await testHermesConnection()) })

// Local integration endpoint: visual events only, never executes a Hermes task.
// CLI callers have no Origin; browsers must be same-origin to prevent cross-site injection.
app.post('/api/office/interactions', async (request, response) => {
  const origin = request.get('origin')
  if ((origin && origin !== `${request.protocol}://${request.get('host')}`) || !request.is('application/json')) {
    response.status(403).json({ error: 'Use same-origin application/json.' }); return
  }
  const event = interactionRecord(request.body)
  if (!event) { response.status(400).json({ error: 'Invalid handoff. Supply from, to, optional id, label and durationSeconds (15–180).' }); return }
  const runtime = await getSnapshot()
  const ids = new Set(runtime.profiles.data.map((p) => p.name))
  if (!ids.has(event.from) || !ids.has(event.to)) { response.status(400).json({ error: 'Both participants must be known agents.' }); return }
  response.status(202).json(recordOfficeInteraction(event))
})

// `?fresh=1` (manual refresh) bypasses the 10s cache for anything older than 2s.
const FRESH_WINDOW_MS = 8_000
const routes: Record<string, (now: number) => Promise<unknown> | unknown> = {
  '/api/runtime': getSnapshot,
  '/api/dashboard': getDashboard,
  '/api/tasks': getTaskBoard,
  '/api/calendar': getCalendar,
  '/api/activity': getActivity,
  '/api/skills': getSkills,
  '/api/office': getOffice,
  '/api/channels': getChannels,
  '/api/logs': getLogs,
  '/api/command-log': () => getCommandLog(),
}
for (const [path, handler] of Object.entries(routes)) {
  app.get(path, async (request, response) => {
    const now = Date.now() + (request.query.fresh === '1' ? FRESH_WINDOW_MS : 0)
    response.json(await handler(now))
  })
}
app.get('/api/sessions/:id/transcript', async (request, response) => {
  const transcript = await getTranscript(String(request.params.id))
  if (!transcript) { response.status(404).json({ error: 'Unknown session.' }); return }
  response.json(transcript)
})
app.get('/api/tasks/:id', async (request, response) => {
  const board = typeof request.query.board === 'string' && request.query.board ? request.query.board : undefined
  const detail = await getTaskDetail(String(request.params.id), Date.now(), board)
  if (!detail) { response.status(404).json({ error: 'Unknown task.' }); return }
  response.json(detail)
})

// Folders: read-only view of each agent's own folder. Only agents the server resolved
// Every Hermes profile this machine reports can be opened.
async function agentFolders() {
  const runtime = await getSnapshot()
  if (isRemoteConnection()) return runtime.profiles.data.map((profile) => ({ profile: profile.name, label: profile.name, path: 'SSH connection', directory: '', available: false, reason: 'Folder and memory browsing are not available through an SSH connection.' }))
  return resolveAgentFolders(runtime.profiles.data.map((profile) => profile.name), { ...process.env, ...hermesEnvironment() })
}
async function openFolder(profile: string) {
  const folders = await agentFolders()
  const folder = folders.find((item) => item.profile === profile)
  if (!folder) throw new FolderError('Unknown agent.', 404)
  if (!folder.available) throw new FolderError(folder.reason ?? 'Folder not available.', 404)
  return { folder, excluded: excludedFor(folder, folders) }
}
function folderRoute(handler: (request: Request) => Promise<unknown>) {
  return async (request: Request, response: Response) => {
    try {
      response.json(await handler(request))
    } catch (error) {
      if (error instanceof FolderError) { response.status(error.status).json({ error: error.message }); return }
      throw error
    }
  }
}
app.get('/api/memory', folderRoute(async () => collectMemory(await agentFolders())))
app.get('/api/folders', folderRoute(async () => ({ agents: (await agentFolders()).map(publicAgent), fetchedAt: new Date().toISOString() })))
app.get('/api/folders/:profile/list', folderRoute(async (request) => {
  const { folder, excluded } = await openFolder(String(request.params.profile))
  return listFolder(folder, request.query.path, excluded)
}))
app.get('/api/folders/:profile/file', folderRoute(async (request) => {
  const { folder, excluded } = await openFolder(String(request.params.profile))
  return readFolderFile(folder, request.query.path, excluded)
}))

app.use('/api', (_request, response) => { response.status(404).json({ error: 'Not found' }) })

if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory))
  app.get(/^(?!\/api\/).*/, (_request, response) => { response.sendFile('index.html', { root: distDirectory }) })
}

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  void _next
  console.error('StoneBox SaaS AI+ERP request failed:', error instanceof Error ? error.message : error)
  response.status(500).json({ error: 'Internal error' })
})

app.listen(PORT, HOST, () => console.log(`StoneBox SaaS AI+ERP listening on http://${HOST}:${PORT}${existsSync(distDirectory) ? ' (serving built UI)' : ' (API only; run the Vite dev server for the UI)'}`))
