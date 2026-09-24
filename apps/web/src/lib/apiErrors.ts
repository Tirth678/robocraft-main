const DEFAULT_ERROR_MESSAGE = "We couldn't complete that request. Please try again.";

type ErrorPayload = {
  error?: unknown;
  message?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const extractPayloadMessage = (payload: unknown) => {
  if (!isRecord(payload)) return null;

  const { error, message } = payload as ErrorPayload;

  if (typeof error === "string" && error.trim()) return error;
  if (typeof message === "string" && message.trim()) return message;

  if (isRecord(error)) {
    const nestedMessage = error.message;
    if (typeof nestedMessage === "string" && nestedMessage.trim()) {
      return nestedMessage;
    }
  }

  return null;
};

export const parseJsonSafely = async <T = unknown>(response: Response): Promise<T | null> => {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Failed to parse API response:", error);
    return null;
  }
};

export const getApiErrorMessage = (
  payload: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
) => extractPayloadMessage(payload) ?? fallback;

export const getSafeErrorMessage = (
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
) => {
  if (!(error instanceof Error)) return fallback;

  const technicalPatterns = [
    /json/i,
    /unexpected token/i,
    /unexpected end/i,
    /failed to fetch/i,
    /networkerror/i,
    /http \d{3}/i,
    /database/i,
    /stack/i,
  ];

  if (technicalPatterns.some((pattern) => pattern.test(error.message))) {
    return fallback;
  }

  return error.message || fallback;
};
