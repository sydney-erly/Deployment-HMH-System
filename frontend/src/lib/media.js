// src/lib/media.js
// updated 11/14/2025
const BASE = import.meta.env.VITE_ASSETS_BASE?.replace(/\/+$/, "") || "";


export function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path; // already full URL


  let p = String(path).replace(/^\/+/, ""); // remove leading slash
  return `${BASE}/${p}`; // ex: https://supabase.../hmh-images/words/en/apple.svg
}







