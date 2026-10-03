import { useEffect, useState } from 'react'
import { formatDateTime, formatNumber } from '../format.ts'
import { loadSnapshot, type RequestState } from '../request-state.ts'
import type { Session, TranscriptMessage, TranscriptSnapshot } from '../types.ts'
import { Dialog } from '../ui.tsx'

function Field({ label, value }: { label: string; value?: string | number }) {
  return value === undefined || value === '' ? null : <div><dt>{label}</dt><dd>{value}</dd></div>
}

function Message({ message }: { message: TranscriptMessage }) {
  const time = message.at ? <small>{formatDateTime(message.at)}</small> : null
  if (message.role === 'tool') {
    return <li className="transcript-message tool"><details><summary>Result · {message.toolName ?? 'tool'}{time}</summary><pre className="task-text">{message.text}{message.truncated ? '\n…' : ''}</pre></details></li>
  }
  return <li className={`transcript-message ${message.role}`}>
    <b>{message.role === 'user' ? 'User' : 'Agent'}{time}</b>
    {message.text && <p>{message.text}{message.truncated ? ' …' : ''}</p>}
    {message.tools?.map((tool, index) => <details key={index} className="transcript-tool"><summary>→ {tool.name}</summary>{tool.args && <pre className="task-text">{tool.args}</pre>}</details>)}
  </li>
}

/** Read-only transcript of one session from the Activity list. */
export function TranscriptDialog({ session, onClose }: { session: Session & { id: string }; onClose: () => void }) {
  const [state, setState] = useState<RequestState<TranscriptSnapshot>>({ status: 'pending' })
  useEffect(() => {
    let active = true
    setState({ status: 'pending' })
    void loadSnapshot<TranscriptSnapshot>(`/api/sessions/${encodeURIComponent(session.id)}/transcript`).then((next) => { if (active) setState(next) })
    return () => { active = false }
  }, [session.id])
  const source = state.status === 'ready' ? state.data.transcript : undefined
  const transcript = source?.availability === 'available' ? source.data : null
  const tokens = transcript && (transcript.inputTokens !== undefined || transcript.outputTokens !== undefined) ? `${formatNumber(transcript.inputTokens ?? 0)} in · ${formatNumber(transcript.outputTokens ?? 0)} out` : undefined
  return <Dialog labelledBy="transcript-title" onClose={onClose} closeLabel={`Close transcript of ${session.title}`} className="task-detail transcript-detail">
    <p className="eyebrow">SESSION TRANSCRIPT · {session.id}</p>
    <h2 id="transcript-title">{transcript?.title ?? session.title}</h2>
    {state.status === 'pending' && <p className="muted">Reading the transcript…</p>}
    {state.status === 'failed' && <p className="file-notice">{state.message}</p>}
    {source?.availability === 'unavailable' && <p className="file-notice">The transcript could not be read ({source.error?.message ?? 'hermes sessions export failed'}).</p>}
    {source?.availability === 'available' && !transcript && <p className="file-notice">Hermes no longer has this session.</p>}
    {transcript && <>
      <dl className="office-detail-grid task-grid">
        <Field label="Model" value={transcript.model}/>
        <Field label="Source" value={transcript.source}/>
        <Field label="Started" value={transcript.startedAt && formatDateTime(transcript.startedAt)}/>
        <Field label="Ended" value={transcript.endedAt && `${formatDateTime(transcript.endedAt)}${transcript.endReason ? ` · ${transcript.endReason}` : ''}`}/>
        <Field label="Messages" value={transcript.messageCount}/>
        <Field label="Tool calls" value={transcript.toolCallCount}/>
        <Field label="Tokens" value={tokens}/>
        <Field label="Estimated cost" value={transcript.estimatedCostUsd ? `$${transcript.estimatedCostUsd.toFixed(4)}` : undefined}/>
      </dl>
      <p className="muted transcript-note">Read-only. Secrets are redacted by Hermes and again by MyCompany; the system prompt and model reasoning are not shown.</p>
      {transcript.omitted > 0 && <p className="file-notice">{transcript.omitted} older message{transcript.omitted === 1 ? ' is' : 's are'} not shown.</p>}
      {transcript.messages.length === 0 ? <p className="muted">This session has no messages.</p> : <ol className="transcript">{transcript.messages.map((message, index) => <Message key={index} message={message}/>)}</ol>}
    </>}
  </Dialog>
}
