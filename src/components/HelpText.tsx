import { Fragment, type ReactNode } from "react";
import { ArrowsLeftRight, ArrowsOut, BracketsSquare, DiceFive, DotsSixVertical, MagnifyingGlass, Play, Plus, SkipBack, SkipForward, SpeakerSimpleHigh, Timer, Trash, Wind, X } from "@phosphor-icons/react";
import { HELP_ICON_PATTERN, type HelpIcon } from "../help/topics";
import { ColorFolder } from "./ColorFolder";
import { ColorPattern } from "./ColorPattern";
import { Curve } from "./EaseMenu";
import { MediaIcon } from "./MediaIcon";
import { MidiIcon } from "./MidiIcon";
import { RedDice } from "./RedDice";

/** Each icon that a help text can name: the same icon as on the button it means. */
const ICONS: Record<HelpIcon, ReactNode> = {
  random: <RedDice size={14} />,
  search: <MagnifyingGlass size={13} weight="bold" />,
  pattern: <ColorPattern size={14} />,
  folder: <ColorFolder size={14} />,
  new: <Plus size={12} weight="bold" />,
  grip: <DotsSixVertical size={13} weight="bold" />,
  nudge: <Wind size={13} />,
  trash: <Trash size={13} />,
  dice: <DiceFive size={13} />,
  x: <X size={11} weight="bold" />,
  range: <BracketsSquare size={12} weight="bold" />,
  reverse: <ArrowsLeftRight size={12} />,
  easing: <Curve kind="inOut" width={14} height={10} />,
  "own-time": <Timer size={12} />,
  audio: <SpeakerSimpleHigh size={14} weight="fill" />,
  midi: <MidiIcon size={12} />,
  "hold-play": <Play size={11} weight="fill" />,
  play: <MediaIcon kind="play" size={13} />,
  pause: <MediaIcon kind="pause" size={13} />,
  stop: <MediaIcon kind="stop" size={13} />,
  previous: <SkipBack size={12} weight="fill" />,
  next: <SkipForward size={12} weight="fill" />,
  fullscreen: <ArrowsOut size={12} weight="bold" />
};

/**
 * A help text with its icons: each {name} in the text (see HELP_ICONS)
 * shows as that button's icon, in a small box like a button, so the user
 * can find the button by its look.
 */
export function HelpText({ text }: { text: string }) {
  const parts = text.split(HELP_ICON_PATTERN);
  return (
    <>
      {parts.map((part, index) => index % 2 === 0
        ? <Fragment key={index}>{part}</Fragment>
        : <span key={index} className={`help-icon ${part}`} aria-hidden="true">{ICONS[part as HelpIcon]}</span>)}
    </>
  );
}
