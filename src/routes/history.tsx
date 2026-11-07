import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell, Page, Panel, btnGhost } from "@/components/jarvis/Shell";
import { useLocal, type ChatMsg } from "@/lib/jarvis-store";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Conversation History — JARVIS" },
      { name: "description", content: "Review and clear your conversations with JARVIS." },
      { property: "og:title", content: "Conversation History — JARVIS" },
      { property: "og:description", content: "Review and clear your conversations with JARVIS." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const [msgs, setMsgs] = useLocal<ChatMsg[]>("jarvis.chat", []);
  return (
    <Shell>
      <Page title="HISTORY" subtitle="Your conversation log. Stored in this browser until cloud sync arrives in Phase 2.">
        <div className="flex gap-2">
          <button className={btnGhost} disabled={!msgs.length} onClick={() => confirm("Clear all conversation history?") && setMsgs([])}>
            Clear history
          </button>
        </div>
        {!msgs.length && (
          <Panel><p className="text-muted-foreground">No conversations yet. <Link to="/" className="text-cyan">Talk to JARVIS</Link>.</p></Panel>
        )}
        {msgs.map((m) => (
          <Panel key={m.id} className="!p-4">
            <div className="flex justify-between text-xs text-muted-foreground uppercase tracking-wider">
              <span className={m.role === "user" ? "text-cyan" : "text-neon"}>{m.role === "user" ? "You" : "JARVIS"}</span>
              <span>{new Date(m.at).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-sm">{m.text}</p>
          </Panel>
        ))}
      </Page>
    </Shell>
  );
}
