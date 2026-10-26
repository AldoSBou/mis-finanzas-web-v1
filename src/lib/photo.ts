/**
 * Foto de un voucher o captura de Yape desde el navegador: un <input type="file"> abre la
 * cámara (capture) o la galería, y la imagen se reduce con un canvas antes de mandarla.
 */

export type PhotoSource = 'camera' | 'library'

export interface PickedPhoto {
  base64: string
  mediaType: 'image/jpeg'
}

/** Lado mayor al que se reduce la imagen: suficiente para leer un voucher y pesa unos 200 KB. */
const MAX_SIDE = 1280
/** Las boletas de supermercado son largas y de letra chica: más resolución para no perder líneas. */
export const RECEIPT_MAX_SIDE = 2000
const QUALITY = 0.75

/** Abre el selector del sistema. Resuelve null si la persona canceló. */
export function pickImageFile(source: PhotoSource): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (source === 'camera') input.setAttribute('capture', 'environment')
    input.style.display = 'none'
    document.body.appendChild(input)
    let settled = false
    const done = (file: File | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(file)
    }
    input.onchange = () => done(input.files?.[0] ?? null)
    // Safari 16.4+ y Chrome avisan la cancelación; en versiones viejas la promesa queda
    // pendiente sin efecto (la pantalla no cambia hasta que llega un archivo).
    input.addEventListener('cancel', () => done(null))
    input.click()
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo abrir la imagen'))
    }
    img.src = url
  })
}

/** Reduce la imagen a JPEG de hasta 1280 px por lado y la devuelve en base64 (sin el prefijo data:). */
export async function shrinkToBase64(file: File, maxSide = MAX_SIDE): Promise<PickedPhoto> {
  const img = await loadImage(file)
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la imagen')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  if (!base64) throw new Error('No se pudo preparar la imagen')
  return { base64, mediaType: 'image/jpeg' }
}

/** Foto o imagen de la galería, ya reducida y en base64; null si la persona canceló. */
export async function pickPhoto(source: PhotoSource, maxSide = MAX_SIDE): Promise<PickedPhoto | null> {
  const file = await pickImageFile(source)
  if (!file) return null
  if (!file.type.startsWith('image/')) throw new Error('Elige una imagen (foto o captura de pantalla)')
  return shrinkToBase64(file, maxSide)
}
