import type { Page } from './routes.ts'

export type IconName = Page | 'sun' | 'moon' | 'menu' | 'close' | 'refresh' | 'chevron' | 'arrow' | 'layers'
const paths: Record<IconName, string> = {
  Office: 'M3 21V7l9-4 9 4v14M3 11h18M9 21v-6h6v6M7 8h.01M12 8h.01M17 8h.01',
  Agents: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  'Task Board': 'M3 4h18v16H3zM9 4v16M15 4v16M5.5 8h1M11.5 8h1M17.5 8h1M5.5 12h1M11.5 12h1',
  Calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2',
  Activity: 'M3 12h4l3-8 4 16 3-8h4',
  Memory: 'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM13 7a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 2',
  Folders: 'M3 6h7l2 3h9v11H3zM3 6V4h7l2 2h9v3',
  Skills: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  Logs: 'M4 4h16v16H4zM7 8l3 3-3 3M13 15h4',
  Settings: 'M4 7h16M4 17h16M9 4v6M15 14v6',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13',
  menu: 'M4 6h16M4 12h16M4 18h16', close: 'M6 6l12 12M6 18 18 6',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1',
  chevron: 'm9 5 7 7-7 7', arrow: 'M5 12h14M13 6l6 6-6 6', layers: 'm12 3 10 6-10 6L2 9zm-10 12 10 6 10-6M2 12l10 6 10-6',
}
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>
}
