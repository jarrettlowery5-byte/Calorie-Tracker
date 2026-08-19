// Prepare a photo for Claude's vision API: correct for huge phone photos by
// downscaling, and normalize to JPEG (which also converts iPhone HEIC when the
// OS can decode it). Claude Sonnet 5 reads up to 2576px on the long edge, and
// handwriting on a recipe card benefits from the detail, so we aim high but
// still cut a 12MP photo down to a sane payload.
const MAX_EDGE = 2200;
const QUALITY = 0.85;
const CLAUDE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function prepareImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
    return {
      media_type: "image/jpeg",
      data: dataUrl.split(",")[1],
      preview: dataUrl,
    };
  } catch {
    // The browser couldn't decode it (HEIC on desktop, say). Send it as-is if
    // Claude accepts the format; otherwise tell the cook what to do instead.
    if (!CLAUDE_TYPES.includes(file.type)) {
      throw new Error(
        `That image format (${file.type || "unknown"}) can't be read. Try taking the photo with the camera button, or save it as a JPEG first.`
      );
    }
    const data = await fileToBase64(file);
    return { media_type: file.type, data, preview: `data:${file.type};base64,${data}` };
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}
