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
- **SheetJS** (desde su CDN oficial; la versión de npm está abandonada) para leer Excel, cargado solo al importar
- **pdf.js** (pdfjs-dist) para leer estados de cuenta en PDF, cargado solo al abrir un PDF
- **Vitest** para los tests del lector de estados de cuenta (`npm test`)

## Estructura

```
src/
├── api/             → Servicios HTTP (auth, services con todos los endpoints)
├── components/
│   ├── ui/          → Componentes reusables (Modal, PeriodSelector, States)
│   └── AppLayout.tsx → Layout con sidebar/tab bar
├── features/
│   ├── accounts/    → AccountFormModal
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

La PWA es la versión para iPhone (no hay app nativa iOS; la app Android vive en `mis-finanzas-mobile`).

- **Instalable** en Android/iOS/desktop. En iPhone: Safari → Compartir → "Agregar a pantalla de inicio" (la app lo explica con `InstallHint` hasta que corre instalada).
- **Manifest** con `start_url: /registrar`: la app instalada abre directo en el registro rápido. Iconos 192/512 más `apple-touch-icon.png` (180, sin transparencia) y metas `apple-mobile-web-app-*` en `index.html`.
- **Service worker** (Workbox) que precachea solo la app. Las respuestas de `/api` no se guardan: con el backend dormido, datos viejos confundirían más que esperar.
- **Sesión persistente**: login y registro piden `rememberDevice`, y `api-client.ts` renueva el JWT (8 h) con el refresh token ante un 401. La app instalada no vuelve a pedir contraseña.
- **Registro rápido** (`/registrar`, `QuickEntryPage`): la misma pantalla que la app Android. Categorías ordenadas por uso y hora (`lib/usage.ts`), teclado desde los centavos, chips de cuenta/fecha/nota/tipo de cambio, "Hoy llevas" y "Te quedan", deshacer, y métricas de velocidad (`lib/metrics.ts`, cola en localStorage → `POST /api/metrics/events` con `platform: web`).
  - **Voz**: Web Speech API (`lib/speech.ts`, `es-PE`) cuando el navegador la tiene; siempre hay un campo de texto, así que en iOS también sirve el dictado del teclado. La frase se interpreta primero en local (`lib/voice-parse.ts`, con tests) y, si no se reconoce la categoría, con `POST /api/voice/parse`.
  - **Foto**: `<input type="file" capture>` → canvas a 1280 px JPEG → `POST /api/voice/parse-image`. Voz y foto necesitan `ANTHROPIC_API_KEY` en el backend; sin ella, la app pide la categoría a mano.
- En Chrome desktop: ícono de instalación en la barra de URL.

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
- [x] Configurar ingreso esperado mensual (`POST /api/budgets`).
- [x] Cuentas, transferencias y multi-moneda.
- [x] Movimientos recurrentes (automáticos o con confirmación) y proyección de fin de mes.
- [x] Presupuesto por categoría con alertas.
- [x] Reportes con gráficos (Recharts) y vista de tabla.
- [x] Búsqueda, filtros y exportación CSV.
- [x] Importar estados de cuenta (PDF, CSV, Excel) con reglas de categorización y deshacer. PDF con perfiles verificados para tarjetas Scotiabank e Interbank (cuadran al centavo con el banco); PDFs con contraseña se abren en el navegador.
- [x] Metas de ahorro (varias por cuenta, aportes con transferencia o solo asignando saldo, aporte mensual sugerido).
- [ ] Tarjetas de crédito con cuotas.
- [ ] Registro sin conexión.
- [ ] Modo oscuro.
- [ ] i18n si quieres soportar múltiples idiomas.

## Tips de uso

**Probar PWA en móvil durante desarrollo**: usa la IP local de tu PC en lugar de `localhost`. Por ejemplo `http://192.168.1.100:5173` desde el celular conectado a la misma red WiFi. En `vite.config.ts` agrega `host: '0.0.0.0'` en `server`.

**Hot reload**: cualquier cambio en `.tsx` o `.ts` se refleja al instante. Modificaciones en `vite.config.ts` o `tailwind.config.js` requieren reiniciar `npm run dev`.

**Reset de sesión**: borra `localStorage` desde DevTools (Application → Local Storage → mis-finanzas:token).
