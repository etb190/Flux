/* ── Playback-position carry across a source switch ──────────────────────
 * Stream hosts expire sessions: leaving a video paused for a while kills
 * the source, the player fail-cards, and the user has to pick a new
 * source. Picking used to restart from 0:00 — this decides how much of
 * the old position the new source should pick up.
 *
 * `prog` is the last progress snapshot reported by the player (see
 * PlayerView.saveProgress → onProgress). The carry only applies when the
 * snapshot belongs to the SAME title (imdbId) and, for series, the SAME
 * episode; anything else is a fresh playback and returns 0.
 */

export function resolveCarrySec(prog, meta, episode) {
  if (!prog || !meta) return 0;
  const pos = Number(prog.positionSec);
  // Below ~5s there is nothing worth resuming (the player's own resume
  // seek ignores targets that small too).
  if (!Number.isFinite(pos) || pos <= 5) return 0;
  if (!prog.imdbId || prog.imdbId !== meta.id) return 0;
  if (meta.type === 'series') {
    const wantSeason = (episode && episode.season) ?? 1;
    const wantEpisode = (episode && episode.episode) ?? 1;
    if ((prog.season ?? 1) !== wantSeason || (prog.episode ?? 1) !== wantEpisode) {
      return 0;
    }
  }
  return Math.floor(pos);
}
