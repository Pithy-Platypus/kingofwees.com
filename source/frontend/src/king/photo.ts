/** A picked photo made ready to send: both JPEGs, re-encoded by the browser (which drops EXIF, GPS included). */
export type PhotoFiles = { photo: Blob; thumbnail: Blob };

/** Turns a picked file into the two JPEGs the server takes; rejects when the browser can't read or shrink it. */
export type PhotoResizer = (file: File) => Promise<PhotoFiles>;

/** The server's limits (PhotoRules.MaxPhotoBytes, MaxThumbnailBytes). */
export const MAX_PHOTO_BYTES = 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 100 * 1024;

const PHOTO_EDGE = 1600;
const THUMBNAIL_EDGE = 400;
const QUALITIES = [0.85, 0.7, 0.55, 0.4];

/** Scales down (never up) so the longer side is at most `longest` pixels. */
export function fitWithin(width: number, height: number, longest: number): { width: number; height: number } {
  const scale = Math.min(1, longest / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The best quality whose JPEG fits in `maxBytes`. */
export async function encodeUnder(encode: (quality: number) => Promise<Blob | null>, maxBytes: number): Promise<Blob> {
  for (const quality of QUALITIES) {
    const blob = await encode(quality);
    if (!blob) throw new Error('The browser could not encode the photo');
    if (blob.size <= maxBytes) return blob;
  }
  throw new Error('The photo is too big even at the lowest quality');
}

function shrink(image: HTMLImageElement, longest: number, maxBytes: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  Object.assign(canvas, fitWithin(image.naturalWidth, image.naturalHeight, longest));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return encodeUnder((quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality)), maxBytes);
}

// Browsers apply the EXIF orientation when drawing an <img>, so a phone's portrait photo stays upright without it.
// Not runnable in jsdom (no decoding, no canvas): the e2e flows cover it.
export const resizePhoto: PhotoResizer = async (file) => {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { photo: await shrink(image, PHOTO_EDGE, MAX_PHOTO_BYTES), thumbnail: await shrink(image, THUMBNAIL_EDGE, MAX_THUMBNAIL_BYTES) };
  } finally {
    URL.revokeObjectURL(url);
  }
};
