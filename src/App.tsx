import { useEffect, useRef, useState } from 'react'
import { formatTime } from './format.ts'
import { Activity } from './pages/Activity.tsx'
import { Agents } from './pages/Agents.tsx'
import { Calendar } from './pages/Calendar.tsx'
import { Folders } from './pages/Folders.tsx'
import { Logs } from './pages/Logs.tsx'
import { Memory } from './pages/Memory.tsx'
import { Office } from './pages/Office.tsx'
import { TaskBoard } from './pages/TaskBoard.tsx'
import { Settings } from './pages/Settings.tsx'
import { Skills } from './pages/Skills.tsx'
import { API_VERSION } from './api-version.ts'
import { RefreshContext, usePolling } from './polling.ts'
import { usePreferences } from './preferences.ts'
import { HOME, navigation, pageFromLocation, pagePath, type Page } from './routes.ts'
import type { DashboardSnapshot } from './types.ts'
import { Icon } from './icons.tsx'

function currentPage(): Page {
  return typeof window === 'undefined' ? HOME : pageFromLocation(window.location.pathname)
}

function Shell({ onRefresh }: { onRefresh: () => void }) {
  const [page, setPage] = useState<Page>(currentPage)
  const { theme, toggleTheme } = usePreferences()
  // Persistent desktop navigation; a dismissible drawer on smaller screens.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const drawer = useRef<HTMLElement>(null)
  const dashboard = usePolling<DashboardSnapshot>('/api/dashboard', 15_000)
  const data = dashboard.status === 'ready' ? dashboard.data : null
  const health = usePolling<{ apiVersion?: number }>('/api/health', 60_000)
  const serverVersion = health.status === 'ready' ? health.data.apiVersion ?? 0 : health.status === 'failed' && health.httpStatus === 404 ? 0 : undefined
  const versionNotice = serverVersion === undefined || serverVersion === API_VERSION ? undefined
    : serverVersion < API_VERSION ? 'The StoneBox SaaS AI+ERP server is running an older version than this page, so newer menus (such as Memory) cannot load. Restart the server: stop it, run npm run build, then npm start (npm run dev restarts by itself).'
      : 'This page is older than the StoneBox SaaS AI+ERP server. Reload the page (and run npm run build if you use npm start).'

  useEffect(() => {
    const onPopState = () => setPage(currentPage())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  useEffect(() => { document.title = `${page} · StoneBox SaaS AI+ERP` }, [page])
  useEffect(() => {
    if (menuOpen) drawer.current?.querySelector<HTMLElement>('nav a[aria-current="page"], nav a')?.focus()
  }, [menuOpen])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuOpen) { closeMenu(); return }
      if (event.key === 'Tab' && menuOpen && window.matchMedia?.('(max-width: 1050px)').matches) {
        const items = drawer.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')
        if (items?.length) {
          const first = items[0]; const last = items[items.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }
        return
      }
      if (event.key.toLowerCase() !== 'm' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      if (menuOpen) closeMenu(); else setMenuOpen(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  const closeMenu = () => {
    setMenuOpen(false)
    menuButton.current?.focus()
  }

  const navigate = (next: Page) => {
    if (window.location.pathname !== pagePath(next)) window.history.pushState(null, '', pagePath(next))
    setPage(next)
    setMenuOpen(false)
    if (window.matchMedia?.('(max-width: 1050px)').matches) menuButton.current?.focus()
    window.scrollTo?.({ top: 0 })
  }
  const syncLabel = data ? `Updated ${formatTime(data.fetchedAt)}${dashboard.status === 'ready' && dashboard.stale ? ' · stale' : ''}` : dashboard.status === 'failed' ? 'Connection unavailable' : 'Connecting to Hermes'

  const alerts = (data && data.commands.failed > 0 ? 1 : 0)
  const content = page === 'Agents' ? <Agents runtime={data?.runtime ?? null} pending={dashboard.status === 'pending'}/> : page === 'Office' ? <Office dashboard={data} dashboardPending={dashboard.status === 'pending'} onNavigate={navigate}/> : page === 'Task Board' ? <TaskBoard/> : page === 'Calendar' ? <Calendar/> : page === 'Activity' ? <Activity/> : page === 'Memory' ? <Memory onOpenFolders={() => navigate('Folders')}/> : page === 'Folders' ? <Folders/> : page === 'Skills' ? <Skills/> : page === 'Settings' ? <Settings/> : <Logs/>

  return <div className={`app${page === 'Office' ? ' app-office' : ''}${menuOpen ? ' navigation-open' : ''}`}>
    {menuOpen && <div className="drawer-backdrop" onClick={closeMenu} aria-hidden="true"/>}
    <aside id="app-sidebar" className="drawer" ref={drawer} aria-label="Menu">
      <div className="drawer-head"><a className="brand" href={pagePath(HOME)} onClick={(event) => { event.preventDefault(); navigate(HOME) }}><span className="brand-mark" aria-hidden="true">m<span>.</span></span><span className="brand-copy">StoneBox SaaS AI+ERP<small>Agent workspace</small></span></a><button type="button" className="icon-button sidebar-close" onClick={closeMenu} aria-label="Close menu" title="Close menu (Esc)"><Icon name="close"/></button></div>
      <div className="workspace-identity"><span className="workspace-monogram">MC</span><span><b>My workspace</b><small>Hermes environment</small></span><Icon name="layers" size={16}/></div>
      <nav aria-label="Main">{[{ title: 'Workspace', items: navigation.slice(0, 4) }, { title: 'Resources', items: navigation.slice(4, 8) }, { title: 'Administration', items: navigation.slice(8) }].map((group) => <div className="nav-group" key={group.title}><p>{group.title}</p>{group.items.map((item) => <a href={pagePath(item)} className={page === item ? 'active' : ''} aria-current={page === item ? 'page' : undefined} key={item} onClick={(event) => { event.preventDefault(); navigate(item) }}><Icon name={item}/><span>{item}</span>{item === 'Agents' && data && <span className="nav-count">{data.office.declared}</span>}{item === 'Logs' && data && data.commands.failed > 0 && <span className="nav-badge" title="Failed CLI reads">{data.commands.failed}</span>}</a>)}</div>)}</nav>
      <div className="sidebar-bottom"><a href={pagePath('Settings')} onClick={(event) => { event.preventDefault(); navigate('Settings') }}><span className="workspace-monogram">MC</span><span>Workspace settings<small>Manage your connection</small></span><Icon name="chevron" size={14}/></a></div>
    </aside>
    <main><header className="app-topbar"><span className="header-title"><button type="button" ref={menuButton} className="icon-button menu-button" onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))} aria-controls="app-sidebar" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close menu' : 'Open menu'} title="Menu (M)"><Icon name="menu"/>{alerts > 0 && <span className="menu-alert" aria-label={`${alerts} alert${alerts === 1 ? '' : 's'} in the menu`}/>}</button><span className="breadcrumb">Workspace <Icon name="chevron" size={13}/><b>{page}</b></span></span><span className="header-actions"><span className={`sync-label${dashboard.status === 'failed' ? ' text-bad' : ''}`}><span className={`dot${data ? '' : ' muted-dot'}`}/>{syncLabel}</span><button type="button" className="icon-button theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}><Icon name={theme === 'dark' ? 'sun' : 'moon'}/></button><button type="button" className="refresh-button" onClick={onRefresh} aria-label="Refresh all sources"><Icon name="refresh" size={15}/><span>Refresh</span></button></span></header>
      <div className={`page-content${page === 'Office' ? ' page-content-office' : ''}`}>
      {versionNotice && <section className="notice version-notice" role="alert"><strong>Restart needed.</strong> {versionNotice}</section>}
      {content}
      </div>
    </main></div>
}

export function App() {
  const [tick, setTick] = useState(0)
  return <RefreshContext.Provider value={tick}><Shell onRefresh={() => setTick((value) => value + 1)}/></RefreshContext.Provider>
}
