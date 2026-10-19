import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, QuestionMark, X } from "@phosphor-icons/react";
import { HELP_ICON_PATTERN, HELP_TOPICS, type HelpTopicId } from "../help/topics";
import { helpSettings } from "../lib/helpSettings";
import { HelpText } from "./HelpText";
import { tracks } from "../lib/tracks";

/** The badge's size, and how far it hangs over its panel's top and right edges, in pixels. */
const BADGE = 22;
const OVERHANG = 8;
/** The size of a badge that sits in a title, in the line of text. */
const INLINE_BADGE = 18;

const subscribeHelp = (listener: () => void) => helpSettings.subscribe(listener);
const buttonsOn = () => helpSettings.get().buttons;
const subscribeTracks = (listener: () => void) => tracks.subscribe(listener);
const musicPlays = () => tracks.playing;

/** The nearest ancestor that clips its content (a list that scrolls, a card with round corners), or null. */
function clipOf(element: HTMLElement) {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent);
    if (overflowY !== "visible" || overflowX !== "visible") return parent;
  }
  return null;
}

/** True when the element and every ancestor are shown: not hidden, not see-through (the play controls fade in on hover). */
function showing(element: HTMLElement) {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.visibility === "hidden" || style.opacity === "0") return false;
  }
  return true;
}

/**
 * A panel's help badge and card (see docs/HELP.md, part 3). The badge is a
 * bright green circle with a plain black "?" (no ring around it), fixed to the top-right corner of
 * its panel (the nearest element with a help mark), hanging a little over
 * the panel's top and right edges. It is drawn on the page, not in the
 * panel, so a panel that clips its edges does not cut it off; it follows the
 * panel in each animation frame, and hides while the panel is hidden or
 * its corner is scrolled out of view. A click opens a card under the badge
 * with the topic's text and tips (src/help/topics.ts); Esc, a click outside
 * the card, or a second click closes it. No badge shows until Help, Show
 * Help Buttons turns them on (a first run has them off), or while the
 * Files play (a show: help never gets in its way).
 *
 * With inline, the badge sits in the line where it is put (after a
 * title, after the last tab) and does not follow a corner: for panels at the
 * window's edge, where a corner badge would hang out of the window.
 */
export function HelpButton({ topic, inline = false }: { topic: HelpTopicId; inline?: boolean }) {
  const shown = useSyncExternalStore(subscribeHelp, buttonsOn);
  const playing = useSyncExternalStore(subscribeTracks, musicPlays);
  /** Stays in the panel, so the badge can find the panel it belongs to. */
  const probe = useRef<HTMLSpanElement>(null);
  const badge = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  /**
   * Where the card goes: one of its edges lines up with the same edge of
   * the badge (edge: the right edge for a corner badge, the left edge for a
   * badge in a title), then it is kept inside the window (left).
   */
  const [position, setPosition] = useState<{ edge: number; alignLeft: boolean; left: number | null; top: number } | null>(null);
  const { title, text, tips } = HELP_TOPICS[topic];
  const active = shown && !playing;
  /**
   * A tip that shows a button's icon tells what the button does: it gets a
   * plain bullet, so the bullet does not look like one more button. A tip
   * with no icon is a true tip (a key, a gesture): it gets the lightbulb.
   */
  const buttons = tips.filter((tip) => HELP_ICON_PATTERN.test(tip));
  const hints = tips.filter((tip) => !HELP_ICON_PATTERN.test(tip));

  /* The badge follows its panel's top-right corner. */
  useEffect(() => {
    if (!active || inline) return;
    const panel = probe.current?.parentElement?.closest<HTMLElement>("[data-help]") ?? null;
    if (!panel) return;
    const clip = clipOf(panel);
    let frame = 0;
    /* Whether the panel and its ancestors show is checked every eighth frame: it reads the styles of each ancestor. */
    let count = 0;
    let panelShows = showing(panel);
    const place = () => {
      if (++count % 8 === 0) panelShows = showing(panel);
      const button = badge.current;
      if (button) {
        const box = panel.getBoundingClientRect();
        const left = box.right - BADGE + OVERHANG;
        const top = box.top - OVERHANG;
        /* The corner must be on the panel's visible part: inside the area that clips it. */
        const area = clip?.getBoundingClientRect();
        const cornerX = box.right - 2;
        const cornerY = box.top + 2;
        const inside = !area || (cornerX >= area.left && cornerX <= area.right && cornerY >= area.top && cornerY <= area.bottom);
        const visible = box.width > 0 && box.height > 0 && inside && panelShows;
        button.style.display = visible ? "grid" : "none";
        if (visible) Object.assign(button.style, { left: `${left}px`, top: `${top}px` });
      }
      frame = requestAnimationFrame(place);
    };
    frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [active, inline]);

  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!cardRef.current?.contains(target) && !badge.current?.contains(target)) close();
    };
    /* Capture, so Esc closes the card and does not also leave full screen. */
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

  /**
   * Places the card once its width is known (it is as wide as its longest
   * tip): under the badge, inside the window, and above the badge when
   * there is no room below.
   */
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!position || position.left !== null || !card) return;
    const button = badge.current!.getBoundingClientRect();
    const wanted = position.alignLeft ? position.edge : position.edge - card.offsetWidth;
    const left = Math.max(8, Math.min(wanted, window.innerWidth - 8 - card.offsetWidth));
    const top = position.top + card.offsetHeight > window.innerHeight - 8 ? Math.max(8, button.top - 6 - card.offsetHeight) : position.top;
    setPosition({ ...position, left, top });
  }, [position]);

  const badgeButton = (
    <button
      ref={badge}
      className={`help-badge ${inline ? "inline" : ""} ${position ? "active" : ""}`}
      style={inline ? { width: INLINE_BADGE, height: INLINE_BADGE } : { width: BADGE, height: BADGE, display: "none" }}
      data-tip={`Help: ${title}`}
      aria-label={`Help: ${title}`}
      aria-expanded={Boolean(position)}
      onClick={(event) => {
        event.stopPropagation();
        if (position) {
          setPosition(null);
          return;
        }
        const rect = badge.current!.getBoundingClientRect();
        setPosition({ edge: inline ? rect.left : rect.right, alignLeft: inline, left: null, top: rect.bottom + 6 });
      }}
    >
      <QuestionMark size={inline ? 12 : 14} weight="bold" />
    </button>
  );

  return (
    <>
      {!inline && <span ref={probe} className="help-probe" hidden />}
      {active && (inline ? badgeButton : createPortal(badgeButton, document.body))}
      {active && position && createPortal(
        <div ref={cardRef} className="help-card" role="dialog" aria-label={`Help: ${title}`} style={{ left: position.left ?? 0, top: position.top, visibility: position.left === null ? "hidden" : undefined }}>
          <button className="help-card-close" onClick={() => setPosition(null)} data-tip="Close (Esc)" aria-label="Close the help">
            <X size={13} weight="bold" />
          </button>
          <h3>{title}</h3>
          <p className={text.endsWith(":") ? "leads" : undefined}><HelpText text={text} /></p>
          {buttons.length > 0 && (
            <ul className="help-buttons">
              {buttons.map((tip) => (
                <li key={tip}><span><HelpText text={tip} /></span></li>
              ))}
            </ul>
          )}
          {hints.length > 0 && (
            <ul className="help-tips">
              {hints.map((tip) => (
                <li key={tip}><Lightbulb size={12} weight="fill" /><span><HelpText text={tip} /></span></li>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
