import { useQuery } from '@tanstack/react-query'
import { categoriesApi } from '@/api/services'
import { queryKeys } from '@/lib/query-keys'
import { ErrorState, Loading } from '@/components/ui/States'
import { bucketLabel } from '@/lib/format'
import { getErrorMessage } from '@/lib/api-client'

export function CategoriesPage() {
  const { data: categories, isLoading, error } = useQuery({
    queryKey: queryKeys.categories.list(false),
    queryFn: () => categoriesApi.list(false),
  })

  const expenseCats = categories?.filter((c) => c.type === 'EXPENSE') ?? []
  const incomeCats = categories?.filter((c) => c.type === 'INCOME') ?? []

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Categorías</h1>
        <p className="text-sm text-gray-500">Tus categorías de ingreso y gasto</p>
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState message={getErrorMessage(error)} />}

      {categories && (
        <div className="space-y-6">
          <Section title="Gastos" categories={expenseCats} />
          <Section title="Ingresos" categories={incomeCats} />
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        Próximamente: crear, editar, archivar y reasignar buckets.
      </p>
    </div>
  )
}

function Section({
  title,
  categories,
}: {
  title: string
  categories: Array<{
    id: number
    name: string
    color: string | null
    defaultBucket: string
  }>
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 mb-2">{title}</h2>
      <div className="card p-0 divide-y divide-gray-100">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: c.color ?? '#6B6B6B' }}
            />
            <span className="flex-1 text-sm">{c.name}</span>
            <span className="text-xs text-gray-500">{bucketLabel(c.defaultBucket)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
