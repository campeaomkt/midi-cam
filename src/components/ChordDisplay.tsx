import React from 'react';
import { DetectedChord } from '../types';

interface ChordDisplayProps {
  chord: DetectedChord | null;
  lastChord?: DetectedChord | null;
  showNotesBreakdown?: boolean;
  fontSize?: 'medium' | 'large' | 'huge';
  color?: string;
}

export const ChordDisplay: React.FC<ChordDisplayProps> = ({
  chord,
  fontSize = 'large',
  color = '#ffffff',
}) => {
  // Only display the chord when keys are actively pressed
  if (!chord) {
    return null;
  }

  const fontSizeClasses = {
    medium: 'text-2xl sm:text-[28px]',
    large: 'text-[29px] sm:text-[36px]',
    huge: 'text-4xl sm:text-[44px]',
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
