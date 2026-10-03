export const navigation = ['Office', 'Agents', 'Task Board', 'Calendar', 'Activity', 'Memory', 'Folders', 'Skills', 'Logs', 'Settings'] as const
export type Page = typeof navigation[number]

/** The page shown when the address names no page (or an unknown one). */
export const HOME: Page = 'Office'

export function pageSlug(page: Page): string {
  return page.toLowerCase().replace(/\s+/g, '-')
}

/** The address of a page: `/` for the Office home, `/<slug>` otherwise. */
export function pagePath(page: Page): string {
  return page === HOME ? '/' : `/${pageSlug(page)}`
}

/** The page an address names; unknown addresses show the Office home. */
export function pageFromLocation(pathname: string): Page {
  const slug = pathname.replace(/^\/+/, '').split('/')[0].toLowerCase()
  return navigation.find((page) => pageSlug(page) === slug) ?? HOME
}
