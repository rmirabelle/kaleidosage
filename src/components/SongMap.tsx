import { TIER_NAMES } from "../engine/songPlan";
import type { SongScript } from "../engine/songScript";

/**
 * The song map: the song's parts as a strip inside a seek bar's well (see
 * the Playlist card's toolbar), one block per part, darker for calm parts
 * and brighter for peak parts, with a red mark at each drop (see
 * songPlan.ts).
 */
export function SongMap({ song }: { song: SongScript }) {
  const at = (time: number) => `${(time / Math.max(1e-3, song.duration)) * 100}%`;
  return (
    <div className="song-map-parts">
      {song.plan.parts.map((part) => (
        <i key={part.start} className={`song-map-part tier-${part.tier}`} style={{ left: at(part.start), width: at(part.end - part.start) }} title={`${part.label}, ${TIER_NAMES[part.tier]}`} />
      ))}
      {song.plan.drops.map((drop) => <b key={drop.time} className="song-map-drop" style={{ left: at(drop.time) }} />)}
    </div>
  );
}
