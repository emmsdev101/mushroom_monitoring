import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark, PrimaryButton } from '../components/ui';
import { palette } from '../theme/palette';

const HERO = require('../../assets/hero-mushrooms.png');

export default function LoginScreen({ session }) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const canSubmit = useMemo(
    () => username.trim().length > 0 && password.length > 0 && !loading,
    [username, password, loading]
  );

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await session.signIn(username, password);
    } catch (e) {
      Alert.alert('Login failed', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ImageBackground source={HERO} style={styles.bg} resizeMode="cover">
      <StatusBar style="light" />
      <LinearGradient
        colors={['rgba(8,24,16,0.25)', 'rgba(8,24,16,0.55)', 'rgba(8,22,14,0.92)']}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.inner, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.heroCopy}>
          <BrandMark size={72} />
          <Text style={styles.brand}>
            Kabutech{'\n'}
            <Text style={{ color: '#B7E4C7' }}>Monitoring</Text>
          </Text>
          <Text style={styles.tagline}>Healthy Environment.{'\n'}Better Harvests.</Text>
        </View>

        {showForm ? (
          <View style={styles.card}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="admin"
              placeholderTextColor="rgba(22,48,39,0.35)"
              style={styles.input}
            />
            <Text style={[styles.label, { marginTop: 10 }]}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="rgba(22,48,39,0.35)"
              style={styles.input}
            />
            <View style={{ marginTop: 16 }}>
              {loading ? (
                <View style={styles.loadingBtn}>
                  <ActivityIndicator color="white" />
                </View>
              ) : (
                <PrimaryButton label="Sign in" onPress={submit} disabled={!canSubmit} />
              )}
            </View>
            <Pressable onPress={() => setShowForm(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: palette.subtextLight, fontWeight: '700' }}>Back</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 12, paddingBottom: 12 }}>
            <PrimaryButton label="Get Started" icon="paper-plane" onPress={() => setShowForm(true)} />
          </View>
        )}
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  inner: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 24 },
  heroCopy: { alignItems: 'center', gap: 12, marginTop: 24 },
  brand: { color: 'white', fontSize: 32, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center', lineHeight: 38 },
  tagline: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '600',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    padding: 18,
  },
  label: { fontSize: 13, fontWeight: '800', color: palette.subtextLight },
  input: {
    borderWidth: 1,
    borderColor: palette.borderLight,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    fontWeight: '600',
    color: palette.textLight,
    marginTop: 6,
    backgroundColor: '#F7FBF8',
  },
  loadingBtn: {
    backgroundColor: palette.forestGreen,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
