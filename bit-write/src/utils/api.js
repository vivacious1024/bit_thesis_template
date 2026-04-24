const DEFAULT_API_BASE = 'http://127.0.0.1:8787'

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return DEFAULT_API_BASE
  return raw.replace(/\/+$/, '')
}

export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_TARGET || DEFAULT_API_BASE)

export function apiUrl(path) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`
  return `${API_BASE_URL}${normalizedPath}`
}

export function apiFetch(path, init) {
  return fetch(apiUrl(path), init)
}
