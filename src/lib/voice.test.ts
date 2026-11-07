import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseSpeechVoice, speak, stopSpeaking, useSpeechRecognition } from "./voice";

type TestResult = ArrayLike<{ transcript: string; confidence?: number }> & { isFinal: boolean };
type TestRecognitionEvent = { resultIndex: number; results: ArrayLike<TestResult> };

class MockSpeechRecognition {
  static latest: MockSpeechRecognition;

  lang = "";
  interimResults = false;
  continuous = true;
  onstart: (() => void) | null = null;
  onresult: ((event: TestRecognitionEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    MockSpeechRecognition.latest = this;
  }
}

class MockSpeechSynthesisUtterance {
  static latest: MockSpeechSynthesisUtterance | null = null;
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  lang = "";
  onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
  onend: ((event: SpeechSynthesisEvent) => void) | null = null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;

  constructor(readonly text: string) {
    MockSpeechSynthesisUtterance.latest = this;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("voice helpers", () => {
  it("prefers an available natural English voice", () => {
    const voices = [
      { name: "French Voice", lang: "fr-FR" },
      { name: "English Voice", lang: "en-US" },
      { name: "Google US English", lang: "en-US" },
    ] as SpeechSynthesisVoice[];

    expect(chooseSpeechVoice(voices)?.name).toBe("Google US English");
    expect(chooseSpeechVoice(voices, "English Voice")?.name).toBe("English Voice");
    expect(chooseSpeechVoice(voices, "French Voice")?.lang).toMatch(/^en/i);
    expect(chooseSpeechVoice([voices[0]])).toBeUndefined();
  });

  it("speaks the supplied assistant reply and cancels it on request", () => {
    const voice = { name: "Google US English", lang: "en-US" } as SpeechSynthesisVoice;
    const synthesis = { getVoices: () => [voice], cancel: vi.fn(), speak: vi.fn() };
    vi.stubGlobal("speechSynthesis", synthesis);
    vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);

    expect(speak("The assistant's generated reply.", {})).toBe(true);
    expect(MockSpeechSynthesisUtterance.latest?.text).toBe("The assistant's generated reply.");
    expect(MockSpeechSynthesisUtterance.latest?.voice).toBe(voice);
    expect(synthesis.speak).toHaveBeenCalledOnce();

    stopSpeaking();
    expect(synthesis.cancel).toHaveBeenCalledTimes(2);
  });

  it("starts recognition only on activation and submits the final transcript once", async () => {
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
    const onFinal = vi.fn();
    const { result, unmount } = renderHook(() => useSpeechRecognition(onFinal));

    await waitFor(() => expect(result.current.supported).toBe(true));
    expect(MockSpeechRecognition.latest).toBeUndefined();

    act(() => result.current.start());
    const recognition = MockSpeechRecognition.latest;
    expect(recognition.start).toHaveBeenCalledOnce();
    expect(recognition.lang).toBe("en-US");
    expect(recognition.interimResults).toBe(true);

    const transcript = Object.assign([{ transcript: "Hello JARVIS", confidence: 0.98 }], {
      isFinal: true,
    });
    act(() => recognition.onresult?.({ resultIndex: 0, results: [transcript] }));

    expect(onFinal).toHaveBeenCalledExactlyOnceWith("Hello JARVIS");
    expect(result.current.listening).toBe(false);
    expect(recognition.stop).toHaveBeenCalledOnce();

    unmount();
    expect(recognition.abort).toHaveBeenCalledOnce();
  });

  it("reports unsupported speech recognition when activated", async () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", undefined);
    const { result } = renderHook(() => useSpeechRecognition(vi.fn()));

    await waitFor(() => expect(result.current.supported).toBe(false));
    act(() => result.current.start());

    expect(result.current.error).toContain("not supported");
  });
});
