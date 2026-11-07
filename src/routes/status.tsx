import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, Page, Panel, Badge } from "@/components/jarvis/Shell";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "System Status — JARVIS" },
      { name: "description", content: "Live status of JARVIS's interface, voice, memory and AI subsystems." },
      { property: "og:title", content: "System Status — JARVIS" },
      { property: "og:description", content: "Live status of JARVIS's interface, voice, memory and AI subsystems." },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  const [checks, setChecks] = useState<{ name: string; ok: boolean; note: string }[]>([]);
  useEffect(() => {
    const w = window as any;
    setChecks([
      { name: "Interface", ok: true, note: "Running" },
      { name: "Voice input", ok: !!(w.SpeechRecognition || w.webkitSpeechRecognition), note: "Browser speech recognition" },
      { name: "Voice output", ok: !!window.speechSynthesis, note: "Browser speech synthesis" },
      { name: "Network", ok: navigator.onLine, note: navigator.onLine ? "Online" : "Offline" },
      { name: "Cloud database & sign-in", ok: false, note: "Phase 2" },
      { name: "AI intelligence (Gemini)", ok: false, note: "Awaiting GEMINI_API_KEY secret" },
      { name: "Tools & memory sync", ok: false, note: "Phase 5" },
    ]);
  }, []);
  return (
    <Shell>
      <Page title="STATUS" subtitle="Live checks from this device.">
        {checks.map((c) => (
          <Panel key={c.name} className="!p-4 flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${c.ok ? "bg-cyan shadow-[0_0_10px_var(--cyan)]" : "bg-muted-foreground"}`} />
            <span className="flex-1">{c.name}</span>
            <Badge tone={c.ok ? "cyan" : "muted"}>{c.ok ? "Online" : c.note}</Badge>
          </Panel>
        ))}
      </Page>
    </Shell>
  );
}
