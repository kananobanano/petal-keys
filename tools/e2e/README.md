# Browser tests (Playwright for Python)

Example scripts used while building Petal Keys. They are not a polished test
suite; read and adjust before running.

```bash
pip install playwright && playwright install chromium
python3 -m http.server 8765      # from the app folder, in another terminal
python3 tools/e2e/e2e_behaviour.py /tmp/petal-e2e
```

- They control the app through `window.__petalKeys` and fake MIDI with
  `app.bus.noteOn(midi, velocity, performance.now(), 'midi')`.
- `song_test.py` and `fix_test.py` need a MusicXML file at `/tmp/song.musicxml`.
- Screenshots go to the folder given on the command line (or `/tmp/...`).
