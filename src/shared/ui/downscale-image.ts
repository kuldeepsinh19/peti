/**
 * Shrinks a photograph in the browser before upload, so phone photos (often 5–12 MB) fit the Server
 * Action body limit and upload quickly on mobile data. This is a convenience, not a control: the server
 * still checks the bytes, strips metadata and re-encodes everything it receives.
 *
 * Returns the original file when it is already small enough or when the browser cannot decode it (the
 * server then decides).
 */
export async function downscaleImage(file: File, maxEdge = 2400, quality = 0.85): Promise<File> {
  if (typeof createImageBitmap !== "function" || !file.type.startsWith("image/")) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) return file;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // JPEG has no transparency: paint PNG/WebP cut-outs on white rather than black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
