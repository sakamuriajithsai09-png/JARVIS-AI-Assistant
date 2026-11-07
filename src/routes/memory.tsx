import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Shell, Page, Panel, Badge, btnPrimary, input } from "@/components/jarvis/Shell";
import { useLocal, uid, type Memory } from "@/lib/jarvis-store";

export const Route = createFileRoute("/memory")({
  head: () => ({
    meta: [
      { title: "Personal Memory — JARVIS" },
      { name: "description", content: "View, edit and delete what JARVIS remembers about you." },
      { property: "og:title", content: "Personal Memory — JARVIS" },
      { property: "og:description", content: "View, edit and delete what JARVIS remembers about you." },
    ],
  }),
  component: MemoryPage,
});

const cats = ["Preference", "Fact", "Instruction", "Other"];

function MemoryPage() {
  const [mems, setMems] = useLocal<Memory[]>("jarvis.memory", []);
  const [text, setText] = useState("");
  const [cat, setCat] = useState<string>("Preference");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <Shell>
      <Page title="MEMORY" subtitle="Only what you explicitly save is remembered. Nothing sensitive is stored automatically.">
        <Panel>
          <form
            className="flex flex-col md:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              setMems((m) => [{ id: uid(), text: text.trim(), category: cat, at: Date.now() }, ...m]);
              setText("");
            }}
          >
            <input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. I prefer metric units" />
            <select className={`${input} md:w-40`} value={cat} onChange={(e) => setCat(e.target.value)}>
              {cats.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className={btnPrimary} disabled={!text.trim()}>Save memory</button>
          </form>
        </Panel>
        {!mems.length && <Panel><p className="text-muted-foreground">No memories saved yet.</p></Panel>}
        {mems.map((m) => (
          <Panel key={m.id} className="!p-4 flex items-center gap-3">
            <Badge tone="neon">{m.category}</Badge>
            {editing === m.id ? (
              <input className={input} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            ) : (
              <p className="flex-1 text-sm">{m.text}</p>
            )}
            {editing === m.id ? (
              <>
                <button aria-label="Save" className="text-cyan" onClick={() => { setMems((all) => all.map((x) => (x.id === m.id ? { ...x, text: draft } : x))); setEditing(null); }}><Check className="h-4 w-4" /></button>
                <button aria-label="Cancel" className="text-muted-foreground" onClick={() => setEditing(null)}><X className="h-4 w-4" /></button>
              </>
            ) : (
              <>
                <button aria-label="Edit" className="text-muted-foreground hover:text-cyan" onClick={() => { setEditing(m.id); setDraft(m.text); }}><Pencil className="h-4 w-4" /></button>
                <button aria-label="Delete" className="text-muted-foreground hover:text-destructive" onClick={() => setMems((all) => all.filter((x) => x.id !== m.id))}><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </Panel>
        ))}
      </Page>
    </Shell>
  );
}
