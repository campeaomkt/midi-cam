import React, { useMemo, useRef, useState, useEffect } from 'react';
import { KeyboardTheme, KeyCount, KeyboardVisualModel } from '../types';
import {
  getEffectiveActiveColor,
  hexToRgba,
  getDarkerShade,
  getLighterShade,
} from '../utils/keyboardColor';

interface VirtualKeyboardProps {
  visualModel?: KeyboardVisualModel;
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
    if (preset === 'slim') return 'h-[64px] sm:h-[72px] md:h-[88px] lg:h-[102px]';
    if (preset === 'compact') return 'h-[70px] sm:h-[80px] md:h-[98px] lg:h-[114px]';
    return 'h-[78px] sm:h-[90px] md:h-[110px] lg:h-[128px]';
  }

  if (keyCount >= 61) {
    if (preset === 'slim') return 'h-[62px] sm:h-[70px] md:h-[88px] lg:h-[102px]';
    if (preset === 'compact') return 'h-[68px] sm:h-[78px] md:h-[98px] lg:h-[114px]';
    return 'h-[76px] sm:h-[88px] md:h-[108px] lg:h-[126px]';
  }

  if (keyCount >= 44) {
    if (preset === 'slim') return 'h-[64px] sm:h-[72px] md:h-[90px] lg:h-[104px]';
    if (preset === 'compact') return 'h-[70px] sm:h-[80px] md:h-[100px] lg:h-[116px]';
    return 'h-[78px] sm:h-[90px] md:h-[112px] lg:h-[128px]';
  }

  if (keyCount >= 37) {
    if (preset === 'slim') return 'h-[66px] sm:h-[74px] md:h-[92px] lg:h-[106px]';
    if (preset === 'compact') return 'h-[72px] sm:h-[82px] md:h-[102px] lg:h-[118px]';
    return 'h-[80px] sm:h-[92px] md:h-[114px] lg:h-[130px]';
  }

  if (preset === 'slim') return 'h-[68px] sm:h-[76px] md:h-[94px] lg:h-[108px]';
  if (preset === 'compact') return 'h-[74px] sm:h-[84px] md:h-[104px] lg:h-[120px]';
  return 'h-[82px] sm:h-[94px] md:h-[118px] lg:h-[134px]';
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

function getKeyRange(keyCount: KeyCount, shiftOctaves: number = 0): { startMidi: number; totalKeys: number } {
  let baseStart: number;
  let total: number;

  switch (keyCount) {
    case 25:
      baseStart = 48; // C3
      total = 25;
      break;
    case 32:
      baseStart = 41; // F2
      total = 32;
      break;
    case 37:
      baseStart = 48; // C3
      total = 37;
      break;
    case 44:
      baseStart = 36; // C2
      total = 44;
      break;
    case 49:
      baseStart = 36; // C2
      total = 49;
      break;
    case 54:
      baseStart = 36; // C2
      total = 54;
      break;
    case 61:
      baseStart = 36; // C2
      total = 61;
      break;
    case 76:
      baseStart = 28; // E1
      total = 76;
      break;
    case 88:
      baseStart = 21; // A0
      total = 88;
      break;
    default:
      baseStart = 48;
      total = 37;
  }

  const shiftedStart = baseStart + shiftOctaves * 12;
  const clampedStart = Math.max(0, Math.min(127 - total, shiftedStart));

  return {
    startMidi: clampedStart,
    totalKeys: total,
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
  visualModel = 'realistic-3d',
  onKeyCountChange,
  onViewModeToggle,
  onNotePlay,
  onNoteRelease,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchActiveNotes = useRef<Set<number>>(new Set());
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 110 });

  // Update SVG viewport dimensions on resize
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setDimensions({ width: Math.round(rect.width), height: Math.round(rect.height) });
        }
      }
    };
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const effectiveKeyCount: KeyCount = keyCount || (octaves === 2 ? 25 : octaves === 4 ? 49 : 37);

  const effectiveColor = useMemo(
    () => getEffectiveActiveColor(theme, customColor),
    [theme, customColor]
  );
  const darkerColor = useMemo(() => getDarkerShade(effectiveColor, 22), [effectiveColor]);
  const lighterColor = useMemo(() => getLighterShade(effectiveColor, 18), [effectiveColor]);
  const deepDarkColor = useMemo(() => getDarkerShade(effectiveColor, 40), [effectiveColor]);

  const activeSet = useMemo(() => new Set(activeNotes), [activeNotes]);

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

  const handleTouchStart = (midi: number) => {
    touchActiveNotes.current.add(midi);
    onNotePlay?.(midi);
  };

  const handleTouchEnd = (midi: number) => {
    touchActiveNotes.current.delete(midi);
    onNoteRelease?.(midi);
  };

  const heightClass = getKeyboardHeightClass(effectiveKeyCount, viewMode, heightPreset);

  // SVG Geometry Calculation
  const W = dimensions.width || 800;
  const H = dimensions.height || 110;

  // Isometric slope offset (dx): gives the keys that slight tilt/perspective from the user's drawing
  // At the top y=0, keys start slightly shifted, and slant down to the bottom
  const dx = Math.min(10, Math.max(3, Math.round(W * 0.007))); // Subtle natural perspective slant
  const whiteKeyWidth = (W - dx) / totalWhiteKeys;

  // Key facet heights:
  // Top main surface: y=0 to yTopEnd
  // Chamfer bevel: yTopEnd to yBevelEnd (following the exact slant dx of the user's sketch!)
  // Front vertical face: yBevelEnd to H (dropping down to bottom lip)
  const frontLipHeight = Math.max(9, Math.min(16, Math.round(H * 0.13)));
  const chamferHeight = Math.max(6, Math.min(10, Math.round(H * 0.07)));
  const yBevelEnd = H - frontLipHeight;
  const yTopEnd = yBevelEnd - chamferHeight;

  // Chamfer slant shift (the angle in the user's drawing!)
  const chamferDx = Math.max(2, Math.round(dx * 0.4));

  // Black keys geometry
  const blackKeyWidth = whiteKeyWidth * 0.62;
  const blackKeyHeight = yTopEnd * 0.68;
  const blackLipHeight = Math.max(4, Math.round(blackKeyHeight * 0.12));
  const blackTopHeight = blackKeyHeight - blackLipHeight;

  return (
    <div
      id="virtual-piano-keyboard"
      data-active-color={effectiveColor}
      data-active-dark-color={darkerColor}
      data-glow-intensity={glowIntensity}
      data-visual-model={visualModel}
      className="relative w-[96%] sm:w-[94%] md:w-[95%] max-w-5xl mx-auto flex flex-col select-none touch-none"
    >
      {/* Keyboard Container Housing */}
      <div
        ref={containerRef}
        className={`relative w-full ${heightClass} overflow-hidden touch-none select-none rounded-t-sm rounded-b-md shadow-[0_16px_36px_rgba(0,0,0,0.85),0_4px_12px_rgba(0,0,0,0.6)] border-t border-white/20 border-x border-neutral-950 border-b-2 border-black bg-[#121214]`}
      >
        <svg
          className="w-full h-full block select-none touch-none"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
        >
          <defs>
            {/* White Key Inactive Gradient */}
            <linearGradient id="whiteKeyTop" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="50%" stopColor="#fdfdfd" />
              <stop offset="85%" stopColor="#f4f4f7" />
              <stop offset="100%" stopColor="#ebebef" />
            </linearGradient>

            {/* Chamfer Bevel Inactive Gradient (Slightly darker shade following slope) */}
            <linearGradient id="whiteKeyChamfer" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#dcdce2" />
              <stop offset="100%" stopColor="#c5c5cd" />
            </linearGradient>

            {/* Front Lip Inactive Gradient (Front vertical face of the piano key) */}
            <linearGradient id="whiteKeyFront" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#bcbcc4" />
              <stop offset="50%" stopColor="#a8a8b2" />
              <stop offset="100%" stopColor="#8d8d96" />
            </linearGradient>

            {/* Active Key Dynamic Gradients */}
            <linearGradient id="whiteKeyTopActive" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={lighterColor} />
              <stop offset="70%" stopColor={effectiveColor} />
              <stop offset="100%" stopColor={darkerColor} />
            </linearGradient>

            <linearGradient id="whiteKeyChamferActive" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={darkerColor} />
              <stop offset="100%" stopColor={deepDarkColor} />
            </linearGradient>

            <linearGradient id="whiteKeyFrontActive" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={deepDarkColor} />
              <stop offset="100%" stopColor="#000000" />
            </linearGradient>

            {/* Black Key Gradients */}
            <linearGradient id="blackKeyTop" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2e2e33" />
              <stop offset="50%" stopColor="#1c1c20" />
              <stop offset="100%" stopColor="#101013" />
            </linearGradient>

            <linearGradient id="blackKeyFront" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#151518" />
              <stop offset="100%" stopColor="#050507" />
            </linearGradient>

            <linearGradient id="blackKeyTopActive" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={lighterColor} />
              <stop offset="60%" stopColor={effectiveColor} />
              <stop offset="100%" stopColor={darkerColor} />
            </linearGradient>

            <linearGradient id="blackKeyFrontActive" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={darkerColor} />
              <stop offset="100%" stopColor={deepDarkColor} />
            </linearGradient>
          </defs>

          {/* Felt strip along top edge */}
          <rect x={0} y={0} width={W} height={2.5} fill="#991b1b" />

          {/* ============================================================== */}
          {/* WHITE KEYS: Drawn as true 3D Isometric Polygons per user sketch */}
          {/* ============================================================== */}
          <g id="white-keys-group">
            {whiteKeys.map((key, i) => {
              const isActive = activeSet.has(key.midi);

              // Coordinates of this white key following the exact isometric slope from the user's sketch!
              const x0_top = dx + i * whiteKeyWidth;
              const x1_top = dx + (i + 1) * whiteKeyWidth;

              const x0_chamferTop = x0_top - (dx * (yTopEnd / H));
              const x1_chamferTop = x1_top - (dx * (yTopEnd / H));

              const x0_chamferBottom = x0_chamferTop - chamferDx;
              const x1_chamferBottom = x1_chamferTop - chamferDx;

              const x0_bottom = x0_chamferBottom;
              const x1_bottom = x1_chamferBottom;

              // Polygon points for Top Surface (Plano inclinado)
              const topPoints = `${x0_top},0 ${x1_top},0 ${x1_chamferTop},${yTopEnd} ${x0_chamferTop},${yTopEnd}`;

              // Polygon points for Chamfer Bevel (O chanfro angular que dobra na mesma inclinação!)
              const chamferPoints = `${x0_chamferTop},${yTopEnd} ${x1_chamferTop},${yTopEnd} ${x1_chamferBottom},${yBevelEnd} ${x0_chamferBottom},${yBevelEnd}`;

              // Polygon points for Front Vertical Face (A face frontal vertical fechando a tecla)
              const frontPoints = `${x0_chamferBottom},${yBevelEnd} ${x1_chamferBottom},${yBevelEnd} ${x1_bottom},${H} ${x0_bottom},${H}`;

              return (
                <g
                  key={key.midi}
                  id={`piano-key-white-${key.midi}`}
                  className="cursor-pointer"
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
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    handleTouchEnd(key.midi);
                  }}
                  onTouchCancel={(e) => {
                    e.preventDefault();
                    handleTouchEnd(key.midi);
                  }}
                >
                  {/* 1. TOP SURFACE */}
                  <polygon
                    points={topPoints}
                    fill={isActive ? 'url(#whiteKeyTopActive)' : 'url(#whiteKeyTop)'}
                    stroke="#222226"
                    strokeWidth={0.85}
                  />

                  {/* 2. ANGULAR CHAMFER BEVEL (Exact geometry from user sketch) */}
                  <polygon
                    points={chamferPoints}
                    fill={isActive ? 'url(#whiteKeyChamferActive)' : 'url(#whiteKeyChamfer)'}
                    stroke="#1c1c20"
                    strokeWidth={0.85}
                  />

                  {/* 3. FRONT VERTICAL FACE LIP */}
                  <polygon
                    points={frontPoints}
                    fill={isActive ? 'url(#whiteKeyFrontActive)' : 'url(#whiteKeyFront)'}
                    stroke="#111114"
                    strokeWidth={0.85}
                  />

                  {/* Highlighting sheen at bottom edge */}
                  <line
                    x1={x0_bottom}
                    y1={H - 0.75}
                    x2={x1_bottom}
                    y2={H - 0.75}
                    stroke="#000000"
                    strokeWidth={1.5}
                  />

                  {/* Note Label */}
                  {showNoteNames && (
                    <text
                      x={(x0_chamferTop + x1_chamferTop) / 2}
                      y={yTopEnd - 6}
                      textAnchor="middle"
                      fill={isActive ? '#0a0a0c' : '#52525b'}
                      fontSize={effectiveKeyCount >= 61 ? 8.5 : 10.5}
                      fontWeight="bold"
                      className="pointer-events-none select-none font-sans"
                    >
                      {key.pitchClass === 0 || key.whiteIndex === 0
                        ? `${key.name}${key.octave}`
                        : key.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* ============================================================== */}
          {/* BLACK KEYS: Positioned at seams, with angled 3D bevels & front */}
          {/* ============================================================== */}
          <g id="black-keys-group">
            {blackKeys.map((key) => {
              const isActive = activeSet.has(key.midi);

              // Center on the seam between white keys
              const seamIndex = key.whiteIndex;
              const seamX_top = dx + seamIndex * whiteKeyWidth;
              const seamX_bottom = seamX_top - (dx * (blackTopHeight / H));

              const x0_top = seamX_top - blackKeyWidth / 2;
              const x1_top = seamX_top + blackKeyWidth / 2;

              const x0_botTop = seamX_bottom - blackKeyWidth / 2;
              const x1_botTop = seamX_bottom + blackKeyWidth / 2;

              const x0_frontBot = x0_botTop - chamferDx * 0.5;
              const x1_frontBot = x1_botTop - chamferDx * 0.5;

              const topPoints = `${x0_top},0 ${x1_top},0 ${x1_botTop},${blackTopHeight} ${x0_botTop},${blackTopHeight}`;
              const frontPoints = `${x0_botTop},${blackTopHeight} ${x1_botTop},${blackTopHeight} ${x1_frontBot},${blackKeyHeight} ${x0_frontBot},${blackKeyHeight}`;

              return (
                <g
                  key={key.midi}
                  id={`piano-key-black-${key.midi}`}
                  className="cursor-pointer"
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
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    handleTouchEnd(key.midi);
                  }}
                  onTouchCancel={(e) => {
                    e.preventDefault();
                    handleTouchEnd(key.midi);
                  }}
                >
                  {/* Black Key Shadow cast on adjacent white keys */}
                  <polygon
                    points={`${x0_botTop - 1.5},${blackTopHeight + 2} ${x1_botTop + 2},${blackTopHeight + 2} ${x1_frontBot + 2},${blackKeyHeight + 3} ${x0_frontBot - 1.5},${blackKeyHeight + 3}`}
                    fill="rgba(0,0,0,0.5)"
                  />

                  {/* Black Key Top */}
                  <polygon
                    points={topPoints}
                    fill={isActive ? 'url(#blackKeyTopActive)' : 'url(#blackKeyTop)'}
                    stroke="#000000"
                    strokeWidth={0.8}
                  />

                  {/* Specular highlight along left edge */}
                  <line
                    x1={x0_top + 0.5}
                    y1={0}
                    x2={x0_botTop + 0.5}
                    y2={blackTopHeight}
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth={0.8}
                  />

                  {/* Black Key Front Beveled Face (Matches active tip from reference photo!) */}
                  <polygon
                    points={frontPoints}
                    fill={isActive ? 'url(#blackKeyFrontActive)' : 'url(#blackKeyFront)'}
                    stroke="#000000"
                    strokeWidth={0.8}
                  />

                  {/* Black Key Label */}
                  {showNoteNames && (
                    <text
                      x={(x0_botTop + x1_botTop) / 2}
                      y={blackTopHeight - 4}
                      textAnchor="middle"
                      fill={isActive ? '#000000' : '#a1a1aa'}
                      fontSize={effectiveKeyCount >= 61 ? 7 : 8.5}
                      fontWeight="bold"
                      className="pointer-events-none select-none font-sans"
                    >
                      {key.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
};
