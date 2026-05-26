import { AlertCircle, Loader2 } from 'lucide-react'

export function Loading({ label = 'Cargando...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-gray-500">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="text-sm">{message}</div>
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="text-center py-12 text-gray-500">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-xs mt-1">{description}</p>}
    </div>
  )
}
