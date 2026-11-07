import { createFileRoute } from "@tanstack/react-router";
import { Monitor, FolderOpen, Play, Link2 } from "lucide-react";
import { Shell, Page, Panel, Badge } from "@/components/jarvis/Shell";

export const Route = createFileRoute("/automation")({
  head: () => ({
    meta: [
      { title: "Automation Centre — JARVIS" },
      { name: "description", content: "Approved automations and the upcoming Windows desktop companion." },
      { property: "og:title", content: "Automation Centre — JARVIS" },
      { property: "og:description", content: "Approved automations and the upcoming Windows desktop companion." },
    ],
  }),
  component: AutomationPage,
});

const desktop = [
  { icon: Play, t: "Open selected applications" },
  { icon: FolderOpen, t: "Access files you choose" },
  { icon: Monitor, t: "Run approved local tasks" },
  { icon: Link2, t: "Secure link with this web app" },
];

function AutomationPage() {
  return (
    <Shell>
      <Page title="AUTOMATION" subtitle="Every automation requires your explicit approval before it runs.">
        <Panel>
          <p className="text-muted-foreground text-sm">
            No automations yet. Once the AI core is connected you'll be able to ask JARVIS to create routines here, each one shown for approval first.
          </p>
        </Panel>
        <Panel>
          <div className="flex items-center gap-2"><Monitor className="h-4 w-4 text-neon" /> Windows desktop companion <Badge>Phase 7</Badge></div>
          <p className="mt-2 text-sm text-muted-foreground">
            A web browser cannot control your PC. A separate, optional desktop app will be built later to handle these with your permission:
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            {desktop.map((d) => (
              <div key={d.t} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><d.icon className="h-4 w-4 text-cyan" /> {d.t}</div>
            ))}
          </div>
        </Panel>
      </Page>
    </Shell>
  );
}
