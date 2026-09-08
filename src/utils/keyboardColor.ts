export interface KeyboardColorPreset {
  id: string;
  name: string;
  hex: string;
  accentHex?: string;
  glowHex?: string;
}

export const KEYBOARD_COLOR_PALETTE: KeyboardColorPreset[] = [
  { id: 'mint-cyan', name: 'Verde Menta / Ciano (Original)', hex: '#3bf5b0', accentHex: '#20d778', glowHex: '#3bf5b0' },
  { id: 'emerald', name: 'Esmeralda Neon', hex: '#10b981', accentHex: '#059669', glowHex: '#10b981' },
  { id: 'electric-cyan', name: 'Ciano Elétrico', hex: '#06b6d4', accentHex: '#0891b2', glowHex: '#06b6d4' },
  { id: 'sky-blue', name: 'Azul Celeste', hex: '#0ea5e9', accentHex: '#0284c7', glowHex: '#0ea5e9' },
  { id: 'royal-blue', name: 'Azul Royal', hex: '#3b82f6', accentHex: '#2563eb', glowHex: '#3b82f6' },
  { id: 'indigo', name: 'Índigo Violeta', hex: '#6366f1', accentHex: '#4f46e5', glowHex: '#6366f1' },
  { id: 'neon-purple', name: 'Roxo Neon', hex: '#a855f7', accentHex: '#9333ea', glowHex: '#a855f7' },
  { id: 'magenta', name: 'Fúcsia / Magenta', hex: '#d946ef', accentHex: '#c026d3', glowHex: '#d946ef' },
  { id: 'hot-pink', name: 'Rosa Choque', hex: '#ec4899', accentHex: '#db2777', glowHex: '#ec4899' },
  { id: 'rose-coral', name: 'Coral Rose', hex: '#f43f5e', accentHex: '#e11d48', glowHex: '#f43f5e' },
  { id: 'fire-red', name: 'Vermelho Fogo', hex: '#ef4444', accentHex: '#dc2626', glowHex: '#ef4444' },
  { id: 'sunset-orange', name: 'Laranja Sunset', hex: '#f97316', accentHex: '#ea580c', glowHex: '#f97316' },
  { id: 'gold-amber', name: 'Dourado / Âmbar', hex: '#f59e0b', accentHex: '#d97706', glowHex: '#f59e0b' },
  { id: 'neon-yellow', name: 'Amarelo Neon', hex: '#eab308', accentHex: '#ca8a04', glowHex: '#eab308' },
  { id: 'electric-lime', name: 'Verde Limão', hex: '#84cc16', accentHex: '#65a30d', glowHex: '#84cc16' },
  { id: 'deep-teal', name: 'Turquesa Oceano', hex: '#14b8a6', accentHex: '#0d9488', glowHex: '#14b8a6' },
  { id: 'pure-white', name: 'Branco Diamante', hex: '#f8fafc', accentHex: '#cbd5e1', glowHex: '#ffffff' },
  { id: 'ice-silver', name: 'Prata / Gelo', hex: '#94a3b8', accentHex: '#64748b', glowHex: '#94a3b8' },
];

export function hexToRgba(hexStr: string, alpha = 1): string {
  let hex = hexStr.replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length !== 6) {
    return `rgba(59, 245, 176, ${alpha})`;
  }
  const num = parseInt(hex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getDarkerShade(hexStr: string, percent = 20): string {
  let hex = hexStr.replace('#', '').trim();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length !== 6) return '#20d778';

  const num = parseInt(hex, 16);
  const factor = (100 - percent) / 100;
  const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((num >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((num & 255) * factor)));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function getLighterShade(hexStr: string, percent = 20): string {
  let hex = hexStr.replace('#', '').trim();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length !== 6) return '#6ee7b7';

  const num = parseInt(hex, 16);
  const factor = percent / 100;
  const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 255) + (255 - ((num >> 16) & 255)) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((num >> 8) & 255) + (255 - ((num >> 8) & 255)) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((num & 255) + (255 - (num & 255)) * factor)));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function getEffectiveActiveColor(theme: string, customColor?: string): string {
  if (customColor && customColor.startsWith('#')) {
    return customColor;
  }
  const match = KEYBOARD_COLOR_PALETTE.find((p) => p.id === theme);
  if (match) return match.hex;

  switch (theme) {
    case 'cyan':
      return '#3bf5b0';
    case 'gold':
      return '#f59e0b';
    case 'neon-purple':
      return '#a855f7';
    case 'emerald':
      return '#10b981';
    case 'hot-pink':
      return '#ec4899';
    case 'white':
      return '#f8fafc';
    default:
      return '#3bf5b0';
  }
}
