
import { createBrowserClient } from "@supabase/ssr";

let supabase: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!supabase) {
    const url = import.meta.env["VITE_SUPABASE_URL"];
    const anonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"];

    if (!url || !anonKey) {
      throw new Error("Supabase environment variables are missing.");
    }

    supabase = createBrowserClient(url, anonKey);
  }

  return supabase;
}
