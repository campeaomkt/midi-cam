import React, { useRef } from 'react';
import { KeyData } from './VirtualKeyboard';

interface Isometric3DKeyboardProps {
  whiteKeys: KeyData[];
  blackKeys: KeyData[];
  totalWhiteKeys: number;
  activeSet: Set<number>;
  effectiveColor: string;
  lighterColor: string;
  darkerColor: string;
  deepDarkColor: string;
  glowIntensity: number;
  showNoteNames: boolean;
  onNotePlay?: (midi: number) => void;
  onNoteRelease?: (midi: number) => void;
}

export const Isometric3DKeyboard: React.FC<Isometric3DKeyboardProps> = ({
  whiteKeys,
  blackKeys,
  totalWhiteKeys,
  activeSet,
  effectiveColor,
  lighterColor,
  darkerColor,
  deepDarkColor,
  glowIntensity,
  showNoteNames,
  onNotePlay,
  onNoteRelease,
}) => {
  const currentHoverMidi = useRef<number | null>(null);

  // SVG Geometry constants matching exact Cursor reference
  const W = 1200;
  const H = 280;
  const cx = W / 2; // 600

  const frontLeft = 18;
  const frontRight = 1182;
  const frontW = frontRight - frontLeft; // 1164

  const yTop = 20; // Top/back edge of white keys
  const yFront = 216; // Line where white key top meets vertical front face
  const yBottom = 268; // Bottom edge of vertical front face

  // Perspective ratio: how much the back narrows compared to the front
  const backRatio = 0.932;

  // Helper to project front x coordinate to back x coordinate
  const projectXb = (xf: number) => cx + (xf - cx) * backRatio;

  // Multi-touch / Glissando handler for SVG
  const handlePointerDown = (midi: number, e: React.PointerEvent) => {
    currentHoverMidi.current = midi;
    onNotePlay?.(midi);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1 && e.pointerType === 'mouse') return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const keyEl = target?.closest('[data-midi]');
    const midi = keyEl ? Number(keyEl.getAttribute('data-midi')) : null;

    if (midi !== currentHoverMidi.current) {
      if (currentHoverMidi.current !== null) {
        onNoteRelease?.(currentHoverMidi.current);
      }
      if (midi !== null) {
        onNotePlay?.(midi);
      }
      currentHoverMidi.current = midi;
    }
  };

  const handlePointerUpOrLeave = () => {
    if (currentHoverMidi.current !== null) {
      onNoteRelease?.(currentHoverMidi.current);
      currentHoverMidi.current = null;
    }
  };

  // Font sizing based on key density
  const whiteFontSize = totalWhiteKeys >= 50 ? 8 : totalWhiteKeys >= 30 ? 10 : 12;
  const blackFontSize = totalWhiteKeys >= 50 ? 6.5 : totalWhiteKeys >= 30 ? 8 : 9.5;

  return (
    <div
      className="relative w-full h-full flex items-center justify-center bg-transparent overflow-visible select-none touch-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrLeave}
      onPointerLeave={handlePointerUpOrLeave}
      onPointerCancel={handlePointerUpOrLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full select-none touch-none filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.55)]"
        preserveAspectRatio="none"
      >
        <defs>
          <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
            <feOffset dx="0" dy="2.5" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.45" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. White Keys Rendering */}
        <g id="isometric-white-keys">
          {whiteKeys.map((key) => {
            const isActive = activeSet.has(key.midi);
            const i = key.whiteIndex;

            const xf0 = frontLeft + (i / totalWhiteKeys) * frontW;
            const xf1 = frontLeft + ((i + 1) / totalWhiteKeys) * frontW;
            const xb0 = projectXb(xf0);
            const xb1 = projectXb(xf1);

            // Active depression: depressed keys sink down slightly in 3D
            const ySink = isActive ? 2.5 : 0;

            const topPoints = `${xb0},${yTop + ySink} ${xb1},${yTop + ySink} ${xf1},${yFront + ySink} ${xf0},${yFront + ySink}`;
            const frontPoints = `${xf0},${yFront + ySink} ${xf1},${yFront + ySink} ${xf1},${yBottom} ${xf0},${yBottom}`;

            const isFirst = i === 0;
            const isLast = i === totalWhiteKeys - 1;

            return (
              <g
                key={key.midi}
                id={`piano-key-white-${key.midi}`}
                data-midi={key.midi}
                className="cursor-pointer"
                onPointerDown={(e) => handlePointerDown(key.midi, e)}
              >
                {/* Left Outer Side Face for the first white key */}
                {isFirst && (
                  <polygon
                    points={`${xb0},${yTop + ySink} ${xf0},${yFront + ySink} ${xf0},${yBottom} ${xb0},${yTop + ySink + (yBottom - yFront)}`}
                    fill={isActive ? darkerColor : '#7b7e87'}
                    stroke="#1c1c1f"
                    strokeWidth="1"
                  />
                )}

                {/* Right Outer Side Face for the last white key */}
                {isLast && (
                  <polygon
                    points={`${xb1},${yTop + ySink} ${xf1},${yFront + ySink} ${xf1},${yBottom} ${xb1},${yTop + ySink + (yBottom - yFront)}`}
                    fill={isActive ? darkerColor : '#7b7e87'}
                    stroke="#1c1c1f"
                    strokeWidth="1"
                  />
                )}

                {/* White Key Top Face (slanted perspective) */}
                <polygon
                  points={topPoints}
                  fill={isActive ? lighterColor : '#ffffff'}
                  stroke="#1c1c1f"
                  strokeWidth="1"
                />

                {/* White Key Front Face (vertical grey block) */}
                <polygon
                  points={frontPoints}
                  fill={isActive ? darkerColor : '#8f929b'}
                  stroke="#1c1c1f"
                  strokeWidth="1"
                />

                {/* Note Label */}
                {showNoteNames && (
                  <text
                    x={(xf0 + xf1) / 2}
                    y={yFront + ySink - 12}
                    textAnchor="middle"
                    fill={isActive ? '#09090b' : '#71717a'}
                    fontSize={whiteFontSize}
                    fontWeight="bold"
                    pointerEvents="none"
                    fontFamily="system-ui, sans-serif"
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

        {/* 2. Black Keys Rendering (Extruded 3D Blocks with exact perspective side visibility) */}
        <g id="isometric-black-keys">
          {blackKeys.map((key) => {
            const isActive = activeSet.has(key.midi);

            const seamXf = frontLeft + (key.whiteIndex / totalWhiteKeys) * frontW;
            const seamXb = projectXb(seamXf);

            const tFront = 0.61;
            const baseY_top = yTop;
            const baseX_top = seamXb;
            const baseY_front = yTop + tFront * (yFront - yTop);
            const baseX_front = seamXb + tFront * (seamXf - seamXb);

            const wWhiteFront = frontW / totalWhiteKeys;
            const wWhiteBack = (frontW * backRatio) / totalWhiteKeys;
            const hwFront = (wWhiteFront * 0.63) / 2;
            const hwBack = (wWhiteBack * 0.63) / 2;

            // Base footprint vertices on top of white keybed
            const b_tl = { x: baseX_top - hwBack, y: baseY_top };
            const b_tr = { x: baseX_top + hwBack, y: baseY_top };
            const b_fr = { x: baseX_front + hwFront, y: baseY_front };
            const b_fl = { x: baseX_front - hwFront, y: baseY_front };

            // 3D elevation (key height above white keys)
            const elev = isActive ? 7 : 14;
            const t_tl = { x: b_tl.x, y: b_tl.y - elev };
            const t_tr = { x: b_tr.x, y: b_tr.y - elev };
            const t_fr = { x: b_fr.x, y: b_fr.y - elev };
            const t_fl = { x: b_fl.x, y: b_fl.y - elev };

            // Side visibility logic based on camera center
            const dx = baseX_front - cx;
            const isLeft = dx < -12;
            const isRight = dx > 12;

            const shadowDx = dx * 0.012;
            const shadowPoints = `${b_fl.x},${b_fl.y} ${b_fr.x},${b_fr.y} ${b_fr.x + shadowDx},${b_fr.y + 6} ${b_fl.x + shadowDx},${b_fl.y + 6}`;

            return (
              <g
                key={key.midi}
                id={`piano-key-black-${key.midi}`}
                data-midi={key.midi}
                className="cursor-pointer"
                onPointerDown={(e) => handlePointerDown(key.midi, e)}
              >
                {/* Cast Shadow on White Key */}
                <polygon
                  points={shadowPoints}
                  fill="rgba(0, 0, 0, 0.45)"
                  pointerEvents="none"
                />

                {/* Perspective Side Face */}
                {isLeft && (
                  /* Left of center: RIGHT side is visible to the viewer */
                  <polygon
                    points={`${t_tr.x},${t_tr.y} ${t_fr.x},${t_fr.y} ${b_fr.x},${b_fr.y} ${b_tr.x},${b_tr.y}`}
                    fill={isActive ? darkerColor : '#1b1c20'}
                    stroke="#121316"
                    strokeWidth="0.75"
                  />
                )}
                {isRight && (
                  /* Right of center: LEFT side is visible to the viewer */
                  <polygon
                    points={`${t_tl.x},${t_tl.y} ${t_fl.x},${t_fl.y} ${b_fl.x},${b_fl.y} ${b_tl.x},${b_tl.y}`}
                    fill={isActive ? darkerColor : '#1b1c20'}
                    stroke="#121316"
                    strokeWidth="0.75"
                  />
                )}

                {/* Vertical Front Face (solid black drop) */}
                <polygon
                  points={`${t_fl.x},${t_fl.y} ${t_fr.x},${t_fr.y} ${b_fr.x},${b_fr.y} ${b_fl.x},${b_fl.y}`}
                  fill={isActive ? deepDarkColor : '#0c0d10'}
                  stroke="#121316"
                  strokeWidth="0.75"
                />

                {/* Elevated Top Face (matte dark slate) */}
                <polygon
                  points={`${t_tl.x},${t_tl.y} ${t_tr.x},${t_tr.y} ${t_fr.x},${t_fr.y} ${t_fl.x},${t_fl.y}`}
                  fill={isActive ? effectiveColor : '#25262a'}
                  stroke="#141416"
                  strokeWidth="0.75"
                />

                {/* Black Note Name */}
                {showNoteNames && (
                  <text
                    x={(t_fl.x + t_fr.x) / 2}
                    y={t_fl.y - 4}
                    textAnchor="middle"
                    fill={isActive ? '#000000' : '#a1a1aa'}
                    fontSize={blackFontSize}
                    fontWeight="bold"
                    pointerEvents="none"
                    fontFamily="system-ui, sans-serif"
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
  );
};
