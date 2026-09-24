const rawBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim();

export const backendBaseUrl = rawBackendUrl
  ? rawBackendUrl.replace(/\/+$/, "")
  : "";

export const hasBackendUrl = backendBaseUrl.length > 0;

export const getBackendUrl = (path: string) => {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${backendBaseUrl}${normalizedPath}`;
};
