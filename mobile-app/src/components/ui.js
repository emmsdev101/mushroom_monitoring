import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '../theme/palette';
import { useTheme } from '../theme/useTheme';

const LOGO = require('../../assets/logo.png');

export function BrandMark({ size = 34 }) {
  return (
    <Image
      source={LOGO}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      accessibilityLabel="Kabutech Monitoring"
    />
  );
}

export function BrandLockup({ compact = false }) {
  const t = useTheme();
  return (
    <View style={styles.lockup}>
      <BrandMark size={compact ? 30 : 34} />
      <View>
        <Text style={[styles.brand, { color: t.text, fontSize: compact ? 16 : 18 }]}>Kabutech</Text>
        <Text style={[styles.brandSub, { color: palette.forestGreen, fontSize: compact ? 11 : 12 }]}>
          Monitoring
        </Text>
      </View>
    </View>
  );
}

export function navigateRoot(navigation, name) {
  const parent = navigation?.getParent?.();
  (parent || navigation)?.navigate?.(name);
}

export function AppHeader({ title, onBack, right, brand = false }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: t.bg }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </Pressable>
      ) : null}
      {brand ? (
        <View style={{ flex: 1 }}>
          <BrandLockup compact />
        </View>
      ) : (
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
          {title}
        </Text>
      )}
      <View style={styles.right}>{right}</View>
    </View>
  );
}

export function HeaderIcon({ name, onPress, badge }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.iconBtn}>
      <Ionicons name={name} size={22} color={t.text} />
      {badge ? <View style={styles.badge} /> : null}
    </Pressable>
  );
}

export function SegmentedControl({ options, value, onChange }) {
  const t = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: t.mint }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segmentItem, active && { backgroundColor: palette.forestDeep }]}
          >
            <Text style={[styles.segmentText, { color: active ? 'white' : t.sub }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PillTabs({ options, value, onChange }) {
  const t = useTheme();
  return (
    <View style={styles.pills}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.pill,
              {
                backgroundColor: active ? palette.forestDeep : t.surface,
                borderColor: active ? palette.forestDeep : t.border,
              },
            ]}
          >
            <Text style={[styles.pillText, { color: active ? 'white' : t.sub }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, loadingLabel, icon }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.primaryBtn, { opacity: disabled ? 0.45 : 1 }]}
    >
      {icon ? <Ionicons name={icon} size={18} color="white" /> : null}
      <Text style={styles.primaryBtnText}>{loadingLabel || label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontWeight: '800', letterSpacing: -0.4 },
  brandSub: { fontWeight: '700', letterSpacing: 0.4, marginTop: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  right: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.bad,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: 'center',
  },
  segmentText: { fontSize: 14, fontWeight: '700' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 13, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: palette.forestGreen,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
});
