import type { Metadata } from 'next'
import Link from 'next/link'
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
            <div className="mx-auto flex max-w-5xl flex-wrap items-baseline gap-x-3 gap-y-2 px-6 py-5">
              <Link href="/" className="font-display text-2xl font-semibold tracking-tight">
                ReelForge
              </Link>
              <span className="font-caption text-xs uppercase tracking-[0.2em] text-terracotta">
                NeeRav Arts Village
              </span>
              <nav className="ml-auto flex gap-4 font-caption text-sm">
                <Link href="/" className="text-indigo/70 hover:text-indigo">
                  Studio
                </Link>
                <Link href="/library" className="text-indigo/70 hover:text-indigo">
                  Library
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
        </div>
      </body>
    </html>
  )
}
