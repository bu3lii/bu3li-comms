/**
 * Downscales an image file client-side before upload (canvas), so a phone
 * photo doesn't ship multi-megabyte payloads through the app server. GIFs
 * are passed through untouched to preserve animation; anything already
 * within bounds is passed through too.
 */
export async function resizeImageFile(file: File, maxDimension: number): Promise<Blob> {
  if (file.type === "image/gif") {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) {
      return file;
    }

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const outputType = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("image encoding failed"))), outputType, 0.85);
    });
  } finally {
    bitmap.close();
  }
}

/** Reads a still image's pixel dimensions, for attaching width/height metadata to an upload. */
export async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}
