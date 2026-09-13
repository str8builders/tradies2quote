import { describe, expect, it, vi } from "vitest";
import { createWelcomePlayback } from "./welcome-playback";

function setup() {
  const player = { play: vi.fn(), pause: vi.fn(), seekTo: vi.fn() };
  return { player, playback: createWelcomePlayback(player) };
}
describe("welcome playback", () => {
  it("does not spend the intro while the canvas or chunk loads", () => {
    const { player, playback } = setup();
    playback.visibility(false);
    expect(player.play).not.toHaveBeenCalled();
    playback.ready(false);
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(1);
    playback.ready(false);
    expect(player.seekTo).toHaveBeenCalledTimes(1);
  });
  it("waits for visibility and pauses while the user changes tabs", () => {
    const { player, playback } = setup();
    playback.ready(true);
    expect(player.play).not.toHaveBeenCalled();
    playback.visibility(false);
    playback.visibility(true);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.pause).toHaveBeenCalledTimes(1);
  });
  it("holds the completed frame instead of replaying after a tab switch", () => {
    const { player, playback } = setup();
    playback.ready(false);
    playback.finish();
    playback.visibility(true);
    playback.visibility(false);
    expect(player.play).toHaveBeenCalledTimes(1);
  });
  it("cannot start a late-loading canvas after Enter app/unmount", () => {
    const { player, playback } = setup();
    playback.dispose();
    playback.ready(false);
    playback.visibility(false);
    expect(player.play).not.toHaveBeenCalled();
  });
});
