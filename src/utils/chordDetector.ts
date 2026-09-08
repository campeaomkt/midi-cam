import { DetectedChord } from '../types';

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function midiToNoteName(midiNumber: number, useFlats = false): string {
  const noteIndex = midiNumber % 12;
  const octave = Math.floor(midiNumber / 12) - 1;
  const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  return `${names[noteIndex]}${octave}`;
}

export function midiToPitchClass(midiNumber: number): number {
  return midiNumber % 12;
}

// Chord formulas represented as sorted relative semitone intervals from root
interface ChordTemplate {
  quality: string;
  nameSuffix: string;
  intervals: number[];      // Exact or essential intervals
  optional?: number[];     // e.g. 5th is often omitted in jazz/piano chords
  weight: number;          // Priority score
}

const CHORD_TEMPLATES: ChordTemplate[] = [
  // Suspended & Extended Sus (Checked early for exact matching e.g. A9sus4)
  { quality: '9sus4', nameSuffix: '9sus4', intervals: [0, 2, 5, 7, 10], optional: [7], weight: 98 },
  { quality: '9sus4', nameSuffix: '9sus4', intervals: [0, 2, 5, 10], weight: 97 }, // without 5th
  { quality: 'sus4(add9)', nameSuffix: 'sus4(add9)', intervals: [0, 2, 5, 7], weight: 92 },
  { quality: '7sus4', nameSuffix: '7sus4', intervals: [0, 5, 7, 10], optional: [7], weight: 95 },
  { quality: '7sus2', nameSuffix: '7sus2', intervals: [0, 2, 7, 10], optional: [7], weight: 94 },
  { quality: 'sus4', nameSuffix: 'sus4', intervals: [0, 5, 7], weight: 88 },
  { quality: 'sus2', nameSuffix: 'sus2', intervals: [0, 2, 7], weight: 88 },

  // Major extended & 7ths
  { quality: 'maj9', nameSuffix: 'maj9', intervals: [0, 4, 7, 11, 2], optional: [7], weight: 96 },
  { quality: 'maj7(#11)', nameSuffix: 'maj7(#11)', intervals: [0, 4, 6, 7, 11], optional: [7], weight: 95 },
  { quality: 'maj7', nameSuffix: 'maj7', intervals: [0, 4, 7, 11], optional: [7], weight: 92 },
  { quality: 'add9', nameSuffix: 'add9', intervals: [0, 2, 4, 7], optional: [7], weight: 90 },
  { quality: '6/9', nameSuffix: '6/9', intervals: [0, 2, 4, 7, 9], optional: [7], weight: 93 },
  { quality: '6', nameSuffix: '6', intervals: [0, 4, 7, 9], weight: 86 },

  // Dominant 7ths & altered
  { quality: '13', nameSuffix: '13', intervals: [0, 4, 7, 10, 2, 9], optional: [7, 2], weight: 96 },
  { quality: '9', nameSuffix: '9', intervals: [0, 4, 7, 10, 2], optional: [7], weight: 94 },
  { quality: '7(b9)', nameSuffix: '7(b9)', intervals: [0, 4, 7, 10, 1], optional: [7], weight: 95 },
  { quality: '7(#9)', nameSuffix: '7(#9)', intervals: [0, 4, 7, 10, 3], optional: [7], weight: 95 },
  { quality: '7(#11)', nameSuffix: '7(#11)', intervals: [0, 4, 6, 10], weight: 94 },
  { quality: '7(b13)', nameSuffix: '7(b13)', intervals: [0, 4, 8, 10], weight: 93 },
  { quality: '7(alt)', nameSuffix: '7alt', intervals: [0, 4, 6, 8, 10], weight: 92 },
  { quality: '7#5', nameSuffix: '7(#5)', intervals: [0, 4, 8, 10], weight: 91 },
  { quality: '7b5', nameSuffix: '7(b5)', intervals: [0, 4, 6, 10], weight: 91 },
  { quality: '7', nameSuffix: '7', intervals: [0, 4, 7, 10], optional: [7], weight: 90 },

  // Minor extended & 7ths
  { quality: 'm11', nameSuffix: 'm11', intervals: [0, 3, 5, 7, 10, 2], optional: [7, 2], weight: 96 },
  { quality: 'm9', nameSuffix: 'm9', intervals: [0, 3, 7, 10, 2], optional: [7], weight: 95 },
  { quality: 'm(maj7)', nameSuffix: 'm(maj7)', intervals: [0, 3, 7, 11], optional: [7], weight: 92 },
  { quality: 'm7b5', nameSuffix: 'm7(b5)', intervals: [0, 3, 6, 10], weight: 93 },
  { quality: 'm7', nameSuffix: 'm7', intervals: [0, 3, 7, 10], optional: [7], weight: 91 },
  { quality: 'm(add9)', nameSuffix: 'm(add9)', intervals: [0, 2, 3, 7], optional: [7], weight: 89 },
  { quality: 'm6', nameSuffix: 'm6', intervals: [0, 3, 7, 9], weight: 87 },

  // Diminished & Augmented
  { quality: 'dim7', nameSuffix: 'dim7', intervals: [0, 3, 6, 9], weight: 91 },
  { quality: 'dim', nameSuffix: 'dim', intervals: [0, 3, 6], weight: 85 },
  { quality: 'aug', nameSuffix: 'aug', intervals: [0, 4, 8], weight: 85 },

  // Basic Triads
  { quality: '', nameSuffix: '', intervals: [0, 4, 7], weight: 80 }, // Major
  { quality: 'm', nameSuffix: 'm', intervals: [0, 3, 7], weight: 80 }, // Minor

  // Power chord
  { quality: '5', nameSuffix: '5', intervals: [0, 7], weight: 70 },
];

export function detectChord(activeMidiNotes: number[], preferFlats = false): DetectedChord | null {
  if (!activeMidiNotes || activeMidiNotes.length === 0) {
    return null;
  }

  // Sort unique notes ascending
  const sortedNotes = Array.from(new Set(activeMidiNotes)).sort((a, b) => a - b);
  const pitchClasses = Array.from(new Set(sortedNotes.map(n => n % 12))).sort((a, b) => a - b);
  const lowestMidi = sortedNotes[0];
  const lowestPitch = lowestMidi % 12;

  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;

  // Single note
  if (sortedNotes.length === 1) {
    const noteName = names[lowestPitch];
    return {
      name: noteName,
      root: noteName,
      quality: 'Single Note',
      notes: [noteName],
      midiNotes: sortedNotes,
      confidence: 1,
      isKnown: true
    };
  }

  // Two notes (Interval / Dyad)
  if (pitchClasses.length === 2) {
    const diff = (pitchClasses[1] - pitchClasses[0] + 12) % 12;
    const rootName = names[pitchClasses[0]];
    const otherName = names[pitchClasses[1]];

    const intervalNames: Record<number, string> = {
      1: 'm2',
      2: 'M2',
      3: 'm3 (Menor)',
      4: 'M3 (Maior)',
      5: '4ª Justa',
      6: 'Trítono',
      7: '5 (Power Chord)',
      8: 'm6',
      9: 'M6',
      10: '7 (Sétima)',
      11: 'maj7'
    };

    const intervalLabel = intervalNames[diff] || '';
    const chordName = diff === 7 ? `${rootName}5` : `${rootName} + ${otherName}`;

    return {
      name: chordName,
      root: rootName,
      quality: intervalLabel,
      notes: [rootName, otherName],
      midiNotes: sortedNotes,
      confidence: 0.85,
      isKnown: true
    };
  }

  // Search best matching chord template across all candidate roots in the played pitches
  let bestMatch: {
    rootPitch: number;
    template: ChordTemplate;
    score: number;
    missingCount: number;
    extraCount: number;
  } | null = null;

  // We test all 12 pitches as potential roots, prioritizing pitches that are actually in the chord
  for (const candidateRoot of pitchClasses) {
    // Calculate semitone offsets from this candidate root for all played pitches
    const playedIntervals = pitchClasses.map(p => (p - candidateRoot + 12) % 12).sort((a, b) => a - b);
    const playedSet = new Set(playedIntervals);

    for (const template of CHORD_TEMPLATES) {
      const templateSet = new Set(template.intervals);
      const optionalSet = new Set(template.optional || []);

      // Check how many required intervals are missing
      let missingRequired = 0;
      for (const requiredInterval of template.intervals) {
        if (!playedSet.has(requiredInterval)) {
          if (optionalSet.has(requiredInterval)) {
            // Optional missing is penalized slightly
            missingRequired += 0.4;
          } else {
            missingRequired += 1.5;
          }
        }
      }

      // Check how many played intervals are not in template
      let extraIntervals = 0;
      for (const played of playedIntervals) {
        if (!templateSet.has(played) && !optionalSet.has(played)) {
          extraIntervals += 1.2;
        }
      }

      // Perfect match condition
      const isExactMatch = missingRequired === 0 && extraIntervals === 0;
      const score = (template.weight) - (missingRequired * 20) - (extraIntervals * 15) + (candidateRoot === lowestPitch ? 4 : 0);

      if (isExactMatch || (missingRequired < 1 && extraIntervals < 1.5)) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            rootPitch: candidateRoot,
            template,
            score,
            missingCount: missingRequired,
            extraCount: extraIntervals,
          };
        }
      }
    }
  }

  const noteNamesList = sortedNotes.map(n => names[n % 12]);
  const uniqueNoteNames = Array.from(new Set(noteNamesList));

  if (bestMatch && bestMatch.score > 40) {
    const rootName = names[bestMatch.rootPitch];
    const bassName = names[lowestPitch];
    let chordName = `${rootName}${bestMatch.template.nameSuffix}`;

    // Check for inversion / slash chord
    let bassResult: string | undefined = undefined;
    if (lowestPitch !== bestMatch.rootPitch) {
      chordName = `${chordName}/${bassName}`;
      bassResult = bassName;
    }

    return {
      name: chordName,
      root: rootName,
      quality: bestMatch.template.quality,
      bass: bassResult,
      notes: uniqueNoteNames,
      midiNotes: sortedNotes,
      confidence: Math.min(1, Math.max(0.5, bestMatch.score / 100)),
      isKnown: true
    };
  }

  // Fallback: Group of notes
  const bassName = names[lowestPitch];
  const chordName = uniqueNoteNames.join(' · ');

  return {
    name: chordName,
    root: bassName,
    quality: 'Cluster',
    notes: uniqueNoteNames,
    midiNotes: sortedNotes,
    confidence: 0.5,
    isKnown: false
  };
}
