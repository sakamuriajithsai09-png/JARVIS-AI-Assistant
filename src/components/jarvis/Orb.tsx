import { cn } from "@/lib/utils";

export type CoreState = "idle" | "listening" | "processing" | "speaking" | "error";

const speed: Record<CoreState, number> = {
  idle: 1,
  listening: 0.8,
  processing: 0.3,
  speaking: 0.6,
  error: 1.5,
};

export function Orb({
  state,
  level = 0,
  size = 300,
}: {
  state: CoreState;
  level?: number;
  size?: number;
}) {
  const s = speed[state];
  const core =
    state === "listening"
      ? "var(--cyan)"
      : state === "error"
        ? "var(--destructive)"
        : state === "speaking"
          ? "var(--primary)"
          : "var(--neon)";
  const scale = 1 + Math.min(level, 1) * 0.12;
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`JARVIS core: ${state}`}
    >
      <div
        className="absolute inset-0 rounded-full blur-3xl opacity-60 transition-colors duration-700"
        style={{ background: `radial-gradient(circle, ${core}, transparent 65%)` }}
      />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute rounded-full border"
          style={{
            inset: `${i * 9}%`,
            borderColor: i === 1 ? "var(--cyan)" : i === 0 ? "var(--neon)" : "var(--primary)",
            borderTopColor: "transparent",
            borderBottomColor: i === 2 ? "transparent" : undefined,
            opacity: 0.7,
            transform: `rotateX(${i * 25 + 55}deg)`,
            animation: `${i % 2 ? "spin-rev" : "spin-slow"} ${(12 + i * 6) * s}s linear infinite`,
            boxShadow: "0 0 18px -4px currentColor",
          }}
        />
      ))}
      <div
        className="relative rounded-full overflow-hidden transition-transform duration-100"
        style={{
          width: "52%",
          height: "52%",
          transform: `scale(${scale})`,
          animation: `breathe ${4 * s}s ease-in-out infinite`,
          background:
            "radial-gradient(circle at 35% 30%, oklch(0.98 0.02 220 / 90%), transparent 25%), radial-gradient(circle at 50% 55%, var(--cyan), var(--primary) 45%, var(--neon) 75%, oklch(0.15 0.05 290) 100%)",
          boxShadow: `0 0 60px ${core}, inset 0 0 40px oklch(0.1 0.05 290 / 80%)`,
        }}
      >
        <div
          className="absolute inset-[-30%] opacity-60 mix-blend-screen"
          style={{
            background:
              "conic-gradient(from 0deg, transparent, var(--cyan), transparent, var(--neon), transparent)",
            animation: `spin-slow ${6 * s}s linear infinite`,
          }}
        />
      </div>
      {(state === "listening" || state === "speaking") && (
        <div
          className="absolute bottom-[8%] flex items-end gap-1 h-8"
          role="img"
          aria-label={
            state === "listening" ? "Microphone listening animation" : "JARVIS speaking animation"
          }
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-cyan voice-waveform-bar"
              style={{
                height: `${30 + ((i * 37) % 70)}%`,
                animationDelay: `${i * 65}ms`,
                animationDuration: state === "listening" ? "620ms" : "460ms",
              }}
            />
          ))}
        </div>
      )}
      <div
        className={cn(
          "absolute -bottom-2 h-2 w-2 rounded-full",
          state === "error" ? "bg-destructive" : "hidden",
        )}
      />
    </div>
  );
}

export function Particles() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {Array.from({ length: 30 }).map((_, i) => (
        <span
          key={i}
          className="absolute h-0.5 w-0.5 rounded-full"
          style={{
            left: `${(i * 53) % 100}%`,
            top: `${100 + (i % 5) * 5}%`,
            background: i % 3 ? "var(--cyan)" : "var(--neon)",
            animation: `drift ${18 + (i % 7) * 4}s linear ${i * 0.9}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
