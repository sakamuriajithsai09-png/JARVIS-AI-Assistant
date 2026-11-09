import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listCloudConversations: vi.fn(),
  createCloudConversation: vi.fn(),
  listCloudMessages: vi.fn(),
  saveCloudMessages: vi.fn(),
  listCloudMemories: vi.fn(),
  migrateCloudMemories: vi.fn(),
  saveCloudMemory: vi.fn(),
}));

vi.mock("./auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("./cloud", () => ({
  listCloudConversations: mocks.listCloudConversations,
  createCloudConversation: mocks.createCloudConversation,
  listCloudMessages: mocks.listCloudMessages,
  saveCloudMessages: mocks.saveCloudMessages,
  listCloudMemories: mocks.listCloudMemories,
  migrateCloudMemories: mocks.migrateCloudMemories,
  saveCloudMemory: mocks.saveCloudMemory,
}));

import { mergeChatMessages, syncLocalChat, syncLocalMemories } from "./cloud-sync";
import type { ChatMsg, Memory } from "../jarvis-store";

const conversation = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Test conversation",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000002" });
  mocks.getCurrentUser.mockResolvedValue({ id: "user-a", email: null });
  mocks.listCloudConversations.mockResolvedValue([conversation]);
  mocks.createCloudConversation.mockResolvedValue(conversation);
  mocks.listCloudMessages.mockResolvedValue([]);
  mocks.saveCloudMessages.mockResolvedValue([]);
  mocks.listCloudMemories.mockResolvedValue([]);
  mocks.migrateCloudMemories.mockResolvedValue([]);
  mocks.saveCloudMemory.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("cloud chat synchronization", () => {
  it("reuses the persisted idempotency UUID after a failed migration retry", async () => {
    const localMessage: ChatMsg = {
      id: "old-local-id",
      role: "user",
      text: "Remember this conversation",
      at: Date.parse("2026-01-02T00:00:00.000Z"),
    };
    mocks.listCloudConversations.mockResolvedValueOnce([]).mockResolvedValue([conversation]);
    mocks.saveCloudMessages
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce([]);

    await expect(syncLocalChat([localMessage])).rejects.toThrow("network unavailable");
    const persisted = JSON.parse(localStorage.getItem("jarvis.chat") ?? "[]") as ChatMsg[];
    expect(persisted[0]?.idempotencyKey).toBe("00000000-0000-4000-8000-000000000002");

    await syncLocalChat(persisted);

    const firstSave = mocks.saveCloudMessages.mock.calls[0]?.[0].data.messages[0];
    const retrySave = mocks.saveCloudMessages.mock.calls[1]?.[0].data.messages[0];
    expect(retrySave.idempotencyKey).toBe(firstSave.idempotencyKey);
    expect(retrySave.content).toBe(firstSave.content);
  });

  it("deduplicates retries and prefers the cloud copy of an existing message", () => {
    const localMessage: ChatMsg = {
      id: "local",
      role: "user",
      text: "stale local copy",
      at: 100,
      idempotencyKey: "stable-key",
    };
    const cloudMessage: ChatMsg = {
      id: "cloud",
      role: "user",
      text: "newer cloud copy",
      at: 100,
      idempotencyKey: "stable-key",
    };

    expect(mergeChatMessages([localMessage], [cloudMessage])).toEqual([cloudMessage]);
  });

  it("backs up and excludes another account's local messages during account switching", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-b", email: null });
    localStorage.setItem("jarvis.chat.owner", "user-a");
    const previousAccountMessages: ChatMsg[] = [
      {
        id: "private-user-a-message",
        role: "user",
        text: "private conversation",
        at: 100,
      },
    ];
    const onOwnerChange = vi.fn();

    const result = await syncLocalChat(previousAccountMessages, onOwnerChange);

    expect(onOwnerChange).toHaveBeenCalledOnce();
    expect(localStorage.getItem("jarvis.chat.owner")).toBe("user-b");
    expect(JSON.parse(localStorage.getItem("jarvis.chat.backup.user-a") ?? "[]")).toEqual(
      previousAccountMessages,
    );
    expect(JSON.parse(localStorage.getItem("jarvis.chat") ?? "[]")).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(mocks.saveCloudMessages).not.toHaveBeenCalled();
    expect(mocks.createCloudConversation).not.toHaveBeenCalled();
  });
});

describe("cloud memory synchronization", () => {
  it("does not overwrite a newer cloud memory with stale local data", async () => {
    const localMemory: Memory = {
      id: "local-memory",
      text: "old local value",
      category: "Fact",
      at: 100,
    };
    mocks.listCloudMemories.mockResolvedValue([
      {
        id: "cloud-memory",
        memory_key: "legacy:Fact:local-memory",
        memory_value: "newer cloud value",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-02-01T00:00:00.000Z",
      },
    ]);

    const result = await syncLocalMemories([localMemory]);

    expect(mocks.saveCloudMemory).not.toHaveBeenCalled();
    expect(result.memories[0]?.text).toBe("newer cloud value");
    expect(JSON.parse(localStorage.getItem("jarvis.memory") ?? "[]")[0].text).toBe(
      "newer cloud value",
    );
  });

  it("backs up account A memories and never migrates pending entries into account B", async () => {
    const accountAMemories: Memory[] = [
      {
        id: "memory-a",
        text: "private account A memory",
        category: "Fact",
        at: 100,
        memoryKey: "fact:memory-a",
        pendingSync: true,
      },
    ];
    mocks.getCurrentUser.mockResolvedValue({ id: "user-b", email: null });
    localStorage.setItem("jarvis.memory.owner", "user-a");
    localStorage.setItem("jarvis.memory", JSON.stringify(accountAMemories));
    mocks.listCloudMemories.mockResolvedValue([
      {
        id: "memory-b",
        memory_key: "fact:memory-b",
        memory_value: "private account B memory",
        created_at: "2026-02-01T00:00:00.000Z",
        updated_at: "2026-02-01T00:00:00.000Z",
      },
    ]);
    const onOwnerChange = vi.fn();

    const result = await syncLocalMemories(accountAMemories, onOwnerChange);

    expect(onOwnerChange).toHaveBeenCalledWith(true);
    expect(result.localDataIsolated).toBe(true);
    expect(localStorage.getItem("jarvis.memory.owner")).toBe("user-b");
    expect(JSON.parse(localStorage.getItem("jarvis.memory.backup.user-a") ?? "[]")).toEqual(
      accountAMemories,
    );
    expect(JSON.parse(localStorage.getItem("jarvis.memory") ?? "[]")[0].text).toBe(
      "private account B memory",
    );
    expect(mocks.migrateCloudMemories).not.toHaveBeenCalled();
    expect(mocks.saveCloudMemory).not.toHaveBeenCalled();
  });

  it("preserves ownerless memories and existing backups when cloud loads fail repeatedly", async () => {
    const previousMemories: Memory[] = [
      {
        id: "memory-a",
        text: "private account A memory",
        category: "Fact",
        at: 100,
        pendingSync: true,
      },
    ];
    const existingUnclaimedBackup = JSON.stringify([
      {
        id: "earlier-memory",
        text: "preserve this earlier unclaimed memory",
        category: "Fact",
        at: 50,
      },
    ]);
    mocks.getCurrentUser.mockResolvedValue({ id: "user-a", email: null });
    localStorage.setItem("jarvis.memory", JSON.stringify(previousMemories));
    localStorage.setItem("jarvis.memory.legacy-unclaimed", existingUnclaimedBackup);
    mocks.listCloudMemories
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockRejectedValueOnce(new Error("network unavailable"));
    const onIsolationChange = vi.fn();

    await expect(syncLocalMemories(previousMemories, onIsolationChange)).rejects.toThrow(
      "network unavailable",
    );
    const additionalBackup = localStorage.getItem("jarvis.memory.legacy-unclaimed.1");
    expect(additionalBackup).toBe(JSON.stringify(previousMemories));

    await expect(syncLocalMemories(previousMemories, onIsolationChange)).rejects.toThrow(
      "network unavailable",
    );

    expect(onIsolationChange).toHaveBeenNthCalledWith(1, true);
    expect(onIsolationChange).toHaveBeenNthCalledWith(2, true);
    expect(localStorage.getItem("jarvis.memory.owner")).toBeNull();
    expect(JSON.parse(localStorage.getItem("jarvis.memory") ?? "[]")).toEqual(previousMemories);
    expect(localStorage.getItem("jarvis.memory.legacy-unclaimed")).toBe(existingUnclaimedBackup);
    expect(localStorage.getItem("jarvis.memory.legacy-unclaimed.1")).toBe(additionalBackup);
    expect(mocks.migrateCloudMemories).not.toHaveBeenCalled();
    expect(mocks.saveCloudMemory).not.toHaveBeenCalled();
  });

  it("backs up ownerless memories without migrating them across repeated syncs", async () => {
    const ownerlessMemories: Memory[] = [
      {
        id: "legacy-memory",
        text: "must not be assigned to account A",
        category: "Fact",
        at: 100,
        memoryKey: "fact:legacy-memory",
        pendingSync: true,
      },
    ];
    mocks.getCurrentUser.mockResolvedValue({ id: "user-a", email: null });
    mocks.listCloudMemories.mockResolvedValue([]);

    localStorage.setItem("jarvis.memory", JSON.stringify(ownerlessMemories));
    const firstResult = await syncLocalMemories(ownerlessMemories);
    const secondResult = await syncLocalMemories(firstResult.memories);

    expect(firstResult.localDataIsolated).toBe(true);
    expect(secondResult.localDataIsolated).toBe(false);
    expect(localStorage.getItem("jarvis.memory.legacy-unclaimed")).toBe(
      JSON.stringify(ownerlessMemories),
    );
    expect(localStorage.getItem("jarvis.memory.owner")).toBe("user-a");
    expect(mocks.migrateCloudMemories).not.toHaveBeenCalled();
    expect(mocks.saveCloudMemory).not.toHaveBeenCalled();
  });

  it("continues syncing pending memories for their existing owner", async () => {
    const pendingMemory: Memory = {
      id: "pending-memory",
      text: "pending account A memory",
      category: "Fact",
      at: 100,
      memoryKey: "fact:pending-memory",
      pendingSync: true,
    };
    mocks.getCurrentUser.mockResolvedValue({ id: "user-a", email: null });
    localStorage.setItem("jarvis.memory.owner", "user-a");
    mocks.listCloudMemories.mockResolvedValue([
      {
        id: "cloud-memory",
        memory_key: "fact:pending-memory",
        memory_value: "pending account A memory",
        created_at: "2026-02-01T00:00:00.000Z",
        updated_at: "2026-02-01T00:00:00.000Z",
      },
    ]);

    const result = await syncLocalMemories([pendingMemory]);

    expect(result.localDataIsolated).toBe(false);
    expect(mocks.migrateCloudMemories).toHaveBeenCalledWith({
      data: {
        memories: [
          {
            memoryKey: "fact:pending-memory",
            memoryValue: "pending account A memory",
          },
        ],
      },
    });
    expect(mocks.saveCloudMemory).toHaveBeenCalledWith({
      data: {
        memoryKey: "fact:pending-memory",
        memoryValue: "pending account A memory",
      },
    });
    expect(JSON.parse(localStorage.getItem("jarvis.memory") ?? "[]")[0].text).toBe(
      "pending account A memory",
    );
  });
});
