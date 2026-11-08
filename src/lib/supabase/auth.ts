import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";

export const getCurrentUser = createServerFn({
  method: "GET",
}).handler(async () => {
  const supabase = createClient();

  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  const email = data.claims.email;

  return {
    id: data.claims.sub,
    email: typeof email === "string" ? email : null,
  };
});
