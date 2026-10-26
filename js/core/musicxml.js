// Reads MusicXML (.musicxml / .xml, and compressed .mxl) into a small song
// object Petal Keys can draw and check against.
//
// song = {
//   title, key (fifths), time: [beats, beatType], tempo (quarter notes / min),
//   staves: ['treble', 'bass'],             // one clef per staff
//   measures: [{ label, start, beats }],    // start/beats in quarter notes
//   notes: [{ si, beat, dur, midi, letter, acc, octave, tieStart, tieStop }],
// }
// `beat` is the absolute position in quarter notes from the start of the song.

import { LETTER_PC, spell } from './music.js';

const CLEF_OF = { G: 'treble', F: 'bass' };

export async function readSongFile(file) {
  const name = (file.name || '').toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());
  let text;
  if (name.endsWith('.mxl') || (buf[0] === 0x50 && buf[1] === 0x4b)) {
    text = await unzipMusicXml(buf);
  } else {
    text = new TextDecoder().decode(buf);
  }
  return parseMusicXml(text, file.name);
}

export function parseMusicXml(text, fileName = '') {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error("That file isn't readable MusicXML. Try exporting it again as MusicXML.");
  }
  const root = doc.documentElement;
  if (root.nodeName === 'score-timewise') {
    throw new Error('This MusicXML is in "timewise" format. Export it again as normal (partwise) MusicXML.');
  }
  if (root.nodeName !== 'score-partwise') throw new Error("That doesn't look like a MusicXML score.");

  const kid = (el, tag) => {
    if (!el) return null;
    for (const c of el.children) if (c.nodeName === tag) return c;
    return null;
  };
  const kids = (el, tag) => (el ? [...el.children].filter((c) => c.nodeName === tag) : []);
  const txt = (el, tag) => {
    const c = kid(el, tag);
    return c ? c.textContent.trim() : null;
  };

  const title =
    txt(kid(root, 'work'), 'work-title') ||
    txt(root, 'movement-title') ||
    (kid(root, 'credit') && kid(kid(root, 'credit'), 'credit-words')?.textContent.trim()) ||
    fileName.replace(/\.(musicxml|xml|mxl)$/i, '') ||
    'Untitled song';

  // Pick the part with the most notes (usually the piano).
  const parts = kids(root, 'part');
  if (!parts.length) throw new Error('This score has no parts.');
  let part = parts[0];
  let best = -1;
  for (const p of parts) {
    const n = p.getElementsByTagName('pitch').length;
    if (n > best) {
      best = n;
      part = p;
    }
  }

  let divisions = 1;
  let key = null;
  let time = null;
  let tempo = null;
  let stavesCount = 1;
  const clefs = ['treble', 'bass'];
  const clefSet = [false, false];
  const measures = [];
  const notes = [];
  let songPos = 0; // in quarter notes

  for (const m of kids(part, 'measure')) {
    let cursor = 0; // in divisions, inside this measure
    let maxCursor = 0;
    let lastOnset = 0;
    for (const el of m.children) {
      switch (el.nodeName) {
        case 'attributes': {
          const d = txt(el, 'divisions');
          if (d) divisions = Math.max(1, Number(d));
          const k = kid(el, 'key');
          if (k && key === null && txt(k, 'fifths') != null) key = Number(txt(k, 'fifths')) || 0;
          const t = kid(el, 'time');
          if (t && !time && txt(t, 'beats')) {
            const beats = Number(String(txt(t, 'beats')).split('+').reduce((a, b) => a + Number(b), 0));
            time = [beats || 4, Number(txt(t, 'beat-type')) || 4];
          }
          const st = txt(el, 'staves');
          if (st) stavesCount = Math.max(1, Math.min(2, Number(st)));
          for (const c of kids(el, 'clef')) {
            const idx = Math.min(1, Math.max(0, Number(c.getAttribute('number') || 1) - 1));
            const sign = txt(c, 'sign');
            if (!clefSet[idx] && CLEF_OF[sign]) {
              clefs[idx] = CLEF_OF[sign];
              clefSet[idx] = true;
            }
          }
          break;
        }
        case 'direction':
        case 'sound': {
          const snd = el.nodeName === 'sound' ? el : kid(el, 'sound');
          if (snd && snd.getAttribute('tempo') && tempo === null) tempo = Number(snd.getAttribute('tempo'));
          if (el.nodeName === 'direction' && tempo === null) {
            const met = el.getElementsByTagName('metronome')[0];
            if (met && txt(met, 'per-minute')) {
              const unit = txt(met, 'beat-unit');
              const mult = { half: 2, quarter: 1, eighth: 0.5 }[unit] || 1;
              tempo = Number(txt(met, 'per-minute')) * mult * (kid(met, 'beat-unit-dot') ? 1.5 : 1);
            }
          }
          break;
        }
        case 'backup':
          cursor = Math.max(0, cursor - Number(txt(el, 'duration') || 0));
          break;
        case 'forward':
          cursor += Number(txt(el, 'duration') || 0);
          maxCursor = Math.max(maxCursor, cursor);
          break;
        case 'note': {
          if (kid(el, 'grace') || kid(el, 'cue')) break;
          const dur = Number(txt(el, 'duration') || 0);
          const isChord = !!kid(el, 'chord');
          const onset = isChord ? lastOnset : cursor;
          if (!isChord) {
            lastOnset = cursor;
            cursor += dur;
            maxCursor = Math.max(maxCursor, cursor);
          }
          const pitch = kid(el, 'pitch');
          if (!pitch) break; // rest or unpitched
          const step = txt(pitch, 'step');
          const alter = Math.round(Number(txt(pitch, 'alter') || 0));
          const octave = Number(txt(pitch, 'octave'));
          if (!(step in LETTER_PC) || !Number.isFinite(octave)) break;
          const midi = (octave + 1) * 12 + LETTER_PC[step] + alter;
          let spelled = { letter: step, acc: alter, octave };
          if (Math.abs(alter) > 1) spelled = spell(midi, alter < 0 ? 'flat' : 'sharp');
          const ties = kids(el, 'tie').map((t) => t.getAttribute('type'));
          const staffNo = Number(txt(el, 'staff') || 1);
          notes.push({
            si: Math.min(stavesCount, staffNo) - 1,
            beat: round(songPos + onset / divisions),
            dur: round(dur / divisions),
            midi,
            letter: spelled.letter,
            acc: spelled.acc,
            octave: spelled.octave,
            tieStart: ties.includes('start') || undefined,
            tieStop: ties.includes('stop') || undefined,
          });
          break;
        }
        default:
          break;
      }
    }
    const nominal = time ? time[0] * (4 / time[1]) : 4;
    const implicit = m.getAttribute('implicit') === 'yes';
    let beats = round(maxCursor / divisions);
    if (!implicit || beats <= 0) beats = Math.max(beats, nominal);
    if (beats <= 0) beats = nominal;
    measures.push({ label: m.getAttribute('number') || String(measures.length + 1), start: round(songPos), beats });
    songPos += beats;
  }

  if (!notes.length) throw new Error('No notes found in this score.');
  const staves = clefs.slice(0, Math.max(1, stavesCount));
  return {
    title: title.slice(0, 80),
    key: key || 0,
    time: time || [4, 4],
    tempo: tempo && tempo > 20 && tempo < 300 ? Math.round(tempo) : null,
    staves,
    measures,
    notes,
  };
}

const round = (x) => Math.round(x * 10000) / 10000;

// ---------- .mxl (zip) ----------

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error("This browser can't open .mxl files. Export as .musicxml instead.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipMusicXml(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // find end of central directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("That .mxl file looks damaged.");
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const entries = {};
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const local = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nameLen));
    entries[name] = { method, csize, local };
    off += 46 + nameLen + extraLen + commentLen;
  }
  const read = async (name) => {
    const e = entries[name];
    if (!e) return null;
    const lnl = dv.getUint16(e.local + 26, true);
    const lel = dv.getUint16(e.local + 28, true);
    const start = e.local + 30 + lnl + lel;
    const data = buf.subarray(start, start + e.csize);
    const out = e.method === 0 ? data : await inflateRaw(data);
    return new TextDecoder().decode(out);
  };
  let rootPath = null;
  const container = await read('META-INF/container.xml');
  if (container) {
    const m = /full-path="([^"]+)"/.exec(container);
    if (m) rootPath = m[1];
  }
  if (!rootPath) rootPath = Object.keys(entries).find((n) => /\.(xml|musicxml)$/i.test(n) && !n.startsWith('META-INF'));
  const xml = rootPath && (await read(rootPath));
  if (!xml) throw new Error("Couldn't find the score inside that .mxl file.");
  return xml;
}
