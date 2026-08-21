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
  const blob = await svgToPngBlob(svgEl, 2);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy the board to the clipboard as a PNG. Not supported in every browser. */
export async function copyPngToClipboard(svgEl) {
  if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined') {
    throw new Error('This browser cannot copy images to the clipboard — use Download PNG instead.');
  }
  const blob = await svgToPngBlob(svgEl, 2);
  await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
}

/** Download the raw SVG, which stays crisp at any size. */
export function downloadSvg(svgEl, filename) {
  const blob = new Blob([serialize(svgEl)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
