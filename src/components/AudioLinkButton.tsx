import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { SpeakerSimpleHigh, SpeakerSimpleX, Waveform } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import { AUDIO_SOURCES, type AudioLink, type AudioSource } from "../engine/audio";
import type { ParamKey } from "../engine/params";
import { FAMILY_NAMES, type Family } from "../engine/songScript";
import { audioInput } from "../lib/audioInput";
import { help } from "../help/topics";
import { KeyText } from "./HelpText";

/** A new link moves its setting half way; the Audio panel sets its range. */
const NEW_LINK: Pick<AudioLink, "amount"> = { amount: 0.5 };

export const audioSourceName = (source: AudioSource) => AUDIO_SOURCES.find(([value]) => value === source)?.[1] ?? source;

const subscribe = (listener: () => void) => audioInput.subscribe(listener);
const isListening = () => audioInput.status.state === "on";

/**
 * The audio button of one setting, in the column at the left of the
 * setting, beside its slider (the MIDI button is beside the name). A click
 * opens a small menu of what the setting follows (Nothing, the four bands,
 * or the beats); a pick closes it. How far the sound can move the setting
 * (its range) is set in the Audio panel's list of links. The icon is lit while the
 * setting has a link, and glows with the sound that moves it. A
 * right-click on the lit icon removes the link. See docs/AUDIO.md.
 */
export function AudioLinkButton({ engine, paramKey, label }: { engine: Engine; paramKey: ParamKey; label: string }) {
  const [link, setLink] = useState(engine.state.audioLinks[paramKey]);
  useEffect(() => engine.onParamChange((key) => {
    if (key === paramKey) setLink(engine.state.audioLinks[paramKey]);
  }), [engine, paramKey]);
  const listening = useSyncExternalStore(subscribe, isListening);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  /**
   * The family by which the song script can move this setting (see
   * Engine.songCandidate), or null, and whether it moves it now: only a
   * range follows the song.
   */
  const [song, setSong] = useState<Family | null>(null);
  const [following, setFollowing] = useState(false);

  /**
   * The lit icon glows with the push of the sound, or of the song script,
   * in each frame, not through React state. Only a change of family
   * renders again (React skips a set to the same value).
   */
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    const stop = engine.onFrame(() => {
      setSong(engine.songCandidate(paramKey));
      const family = engine.songFamily(paramKey);
      setFollowing(family !== null);
      const push = link ? engine.audioPush(paramKey) : family ? engine.songPush(paramKey) : 0;
      button.style.setProperty("--audio-push", push.toFixed(3));
    });
    return () => {
      stop();
      button.style.removeProperty("--audio-push");
    };
  }, [engine, link, paramKey]);

  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    /* Capture, so Esc closes the menu and does not also leave full screen. */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", close);
    };
  }, [position]);

  /** Keeps the menu inside the window, as the easing menu does. */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!position || !menu) return;
    const left = Math.min(position.left, window.innerWidth - 8 - menu.offsetWidth);
    const button = buttonRef.current!.getBoundingClientRect();
    const top = position.top + menu.offsetHeight > window.innerHeight - 8 ? Math.max(8, button.top - 4 - menu.offsetHeight) : position.top;
    if (left !== position.left || top !== position.top) setPosition({ left, top });
  }, [position]);

  /** A pick in the menu sets the link and closes the menu. The range is set in the Audio panel. */
  const update = (next: AudioLink | null) => engine.setAudioLink(paramKey, next);
  const pick = (next: AudioLink | null) => {
    update(next);
    setPosition(null);
  };
  const title = link
    ? `Moves with the sound: ${audioSourceName(link.source)}, range ${Math.round(link.amount * 100)}%.${listening ? "" : " No input is listening (Audio panel, A)."} Click to change; right-click to remove.`
    : song && following
      ? `Follows the song (${FAMILY_NAMES[song]}). The music moves it between its handles. Click to link it to the sound instead.`
      : song
        ? `Can follow the song (${FAMILY_NAMES[song]}): give it a range, and the music moves it between the handles. Click to link it to the sound instead.`
        : "Make this setting move with the sound";
  return (
    <>
      <button
        ref={buttonRef}
        className={`audio-link ${link || following ? "on" : ""} ${position ? "active" : ""}`}
        {...help("audio.sensors")}
        data-tip={title}
        aria-label={`${label}: move with the sound`}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        onClick={() => {
          if (position) {
            setPosition(null);
            return;
          }
          const rect = buttonRef.current!.getBoundingClientRect();
          setPosition({ left: rect.left, top: rect.bottom + 4 });
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (link) update(null);
        }}
      >
        {song && !link ? <Waveform size={14} weight={following ? "fill" : "regular"} /> : <SpeakerSimpleHigh size={14} weight={link ? "fill" : "regular"} />}
      </button>
      {position && createPortal(
        <div ref={menuRef} className="toolbar-dropdown audio-link-menu" role="menu" aria-label={`${label}: move with the sound`} style={position}>
          <div className="toolbar-dropdown-heading">{label} moves with</div>
          <button role="menuitemradio" aria-checked={!link} className={`toolbar-dropdown-item audio-link-item ${!link ? "selected" : ""}`} onClick={() => pick(null)}>
            <SpeakerSimpleX size={13} /> Nothing
          </button>
          {AUDIO_SOURCES.map(([source, text]) => (
            <button
              key={source}
              role="menuitemradio"
              aria-checked={link?.source === source}
              className={`toolbar-dropdown-item audio-link-item ${link?.source === source ? "selected" : ""}`}
              onClick={() => pick({ source, amount: link?.amount ?? NEW_LINK.amount, release: link?.release ?? 1, threshold: link?.threshold ?? 0 })}
            >
              <span className="audio-link-menu-mark" /> {text}
            </button>
          ))}
          {!listening && <p className="audio-link-menu-note"><KeyText text="No input is listening. Pick one in the Audio panel `a`." /></p>}
        </div>,
        document.body
      )}
    </>
  );
}
