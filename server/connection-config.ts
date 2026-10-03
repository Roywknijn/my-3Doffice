import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'

export interface ConnectionConfig {
  mode: 'local' | 'ssh'
  hermesCommand: string
  hermesHome?: string
  sshHost?: string
  sshUser?: string
  sshPort?: number
  sshIdentityFile?: string
  dockerContainer?: string
}

export class ConnectionConfigError extends Error {}

const CONFIG_FILE = resolve(homedir(), '.config', 'mycompany', 'connection.json')
const defaults: ConnectionConfig = {
  mode: 'local',
  hermesCommand: process.env.HERMES_COMMAND?.trim() || 'hermes',
  ...(process.env.HERMES_HOME?.trim() ? { hermesHome: process.env.HERMES_HOME.trim() } : {}),
}
let current = loadStoredConfig()

export function getConnectionConfig(): ConnectionConfig { return { ...current } }

export function isRemoteConnection(): boolean { return current.mode === 'ssh' }

function validCommand(value: unknown): string {
  if (typeof value !== 'string') throw new ConnectionConfigError('Hermes executable is required.')
  const command = value.trim()
  if (!command || command.length > 1024) throw new ConnectionConfigError('Hermes executable is required.')
  if (command === 'hermes') return command
  if (!isAbsolute(command) || basename(command) !== 'hermes') throw new ConnectionConfigError('Use "hermes" or an absolute path ending in "/hermes".')
  return command
}

function validHome(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !isAbsolute(value.trim()) || value.trim().length > 4096) throw new ConnectionConfigError('Hermes data directory must be an absolute path.')
  return resolve(value.trim())
}

function validSshHost(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(value.trim())) throw new ConnectionConfigError('SSH host must be a hostname or IPv4 address.')
  return value.trim()
}

function validSshUser(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z_][a-z0-9_-]{0,31}$/i.test(value.trim())) throw new ConnectionConfigError('SSH user contains unsupported characters.')
  return value.trim()
}

function validSshPort(value: unknown): number {
  const port = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConnectionConfigError('SSH port must be between 1 and 65535.')
  return port
}

function validIdentityFile(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !isAbsolute(value.trim()) || value.trim().length > 4096) throw new ConnectionConfigError('SSH identity file must be an absolute path.')
  return resolve(value.trim())
}

function validDockerContainer(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value.trim())) throw new ConnectionConfigError('Docker container name contains unsupported characters.')
  return value.trim()
}

function loadStoredConfig(): ConnectionConfig {
  try {
    const values = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Record<string, unknown>
    const hermesHome = validHome(values.hermesHome)
    const mode = values.mode === 'ssh' ? 'ssh' : 'local'
    if (mode === 'ssh') return sshConfig(values, hermesHome)
    const dockerContainer = validDockerContainer(values.dockerContainer)
    return { mode, hermesCommand: validCommand(values.hermesCommand), ...(hermesHome ? { hermesHome } : {}), ...(dockerContainer ? { dockerContainer } : {}) }
  } catch {
    return defaults
  }
}

export async function updateConnectionConfig(input: unknown): Promise<ConnectionConfig> {
  if (!input || typeof input !== 'object') throw new ConnectionConfigError('Invalid connection settings.')
  const values = input as Record<string, unknown>
  const hermesHome = validHome(values.hermesHome)
  const mode = values.mode === 'ssh' ? 'ssh' : values.mode === 'local' || values.mode === undefined ? 'local' : undefined
  if (!mode) throw new ConnectionConfigError('Connection mode must be local or SSH.')
  const identityFile = mode === 'ssh' ? validIdentityFile(values.sshIdentityFile) : undefined
  const dockerContainer = validDockerContainer(values.dockerContainer)
  const next: ConnectionConfig = mode === 'ssh'
    ? sshConfig(values, hermesHome, identityFile)
    : { mode, hermesCommand: validCommand(values.hermesCommand), ...(hermesHome ? { hermesHome } : {}), ...(dockerContainer ? { dockerContainer } : {}) }
  const temporary = `${CONFIG_FILE}.tmp`
  await mkdir(dirname(CONFIG_FILE), { recursive: true, mode: 0o700 })
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, CONFIG_FILE)
  current = next
  return getConnectionConfig()
}

function sshConfig(values: Record<string, unknown>, hermesHome: string | undefined, identityFile = validIdentityFile(values.sshIdentityFile)): ConnectionConfig {
  const hermesCommand = validCommand(values.hermesCommand)
  const dockerContainer = validDockerContainer(values.dockerContainer)
  if (!/^(hermes|\/[A-Za-z0-9._/-]*\/hermes)$/.test(hermesCommand)) throw new ConnectionConfigError('Remote Hermes executable may contain only letters, numbers, dots, dashes, underscores and slashes.')
  if (hermesHome && !/^\/[A-Za-z0-9._/-]+$/.test(hermesHome)) throw new ConnectionConfigError('Remote Hermes data directory contains unsupported characters.')
  return { mode: 'ssh', hermesCommand, ...(hermesHome ? { hermesHome } : {}), sshHost: validSshHost(values.sshHost), sshUser: validSshUser(values.sshUser), sshPort: validSshPort(values.sshPort), ...(identityFile ? { sshIdentityFile: identityFile } : {}), ...(dockerContainer ? { dockerContainer } : {}) }
}

export function hermesEnvironment(): NodeJS.ProcessEnv {
  return current.mode === 'local' && !current.dockerContainer && current.hermesHome ? { HERMES_HOME: current.hermesHome } : {}
}

/** Converts a fixed Hermes CLI read into an SSH invocation. Arguments come only from validated server routes. */
export function hermesInvocation(args: string[]): { file: string; args: string[]; label: string } {
  return invocation(current.hermesCommand, args, args.join(' '))
}

/** Single-quotes one word for the remote shell that SSH hands its command line to. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Runs one of the server's own fixed, read-only `sh` scripts where Hermes lives (this machine,
 * its Docker container, or the VPS). Never pass anything derived from a request as `script`.
 */
export function hermesShellInvocation(script: string, label: string): { file: string; args: string[]; label: string } {
  return invocation('sh', ['-c', current.mode === 'ssh' ? shellQuote(script) : script, 'sh'], `-c <${label}>`)
}

function invocation(command: string, args: string[], shown: string): { file: string; args: string[]; label: string } {
  if (current.mode === 'local') {
    if (!current.dockerContainer) return { file: command, args, label: `${command} ${shown}` }
    const dockerArgs = ['exec', ...(current.hermesHome ? ['-e', `HERMES_HOME=${current.hermesHome}`] : []), current.dockerContainer, command, ...args]
    return { file: 'docker', args: dockerArgs, label: `docker ${dockerArgs.slice(0, dockerArgs.length - args.length).join(' ')} ${shown}` }
  }
  const remote = current.dockerContainer
    ? ['docker', 'exec', ...(current.hermesHome ? ['-e', `HERMES_HOME=${current.hermesHome}`] : []), current.dockerContainer, command, ...args]
    : [...(current.hermesHome ? [`HERMES_HOME=${current.hermesHome}`] : []), command, ...args]
  const remoteLabel = [...remote.slice(0, remote.length - args.length), shown].join(' ')
  // A dashboard refresh can issue several fixed reads. Reuse one authenticated SSH transport
  // so the VPS is not asked to establish many connections at once.
  // Unix sockets are limited to ~104 bytes and macOS tmpdir() alone uses ~50, so prefer /tmp.
  const controlPath = resolve(process.platform === 'win32' ? tmpdir() : '/tmp', 'mycompany-ssh-%C')
  const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'ControlMaster=auto', '-o', 'ControlPersist=60', '-o', `ControlPath=${controlPath}`, '-p', String(current.sshPort), ...(current.sshIdentityFile ? ['-i', current.sshIdentityFile] : []), `${current.sshUser}@${current.sshHost}`, ...remote]
  return { file: 'ssh', args: sshArgs, label: `ssh ${current.sshUser}@${current.sshHost} ${remoteLabel}` }
}
