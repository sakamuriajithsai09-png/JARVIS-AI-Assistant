import type { ChatMsg, Memory } from "../jarvis-store";
import { getCurrentUser } from "./auth";
import {
  createCloudConversation,
  listCloudConversations,
  listCloudMessages,
  listCloudMemories,
  migrateCloudMemories,
  saveCloudMemory,
  saveCloudMessages,
} from "./cloud";

type CloudConversation = Awaited<ReturnType<typeof listCloudConversations>>[number];
type CloudMessage = Awaited<ReturnType<typeof listCloudMessages>>[number];
type CloudMemory = Awaited<ReturnType<typeof listCloudMemories>>[number];

const CHAT_STORAGE_KEY = "jarvis.chat";
const CHAT_OWNER_KEY = "jarvis.chat.owner";
const CHAT_ACTIVE_KEY = "jarvis.chat.active";
const MEMORY_STORAGE_KEY = "jarvis.memory";
const MEMORY_OWNER_KEY = "jarvis.memory.owner";
const LEGACY_UNCLAIMED_MEMORY_KEY = "jarvis.memory.legacy-unclaimed";

function preserveUnclaimedMemories(memories: Memory[]) {
  const serializedMemories = JSON.stringify(memories);

  for (let index = 0; ; index++) {
    const backupKey =
      index === 0 ? LEGACY_UNCLAIMED_MEMORY_KEY : `${LEGACY_UNCLAIMED_MEMORY_KEY}.${index}`;
    const existingBackup = localStorage.getItem(backupKey);

    if (existingBackup === serializedMemories) return;
    if (existingBackup === null) {
      localStorage.setItem(backupKey, serializedMemories);
      return;
    }
  }
}

function createUuid() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure random UUID generation is unavailable in this browser.");
  }
  return globalThis.crypto.randomUUID();
}

function parseLocalMessages(raw: string | null): ChatMsg[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (message): message is ChatMsg =>
      message !== null &&
      typeof message === "object" &&
      typeof message.id === "string" &&
      typeof message.text === "string" &&
      Number.isFinite(message.at) &&
      ["user", "assistant", "system"].includes(message.role),
  );
}

function withStableKeys(messages: ChatMsg[]) {
  return messages.map((message) => {
    if (message.error || message.idempotencyKey) return message;
    return { ...message, idempotencyKey: createUuid() };
  });
}

function toCloudMessage(message: ChatMsg) {
  if (!message.idempotencyKey) {
    throw new Error("A stable message idempotency key is required.");
  }
  return {
    idempotencyKey: message.idempotencyKey,
    role: message.role,
    content: message.text,
    createdAt: new Date(message.at).toISOString(),
  };
}

function toLocalMessage(message: CloudMessage): ChatMsg {
  return {
    id: message.id,
    role: message.role,
    text: message.content,
    at: Date.parse(message.created_at),
    idempotencyKey: message.idempotency_key,
  };
}

export function mergeChatMessages(local: ChatMsg[], cloud: ChatMsg[]) {
  const merged = new Map<string, ChatMsg>();
  for (const message of local) {
    merged.set(
      message.error ? `error:${message.id}` : (message.idempotencyKey ?? `local:${message.id}`),
      message,
    );
  }
  for (const message of cloud) {
    if (!message.error) {
      merged.set(message.idempotencyKey ?? `cloud:${message.id}`, message);
    }
  }
  return [...merged.values()].sort((a, b) => a.at - b.at);
}

function saveLocalChat(messages: ChatMsg[]) {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
}

function conversationTitle(messages: ChatMsg[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  return firstUserMessage?.text.trim().slice(0, 120) || "JARVIS Conversation";
}

function activeConversationStorageKey(userId: string) {
  return `${CHAT_ACTIVE_KEY}.${userId}`;
}

export async function syncLocalChat(localMessages: ChatMsg[], onOwnerChange?: () => void) {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error("Please sign in again to synchronize your conversations.");
  }

  const ownerId = localStorage.getItem(CHAT_OWNER_KEY);
  let migrationMessages = localMessages;
  if (ownerId && ownerId !== user.id) {
    const backupKey = `${CHAT_STORAGE_KEY}.backup.${ownerId}`;
    if (localStorage.getItem(backupKey) === null) {
      localStorage.setItem(backupKey, JSON.stringify(localMessages));
    }
    migrationMessages = [];
    saveLocalChat([]);
    onOwnerChange?.();
  }
  localStorage.setItem(CHAT_OWNER_KEY, user.id);

  const keyedMessages = withStableKeys(migrationMessages);
  saveLocalChat(keyedMessages);

  const conversations = await listCloudConversations();
  const activeKey = activeConversationStorageKey(user.id);
  const savedActiveId = localStorage.getItem(activeKey);
  let conversation = conversations.find((item) => item.id === savedActiveId);
  if (savedActiveId !== "") conversation ??= conversations[0];

  if (!conversation && keyedMessages.some((message) => !message.error)) {
    const createdConversation = await createCloudConversation({
      data: { title: conversationTitle(keyedMessages) },
    });
    if (!createdConversation) throw new Error("Could not create a cloud conversation.");
    conversation = createdConversation;
  }

  if (!conversation) {
    return { userId: user.id, conversationId: null, messages: keyedMessages };
  }

  localStorage.setItem(activeKey, conversation.id);
  const pendingMessages = keyedMessages.filter(
    (message) => !message.error && message.idempotencyKey,
  );

  for (let offset = 0; offset < pendingMessages.length; offset += 100) {
    await saveCloudMessages({
      data: {
        conversationId: conversation.id,
        messages: pendingMessages.slice(offset, offset + 100).map(toCloudMessage),
      },
    });
  }

  const cloudMessages = (
    await listCloudMessages({
      data: { conversationId: conversation.id },
    })
  ).map(toLocalMessage);
  const mergedMessages = mergeChatMessages(keyedMessages, cloudMessages);
  saveLocalChat(mergedMessages);

  return {
    userId: user.id,
    conversationId: conversation.id,
    messages: mergedMessages,
  };
}

export async function loadAllCloudChatMessages() {
  const conversations = await listCloudConversations();
  const messages = await Promise.all(
    conversations.map((conversation) =>
      listCloudMessages({ data: { conversationId: conversation.id } }),
    ),
  );
  return mergeChatMessages([], messages.flat().map(toLocalMessage));
}

export function getActiveCloudConversationId(userId: string) {
  return localStorage.getItem(activeConversationStorageKey(userId));
}

export function setActiveCloudConversationId(userId: string, conversationId: string) {
  localStorage.setItem(activeConversationStorageKey(userId), conversationId);
}

function categoryFromMemoryKey(memoryKey: string) {
  const [prefix, category] = memoryKey.split(":");
  if (prefix === "legacy" && category) return category;
  if (prefix && ["preference", "fact", "instruction", "other"].includes(prefix)) {
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }
  return "Other";
}

function toLocalMemory(memory: CloudMemory): Memory {
  return {
    id: memory.id,
    text: memory.memory_value,
    category: categoryFromMemoryKey(memory.memory_key),
    at: Date.parse(memory.updated_at),
    memoryKey: memory.memory_key,
  };
}

export async function syncLocalMemories(
  localMemories: Memory[],
  onLocalDataIsolation?: (localDataIsolated: boolean) => void,
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error("Please sign in again to synchronize your memories.");
  }

  const ownerId = localStorage.getItem(MEMORY_OWNER_KEY);
  const localDataIsolated = ownerId !== user.id;
  if (localDataIsolated && localMemories.length > 0) {
    if (ownerId) {
      const backupKey = `${MEMORY_STORAGE_KEY}.backup.${ownerId}`;
      if (localStorage.getItem(backupKey) === null) {
        localStorage.setItem(backupKey, JSON.stringify(localMemories));
      }
    } else {
      preserveUnclaimedMemories(localMemories);
    }
  }
  onLocalDataIsolation?.(localDataIsolated);

  const migrationMemories = localDataIsolated ? [] : localMemories;
  if (!localDataIsolated) {
    for (let offset = 0; offset < migrationMemories.length; offset += 100) {
      const batch = migrationMemories.slice(offset, offset + 100).map((memory) => ({
        memoryKey: memory.memoryKey ?? `legacy:${memory.category}:${memory.id}`,
        memoryValue: memory.text,
      }));
      await migrateCloudMemories({ data: { memories: batch } });
    }

    for (const memory of migrationMemories.filter((item) => item.pendingSync)) {
      const memoryKey = memory.memoryKey ?? `legacy:${memory.category}:${memory.id}`;
      await saveCloudMemory({
        data: { memoryKey, memoryValue: memory.text },
      });
    }
  }

  const cloudMemories = (await listCloudMemories()).map(toLocalMemory);
  localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(cloudMemories));
  localStorage.setItem(MEMORY_OWNER_KEY, user.id);
  return { userId: user.id, memories: cloudMemories, localDataIsolated };
}
