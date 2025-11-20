// frontend/src/lib/capture.js
// updated 11/14/2025
import * as htmlToImage from "html-to-image";


/**
 * Capture a DOM node to a PNG data URL.
 * @param {HTMLElement} node - The DOM node to capture.
 * @param {number} pixelRatio - 2–3 is a good balance for print.
 * @returns {Promise<string|null>} data URL
 */
export async function captureNodeToPng(node, pixelRatio = 3) {
  if (!node) return null;
  return htmlToImage.toPng(node, {
    pixelRatio,
    backgroundColor: "#ffffff",
    cacheBust: true,
  });
}


/**
 * Temporarily add a CSS class during capture (handy for bigger PDF fonts).
 * Usage:
 *   await withTempClass(node, "pdf-zoom", () => captureNodeToPng(node, 3))
 */
export async function withTempClass(node, className, fn) {
  if (!node) return fn();
  node.classList.add(className);
  try {
    return await fn();
  } finally {
    node.classList.remove(className);
  }
}







