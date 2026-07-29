/** Badge « à faire valider » affiché sur toute entrée non vérifiée. */
export function UnverifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warn/50 bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn">
      ⚠ non vérifiée
    </span>
  )
}

export function VerifiedBadge({ by }: { by?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11px] font-medium text-ok"
      title={by ? `Validée par ${by}` : 'Validée'}
    >
      ✓ vérifiée
    </span>
  )
}
