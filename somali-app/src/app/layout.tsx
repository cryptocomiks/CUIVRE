import type { Metadata, Viewport } from 'next'
import './globals.css'
import { BottomNav } from '@/components/BottomNav'

export const metadata: Metadata = {
  title: 'Af Soomaali',
  description:
    'Apprentissage du somali pour francophones : répétition espacée FSRS, audio de proches, hors ligne.',
  applicationName: 'Af Soomaali',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // L'interface est dense en session : on empêche le zoom accidentel au pouce.
  maximumScale: 1,
  themeColor: '#0b0f14',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" data-theme="dark">
      <body className="min-h-dvh bg-bg text-text antialiased">
        <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-4">{children}</main>
        <BottomNav />
      </body>
    </html>
  )
}
