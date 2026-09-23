import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  ListOrdered,
  Menu,
  PiggyBank,
  PieChart,
  Tag,
  LogOut,
  Plus,
  Repeat,
  Settings2,
  Target,
  Upload,
  Wallet,
  X,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/features/auth/AuthProvider'
import { useEffect, useState } from 'react'
import { TransactionFormModal } from '@/features/transactions/TransactionFormModal'

const navItems = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/movimientos', label: 'Movimientos', icon: ListOrdered },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/cuentas', label: 'Cuentas', icon: Wallet },
  { to: '/tarjetas', label: 'Tarjetas', icon: CreditCard },
  { to: '/recurrentes', label: 'Recurrentes', icon: Repeat },
  { to: '/presupuestos', label: 'Presupuestos', icon: Target },
  { to: '/metas', label: 'Metas', icon: PiggyBank },
  { to: '/importar', label: 'Importar', icon: Upload },
  { to: '/configurar', label: 'Configurar', icon: Settings2 },
  { to: '/reglas', label: 'Reglas', icon: PieChart },
  { to: '/categorias', label: 'Categorías', icon: Tag },
]

/** Móvil: las que van en la barra inferior; el resto queda en "Más". */
const TAB_PATHS = ['/', '/movimientos', '/cuentas']
const moreItems = navItems.filter((i) => !TAB_PATHS.includes(i.to))

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [newTxOpen, setNewTxOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const inMore = moreItems.some((i) => pathname.startsWith(i.to))

  // Al navegar se cierra el menú
  useEffect(() => setMoreOpen(false), [pathname])

  return (
    <div className="min-h-screen flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:w-56 lg:w-64 bg-white border-r border-gray-200 flex-col">
        <div className="px-5 py-4 border-b border-gray-200">
          <h1 className="text-lg font-semibold text-brand-500">Mis Finanzas</h1>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{user?.email}</p>
        </div>

        <button
          type="button"
          onClick={() => setNewTxOpen(true)}
          className="btn-primary mx-4 mt-4"
        >
          <Plus className="w-4 h-4 mr-1" />
          Nuevo movimiento
        </button>

        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-3 px-5 py-3 text-sm text-gray-600 hover:bg-gray-100 border-t border-gray-200"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </aside>

      {/* Main content: en móvil deja espacio para la barra inferior y la zona segura */}
      <main className="flex-1 min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>

      {/* Tab bar (mobile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 grid grid-cols-5 items-center px-1 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-30">
        <TabBarItem to="/" icon={LayoutDashboard} label="Panel" end />
        <TabBarItem to="/movimientos" icon={ListOrdered} label="Movimientos" />

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setNewTxOpen(true)}
            className="bg-brand-500 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-md -mt-7"
            aria-label="Nuevo movimiento"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        <TabBarItem to="/cuentas" icon={Wallet} label="Cuentas" />
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex flex-col items-center gap-0.5 text-[11px] font-medium py-1 ${
            inMore || moreOpen ? 'text-brand-700' : 'text-gray-500'
          }`}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <Menu className="w-5 h-5" />
          Más
        </button>
      </nav>

      {/* Menú "Más" (mobile): hoja inferior con el resto de páginas */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMoreOpen(false)}>
          <div
            role="dialog"
            aria-label="Más opciones"
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto w-10 h-1 rounded-full bg-gray-300 mb-2" aria-hidden />
            <div className="flex items-center justify-between px-5 pb-2">
              <div className="min-w-0">
                <p className="font-semibold text-brand-500">Mis Finanzas</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="p-2 -mr-2 text-gray-500"
                aria-label="Cerrar menú"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="grid grid-cols-3 gap-2 px-4 py-2">
              {moreItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center gap-1.5 rounded-xl py-4 text-xs font-medium ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'bg-gray-50 text-gray-700 active:bg-gray-100'
                    }`
                  }
                >
                  <item.icon className="w-6 h-6" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <button
              type="button"
              onClick={logout}
              className="mt-2 mx-4 w-[calc(100%-2rem)] flex items-center justify-center gap-2 rounded-xl py-3 text-sm text-gray-600 border border-gray-200"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}

      <TransactionFormModal
        open={newTxOpen}
        onClose={() => setNewTxOpen(false)}
        onSuccess={() => {
          setNewTxOpen(false)
          navigate('/movimientos')
        }}
      />
    </div>
  )
}

function TabBarItem({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string
  icon: typeof LayoutDashboard
  label: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 text-[11px] font-medium py-1 ${
          isActive ? 'text-brand-700' : 'text-gray-500'
        }`
      }
    >
      <Icon className="w-5 h-5" />
      {label}
    </NavLink>
  )
}
