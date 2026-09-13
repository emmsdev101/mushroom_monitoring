import { useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useDeviceId } from './src/lib/useDeviceId';
import { registerForPushNotificationsAsync } from './src/lib/pushNotifications';
import { useUnreadAlerts } from './src/lib/useUnreadAlerts';
import HomeScreen from './src/screens/HomeScreen';
import ControlScreen from './src/screens/ControlScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LoginScreen from './src/screens/LoginScreen';
import { useLocalSession } from './src/lib/localAuth';
import { NurseryLiveProvider } from './src/lib/NurseryLiveContext';
import { palette } from './src/theme/palette';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function buildTheme(base) {
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.forestGreen,
      card: base.dark ? palette.surfaceDark : palette.surfaceLight,
      background: base.dark ? palette.bgDark : palette.bgLight,
      text: base.dark ? palette.textDark : palette.textLight,
      border: base.dark ? palette.borderDark : palette.borderLight,
    },
  };
}

function MainTabs({ deviceIdState, unread, session }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <NurseryLiveProvider deviceId={deviceIdState.deviceId}>
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.forestDeep,
        tabBarInactiveTintColor: isDark ? palette.subtextDark : palette.subtextLight,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: isDark ? palette.surfaceDark : '#FFFFFF',
          borderTopColor: isDark ? palette.borderDark : palette.borderLight,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const icons = {
            Home: focused ? 'home' : 'home-outline',
            Control: focused ? 'options' : 'options-outline',
            History: focused ? 'stats-chart' : 'stats-chart-outline',
            Settings: focused ? 'settings' : 'settings-outline',
          };
          return <Ionicons name={icons[route.name] || 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home">
        {() => <HomeScreen deviceId={deviceIdState.deviceId} unreadCount={unread.unreadCount} />}
      </Tab.Screen>
      <Tab.Screen name="Control">
        {() => <ControlScreen deviceId={deviceIdState.deviceId} />}
      </Tab.Screen>
      <Tab.Screen name="History">
        {() => <HistoryScreen deviceId={deviceIdState.deviceId} />}
      </Tab.Screen>
      <Tab.Screen name="Settings">
        {() => <SettingsScreen deviceIdState={deviceIdState} onSignOut={session.signOut} />}
      </Tab.Screen>
    </Tab.Navigator>
    </NurseryLiveProvider>
  );
}

export default function App() {
  const scheme = useColorScheme();
  const deviceIdState = useDeviceId();
  const unread = useUnreadAlerts(deviceIdState.deviceId);
  const session = useLocalSession();

  useEffect(() => {
    if (!deviceIdState.deviceId) return;
    registerForPushNotificationsAsync(deviceIdState.deviceId).catch(() => {});
  }, [deviceIdState.deviceId]);

  const theme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return buildTheme(base);
  }, [scheme]);

  return (
    <SafeAreaProvider>
    <NavigationContainer theme={theme}>
      <StatusBar style={!session.signedIn || scheme === 'dark' ? 'light' : 'dark'} />
      {session.loading || !session.signedIn ? (
        <LoginScreen session={session} />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main">
            {() => <MainTabs deviceIdState={deviceIdState} unread={unread} session={session} />}
          </Stack.Screen>
          <Stack.Screen name="Alerts" options={{ animation: 'slide_from_right' }}>
            {() => (
              <NotificationsScreen
                deviceId={deviceIdState.deviceId}
                unreadCount={unread.unreadCount}
                readKeys={unread.readKeys}
                markRead={unread.markRead}
                markAllRead={unread.markAllRead}
              />
            )}
          </Stack.Screen>
        </Stack.Navigator>
      )}
    </NavigationContainer>
    </SafeAreaProvider>
  );
}
