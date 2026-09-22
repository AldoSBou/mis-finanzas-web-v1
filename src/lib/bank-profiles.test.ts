import { describe, expect, it } from 'vitest'
import { extractStatement, profileById } from './bank-profiles'

describe('extractStatement', () => {
  it('Interbank: vencimiento, pago del mes y mínimo según la moneda', () => {
    const text =
      'Estado de Cuenta del 21/07/2026 al cierre de 21/08/2026 ÚLTIMO DÍA DE PAGO PAGO DEL MES ' +
      'PAGO MÍNIMO ¡Hola X! S/ 5,000.00 S/ 1,500.25 y US$ 12.00 S/ 900.00 15/09/2026 S/ 1,500.25 ' +
      'US$ 12.00 S/ 150.10 US$ 5.50 * Incluye'
    const profile = profileById('interbank-tc')
    expect(extractStatement(profile, text, 'PEN')).toEqual({
      closingDate: '2026-08-21',
      dueDate: '2026-09-15',
      totalDue: '1500.25',
      minimumDue: '150.10',
    })
    expect(extractStatement(profile, text, 'USD')).toMatchObject({ totalDue: '12.00', minimumDue: '5.50' })
  })

  it('Scotiabank: cierre del período y vencimiento; el pago del mes lo ingresa el usuario', () => {
    const text =
      '01-10-2026 VISA SIGNATURE REF 01-01-6000 DEL PERIODO DE FACTURACION DEL 05-08-2026 AL 04-09-2026 Deuda Total 900.00'
    expect(extractStatement(profileById('scotiabank-tc'), text, 'PEN')).toEqual({
      closingDate: '2026-09-04',
      dueDate: '2026-10-01',
      totalDue: undefined,
      minimumDue: undefined,
    })
  })

  it('otro banco: etiquetas comunes de cierre y vencimiento', () => {
    const text = 'Fecha de corte: 20/08/2026\n Último día de pago: 10/09/2026 Pago mínimo 50.00'
    expect(extractStatement(profileById('auto'), text, 'PEN')).toMatchObject({
      closingDate: '2026-08-20',
      dueDate: '2026-09-10',
    })
    expect(extractStatement(profileById('auto'), 'sin fechas', 'PEN').closingDate).toBeUndefined()
  })
})
