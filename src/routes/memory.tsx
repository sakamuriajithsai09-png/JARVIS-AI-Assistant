import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Shell, Page, Panel, Badge, btnPrimary, input } from "@/components/jarvis/Shell";
import { useLocal, uid, type Memory } from "@/lib/jarvis-store";
import { deleteCloudMemory, saveCloudMemory } from "@/lib/supabase/cloud";
import { syncLocalMemories } from "@/lib/supabase/cloud-sync";
import { getCurrentUser } from "@/lib/supabase/auth";

export const Route = createFileRoute("/memory")({
  beforeLoad: async () => {
    if (!(await getCurrentUser())) throw redirect({ to: "/auth" });
  },
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
  const [mems, setMems, localReady] = useLocal<Memory[]>("jarvis.memory", []);
  const [text, setText] = useState("");
  const [cat, setCat] = useState<string>("Preference");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [cloudMessage, setCloudMessage] = useState("");
  const memoriesRef = useRef(mems);
  memoriesRef.current = mems;

  const syncMemories = useCallback(async () => {
    if (!localReady) return;
    try {
      const { memories } = await syncLocalMemories(memoriesRef.current);
      setMems((current) => {
        const pending = current.filter((memory) => memory.pendingSync);
        const pendingKeys = new Set(
          pending.map((memory) => memory.memoryKey ?? `legacy:${memory.category}:${memory.id}`),
        );
        const syncedPending = pending.map((memory) => {
          const key = memory.memoryKey ?? `legacy:${memory.category}:${memory.id}`;
          const saved = memories.find((item) => item.memoryKey === key);
          return saved ? { ...saved, pendingSync: false } : memory;
        });
        return [
          ...syncedPending,
          ...memories.filter((memory) => !pendingKeys.has(memory.memoryKey ?? "")),
        ];
      });
      setCloudMessage("");
    } catch (error) {
      setCloudMessage(
        error instanceof Error ? `Cloud sync pending: ${error.message}` : "Cloud memory sync is pending.",
      );
    }
  }, [localReady, setMems]);

  useEffect(() => {
    if (!localReady) return;
    void syncMemories();
    window.addEventListener("online", syncMemories);
    return () => window.removeEventListener("online", syncMemories);
  }, [localReady, syncMemories]);

  const saveMemory = async (memory: Memory) => {
    const memoryKey = memory.memoryKey ??
      `legacy:${memory.category}:${memory.id}`;
    const updatedMemory = {
      ...memory,
      at: Date.now(),
      memoryKey,
      pendingSync: true,
    };
    setMems((all) => all.map((item) => item.id === memory.id ? updatedMemory : item));
    try {
      const saved = await saveCloudMemory({
        data: { memoryKey, memoryValue: memory.text },
      });
      if (!saved) throw new Error("Cloud memory was not saved.");
      setMems((all) => all.map((item) => item.id === memory.id
        ? { ...item, at: Date.parse(saved.updated_at), pendingSync: false }
        : item));
      setCloudMessage("");
    } catch (error) {
      setCloudMessage(
        error instanceof Error ? `Cloud sync pending: ${error.message}` : "Cloud memory sync is pending.",
      );
    }
  };

  const removeMemory = async (memory: Memory) => {
    const memoryKey = memory.memoryKey ??
      `legacy:${memory.category}:${memory.id}`;
    try {
      await deleteCloudMemory({ data: { memoryKey } });
      setMems((all) => all.filter((item) => item.id !== memory.id));
      setCloudMessage("");
    } catch (error) {
      setCloudMessage(
        error instanceof Error ? `Cloud sync pending: ${error.message}` : "Cloud memory sync is pending.",
      );
    }
  };

  return (
    <Shell>
      <Page title="MEMORY" subtitle="Only what you explicitly save is remembered. Nothing sensitive is stored automatically.">
        <Panel>
          <form
            className="flex flex-col md:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              const memory: Memory = {
                id: uid(),
                text: text.trim(),
                category: cat,
                at: Date.now(),
                memoryKey: `${cat.toLowerCase()}:${crypto.randomUUID()}`,
                pendingSync: true,
              };
              setMems((m) => [memory, ...m]);
              void saveMemory(memory);
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
                <button aria-label="Save" className="text-cyan" onClick={() => { if (!draft.trim()) return; void saveMemory({ ...m, text: draft.trim() }); setEditing(null); }}><Check className="h-4 w-4" /></button>
                <button aria-label="Cancel" className="text-muted-foreground" onClick={() => setEditing(null)}><X className="h-4 w-4" /></button>
              </>
            ) : (
              <>
                <button aria-label="Edit" className="text-muted-foreground hover:text-cyan" onClick={() => { setEditing(m.id); setDraft(m.text); }}><Pencil className="h-4 w-4" /></button>
                <button aria-label="Delete" className="text-muted-foreground hover:text-destructive" onClick={() => { void removeMemory(m); }}><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </Panel>
        ))}
        {cloudMessage && (
          <p className="text-center text-xs text-muted-foreground" role="status">
            {cloudMessage}
          </p>
        )}
      </Page>
    </Shell>
  );
}
