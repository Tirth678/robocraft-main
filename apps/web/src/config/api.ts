import { getApiErrorMessage, parseJsonSafely } from "@/lib/apiErrors";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const configuredBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim();

export const API_BASE_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/+$/, "")
  : configuredBackendUrl
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
