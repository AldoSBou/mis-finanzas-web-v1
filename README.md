# Mis Finanzas Web

Frontend de la app de control de finanzas personales. **React 18 + TypeScript + Vite + Tailwind + PWA**, consume la API de [`mis-finanzas-api`](../mis-finanzas-api).

## Stack

- **React 18** con TypeScript estricto
- **Vite** para dev server y build
- **Tailwind CSS** para estilos
- **React Router 6** para enrutamiento
- **TanStack React Query 5** para estado servidor (cache, invalidación, refetch automático)
- **React Hook Form** para formularios
- **Axios** con interceptor JWT
- **vite-plugin-pwa** para instalable + offline básico
- **Recharts** preinstalado para gráficos futuros
- **Lucide React** para iconos

## Estructura

```
src/
├── api/             → Servicios HTTP (auth, services con todos los endpoints)
├── components/
│   ├── ui/          → Componentes reusables (Modal, PeriodSelector, States)
│   └── AppLayout.tsx → Layout con sidebar/tab bar
├── features/
│   ├── auth/        → AuthProvider, RequireAuth
│   └── transactions/ → TransactionFormModal
├── hooks/           → (vacío, para hooks futuros)
├── lib/             → api-client (Axios), format helpers, query-keys
├── pages/           → Una por ruta: Login, Register, Dashboard, Transactions, Rules, Categories
├── types/           → api.ts con todos los tipos espejando los DTOs del backend
├── App.tsx          → Setup de QueryClient, Router, AuthProvider, rutas
└── main.tsx         → Entry point
```

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Levantar el backend primero

Asegúrate que `mis-finanzas-api` esté corriendo en `http://localhost:8080` (Quarkus en modo dev).

### 3. Correr el frontend

```bash
npm run dev
```

Abre **http://localhost:5173**.

Vite proxy redirige automáticamente las llamadas a `/api` → `localhost:8080`, así que **no tendrás problemas de CORS** durante desarrollo.

## Build de producción

```bash
npm run build
npm run preview  # vista previa del build
```

El build genera carpeta `dist/` con assets optimizados y el service worker de PWA.

## Características PWA

- **Instalable** en Android/iOS/desktop (Chrome, Edge, Safari).
- **Service worker** con `NetworkFirst` para `/api/*` (5s timeout, cache de 5 minutos).
- **Manifest** con tema brand-500 (#0F6E56), iconos 192/512.
- En Chrome desktop: ícono de instalación aparece en la barra de URL.
- En móvil: "Agregar a pantalla de inicio".

## Cómo cambiar la URL del backend

Para apuntar a un backend en otro host (staging, producción), edita `vite.config.ts`:

```ts
proxy: {
  '/api': {
    target: 'https://tu-backend.com',
    changeOrigin: true,
  },
},
```

O en producción, configura el deployment para que sirva ambos en el mismo dominio bajo paths distintos.

## Decisiones de diseño

**Vite proxy en lugar de CORS** — En dev `/api` se redirige al backend, eliminando ruido. En prod ambos se sirven desde el mismo dominio o el backend habilita CORS para el dominio del frontend (ya configurado en `application.properties`).

**JWT en localStorage** — Simple y suficiente para esta app. Para una app con más superficie de ataque considera httpOnly cookies con CSRF tokens.

**React Query como cache** — Después de crear/editar/eliminar movimientos, se invalida `transactions.all` y `dashboard.*`. El dashboard se recarga solo. Sin Redux ni Zustand: React Query basta para casi todo.

**Tailwind con clases custom** — `.btn-primary`, `.input`, `.label`, `.card` están en `index.css` para mantener consistencia sin abusar de utilities en JSX.

**Tipos espejo del backend** — `src/types/api.ts` replica exactamente los DTOs del Quarkus. Cualquier cambio en el backend rompe el TS, lo cual es bueno: detectas drift en compile time.

**Mobile-first con breakpoints `md:`** — El layout es móvil por defecto (tab bar inferior), `md:` activa sidebar y grids más amplios.

## Roadmap sugerido

- [ ] Crear/editar/eliminar reglas (la página actual solo lee).
- [ ] Activar regla del mes desde la UI.
- [ ] CRUD completo de categorías.
- [ ] Configurar ingreso esperado mensual (`POST /api/budgets`).
- [ ] Filtros adicionales en movimientos (categoría, tipo, búsqueda).
- [ ] Gráfico de tendencia con Recharts en el dashboard.
- [ ] Importador CSV de movimientos bancarios.
- [ ] Modo oscuro.
- [ ] i18n si quieres soportar múltiples idiomas.

## Tips de uso

**Probar PWA en móvil durante desarrollo**: usa la IP local de tu PC en lugar de `localhost`. Por ejemplo `http://192.168.1.100:5173` desde el celular conectado a la misma red WiFi. En `vite.config.ts` agrega `host: '0.0.0.0'` en `server`.

**Hot reload**: cualquier cambio en `.tsx` o `.ts` se refleja al instante. Modificaciones en `vite.config.ts` o `tailwind.config.js` requieren reiniciar `npm run dev`.

**Reset de sesión**: borra `localStorage` desde DevTools (Application → Local Storage → mis-finanzas:token).
