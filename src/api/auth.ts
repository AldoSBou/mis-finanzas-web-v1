import { api } from '@/lib/api-client'
import type { TokenResponse, User } from '@/types/api'

export const authApi = {
  login: (email: string, password: string) =>
    api.post<TokenResponse>('/auth/login', { email, password }).then((r) => r.data),

  register: (email: string, password: string, displayName?: string) =>
    api
      .post<TokenResponse>('/auth/register', { email, password, displayName })
      .then((r) => r.data),

  me: () => api.get<User>('/auth/me').then((r) => r.data),

  /**
   * Logout server-side: revoca el token en el backend antes de borrarlo localmente.
   * El backend puede fallar (ej. token ya inválido) — en ese caso seguimos limpiando
   * localmente porque el efecto deseado (cerrar sesión) se logra igual.
   *
   * MITIGACIÓN MF-03
   */
  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout')
    } catch (err) {
      // Ignoramos errores: lo importante es que localmente quedamos sin sesión.
      // El servidor podría no tener el token (ya expirado, ya revocado, etc.)
      console.debug('logout server-side falló, continuando con limpieza local', err)
    }
  },
}
