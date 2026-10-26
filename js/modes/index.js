// Registry of drills. A session step { type: 'flash', ... } uses MODES.flash.

import { createName } from './name.js';
import { createFlash } from './flash.js';
import { createRush } from './rush.js';
import { createChords } from './chords.js';
import { createHigherLower } from './higherlower.js';
import { createFindNote } from './findnote.js';
import { createFreePlay } from './freeplay.js';
import { createCalibrate } from './calibrate.js';
import { createSong } from './song.js';

export const MODES = {
  name: createName,
  flash: createFlash,
  rush: createRush,
  chord: createChords,
  hl: createHigherLower,
  find: createFindNote,
  free: createFreePlay,
  calib: createCalibrate,
  song: createSong,
};
