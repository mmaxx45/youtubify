// Songs being dragged (to reorder a playlist or drop onto one in Your Library). HTML5 drag data
// can't be read during dragover, so drop targets look at this instead.

import { shallowRef } from "vue";
import type { Track } from "../ytm/models";

export interface TrackDrag {
  tracks: Track[];
  // The list the drag started in and the row's index there, for reordering inside it
  source?: object;
  index?: number;
}

export const dragging = shallowRef<TrackDrag | null>(null);

const endDrag = (): void => {
  dragging.value = null;
};

/**
 * True when a dragleave really leaves the listening element. Moving onto a child also fires
 * dragleave, and Chromium often reports no relatedTarget, so compare the pointer with its box.
 */
export function leavesElement(event: DragEvent) {
  const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return event.clientX <= r.left || event.clientX >= r.right || event.clientY <= r.top || event.clientY >= r.bottom;
}

export function startTrackDrag(event: DragEvent, drag: TrackDrag) {
  const dt = event.dataTransfer;
  if (!dt || !drag.tracks.length) return;
  dragging.value = drag;
  dt.effectAllowed = "copyMove";
  dt.setData("text/plain", `https://music.youtube.com/watch?v=${drag.tracks[0].videoId}`);

  // Spotify drags a small label with the song name instead of a ghost of the whole row
  const label = document.createElement("div");
  label.textContent = drag.tracks.length > 1 ? `${drag.tracks.length} songs` : drag.tracks[0].title;
  Object.assign(label.style, {
    position: "fixed",
    top: "-100px",
    left: "0",
    maxWidth: "320px",
    padding: "8px 16px",
    borderRadius: "4px",
    background: "#282828",
    color: "#fff",
    font: "400 14px var(--font)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)"
  });
  document.body.appendChild(label);
  dt.setDragImage(label, -12, -12);
  setTimeout(() => label.remove());

  // dragend fires on the source even if it re-rendered; listen on the document to always clear
  document.addEventListener("dragend", endDrag, { once: true });
}
