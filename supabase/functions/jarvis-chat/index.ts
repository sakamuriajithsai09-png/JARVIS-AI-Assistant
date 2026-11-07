import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { classifyGeminiError, fetchGeminiWithRetry } from "../_shared/gemini.ts";

const JARVIS_SYSTEM_INSTRUCTION =
  "You are JARVIS, a sophisticated personal AI assistant. You are intelligent, professional, calm, helpful and respectful. Understand natural language, provide accurate answers, explain complex subjects clearly and maintain conversational context. Address the user naturally. Never pretend to have performed actions you have not actually completed.";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

const getGeminiApiKey = () => Deno.env.get("GEMINI_API_KEY")?.trim() ?? "";

function normalizeMessages(messages: Array<{ role: string; text: string }>) {
  return messages
    .filter(
      (message) =>
        (message?.role === "user" || message?.role === "assistant") &&
        typeof message.text === "string" &&
        message.text.trim().length > 0,
    )
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.text.trim() }],
    }));
}

serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON request body." }, 400);
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const model = typeof body?.model === "string" && body.model.trim()
    ? body.model.trim()
    : "gemini-3.8-flash";
  const systemInstruction = typeof body?.systemInstruction === "string" && body.systemInstruction.trim()
    ? body.systemInstruction.trim()
    : JARVIS_SYSTEM_INSTRUCTION;

  const contents = normalizeMessages(messages);
  if (!contents.length) {
    return jsonResponse({ ok: false, error: "No chat messages were provided." }, 400);
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return jsonResponse(
      {
        ok: false,
        error:
          "GEMINI_API_KEY is not configured. Add the secret in Supabase Edge Function settings before accessing Gemini.",
      },
      500,
    );
  }

  try {
    const response = await fetchGeminiWithRetry(
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
          contents,
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 1024,
          },
        }),
      },
    );

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const { message } = classifyGeminiError(response.status, payload);
      return jsonResponse({ ok: false, error: message }, response.status || 500);
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
      return jsonResponse({ ok: false, error: "Gemini returned an empty response." }, 502);
    }

    return jsonResponse(
      {
        ok: true,
        reply,
        usage: {
          model,
          inputTokens: payload?.usageMetadata?.promptTokenCount ?? undefined,
          outputTokens: payload?.usageMetadata?.candidateTokenCount ?? undefined,
          totalTokens: payload?.usageMetadata?.totalTokenCount ?? undefined,
        },
      },
      200,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error
          ? `Could not connect to Gemini: ${error.message}`
          : "Unexpected error while contacting Gemini.",
      },
      500,
    );
  }
});
