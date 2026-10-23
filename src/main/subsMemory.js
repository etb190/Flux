// ── Subtitle memory: remember the last subtitle choice per title ──────────
// Persisted to userData/flux-subs.json so the player can re-apply what the
// user had playing — across RESUMES of the same video AND across EPISODES
// of the same show (pick English on S01E01 and S01E02 comes up subtitled
// with no manual re-pick).
//
//   {
//     titles: { "tt1234567": { kind, language?, url?, at } },  per-title
//     last:   { kind, language?, url?, at } | null              global fallback
//   }
//
//   kind: 'external' (a downloaded SRT/VTT/ASS variant — language + the
//          exact downloadUrl so a resume can re-pick the identical file),
//         'embedded' (an HLS WebVTT track — language only, track ids are
//          per-manifest and meaningless next episode),
//         'off'     (the user turned subtitles off — last action wins).
//
// Per-title keys are the SHOW's imdb id (ctx.imdbId is the show id for
// series, the movie id for movies), so one choice covers every episode.
// A choice made before meta loaded (no id yet) is recorded under `last`
// only. Pure Node module (no electron import): main.js passes the file
// path, so it stays unit-testable from plain Node.

const fs = require('fs');
const path = require('path');

const KINDS = ['external', 'embedded', 'off'];
const TT_RE = /^tt\d{5,}$/;

function normalizeChoice(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = String(raw.kind || '');
  if (!KINDS.includes(kind)) return null;
  const choice = { kind, at: Date.now() };
  if (kind === 'off') return choice;
  const language = String(raw.language || '').trim().slice(0, 60);
  if (!language) return null;
  choice.language = language;
  if (kind === 'external') {
    const url = String(raw.url || '').trim().slice(0, 2000);
    choice.url = url || null;
  }
  return choice;
}

function loadSubsMemory(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const titles = {};
    if (parsed && typeof parsed.titles === 'object' && parsed.titles) {
      for (const [key, value] of Object.entries(parsed.titles)) {
        if (TT_RE.test(key)) {
          const choice = normalizeChoice(value);
          if (choice) titles[key] = choice;
        }
      }
    }
    return { titles, last: normalizeChoice(parsed && parsed.last) };
  } catch (_) {
    return { titles: {}, last: null };   // missing / corrupt file → defaults
  }
}

function saveSubsMemory(file, mem) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(mem, null, 2) + '\n', 'utf8');
  } catch (e) {
    throw new Error('Could not save subtitle memory: ' + (e && e.message));
  }
}

// Record a choice: under the title key when it is a real tt-id (one entry
// covers every episode of that show) and always as the global `last`
// fallback for titles we could not key. Returns the updated memory so the
// renderer cache can adopt the authoritative copy.
function recordSubsChoice(file, titleKey, rawChoice) {
  const choice = normalizeChoice(rawChoice);
  const mem = loadSubsMemory(file);
  if (!choice) return mem;
  const key = String(titleKey || '');
  if (TT_RE.test(key)) mem.titles[key] = choice;
  mem.last = choice;
  saveSubsMemory(file, mem);
  return mem;
}

module.exports = { loadSubsMemory, saveSubsMemory, recordSubsChoice, normalizeChoice };
