import { getApiErrorMessage, parseJsonSafely } from "@/lib/apiErrors";

// `VITE_BACKEND_URL` is the canonical backend root and is shared with
// `lib/backend.ts` and the admin console. The old `VITE_API_URL` override (which
// differed by carrying its own `/api` suffix) is gone, so there is one name to set.
const configuredBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim();

export const API_BASE_URL = configuredBackendUrl
  ? `${configuredBackendUrl.replace(/\/+$/, "")}/api`
  : "/api";

export const apiCall = async <T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Add auth token if available
  const token = localStorage.getItem("authToken");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await parseJsonSafely(response);

    if (!response.ok) {
      throw new Error(getApiErrorMessage(data));
    }

    return data as T;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
};
