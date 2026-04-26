import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { devicePath, rtdbSet } from './rtdb';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function tokenKey(token) {
  // RTDB keys can't contain . # $ [ ] / so replace them.
  return String(token).replace(/[.#$\[\]\/]/g, '_');
}

export async function registerForPushNotificationsAsync(deviceId) {
  if (!deviceId) return null;

  // Expo Go on Android does NOT support remote push tokens (SDK 53+).
  // Local notifications still work, but getExpoPushTokenAsync will throw.
  if (Platform.OS === 'android' && Constants.appOwnership === 'expo') {
    return null;
  }

  const perms = await Notifications.getPermissionsAsync();
  let status = perms.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') {
    return null;
  }

  // Android: set a default channel (must exist before token on Android 13+).
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const tokenRes = await Notifications.getExpoPushTokenAsync();
  const token = tokenRes?.data;
  if (!token) return null;

  const key = tokenKey(token);
  await rtdbSet(devicePath(deviceId, `pushTokens/${key}`), {
    token,
    platform: Platform.OS,
    updatedAtMs: Date.now(),
  });

  return token;
}

