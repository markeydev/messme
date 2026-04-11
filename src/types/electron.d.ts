export {}

declare global {
  interface Window {
    messmeDesktop?: {
      platform: string
      notify: (payload: { title: string; body: string }) => void
    }
  }
}
