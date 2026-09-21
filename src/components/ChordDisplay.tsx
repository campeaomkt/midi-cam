import React from 'react';
import { DetectedChord } from '../types';

interface ChordDisplayProps {
  chord: DetectedChord | null;
  lastChord?: DetectedChord | null;
  showNotesBreakdown?: boolean;
  fontSize?: 'medium' | 'large' | 'huge';
  color?: string;
  aspectRatio?: '9:16' | '16:9' | 'auto';
}

export const ChordDisplay: React.FC<ChordDisplayProps> = ({
  chord,
  fontSize = 'large',
  color = '#ffffff',
  aspectRatio = '9:16',
}) => {
  // Only display the chord when keys are actively pressed
  if (!chord) {
    return null;
  }

  const isAspect916 = (aspectRatio || '9:16') === '9:16';

  // In 9:16 mode (standard vertical format for PC & mobile), keep the chord elegant
  // and proportionate to the narrow vertical frame, preventing giant oversized text on PC desktop.
  const fontSizeClasses = isAspect916
    ? {
        medium: 'text-xl sm:text-2xl',
        large: 'text-2xl sm:text-[28px]',
        huge: 'text-[28px] sm:text-[34px]',
      }
    : {
        medium: 'text-2xl sm:text-[28px] md:text-[34px] lg:text-[42px]',
        large: 'text-[29px] sm:text-[36px] md:text-[46px] lg:text-[58px]',
        huge: 'text-4xl sm:text-[44px] md:text-[58px] lg:text-[72px]',
      };

  return (
    <div
      id="chord-display-container"
      className="flex flex-col items-center justify-center pointer-events-none select-none py-0.5"
    >
      <div id="active-chord-badge" className="flex flex-col items-center">
        {/* Main Chord Title */}
        <h1
          id="detected-chord-text"
          style={{ color }}
          className={`font-extrabold tracking-tight font-sans drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] [text-shadow:_0_2px_12px_rgba(0,0,0,0.9),_0_0_2px_#000000] ${fontSizeClasses[fontSize]}`}
        >
          {chord.name}
        </h1>
      </div>
    </div>
  );
};
