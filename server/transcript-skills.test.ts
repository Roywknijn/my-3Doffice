import { describe, expect, it } from 'vitest'
import { collectSkills, collectTranscript, parseTranscript } from './my-office.js'

const exported = (messages: object[], extra: object = {}) => JSON.stringify({ id: 's_123456', title: 'Fix login', model: 'm1', source: 'cli', system_prompt: 'SECRET SYSTEM PROMPT', started_at: 1790000000, ended_at: 1790000060, end_reason: 'cli_close', message_count: messages.length, tool_call_count: 1, input_tokens: 10, output_tokens: 5, estimated_cost_usd: 0.01, messages, ...extra })

describe('session transcripts', () => {
  it('keeps user, agent and tool messages, drops the system prompt and reasoning, and redacts', () => {
    const transcript = parseTranscript(`${exported([
      { role: 'system', content: 'You are…' },
      { role: 'user', content: 'deploy with api_key=sk-abcdefghijklmnopqrst', timestamp: 1790000001 },
      { role: 'assistant', content: '', reasoning_content: 'private thoughts', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'terminal', arguments: '{"command": "ls"}' } }] },
      { role: 'tool', content: 'file.txt', tool_name: 'terminal' },
      { role: 'assistant', content: '   ' },
      { role: 'assistant', content: 'Done.' },
    ])}\n`)
    expect(transcript).toMatchObject({ id: 's_123456', title: 'Fix login', model: 'm1', endReason: 'cli_close', toolCallCount: 1, estimatedCostUsd: 0.01, omitted: 0 })
    expect(transcript?.messages).toEqual([
      { role: 'user', text: 'deploy with api_key=[redacted]', at: new Date(1790000001000).toISOString() },
      { role: 'assistant', text: '', tools: [{ name: 'terminal', args: '{"command": "ls"}' }] },
      { role: 'tool', text: 'file.txt', toolName: 'terminal' },
      { role: 'assistant', text: 'Done.' },
    ])
    expect(JSON.stringify(transcript)).not.toMatch(/SECRET SYSTEM PROMPT|private thoughts/)
  })

  it('cuts long texts and keeps only the most recent messages', () => {
    const many = Array.from({ length: 305 }, (_, index) => ({ role: 'user', content: `m${index}` }))
    const transcript = parseTranscript(exported([...many, { role: 'tool', content: 'x'.repeat(5000), tool_name: 'read' }]))
    expect(transcript?.omitted).toBe(6)
    expect(transcript?.messages[0].text).toBe('m6')
    expect(transcript?.messages.at(-1)).toMatchObject({ role: 'tool', truncated: true })
    expect(transcript?.messages.at(-1)?.text.length).toBeLessThanOrEqual(3001)
  })

  it('returns null for a missing session and rejects other output', () => {
    expect(parseTranscript("Session 'nope' not found.\n")).toBeNull()
    expect(() => parseTranscript('Traceback (most recent call last):')).toThrow(/Unrecognized/)
  })

  it('runs only the fixed export command and refuses option-like ids', async () => {
    const calls: string[][] = []
    const snapshot = await collectTranscript('s_123456', async (file, args) => { calls.push([file, ...args]); return exported([]) })
    expect(calls).toEqual([['hermes', 'sessions', 'export', '--format', 'jsonl', '--session-id', 's_123456', '--redact', '-']])
    expect(snapshot.transcript).toMatchObject({ availability: 'available', data: { id: 's_123456', messages: [] } })
    await expect(collectTranscript('--upload')).rejects.toThrow(/Invalid session id/)
  })
})

describe('skills per profile', () => {
  const table = (...names: string[]) => `┏━━━━━━┳━━━━━━━━━━┳━━━━━━━━━┳━━━━━━━━━┳━━━━━━━━━┓\n┃ Name ┃ Category ┃ Source  ┃ Trust   ┃ Status  ┃\n┡━━━━━━╇━━━━━━━━━━╇━━━━━━━━━╇━━━━━━━━━╇━━━━━━━━━┩\n${names.map((name) => `│ ${name} │ dev │ builtin │ builtin │ enabled │`).join('\n')}\n└──────┴──────────┴─────────┴─────────┴─────────┘\n`
  const profiles = ' Profile    Model       Gateway\n ───────\n ◆default  m    running\n  coder  m  stopped\n  writer  m  stopped\n'

  it('merges every profile and records which agents have each skill', async () => {
    const skills = await collectSkills(async (_file, args) => {
      const command = args.join(' ')
      if (command === 'profile list') return profiles
      if (command === '-p default skills list --enabled-only') return table('maps', 'git')
      if (command === '-p coder skills list --enabled-only') return table('git')
      throw new Error('denied')
    })
    expect(skills.skills.data).toEqual([
      { name: 'git', category: 'dev', source: 'builtin', trust: 'builtin', status: 'enabled', agents: ['default', 'coder'] },
      { name: 'maps', category: 'dev', source: 'builtin', trust: 'builtin', status: 'enabled', agents: ['default'] },
    ])
    expect(skills.failedProfiles).toEqual(['writer'])
  })

  it('falls back to the active profile when the profile list is unavailable', async () => {
    const skills = await collectSkills(async (_file, args) => args[0] === 'profile' ? 'starting' : table('maps'))
    expect(skills.skills.data.map((skill) => [skill.name, skill.agents])).toEqual([['maps', undefined]])
  })
})
