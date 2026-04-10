import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const contentType = 'image/png'

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 192,
          height: 192,
          background: '#0f172a',
          borderRadius: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 32 32" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 8a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H14l-4 4v-4H8a3 3 0 0 1-3-3z" fill="#4338ca"/>
          <path d="M13.5 14v-1.5a2.5 2.5 0 0 1 5 0V14" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="12.5" y="14" width="7" height="5.5" rx="1.5" fill="white"/>
          <circle cx="16" cy="16.5" r="1.1" fill="#4338ca"/>
        </svg>
      </div>
    ),
    { width: 192, height: 192 }
  )
}
