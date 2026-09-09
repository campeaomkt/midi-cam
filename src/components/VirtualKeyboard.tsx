import React, { useMemo, useRef, useEffect } from 'react';
import { KeyboardTheme, KeyCount } from '../types';
import {
  getEffectiveActiveColor,
  hexToRgba,
  getDarkerShade,
  getLighterShade,
} from '../utils/keyboardColor';

interface VirtualKeyboardProps {
  activeNotes: number[]; // Array of active MIDI note numbers
  keyCount?: KeyCount;
  octaves?: 2 | 3 | 4; // backward compatibility
  startOctave?: number;
  octaveShift?: number; // Shift keyboard by +/- octaves (default 0)
  heightPreset?: 'slim' | 'normal' | 'compact'; // Height profile
  theme?: KeyboardTheme;
  customColor?: string; // Hex color for custom key animation
  glowIntensity?: number; // 0 to 100 percentage for key glow/brightness
  showNoteNames?: boolean;
  viewMode?: 'fit' | 'scroll';
  onKeyCountChange?: (count: KeyCount) => void;
  onViewModeToggle?: () => void;
  onNotePlay?: (midiNumber: number) => void;
  onNoteRelease?: (midiNumber: number) => void;
}

export function getKeyboardHeightClass(
  keyCount: KeyCount,
  viewMode: 'fit' | 'scroll' | string = 'fit',
  preset: 'slim' | 'normal' | 'compact' | string = 'normal'
): string {
  if (viewMode === 'scroll' && keyCount >= 61) {
    if (preset === 'slim') return 'h-[60px] sm:h-[68px] md:h-[84px] lg:h-[96px]';
    if (preset === 'compact') return 'h-[66px] sm:h-[74px] md:h-[92px] lg:h-[106px]';
    return 'h-[72px] sm:h-[82px] md:h-[102px] lg:h-[118px]';
  }

  // Exact proportions based on user's reference screenshot:
  // On phone: ~70px, on tablet: ~96px-116px where keys are well-proportioned, distinct vertical rectangles.
  if (keyCount >= 61) {
    if (preset === 'slim') return 'h-[58px] sm:h-[66px] md:h-[84px] lg:h-[96px]';
    if (preset === 'compact') return 'h-[64px] sm:h-[72px] md:h-[92px] lg:h-[106px]';
    return 'h-[70px] sm:h-[80px] md:h-[100px] lg:h-[116px]';
  }

  // 44 & 49 keys:
  if (keyCount >= 44) {
    if (preset === 'slim') return 'h-[60px] sm:h-[68px] md:h-[86px] lg:h-[98px]';
    if (preset === 'compact') return 'h-[66px] sm:h-[74px] md:h-[94px] lg:h-[108px]';
    return 'h-[72px] sm:h-[82px] md:h-[104px] lg:h-[120px]';
  }

  // 37 keys:
  if (keyCount >= 37) {
    if (preset === 'slim') return 'h-[62px] sm:h-[70px] md:h-[88px] lg:h-[100px]';
    if (preset === 'compact') return 'h-[68px] sm:h-[76px] md:h-[96px] lg:h-[110px]';
    return 'h-[74px] sm:h-[84px] md:h-[106px] lg:h-[122px]';
  }

  // 25 & 32 keys:
  if (preset === 'slim') return 'h-[64px] sm:h-[72px] md:h-[90px] lg:h-[104px]';
  if (preset === 'compact') return 'h-[70px] sm:h-[78px] md:h-[98px] lg:h-[114px]';
  return 'h-[76px] sm:h-[86px] md:h-[110px] lg:h-[126px]';
}

interface KeyData {
  midi: number;
  pitchClass: number;
  isBlack: boolean;
  name: string;
  octave: number;
  whiteIndex: number;
  blackPositionPercent?: number;
}

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_PITCHES = new Set([1, 3, 6, 8, 10]);

export interface KeyCountOption {
  count: KeyCount;
  label: string;
  desc: string;
  range: string;
  startNote: string;
  defaultStartMidi: number;
  notesStartOn: string;
}

export const KEY_COUNT_OPTIONS: KeyCountOption[] = [
  {
    count: 25,
    label: '25 teclas',
    desc: 'Mini Controller (Launchkey Mini / MPK Mini)',
    range: 'C3 - C5',
    startNote: 'C3',
    defaultStartMidi: 48,
    notesStartOn: 'Começa em Dó (C3)',
  },
  {
    count: 32,
    label: '32 teclas',
    desc: 'Micro Controller (NI Komplete M32 / SA-46)',
    range: 'F3 - C6',
    startNote: 'F3',
    defaultStartMidi: 53,
    notesStartOn: 'Começa em Fá (F3)',
  },
  {
    count: 37,
    label: '37 teclas',
    desc: 'Sintetizador Compacto (MicroKORG / Reface / KeyStep 37)',
    range: 'C3 - C6',
    startNote: 'C3',
    defaultStartMidi: 48,
    notesStartOn: 'Começa em Dó (C3)',
  },
  {
    count: 44,
    label: '44 teclas',
    desc: 'Mini Teclado (Casio SA-76 / SA Series)',
    range: 'F3 - C7',
    startNote: 'F3',
    defaultStartMidi: 53,
    notesStartOn: 'Começa em Fá (F3)',
  },
  {
    count: 49,
    label: '49 teclas',
    desc: '4 Oitavas (Padrão Home Studio)',
    range: 'C2 - C6',
    startNote: 'C2',
    defaultStartMidi: 36,
    notesStartOn: 'Começa em Dó (C2)',
  },
  {
    count: 61,
    label: '61 teclas',
    desc: '5 Oitavas (Padrão Arranjador / Synth)',
    range: 'C2 - C7',
    startNote: 'C2',
    defaultStartMidi: 36,
    notesStartOn: 'Começa em Dó (C2)',
  },
  {
    count: 64,
    label: '64 teclas',
    desc: 'Piano Elétrico Vintage (Wurlitzer 200A)',
    range: 'A1 - C7',
    startNote: 'A1',
    defaultStartMidi: 33,
    notesStartOn: 'Começa em Lá (A1)',
  },
  {
    count: 73,
    label: '73 teclas',
    desc: 'Stage Piano (Rhodes Stage 73 / Nord / SV-2)',
    range: 'E1 - E7',
    startNote: 'E1',
    defaultStartMidi: 28,
    notesStartOn: 'Começa em Mi (E1)',
  },
  {
    count: 76,
    label: '76 teclas',
    desc: 'Workstation (Yamaha Montage / Roland 76)',
    range: 'E1 - G7',
    startNote: 'E1',
    defaultStartMidi: 28,
    notesStartOn: 'Começa em Mi (E1)',
  },
  {
    count: 88,
    label: '88 teclas',
    desc: 'Piano Completo (Acústico / Digital Clavinova)',
    range: 'A0 - C8',
    startNote: 'A0',
    defaultStartMidi: 21,
    notesStartOn: 'Começa em Lá (A0)',
  },
];

export function getKeyRange(
  keyCount: KeyCount,
  octaveShift: number = 0
): { startMidi: number; totalKeys: number; startNote: string; range: string } {
  const opt = KEY_COUNT_OPTIONS.find((o) => o.count === keyCount) || KEY_COUNT_OPTIONS[1];
  const startMidi = Math.max(0, opt.defaultStartMidi + (octaveShift * 12));
  const endMidi = Math.min(127, startMidi + opt.count - 1);
  const startPitch = PITCH_NAMES[startMidi % 12];
  const startOct = Math.floor(startMidi / 12) - 1;
  const endPitch = PITCH_NAMES[endMidi % 12];
  const endOct = Math.floor(endMidi / 12) - 1;

  return {
    startMidi,
    totalKeys: opt.count,
    startNote: `${startPitch}${startOct}`,
    range: `${startPitch}${startOct} - ${endPitch}${endOct}`,
  };
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  activeNotes = [],
  keyCount,
  octaves = 3,
  startOctave = 3,
  octaveShift = 0,
  heightPreset = 'normal',
  theme = 'cyan',
  customColor,
  glowIntensity = 80,
  showNoteNames = false,
  viewMode = 'fit',
  onKeyCountChange,
  onViewModeToggle,
  onNotePlay,
  onNoteRelease,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchActiveNotes = useRef<Set<number>>(new Set());

  // Determine effective key count
  const effectiveKeyCount: KeyCount = keyCount || (octaves === 2 ? 25 : octaves === 4 ? 49 : 37);

  // Dynamic color calculations for keys and glow
  const effectiveColor = useMemo(
    () => getEffectiveActiveColor(theme, customColor),
    [theme, customColor]
  );
  const darkerColor = useMemo(() => getDarkerShade(effectiveColor, 22), [effectiveColor]);
  const lighterColor = useMemo(() => getLighterShade(effectiveColor, 18), [effectiveColor]);
  const deepDarkColor = useMemo(() => getDarkerShade(effectiveColor, 38), [effectiveColor]);

  // Dynamic glow / shadow calculation based on percentage (0 - 100%)
  const { boxShadowStr } = useMemo(() => {
    const clampedGlow = Math.max(0, Math.min(100, glowIntensity));
    if (clampedGlow <= 0) {
      return { boxShadowStr: 'none' };
    }
    const glowAlpha = Math.min(1, (clampedGlow / 100) * 0.95);
    const glowRadius = Math.round((clampedGlow / 100) * 20);
    const glowSpread = clampedGlow > 60 ? Math.round(((clampedGlow - 60) / 40) * 4) : 0;
    const glowRgba = hexToRgba(effectiveColor, glowAlpha);
    return {
      boxShadowStr: `0 0 ${glowRadius}px ${glowSpread}px ${glowRgba}`,
    };
  }, [effectiveColor, glowIntensity]);

  const activeWhiteStyle: React.CSSProperties = useMemo(
    () => ({
      background: `linear-gradient(to top, ${darkerColor}, ${effectiveColor}, ${lighterColor})`,
      boxShadow: boxShadowStr,
    }),
    [darkerColor, effectiveColor, lighterColor, boxShadowStr]
  );

  const activeBlackStyle: React.CSSProperties = useMemo(
    () => ({
      background: `linear-gradient(to top, ${deepDarkColor}, ${darkerColor})`,
      boxShadow: boxShadowStr,
    }),
    [deepDarkColor, darkerColor, boxShadowStr]
  );

  const activeSet = useMemo(() => new Set(activeNotes), [activeNotes]);

  // Compute key layout mathematically:
  // In every octave:
  // - 2 first black keys (C#, D#) are precisely in the middle between the 3 first white keys (C, D, E)
  // - 3 last black keys (F#, G#, A#) are precisely in the middle between the 4 last white keys (F, G, A, B)
  // - Between E and F: half-step, NO black key!
  // - Between B and next C: half-step, NO black key!
  const { whiteKeys, blackKeys, totalWhiteKeys } = useMemo(() => {
    const { startMidi, totalKeys } = getKeyRange(effectiveKeyCount, octaveShift);
    const whites: KeyData[] = [];
    const blacks: { midi: number; pitchClass: number; name: string; octave: number; seamIndex: number }[] = [];

    for (let i = 0; i < totalKeys; i++) {
      const midi = startMidi + i;
      const pitchClass = midi % 12;
      const isBlack = BLACK_PITCHES.has(pitchClass);
      const name = PITCH_NAMES[pitchClass];
      const oct = Math.floor(midi / 12) - 1;

      if (!isBlack) {
        whites.push({
          midi,
          pitchClass,
          isBlack: false,
          name,
          octave: oct,
          whiteIndex: whites.length,
        });
      } else {
        // At the moment of adding a black key, whites.length is the seam index
        // dividing the white key immediately to the left and the white key to the right!
        // E.g. after C (whites.length=1), C# sits at seam index 1 (between C and D).
        // After D (whites.length=2), D# sits at seam index 2 (between D and E).
        // (E is added: whites.length=3, F is added: whites.length=4; no black key between E and F).
        // After F (whites.length=4), F# sits at seam index 4 (between F and G).
        // After G (whites.length=5), G# sits at seam index 5 (between G and A).
        // After A (whites.length=6), A# sits at seam index 6 (between A and B).
        blacks.push({
          midi,
          pitchClass,
          name,
          octave: oct,
          seamIndex: whites.length,
        });
      }
    }

    const totalWhites = whites.length;

    // Calculate position percent for each black key centered right on the seam
    const calculatedBlacks: KeyData[] = blacks.map((b) => {
      const leftPercent = (b.seamIndex / totalWhites) * 100;
      return {
        midi: b.midi,
        pitchClass: b.pitchClass,
        isBlack: true,
        name: b.name,
        octave: b.octave,
        whiteIndex: b.seamIndex,
        blackPositionPercent: leftPercent,
      };
    });

    return {
      whiteKeys: whites,
      blackKeys: calculatedBlacks,
      totalWhiteKeys: totalWhites,
    };
  }, [effectiveKeyCount, octaveShift]);

  // Touch & Mouse event handlers
  const handleTouchStart = (midi: number) => {
    touchActiveNotes.current.add(midi);
    onNotePlay?.(midi);
  };

  const handleTouchEnd = (midi: number) => {
    touchActiveNotes.current.delete(midi);
    onNoteRelease?.(midi);
  };

  // Black key width is exactly 60% of a white key width
  const blackWidthPercent = (1 / totalWhiteKeys) * 60;

  const heightClass = getKeyboardHeightClass(effectiveKeyCount, viewMode, heightPreset);
  const noteLabelSize = effectiveKeyCount >= 61 
    ? 'text-[6.5px] sm:text-[7.5px] md:text-[9.5px] lg:text-[10.5px]' 
    : effectiveKeyCount >= 44 
    ? 'text-[7.5px] sm:text-[8.5px] md:text-[10.5px]' 
    : 'text-[8.5px] sm:text-[10px] md:text-xs';
  const blackNoteLabelSize = effectiveKeyCount >= 61 
    ? 'text-[5.5px] sm:text-[6.5px] md:text-[8.5px]' 
    : 'text-[7px] sm:text-[8px] md:text-[9.5px]';

  return (
    <div
      id="virtual-piano-keyboard"
      data-active-color={effectiveColor}
      data-active-dark-color={darkerColor}
      data-glow-intensity={glowIntensity}
      className="relative w-[95%] sm:w-[92%] md:w-[94%] max-w-5xl mx-auto flex flex-col select-none touch-none"
    >
      {/* Main Piano Keyboard with static layout, crisp straight edges and zero touch shifting */}
      <div
        ref={scrollContainerRef}
        className={`relative w-full ${heightClass} rounded-none overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.45),0_2px_6px_rgba(0,0,0,0.25)] bg-white border border-neutral-300 touch-none select-none`}
      >
        <div className="relative h-full w-full flex touch-none">
          {/* White Keys */}
          <div className="relative w-full h-full flex touch-none">
            {whiteKeys.map((key) => {
              const isActive = activeSet.has(key.midi);
              return (
                <button
                  key={key.midi}
                  id={`piano-key-white-${key.midi}`}
                  type="button"
                  tabIndex={-1}
                  style={isActive ? activeWhiteStyle : undefined}
                  className={`relative flex-1 h-full rounded-none border-r last:border-r-0 border-neutral-300 transition-colors duration-75 flex flex-col justify-end items-center pb-0.5 sm:pb-1 cursor-pointer select-none touch-none outline-none ${
                    isActive
                      ? 'z-10 shadow-inner'
                      : 'bg-white hover:bg-neutral-50 active:bg-neutral-100'
                  }`}
                  onMouseDown={() => handleTouchStart(key.midi)}
                  onMouseUp={() => handleTouchEnd(key.midi)}
                  onMouseLeave={() => {
                    if (touchActiveNotes.current.has(key.midi)) {
                      handleTouchEnd(key.midi);
                    }
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    handleTouchStart(key.midi);
                  }}
                  onTouchMove={(e) => {
                    e.preventDefault();
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    handleTouchEnd(key.midi);
                  }}
                  onTouchCancel={(e) => {
                    e.preventDefault();
                    handleTouchEnd(key.midi);
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {/* Subtle top edge gloss line */}
                  <div className="absolute top-0 inset-x-0 h-0.5 bg-neutral-200/50 pointer-events-none" />

                  {/* Optional Note Name Label */}
                  {showNoteNames && (
                    <span
                      className={`${noteLabelSize} font-bold tracking-tight pointer-events-none select-none ${
                        isActive ? 'text-neutral-900' : 'text-zinc-500'
                      }`}
                    >
                      {key.pitchClass === 0 || key.whiteIndex === 0
                        ? `${key.name}${key.octave}`
                        : key.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Black Keys: positioned exactly at the seam dividing the adjacent white keys */}
          {blackKeys.map((key) => {
            const isActive = activeSet.has(key.midi);

            return (
              <button
                key={key.midi}
                id={`piano-key-black-${key.midi}`}
                type="button"
                tabIndex={-1}
                style={{
                  left: `${key.blackPositionPercent}%`,
                  width: `${blackWidthPercent}%`,
                  ...(isActive ? activeBlackStyle : {}),
                }}
                className={`absolute top-0 h-[62%] -translate-x-1/2 rounded-none transition-colors duration-75 z-20 flex flex-col justify-end items-center pb-0.5 sm:pb-1 cursor-pointer select-none touch-none outline-none ${
                  isActive
                    ? 'shadow-inner'
                    : 'bg-[#18181b] shadow-[0_1px_3px_rgba(0,0,0,0.5)] hover:bg-[#27272a]'
                }`}
                onMouseDown={() => handleTouchStart(key.midi)}
                onMouseUp={() => handleTouchEnd(key.midi)}
                onMouseLeave={() => {
                  if (touchActiveNotes.current.has(key.midi)) {
                    handleTouchEnd(key.midi);
                  }
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleTouchStart(key.midi);
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleTouchEnd(key.midi);
                }}
                onTouchCancel={(e) => {
                  e.preventDefault();
                  handleTouchEnd(key.midi);
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                {/* 3D top sheen */}
                <div className="absolute inset-x-0.5 top-0 h-[82%] bg-white/[0.06] rounded-none pointer-events-none" />

                {showNoteNames && (
                  <span
                    className={`${blackNoteLabelSize} font-semibold pointer-events-none select-none ${
                      isActive ? 'text-neutral-950' : 'text-zinc-400'
                    }`}
                  >
                    {key.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
