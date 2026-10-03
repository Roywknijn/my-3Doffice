import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { gatewayBusy, parseRuntimeState, RUNTIME_SCRIPT, visibleSubagents, type HermesRuntimeState } from './hermes-runtime.js'
import { buildOfficeSnapshot, collectHermesRuntime, withPlatforms } from './my-office.js'

const NOW = 1_790_000_000
const manifest = (id: string, tasks: object[], completed: string | null = null) => JSON.stringify({ delegation_id: id, started: '2026-10-03 10:00:00', task_count: tasks.length, model: null, provider: null, tasks, completed }, null, 2)
const output = [
  `@@NOW ${NOW}`,
  '@@ROOT /opt/data',
  '@@FILE /opt/data/gateway_state.json',
  '{"gateway_state":"running","active_agents":0}',
  '@@FILE /opt/data/profiles/coder/gateway_state.json',
  '{"gateway_state":"running","active_agents":2}',
  '@@FILE /opt/data/profiles/coder/cache/delegation/live/deleg_aa11/manifest.json',
  manifest('deleg_aa11', [{ index: 0, goal: 'Write docs', status: 'running' }, { index: 1, goal: 'Stalled', status: 'running' }]),
  `@@MTIME ${NOW - 5} /opt/data/profiles/coder/cache/delegation/live/deleg_aa11/manifest.json`,
  `@@MTIME ${NOW - 3} /opt/data/profiles/coder/cache/delegation/live/deleg_aa11/task-0.log`,
  `@@MTIME ${NOW - 1200} /opt/data/profiles/coder/cache/delegation/live/deleg_aa11/task-1.log`,
  '@@FILE /opt/data/cache/delegation/live/deleg_bb22/manifest.json',
  manifest('deleg_bb22', [{ index: 0, goal: 'Done', status: 'completed' }], '2026-10-03 10:05:00'),
  `@@MTIME ${NOW - 20} /opt/data/cache/delegation/live/deleg_bb22/manifest.json`,
  '',
].join('\n')

describe('Hermes runtime files', () => {
  it('parses gateway state and delegation manifests per profile home', () => {
    const state = parseRuntimeState(output)
    expect(state.gateways).toEqual([
      { profile: 'default', state: 'running', activeAgents: 0, platforms: [] },
      { profile: 'coder', state: 'running', activeAgents: 2, platforms: [] },
    ])
    expect(state.delegations).toEqual([
      { owner: 'coder', id: 'deleg_aa11', completed: false, manifestAgeSeconds: 5, tasks: [{ index: 0, status: 'running', goal: 'Write docs', logAgeSeconds: 3 }, { index: 1, status: 'running', goal: 'Stalled', logAgeSeconds: 1200 }] },
      { owner: 'default', id: 'deleg_bb22', completed: true, manifestAgeSeconds: 20, tasks: [{ index: 0, status: 'completed', goal: 'Done' }] },
    ])
    expect(gatewayBusy(state, 'coder')).toBe(true)
    expect(gatewayBusy(state, 'default')).toBe(false)
  })

  it('rejects output that is not from the runtime script', () => {
    expect(() => parseRuntimeState('sh: 1: syntax error')).toThrow(/Unrecognized/)
  })

  it('shows live and just-finished subagents, never stalled or historical ones', () => {
    const state = parseRuntimeState(output)
    expect(visibleSubagents(state)).toEqual([
      { id: 'coder/deleg_aa11/0', owner: 'coder', delegation: 'deleg_aa11', index: 0, goal: 'Write docs', status: 'working' },
      { id: 'default/deleg_bb22/0', owner: 'default', delegation: 'deleg_bb22', index: 0, goal: 'Done', status: 'finished', outcome: 'completed' },
    ])
    const old: HermesRuntimeState = { gateways: [], delegations: [{ ...state.delegations[1], manifestAgeSeconds: 600 }] }
    expect(visibleSubagents(old)).toEqual([])
    const noLog: HermesRuntimeState = { gateways: [], delegations: [{ owner: 'coder', id: 'deleg_cc33', completed: false, tasks: [{ index: 0, status: 'running' }] }] }
    expect(visibleSubagents(noLog)).toEqual([])
  })

  it('does not trust active_agents from a gateway that is not running', () => {
    expect(gatewayBusy({ gateways: [{ profile: 'coder', state: 'stopped', activeAgents: 3, platforms: [] }], delegations: [] }, 'coder')).toBe(false)
  })
})

describe('runtime script', () => {
  const root = mkdtempSync(join(tmpdir(), 'mycompany-runtime-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const live = join(root, 'profiles', 'coder', 'cache', 'delegation', 'live')
  mkdirSync(join(live, 'deleg_new1'), { recursive: true })
  mkdirSync(join(live, 'deleg_old1'), { recursive: true })
  writeFileSync(join(root, 'profiles', 'coder', 'gateway_state.json'), '{"gateway_state":"running","active_agents":1}')
  writeFileSync(join(live, 'deleg_new1', 'manifest.json'), manifest('deleg_new1', [{ index: 0, goal: "It's \"quoted\" $HOME", status: 'running' }]))
  writeFileSync(join(live, 'deleg_new1', 'task-0.log'), 'started\n')
  writeFileSync(join(live, 'deleg_old1', 'manifest.json'), manifest('deleg_old1', [{ index: 0, goal: 'Old', status: 'completed' }], '2026-09-01 10:00:00'))
  const hourAgo = new Date(Date.now() - 3_600_000)
  utimesSync(join(live, 'deleg_old1', 'manifest.json'), hourAgo, hourAgo)
  const env = { ...process.env, MY_OFFICE_HERMES_ROOT: root }

  it('reads gateway state and only recently touched delegations', () => {
    const state = parseRuntimeState(execFileSync('sh', ['-c', RUNTIME_SCRIPT, 'sh'], { env, encoding: 'utf8' }))
    expect(state.gateways).toEqual([{ profile: 'coder', state: 'running', activeAgents: 1, platforms: [] }])
    expect(state.delegations.map((delegation) => delegation.id)).toEqual(['deleg_new1'])
    expect(visibleSubagents(state)).toMatchObject([{ id: 'coder/deleg_new1/0', status: 'working', goal: "It's \"quoted\" $HOME" }])
  })

  it('survives the quoting SSH applies to a remote command line', () => {
    const quoted = `'${RUNTIME_SCRIPT.replace(/'/g, `'\\''`)}'`
    const state = parseRuntimeState(execFileSync('sh', ['-c', `sh -c ${quoted} sh`], { env, encoding: 'utf8' }))
    expect(state.delegations.map((delegation) => delegation.id)).toEqual(['deleg_new1'])
  })
})

describe('office state from runtime files', () => {
  const fetchedAt = '2026-10-03T10:00:00.000Z'
  const runtime = { profiles: { availability: 'available' as const, data: [{ name: 'default', model: 'm', gateway: 'Running' as const }, { name: 'coder', model: 'm', gateway: 'Running' as const }] }, fetchedAt }
  const board = { tasks: { availability: 'available' as const, data: [] }, fetchedAt }
  const activity = { sessions: { availability: 'available' as const, data: [] }, fetchedAt }

  it('marks busy gateways and delegating owners Working, and lists their subagents', async () => {
    const hermesRuntime = await collectHermesRuntime(async () => output.replace('Write docs', 'Use api_key=sk-abcdefghijklmnop'))
    const office = buildOfficeSnapshot(runtime, board, activity, { now: fetchedAt, hermesRuntime: { ...hermesRuntime, fetchedAt } })
    expect(office.stations.map((station) => [station.id, station.state, station.activity])).toEqual([
      ['default', 'Idle', 'On a break'],
      ['coder', 'Working', 'Delegating to 1 subagent'],
    ])
    expect(office.subagents?.map((subagent) => [subagent.id, subagent.status])).toEqual([['coder/deleg_aa11/0', 'working'], ['default/deleg_bb22/0', 'finished']])
    expect(office.subagents?.[0].goal).toBe('Use api_key=[redacted]')
    expect(office.stations[1].provenance).toContain('gateway runtime (gateway_state.json, delegation manifests): busy, 1 running subagent')
  })

  it('reports a busy gateway without subagents as handling a request', async () => {
    const hermesRuntime = await collectHermesRuntime(async () => `@@NOW ${NOW}\n@@ROOT /opt/data\n@@FILE /opt/data/gateway_state.json\n{"gateway_state":"running","active_agents":1}\n`)
    const office = buildOfficeSnapshot(runtime, board, activity, { now: fetchedAt, hermesRuntime: { ...hermesRuntime, fetchedAt } })
    expect(office.stations[0]).toMatchObject({ state: 'Working', activity: 'Handling a gateway request' })
    expect(office.subagents).toEqual([])
  })

  it('leaves subagents unknown when the runtime read fails or is stale', async () => {
    const failed = await collectHermesRuntime(async () => { throw new Error('denied') })
    expect(failed.state.availability).toBe('unavailable')
    const office = buildOfficeSnapshot(runtime, board, activity, { now: fetchedAt, hermesRuntime: { ...failed, fetchedAt } })
    expect(office.subagents).toBeUndefined()
    expect(office.stations[1].provenance).toContain('gateway runtime (gateway_state.json, delegation manifests): unavailable')
    const stale = buildOfficeSnapshot(runtime, board, activity, { now: fetchedAt, hermesRuntime: { state: { availability: 'available', data: parseRuntimeState(output) }, fetchedAt: '2026-10-03T09:00:00.000Z' } })
    expect(stale.subagents).toBeUndefined()
    expect(stale.stations[1].state).toBe('Idle')
  })
})

describe('gateway platforms', () => {
  const state = `@@NOW ${NOW}\n@@ROOT /opt/data\n@@FILE /opt/data/gateway_state.json\n${JSON.stringify({ gateway_state: 'running', active_agents: 0, platforms: {
    telegram: { state: 'fatal', error_code: 'auth', error_message: 'Unauthorized token=123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', updated_at: '2026-10-03T10:00:00+00:00' },
    api_server: { state: 'connected', error_code: null, error_message: null },
  } })}\n@@FILE /opt/data/profiles/coder/gateway_state.json\n${JSON.stringify({ gateway_state: 'stopped', platforms: { discord: { state: 'retrying' } } })}\n`
  const channels = { channels: { availability: 'available' as const, data: [] }, fetchedAt: '2026-10-03T10:00:00.000Z' }
  const profiles = (coder: 'Running' | 'Stopped') => ({ profiles: { availability: 'available' as const, data: [{ name: 'default', model: 'm', gateway: 'Running' as const }, { name: 'coder', model: 'm', gateway: coder }] }, fetchedAt: channels.fetchedAt })

  it('parses each platform with its error', () => {
    expect(parseRuntimeState(state).gateways[0].platforms).toEqual([
      { name: 'api_server', state: 'connected' },
      { name: 'telegram', state: 'fatal', errorCode: 'auth', errorMessage: 'Unauthorized token=123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', updatedAt: '2026-10-03T10:00:00+00:00' },
    ])
  })

  it('reports only running gateways, flags problems and redacts errors', () => {
    const hermesRuntime = { state: { availability: 'available' as const, data: parseRuntimeState(state) }, fetchedAt: channels.fetchedAt }
    const result = withPlatforms(channels, profiles('Running'), hermesRuntime)
    expect(result.platforms).toEqual([
      { profile: 'default', name: 'api_server', state: 'connected', problem: false },
      { profile: 'default', name: 'telegram', state: 'fatal', problem: true, error: 'auth: Unauthorized token=[redacted]', updatedAt: '2026-10-03T10:00:00+00:00' },
    ])
    expect(withPlatforms(channels, profiles('Running'), { state: { availability: 'unavailable', data: { gateways: [], delegations: [] } }, fetchedAt: channels.fetchedAt }).platforms).toBeUndefined()
  })
})
