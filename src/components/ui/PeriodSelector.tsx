import { ChevronLeft, ChevronRight } from 'lucide-react'
import { periodLabel, shiftPeriod } from '@/lib/format'

interface Props {
  value: string
  onChange: (period: string) => void
}

export function PeriodSelector({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 bg-white rounded-md border border-gray-200 px-1">
      <button
        type="button"
        onClick={() => onChange(shiftPeriod(value, -1))}
        className="p-1.5 hover:bg-gray-100 rounded"
        aria-label="Mes anterior"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium px-2 min-w-[120px] text-center">
        {periodLabel(value)}
      </span>
      <button
        type="button"
        onClick={() => onChange(shiftPeriod(value, 1))}
        className="p-1.5 hover:bg-gray-100 rounded"
        aria-label="Mes siguiente"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
