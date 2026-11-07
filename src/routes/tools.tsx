import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calculator, Clock, Search, Bell, FileText, Image, ShieldCheck } from "lucide-react";
import { Shell, Page, Panel, Badge, input } from "@/components/jarvis/Shell";

export const Route = createFileRoute("/tools")({
  head: () => ({
    meta: [
      { title: "Connected Tools — JARVIS" },
      { name: "description", content: "The tools JARVIS can use: calculator, time, search, reminders, files and images." },
      { property: "og:title", content: "Connected Tools — JARVIS" },
      { property: "og:description", content: "The tools JARVIS can use: calculator, time, search, reminders, files and images." },
    ],
  }),
  component: ToolsPage,
});

function safeCalc(expr: string) {
  if (!/^[\d+\-*/().\s%]+$/.test(expr)) return "Numbers and + − × ÷ only";
  try { const r = Function(`"use strict";return (${expr})`)(); return Number.isFinite(r) ? String(r) : "Invalid"; } catch { return "Invalid"; }
}

const planned = [
  { icon: Search, name: "Web search", phase: "Phase 5" },
  { icon: Bell, name: "Reminders", phase: "Phase 5" },
  { icon: FileText, name: "File summarisation", phase: "Phase 5" },
  { icon: Image, name: "Image understanding", phase: "Phase 5" },
  { icon: ShieldCheck, name: "Approved automation", phase: "Phase 5" },
];

function ToolsPage() {
  const [expr, setExpr] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <Shell>
      <Page title="TOOLS" subtitle="JARVIS asks for your confirmation before any consequential action.">
        <div className="grid md:grid-cols-2 gap-4">
          <Panel>
            <div className="flex items-center gap-2"><Calculator className="h-4 w-4 text-cyan" /> Calculator <Badge tone="cyan">Online</Badge></div>
            <input className={`${input} mt-3`} value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="(12 + 8) * 3" />
            <p className="mt-2 font-display text-xl text-cyan">{expr ? safeCalc(expr) : "—"}</p>
          </Panel>
          <Panel>
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-cyan" /> Date & time <Badge tone="cyan">Online</Badge></div>
            <p className="mt-3 font-display text-2xl text-cyan">{now?.toLocaleTimeString() ?? "—"}</p>
            <p className="text-sm text-muted-foreground">{now?.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          </Panel>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {planned.map((p) => (
            <Panel key={p.name} className="!p-4 flex items-center gap-3 opacity-80">
              <p.icon className="h-4 w-4 text-neon" />
              <span className="flex-1 text-sm">{p.name}</span>
              <Badge>{p.phase}</Badge>
            </Panel>
          ))}
        </div>
      </Page>
    </Shell>
  );
}
