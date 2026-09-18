import React, { useMemo, useRef, useState, useEffect } from 'react';
import { KeyboardTheme, KeyCount, KeyboardVisualModel } from '../types';
import {
  getEffectiveActiveColor,
  getDarkerShade,
  getLighterShade,
} from '../utils/keyboardColor';

export const KEY_COUNT_OPTIONS: {
  count: KeyCount;
  label: string;
  desc: string;
  startNote: string;
  range: string;
  notesStartOn: string;
}[] = [
  { count: 25, label: '25 Teclas', desc: '2 oitavas (Portátil)', startNote: 'C3', range: 'C3 - C5', notesStartOn: 'Dó' },
  { count: 32, label: '32 Teclas', desc: '2.5 oitavas', startNote: 'F2', range: 'F2 - C5', notesStartOn: 'Fá' },
  { count: 37, label: '37 Teclas', desc: '3 oitavas (Padrão)', startNote: 'C3', range: 'C3 - C6', notesStartOn: 'Dó' },
  { count: 44, label: '44 Teclas', desc: '3.5 oitavas', startNote: 'C2', range: 'C2 - G5', notesStartOn: 'Dó' },
  { count: 49, label: '49 Teclas', desc: '4 oitavas', startNote: 'C2', range: 'C2 - C6', notesStartOn: 'Dó' },
  { count: 61, label: '61 Teclas', desc: '5 oitavas (Teclado)', startNote: 'C2', range: 'C2 - C7', notesStartOn: 'Dó' },
  { count: 76, label: '76 Teclas', desc: '6 oitavas', startNote: 'E1', range: 'E1 - G7', notesStartOn: 'Mi' },
  { count: 88, label: '88 Teclas', desc: '7 oitavas (Piano Completo)', startNote: 'A0', range: 'A0 - C8', notesStartOn: 'Lá' },
];

interface VirtualKeyboardProps {
  visualModel?: KeyboardVisualModel;
  activeNotes: number[];
  keyCount?: KeyCount;
  octaves?: 2 | 3 | 4;
  startOctave?: number;
  octaveShift?: number;
  heightPreset?: 'slim' | 'normal' | 'compact';
  theme?: KeyboardTheme;
  customColor?: string;
  glowIntensity?: number;
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
    if (preset === 'slim') return 'h-[64px] sm:h-[74px] md:h-[90px] lg:h-[104px]';
    if (preset === 'compact') return 'h-[70px] sm:h-[82px] md:h-[100px] lg:h-[116px]';
    return 'h-[78px] sm:h-[92px] md:h-[112px] lg:h-[130px]';
  }

  if (keyCount >= 61) {
    if (preset === 'slim') return 'h-[62px] sm:h-[72px] md:h-[88px] lg:h-[102px]';
    if (preset === 'compact') return 'h-[68px] sm:h-[80px] md:h-[98px] lg:h-[114px]';
    return 'h-[76px] sm:h-[90px] md:h-[110px] lg:h-[128px]';
  }

  if (keyCount >= 44) {
    if (preset === 'slim') return 'h-[64px] sm:h-[74px] md:h-[90px] lg:h-[104px]';
    if (preset === 'compact') return 'h-[70px] sm:h-[82px] md:h-[100px] lg:h-[116px]';
    return 'h-[78px] sm:h-[92px] md:h-[112px] lg:h-[130px]';
  }

  if (keyCount >= 37) {
    if (preset === 'slim') return 'h-[66px] sm:h-[76px] md:h-[92px] lg:h-[106px]';
    if (preset === 'compact') return 'h-[72px] sm:h-[84px] md:h-[102px] lg:h-[118px]';
    return 'h-[80px] sm:h-[94px] md:h-[116px] lg:h-[134px]';
  }

  if (preset === 'slim') return 'h-[68px] sm:h-[78px] md:h-[94px] lg:h-[108px]';
  if (preset === 'compact') return 'h-[74px] sm:h-[86px] md:h-[104px] lg:h-[120px]';
  return 'h-[82px] sm:h-[96px] md:h-[120px] lg:h-[138px]';
}

interface KeyData {
  midi: number;
  pitchClass: number;
  isBlack: boolean;
  name: string;
  octave: number;
  whiteIndex: number;
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
    case 61:
      baseStart = 36; // C2
      total = 61;
      break;
    case 64:
      baseStart = 36; // C2
      total = 64;
      break;
    case 73:
      baseStart = 28; // E1
      total = 73;
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
  const [svgWidth, setSvgWidth] = useState(880);
  const [svgHeight, setSvgHeight] = useState(115);

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        if (r.width > 50 && r.height > 20) {
          setSvgWidth(Math.round(r.width));
          setSvgHeight(Math.round(r.height));
        }
      }
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const effectiveKeyCount: KeyCount = keyCount || (octaves === 2 ? 25 : octaves === 4 ? 49 : 37);

  const effectiveColor = useMemo(
    () => getEffectiveActiveColor(theme, customColor),
    [theme, customColor]
  );
  const darkerColor = useMemo(() => getDarkerShade(effectiveColor, 20), [effectiveColor]);
  const lighterColor = useMemo(() => getLighterShade(effectiveColor, 18), [effectiveColor]);
  const deepDarkColor = useMemo(() => getDarkerShade(effectiveColor, 38), [effectiveColor]);

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

    return {
      whiteKeys: whites,
      blackKeys: blacks,
      totalWhiteKeys: whites.length,
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

  // =========================================================================
  // GEOMETRIA EXATA DO DESENHO DO USUÁRIO (IMAGENS 1, 2, 3):
  //
  // 1. Corpo da tecla em perspectiva inclinada ( / )
  // 2. Chanfro angular de transição
  // 3. Face Frontal da tecla: A LINHA FICA ESTRITAMENTE VERTICAL ( | )!
  //    /  <- inclinado em cima
  //    |  <- 100% reto na face frontal!
  // =========================================================================
  const W = svgWidth || 880;
  const H = svgHeight || 115;

  // Altura da face frontal (onde a linha fica reta | )
  const frontLipHeight = Math.max(11, Math.min(18, Math.round(H * 0.15)));
  // Altura do chanfro
  const chamferHeight = Math.max(5, Math.min(9, Math.round(H * 0.07)));

  // Coordenadas Y dos cortes horizontais
  const yVerticalStart = H - frontLipHeight; // Linha divisória horizontal entre chanfro e face vertical
  const yChamferStart = yVerticalStart - chamferHeight; // Linha onde começa o chanfro

  // Inclinação em perspectiva no topo \___/
  const topInset = Math.round(Math.min(26, Math.max(10, W * 0.022)));

  // Funções de coordenadas X:
  // No topo (y = 0): x vai de topInset até W - topInset (efeito \___/)
  const getTopX = (u: number): number => {
    return topInset + u * (W - 2 * topInset);
  };

  // Na base inferior (y = H e y = yVerticalStart):
  // AS LINHAS DA FACE FRONTAL SÃO 100% RETAS E VERTICAIS ( | )!
  // Logo, o X no início da face vertical e no fim da face vertical é RIGOROSAMENTE O MESMO!
  const getBaseX = (u: number): number => {
    return u * W;
  };

  // No início do chanfro:
  const getChamferStartX = (u: number): number => {
    const t0 = getTopX(u);
    const b0 = getBaseX(u);
    const ratio = yChamferStart / yVerticalStart;
    return t0 + ratio * (b0 - t0);
  };

  // Teclas pretas:
  const blackKeyTopHeight = yChamferStart * 0.65;
  const blackKeyFrontHeight = blackKeyTopHeight + Math.max(4, Math.round(chamferHeight * 0.8));

  return (
    <div
      id="virtual-piano-keyboard"
      data-active-color={effectiveColor}
      data-active-dark-color={darkerColor}
      data-glow-intensity={glowIntensity}
      data-visual-model={visualModel}
      className="relative w-[96%] sm:w-[94%] md:w-[95%] max-w-5xl mx-auto flex flex-col select-none touch-none"
    >
      <div
        ref={containerRef}
        className={`relative w-full ${heightClass} overflow-hidden touch-none select-none rounded-t-sm rounded-b-md shadow-[0_20px_45px_rgba(0,0,0,0.85),0_6px_16px_rgba(0,0,0,0.65)] bg-[#0d0d10] border-t border-neutral-700 border-b-2 border-black`}
      >
        <svg
          className="w-full h-full block select-none touch-none"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
        >
          <defs>
            {/* White Key Inactive Body */}
            <linearGradient id="whiteKeyBody" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="50%" stopColor="#fbfbfc" />
              <stop offset="85%" stopColor="#efeff4" />
              <stop offset="100%" stopColor="#e2e2e9" />
            </linearGradient>

            {/* White Key Chamfer Bevel */}
            <linearGradient id="whiteKeyChamfer" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#d0d0d8" />
              <stop offset="100%" stopColor="#babac4" />
            </linearGradient>

            {/* White Key Vertical Front Lip: Straight vertical face | */}
            <linearGradient id="whiteKeyFrontVertical" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#b2b2bc" />
              <stop offset="45%" stopColor="#9a9aa4" />
              <stop offset="100%" stopColor="#757580" />
            </linearGradient>

            {/* Active White Key States */}
            <linearGradient id="whiteKeyBodyActive" x1="0%" y1="0%" x2="0%" y2="100%">
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

            {/* Black Keys */}
            <linearGradient id="blackKeyBody" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2c2c32" />
              <stop offset="55%" stopColor="#1c1c20" />
              <stop offset="100%" stopColor="#101013" />
            </linearGradient>

            <linearGradient id="blackKeyFront" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#161619" />
              <stop offset="100%" stopColor="#000000" />
            </linearGradient>

            <linearGradient id="blackKeyBodyActive" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={lighterColor} />
              <stop offset="60%" stopColor={effectiveColor} />
              <stop offset="100%" stopColor={darkerColor} />
            </linearGradient>

            <linearGradient id="blackKeyFrontActive" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={darkerColor} />
              <stop offset="100%" stopColor={deepDarkColor} />
            </linearGradient>
          </defs>

          {/* Red Felt Strip at top */}
          <rect x={0} y={0} width={W} height={2.5} fill="#881313" />

          {/* ============================================================== */}
          {/* WHITE KEYS: / no corpo superior, e ESTRITAMENTE RETO | NA FACE */}
          {/* ============================================================== */}
          <g id="white-keys-group">
            {whiteKeys.map((key, i) => {
              const isActive = activeSet.has(key.midi);

              const u0 = i / totalWhiteKeys;
              const u1 = (i + 1) / totalWhiteKeys;

              // Coordenadas calculadas:
              const x0_top = getTopX(u0);
              const x1_top = getTopX(u1);

              const x0_chamfer = getChamferStartX(u0);
              const x1_chamfer = getChamferStartX(u1);

              const x0_vertical = getBaseX(u0);
              const x1_vertical = getBaseX(u1);

              // NA FACE FRONTAL: X É IDÊNTICO, RESULTANDO NA LINHA VERTICAL RETA (|)!
              const x0_bottom = x0_vertical;
              const x1_bottom = x1_vertical;

              // Polígono 1: Superfície Superior Completa ( / )
              // Vai do topo (y=0) até a dobra da face frontal (y=yVerticalStart)
              const bodyPoints = `${x0_top},0 ${x1_top},0 ${x1_vertical},${yVerticalStart} ${x0_vertical},${yVerticalStart}`;

              // Polígono 2: Face Frontal Vertical (LINHAS RETAS VERTICAIS | )
              // Vai da dobra (y=yVerticalStart) até a base inferior (y=H)
              const frontPoints = `${x0_vertical},${yVerticalStart} ${x1_vertical},${yVerticalStart} ${x1_bottom},${H} ${x0_bottom},${H}`;

              return (
                <g
                  key={key.midi}
                  id={`piano-key-white-${key.midi}`}
                  data-white-index={i}
                  data-midi={key.midi}
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
                  {/* 1. Superfície Superior em Perspectiva ( / ) */}
                  <polygon
                    points={bodyPoints}
                    fill={isActive ? 'url(#whiteKeyBodyActive)' : 'url(#whiteKeyBody)'}
                    stroke="#1c1c22"
                    strokeWidth={0.8}
                  />

                  {/* 2. Face Frontal 100% Vertical ( | ) */}
                  <polygon
                    points={frontPoints}
                    fill={isActive ? 'url(#whiteKeyFrontActive)' : 'url(#whiteKeyFrontVertical)'}
                    stroke="#111116"
                    strokeWidth={0.8}
                  />

                  {/* Linha de sombra inferior */}
                  <line
                    x1={x0_bottom}
                    y1={H - 0.75}
                    x2={x1_bottom}
                    y2={H - 0.75}
                    stroke="#000000"
                    strokeWidth={1.5}
                  />

                  {/* Nome da Nota */}
                  {showNoteNames && (
                    <text
                      x={(x0_chamfer + x1_chamfer) / 2}
                      y={yVerticalStart - 7}
                      textAnchor="middle"
                      fill={isActive ? '#0a0a0c' : '#52525b'}
                      fontSize={effectiveKeyCount >= 61 ? 8 : 10}
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
          {/* BLACK KEYS                                                     */}
          {/* ============================================================== */}
          <g id="black-keys-group">
            {blackKeys.map((key) => {
              const isActive = activeSet.has(key.midi);

              const seamIndex = key.seamIndex;
              const uSeam = seamIndex / totalWhiteKeys;

              const halfW = (1 / totalWhiteKeys) * 0.31;
              const u0 = Math.max(0, uSeam - halfW);
              const u1 = Math.min(1, uSeam + halfW);

              const x0_top = getTopX(u0);
              const x1_top = getTopX(u1);

              const tTop = blackKeyTopHeight / yVerticalStart;
              const x0_bodyBot = getTopX(u0) + tTop * (getBaseX(u0) - getTopX(u0));
              const x1_bodyBot = getTopX(u1) + tTop * (getBaseX(u1) - getTopX(u1));

              // Face frontal reta vertical da tecla preta:
              const x0_frontBot = x0_bodyBot;
              const x1_frontBot = x1_bodyBot;

              const topPolygon = `${x0_top},0 ${x1_top},0 ${x1_bodyBot},${blackKeyTopHeight} ${x0_bodyBot},${blackKeyTopHeight}`;
              const frontPolygon = `${x0_bodyBot},${blackKeyTopHeight} ${x1_bodyBot},${blackKeyTopHeight} ${x1_frontBot},${blackKeyFrontHeight} ${x0_frontBot},${blackKeyFrontHeight}`;

              return (
                <g
                  key={key.midi}
                  id={`piano-key-black-${key.midi}`}
                  data-seam-index={key.seamIndex}
                  data-midi={key.midi}
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
                  <polygon
                    points={`${x0_bodyBot - 1.5},${blackKeyTopHeight + 1} ${x1_bodyBot + 2},${blackKeyTopHeight + 1} ${x1_frontBot + 2},${blackKeyFrontHeight + 2} ${x0_frontBot - 1.5},${blackKeyFrontHeight + 2}`}
                    fill="rgba(0,0,0,0.5)"
                  />

                  <polygon
                    points={topPolygon}
                    fill={isActive ? 'url(#blackKeyBodyActive)' : 'url(#blackKeyBody)'}
                    stroke="#000000"
                    strokeWidth={0.8}
                  />

                  <line
                    x1={x0_top + 0.5}
                    y1={0}
                    x2={x0_bodyBot + 0.5}
                    y2={blackKeyTopHeight}
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={0.8}
                  />

                  <polygon
                    points={frontPolygon}
                    fill={isActive ? 'url(#blackKeyFrontActive)' : 'url(#blackKeyFront)'}
                    stroke="#000000"
                    strokeWidth={0.8}
                  />

                  {showNoteNames && (
                    <text
                      x={(x0_bodyBot + x1_bodyBot) / 2}
                      y={blackKeyTopHeight - 4}
                      textAnchor="middle"
                      fill={isActive ? '#000000' : '#a1a1aa'}
                      fontSize={effectiveKeyCount >= 61 ? 6.5 : 8}
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
