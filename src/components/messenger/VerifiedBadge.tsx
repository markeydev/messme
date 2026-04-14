import { Check } from 'lucide-react'

export function VerifiedBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#4e7bff] text-white ${className}`} title="Верифицирован">
      <Check className="h-2 w-2" strokeWidth={3} />
    </span>
  )
}
