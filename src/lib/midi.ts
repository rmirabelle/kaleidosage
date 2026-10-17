import type { Engine } from "../engine/engine";
import { PARAM_KEYS, SLIDER_STEPS, fromSlider, toSlider, type Param, type ParamKey } from "../engine/params";
import { snapToStep } from "../components/sliderMath";
import { isShown } from "../engine/submodes";

/**
 * MIDI knobs and faders (see docs/MODULATION.md, part 2). A control sets
 * slider positions; nothing else can be mapped. One control can move
 * several sliders at once, like a macro: each slider goes to the same place
 * along its own span. One slider can also have several controls. The map
 * is kept per controller name, so one controller's map survives a restart
 * and another controller starts clean.
 */
export type MidiMap = Record<string /* controller name */, Record<string /* "channel:cc" */, ParamKey[]>>;

const STORE_KEY = "kaleidosage.midi-map";
/** The controls ("device|channel:cc") found to send relative steps (see Relative encoders in MidiControl.step). */
const RELATIVE_KEY = "kaleidosage.midi-relative";

/**
 * A relative encoder (Novation's Relative behaviour, binary offset) sends
 * 64 + n for n steps right and 64 - n for n steps left, with n up to about
 * 4 when it turns fast. Each step moves the value this part of its travel.
 */
const RELATIVE_STEP = 1 / 127;
/** The widest relative message: 64 ± this many steps. A value outside it means the control sends positions. */
const RELATIVE_SPAN = 7;

/**
 * Dev only: a hot update of this file would make a second MIDI input next
 * to the first, both listening to the controller. Edits here reload the
 * window instead, as engine edits do, so there is only ever one.
 */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

/** Sliders that no MIDI control can move. Scene length changes the timing of every range, so it stays a mouse setting. */
export const NOT_MAPPABLE: readonly ParamKey[] = ["cycle"];

/** One assignment: the controller, the control ("channel:cc"), and the slider it moves. */
export interface MidiMapping {
  device: string;
  control: string;
  key: ParamKey;
}

/** How long after a knob's last move a change counts as complete (one Undo step). */
const SETTLE_MS = 500;

/** The fine part of a 14-bit control must come this soon after its coarse part (milliseconds). */
const FINE_PART_MS = 20;

/**
 * One knob step from "previous" to "position" moves "at" (all three from 0
 * to 1) by value scaling: the knob's travel left in the direction it turns
 * is spread over the value's travel left in that direction. So the knob's
 * end (0 or 127) always takes the value to its end, wherever the knob was
 * when it took over. A knob only sends 0 to 127, so a plain one-to-one move
 * from a takeover near the knob's end ran out of knob before the value
 * reached its end. Turning back and forth brings knob and value together.
 */
export function scaledStep(at: number, previous: number, position: number): number {
  if (position > previous) return previous >= 1 ? at : Math.min(1, at + (position - previous) * (1 - at) / (1 - previous));
  if (position < previous) return previous <= 0 ? at : Math.max(0, at - (previous - position) * at / previous);
  return at;
}

/** One control step: from where a value is ("at", 0 to 1 along its travel) to where it goes. */
export type Move = (at: number) => number;

/**
 * A step of a control that sends positions (0 to 127): the first step only
 * takes the value over where it is, so nothing jumps and no part of the
 * turn is lost; later steps move it by value scaling (see scaledStep).
 */
export function absoluteMove(previous: number | null, position: number): Move {
  return (at) => previous === null ? at : scaledStep(at, previous, position);
}

/** A step of a relative encoder: "steps" steps right (or left, below 0), with no end to the knob's turn. */
export function relativeMove(steps: number): Move {
  return (at) => Math.min(1, Math.max(0, at + steps * RELATIVE_STEP));
}

/**
 * A knob's move on a single value (range off) is relative to where the
 * slider is, along the whole slider (see absoluteMove and relativeMove).
 * It is not rounded to the slider's steps, so a 14-bit control keeps its
 * fine steps. A log slider moves in equal ratios, as it does under the
 * mouse.
 */
export function moveValue(param: Param, value: number, move: Move): number {
  const [min, max] = limits(param);
  const at = (toSlider(param, value) - min) / (max - min);
  const next = move(at);
  return next === at ? value : sliderValue(param, min + next * (max - min));
}

/** The exact value at a slider position (see toSlider), not rounded to steps. */
function sliderValue(param: Param, slider: number) {
  return param.scale === "log" ? param.min * (param.max / param.min) ** (slider / SLIDER_STEPS) : slider;
}


/**
 * The value at "position" (0 to 1) between a range's handles: from the
 * lower handle (0) to the higher one (1), whichever way the range runs. It
 * is not rounded to steps, so the playhead moves smoothly. A log slider
 * moves in equal ratios.
 */
export function playheadValue(param: Param, position: number): number {
  const low = toSlider(param, param.low ?? param.min);
  const high = toSlider(param, param.high ?? param.max);
  const at = Math.min(low, high) + position * Math.abs(high - low);
  return param.scale === "log" ? param.min * (param.max / param.min) ** (at / SLIDER_STEPS) : at;
}

/** Where "value" is between a range's handles, from 0 (the lower handle) to 1 (the higher one): the reverse of playheadValue. */
export function playheadPosition(param: Param, value: number): number {
  const low = toSlider(param, param.low ?? param.min);
  const high = toSlider(param, param.high ?? param.max);
  const span = Math.abs(high - low);
  if (span === 0) return 0;
  return Math.min(1, Math.max(0, (toSlider(param, value) - Math.min(low, high)) / span));
}

/**
 * Ctrl + a knob on a range: the playhead moves along the whole slider, not
 * only between the handles (see absoluteMove and relativeMove). When it
 * passes a handle,
 * that handle moves with it, so the range grows; it never shrinks. Returns
 * the new playhead value and handles. A moved handle is on the slider's
 * steps; a handle that did not move keeps its exact value.
 */
export function pushPlayhead(param: Param, value: number, move: Move): { value: number; low: number; high: number } {
  const [min, max, step] = limits(param);
  const at = min + move((toSlider(param, value) - min) / (max - min)) * (max - min);
  const handleAt = (slider: number) => param.scale === "log" ? fromSlider(param, Math.round(slider)) : snapToStep(slider, step);
  let low = param.low ?? param.min;
  let high = param.high ?? param.max;
  const lowAt = toSlider(param, low);
  const highAt = toSlider(param, high);
  /* The lower handle is "low" for a range that runs up, "high" for one that runs down. */
  const [bottom, top] = lowAt <= highAt ? ["low", "high"] as const : ["high", "low"] as const;
  const bottomAt = Math.min(lowAt, highAt);
  const topAt = Math.max(lowAt, highAt);
  if (at < bottomAt) bottom === "low" ? (low = handleAt(at)) : (high = handleAt(at));
  if (at > topAt) top === "high" ? (high = handleAt(at)) : (low = handleAt(at));
  return { value: sliderValue(param, at), low, high };
}

/** The slider's ends and step, in slider positions (see toSlider). */
function limits(param: Param): [number, number, number] {
  return param.scale === "log" ? [0, SLIDER_STEPS, 1] : [param.min, param.max, param.step];
}

function loadRelative(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RELATIVE_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function loadMap(): MidiMap {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, Record<string, string | string[]>>;
    /* A map from before macros has one slider per control. A parameter that a later version removed is dropped. */
    const map: MidiMap = {};
    for (const [device, controls] of Object.entries(stored)) {
      map[device] = {};
      for (const [control, keys] of Object.entries(controls)) {
        const known = (Array.isArray(keys) ? keys : [keys]).filter((key): key is ParamKey =>
          (PARAM_KEYS as readonly string[]).includes(key) && !(NOT_MAPPABLE as readonly string[]).includes(key));
        if (known.length) map[device][control] = known;
      }
    }
    return map;
  } catch {
    return {};
  }
}

/** What the UI shows: learn mode, the sliders that wait for a control, and the mapped sliders. */
export interface MidiView {
  /** False when the webview has no Web MIDI, or it refused access. */
  available: boolean;
  /** The names of the controllers that are connected now. */
  devices: string[];
  learning: boolean;
  /** In learn mode: the sliders that the next knob or fader move maps to. */
  armed: readonly ParamKey[];
  mapped: ReadonlySet<ParamKey>;
}

/** Calls when learn mode maps a control: the controller, the control ("channel:cc"), and every slider it now moves. */
type LearnListener = (device: string, control: string, keys: readonly ParamKey[]) => void;

/**
 * The MIDI input. It listens to every connected controller, maps knobs in
 * learn mode, and moves the mapped sliders of the attached engine.
 */
class MidiControl {
  private engine: Engine | null = null;
  private access: MIDIAccess | null = null;
  private requested = false;
  private map: MidiMap = loadMap();
  private readonly listeners = new Set<() => void>();
  private onLearn: LearnListener | null = null;
  /** Per control and slider ("device|channel:cc|key"): the control's last position, for relative moves (see moveValue). */
  private readonly knobs = new Map<string, { previous: number | null }>();
  private lastMove = -Infinity;
  /** True while Ctrl is held (see start). */
  private ctrl = false;
  /** The controls ("device|channel:cc") that send relative steps, kept across restarts. */
  private readonly relative = new Set<string>(loadRelative());
  /** Each control's last 7-bit value, to find relative encoders. */
  private readonly lastValue = new Map<string, number>();
  /** Per controller: the last coarse part (control 0 to 31) of a possible 14-bit control, waiting for its fine part. */
  private readonly coarse = new Map<string, { status: number; number: number; value: number; time: number; timer: number; deferred: boolean }>();
  /** The 14-bit controls ("device|channel:cc"): each step comes as a coarse part, then a fine part 32 control numbers higher. */
  private readonly fine = new Set<string>();
  private view: MidiView = { available: false, devices: [], learning: false, armed: [], mapped: new Set() };

  constructor() {
    this.view = { ...this.view, mapped: this.mappedKeys() };
  }

  /** Starts listening (the first time), and sends knob moves to "engine". Returns a function that detaches it. */
  attach(engine: Engine, onLearn: LearnListener) {
    this.engine = engine;
    this.onLearn = onLearn;
    this.knobs.clear();
    void this.start();
    return () => {
      if (this.engine !== engine) return;
      this.engine = null;
      this.onLearn = null;
      this.setLearning(false);
    };
  }

  /** True while a knob is turning, so Undo waits and makes the whole turn one step. */
  get turning() {
    return performance.now() - this.lastMove < SETTLE_MS;
  }

  getView = () => this.view;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private readonly touchListeners = new Set<(key: ParamKey) => void>();
  private readonly activityListeners = new Set<(control: string) => void>();

  /** Calls the listener with each control ("device|channel:cc") that sends a step, mapped or not (the MIDI panel lights its row). Returns a function that removes it. */
  onActivity = (listener: (control: string) => void) => {
    this.activityListeners.add(listener);
    return () => { this.activityListeners.delete(listener); };
  };

  /** Calls the listener with each slider a MIDI control moves, on every step (the panel lights the slider's section). Returns a function that removes it. */
  onTouch = (listener: (key: ParamKey) => void) => {
    this.touchListeners.add(listener);
    return () => { this.touchListeners.delete(listener); };
  };

  setLearning(learning: boolean) {
    if (this.view.learning === learning && this.view.armed.length === 0) return;
    this.update({ learning, armed: [] });
  }

  /** Waits for the next knob or fader move, and assigns that control to the slider. */
  assign(key: ParamKey) {
    if (NOT_MAPPABLE.includes(key)) return;
    this.update({ learning: true, armed: [key] });
  }

  /** Takes the slider off every control, and stops waiting for a control for it. The other sliders of a macro stay. */
  clear(key: ParamKey) {
    for (const controls of Object.values(this.map)) this.unmap(controls, key);
    this.save();
    if (this.view.armed.includes(key)) this.setLearning(false);
  }

  /** Every assignment: by controller, then by channel and control number, then in the order the sliders were added. */
  allMappings(): MidiMapping[] {
    const number = (control: string) => control.split(":").map(Number);
    return Object.entries(this.map).sort(([a], [b]) => a.localeCompare(b)).flatMap(([device, controls]) =>
      Object.entries(controls)
        .sort(([a], [b]) => { const [ca, na] = number(a); const [cb, nb] = number(b); return ca - cb || na - nb; })
        .flatMap(([control, keys]) => keys.map((key) => ({ device, control, key }))));
  }

  /** Gives one assignment a new slider: the control moves "to" instead of "from". */
  remap(device: string, control: string, from: ParamKey, to: ParamKey) {
    const keys = this.map[device]?.[control];
    if (!keys || NOT_MAPPABLE.includes(to)) return;
    this.map[device][control] = keys.includes(to) ? keys.filter((key) => key !== from) : keys.map((key) => key === from ? to : key);
    this.knobs.delete(`${device}|${control}|${to}`);
    this.save();
  }

  /** Removes one assignment; the control's other sliders and the slider's other controls stay. */
  unmapOne(device: string, control: string, key: ParamKey) {
    const keys = this.map[device]?.[control];
    if (!keys) return;
    const rest = keys.filter((mapped) => mapped !== key);
    if (rest.length) this.map[device][control] = rest;
    else delete this.map[device][control];
    this.save();
  }

  /** Removes every assignment of every controller. */
  clearEverything() {
    this.map = {};
    this.save();
    this.setLearning(false);
  }

  /** What the app found out about a control: relative steps (see step), and 14-bit (see message). */
  controlKind(device: string, control: string) {
    const id = `${device}|${control}`;
    return { relative: this.relative.has(id), fine: this.fine.has(id) };
  }

  /** Every slider that one control moves. */
  sliders(device: string, control: string): readonly ParamKey[] {
    return this.map[device]?.[control] ?? [];
  }

  /** The assignments of the sliders in "keys", in the order of "keys". */
  mappings(keys: readonly ParamKey[]): MidiMapping[] {
    const found = Object.entries(this.map).flatMap(([device, controls]) =>
      Object.entries(controls).flatMap(([control, mapped]) => mapped.filter((key) => keys.includes(key)).map((key) => ({ device, control, key }))));
    return found.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
  }

  /** Takes every slider in "keys" off its control (a section's Remove all). */
  clearAll(keys: readonly ParamKey[]) {
    for (const controls of Object.values(this.map)) for (const key of keys) this.unmap(controls, key);
    this.save();
    if (this.view.armed.some((key) => keys.includes(key))) this.setLearning(false);
  }

  private unmap(controls: Record<string, ParamKey[]>, key: ParamKey) {
    for (const [control, keys] of Object.entries(controls)) {
      const rest = keys.filter((mapped) => mapped !== key);
      if (rest.length) controls[control] = rest;
      else delete controls[control];
    }
  }

  private async start() {
    if (this.requested) return;
    this.requested = true;
    if (!navigator.requestMIDIAccess) return;
    try {
      this.access = await navigator.requestMIDIAccess();
    } catch (error) {
      console.warn(`MIDI is not available. ${String(error)}`);
      return;
    }
    this.access.addEventListener("statechange", () => this.connectInputs());
    this.connectInputs();
    /* Ctrl changes what a knob does on a range (see pushPlayhead); a MIDI message cannot carry it, so the keyboard is watched. */
    const watchCtrl = (event: KeyboardEvent) => { this.ctrl = event.ctrlKey; };
    window.addEventListener("keydown", watchCtrl, true);
    window.addEventListener("keyup", watchCtrl, true);
    window.addEventListener("blur", () => { this.ctrl = false; });
  }

  /** Listens to every input; a controller plugged in later is picked up by the state change. */
  private connectInputs() {
    if (!this.access) return;
    const devices: string[] = [];
    for (const input of this.access.inputs.values()) {
      if (input.state !== "connected") continue;
      devices.push(input.name ?? input.id);
      input.onmidimessage = (event) => this.message(input.name ?? input.id, event.data);
    }
    this.update({ available: true, devices });
  }

  /**
   * Reads control changes (0xB0 to 0xBF): channel, control number, value.
   * A 14-bit control (set in the controller's own editor) sends each step
   * in two parts: a coarse part on control 0 to 31, then a fine part on the
   * control 32 higher. The two make one of 16384 places instead of 128, so
   * the smallest turn is a very small step. A coarse part of a control that
   * sent a fine part before waits a moment for its fine part.
   */
  private message(device: string, data: Uint8Array | null) {
    if (!data || data.length < 3 || (data[0] & 0xf0) !== 0xb0 || !this.engine) return;
    const [status, number, value] = data;
    const channel = (status & 0x0f) + 1;
    const now = performance.now();
    const waiting = this.coarse.get(device);
    if (number >= 32 && number < 64 && waiting && waiting.status === status && waiting.number === number - 32 && now - waiting.time < FINE_PART_MS) {
      window.clearTimeout(waiting.timer);
      this.coarse.delete(device);
      this.fine.add(`${device}|${channel}:${number - 32}`);
      this.step(device, `${channel}:${number - 32}`, (waiting.value * 128 + value) / 16383);
      return;
    }
    if (waiting) {
      /* Another control came instead of the fine part: a coarse part that waited counts alone. */
      window.clearTimeout(waiting.timer);
      this.coarse.delete(device);
      if (waiting.deferred) this.step(device, `${(waiting.status & 0x0f) + 1}:${waiting.number}`, waiting.value / 127);
    }
    const control = `${channel}:${number}`;
    if (number < 32 && this.fine.has(`${device}|${control}`)) {
      const timer = window.setTimeout(() => {
        if (this.coarse.get(device)?.timer !== timer) return;
        this.coarse.delete(device);
        this.step(device, control, value / 127, value);
      }, FINE_PART_MS);
      this.coarse.set(device, { status, number, value, time: now, timer, deferred: true });
      return;
    }
    /* Not known as 14-bit yet: it counts at once, and a fine part right after it makes it a 14-bit control. */
    if (number < 32) this.coarse.set(device, { status, number, value, time: now, timer: 0, deferred: false });
    this.step(device, control, value / 127, value);
  }

  /**
   * One step of a control, at "position" from 0 to 1; "value" is the raw
   * 7-bit value (none for a 14-bit control).
   *
   * Relative encoders: a control that sends positions never sends the same
   * value twice in a row, but a relative encoder turned one way does (65,
   * 65, 65). So a control that repeats a value near 64 is a relative
   * encoder from then on, and the app keeps that. One that later sends a
   * value far from 64 sends positions again.
   */
  private step(device: string, control: string, position: number, value?: number) {
    if (!this.engine) return;
    const id = `${device}|${control}`;
    for (const listener of this.activityListeners) listener(id);
    if (value !== undefined) {
      const near = value !== 64 && Math.abs(value - 64) <= RELATIVE_SPAN;
      const repeated = this.lastValue.get(id) === value;
      this.lastValue.set(id, value);
      if (near && repeated && !this.relative.has(id)) this.setRelative(id, true);
      else if (!near && value !== 64 && this.relative.has(id)) this.setRelative(id, false);
    }
    const steps = value !== undefined && this.relative.has(id) ? value - 64 : undefined;
    if (this.view.learning && this.view.armed.length) {
      this.learn(device, control, this.view.armed, position);
      return;
    }
    /* Captured (the mouse is over the MIDI panel): a control with no mapping is reported and moves nothing; a mapped one works as always. */
    if (this.captureListener && !this.map[device]?.[control]?.length) {
      this.captureListener(device, control);
      return;
    }
    for (const key of this.map[device]?.[control] ?? []) this.turn(`${id}|${key}`, key, position, steps);
  }

  private captureListener: ((device: string, control: string) => void) | null = null;

  /**
   * While set, a step of a control with no mapping goes to the listener
   * (the MIDI panel uses it to map a control the user just moved). Mapped
   * controls still move their settings. Waiting for a control (see assign)
   * still comes first. Returns a function that ends it.
   */
  capture(listener: (device: string, control: string) => void) {
    this.captureListener = listener;
    return () => { if (this.captureListener === listener) this.captureListener = null; };
  }

  /** Adds one mapping: the control then also moves the setting. */
  addMapping(device: string, control: string, key: ParamKey) {
    if (NOT_MAPPABLE.includes(key)) return;
    const controls = (this.map[device] ??= {});
    const keys = controls[control] ?? [];
    if (!keys.includes(key)) controls[control] = [...keys, key];
    this.save();
  }

  private setRelative(id: string, relative: boolean) {
    if (relative) this.relative.add(id);
    else this.relative.delete(id);
    try {
      localStorage.setItem(RELATIVE_KEY, JSON.stringify([...this.relative]));
    } catch { /* It is found again after a restart. */ }
  }

  /**
   * Adds the armed sliders to the control, then leaves learn mode. Nothing
   * is taken away: the sliders the control already moves stay (a macro),
   * and a slider keeps any other controls it has. The move that mapped the
   * control takes the sliders over where they are, so nothing jumps, and
   * they follow the control from its next move.
   */
  private learn(device: string, control: string, armed: readonly ParamKey[], position: number) {
    const controls = (this.map[device] ??= {});
    const kept = (controls[control] ?? []).filter((key) => !armed.includes(key));
    controls[control] = [...kept, ...armed];
    this.save();
    this.update({ learning: false, armed: [] });
    for (const key of armed) {
      const id = `${device}|${control}|${key}`;
      this.knobs.set(id, { previous: position });
      this.turn(id, key, position, 0);
    }
    this.onLearn?.(device, control, controls[control]);
  }

  /**
   * Moves the slider by one control step: to "position" for a control that
   * sends positions, or by "steps" for a relative encoder. The shown value
   * follows it smoothly (see Engine.follow).
   */
  private turn(id: string, key: ParamKey, position: number, steps?: number) {
    const engine = this.engine!;
    const param = engine.params[key];
    /* A slider that the group's submode hides has no effect, so the control leaves it alone there (see isShown). */
    if (!isShown(key, engine.state)) return;
    for (const listener of this.touchListeners) listener(key);
    const knob = this.knobs.get(id) ?? { previous: null };
    this.knobs.set(id, knob);
    const move = steps !== undefined ? relativeMove(steps) : absoluteMove(knob.previous, position);
    knob.previous = position;
    /**
     * A range: the control takes the playhead over where it is, then moves
     * it between the handles. The range stays stopped until its play button
     * (see holdRange).
     */
    if (param.on) {
      const current = engine.heldValue(key) ?? engine.live(key);
      /* Ctrl: the playhead moves along the whole slider and pushes the handle it passes (see pushPlayhead). */
      if (this.ctrl) {
        const pushed = pushPlayhead(param, current, move);
        engine.holdRange(key, pushed.value);
        if (pushed.low !== param.low || pushed.high !== param.high) {
          engine.stretchRange(key, pushed.low, pushed.high);
          this.lastMove = performance.now();
        }
        return;
      }
      engine.holdRange(key, playheadValue(param, move(playheadPosition(param, current))));
      return;
    }
    /* A single value: relative to where the slider is (see moveValue), so it follows the mouse, Undo and scenes too. */
    const next = moveValue(param, param.value, move);
    if (next === param.value) return;
    param.value = next;
    this.lastMove = performance.now();
    engine.follow(key);
    engine.paramChanged(key);
  }

  private mappedKeys() {
    return new Set(Object.values(this.map).flatMap((controls) => Object.values(controls).flat()));
  }

  private save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.map));
    } catch { /* The map then lasts until the app closes. */ }
    this.update({ mapped: this.mappedKeys() });
  }

  private update(change: Partial<MidiView>) {
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) listener();
  }
}

export const midi = new MidiControl();
