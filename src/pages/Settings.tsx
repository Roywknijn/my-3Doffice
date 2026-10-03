import { useEffect, useState } from 'react'
import type { ConnectionConfig, ConnectionTest } from '../types.ts'
import { LoadingState, PageTitle } from '../ui.tsx'

type Status = { tone: 'good' | 'bad'; message: string } | undefined

function Command({ children }: { children: string }) {
  return <pre className="settings-command"><code>{children}</code></pre>
}

/** How to find the value for "Hermes data directory" (HERMES_HOME) for each kind of install. */
function DirectoryHelp({ mode, container, host, user }: { mode: 'local' | 'ssh'; container: string; host: string; user: string }) {
  const remote = (command: string) => mode === 'ssh' ? `ssh ${user}@${host} '${command}'` : command
  return <details className="settings-help">
    <summary>How do I find the Hermes data directory?</summary>
    <p>The data directory is where Hermes keeps <code>config.yaml</code>, profiles, sessions and logs (<code>HERMES_HOME</code>). Leave the field empty when Hermes uses its default <code>~/.hermes</code> {mode === 'ssh' ? 'for the SSH user' : 'for the OS user that runs MyCompany'}.</p>
    <h3>Hermes installed directly on the {mode === 'ssh' ? 'VPS' : 'host'}</h3>
    <p>Ask Hermes where its config file is; the data directory is the folder that contains it.</p>
    <Command>{remote('hermes config path')}</Command>
    <p>Example output <code>/home/{mode === 'ssh' ? user : 'me'}/.hermes/config.yaml</code> → enter <code>/home/{mode === 'ssh' ? user : 'me'}/.hermes</code>. Leave <b>Docker container</b> empty.</p>
    <h3>Hermes in Docker{mode === 'ssh' ? ' on the VPS' : ''}</h3>
    <p>Fill <b>Docker container</b> with the container name ({mode === 'ssh' ? 'on the VPS: ' : ''}<code>docker ps --format {'{{.Names}}'}</code>), then ask Hermes inside the container:</p>
    <Command>{remote(`docker exec ${container} hermes config path`)}</Command>
    <p>Example output <code>/opt/data/config.yaml</code> → enter <code>/opt/data</code>. Use the path <b>inside</b> the container, not the host folder it is mounted from. If the command is not found, read the variable directly:</p>
    <Command>{remote(`docker exec ${container} printenv HERMES_HOME`)}</Command>
    <p className="muted">No output means the container uses the default; leave the field empty.{mode === 'local' ? ' Folder and Memory pages read the host side of the mount, which you can see with:' : ''}</p>
    {mode === 'local' && <Command>{`docker inspect ${container} --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'`}</Command>}
  </details>
}

export function Settings() {
  const [settings, setSettings] = useState<ConnectionConfig>()
  const [hermesCommand, setHermesCommand] = useState('hermes')
  const [hermesHome, setHermesHome] = useState('')
  const [mode, setMode] = useState<'local' | 'ssh'>('local')
  const [sshHost, setSshHost] = useState('')
  const [sshUser, setSshUser] = useState('')
  const [sshPort, setSshPort] = useState('22')
  const [sshIdentityFile, setSshIdentityFile] = useState('')
  const [dockerContainer, setDockerContainer] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<Status>()

  useEffect(() => {
    void fetch('/api/settings/connection').then(async (response) => {
      if (!response.ok) throw new Error('Could not load connection settings.')
      return response.json() as Promise<ConnectionConfig>
    }).then((value) => { setSettings(value); setMode(value.mode); setHermesCommand(value.hermesCommand); setHermesHome(value.hermesHome ?? ''); setSshHost(value.sshHost ?? ''); setSshUser(value.sshUser ?? ''); setSshPort(String(value.sshPort ?? 22)); setSshIdentityFile(value.sshIdentityFile ?? ''); setDockerContainer(value.dockerContainer ?? '') }).catch((error: unknown) => setStatus({ tone: 'bad', message: error instanceof Error ? error.message : 'Could not load connection settings.' }))
  }, [])

  const save = async () => {
    setSaving(true); setStatus(undefined)
    try {
      const response = await fetch('/api/settings/connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, hermesCommand, hermesHome, sshHost, sshUser, sshPort, sshIdentityFile, dockerContainer }) })
      const body = await response.json() as ConnectionConfig & { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Could not save connection settings.')
      setSettings(body); setMode(body.mode); setHermesCommand(body.hermesCommand); setHermesHome(body.hermesHome ?? ''); setSshHost(body.sshHost ?? ''); setSshUser(body.sshUser ?? ''); setSshPort(String(body.sshPort ?? 22)); setSshIdentityFile(body.sshIdentityFile ?? ''); setDockerContainer(body.dockerContainer ?? '')
      setStatus({ tone: 'good', message: 'Connection settings saved. Data will refresh with this Hermes installation.' })
    } catch (error) { setStatus({ tone: 'bad', message: error instanceof Error ? error.message : 'Could not save connection settings.' }) } finally { setSaving(false) }
  }

  const test = async () => {
    setTesting(true); setStatus(undefined)
    try {
      const response = await fetch('/api/settings/connection/test', { method: 'POST' })
      const result = await response.json() as ConnectionTest
      setStatus(result.connected ? { tone: 'good', message: `Connected${result.version ? `: ${result.version}` : '.'}` } : { tone: 'bad', message: result.error ?? 'Connection could not be verified.' })
    } catch { setStatus({ tone: 'bad', message: 'Connection test could not be completed.' }) } finally { setTesting(false) }
  }

  if (!settings) return <><PageTitle eyebrow="CONNECTION" title="Settings"/><LoadingState message="Loading connection settings..."/></>
  return <><PageTitle eyebrow="CONNECTION" title="Settings">Choose a local Hermes installation or connect to Hermes on a VPS over SSH. These settings apply to this server and are saved for the next restart.</PageTitle>
    <section className="settings-card">
      <fieldset className="connection-mode"><legend>Connection mode</legend><label><input type="radio" checked={mode === 'local'} onChange={() => setMode('local')}/> Local server</label><label><input type="radio" checked={mode === 'ssh'} onChange={() => setMode('ssh')}/> Remote VPS via SSH</label></fieldset>
      <DirectoryHelp mode={mode} container={dockerContainer.trim() || 'hermes'} host={sshHost.trim() || 'vps.example.com'} user={sshUser.trim() || 'ubuntu'}/>
      {mode === 'ssh' && <div className="ssh-fields"><label>VPS host<input value={sshHost} onChange={(event) => setSshHost(event.target.value)} placeholder="vps.example.com" spellCheck={false}/></label><label>SSH user<input value={sshUser} onChange={(event) => setSshUser(event.target.value)} placeholder="ubuntu" spellCheck={false}/></label><label>SSH port<input value={sshPort} onChange={(event) => setSshPort(event.target.value)} inputMode="numeric" placeholder="22"/></label><label>Private key path <span className="muted">(optional)</span><input value={sshIdentityFile} onChange={(event) => setSshIdentityFile(event.target.value)} placeholder="/home/local-user/.ssh/id_ed25519" spellCheck={false}/><small>Leave blank to use your local SSH agent or default SSH key. The key remains on the machine running MyCompany.</small></label></div>}
      <label>Docker container <span className="muted">(optional)</span><input value={dockerContainer} onChange={(event) => setDockerContainer(event.target.value)} placeholder="hermes" spellCheck={false}/><small>{mode === 'ssh' ? <>Fill this when Hermes runs in a Docker container on the VPS. The SSH user needs permission to run <code>docker exec</code>.</> : <>Fill this when local Hermes runs in Docker. MyCompany will run <code>docker exec</code> using its own system user.</>}</small></label>
      <label>Hermes executable<input value={hermesCommand} onChange={(event) => setHermesCommand(event.target.value)} placeholder="hermes" spellCheck={false}/><small>{mode === 'ssh' ? <>Path on the VPS. Use <code>hermes</code> when it is in that user’s PATH.</> : <>Use <code>hermes</code> when it is on the server PATH, or an absolute path ending in <code>/hermes</code>.</>}</small></label>
      <label>Hermes data directory <span className="muted">(optional)</span><input value={hermesHome} onChange={(event) => setHermesHome(event.target.value)} placeholder="/home/user/.hermes" spellCheck={false}/><small>{mode === 'ssh' ? <>Path on the VPS. It is supplied as <code>HERMES_HOME</code> to remote Hermes commands.</> : <>Sets <code>HERMES_HOME</code> for reads and folder views. Leave blank to use the server’s default Hermes data location.</>}</small></label>
      <div className="settings-actions"><button type="button" className="refresh-button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button><button type="button" className="secondary-button" onClick={test} disabled={testing || saving}>{testing ? 'Testing…' : 'Test connection'}</button></div>
      {status && <p className={status.tone === 'good' ? 'settings-status good' : 'settings-status bad'} role="status">{status.message}</p>}
      {mode === 'ssh' && <p className="settings-note">Remote mode reads Hermes dashboard data over SSH. Folder and Memory pages remain available only for a local Hermes data directory.</p>}
    </section>
  </>
}
