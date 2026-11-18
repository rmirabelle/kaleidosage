import { CircleNotch, Cube, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelData } from "../engine/model";
import { HAVEN_SIZES, filterHavenModels, listHavenModels, loadHavenModel, type HavenModel, type HavenSize } from "../lib/polyHaven";
import { Dropdown } from "./Dropdown";

const STORE_KEY = "kaleidosage.model-browser";
/** How many models show at first, and how many more each "Show more" adds. */
const PAGE = 60;

type Order = "used" | "new" | "name";
const ORDERS: readonly (readonly [Order, string])[] = [["used", "Most used"], ["new", "Newest"], ["name", "Name"]];
const SIZE_NAMES: Record<HavenSize, string> = { "1k": "Small (1K)", "2k": "Medium (2K)", "4k": "Large (4K)" };

function loadStored(): { words: string; category: string; order: Order; size: HavenSize } {
  const start = { words: "", category: "", order: "used" as Order, size: "2k" as HavenSize };
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, unknown>;
    return {
      words: typeof stored.words === "string" ? stored.words : start.words,
      category: typeof stored.category === "string" ? stored.category : start.category,
      order: ORDERS.some(([order]) => order === stored.order) ? stored.order as Order : start.order,
      size: HAVEN_SIZES.includes(stored.size as HavenSize) ? stored.size as HavenSize : start.size
    };
  } catch {
    return start;
  }
}

/**
 * The free 3D models of Poly Haven, for the 3D Object's Model shape: a
 * search box, a category menu and an order menu over a grid of small
 * pictures. A click on a model downloads it with pictures of the picked
 * size and gives it to "onPick". Esc, the close button or a click outside
 * the dialog closes it, and stops a download.
 */
export function ModelBrowserDialog({ onPick, onCancel }: {
  onPick: (model: ModelData) => void;
  onCancel: () => void;
}) {
  const stored = useRef(loadStored()).current;
  const [words, setWords] = useState(stored.words);
  const [category, setCategory] = useState(stored.category);
  const [order, setOrder] = useState<Order>(stored.order);
  const [size, setSize] = useState<HavenSize>(stored.size);
  const [models, setModels] = useState<HavenModel[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  /** The model that downloads now, and the part done (0 to 1). */
  const [loading, setLoading] = useState<{ id: string; done: number } | null>(null);
  const download = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  /* The dialog closed: a download in progress stops. */
  useEffect(() => () => download.current?.abort(), []);

  useEffect(() => {
    let closed = false;
    listHavenModels()
      .then((list) => { if (!closed) setModels(list); })
      .catch((error) => { if (!closed) setMessage(`The list of models did not load. ${error instanceof Error ? error.message : "Check the internet connection."}`); });
    return () => { closed = true; };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ words, category, order, size }));
    } catch { /* The choices are then not kept for the next time. */ }
  }, [words, category, order, size]);

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
    <div className="about-dialog-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="about-dialog video-dialog image-search-dialog model-browser-dialog" role="dialog" aria-modal="true" aria-labelledby="model-browser-title">
        <header className="video-dialog-header">
          <div className="open-dialog-title-icon"><Cube size={22} weight="duotone" /></div>
          <div>
            <h2 id="model-browser-title">Free 3D Models</h2>
            <p>Models from Poly Haven. All of them are free for any use (CC0). Click a model to put it on the 3D object.</p>
          </div>
          <button className="about-dialog-close" onClick={onCancel} aria-label="Close" data-tip="Close"><X size={18} /></button>
        </header>
        <div className="video-dialog-body">
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
            {models && <span className="model-browser-count">{found.length} {found.length === 1 ? "model" : "models"}</span>}
          </div>
          <div className="image-search-results model-browser-results" aria-busy={models === null || loading !== null}>
            {found.slice(0, shown).map((model) => {
              const busy = loading?.id === model.id;
              return (
                <button
                  key={model.id}
                  className={`image-search-result model-browser-result${busy ? " busy" : ""}`}
                  data-tip={`${model.name}: ${model.triangles.toLocaleString()} triangles`}
                  disabled={loading !== null && !busy}
                  onClick={() => void pick(model)}
                >
                  <img src={model.thumb} alt="" loading="lazy" />
                  <span className="model-browser-name">{model.name}</span>
                  {busy && (
                    <span className="model-browser-progress">
                      <CircleNotch size={22} className="spin" />
                      {Math.round((loading?.done ?? 0) * 100)}%
                    </span>
                  )}
                </button>
              );
            })}
            {models === null && !message && <div className="image-search-message"><CircleNotch size={20} className="spin" /></div>}
            {models !== null && found.length === 0 && <p className="video-note image-search-message">No models found. Try other words or another category.</p>}
          </div>
          {message && <p className="video-note model-browser-error">{message}</p>}
          {found.length > shown && (
            <button className="button secondary image-search-more" onClick={() => setShown((count) => count + PAGE)}>Show more</button>
          )}
        </div>
      </div>
    </div>
  );
}
