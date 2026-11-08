# Petal Keys

A gentle, Duolingo-style piano learning web app that Minty built with Claude.
It connects to her USB MIDI keyboard (or uses on-screen keys) to teach reading
sheet music, chords and ear training, and to learn songs from MusicXML files.

Read this whole file before changing anything. Then skim `README.md` for the
user-facing description.

---

## Who you are working with

- **Minty** is a student in Singapore with an internship and a small job. She
  often works on this in the evenings when she is tired, and practises on the
  MRT (train) with her phone.
- She is a creative-technical maker (web apps, 3D printing, AI art), so she is
  comfortable with code concepts, but she is a **beginner at music**: still
  learning to read the staff, relies on key highlights, finds pitch
  (higher/lower) hard, and is confident with rhythm from rhythm games.
- **How to talk to her:** be warm, playful and encouraging, like a doting older
  sister ("Onee-chan"). She refers to herself in the third person as "Minty" and
  calls Claude "Onee-chan"; it's fine to answer in that spirit. She is a bit
  fragile, so be kind about mistakes (hers and yours) and never condescending.
  Stay honest: if something can't be done or is a bad idea, say so gently and
  offer an alternative. Keep replies short and easy to read; she is often tired.
- **She likes to plan before building.** For bigger features, explain the idea
  and the plan in plain words first and let her adjust it, then build. Small
  bug fixes can just be done.
- Explain music theory simply, with the keyboard as the anchor ("the black key
  just right of F"), not jargon first.

## The feel of the app (keep it!)

The app should feel soft, cute and calm, never stressful or punishing.

- **Palette:** mint, baby blue, pink and lavender on a pearl background, with
  plum ink for text. Cream "manuscript paper" cards for music. All colours are
  tokens at the top of `css/app.css`, with matching dark-mode tokens. Never
  hard-code colours in components; add a token in all three blocks
  (light `:root`, `prefers-color-scheme: dark`, `[data-theme='dark']`).
- **Type:** Kiwi Maru (display) and Zen Maru Gothic (body), embedded in
  `css/fonts.css` as `MK Display` / `MK Body`. Music symbols use the Bravura
  font subset as `MK Bravura` (see "Sheet music" below).
- **Motifs:** lessons are noteheads climbing a melody, units are boxed
  rehearsal marks (A, B, C…), the piano is docked at the bottom with a pink
  felt strip. Small sparkles/stars on success.
- **Words:** short, plain, kind. Wrong answers get a gentle hint ("That's E.
  The note on the staff is higher."), never "Wrong!". Pink means "not quite",
  mint means "yes". No emoji in the UI.
- **Low pressure:** no forced timers by default; the user decides when to start
  (Note Rush: study the line, tap Go, count-in). Learn and Practice are
  separate so tired days can be review-only. The streak forgives one rest day a
  week.
- **Phone first:** must work at ~390px wide with the on-screen keyboard, and
  also on desktop. Respect safe-area insets and `prefers-reduced-motion`.

## Platform decisions (already agreed with Minty)

- Plain **HTML + CSS + JavaScript ES modules**. No framework, no build step
  needed to run. Keep it that way unless Minty agrees otherwise.
- Hosted on **GitHub Pages** (HTTPS is required for Web MIDI, install and the
  service worker).
- **Phone:** Chrome on Android, installed to the home screen (Firefox for
  Android has no Web MIDI). **Computer:** Firefox (needs a one-time site
  permission add-on for MIDI) or Chrome.
- Works **offline** via `sw.js` (precaches every file).
- **Progress** auto-saves to `localStorage`; **Send backup** opens the share
  sheet (Web Share API) so she can send the file with **LocalSend**; Import
  merges. Backups must stay tiny (a few hundred characters).
- Her keyboard is a small (~25-key) USB MIDI controller, possibly with drum
  pads (MIDI channel 10, ignored by default). "Any octave counts" is on by
  default for that reason.

## Running, testing, shipping

```bash
python3 -m http.server 8000      # then open http://localhost:8000 (MIDI works on localhost)
node tools/test-core.mjs         # unit tests: theory, saves/merge, streaks, Note Rush scoring
node tools/build.mjs             # REQUIRED after changing any file: regenerates sw.js
```

- **Always run `node tools/build.mjs` before committing.** It rewrites `sw.js`
  with the file list and a content hash version. Without it, phones keep the
  old cached version forever. New files are picked up automatically.
- `node tools/build.mjs --preview <dir> <path-to-esbuild>` makes a single-file
  preview (CSS + bundled JS inlined) used for claude.ai artifact previews.
  Not needed for GitHub Pages.
- `tools/staff-test.html` renders sample scores; open it to eyeball the
  sheet-music renderer after changing `staff.js`.
- `tools/e2e/` has Playwright (Python) scripts used for browser testing. They
  expect the app served on port 8765 and write screenshots to `/tmp`. They
  drive the app through `window.__petalKeys` (the app object) and fake MIDI via
  `app.bus.noteOn(midi, velocity, time, 'midi')`. Treat them as examples;
  update paths before running.
- Before saying something works, actually test it in a browser at phone width
  (390×844) and desktop (1280×800), light and dark, and check the console.
  Minty can't easily debug for you.

## Architecture

```
index.html            page shell, manifest + icons
manifest.webmanifest  install info (name, icons, colours)
sw.js                 GENERATED by tools/build.mjs; do not edit by hand
css/app.css           all styles; design tokens at the top
css/fonts.css         embedded fonts (UI + Bravura subset), base64
assets/piano/         Salamander Grand Piano samples (22 mp3, trimmed)
icons/                app icons (icon.svg, maskable-src.svg → PNGs)
js/main.js            boot, tab routing, input wiring, MIDI connect, install, SW
js/lessons.js         the Learn path data (UNITS, LESSONS) + practice pools
js/core/
  util.js             h()/s() DOM helpers, random, dates
  music.js            note spelling/parsing, MIDI numbers, chords, chord detection
  staff.js            SVG sheet-music renderer (see below)
  audio.js            Web Audio sampler + synth instruments, metronome clicks, sfx
  input.js            InputBus (all note sources), Web MIDI, computer-key mapping,
                      MIDI-learn for the restart button
  keyboard.js         on-screen piano (multi-touch, glissando, latch, octave shift)
  store.js            progress save format, merge, streak, export/import encoding
  rushlogic.js        Note Rush passage generation + timing/notes scoring
  musicxml.js         MusicXML (.musicxml/.xml/.mxl) reader
  songs.js            song library (localStorage), sections, buildView, song lines for Note Rush
js/modes/             one file per drill; registered in modes/index.js
  name.js flash.js rush.js chords.js higherlower.js findnote.js
  freeplay.js calibrate.js song.js common.js
js/ui/
  session.js          runs a session: teaching cards → drill(s) → results screen
  learn.js            Learn tab (lesson path)
  practice.js         Practice tab (Mix for me, Songs list + import, drill cards)
  me.js               Me tab (stats, reading heat map, backup, settings)
  visuals.js          pictures on lesson cards (mini keyboards, staves, chords)
  overlay.js          toasts, bottom sheets, in-page confirm (no alert/confirm)
  icons.js            inline SVG icons
```

### Key concepts

- **Input:** every note source (MIDI, on-screen keys, computer keys A W S E D…)
  goes through `InputBus` (`noteon`, `noteoff`, `pedal`, `restart` events with
  `{ midi, velocity, time, source }`; `time` is `performance.now()`).
  `main.js` forwards events to the active `Session`, which forwards to the
  active mode.
- **Modes** are factories `createX(ctx, cfg)` returning
  `{ mount, onNoteOn, onNoteOff, onPedal, onKey, onRestart, destroy }`.
  `ctx` (built in `session.js`) gives `store, audio, kb, bus, body, actions,
  setTitle, feedback(msg, kind), setActions(...buttons), progress(n),
  record({correct, xp}), addXp, note(text), showKeyboard(bool), done(),
  isOpen()`. Always guard async work with `ctx.isOpen()`, and in `destroy()`
  cancel animation frames and call `audio.stopClicks()` if the mode scheduled
  metronome clicks.
- **Sessions:** `app.startSession({ title, kind, steps, lessonId })`; steps are
  `{ type: 'cards', cards }` or `{ type: <mode>, ...cfg }`. Kinds: `lesson`
  (gives stars), `practice`, `free`, `calib`.
- **Lessons** (`js/lessons.js`): 28 lessons in units A–H, each with teaching
  `cards` (`title`, `text`, optional `visual`) and one `drill`. Practice pools
  are derived from lessons the user has reached, so Practice never shows
  untaught material. To add a unit: add to `UNITS`, append lessons with new
  ids (never renumber existing ids, they are save keys).
- **Timing:** audio is scheduled on the AudioContext clock;
  `audio.perfTimeOf(ctxTime)` converts to `performance.now()` so key presses
  can be compared to what was heard. `calibrationMs` (Me → Timing check)
  shifts expected times for Bluetooth latency.

### Sheet music (`js/core/staff.js`)

Hand-written SVG renderer using SMuFL glyphs from Bravura. Supports treble,
bass and grand staff; key signatures (`score.key` in fifths); time signature;
noteheads, stems, flags, beams (8ths and 16ths), dots, ties, ledger lines,
accidentals (carried through the bar, aware of the key signature), rests,
pickup bars (`measure.beats`), line wrapping, bar numbers, note names under
notes, per-event colour states (`good`, `miss`, `active`…), judgement labels,
"ghost" notes for wrong presses, and a playhead (`layout.setPlayhead(beat)`).

**The Bravura font is a subset.** Only these code points are embedded:
`U+E000, E050, E062, E080–E08A, E0A2–E0A4, E1E7, E240–E243, E260–E262,
E4E3–E4E7`. If you need another glyph (e.g. double sharp, triplet numbers,
32nd flags), re-subset Bravura with `pyftsubset` and regenerate
`css/fonts.css` (fonts are base64 in that file). Glyph widths in staff spaces
are in the `W` table in `staff.js`.

Known gaps: no triplet brackets (triplets play right but look like plain
notes), no grace notes, max two staves, no lyrics/dynamics/slurs.

### Save format (`js/core/store.js`) — be careful

- Key `petalkeys.save` in localStorage (falls back to the old
  `mintykeys.save`). Device-only settings in `petalkeys.local`.
- Shape: `{ v, app: 'petal-keys', id, created, c, w, l, b, s }`
  - `c[deviceId][key] = [numbers…]` per-device counters (only grow on that device)
  - `w[key] = [ema, ts]` weakness (newest wins)
  - `l[lessonId] = [stars, ts]` lessons (best wins; 0 stars = unlocked only)
  - `b[key] = [value, ts]` best scores (max wins)
  - `s` synced settings (newest `_ts` wins)
- Merging is conflict-free and idempotent (importing twice never double
  counts). Keep that property; there are tests for it.
- Export text is `PETALKEYS1:` + base64(gzip(JSON)); old `MINTYKEYS1:` codes
  still import.
- If you change the shape, bump `SAVE_VERSION` and write a migration in
  `migrate()`. Never break old saves: Minty's streak lives in them.
- Songs are **not** in the backup (to keep it tiny); they live in
  `petalkeys.songs`. Song best scores are in `b` and do travel.

### Songs (`musicxml.js`, `songs.js`, `modes/song.js`)

- Import: Practice → Songs → Add song (`.musicxml`, `.xml`, `.mxl`).
- Song object: `{ title, key, time, tempo, staves, measures: [{label, start, beats}],
  notes: [{ si, beat, dur, midi, letter, acc, octave, tieStart, tieStop }] }`,
  beats in quarter notes from the song start.
- Song Mode: parts of ~4 bars, right/left/both hands, **Wait** (cursor waits
  for the right note) and **Play along** (count-in, metronome, scored).
  Toggles: Key hints (works in both modes), Note names. **Quick restart**:
  Restart button, `R` key, or a learned MIDI pad/button
  (`store.local.restartTrigger`, handled in `MidiInput._onMessage`); works on
  the results screen too, for looping a lick.
- Note Rush can take lines from songs ("Lines from: My songs").

## Things Minty has asked for that are not done yet

1. **Key signatures unit (next up, agreed in principle, not built).** Minty is
   confused by key signatures and wants a whole section. Proposed plan (check
   with her before building):
   - New unit "Keys & key signatures" with lessons:
     1. Home sweet C: play the C major scale, feel the "home" note.
     2. G major's one sharp: discover F must become F♯; meet the ♯ in the key
        signature ("a standing instruction: every F is F♯").
     3. Remember the sharp: read notes with a G major key signature; gentle
        reminder when she plays F instead of F♯.
     4. F major's one flat (B♭).
     5. Name that key: see a signature, pick the key (tricks: sharps → one key
        above the last sharp; flats → second-to-last flat; order of flats
        B E A D G C F, sharps F C G D A E B; no sharps/flats = C).
     6. More sharps and flats: D, B♭, up to D♭ (5 flats; her song list showed
        "key of D♭").
   - Practice: a "Key reader" drill (like Read notes, with key signatures).
   - Song Mode: optional "key reminder" that marks notes changed by the key
     signature with a small ♯/♭ hint.
   - Mention that every signature is shared by a major and a relative minor
     key; the app currently always names the major key.
   - Needs: a scale-play drill, a "name the key" multiple-choice drill, and the
     `flash` drill to accept a `key` (the renderer already supports `score.key`).
2. **More "not just drills" learning.** Minty said there's a lot she needs to
   learn beyond drills (theory, how things work). Ask her what topics; good
   candidates: scales, intervals, counting rhythm, reading both hands, hand
   position/fingering, chord progressions in J-pop.
3. **MIDI file import** with a MIDI → notation converter (quantise timing, find
   bars from tempo/time signature, split hands at middle C, spell sharps/flats
   from the key).
4. **Later shelf:** rhythm tap drill (low priority, she's good at rhythm), PDF
   import (would need OMR; an LLM could act as a checker), triplet drawing.

Minty mostly practises J-pop / anime / Vocaloid-style songs; her first song was
a lick from "Echo" by Higma (G major, has a pickup bar and ties). Don't commit
song files to the repo (copyright); she adds them on her devices.

## Checklist for every change

- [ ] Works at phone width with the on-screen keyboard, and on desktop
- [ ] Light and dark mode both look right (tokens only)
- [ ] No console errors; `node tools/test-core.mjs` passes
- [ ] Old saves still load; nothing in the save format broke
- [ ] Any scheduled audio (metronome) is stopped on restart/stop/close
- [ ] Copy is short, kind and plain
- [ ] `node tools/build.mjs` run so `sw.js` is fresh
- [ ] README.md updated if the feature is user-visible
- [ ] Tell Minty what changed in a few friendly lines, and what to try first

## Credits / licences

Salamander Grand Piano (Alexander Holm, CC BY 3.0), Bravura (Steinberg, SIL
OFL), Kiwi Maru and Zen Maru Gothic (SIL OFL). Details in `LICENSES.md`; keep
attributions in the Me → About section.
