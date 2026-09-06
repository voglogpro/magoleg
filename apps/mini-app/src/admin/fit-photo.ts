/**
 * Phone cameras shoot far more pixels than a product card ever shows, and a 48-megapixel photo
 * used to come back as an error the shop had to solve with a photo editor. The browser fits the
 * picture to catalogue size before it leaves the phone: uploads stay small on mobile data, and
 * the shop never meets a size limit. Anything the browser cannot decode is sent untouched — the
 * server validates and downscales it too, so this is an optimisation, never the only guard.
 */
const MAX_SIDE = 2000;

export async function fitPhoto(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch { return file; }
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
    // Re-encoding a photo that already fits can make it heavier; then the original is the better file.
    if (!blob || !blob.size || (scale === 1 && blob.size >= file.size)) return file;
    return new File([blob], `${file.name.replace(/\.[^.]*$/, '')}.webp`, { type: 'image/webp' });
  } catch { return file; }
  finally { bitmap.close(); }
}
