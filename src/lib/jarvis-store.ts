import { useEffect, useState } from "react";

// Phase 1: browser-local storage. Phase 2 moves these to the secure database.
export function useLocal<T>(key: string, initial: T) {
  const [val, setVal] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setVal(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (ready) localStorage.setItem(key, JSON.stringify(val));
  }, [key, val, ready]);
  return [val, setVal] as const;
}

export type ChatMsg = { id: string; role: "user" | "assistant" | "system"; text: string; at: number; error?: boolean };
export type Memory = { id: string; text: string; category: string; at: number };
export type Settings = {
  model: string;
  instructions: string;
  voiceEnabled: boolean;
  voiceName: string;
  rate: number;
  dailyLimit: number;
};

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export function normalizeGeminiModel(model: string) {
  return model === "gemini-2.5-flash" || model === "gemini-2.5-pro" || model === "gemini-3.8-flash"
    ? DEFAULT_GEMINI_MODEL
    : model;
}

export const defaultSettings: Settings = {
  model: DEFAULT_GEMINI_MODEL,
  instructions:
    "You are JARVIS, a sophisticated personal AI assistant. You are intelligent, professional, calm, helpful and respectful. Understand natural language, provide accurate answers, explain complex subjects clearly and maintain conversational context. Address the user naturally. Never pretend to have performed actions you have not actually completed.",
  voiceEnabled: true,
  voiceName: "",
  rate: 1,
  dailyLimit: 100,
};

export const uid = () => Math.random().toString(36).slice(2, 10);
