import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { callJarvisChat } from "@/lib/ai/jarvis-ai";
import { Shell, Page, Panel, Badge } from "@/components/jarvis/Shell";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "System Status - JARVIS" },
      { name: "description", content: "Live status of JARVIS systems." },
    ],
  }),
  component: StatusPage,
});

type Check = {
  name: string;
  ok: boolean;
  note: string;
};

function StatusPage() {
  const [checks, setChecks] = useState<Check[]>([
    { name: "Interface", ok: true, note: "Running" },
    { name: "Network", ok: navigator.onLine, note: navigator.onLine ? "Online" : "Offline" },
    { name: "Voice input", ok: false, note: "Checking..." },
    { name: "Voice output", ok: false, note: "Checking..." },
    { name: "AI intelligence (Gemini)", ok: false, note: "Testing connection..." },
  ]);

  useEffect(() => {
    const w = window as any;

    setChecks((previous) => [
      ...previous.filter((c) => c.name !== "Voice input" && c.name !== "Voice output"),
      { name: "Voice input", ok: !!(w.SpeechRecognition || w.webkitSpeechRecognition), note: "Browser speech recognition" },
      { name: "Voice output", ok: !!window.speechSynthesis, note: "Browser speech synthesis" },
    ]);

    let active = true;

    callJarvisChat({
      messages: [{ role: "user", text: "Reply with exactly: JARVIS ONLINE" }],
      model: "gemini-3.5-flash-lite",
    })
      .then((result) => {
        if (!active) return;
        setChecks((previous) => previous.map((c) =>
          c.name === "AI intelligence (Gemini)"
            ? { ...c, ok: true, note: `Connected - ${result.usage?.model || "Gemini"}` }
            : c
        ));
      })
      .catch((error) => {
        if (!active) return;
        setChecks((previous) => previous.map((c) =>
          c.name === "AI intelligence (Gemini)"
            ? { ...c, ok: false, note: error instanceof Error ? error.message : "Connection failed" }
            : c
        ));
      });

    return () => {
      active = false;
    };
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
