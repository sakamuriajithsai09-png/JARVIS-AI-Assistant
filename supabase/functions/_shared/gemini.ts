export const MAX_GEMINI_RETRIES = 2;

export type GeminiErrorCategory =
  | "capacity"
  | "rate_limit"
  | "authentication"
  | "model"
  | "request"
  | "upstream";

export type GeminiErrorDetails = {
  category: GeminiErrorCategory;
  message: string;
  retryable: boolean;
};

type GeminiErrorPayload = {
  error?: {
    message?: unknown;
    status?: unknown;
    reason?: unknown;
  };
  message?: unknown;
};

export function classifyGeminiError(status: number, payload: unknown): GeminiErrorDetails {
  const error = payload && typeof payload === "object"
    ? (payload as GeminiErrorPayload).error
    : undefined;
  const apiStatus = typeof error?.status === "string" ? error.status.toUpperCase() : "";
  const reason = typeof error?.reason === "string" ? error.reason.toUpperCase() : "";
  const apiMessage = typeof error?.message === "string"
    ? error.message
    : typeof (payload as GeminiErrorPayload | null)?.message === "string"
      ? (payload as GeminiErrorPayload).message as string
      : "";
  const normalizedMessage = apiMessage.toLowerCase();

  if (status === 503) {
    return {
      category: "capacity",
      message: "Gemini is temporarily at capacity. Please try again shortly.",
      retryable: true,
    };
  }

  if (
    status === 429 ||
    apiStatus === "RESOURCE_EXHAUSTED" ||
    reason === "RATE_LIMIT_EXCEEDED" ||
    /rate limit|quota exceeded|too many requests/.test(normalizedMessage)
  ) {
    return {
      category: "rate_limit",
      message: "Gemini rate limit reached. Please wait a moment before trying again.",
      retryable: true,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    apiStatus === "UNAUTHENTICATED" ||
    apiStatus === "PERMISSION_DENIED" ||
    /api key not valid|invalid api key|authentication|permission denied/.test(normalizedMessage)
  ) {
    return {
      category: "authentication",
      message: "Gemini rejected the server credentials or permissions. Check the Supabase secret and Gemini API access.",
      retryable: false,
    };
  }

  if (
    status === 404 ||
    /model .* (not found|not available|no longer available)/.test(normalizedMessage)
  ) {
    return {
      category: "model",
      message: "The configured Gemini model is unavailable for this API project.",
      retryable: false,
    };
  }

  if (
    status === 400 ||
    apiStatus === "INVALID_ARGUMENT" ||
    /unknown name|cannot find field|invalid json payload|invalid argument/.test(normalizedMessage)
  ) {
    return {
      category: "request",
      message: "Gemini rejected the request format. Check the chat request schema.",
      retryable: false,
    };
  }

  return {
    category: "upstream",
    message: `Gemini request failed (HTTP ${status}). Please try again later.`,
    retryable: false,
  };
}

export async function fetchGeminiWithRetry(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<Response> {
  for (let retry = 0; ; retry += 1) {
    const response = await fetcher(url, init);
    if (response.status !== 429 && response.status !== 503) return response;
    if (retry >= MAX_GEMINI_RETRIES) return response;

    await sleep(500 * 2 ** retry);
  }
}
