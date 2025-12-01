// src/lib/api.js
// 👇 Force frontend to talk directly to backend during development
const API_BASE =
  import.meta.env.DEV
    ? "http://localhost:5000/api"   // development → Flask backend
    : "/api";                       // production → use reverse proxy

export async function apiFetch(path, opts = {}) {
  const { method = "GET", token, params, body, headers: extraHeaders } = opts;

  const clean = String(path || "").replace(/^\/+/, "");
  const normalizedPath = clean.startsWith("api/") ? clean.slice(4) : clean;
  let url = `${API_BASE}/${normalizedPath}`;

  if (params && Object.keys(params).length) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.append(k, v);
    }
    url += `?${qs.toString()}`;
  }

  const isForm = body instanceof FormData || opts.isForm === true;

  const headers = {
    ...(isForm ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extraHeaders || {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    let message = "";
    try {
      const data = await res.json();
      message = data.error || data.message || "";
    } catch {
      message = await res.text().catch(() => "");
    }
    const err = new Error(message || res.statusText);
    err.status = res.status;
    throw err;
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}
