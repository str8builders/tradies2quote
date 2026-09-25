import type { Located, Space } from "../timeline";

/**
 * Per-frame state the camera rig writes and the scene parts read in the
 * same frame (the rig's frame callback runs first). Plain mutable data, so
 * scrolling never re-renders React.
 */
export const sceneState: { space: Space | null; located: Located } = {
  space: null,
  located: { scene: "site", t: 0 },
};
