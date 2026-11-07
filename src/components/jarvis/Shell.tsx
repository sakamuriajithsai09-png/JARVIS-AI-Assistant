import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Bot, History, Brain, Settings, Plug, Workflow, Activity, Menu, X } from "lucide-react";
import { Particles } from "./Orb";

const nav = [
  { to: "/", label: "Core", icon: Bot },
  { to: "/history", label: "History", icon: History },
  { to: "/memory", label: "Memory", icon: Brain },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/tools", label: "Tools", icon: Plug },
  { to: "/automation", label: "Automation", icon: Workflow },
  { to: "/status", label: "Status", icon: Activity },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex flex-col">
      <Particles />
      <header className="flex items-center justify-between px-4 md:px-8 py-4">
        <Link to="/" className="font-display text-xl md:text-2xl font-bold tracking-[0.3em] text-cyan text-glow">
          J.A.R.V.I.S.
        </Link>
        <nav className="hidden lg:flex items-center gap-1 glass rounded-full px-2 py-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: true }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs uppercase tracking-wider text-muted-foreground hover:text-cyan transition-colors"
              activeProps={{ className: "!text-cyan bg-accent" }}
            >
              <n.icon className="h-3.5 w-3.5" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <span className="glow-border rounded-full px-3 py-1.5 font-display text-[10px] md:text-xs tracking-widest text-foreground flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan animate-pulse" /> SYSTEM ONLINE
          </span>
          <button className="lg:hidden p-2 text-cyan" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {open && (
        <nav className="lg:hidden mx-4 glass rounded-2xl p-2 grid grid-cols-2 gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              activeOptions={{ exact: true }}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground"
              activeProps={{ className: "!text-cyan bg-accent" }}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
      )}
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}

export function Page({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 md:px-8 py-6">
      <h1 className="font-display text-2xl md:text-3xl font-bold tracking-widest text-gradient">{title}</h1>
      <p className="mt-1 text-muted-foreground">{subtitle}</p>
      <div className="mt-6 space-y-4">{children}</div>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-2xl p-5 ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "cyan" | "neon" }) {
  const c = tone === "cyan" ? "text-cyan border-cyan/40" : tone === "neon" ? "text-neon border-neon/50" : "text-muted-foreground";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${c}`}>{children}</span>;
}

export const btn =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:opacity-40";
export const btnPrimary = `${btn} bg-primary text-primary-foreground hover:shadow-[0_0_20px_var(--primary)]`;
export const btnGhost = `${btn} border border-border text-muted-foreground hover:text-cyan hover:border-cyan/50`;
export const input =
  "w-full rounded-xl bg-navy/60 border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
