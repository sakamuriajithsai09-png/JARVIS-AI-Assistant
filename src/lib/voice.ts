import { useCallback, useEffect, useRef, useState } from "react";

type SR = any;

export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SR>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const cbRef = useRef(onFinal);
  cbRef.current = onFinal;

  useEffect(() => {
    const w = window as any;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const stopMeter = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLevel(0);
  };

  const stop = useCallback(() => {
    recRef.current?.stop();
    stopMeter();
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return setError("Voice input isn't supported in this browser. Try Chrome or Edge.");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteFrequencyData(data);
        setLevel(data.reduce((a, b) => a + b, 0) / data.length / 90);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      return setError("Microphone access was denied.");
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      let fin = "", int = "";
      for (const r of e.results) (r.isFinal ? (fin += r[0].transcript) : (int += r[0].transcript));
      setInterim(int);
      if (fin) cbRef.current(fin.trim());
    };
    rec.onerror = (e: any) => setError(`Voice error: ${e.error}`);
    rec.onend = () => { setListening(false); setInterim(""); stopMeter(); };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, []);

  return { supported, listening, interim, level, error, start, stop };
}

export function speak(text: string, opts: { voiceName?: string; rate?: number; onStart?: () => void; onEnd?: () => void }) {
  if (typeof window === "undefined" || !window.speechSynthesis) return opts.onEnd?.();
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = window.speechSynthesis.getVoices().find((x) => x.name === opts.voiceName);
  if (v) u.voice = v;
  u.rate = opts.rate ?? 1;
  u.onstart = () => opts.onStart?.();
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  window.speechSynthesis.speak(u);
}
