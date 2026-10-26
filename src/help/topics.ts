/**
 * Every help topic, in one place (see docs/HELP.md, "Where help lives in
 * the code"). Each part of help reads its text from here: the panel help
 * cards, the help page, and the first-scene guide. Controls name their
 * topic with help("id"), which puts it in a data-help mark, so a card, the
 * help page and the guide can find and point at them; TypeScript checks
 * each id. Texts follow the help rules: ASD-STE100 Simplified Technical
 * English, and each control named as the screen shows it.
 */

/**
 * The icons that a help text can name, as {name}: the help card draws
 * that button's icon there (see HelpText), so the user finds the button by
 * its look. A text names an icon wherever it names an icon button.
 */
export const HELP_ICONS = [
  "random", "search", "pattern", "folder", "new", "grip", "nudge", "trash", "dice", "x",
  "range", "reverse", "easing", "own-time", "audio", "midi", "hold-play",
  "play", "pause", "stop", "fullscreen"
] as const;
export type HelpIcon = (typeof HELP_ICONS)[number];
/** Splits a help text at its {name} marks: text, name, text, name, ... */
export const HELP_ICON_PATTERN = /\{([a-z-]+)\}/;

export interface HelpTopic {
  /** As a heading: a few words. */
  title: string;
  /** What it is and what it does: one or two sentences. */
  text: string;
  /** Up to eight tips, one per line: each tells one thing (one button, one key, one gesture). */
  tips: readonly string[];
  /** More words that find the topic in the help page's search. */
  keywords: readonly string[];
}

export const HELP_TOPICS = {
  "scene.tabs": {
    title: "Scenes and tabs",
    text: "Each tab holds one scene: its picture, its effects and its audio sensors. Switch tabs to change the scene; while it plays, the picture crossfades from the old scene to the new one, which starts from its beginning.",
    tips: [
      "Keys 1 to 9 select the tab with that number, also in full screen.",
      "Ctrl + Tab selects the next tab.",
      "Ctrl + Shift + Tab selects the tab before.",
      "The {x} on a tab takes the scene out of the project.",
      "A middle click on a tab takes the scene out of the project.",
      "Drag a tab to move it; the scenes play in tab order.",
      "Double-click a tab, or right-click it and pick Rename, to rename a saved scene.",
      "With Files as the input, the scenes are a list at the left, not tabs."
    ],
    keywords: ["scene", "tab", "rename", "crossfade", "switch", "document", "new scene", "open scene"]
  },
  source: {
    title: "Source",
    text: "Load an image or video into a slot by hovering over it and choosing an option:",
    tips: [
      "{random} Random loads a 4K photo.",
      "{search} Search finds photos on Wikimedia Commons.",
      "{folder} Open uses an image or a video file.",
      "{pattern} Pattern shows a test pattern, so you can see what an effect does.",
      "Drag and drop or paste a file to load it as a source.",
      "Add a second source to slot B and crossfade between them."
    ],
    keywords: ["image", "video", "photo", "picture", "pattern", "source b", "crossfade", "file"]
  },
  fx: {
    title: "FX",
    text: "The FX list holds the effects of the scene. The picture goes through them from the top of the list to the bottom.",
    tips: [
      "New {new} adds an effect.",
      "Drag an effect's grip {grip} to change the order.",
      "Random all {random} `x` gives new settings to every unlocked effect.",
      "Nudge all {nudge} moves each value a little.",
      "Clear all {trash} removes every effect; locked effects stay."
    ],
    keywords: ["effect", "effects", "add effect", "order", "random", "nudge", "clear"]
  },
  "fx.group": {
    title: "An effect",
    text: "Each effect has its own settings. Click its name to open or close it.",
    tips: [
      "The dice {dice} gives the effect new random settings.",
      "`Ctrl` + hold the header: the effect has no effect while you hold.",
      "Ctrl + Shift + hold the header: only this effect shows while you hold.",
      "Right-click the header to turn the effect on or off.",
      "Right-click the header to lock the effect against Random.",
      "The {x} removes the effect from the list."
    ],
    keywords: ["group", "bypass", "solo", "lock", "dice", "remove", "header"]
  },
  row: {
    title: "A setting",
    text: "A setting is one value of an effect. Turn on its range {range}, and the value moves between two handles over the scene length.",
    tips: [
      "Double-click the name to set the value, or the whole range, back to its default.",
      "`Ctrl` + hold the name: the setting has no effect while you hold.",
      "Reverse {reverse} makes the range move the other way.",
      "Easing {easing} changes how the value moves between the handles.",
      "Own time {own-time} gives the range a length of its own."
    ],
    keywords: ["slider", "value", "range", "handle", "reverse", "easing", "own time", "reset", "drift"]
  },
  "audio.input": {
    title: "Audio input",
    text: "The Input is the sound that moves the settings: the sound your PC plays, a microphone or line input, or audio files that the app plays. Master Gain and Master Threshold apply to every scene.",
    tips: [
      "The Input menu is above the play controls.",
      "PC (loopback) hears any app on the PC.",
      "Windows cannot capture the sound of one app only.",
      "Master Gain makes the input louder or quieter.",
      "Sound under the Master Threshold moves nothing.",
      "Nothing stops listening.",
      "A microphone shows the Windows microphone icon while the app listens."
    ],
    keywords: ["input", "loopback", "microphone", "line in", "gain", "threshold", "listen", "sound card", "device"]
  },
  "audio.levels": {
    title: "Levels",
    text: "The meters show the peak of each band of the input, in dBFS, with an orange mark at the Master Threshold. The light flashes on each beat.",
    tips: [
      "Level is the whole sound; Bass, Mids and Highs are parts of it.",
      "A bar is gray under the threshold: that sound moves nothing.",
      "Beats are found by themselves: a bass hit that stands out of the music."
    ],
    keywords: ["meter", "level", "bass", "mids", "highs", "beat", "peak", "db"]
  },
  "audio.files": {
    title: "Files",
    text: "Audio files that the app plays itself, one after the other, and round again. While Files is the input, the toolbar at the bottom of the Playlist card plays the music, and the show moves to the next scene tab at the end of each scene's loop and at each new file.",
    tips: [
      "Click a file to play it; drag it to move it in the list.",
      "Drag the line at the list's right edge to make it wider; the project keeps the width.",
      "The {x} removes a file from the list.",
      "Your changes turn Hold on, so the scene stays. Click Hold, save or pick a tab to go on.",
      "Play, Pause and Stop at the bottom run the music only; the bar seeks in the file.",
      "The trash can {trash} removes every file from the list; the files on disk stay."
    ],
    keywords: ["files", "tracks", "songs", "music", "mp3", "wav", "flac", "play"]
  },
  "audio.sensors": {
    title: "Audio sensors",
    text: "The speaker {audio} beside a setting is its audio switch: click it to make the setting move with the sound, and again to stop.",
    tips: [
      "Brightness and size follow the loudness and pulse on each beat.",
      "Detail follows the loudness slowly; sparkle follows the high sounds.",
      "Any other setting moves one step through its range on each beat.",
      "A range sets how far the sound moves the setting.",
      "With Song follow on, the song's plan moves it; else the live sound does.",
      "Enable All in the Audio panel turns on every setting with a range."
    ],
    keywords: ["audio switch", "audio link", "sensor", "speaker", "react", "music", "range", "beat", "all on"]
  },
  midi: {
    title: "MIDI",
    text: "Knobs and faders of a MIDI controller can turn any setting. One control can move several settings at once, and one setting can have several controls.",
    tips: [
      "Click Learn {midi}, move a knob or fader, then pick its setting.",
      "On a range, a knob holds the value.",
      "The orange play button {hold-play} plays the range again.",
      "Esc plays all held ranges again.",
      "Ctrl + knob on a range moves the value past a handle, and the handle moves with it."
    ],
    keywords: ["midi", "controller", "knob", "fader", "learn", "mapping", "launchkey", "macro"]
  },
  play: {
    title: "Play controls",
    text: "The play controls at the bottom of the left panel, under FX, start and stop the scene, with a bar and the time of its Length. The music has its own controls, at the bottom of the Playlist card.",
    tips: [
      "Play {play} starts the animation.",
      "Pause {pause} stops the animation where it is.",
      "Stop {stop} pauses and goes back to the start.",
      "Space plays or pauses; Shift + Space stops.",
      "Drag the bar to scrub the scene. The bar above counts down to the next scene.",
      "Full screen {fullscreen}, F, or a double-click on the picture plays full screen.",
      "Esc leaves full screen.",
      "H hides the panels, so only the picture shows."
    ],
    keywords: ["play", "pause", "stop", "full screen", "fullscreen", "space"]
  },
  file: {
    title: "Projects",
    text: "A project (.ksage) holds the open scenes in tab order and the audio settings. While Files is the input, it holds the audio files too. It plays the same on another PC.",
    tips: [
      "Ctrl + S saves the project with all of its scenes.",
      "Open Project opens a project in place of the open one; the app asks about changes first.",
      "Import Scene(s) adds all scenes of other projects, without their audio files.",
      "Add Blank Scene (Ctrl + N) adds a new scene with every effect off.",
      "With an input other than Files, Save takes the audio files out of the project.",
      "Export Scene writes the selected scene to a project of its own."
    ],
    keywords: ["project", "file", "ksage", "show", "playlist", "set list", "save", "open", "import", "export scene"]
  },
  export: {
    title: "Pictures and videos",
    text: "Save PNG saves the picture as it is now. Export Video makes an MP4 of the scene, which can repeat with no jump.",
    tips: [
      "Size: 16:9 for YouTube, 9:16 for TikTok, Reels and Shorts, 1:1 or 4:5 for Instagram.",
      "A video plays the ranges; audio sensors do not move in it.",
      "The video is made in the background; the app stays usable.",
      "PNG files go to Pictures, Kaleido Sage, unless you pick another folder."
    ],
    keywords: ["png", "snapshot", "picture", "video", "mp4", "export", "loop"]
  }
} as const satisfies Record<string, HelpTopic>;

export type HelpTopicId = keyof typeof HELP_TOPICS;

/** Every topic id, in the order of HELP_TOPICS: the order of the help page's list. */
export const HELP_TOPIC_IDS = Object.keys(HELP_TOPICS) as HelpTopicId[];

/**
 * The mark that names a control's help topic: spread it on the control's
 * element ({...help("audio.sensors")}). TypeScript checks the id.
 */
export const help = (id: HelpTopicId) => ({ "data-help": id });
