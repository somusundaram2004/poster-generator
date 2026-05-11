import axios from "axios";

function normalizeApiUrl(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) return "http://localhost:5000";
  const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  return withProtocol.replace(/\/+$/, "");
}

const api = axios.create({
  baseURL: normalizeApiUrl(import.meta.env.VITE_API_URL),
});

export function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${api.defaults.baseURL}${path}`;
}

export default api;
