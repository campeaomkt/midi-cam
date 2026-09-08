import { FilterPreset } from '../types';

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'normal',
    name: 'Original',
    description: 'Cores naturais sem alteração',
    cssFilter: 'none',
    colorGrading: {
      brightness: 1,
      contrast: 1,
      saturate: 1,
      sepia: 0,
      hueRotate: 0,
      vignette: 0,
    }
  },
  {
    id: 'cinematic-warm',
    name: 'Cinema Warm',
    description: 'Tom quente analógico com sombras suaves',
    cssFilter: 'contrast(1.12) saturate(1.2) sepia(0.18) brightness(1.03)',
    colorGrading: {
      brightness: 1.03,
      contrast: 1.12,
      saturate: 1.2,
      sepia: 0.18,
      hueRotate: -5,
      vignette: 0.25,
      tintColor: 'rgba(255, 170, 50, 0.08)',
      tintOpacity: 0.1,
    }
  },
  {
    id: 'moody-noir',
    name: 'Moody Noir',
    description: 'Preto e branco dramático de alto contraste',
    cssFilter: 'grayscale(1) contrast(1.35) brightness(0.95)',
    colorGrading: {
      brightness: 0.95,
      contrast: 1.35,
      saturate: 0,
      sepia: 0,
      hueRotate: 0,
      vignette: 0.45,
    }
  },
  {
    id: 'emerald-teal',
    name: 'Teal & Gold',
    description: 'Estilo Hollywood com sombras teal e luzes âmbar',
    cssFilter: 'contrast(1.15) saturate(1.25) hue-rotate(-10deg)',
    colorGrading: {
      brightness: 1.02,
      contrast: 1.18,
      saturate: 1.25,
      sepia: 0.12,
      hueRotate: -10,
      vignette: 0.3,
      tintColor: 'rgba(20, 184, 166, 0.08)',
      tintOpacity: 0.08,
    }
  },
  {
    id: 'neon-cyber',
    name: 'Cyberpunk',
    description: 'Cores vibrantes, luzes neon e contraste elétrico',
    cssFilter: 'contrast(1.25) saturate(1.5) hue-rotate(15deg) brightness(1.05)',
    colorGrading: {
      brightness: 1.05,
      contrast: 1.25,
      saturate: 1.5,
      sepia: 0,
      hueRotate: 15,
      vignette: 0.35,
      tintColor: 'rgba(168, 85, 247, 0.1)',
      tintOpacity: 0.12,
    }
  },
  {
    id: 'vintage-film',
    name: '35mm Film',
    description: 'Visual vintage com textura nostálgica e tons suaves',
    cssFilter: 'sepia(0.25) contrast(1.08) saturate(0.9) brightness(1.04)',
    colorGrading: {
      brightness: 1.04,
      contrast: 1.08,
      saturate: 0.9,
      sepia: 0.25,
      hueRotate: -8,
      vignette: 0.35,
    }
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    description: 'Luz dourada do entardecer com brilho aquecido',
    cssFilter: 'contrast(1.1) saturate(1.35) sepia(0.22) brightness(1.08)',
    colorGrading: {
      brightness: 1.08,
      contrast: 1.1,
      saturate: 1.35,
      sepia: 0.22,
      hueRotate: -5,
      vignette: 0.2,
      tintColor: 'rgba(245, 158, 11, 0.12)',
      tintOpacity: 0.12,
    }
  },
  {
    id: 'pastel-soft',
    name: 'Pastel Dream',
    description: 'Luz suave, sombras elevadas e estética clean',
    cssFilter: 'contrast(0.95) saturate(1.15) brightness(1.1)',
    colorGrading: {
      brightness: 1.1,
      contrast: 0.95,
      saturate: 1.15,
      sepia: 0.05,
      hueRotate: 5,
      vignette: 0.1,
    }
  }
];

export function getCombinedFilterStyle(preset: FilterPreset, customAdj?: {
  brightness?: number;
  contrast?: number;
  saturate?: number;
  sepia?: number;
  hueRotate?: number;
}): string {
  const b = (preset.colorGrading.brightness * (customAdj?.brightness ?? 1)).toFixed(2);
  const c = (preset.colorGrading.contrast * (customAdj?.contrast ?? 1)).toFixed(2);
  const s = (preset.colorGrading.saturate * (customAdj?.saturate ?? 1)).toFixed(2);
  const sep = Math.min(1, preset.colorGrading.sepia + (customAdj?.sepia ?? 0)).toFixed(2);
  const hue = (preset.colorGrading.hueRotate + (customAdj?.hueRotate ?? 0)).toFixed(0);

  const filters = [
    `brightness(${b})`,
    `contrast(${c})`,
    `saturate(${s})`,
  ];

  if (parseFloat(sep) > 0) {
    filters.push(`sepia(${sep})`);
  }
  if (parseInt(hue, 10) !== 0) {
    filters.push(`hue-rotate(${hue}deg)`);
  }

  return filters.join(' ');
}
