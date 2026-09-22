import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { AppLayout } from '@/components/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { AccountsPage } from '@/pages/AccountsPage'
import { RecurringPage } from '@/pages/RecurringPage'
import { BudgetsPage } from '@/pages/BudgetsPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { RulesPage } from '@/pages/RulesPage'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { ConfigurePage } from '@/pages/ConfigurePage'
import { Loading } from '@/components/ui/States'

// Páginas pesadas (gráficos, lector de Excel): se descargan al abrirlas
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const ImportPage = lazy(() => import('@/pages/ImportPage').then((m) => ({ default: m.ImportPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="movimientos" element={<TransactionsPage />} />
              <Route path="cuentas" element={<AccountsPage />} />
              <Route path="recurrentes" element={<RecurringPage />} />
              <Route path="presupuestos" element={<BudgetsPage />} />
              <Route path="metas" element={<GoalsPage />} />
              <Route
                path="reportes"
                element={
                  <Suspense fallback={<Loading />}>
                    <ReportsPage />
                  </Suspense>
                }
              />
              <Route
                path="importar"
                element={
                  <Suspense fallback={<Loading />}>
                    <ImportPage />
                  </Suspense>
                }
              />
              <Route path="configurar" element={<ConfigurePage />} />
              <Route path="reglas" element={<RulesPage />} />
              <Route path="categorias" element={<CategoriesPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
