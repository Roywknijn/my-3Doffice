export type Availability = 'available' | 'unavailable'
export type GatewayState = 'Running' | 'Stopped' | 'Unknown'
export interface Source<T> { availability: Availability; data: T; error?: { code: string; message: string } }
export interface RuntimeSnapshot {
  /** Every Hermes profile is an agent; `gateway` comes from `hermes profile list`. */
  profiles: Source<{ name: string; model: string; gateway: GatewayState }[]>
  fetchedAt: string
}
export interface Task { title: string; status: string; id?: string; assignee?: string; priority?: number; board?: string }
export interface KanbanBoard { slug: string; name: string; current: boolean; total: number }
/** `agent` is the Hermes profile the job belongs to (cron jobs are stored per profile). */
export interface ScheduledJob { name: string; schedule: string; id?: string; nextRun?: string; overdue?: boolean; status?: string; repeat?: string; lastRun?: string; lastRunOk?: boolean; agent?: string }
export interface Session { title: string; preview: string; lastActive: string; id?: string; workspace?: string; source?: string; actor?: string; active?: boolean }
export interface Skill { name: string; category: string; source: string; trust: string; status: 'enabled'; agents?: string[] }
export interface TaskBoardSnapshot { tasks: Source<Task[]>; boards?: KanbanBoard[]; failedBoards?: string[]; fetchedAt: string }
/** `failedProfiles` lists profiles whose cron list could not be read while others could. */
export interface CalendarSnapshot { jobs: Source<ScheduledJob[]>; failedProfiles?: string[]; fetchedAt: string }
export interface ActivitySnapshot { sessions: Source<Session[]>; fetchedAt: string }
export interface SkillsSnapshot { skills: Source<Skill[]>; failedProfiles?: string[]; fetchedAt: string }
export interface Channel { name: string; status: 'Configured' | 'Connected' }
/** A messaging platform of one profile's running gateway (gateway_state.json). */
export interface ChannelPlatform { profile: string; name: string; state: string; problem: boolean; error?: string; updatedAt?: string }
/** `platforms` is absent when the gateway runtime files could not be read. */
export interface ChannelSnapshot { channels: Source<Channel[]>; activeSessions?: number; platforms?: ChannelPlatform[]; fetchedAt: string }
export type OfficeState = 'Idle' | 'Working' | 'Reviewing' | 'Collaborating' | 'Offline' | 'Unknown'
export type OfficeRoom = 'Workspace' | 'Lounge'
export interface OfficeStation {
  /** Agent id is the Hermes profile name and the key for its folder and memory. */
  id: string
  name: string
  role: string
  room: OfficeRoom
  roomPosition: string
  state: OfficeState
  currentTask: string
  recentActivity: string
  activity: string
  seat: number
  provenance: string
  freshness: string
}
export interface OfficeSummary { declared: number; active: number; idle: number; offline: number; unknown: number; gatewaysReachable: number; gatewaysDeclared: number }
export interface OfficeInteraction { id: string; from: string; to: string; label: string; startedAt: string; expiresAt: string }
/** A Hermes delegate_task subagent, read from its owner's delegation manifest. */
export interface OfficeSubagent { id: string; owner: string; delegation: string; index: number; status: 'working' | 'finished'; outcome?: string; goal?: string }
/** `subagents` is absent when Hermes runtime files could not be read (unknown, not "none"). */
export interface OfficeSnapshot { stations: OfficeStation[]; interactions?: OfficeInteraction[]; subagents?: OfficeSubagent[]; summary: OfficeSummary; fetchedAt: string }
export interface UsageInsights {
  days: number
  sessions: number
  messages: number
  toolCalls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost?: string
  models: { model: string; sessions: number; tokens: number }[]
  tools: { tool: string; calls: number }[]
}
export interface CountSource { availability: Availability; total: number }
export interface CommandHealth { total: number; failed: number; averageMs: number }
export interface DashboardSnapshot {
  runtime: RuntimeSnapshot
  tasks: CountSource & { byStatus: Record<string, number>; assigned: number }
  calendar: CountSource & { active: number; paused: number; nextRun?: string }
  activity: CountSource & { latest?: Session }
  skills: CountSource & { byCategory: Record<string, number> }
  channels: CountSource & { connected: number; activeSessions?: number; platformProblems?: number }
  office: OfficeSummary
  usage: Source<UsageInsights | null>
  commands: CommandHealth
  fetchedAt: string
}
export interface CommandLogEntry { command: string; ok: boolean; durationMs: number; at: string; error?: string }
export interface CommandLogSnapshot { entries: CommandLogEntry[]; health: CommandHealth; fetchedAt: string }
export type LogLevel = 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG' | 'OTHER'
export interface LogLine { text: string; level: LogLevel }
export interface LogFile { name: string; label: string; source: Source<LogLine[]> }
export interface LogsSnapshot { files: LogFile[]; fetchedAt: string }
export interface ConnectionConfig { mode: 'local' | 'ssh'; hermesCommand: string; hermesHome?: string; sshHost?: string; sshUser?: string; sshPort?: number; sshIdentityFile?: string; dockerContainer?: string }
export interface ConnectionTest { connected: boolean; version?: string; error?: string }
export interface FolderAgent { profile: string; label: string; available: boolean; path: string; reason?: string; warning?: string }
export interface FolderAgentsSnapshot { agents: FolderAgent[]; fetchedAt: string }
export interface FolderEntry { name: string; path: string; type: 'dir' | 'file'; size: number; modified: string; sensitive: boolean; unreadable?: boolean }
export interface FolderListing { profile: string; path: string; entries: FolderEntry[]; truncated: boolean; hiddenCount: number }
export interface FolderFile { profile: string; path: string; size: number; modified: string; kind: 'text' | 'binary' | 'sensitive' | 'too-large'; content?: string; truncated?: boolean; redactions?: number }
export interface TaskDetail {
  id: string
  title: string
  status: string
  assignee?: string
  priority?: number
  tenant?: string
  workspace?: string
  branch?: string
  skills: string[]
  model?: string
  createdAt?: string
  createdBy?: string
  startedAt?: string
  completedAt?: string
  body?: string
  result?: string
  lastError?: string
  parents: string[]
  children: string[]
  comments: { author: string; body: string; createdAt?: string }[]
  events: { kind: string; detail?: string; createdAt?: string; runId?: string }[]
  runs: { id: string; profile?: string; status?: string; outcome?: string; summary?: string; error?: string; startedAt?: string; endedAt?: string }[]
}
export interface TranscriptMessage { role: 'user' | 'assistant' | 'tool'; text: string; truncated?: boolean; tools?: { name: string; args?: string }[]; toolName?: string; at?: string }
export interface Transcript { id: string; title?: string; model?: string; source?: string; startedAt?: string; endedAt?: string; endReason?: string; messageCount?: number; toolCallCount?: number; inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number; omitted: number; messages: TranscriptMessage[] }
export interface TranscriptSnapshot { transcript: Source<Transcript | null>; fetchedAt: string }
export interface TaskDetailSnapshot { task: Source<TaskDetail | null>; fetchedAt: string }
export interface MemoryDocument { name: string; path: string; exists: boolean; size?: number; modified?: string; chars?: number; content?: string; truncated?: boolean; redactions?: number; error?: string }
export interface MemoryStore extends MemoryDocument { entries: string[]; limit: number; used: number; percent: number }
export interface MemorySettings { memoryEnabled: boolean; userProfileEnabled: boolean; writeApproval: boolean; provider?: string; memoryLimit: number; userLimit: number; source: 'config.yaml' | 'defaults' }
export interface AgentMemory { profile: string; label: string; path: string; kind: 'hermes'; available: boolean; reason?: string; soul?: MemoryDocument; memory?: MemoryStore; user?: MemoryStore; contextFiles: MemoryDocument[]; settings?: MemorySettings }
export interface MemorySnapshot { agents: AgentMemory[]; fetchedAt: string }
