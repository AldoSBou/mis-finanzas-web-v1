import { LayoutDashboard, ListOrdered, PieChart, Tag, LogOut, Plus, Settings2 } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useState } from 'react'
import { TransactionFormModal } from '@/features/transactions/TransactionFormModal'

const navItems = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/movimientos', label: 'Movimientos', icon: ListOrdered },
  { to: '/configurar', label: 'Configurar', icon: Settings2 },
  { to: '/reglas', label: 'Reglas', icon: PieChart },
  { to: '/categorias', label: 'Categorías', icon: Tag },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [newTxOpen, setNewTxOpen] = useState(false)

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

      {/* Main content */}
      <main className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Tab bar (mobile) - mostramos Panel, Movimientos, FAB, Configurar, Más */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex justify-around items-center px-2 pt-2 pb-3 z-30">
        <TabBarItem to="/" icon={LayoutDashboard} label="Panel" end />
        <TabBarItem to="/movimientos" icon={ListOrdered} label="Movim." />

        <button
          type="button"
          onClick={() => setNewTxOpen(true)}
          className="bg-brand-500 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-md -mt-6"
          aria-label="Nuevo movimiento"
        >
          <Plus className="w-5 h-5" />
        </button>

        <TabBarItem to="/configurar" icon={Settings2} label="Config." />
        <TabBarItem to="/reglas" icon={PieChart} label="Reglas" />
      </nav>

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
        `flex flex-col items-center gap-0.5 text-[10px] font-medium px-3 py-1 ${
          isActive ? 'text-brand-700' : 'text-gray-500'
        }`
      }
    >
      <Icon className="w-5 h-5" />
      {label}
    </NavLink>
  )
}
