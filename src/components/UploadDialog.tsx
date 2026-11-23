import { X, YoutubeLogo } from "@phosphor-icons/react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { CANCELED, SIGN_IN_NEEDED, thumbnailOf, youtubeCancel, youtubeSetThumbnail, youtubeSignIn, youtubeSignOut, youtubeStatus, youtubeUpload, type Privacy, type YouTubeStatus } from "../lib/youtube";

/** The description, tags and privacy of the last upload, so the next one starts with them. */
const STORE_KEY = "kaleidosage.youtube";
interface Stored { description: string; tags: string; privacy: Privacy }
const readStored = (): Partial<Stored> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as Partial<Stored> : {};
  } catch {
    return {};
  }
};

const PRIVACY: { value: Privacy; label: string; note: string }[] = [
  { value: "private", label: "Private", note: "Only you" },
  { value: "unlisted", label: "Unlisted", note: "People with the link" },
  { value: "public", label: "Public", note: "Everyone" }
];

const fileName = (path: string) => path.replace(/^.*[\\/]/, "");
const videoTitle = (path: string) => fileName(path).replace(/(_360)?\.mp4$/i, "");
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * Upload to YouTube: the video and its thumbnail (the last export, and the
 * thumbnail saved for it), the title, the description, the tags and the
 * privacy. The first upload signs in to Google in the browser. While the
 * upload runs, the dialog shows its progress, and Cancel stops it.
 */
export function UploadDialog({ initialVideo, onUploaded, onError, onClose }: {
  initialVideo: string | null;
  onUploaded: (videoId: string, title: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const stored = useState(readStored)[0];
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [video, setVideo] = useState(initialVideo);
  const [thumbnail, setThumbnail] = useState(() => initialVideo ? thumbnailOf(initialVideo) : null);
  const [title, setTitle] = useState(() => initialVideo ? videoTitle(initialVideo) : "");
  const [description, setDescription] = useState(stored.description ?? "");
  const [tags, setTags] = useState(stored.tags ?? "");
  const [privacy, setPrivacy] = useState<Privacy>(PRIVACY.some((choice) => choice.value === stored.privacy) ? stored.privacy! : "private");
  /** null while the fields can change; else what runs now. */
  const [phase, setPhase] = useState<null | "signing" | "uploading" | "thumbnail">(null);
  const [progress, setProgress] = useState(0);
  const busy = phase !== null;
  const busyRef = useRef(false);
  busyRef.current = busy;

  useEffect(() => {
    void youtubeStatus().then(setStatus).catch(() => setStatus({ available: false, signedIn: false }));
  }, []);

  const close = () => {
    if (busyRef.current) void youtubeCancel();
    else onClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  const chooseVideo = async () => {
    const picked = await openFileDialog({ title: "Video to Upload", multiple: false, defaultPath: video ?? undefined, filters: [{ name: "MP4 video", extensions: ["mp4"] }] });
    if (typeof picked !== "string") return;
    setVideo(picked);
    setTitle(videoTitle(picked));
    setThumbnail(thumbnailOf(picked));
  };
  const chooseThumbnail = async () => {
    const picked = await openFileDialog({ title: "Thumbnail", multiple: false, defaultPath: thumbnail ?? video ?? undefined, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }] });
    if (typeof picked === "string") setThumbnail(picked);
  };

  const signIn = async () => {
    setPhase("signing");
    try {
      await youtubeSignIn();
      setStatus((current) => current && { ...current, signedIn: true });
      return true;
    } catch (error) {
      if (errorText(error) !== CANCELED) onError(`Could not sign in to YouTube. ${errorText(error)}`);
      return false;
    } finally {
      setPhase(null);
    }
  };
  const signOut = async () => {
    await youtubeSignOut().catch((error) => onError(errorText(error)));
    setStatus((current) => current && { ...current, signedIn: false });
  };

  const upload = async () => {
    if (!video || !title.trim() || busy) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ description, tags, privacy })); } catch { /* Remembering is a convenience only. */ }
    if (!status?.signedIn && !await signIn()) return;
    const request = { path: video, title: title.trim(), description, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), privacy };
    let id: string;
    try {
      setProgress(0);
      setPhase("uploading");
      try {
        id = await youtubeUpload(request, setProgress);
      } catch (error) {
        /* The sign-in ended (a test app's sign-in lasts 7 days): sign in again, then upload. */
        if (errorText(error) !== SIGN_IN_NEEDED) throw error;
        setStatus((current) => current && { ...current, signedIn: false });
        if (!await signIn()) return;
        setPhase("uploading");
        id = await youtubeUpload(request, setProgress);
      }
    } catch (error) {
      setPhase(null);
      if (errorText(error) !== CANCELED) onError(`Could not upload the video. ${errorText(error)}`);
      return;
    }
    if (thumbnail) {
      setPhase("thumbnail");
      await youtubeSetThumbnail(id, thumbnail).catch((error) => onError(`The video is on YouTube, but its thumbnail is not. ${errorText(error)}`));
    }
    setPhase(null);
    onUploaded(id, title.trim());
  };

  const unavailable = status !== null && !status.available;
  return (
    <div className="about-dialog-overlay video-dialog-overlay">
      <div className="about-dialog video-dialog upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title">
        <header className="video-dialog-header">
          <div className="open-dialog-title-icon"><YoutubeLogo size={22} weight="duotone" /></div>
          <div>
            <h2 id="upload-dialog-title">Upload to YouTube</h2>
            <p>
              {unavailable ? "This build has no Google key, so it cannot upload." : status?.signedIn ? "Signed in to YouTube." : "The upload first opens Google's sign-in in your browser."}
              {status?.signedIn && !busy && <> <button className="link-button" onClick={() => void signOut()}>Sign out</button></>}
            </p>
          </div>
          <button className="about-dialog-close" onClick={close} aria-label="Close" data-tip="Close `Esc`"><X size={18} /></button>
        </header>
        <div className="video-dialog-body">
          <div className="video-row">
            <span className="video-label">Video</span>
            <span className="upload-file">
              <span className="upload-file-name" data-tip={video ?? undefined}>{video ? fileName(video) : "None"}</span>
              <button className="button secondary" disabled={busy} onClick={() => void chooseVideo()}>Choose…</button>
            </span>
          </div>
          <div className="video-row">
            <span className="video-label">Thumbnail</span>
            <span className="upload-file">
              <span className="upload-file-name" data-tip={thumbnail ?? undefined}>{thumbnail ? fileName(thumbnail) : "YouTube picks a frame"}</span>
              {thumbnail && <button className="button secondary" disabled={busy} onClick={() => setThumbnail(null)}>Remove</button>}
              <button className="button secondary" disabled={busy} onClick={() => void chooseThumbnail()}>Choose…</button>
            </span>
          </div>
          <label className="video-row">
            <span className="video-label">Title</span>
            <input className="video-input" type="text" value={title} maxLength={100} disabled={busy} spellCheck={false} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="video-row upload-row-top">
            <span className="video-label">Description</span>
            <textarea className="video-input upload-description" value={description} maxLength={4900} disabled={busy} placeholder="Kept for the next upload" onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="video-row">
            <span className="video-label">Tags</span>
            <input className="video-input" type="text" value={tags} disabled={busy} spellCheck={false} placeholder="kaleidoscope, music video, …" onChange={(event) => setTags(event.target.value)} />
          </label>
          <div className="video-row">
            <span className="video-label">Privacy</span>
            <div className="video-choices" role="radiogroup" aria-label="Privacy">
              {PRIVACY.map((choice) => (
                <button key={choice.value} role="radio" aria-checked={privacy === choice.value} disabled={busy} className={`video-choice ${privacy === choice.value ? "active" : ""}`} onClick={() => setPrivacy(choice.value)}>
                  <strong>{choice.label}</strong>
                  <span>{choice.note}</span>
                </button>
              ))}
            </div>
          </div>
          {phase && (
            <div className="upload-progress" role="status">
              <span>{phase === "signing" ? "Sign in to Google in your browser…" : phase === "thumbnail" ? "Sending the thumbnail…" : `Uploading… ${Math.floor(progress * 100)}%`}</span>
              <div className="upload-progress-bar"><i style={{ width: `${phase === "uploading" ? progress * 100 : phase === "thumbnail" ? 100 : 0}%` }} /></div>
            </div>
          )}
        </div>
        <footer className="about-dialog-actions video-dialog-actions">
          <button className="button secondary" onClick={close}>{busy ? "Stop" : "Cancel"}</button>
          <button className="button primary" disabled={busy || unavailable || !video || !title.trim()} onClick={() => void upload()}><YoutubeLogo size={16} weight="bold" /> Upload</button>
        </footer>
      </div>
    </div>
  );
}
