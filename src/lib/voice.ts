import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
  confidence?: number;
};

type SpeechRecognitionResultLike = ArrayLike<SpeechRecognitionAlternativeLike> & {
  isFinal: boolean;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorLike = {
  error: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function getRecognitionConstructor() {
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function recognitionErrorMessage(error: string) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was denied. Allow microphone access in your browser settings and try again.";
    case "audio-capture":
      return "No microphone was found. Connect a microphone and try again.";
    case "no-speech":
      return "No speech was detected. Try again when you are ready.";
    case "network":
      return "Speech recognition could not reach the browser service. Check your connection and try again.";
    case "aborted":
      return "";
    default:
      return "Voice input encountered an error. Please try again or type your message.";
  }
}

export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const submittedRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(Boolean(getRecognitionConstructor()));
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    setListening(false);
    setInterim("");
    setLevel(0);
    try {
      recognitionRef.current?.stop();
    } catch {
      setError("Voice input could not be stopped. Please try again.");
    }
  }, []);

  const start = useCallback(() => {
    if (activeRef.current) return;

    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setSupported(false);
      setError(
        "Voice input is not supported in this browser. Try Chrome or Edge, or type your message.",
      );
      return;
    }

    setError(null);
    setInterim("");
    setLevel(0);
    submittedRef.current = false;

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => {
      if (recognitionRef.current !== recognition) return;
      activeRef.current = true;
      setListening(true);
    };
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      let finalText = "";
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }

      setInterim(interimText);
      setLevel(Math.min(1, interimText.length / 24));

      const final = finalText.trim();
      if (final && !submittedRef.current) {
        submittedRef.current = true;
        activeRef.current = false;
        setListening(false);
        setInterim("");
        setLevel(0);
        onFinalRef.current(final);
        try {
          recognition.stop();
        } catch {
          setError("Voice input could not be stopped after recognition.");
        }
      }
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      activeRef.current = false;
      setListening(false);
      setLevel(0);
      const message = recognitionErrorMessage(event.error);
      if (message) setError(message);
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      activeRef.current = false;
      setListening(false);
      setInterim("");
      setLevel(0);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      activeRef.current = true;
      setListening(true);
    } catch {
      activeRef.current = false;
      recognitionRef.current = null;
      setListening(false);
      setError("Voice input could not start. Check microphone permissions and try again.");
    }
  }, []);

  useEffect(
    () => () => {
      activeRef.current = false;
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try {
          recognition.abort();
        } catch {
          // Recognition may already have ended during unmount.
        }
      }
    },
    [],
  );

  return { supported, listening, interim, level, error, start, stop };
}

export function chooseSpeechVoice(voices: SpeechSynthesisVoice[], preferredName = "") {
  const preferred = voices.find((voice) => voice.name === preferredName);
  if (preferred && /^en([_-]|$)/i.test(preferred.lang)) return preferred;

  const englishVoices = voices.filter((voice) => /^en([_-]|$)/i.test(voice.lang));
  return (
    englishVoices.find((voice) => /natural|neural|google|microsoft/i.test(voice.name)) ??
    englishVoices[0]
  );
}

let activeUtterance: SpeechSynthesisUtterance | null = null;

export function stopSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  activeUtterance = null;
  window.speechSynthesis.cancel();
}

export function speak(
  text: string,
  opts: {
    voiceName?: string;
    rate?: number;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  },
) {
  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    opts.onError?.();
    return false;
  }

  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = chooseSpeechVoice(window.speechSynthesis.getVoices(), opts.voiceName);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = opts.rate ?? 1;
  utterance.onstart = () => {
    if (activeUtterance === utterance) opts.onStart?.();
  };
  utterance.onend = () => {
    if (activeUtterance !== utterance) return;
    activeUtterance = null;
    opts.onEnd?.();
  };
  utterance.onerror = () => {
    if (activeUtterance !== utterance) return;
    activeUtterance = null;
    opts.onError?.();
  };

  activeUtterance = utterance;
  try {
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    activeUtterance = null;
    opts.onError?.();
    return false;
  }
}
