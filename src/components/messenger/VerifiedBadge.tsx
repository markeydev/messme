import { Check } from 'lucide-react'

export function VerifiedBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#4e7bff] text-white ${className}`} title="Верифицирован">
      <Check className="h-2.5 w-2.5" strokeWidth={3} />
    </span>
  )
}
