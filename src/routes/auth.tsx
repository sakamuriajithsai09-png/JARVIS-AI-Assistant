import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "../lib/supabase/client";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const supabase = createClient();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (!data.session) {
          setMessage("Account created. Please check your email to confirm your account.");
        } else {
          window.location.href = "/";
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        window.location.href = "/";
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-widest">J.A.R.V.I.S.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Secure Personal AI Assistant</p>
        </div>

        <h2 className="mb-2 text-xl font-semibold">
          {mode === "signin" ? "Welcome Back" : "Create Account"}
        </h2>

        <p className="mb-6 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Sign in to access your personal assistant."
            : "Create an account to get started."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full rounded-lg border border-border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />

          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {message && <p className="mt-4 text-sm text-center text-muted-foreground">{message}</p>}

        <div className="mt-6 text-center text-sm">
          {mode === "signin" ? "New to JARVIS? " : "Already registered? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMessage("");
            }}
            className="font-semibold text-primary hover:underline"
          >
            {mode === "signin" ? "Create Account" : "Sign In"}
          </button>
        </div>
      </div>
    </main>
  );
}
