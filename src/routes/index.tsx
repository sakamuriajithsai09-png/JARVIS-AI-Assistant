import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, RotateCcw, Send, Square, Trash2, Volume2, VolumeX } from "lucide-react";
import { Shell } from "@/components/jarvis/Shell";
import { Orb, type CoreState } from "@/components/jarvis/Orb";
import {
  useLocal,
  uid,
  defaultSettings,
  normalizeGeminiModel,
  type ChatMsg,
  type Settings,
} from "@/lib/jarvis-store";
import { callJarvisChat, JARVIS_SYSTEM_INSTRUCTION } from "@/lib/ai/jarvis-ai";
import { stopSpeaking, useSpeechRecognition, speak } from "@/lib/voice";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JARVIS Core - Personal AI Assistant" },
      {
        name: "description",
        content: "Talk to JARVIS by voice or text through the cosmic AI core.",
      },
      { property: "og:title", content: "JARVIS Core - Personal AI Assistant" },
      {
        property: "og:description",
        content: "Talk to JARVIS by voice or text through the cosmic AI core.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [msgs, setMsgs] = useLocal<ChatMsg[]>("jarvis.chat", []);
  const [settings] = useLocal<Settings>("jarvis.settings", defaultSettings);
  const [text, setText] = useState("");
  const [state, setState] = useState<CoreState>("idle");
  const [muted, setMuted] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const mutedRef = useRef(muted);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const inFlightRef = useRef(false);
  const lastReplyRef = useRef("");
  const errorTimeoutRef = useRef<number | null>(null);
  mutedRef.current = muted;

  const sendRef = useRef<(value: string) => void>(() => undefined);
  const sr = useSpeechRecognition((recognizedText) => sendRef.current(recognizedText));
  const { listening, stop: stopListening } = sr;

  const send = useCallback(
    async (value: string) => {
      const t = value.trim();
      if (!t || inFlightRef.current) return;

      inFlightRef.current = true;
      if (listening) stopListening();
      stopSpeaking();
      const userMessage: ChatMsg = { id: uid(), role: "user", text: t, at: Date.now() };
      const nextMessages = [...msgs, userMessage];

      setText("");
      setMsgs(nextMessages);
      setVoiceMessage(null);
      setState("processing");

      try {
        const response = await callJarvisChat({
          messages: nextMessages.map(({ role, text }) => ({ role, text })),
          model: normalizeGeminiModel(settings.model),
          systemInstruction: settings.instructions || JARVIS_SYSTEM_INSTRUCTION,
        });

        const assistantMessage: ChatMsg = {
          id: uid(),
          role: "assistant",
          text: response.reply,
          at: Date.now(),
        };
        setMsgs((current) => [...current, assistantMessage]);
        lastReplyRef.current = response.reply;

        if (settings.voiceEnabled && !mutedRef.current) {
          const started = speak(response.reply, {
            voiceName: settings.voiceName,
            rate: settings.rate,
            onStart: () => setState("speaking"),
            onEnd: () => setState((current) => (current === "speaking" ? "idle" : current)),
            onError: () => {
              setVoiceMessage("JARVIS replied, but speech output could not start.");
              setState("error");
            },
          });
          if (started) return;
          setVoiceMessage("JARVIS replied, but speech output is not supported in this browser.");
          setState("error");
          return;
        }

        setState("idle");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "JARVIS could not process the request.";
        setMsgs((current) => [
          ...current,
          { id: uid(), role: "assistant", text: message, at: Date.now(), error: true },
        ]);
        setState("error");
        if (errorTimeoutRef.current !== null) window.clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = window.setTimeout(() => {
          setState((current) => (current === "error" ? "idle" : current));
          errorTimeoutRef.current = null;
        }, 1800);
      } finally {
        inFlightRef.current = false;
      }
    },
    [listening, msgs, settings, setMsgs, stopListening],
  );
  sendRef.current = send;

  useEffect(() => {
    if (sr.error) {
      setState("error");
      return;
    }
    if (sr.listening) {
      setState((current) =>
        current === "processing" || current === "speaking" ? current : "listening",
      );
    } else {
      setState((current) => (current === "listening" ? "idle" : current));
    }
  }, [sr.error, sr.listening]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);
  useEffect(() => {
    taRef.current?.focus();
  }, []);
  useEffect(
    () => () => {
      stopSpeaking();
      if (errorTimeoutRef.current !== null) window.clearTimeout(errorTimeoutRef.current);
    },
    [],
  );

  const label = {
    idle: "STANDBY",
    listening: "LISTENING",
    processing: "PROCESSING",
    speaking: "SPEAKING",
    error: "VOICE / CORE ERROR",
  }[state];
  const voiceOutputEnabled = settings.voiceEnabled && !muted;
  const repeatLastReply = () => {
    if (!lastReplyRef.current || muted || !settings.voiceEnabled) return;
    setVoiceMessage(null);
    const started = speak(lastReplyRef.current, {
      voiceName: settings.voiceName,
      rate: settings.rate,
      onStart: () => setState("speaking"),
      onEnd: () => setState((current) => (current === "speaking" ? "idle" : current)),
      onError: () => {
        setVoiceMessage("Speech output could not start. Check your browser's audio settings.");
        setState("error");
      },
    });
    if (!started) {
      setVoiceMessage("Speech output is not supported in this browser.");
      setState("error");
    }
  };
  const stopReply = () => {
    stopSpeaking();
    setState((current) => (current === "speaking" ? "idle" : current));
  };
  const toggleMute = () => {
    if (!muted) {
      stopSpeaking();
      setState((current) => (current === "speaking" ? "idle" : current));
    }
    setMuted((current) => !current);
  };
  const toggleListening = () => {
    if (sr.listening) {
      sr.stop();
      return;
    }
    stopSpeaking();
    setState((current) => (current === "speaking" ? "idle" : current));
    sr.start();
  };
  const clearConversation = () => {
    sr.stop();
    stopSpeaking();
    lastReplyRef.current = "";
    setMsgs([]);
    setState("idle");
  };

  return (
    <Shell>
      <div className="mx-auto w-full max-w-4xl flex-1 flex flex-col px-4 md:px-8 pb-4 gap-4">
        <section className="glow-border glass rounded-3xl flex flex-col items-center py-6 md:py-10">
          <div className="hidden md:block">
            <Orb state={state} level={sr.level} size={300} />
          </div>
          <div className="md:hidden">
            <Orb state={state} level={sr.level} size={190} />
          </div>
          <h1 className="mt-4 font-display text-3xl md:text-5xl font-black tracking-[0.25em] text-gradient">
            JARVIS CORE
          </h1>
          <p className="mt-2 font-display text-[10px] md:text-xs tracking-[0.4em] text-muted-foreground">
            ALL SYSTEMS OPERATIONAL
          </p>
          <div className="mt-4 flex gap-3 text-[10px] md:text-xs font-display tracking-widest">
            <span
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1",
                sr.listening ? "border-cyan text-cyan" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  sr.listening ? "bg-cyan animate-pulse" : "bg-muted-foreground",
                )}
              />
              {label}
            </span>
            <span
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1",
                voiceOutputEnabled ? "border-neon/60 text-neon" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  voiceOutputEnabled ? "bg-neon animate-pulse" : "bg-muted-foreground",
                )}
              />
              {voiceOutputEnabled ? "VOICE ACTIVE" : "VOICE MUTED"}
            </span>
          </div>
        </section>

        {msgs.length > 0 && (
          <section className="glass rounded-2xl p-4 max-h-72 overflow-y-auto space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Session
              </span>
              <button
                onClick={clearConversation}
                className="text-muted-foreground hover:text-cyan"
                aria-label="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {msgs.map((m) => (
              <div
                key={m.id}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] text-sm whitespace-pre-wrap",
                    m.role === "user"
                      ? "rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2"
                      : "text-foreground",
                    m.error && "border-l-2 border-destructive pl-3 text-muted-foreground",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {state === "processing" && (
              <div className="text-sm text-cyan animate-pulse">JARVIS is processing...</div>
            )}
            <div ref={endRef} />
          </section>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
          className="glow-border glass rounded-2xl p-3 flex items-end gap-2 mt-auto"
        >
          <textarea
            ref={taRef}
            rows={1}
            value={sr.listening ? sr.interim || text : text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder={sr.listening ? "Listening..." : "Ask JARVIS anything..."}
            className="flex-1 resize-none bg-transparent px-2 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none max-h-40"
          />
          <button
            type="button"
            onClick={toggleMute}
            disabled={!settings.voiceEnabled}
            title={
              settings.voiceEnabled
                ? muted
                  ? "Unmute voice output"
                  : "Mute voice output"
                : "Enable reply speech in Settings"
            }
            className="p-2.5 rounded-xl text-muted-foreground hover:text-cyan disabled:opacity-40"
            aria-label={muted ? "Unmute voice" : "Mute voice"}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={toggleListening}
            disabled={!sr.supported || state === "processing"}
            title={
              !sr.supported
                ? "Voice input is not supported in this browser"
                : sr.listening
                  ? "Stop listening"
                  : "Start voice input"
            }
            className={cn(
              "p-2.5 rounded-xl border transition-all disabled:opacity-30",
              sr.listening
                ? "border-cyan text-cyan shadow-[0_0_16px_var(--cyan)] voice-mic-listening"
                : "text-muted-foreground hover:text-cyan",
            )}
            aria-label={sr.listening ? "Stop listening" : "Start listening"}
            aria-pressed={sr.listening}
          >
            {sr.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            type="submit"
            disabled={!text.trim() || state === "processing"}
            className="p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={stopReply}
            disabled={state !== "speaking"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-cyan/50 hover:text-cyan disabled:opacity-40"
            aria-label="Stop spoken reply"
          >
            <Square className="h-3.5 w-3.5" /> Stop
          </button>
          <button
            type="button"
            onClick={repeatLastReply}
            disabled={
              !lastReplyRef.current ||
              muted ||
              !settings.voiceEnabled ||
              sr.listening ||
              state === "processing"
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-cyan/50 hover:text-cyan disabled:opacity-40"
            aria-label="Repeat last JARVIS reply"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Repeat
          </button>
        </div>
        {(sr.error || voiceMessage || !sr.supported) && (
          <p className="text-xs text-muted-foreground text-center" role="status" aria-live="polite">
            {sr.error ??
              voiceMessage ??
              "Voice input isn't available in this browser. Type instead, or use Chrome or Edge."}
          </p>
        )}
      </div>
    </Shell>
  );
}
