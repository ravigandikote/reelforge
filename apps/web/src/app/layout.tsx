import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NAV ReelForge',
  description: 'Turn NeeRav Arts Village albums into scripted social videos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-indigo/10">
            <div className="mx-auto flex max-w-5xl items-baseline gap-3 px-6 py-5">
              <span className="font-display text-2xl font-semibold tracking-tight">ReelForge</span>
              <span className="font-caption text-xs uppercase tracking-[0.2em] text-terracotta">
                NeeRav Arts Village
              </span>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
        </div>
      </body>
    </html>
  )
}
