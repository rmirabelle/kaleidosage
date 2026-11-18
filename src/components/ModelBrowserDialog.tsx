import { CircleNotch, Cube, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ModelData } from "../engine/model";
import { HAVEN_SIZES, filterHavenModels, listHavenModels, loadHavenModel, type HavenModel, type HavenSize } from "../lib/polyHaven";
import { FAB_CATEGORIES, FAB_LICENSES, FAB_ORDERS, FabTokenError, fabToken, loadFabModel, searchSketchfab, setFabToken, type FabModel } from "../lib/sketchfab";
import { Dropdown } from "./Dropdown";

const STORE_KEY = "kaleidosage.model-browser";
/** How many Poly Haven models show at first, and how many more each "Show more" adds. */
const PAGE = 60;
/** Where a Sketchfab account shows its API token. */
const TOKEN_PAGE = "sketchfab.com/settings/password";

type Source = "haven" | "fab";
type Order = "used" | "new" | "name";
const ORDERS: readonly (readonly [Order, string])[] = [["used", "Most used"], ["new", "Newest"], ["name", "Name"]];
const SIZE_NAMES: Record<HavenSize, string> = { "1k": "Small (1K)", "2k": "Medium (2K)", "4k": "Large (4K)" };

/** The choices the browser keeps for the next time. */
interface Stored {
  source: Source;
  words: string;
  category: string;
  order: Order;
  size: HavenSize;
  fabWords: string;
  fabCategory: string;
  fabLicense: string;
  fabOrder: string;
}

function loadStored(): Stored {
  const start: Stored = { source: "haven", words: "", category: "", order: "used", size: "2k", fabWords: "", fabCategory: "", fabLicense: "", fabOrder: "-likeCount" };
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, unknown>;
    const kept = (key: keyof Stored, allowed?: readonly string[]) =>
      typeof stored[key] === "string" && (!allowed || allowed.includes(stored[key] as string)) ? stored[key] as string : start[key];
    return {
      source: kept("source", ["haven", "fab"]) as Source,
      words: kept("words"),
      category: kept("category"),
      order: kept("order", ORDERS.map(([order]) => order)) as Order,
      size: kept("size", HAVEN_SIZES) as HavenSize,
      fabWords: kept("fabWords"),
      fabCategory: kept("fabCategory", FAB_CATEGORIES.map(([slug]) => slug)),
      fabLicense: kept("fabLicense", FAB_LICENSES.map(([slug]) => slug)),
      fabOrder: kept("fabOrder", FAB_ORDERS.map(([order]) => order))
    };
  } catch {
    return start;
  }
}

function keep(changes: Partial<Stored>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...loadStored(), ...changes }));
  } catch { /* The choices are then not kept for the next time. */ }
}

/** A download in progress: which model, and the part done (0 to 1). */
type Loading = { id: string; done: number } | null;

/** One model of the grid: its picture, its name, and the download's progress over it while it loads. */
function Tile({ id, name, thumb, tip, wide, loading, onPick, children }: {
  id: string;
  name: string;
  thumb: string;
  tip: string;
  /** A picture 16 wide and 9 high (Sketchfab's); else a square one. */
  wide?: boolean;
  loading: Loading;
  onPick: () => void;
  children?: ReactNode;
}) {
  const busy = loading?.id === id;
  return (
    <button className={`image-search-result model-browser-result${wide ? " wide" : ""}${busy ? " busy" : ""}`} data-tip={tip} disabled={loading !== null && !busy} onClick={onPick}>
      {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="model-browser-blank" />}
      <span className="model-browser-name">{name}</span>
      {children}
      {busy && (
        <span className="model-browser-progress">
          <CircleNotch size={22} className="spin" />
          {Math.round((loading?.done ?? 0) * 100)}%
        </span>
      )}
    </button>
  );
}

/** The free models of Poly Haven: the whole list comes at once, so the search and the menus work with no more requests. */
function HavenModels({ stored, onPick }: { stored: Stored; onPick: (model: ModelData) => void }) {
  const [words, setWords] = useState(stored.words);
  const [category, setCategory] = useState(stored.category);
  const [order, setOrder] = useState<Order>(stored.order);
  const [size, setSize] = useState<HavenSize>(stored.size);
  const [models, setModels] = useState<HavenModel[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState<Loading>(null);
  const download = useRef<AbortController | null>(null);

  /* The list goes away (the dialog closed, or the other source shows): a download in progress stops. */
  useEffect(() => () => download.current?.abort(), []);

  useEffect(() => {
    let closed = false;
    listHavenModels()
      .then((list) => { if (!closed) setModels(list); })
      .catch((error) => { if (!closed) setMessage(`The list of models did not load. ${error instanceof Error ? error.message : "Check the internet connection."}`); });
    return () => { closed = true; };
  }, []);

  useEffect(() => keep({ words, category, order, size }), [words, category, order, size]);

  /* The categories with the most models first; a kept category that Poly Haven no longer has shows all. */
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of models ?? []) for (const each of model.categories) counts.set(each, (counts.get(each) ?? 0) + 1);
    const names = [...counts].sort((a, b) => b[1] - a[1]).map(([name, count]) => [name, `${name[0].toUpperCase()}${name.slice(1)} (${count})`] as const);
    return [["", "All categories"] as const, ...names];
  }, [models]);
  const picked = categories.some(([name]) => name === category) ? category : "";

  const found = useMemo(() => {
    const list = filterHavenModels(models ?? [], words, picked);
    if (order === "used") list.sort((a, b) => b.downloads - a.downloads);
    else if (order === "new") list.sort((a, b) => b.published - a.published);
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [models, words, picked, order]);

  const pick = async (model: HavenModel) => {
    if (loading) return;
    const control = new AbortController();
    download.current = control;
    setMessage(null);
    setLoading({ id: model.id, done: 0 });
    try {
      const loaded = await loadHavenModel(model, size, (done) => setLoading({ id: model.id, done }), control.signal);
      if (!control.signal.aborted) onPick(loaded);
    } catch (error) {
      if (!control.signal.aborted) setMessage(`The model "${model.name}" did not load. ${error instanceof Error ? error.message : "Check the internet connection."}`);
    } finally {
      if (!control.signal.aborted) setLoading(null);
    }
  };

  return (
    <>
      <div className="model-browser-bar">
        <input
          className="video-input"
          type="text"
          value={words}
          placeholder="Search, for example: chair, rock, lantern"
          autoFocus
          spellCheck={false}
          onChange={(event) => { setWords(event.target.value); setShown(PAGE); }}
        />
        <Dropdown value={picked} options={categories} onChange={(next) => { setCategory(next); setShown(PAGE); }} label="Category" noWrap />
        <Dropdown value={order} options={ORDERS} onChange={(next) => { setOrder(next); setShown(PAGE); }} label="Order" />
      </div>
      <div className="model-browser-sizes" role="radiogroup" aria-label="Texture size">
        <span className="model-browser-sizes-name" data-tip="How large the model's pictures are. Larger pictures are sharper close up, take longer to download and make the scene file larger.">Textures</span>
        {HAVEN_SIZES.map((each) => (
          <label key={each} className="video-radio">
            <input type="radio" name="model-browser-size" checked={size === each} onChange={() => setSize(each)} />
            {SIZE_NAMES[each]}
          </label>
        ))}
        {models && <span className="model-browser-count">{found.length} {found.length === 1 ? "model" : "models"}, all free for any use (CC0)</span>}
      </div>
      <div className="image-search-results model-browser-results" aria-busy={models === null || loading !== null}>
        {found.slice(0, shown).map((model) => (
          <Tile key={model.id} id={model.id} name={model.name} thumb={model.thumb} tip={`${model.name}: ${model.triangles.toLocaleString()} triangles`} loading={loading} onPick={() => void pick(model)} />
        ))}
        {models === null && !message && <div className="image-search-message"><CircleNotch size={20} className="spin" /></div>}
        {models !== null && found.length === 0 && <p className="video-note image-search-message">No models found. Try other words or another category.</p>}
      </div>
      {message && <p className="video-note model-browser-error">{message}</p>}
      {found.length > shown && (
        <button className="button secondary image-search-more" onClick={() => setShown((count) => count + PAGE)}>Show more</button>
      )}
    </>
  );
}

const megabytes = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * The models of Sketchfab that anyone can download. Sketchfab does the
 * search: Enter or the Search button asks it, and so does a change of a
 * menu. A download needs the user's own API token, which the token row
 * takes and keeps on this PC.
 */
function FabModels({ stored, onPick }: { stored: Stored; onPick: (model: ModelData) => void }) {
  const [words, setWords] = useState(stored.fabWords);
  /** The words of the search that shows now (the box can hold words that are not yet searched). */
  const [asked, setAsked] = useState(stored.fabWords);
  const [category, setCategory] = useState(stored.fabCategory);
  const [license, setLicense] = useState(stored.fabLicense);
  const [order, setOrder] = useState(stored.fabOrder);
  const [models, setModels] = useState<FabModel[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<Loading>(null);
  const [token, setToken] = useState(fabToken);
  /** The token row is open: at first when there is no token, later by the "API token" button or when Sketchfab refuses the token. */
  const [tokenOpen, setTokenOpen] = useState(() => !fabToken());
  const [typed, setTyped] = useState("");
  /** Each search gets a number; the answer of an older search is ignored. */
  const searchId = useRef(0);
  const download = useRef<AbortController | null>(null);

  useEffect(() => () => download.current?.abort(), []);
  useEffect(() => keep({ fabWords: asked, fabCategory: category, fabLicense: license, fabOrder: order }), [asked, category, license, order]);

  const search = async (cursor: string | null) => {
    const id = ++searchId.current;
    setSearching(true);
    setMessage(null);
    if (!cursor) setModels([]);
    try {
      const found = await searchSketchfab({ words: asked, category, license, order, cursor });
      if (id !== searchId.current) return;
      setModels((before) => cursor ? [...before, ...found.models.filter((model) => !before.some((each) => each.uid === model.uid))] : found.models);
      setNext(found.next);
      if (!cursor && found.models.length === 0) setMessage("No models found. Try other words, another category or another license.");
    } catch (error) {
      if (id === searchId.current) setMessage(`The search did not work. ${error instanceof Error ? error.message : "Check the internet connection."}`);
    } finally {
      if (id === searchId.current) setSearching(false);
    }
  };
  /* A new search when the searched words or a menu change, and at the start. */
  useEffect(() => { void search(null); }, [asked, category, license, order]);

  const saveToken = () => {
    if (!typed.trim()) return;
    setFabToken(typed);
    setToken(typed.trim());
    setTyped("");
    setTokenOpen(false);
    setMessage(null);
  };

  const pick = async (model: FabModel) => {
    if (loading) return;
    if (!token) {
      setTokenOpen(true);
      setMessage("A download from Sketchfab needs your API token. Put it in the box above, then click the model again.");
      return;
    }
    const control = new AbortController();
    download.current = control;
    setMessage(null);
    setLoading({ id: model.uid, done: 0 });
    try {
      const loaded = await loadFabModel(model, token, (done) => setLoading({ id: model.uid, done }), control.signal);
      if (!control.signal.aborted) onPick(loaded);
    } catch (error) {
      if (control.signal.aborted) return;
      if (error instanceof FabTokenError) setTokenOpen(true);
      setMessage(`The model "${model.name}" did not load. ${error instanceof Error ? error.message : "Check the internet connection."}`);
    } finally {
      if (!control.signal.aborted) setLoading(null);
    }
  };

  return (
    <>
      <div className="model-browser-bar fab">
        <input
          className="video-input"
          type="text"
          value={words}
          placeholder="Search, for example: spaceship, dragon, robot, castle"
          autoFocus
          spellCheck={false}
          onChange={(event) => setWords(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") setAsked(words.trim()); }}
        />
        <button className="button primary" onClick={() => setAsked(words.trim())} disabled={searching}>Search</button>
      </div>
      <div className="model-browser-bar menus">
        <Dropdown value={category} options={FAB_CATEGORIES} onChange={setCategory} label="Category" noWrap />
        <Dropdown value={license} options={FAB_LICENSES} onChange={setLicense} label="License" noWrap />
        <Dropdown value={order} options={FAB_ORDERS} onChange={setOrder} label="Order" />
        {!tokenOpen && <button className="button secondary small model-browser-token-button" onClick={() => setTokenOpen(true)} data-tip="Change the Sketchfab API token that downloads use">API token…</button>}
      </div>
      {tokenOpen && (
        <div className="model-browser-token">
          <p className="video-note">
            A download needs your Sketchfab API token. Sign in to your free account in a web browser, open <b className="model-browser-address">{TOKEN_PAGE}</b>, and copy the API Token.
            Kaleido Sage keeps it on this PC and sends it only to Sketchfab.{token ? " A token is saved now; a new one replaces it." : ""}
          </p>
          <div className="model-browser-bar fab">
            <input
              className="video-input"
              type="password"
              value={typed}
              placeholder="Paste the API token here"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") saveToken(); }}
            />
            <button className="button primary" onClick={saveToken} disabled={!typed.trim()}>Save</button>
            {token && <button className="button secondary" onClick={() => { setTokenOpen(false); setTyped(""); }}>Cancel</button>}
          </div>
        </div>
      )}
      <div className="image-search-results model-browser-results wide" aria-busy={searching || loading !== null}>
        {models.map((model) => (
          <Tile
            key={model.uid}
            id={model.uid}
            name={model.name}
            thumb={model.thumb}
            wide
            tip={`${model.name} by ${model.author}. ${model.license || "License: see its page"}. ${model.triangles.toLocaleString()} triangles, ${megabytes(model.bytes)}`}
            loading={loading}
            onPick={() => void pick(model)}
          >
            <span className="model-browser-maker">{model.author} · {model.license.replace(/^CC /, "") || "License on its page"} · {megabytes(model.bytes)}</span>
          </Tile>
        ))}
        {searching && <div className="image-search-message"><CircleNotch size={20} className="spin" /></div>}
      </div>
      {message && <p className="video-note model-browser-error">{message}</p>}
      {next && !searching && models.length > 0 && (
        <button className="button secondary image-search-more" onClick={() => void search(next)}>Show more</button>
      )}
    </>
  );
}

/**
 * The browser of 3D models for the 3D Object's Model shape, with two
 * sources: Poly Haven (real-world objects, all free for any use) and
 * Sketchfab (very many models of all kinds; most need a credit, and a
 * download needs the user's Sketchfab API token). A click on a model
 * downloads it and gives it to "onPick". Esc, the close button or a click
 * outside the dialog closes it, and stops a download.
 */
export function ModelBrowserDialog({ onPick, onCancel }: {
  onPick: (model: ModelData) => void;
  onCancel: () => void;
}) {
  const stored = useRef(loadStored()).current;
  const [source, setSource] = useState<Source>(stored.source);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const show = (next: Source) => {
    setSource(next);
    keep({ source: next });
  };

  return (
    <div className="about-dialog-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="about-dialog video-dialog image-search-dialog model-browser-dialog" role="dialog" aria-modal="true" aria-labelledby="model-browser-title">
        <header className="video-dialog-header">
          <div className="open-dialog-title-icon"><Cube size={22} weight="duotone" /></div>
          <div>
            <h2 id="model-browser-title">3D Models</h2>
            <p>{source === "haven"
              ? "Real-world objects from Poly Haven, all free for any use. Click a model to put it on the 3D object."
              : "Models of all kinds from Sketchfab. Most need a credit to their maker when you publish. Click a model to put it on the 3D object."}</p>
          </div>
          <button className="about-dialog-close" onClick={onCancel} aria-label="Close" data-tip="Close"><X size={18} /></button>
        </header>
        <div className="video-dialog-body">
          <div className="model-browser-sources" role="tablist" aria-label="Source of the models">
            <button role="tab" aria-selected={source === "haven"} className={source === "haven" ? "active" : ""} onClick={() => show("haven")}>Poly Haven</button>
            <button role="tab" aria-selected={source === "fab"} className={source === "fab" ? "active" : ""} onClick={() => show("fab")}>Sketchfab</button>
          </div>
          {/* The kept choices are read again when the source changes, so each side comes back as it was left. */}
          {source === "haven" ? <HavenModels stored={loadStored()} onPick={onPick} /> : <FabModels stored={loadStored()} onPick={onPick} />}
        </div>
      </div>
    </div>
  );
}
