import { useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from 'react-native';

import { useDeviceId } from './src/lib/useDeviceId';
import { registerForPushNotificationsAsync } from './src/lib/pushNotifications';
import { useUnreadAlerts } from './src/lib/useUnreadAlerts';
import DashboardScreen from './src/screens/DashboardScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { palette } from './src/theme/palette';
import LoginScreen from './src/screens/LoginScreen';
import { useLocalSession } from './src/lib/localAuth';

const Tab = createBottomTabNavigator();

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

export default function App() {
  const scheme = useColorScheme();
  const deviceIdState = useDeviceId();
  const unread = useUnreadAlerts(deviceIdState.deviceId);
  const session = useLocalSession();

  useEffect(() => {
    if (!deviceIdState.deviceId) return;
    registerForPushNotificationsAsync(deviceIdState.deviceId).catch(() => {
      // ignore; user may deny permissions
    });
  }, [deviceIdState.deviceId]);

  const theme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return buildTheme(base);
  }, [scheme]);

  return (
    <NavigationContainer theme={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {session.loading || !session.signedIn ? (
        <LoginScreen />
      ) : (
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: true,
          tabBarActiveTintColor: palette.forestGreen,
          tabBarInactiveTintColor: scheme === 'dark' ? palette.subtextDark : palette.subtextLight,
          tabBarBadge:
            route.name === 'Notifications' && unread.unreadCount > 0 ? unread.unreadCount : undefined,
          tabBarIcon: ({ color, size, focused }) => {
            let iconName = 'ellipse';
            if (route.name === 'Dashboard') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'History') {
              iconName = focused ? 'time' : 'time-outline';
            } else if (route.name === 'Notifications') {
              iconName = focused ? 'notifications' : 'notifications-outline';
            } else if (route.name === 'Settings') {
              iconName = focused ? 'settings' : 'settings-outline';
            }
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Dashboard">
          {() => <DashboardScreen deviceId={deviceIdState.deviceId} />}
        </Tab.Screen>
        <Tab.Screen name="History">
          {() => <HistoryScreen deviceId={deviceIdState.deviceId} />}
        </Tab.Screen>
        <Tab.Screen name="Notifications">
          {() => (
            <NotificationsScreen
              deviceId={deviceIdState.deviceId}
              unreadCount={unread.unreadCount}
              readKeys={unread.readKeys}
              markRead={unread.markRead}
              markAllRead={unread.markAllRead}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Settings">
          {() => <SettingsScreen deviceIdState={deviceIdState} onSignOut={session.signOut} />}
        </Tab.Screen>
      </Tab.Navigator>
      )}
    </NavigationContainer>
  );
}

