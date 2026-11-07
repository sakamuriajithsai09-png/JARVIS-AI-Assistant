import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, Page, Panel, btnGhost, input } from "@/components/jarvis/Shell";
import { useLocal, defaultSettings, normalizeGeminiModel, type Settings } from "@/lib/jarvis-store";
import { speak } from "@/lib/voice";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "AI Settings — JARVIS" },
      { name: "description", content: "Configure JARVIS's model, personality, voice and usage limits." },
      { property: "og:title", content: "AI Settings — JARVIS" },
      { property: "og:description", content: "Configure JARVIS's model, personality, voice and usage limits." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [s, setS] = useLocal<Settings>("jarvis.settings", defaultSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const model = normalizeGeminiModel(s.model);
  useEffect(() => {
    if (model !== s.model) setS((current) => ({ ...current, model }));
  }, [model, s.model, setS]);
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const label = "text-xs uppercase tracking-widest text-muted-foreground";

  return (
    <Shell>
      <Page title="SETTINGS" subtitle="Changes save automatically in this browser.">
        <Panel className="space-y-4">
          <div>
            <p className={label}>Model</p>
            <select className={`${input} mt-1`} value={model} onChange={(e) => set("model", e.target.value)}>
              <option value="gemini-3.8-flash">Gemini 3.8 Flash — fast</option>
            </select>
          </div>
          <div>
            <p className={label}>Custom instructions</p>
            <textarea className={`${input} mt-1 min-h-24`} value={s.instructions} onChange={(e) => set("instructions", e.target.value)} />
          </div>
          <div>
            <p className={label}>Daily message limit: {s.dailyLimit}</p>
            <input type="range" min={10} max={500} step={10} value={s.dailyLimit} onChange={(e) => set("dailyLimit", +e.target.value)} className="w-full accent-[var(--cyan)]" />
          </div>
        </Panel>
        <Panel className="space-y-4">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={s.voiceEnabled} onChange={(e) => set("voiceEnabled", e.target.checked)} className="accent-[var(--cyan)]" />
            <span>Speak replies aloud</span>
          </label>
          <div>
            <p className={label}>Voice</p>
            <select className={`${input} mt-1`} value={s.voiceName} onChange={(e) => set("voiceName", e.target.value)}>
              <option value="">System default</option>
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
            </select>
          </div>
          <div>
            <p className={label}>Speaking rate: {s.rate.toFixed(1)}×</p>
            <input type="range" min={0.6} max={1.6} step={0.1} value={s.rate} onChange={(e) => set("rate", +e.target.value)} className="w-full accent-[var(--cyan)]" />
          </div>
          <button className={btnGhost} onClick={() => speak("Good evening. JARVIS voice systems are online.", { voiceName: s.voiceName, rate: s.rate })}>
            Test voice
          </button>
        </Panel>
      </Page>
    </Shell>
  );
}
