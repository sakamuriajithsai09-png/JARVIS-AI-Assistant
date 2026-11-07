export const JARVIS_SYSTEM_INSTRUCTION =
  "You are JARVIS, a sophisticated personal AI assistant. You are intelligent, professional, calm, helpful and respectful. Understand natural language, provide accurate answers, explain complex subjects clearly and maintain conversational context. Address the user naturally. Never pretend to have performed actions you have not actually completed.";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: ChatRole;
  text: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  model?: string;
  systemInstruction?: string;
};

export type ChatResponse = {
  reply: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    model?: string;
  };
};

export function normalizeMessages(messages: ChatMessage[]) {
  return messages
    .filter(
      (message) =>
        (message?.role === "user" || message?.role === "assistant") &&
        typeof message.text === "string" &&
        message.text.trim().length > 0,
    )
    .map((message) => ({
      role: message.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: message.text.trim() }],
    }));
}

function getGeminiApiKey(env: unknown) {
  if (env && typeof env === "object") {
    const values = env as Record<string, unknown>;
    const key = typeof values.GEMINI_API_KEY === "string" ? values.GEMINI_API_KEY.trim() : "";
    if (key) return key;
  }

  if (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY.trim();
  }

  return "";
}

export async function callJarvisChat(request: ChatRequest): Promise<ChatResponse> {
  const env = import.meta.env;
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const endpoint = env.VITE_JARVIS_CHAT_URL?.trim() ||
    (supabaseUrl ? `${supabaseUrl}/functions/v1/jarvis-chat` : "/api/jarvis-chat");
  const headers: Record<string, string> = { "content-type": "application/json" };
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (supabaseAnonKey) {
    headers.apikey = supabaseAnonKey;
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: request.messages,
        model: request.model || "gemini-3.5-flash-lite",
        systemInstruction: request.systemInstruction || JARVIS_SYSTEM_INSTRUCTION,
      }),
    });
  } catch {
    throw new Error(
      supabaseUrl
        ? "Could not reach the JARVIS Supabase Edge Function. Check the Supabase URL, deployment, and network connection."
        : "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect the deployed Edge Function.",
    );
  }

  let payload: {
    error?: string | { message?: string };
    message?: string;
    reply?: string;
    usage?: ChatResponse["usage"];
  } = {};
  try {
    payload = await response.json();
  } catch {
    if (response.ok) {
      throw new Error("The chat service returned an invalid response.");
    }
  }

  if (!response.ok) {
    const apiMessage = typeof payload.error === "string"
      ? payload.error
      : payload.error?.message ?? payload.message;
    const message = response.status === 429
      ? "Gemini rate limit reached. Please wait a moment and try again."
      : apiMessage || `Gemini request failed (HTTP ${response.status}).`;
    throw new Error(message);
  }

  if (typeof payload.reply !== "string" || !payload.reply.trim()) {
    throw new Error("The AI model returned an empty response.");
  }

  return {
    reply: payload.reply,
    usage: payload.usage,
  };
}

export async function handleJarvisChatRequest(request: Request, env: unknown): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, { status: 405 });
  }

  let body: Partial<ChatRequest> & { messages?: ChatMessage[] };
  try {
    body = (await request.json()) as Partial<ChatRequest> & { messages?: ChatMessage[] };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON request body." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const model = body.model || "gemini-3.5-flash-lite";
  const systemInstruction = body.systemInstruction || JARVIS_SYSTEM_INSTRUCTION;

  if (!messages.length) {
    return Response.json({ ok: false, error: "No chat messages were provided." }, { status: 400 });
  }

  const apiKey = getGeminiApiKey(env);
  if (!apiKey) {
    return Response.json(
      {
        ok: false,
        error:
          "GEMINI_API_KEY is not configured. Add the secret in Supabase Edge Function settings or the local server environment before calling the Gemini API.",
      },
      { status: 500 },
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: normalizeMessages(messages),
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 1024,
          },
        }),
      },
    );
  } catch {
    return Response.json(
      { ok: false, error: "Could not connect to the Gemini API. Check the server's network connection and try again." },
      { status: 502 },
    );
  }

  let payload: any = {};
  try {
    payload = await response.json();
  } catch {
    if (response.ok) {
      return Response.json({ ok: false, error: "Gemini returned an invalid response." }, { status: 502 });
    }
  }

  if (!response.ok) {
    const reason = payload?.error?.message || payload?.message || `Gemini request failed (HTTP ${response.status}).`;
    const message = response.status === 429
      ? "Rate limit reached. Please wait a moment and try again."
      : reason;

    return Response.json({ ok: false, error: message }, { status: response.status || 500 });
  }

  const reply = (payload?.candidates ?? [])
    .map((candidate: any) =>
      (candidate?.content?.parts ?? [])
        .map((part: any) => part?.text ?? "")
        .join(""),
    )
    .join("\n")
    .trim();

  if (!reply) {
    return Response.json({ ok: false, error: "Gemini returned an empty response. Please try again." }, { status: 502 });
  }

  return Response.json({
    ok: true,
    reply,
    usage: {
      model,
      inputTokens: payload?.usageMetadata?.promptTokenCount ?? undefined,
      outputTokens: payload?.usageMetadata?.candidateTokenCount ?? undefined,
      totalTokens: payload?.usageMetadata?.totalTokenCount ?? undefined,
    },
  });
}
