import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { createClient } from "./server";

const uuidSchema = z.string().uuid();
const conversationTitleSchema = z.string().trim().min(1).max(120);
const memoryKeySchema = z.string().trim().min(1).max(160);
const memoryValueSchema = z.string().trim().min(1).max(4000);
const messageSchema = z.object({
  idempotencyKey: uuidSchema,
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().trim().min(1).max(20000),
  createdAt: z.string().datetime({ offset: true }).optional(),
}).strict();

async function getAuthenticatedClient() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error("Your session is invalid or expired. Please sign in again.");
  }

  return { supabase, userId: data.user.id };
}

function throwDatabaseError(error: { code?: string }) {
  console.error("Cloud database operation failed", error.code ?? "unknown");
  throw new Error("Cloud database request failed. Please try again.");
}

export const listCloudConversations = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabase, userId } = await getAuthenticatedClient();
    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) throwDatabaseError(error);
    return data ?? [];
  },
);

export const createCloudConversation = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ title: conversationTitleSchema }).strict().parse(input)
  )
  .handler(async ({ data }) => {
    const { supabase, userId } = await getAuthenticatedClient();
    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({ user_id: userId, title: data.title })
      .select("id, title, created_at, updated_at")
      .single();

    if (error) throwDatabaseError(error);
    return conversation;
  });

export const updateCloudConversationTitle = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({
      conversationId: uuidSchema,
      title: conversationTitleSchema,
    }).strict().parse(input)
  )
  .handler(async ({ data }) => {
    const { supabase, userId } = await getAuthenticatedClient();
    const { data: conversation, error } = await supabase
      .from("conversations")
      .update({ title: data.title, updated_at: new Date().toISOString() })
      .eq("id", data.conversationId)
      .eq("user_id", userId)
      .select("id, title, created_at, updated_at")
      .maybeSingle();

    if (error) throwDatabaseError(error);
    if (!conversation) throw new Error("Conversation not found.");
    return conversation;
  });

export const listCloudMessages = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ conversationId: uuidSchema }).strict().parse(input)
  )
  .handler(async ({ data }) => {
    const { supabase, userId } = await getAuthenticatedClient();
    const { data: messages, error } = await supabase
      .from("messages")
      .select("id, conversation_id, role, content, idempotency_key, created_at")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error) throwDatabaseError(error);
    return messages ?? [];
  });

export const saveCloudMessages = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({
      conversationId: uuidSchema,
      messages: z.array(messageSchema).min(1).max(100),
    }).strict().parse(input)
  )
  .handler(async ({ data }) => {
    const { supabase, userId } = await getAuthenticatedClient();
    const saved = [];

    for (const message of data.messages) {
      const row = {
        conversation_id: data.conversationId,
        user_id: userId,
        role: message.role,
        content: message.content,
        idempotency_key: message.idempotencyKey,
        ...(message.createdAt ? { created_at: message.createdAt } : {}),
      };
      const { data: inserted, error } = await supabase
        .from("messages")
        .upsert(row, {
          onConflict: "user_id,idempotency_key",
          ignoreDuplicates: true,
        })
        .select("id, conversation_id, role, content, idempotency_key, created_at")
        .maybeSingle();

      if (error) throwDatabaseError(error);

      if (inserted) {
        saved.push(inserted);
        continue;
      }

      const { data: existing, error: lookupError } = await supabase
        .from("messages")
        .select("id, conversation_id, role, content, idempotency_key, created_at")
        .eq("user_id", userId)
        .eq("idempotency_key", message.idempotencyKey)
        .maybeSingle();

      if (lookupError) throwDatabaseError(lookupError);
      if (
        !existing ||
        existing.conversation_id !== data.conversationId ||
        existing.role !== message.role ||
        existing.content !== message.content
      ) {
        throw new Error("A message idempotency key was reused for different content.");
      }

      saved.push(existing);
    }

    const { error: conversationError } = await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId)
      .eq("user_id", userId);

    if (conversationError) throwDatabaseError(conversationError);
    return saved;
  });

export const deleteCloudConversation = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ conversationId: uuidSchema }).strict().parse(input)
  )
  .handler(async ({ data }) => {
    const { supabase, userId } = await getAuthenticatedClient();
    const { data: deleted, error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", data.conversationId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) throwDatabaseError(error);
    return Boolean(deleted);
  });

export const deleteAllCloudConversations = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabase, userId } = await getAuthenticatedClient();
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("user_id", userId);

    if (error) throwDatabaseError(error);
  });

export const listCloudMemories = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabase, userId } = await getAuthenticatedClient();
    const { data, error } = await supabase
      .from("user_memories")
      .select("id, memory_key, memory_value, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) throwDatabaseError(error);
    return data ?? [];
  },
);

export const saveCloudMemory = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({
      memoryKey: memoryKeySchema,
      memoryValue: memoryValueSchema,
    }).strict().parse(input)
  )
  .handler(async ({ data }) => {
    const { supabase, userId } = await getAuthenticatedClient();
    const { data: memory, error } = await supabase
      .from("user_memories")
      .upsert(
        {
          user_id: userId,
          memory_key: data.memoryKey,
          memory_value: data.memoryValue,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,memory_key" },
      )
      .select("id, memory_key, memory_value, created_at, updated_at")
      .single();

    if (error) throwDatabaseError(error);
    return memory;
  });

export const migrateCloudMemories = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({
      memories: z.array(z.object({
        memoryKey: memoryKeySchema,
        memoryValue: memoryValueSchema,
      }).strict()).max(100),
    }).strict().parse(input)
  )
  .handler(async ({ data }) => {
    const { supabase, userId } = await getAuthenticatedClient();
    const migrated = [];

    for (const memory of data.memories) {
      const { data: inserted, error } = await supabase
        .from("user_memories")
        .upsert(
          {
            user_id: userId,
            memory_key: memory.memoryKey,
            memory_value: memory.memoryValue,
          },
          {
            onConflict: "user_id,memory_key",
            ignoreDuplicates: true,
          },
        )
        .select("id, memory_key, memory_value, created_at, updated_at")
        .maybeSingle();

      if (error) throwDatabaseError(error);
      if (inserted) migrated.push(inserted);
    }

    return migrated;
  });

export const deleteCloudMemory = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ memoryKey: memoryKeySchema }).strict().parse(input)
  )
  .handler(async ({ data }) => {
    const { supabase, userId } = await getAuthenticatedClient();
    const { error } = await supabase
      .from("user_memories")
      .delete()
      .eq("user_id", userId)
      .eq("memory_key", data.memoryKey);

    if (error) throwDatabaseError(error);
  });
