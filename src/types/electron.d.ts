export {}

declare global {
  interface Window {
    messmeDesktop?: {
      platform: string
      notify: (payload: { title: string; body: string }) => void
      getDesktopSources?: () => Promise<Array<{
        id: string
        name: string
        displayId?: string
        thumbnail?: string
        appIcon?: string | null
      }>>
      openExternal?: (url: string) => Promise<boolean>
    }
  }
}
