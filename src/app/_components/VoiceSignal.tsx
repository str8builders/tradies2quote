import { Microphone, Stop, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import "./voice-signal.css";
/** Shared voice identity; motion indicates recording state, not audio volume. */
export function VoiceSignal({ state = "idle", compact = false }: { state?: "idle" | "recording" | "processing" | "error"; compact?: boolean }) {
  const Icon = state === "recording" ? Stop : state === "processing" ? CircleNotch : Microphone;
  return <span aria-hidden="true" className={`t2q-voice-signal ${compact ? "is-compact" : ""}`} data-state={state}>
    <span className="t2q-voice-signal-orbit" />
    <span className="t2q-voice-signal-core"><Icon size={compact ? 23 : 42} weight="fill" /></span>
    {!compact && <span className="t2q-voice-signal-wave">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ height: 12 + ((i * 17) % 25), animationDelay: `${i * -0.12}s` }} />)}</span>}
  </span>;
}
