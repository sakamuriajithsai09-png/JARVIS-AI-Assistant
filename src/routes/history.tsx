import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Shell, Page, Panel, btnGhost } from "@/components/jarvis/Shell";
import { useLocal, type ChatMsg } from "@/lib/jarvis-store";
import { deleteAllCloudConversations } from "@/lib/supabase/cloud";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  loadAllCloudChatMessages,
  mergeChatMessages,
  syncLocalChat,
} from "@/lib/supabase/cloud-sync";

export const Route = createFileRoute("/history")({
  beforeLoad: async () => {
    if (!(await getCurrentUser())) throw redirect({ to: "/auth" });
  },
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
  const [msgs, setMsgs, localReady] = useLocal<ChatMsg[]>("jarvis.chat", []);
  const [displayMsgs, setDisplayMsgs] = useState<ChatMsg[]>([]);
  const [cloudMessage, setCloudMessage] = useState("");
  const messagesRef = useRef(msgs);
  messagesRef.current = msgs;

  useEffect(() => {
    if (!localReady) return;
    let active = true;
    void syncLocalChat(messagesRef.current, () => {
      messagesRef.current = [];
      setMsgs([]);
      setDisplayMsgs([]);
    }).then(async (syncResult) => {
      if (JSON.stringify(syncResult.messages) !== JSON.stringify(messagesRef.current)) {
        setMsgs(syncResult.messages);
      }
      const cloudMessages = await loadAllCloudChatMessages();
      if (active) {
        setDisplayMsgs(mergeChatMessages(syncResult.messages, cloudMessages));
        setCloudMessage("");
      }
    }).catch((error: unknown) => {
      if (active) {
        setCloudMessage(
          error instanceof Error ? `Cloud history is unavailable: ${error.message}` : "Cloud history is unavailable.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [localReady, setMsgs]);

  const clearHistory = async () => {
    if (!confirm("Clear all conversation history?")) return;
    try {
      await deleteAllCloudConversations();
      setMsgs([]);
      setDisplayMsgs([]);
      setCloudMessage("");
    } catch (error) {
      setCloudMessage(
        error instanceof Error ? `Could not clear cloud history: ${error.message}` : "Could not clear cloud history.",
      );
    }
  };

  return (
    <Shell>
      <Page title="HISTORY" subtitle="Your synchronized conversation log. Local data is preserved while cloud sync is pending.">
        <div className="flex gap-2">
          <button className={btnGhost} disabled={!displayMsgs.length} onClick={() => void clearHistory()}>
            Clear history
          </button>
        </div>
        {!displayMsgs.length && (
          <Panel><p className="text-muted-foreground">No conversations yet. <Link to="/" className="text-cyan">Talk to JARVIS</Link>.</p></Panel>
        )}
        {displayMsgs.map((m) => (
          <Panel key={m.id} className="!p-4">
            <div className="flex justify-between text-xs text-muted-foreground uppercase tracking-wider">
              <span className={m.role === "user" ? "text-cyan" : "text-neon"}>{m.role === "user" ? "You" : "JARVIS"}</span>
              <span>{new Date(m.at).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-sm">{m.text}</p>
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
