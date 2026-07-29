'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Navigation principale, en bas d'écran : atteignable au pouce, une main,
 * en mode portrait.
 */
const TABS = [
  { href: '/', label: 'Accueil', glyph: '⌂' },
  { href: '/reviser', label: 'Réviser', glyph: '⟳' },
  { href: '/repertoire', label: 'Ereyada', glyph: '☰' },
  { href: '/prononciation', label: 'Dhawaaq', glyph: '◍' },
  { href: '/reglages', label: 'Réglages', glyph: '⚙' },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navigation principale"
    >
      <ul className="mx-auto flex max-w-xl">
        {TABS.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`tap flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
                  active ? 'text-accent' : 'text-muted'
                }`}
              >
                <span aria-hidden className="text-lg leading-none">
                  {tab.glyph}
                </span>
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
