import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
  const scrollRef = useRef(null);
  const passwordRef = useRef(null);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const canSubmit = useMemo(
    () => username.trim().length > 0 && password.length > 0 && !loading,
    [username, password, loading]
  );

  async function submit() {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setLoading(true);
    try {
      await session.signIn(username, password);
    } catch (e) {
      Alert.alert('Login failed', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function scrollToInput() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }

  return (
    <ImageBackground source={HERO} style={styles.bg} resizeMode="cover">
      <StatusBar style="light" />
      <LinearGradient
        colors={['rgba(8,24,16,0.25)', 'rgba(8,24,16,0.55)', 'rgba(8,22,14,0.92)']}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.inner,
            {
              paddingTop: insets.top + 24,
              paddingBottom: Math.max(insets.bottom, 16) + (showForm ? keyboardHeight : 0) + 16,
              justifyContent: showForm ? 'flex-start' : 'space-between',
            },
          ]}
        >
          <View style={[styles.heroCopy, showForm && styles.heroCopyCompact]}>
            <BrandMark size={showForm ? 56 : 72} />
            <Text style={[styles.brand, showForm && styles.brandCompact]}>
              Smart Monitoring System{'\n'}
              <Text style={{ color: '#B7E4C7', fontSize: showForm ? 16 : 20 }}>
                for Oyster Mushroom Cultivation
              </Text>
            </Text>
            {!showForm && (
              <Text style={styles.tagline}>Healthy Environment.{'\n'}Better Harvests.</Text>
            )}
          </View>

          {showForm ? (
            <View style={styles.card}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                placeholder="admin"
                placeholderTextColor="rgba(22,48,39,0.35)"
                style={styles.input}
                returnKeyType="next"
                blurOnSubmit={false}
                onFocus={scrollToInput}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <Text style={[styles.label, { marginTop: 10 }]}>Password</Text>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                placeholder="••••••••"
                placeholderTextColor="rgba(22,48,39,0.35)"
                style={styles.input}
                returnKeyType="go"
                onFocus={scrollToInput}
                onSubmitEditing={submit}
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
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setShowForm(false);
                }}
                style={{ marginTop: 12, alignItems: 'center' }}
              >
                <Text style={{ color: palette.subtextLight, fontWeight: '700' }}>Back</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ paddingBottom: 12 }}>
              <PrimaryButton label="Get Started" icon="paper-plane" onPress={() => setShowForm(true)} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  flex: { flex: 1 },
  inner: { flexGrow: 1, paddingHorizontal: 24, gap: 20 },
  heroCopy: { alignItems: 'center', gap: 12, marginTop: 24 },
  heroCopyCompact: { marginTop: 8, marginBottom: 4, gap: 8 },
  brand: {
    color: 'white',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
    lineHeight: 32,
  },
  brandCompact: { fontSize: 20, lineHeight: 26 },
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
    width: '100%',
  },
  label: { fontSize: 13, fontWeight: '800', color: palette.subtextLight },
  input: {
    borderWidth: 1,
    borderColor: palette.borderLight,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
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
