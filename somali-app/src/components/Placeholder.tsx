/** Écran d'attente pour les modules livrés aux phases suivantes. */
export function Placeholder({
  title,
  phase,
  detail,
}: {
  title: string
  phase: string
  detail: string
}) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-accent">{phase}</p>
        <p className="mt-1 text-sm text-muted">{detail}</p>
      </div>
    </div>
  )
}
