import { useColorScheme } from 'react-native';
import { palette } from './palette';

export function cardShadow(isDark) {
  if (isDark) return {};
  return {
    shadowColor: '#163D2C',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  };
}

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    isDark,
    bg: isDark ? palette.bgDark : palette.bgLight,
    surface: isDark ? palette.surfaceDark : palette.surfaceLight,
    text: isDark ? palette.textDark : palette.textLight,
    sub: isDark ? palette.subtextDark : palette.subtextLight,
    border: isDark ? palette.borderDark : palette.borderLight,
    mint: isDark ? palette.mintDark : palette.mint,
    primary: palette.forestGreen,
    primaryDeep: palette.forestDeep,
    banner: palette.forestBanner,
    good: palette.good,
    warn: palette.warn,
    bad: palette.bad,
    info: palette.info,
    placeholder: isDark ? 'rgba(231,239,233,0.35)' : 'rgba(22,48,39,0.35)',
  };
}
