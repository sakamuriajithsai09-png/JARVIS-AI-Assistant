
import { createServerClient } from "@supabase/ssr";
import {
  getCookies,
  setCookie,
  setResponseHeader,
} from "@tanstack/react-start/server";

export function createClient() {
  const url = process.env["VITE_SUPABASE_URL"];
  const anonKey = process.env["VITE_SUPABASE_ANON_KEY"];

  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({
          name,
          value,
        }));
      },

      setAll(cookies, headers) {
        cookies.forEach(({ name, value, options }) => {
          setCookie(name, value, options);
        });

        Object.entries(headers).forEach(([name, value]) => {
          setResponseHeader(name, value);
        });
      },
    },
  });
}
