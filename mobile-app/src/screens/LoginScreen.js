import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useLocalSession } from '../lib/localAuth';
import { palette } from '../theme/palette';

export default function LoginScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const bg = isDark ? palette.bgDark : palette.bgLight;
  const surface = isDark ? palette.surfaceDark : palette.surfaceLight;
  const text = isDark ? palette.textDark : palette.textLight;
  const sub = isDark ? palette.subtextDark : palette.subtextLight;
  const border = isDark ? palette.borderDark : palette.borderLight;

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const session = useLocalSession();

  const canSubmit = useMemo(() => username.trim().length > 0 && password.length > 0 && !loading, [username, password, loading]);

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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Text style={[styles.h1, { color: text }]}>Mushroom Nursery</Text>
        <Text style={[styles.p, { color: sub }]}>Admin login</Text>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.label, { color: sub }]}>Username</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="admin"
            placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
            style={[styles.input, { color: text, borderColor: border }]}
          />

          <Text style={[styles.label, { color: sub, marginTop: 10 }]}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={isDark ? 'rgba(231,239,233,0.35)' : 'rgba(17,24,21,0.35)'}
            style={[styles.input, { color: text, borderColor: border }]}
          />

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={[
              styles.btn,
              { backgroundColor: canSubmit ? palette.forestGreen : 'rgba(127,127,127,0.3)', opacity: loading ? 0.8 : 1 },
            ]}
          >
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Sign in</Text>}
          </Pressable>

          <Text style={[styles.help, { color: sub }]}>
            Default login: username `admin`, password `admin`. Change it in Settings after you sign in.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center', gap: 10 },
  h1: { fontSize: 30, fontWeight: '900', letterSpacing: -0.6 },
  p: { marginTop: -8, fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  label: { fontSize: 13, fontWeight: '800' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 6,
  },
  btn: { marginTop: 14, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '900' },
  help: { marginTop: 12, fontSize: 12 },
});

