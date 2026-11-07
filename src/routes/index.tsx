import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX, Trash2 } from "lucide-react";
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
import { useSpeechRecognition, speak } from "@/lib/voice";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JARVIS Core — Personal AI Assistant" },
      { name: "description", content: "Talk to JARVIS by voice or text through the cosmic AI core." },
      { property: "og:title", content: "JARVIS Core — Personal AI Assistant" },
      { property: "og:description", content: "Talk to JARVIS by voice or text through the cosmic AI core." },
    ],
  }),
  component: Index,
});

const OFFLINE =
  "My intelligence core isn't connected yet. Real AI responses arrive once the Gemini integration (Phase 3) is approved.";

function Index() {
  const [msgs, setMsgs] = useLocal<ChatMsg[]>("jarvis.chat", []);
  const [settings] = useLocal<Settings>("jarvis.settings", defaultSettings);
  const [text, setText] = useState("");
  const [state, setState] = useState<CoreState>("idle");
  const [muted, setMuted] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const send = async (value: string) => {
    const t = value.trim();
    if (!t || state === "thinking") return;

    const userMessage: ChatMsg = { id: uid(), role: "user", text: t, at: Date.now() };
    const nextMessages = [...msgs, userMessage];

    setText("");
    setMsgs(nextMessages);
    setState("thinking");

    try {
      const response = await callJarvisChat({
        messages: nextMessages.map(({ role, text }) => ({ role, text })),
        model: normalizeGeminiModel(settings.model),
        systemInstruction: settings.instructions || JARVIS_SYSTEM_INSTRUCTION,
      });

      const assistantMessage: ChatMsg = { id: uid(), role: "assistant", text: response.reply, at: Date.now() };
      setMsgs((current) => [...current, assistantMessage]);

      if (settings.voiceEnabled && !muted) {
        speak(response.reply, {
          voiceName: settings.voiceName,
          rate: settings.rate,
          onStart: () => setState("speaking"),
          onEnd: () => setState("idle"),
        });
        return;
      }

      setState("idle");
    } catch (error) {
      const message = error instanceof Error ? error.message : "JARVIS could not process the request.";
      setMsgs((current) => [...current, { id: uid(), role: "assistant", text: message, at: Date.now(), error: true }]);
      setState("error");
      setTimeout(() => setState("idle"), 1800);
    }
  };

  const sr = useSpeechRecognition((t) => send(t));

  useEffect(() => {
    if (sr.listening) setState("listening");
    else setState((s) => (s === "listening" ? "idle" : s));
  }, [sr.listening]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);
  useEffect(() => {
    taRef.current?.focus();
  }, []);

  const label = { idle: "STANDBY", listening: "LISTENING", thinking: "PROCESSING", speaking: "SPEAKING", error: "CORE OFFLINE" }[state];

  return (
    <Shell>
      <div className="mx-auto w-full max-w-4xl flex-1 flex flex-col px-4 md:px-8 pb-4 gap-4">
        <section className="glow-border glass rounded-3xl flex flex-col items-center py-6 md:py-10">
          <div className="hidden md:block"><Orb state={state} level={sr.level} size={300} /></div>
          <div className="md:hidden"><Orb state={state} level={sr.level} size={190} /></div>
          <h1 className="mt-4 font-display text-3xl md:text-5xl font-black tracking-[0.25em] text-gradient">JARVIS CORE</h1>
          <p className="mt-2 font-display text-[10px] md:text-xs tracking-[0.4em] text-muted-foreground">ALL SYSTEMS OPERATIONAL</p>
          <div className="mt-4 flex gap-3 text-[10px] md:text-xs font-display tracking-widest">
            <span className={cn("flex items-center gap-2 rounded-full border px-3 py-1", sr.listening ? "border-cyan text-cyan" : "text-muted-foreground")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", sr.listening ? "bg-cyan animate-pulse" : "bg-muted-foreground")} />
              {label}
            </span>
            <span className={cn("flex items-center gap-2 rounded-full border px-3 py-1", settings.voiceEnabled && !muted ? "border-neon/60 text-neon" : "text-muted-foreground")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", settings.voiceEnabled && !muted ? "bg-neon animate-pulse" : "bg-muted-foreground")} />
              {settings.voiceEnabled && !muted ? "VOICE ACTIVE" : "VOICE MUTED"}
            </span>
          </div>
        </section>

        {msgs.length > 0 && (
          <section className="glass rounded-2xl p-4 max-h-72 overflow-y-auto space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Session</span>
              <button onClick={() => setMsgs([])} className="text-muted-foreground hover:text-cyan" aria-label="Clear conversation">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {msgs.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] text-sm whitespace-pre-wrap",
                    m.role === "user" ? "rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2" : "text-foreground",
                    m.error && "border-l-2 border-destructive pl-3 text-muted-foreground",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {state === "thinking" && <div className="text-sm text-cyan animate-pulse">JARVIS is processing…</div>}
            <div ref={endRef} />
          </section>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); send(text); }}
          className="glow-border glass rounded-2xl p-3 flex items-end gap-2 mt-auto"
        >
          <textarea
            ref={taRef}
            rows={1}
            value={sr.listening ? sr.interim || text : text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
            placeholder={sr.listening ? "Listening…" : "Ask JARVIS anything…"}
            className="flex-1 resize-none bg-transparent px-2 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none max-h-40"
          />
          <button type="button" onClick={() => setMuted(!muted)} className="p-2.5 rounded-xl text-muted-foreground hover:text-cyan" aria-label={muted ? "Unmute voice" : "Mute voice"}>
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => (sr.listening ? sr.stop() : sr.start())}
            disabled={!sr.supported}
            title={sr.supported ? "Voice input" : "Voice input not supported in this browser"}
            className={cn("p-2.5 rounded-xl border transition-all disabled:opacity-30", sr.listening ? "border-cyan text-cyan shadow-[0_0_16px_var(--cyan)]" : "text-muted-foreground hover:text-cyan")}
            aria-label={sr.listening ? "Stop listening" : "Start listening"}
          >
            {sr.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button type="submit" disabled={!text.trim() || state === "thinking"} className="p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-40" aria-label="Send">
            <Send className="h-5 w-5" />
          </button>
        </form>
        {(sr.error || !sr.supported) && (
          <p className="text-xs text-muted-foreground text-center">
            {sr.error ?? "Voice input isn't available in this browser — type instead, or use Chrome/Edge."}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/70 text-center">
          Live Gemini mode requires a configured GEMINI_API_KEY and Supabase Edge Function. <Link to="/status" className="text-cyan">System status</Link>
        </p>
      </div>
    </Shell>
  );
}
