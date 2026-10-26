# Petal Keys

Gentle piano lessons for your USB MIDI keyboard, or the keys on screen.
Read music, build chords and train your ears, one short lesson at a time.

- **Learn**: 28 Duolingo-style lessons in 8 units (keyboard map, treble clef,
  Note Rush, bass clef, chords, ear training, sharps & flats, seventh chords).
  Each lesson has a few teaching cards and one drill.
- **Practice**: only things you have already learned, for tired evenings.
  Mix for me, Read notes, Note Rush, Chord Builder, Find the note,
  Higher or lower, Find the key and Free play.
- **Note Rush**: look at a short line for as long as you like, tap Go, hear
  four clicks, then play along with the moving line. You get a score for the
  right notes and a separate score for timing (Perfect / Great / Good).
- **Find the note**: hear C, then a mystery note. Press keys freely to search,
  then submit the one that sounds right.
- **Songs**: add a MusicXML file and learn it a few bars at a time.
  **Wait** mode waits on each note until you play it (with key hints);
  **Play along** gives a count-in and scores notes and timing. Choose a part
  (about 4 bars), the hand (for two-staff piano music) and the tempo.
  Note Rush can also take its lines from your songs ("Lines from: My songs").
- **Instruments**: grand piano, electric piano, music box, marimba, organ,
  soft synth or dreamy pad (Me → Settings, or the picker in Free play).
- **Progress** saves by itself, with a streak that forgives one rest day a week.
  A tiny backup file (a few hundred characters) moves it between devices.

## Put it online (needed for the keyboard, install and offline use)

Web MIDI, installing the app and offline mode only work on a secure (https)
address, so host the folder somewhere free:

**GitHub Pages**

1. Create a new public repository on GitHub, for example `petal-keys`.
2. Upload everything in this folder (drag and drop on the GitHub website works).
3. Open **Settings → Pages**, choose **Deploy from a branch**, pick `main` and
   `/ (root)`, then **Save**.
4. After a minute the app is at `https://<your-username>.github.io/petal-keys/`.

**Or Netlify Drop**: drag the whole folder onto <https://app.netlify.com/drop>.

## On your phone (Android)

1. Open the link in **Chrome**.
2. Menu (⋮) → **Install app** (or **Add to Home screen**). Petal Keys gets its
   own icon and opens full screen.
3. Open it once with sound on while online; after that it works offline too,
   handy on the train.

To use the real keyboard with the phone, connect it with a USB-C (OTG)
adapter, tap the **Keys** chip at the top, then **Connect**. Chrome supports
MIDI on Android; Firefox for Android does not, but the on-screen keys work in
any browser.

## On your computer

Firefox and Chrome both work. Plug in the keyboard, tap **Keys → Connect**.
The first time, Firefox asks you to add a small "site permission" add-on;
that is expected. For a taskbar icon, use Firefox's **Add to taskbar** (on
Windows) or Chrome's **Install** button in the address bar.

No keyboard nearby? The computer keys `A W S E D F T G Y H U J K` play notes,
and `Z` / `X` change the octave.

## Backups and moving between devices

- Progress is saved automatically after every exercise.
- **Me → Send backup** opens the phone's share menu, so you can pick
  **LocalSend** straight away. (On a computer it downloads a `.txt` file.)
- On the other device: **Me → Import → Choose save file**.
- Importing *merges*: progress from both devices adds up, nothing is erased,
  and importing the same file twice never counts anything twice.
- **Save code** gives the same backup as text you can copy and paste.
- The app reminds you gently if your last backup is more than a week old.

## Adding songs

1. Get a MusicXML file: `.musicxml`, `.xml` or compressed `.mxl`
   (MuseScore: File → Export → MusicXML).
2. On the phone, send it with LocalSend, then in Petal Keys go to
   **Practice → Songs → Add song** and pick it from Downloads.
3. Tap the song. Pick a part, a hand and Wait or Play along.

Songs are stored on the device you added them on. They are not part of the
backup file (to keep it tiny), so add the file on each device; your best
scores for songs do travel with backups.

Supported: treble and bass staves (up to two), key signatures, ties, dotted
notes, eighths and sixteenths, chords, pickup bars. Grace notes are skipped.
Triplets play correctly but are drawn with plain note shapes.

## Small keyboards (25 keys)

**Any octave counts** is on by default, so the right note in another octave is
fine. The on-screen keyboard also has octave buttons (‹ ›) like a real
controller. Drum pads on MIDI channel 10 are ignored by default.

## Timing check

Bluetooth earbuds add delay. **Me → Settings → Timing check** plays clicks for
you to tap along with (like rhythm-game calibration), then Note Rush adjusts
its timing to your setup.

## For tinkering

Plain HTML, CSS and JavaScript modules, no build step needed.

```
index.html            app page
css/app.css           all styles (colour tokens at the top, light + dark)
css/fonts.css         embedded fonts (UI fonts + music symbols)
js/main.js            start-up, tabs, input wiring
js/lessons.js         the lesson path (edit or add lessons here)
js/core/              music theory, sound, MIDI, on-screen keyboard,
                      sheet-music renderer, save files, Note Rush scoring,
                      MusicXML reader (musicxml.js) and song library (songs.js)
js/modes/             one file per drill
js/ui/                Learn, Practice and Me pages, sessions, sheets
assets/piano/         piano samples
tools/                tests and the build helper
```

- Run it locally: `python3 -m http.server` in this folder, then open
  <http://localhost:8000>. MIDI works on localhost too.
- Tests for the music theory, saves, streaks and scoring: `node tools/test-core.mjs`
- After changing any file, run `node tools/build.mjs`. It refreshes `sw.js`
  (the offline file list and its version) so phones pick up the change.
- `window.__petalKeys` in the browser console gives access to the app object.

## Ideas for later

From the plan: MIDI import (with a MIDI → MusicXML style converter that
snaps timing and finds the bars), rhythm practice, little theory cards, and
PDF import.

## Credits

- Piano sound: Salamander Grand Piano by Alexander Holm, CC BY 3.0
  (samples trimmed to keep the app small).
- Music symbols: Bravura by Steinberg Media Technologies, SIL Open Font License 1.1 (subset).
- Fonts: Kiwi Maru and Zen Maru Gothic, SIL Open Font License 1.1.

See `LICENSES.md` for details.
