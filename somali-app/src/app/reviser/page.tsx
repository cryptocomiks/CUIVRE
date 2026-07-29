import { ReviewSession } from '@/components/ReviewSession'

export default function ReviserPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Xasuus</h1>
      <ReviewSession />
    </div>
  )
}
