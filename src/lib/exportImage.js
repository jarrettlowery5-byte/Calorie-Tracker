/**
 * Export a live <svg> element to PNG.
 *
 * The board is entirely self-contained SVG (no external images or fonts), so
 * serialising it and painting it onto a canvas is lossless and needs no
 * third-party library.
 */

const XMLNS = 'http://www.w3.org/2000/svg';

function serialize(svgEl) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', XMLNS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  // Interactive targets are UI affordances, not part of the map.
  clone.querySelectorAll('.node-target, .edge-target').forEach((el) => el.remove());
  return new XMLSerializer().serializeToString(clone);
}

/**
 * Hand a generated file to the viewer.
 *
 * When the page runs as a published Artifact, the sandbox blocks a page from
 * starting its own download, so the file has to go through the host's
 * `downloads` capability, which asks the viewer to confirm. Running locally
 * there is no such host, and a plain anchor download works.
 *
 * Returns 'saved' or 'declined' so callers can stay quiet when the viewer
 * simply says no.
 */
async function offerFile(filename, blob) {
  const host = typeof window !== 'undefined' ? window.claude : undefined;
  const downloads = typeof host?.use === 'function' ? await host.use('downloads') : null;

  if (downloads) {
    try {
      await downloads.save({ filename, data: blob });
      return 'saved';
    } catch (err) {
      // The viewer said no, or let the prompt lapse -- not an error worth showing.
      if (err?.code === 'declined') return 'declined';
      if (err?.code === 'extension_not_enabled' || err?.code === 'rejected_extension') {
        throw new Error(`${filename.split('.').pop().toUpperCase()} downloads are not enabled here — use Download PNG instead.`);
      }
      if (err?.code === 'rate_limited') {
        throw new Error('A save prompt is already open. Finish that one first.');
      }
      if (err?.code === 'too_large') {
        throw new Error('That image is too large to save (16 MB limit).');
      }
      throw new Error(err?.message || 'The download could not be started.');
    }
  }

  // Local fallback: a normal browser download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}

/** Render the SVG to a PNG blob at `scale` times its natural size. */
export function svgToPngBlob(svgEl, scale = 2) {
  return new Promise((resolve, reject) => {
    const viewBox = svgEl.viewBox.baseVal;
    const width = Math.round((viewBox.width || svgEl.clientWidth || 800) * scale);
    const height = Math.round((viewBox.height || svgEl.clientHeight || 800) * scale);

    const svgText = serialize(svgEl);
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not rasterise the board SVG'));
    };
    img.src = url;
  });
}

/** Download the board as a PNG file. */
export async function downloadPng(svgEl, filename) {
  return offerFile(filename, await svgToPngBlob(svgEl, 2));
}

/**
 * Copy the board to the clipboard as a PNG.
 * Sandboxed frames and some browsers block image clipboard writes, so this
 * points at the download instead of failing opaquely.
 */
export async function copyPngToClipboard(svgEl) {
  if (!navigator.clipboard?.write || typeof window.ClipboardItem === 'undefined') {
    throw new Error('Copying images is not available here — use Download PNG instead.');
  }
  const blob = await svgToPngBlob(svgEl, 2);
  try {
    await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
  } catch {
    throw new Error('This page is not allowed to write to the clipboard — use Download PNG instead.');
  }
  return 'saved';
}

/** Download the raw SVG, which stays crisp at any size. */
export async function downloadSvg(svgEl, filename) {
  const blob = new Blob([serialize(svgEl)], { type: 'image/svg+xml;charset=utf-8' });
  return offerFile(filename, blob);
}
