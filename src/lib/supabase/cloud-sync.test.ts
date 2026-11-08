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

import {
  mergeChatMessages,
  syncLocalChat,
  syncLocalMemories,
} from "./cloud-sync";
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
    mocks.listCloudConversations
      .mockResolvedValueOnce([])
      .mockResolvedValue([conversation]);
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
    const previousAccountMessages: ChatMsg[] = [{
      id: "private-user-a-message",
      role: "user",
      text: "private conversation",
      at: 100,
    }];
    const onOwnerChange = vi.fn();

    const result = await syncLocalChat(previousAccountMessages, onOwnerChange);

    expect(onOwnerChange).toHaveBeenCalledOnce();
    expect(localStorage.getItem("jarvis.chat.owner")).toBe("user-b");
    expect(JSON.parse(localStorage.getItem("jarvis.chat.backup.user-a") ?? "[]"))
      .toEqual(previousAccountMessages);
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
    mocks.listCloudMemories.mockResolvedValue([{
      id: "cloud-memory",
      memory_key: "legacy:Fact:local-memory",
      memory_value: "newer cloud value",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z",
    }]);

    const result = await syncLocalMemories([localMemory]);

    expect(mocks.saveCloudMemory).not.toHaveBeenCalled();
    expect(result.memories[0]?.text).toBe("newer cloud value");
    expect(JSON.parse(localStorage.getItem("jarvis.memory") ?? "[]")[0].text)
      .toBe("newer cloud value");
  });
});
