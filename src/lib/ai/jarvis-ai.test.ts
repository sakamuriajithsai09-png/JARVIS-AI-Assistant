import { afterEach, describe, expect, it, vi } from "vitest";

import {
  handleJarvisChatRequest,
  JARVIS_SYSTEM_INSTRUCTION,
  normalizeMessages,
  callJarvisChat,
} from "./jarvis-ai";
import { DEFAULT_GEMINI_MODEL, normalizeGeminiModel } from "../jarvis-store";
import {
  classifyGeminiError,
  fetchGeminiWithRetry,
  MAX_GEMINI_RETRIES,
} from "../../../supabase/functions/_shared/gemini";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Gemini chat request", () => {
  it("classifies temporary, authentication, model, and request errors safely", () => {
    expect(classifyGeminiError(503, { error: { message: "capacity details" } })).toMatchObject({
      category: "capacity",
      retryable: true,
    });
    expect(classifyGeminiError(429, { error: { status: "RESOURCE_EXHAUSTED" } })).toMatchObject({
      category: "rate_limit",
      retryable: true,
    });
    expect(classifyGeminiError(400, { error: { message: "API key not valid." } })).toMatchObject({
      category: "authentication",
      retryable: false,
    });
    expect(classifyGeminiError(404, { error: { message: "Model is no longer available." } })).toMatchObject({
      category: "model",
      retryable: false,
    });
    expect(classifyGeminiError(400, { error: { message: "Unknown name 'text'." } })).toMatchObject({
      category: "request",
      retryable: false,
    });
  });

  it("retries 503 responses with exponential backoff then returns a successful response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "busy" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ error: "busy" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ candidates: [] }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchGeminiWithRetry("https://example.test", {}, fetchMock, sleep);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_GEMINI_RETRIES + 1);
    expect(sleep.mock.calls).toEqual([[500], [1000]]);
  });

  it("caps retries for repeated rate limits and does not retry request errors", async () => {
    const rateLimitFetch = vi.fn().mockResolvedValue(
      Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 }),
    );
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchGeminiWithRetry("https://example.test", {}, rateLimitFetch, sleep);

    expect(response.status).toBe(429);
    expect(rateLimitFetch).toHaveBeenCalledTimes(MAX_GEMINI_RETRIES + 1);
    expect(sleep.mock.calls).toEqual([[500], [1000]]);

    const badRequestFetch = vi.fn().mockResolvedValue(
      Response.json({ error: { status: "INVALID_ARGUMENT" } }, { status: 400 }),
    );
    await fetchGeminiWithRetry("https://example.test", {}, badRequestFetch, sleep);
    expect(badRequestFetch).toHaveBeenCalledTimes(1);
  });

  it("uses the current model default and migrates retired saved models", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
    expect(normalizeGeminiModel("gemini-2.5-flash")).toBe(DEFAULT_GEMINI_MODEL);
    expect(normalizeGeminiModel("gemini-2.5-pro")).toBe(DEFAULT_GEMINI_MODEL);
    expect(normalizeGeminiModel("gemini-3.8-flash")).toBe(DEFAULT_GEMINI_MODEL);
  });

  it("converts conversation history to Gemini contents and keeps instructions separate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        candidates: [{ content: { parts: [{ text: "Hello from Gemini." }] } }],
        usageMetadata: { promptTokenCount: 3, candidateTokenCount: 4, totalTokenCount: 7 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleJarvisChatRequest(
      new Request("http://localhost/api/jarvis-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", text: "Hello" },
            { role: "assistant", text: "Hi there." },
            { role: "user", text: "How are you?" },
          ],
          systemInstruction: "Be helpful.",
        }),
      }),
      { GEMINI_API_KEY: "test-secret" },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ reply: "Hello from Gemini." });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe("test-secret");
    expect(url).not.toContain("test-secret");

    const requestBody = JSON.parse(String(init.body));
    expect(requestBody.systemInstruction).toEqual({ parts: [{ text: "Be helpful." }] });
    expect(requestBody.contents).toEqual([
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi there." }] },
      { role: "user", parts: [{ text: "How are you?" }] },
    ]);
  });

  it("does not put system-role messages into Gemini contents", () => {
    expect(
      normalizeMessages([
        { role: "system", text: JARVIS_SYSTEM_INSTRUCTION },
        { role: "user", text: "Hello" },
      ]),
    ).toEqual([{ role: "user", parts: [{ text: "Hello" }] }]);
  });

  it("surfaces API errors returned by the backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ ok: false, error: "API key not valid." }, { status: 400 }),
      ),
    );

    await expect(
      callJarvisChat({ messages: [{ role: "user", text: "Hello" }] }),
    ).rejects.toThrow("API key not valid.");
  });

  it("calls the deployed Supabase function with its public client credentials", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project-ref.supabase.co/");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "public-anon-key");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ reply: "JARVIS online." }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callJarvisChat({ messages: [{ role: "user", text: "Hello" }] }),
    ).resolves.toMatchObject({ reply: "JARVIS online." });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://project-ref.supabase.co/functions/v1/jarvis-chat");
    expect(new Headers(init.headers).get("apikey")).toBe("public-anon-key");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer public-anon-key");
  });
});
