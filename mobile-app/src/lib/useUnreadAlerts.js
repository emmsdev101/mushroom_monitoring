import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { devicePath, useApiValue } from './api';

function keyFor(deviceId) {
  return `mushroomNursery.alertsReadKeys.${deviceId || 'unknown'}`;
}

export function useUnreadAlerts(deviceId) {
  const alerts = useApiValue(deviceId ? devicePath(deviceId, 'alerts') : null, { intervalMs: 10000 });
  const [readKeys, setReadKeys] = useState({});

  useEffect(() => {
    if (!deviceId) return;
    AsyncStorage.getItem(keyFor(deviceId)).then((v) => {
      if (!v) return setReadKeys({});
      try {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === 'object') setReadKeys(parsed);
        else setReadKeys({});
      } catch {
        setReadKeys({});
      }
    });
  }, [deviceId]);

  const unreadCount = useMemo(() => {
    const v = alerts.value;
    if (!v || typeof v !== 'object') return 0;
    let count = 0;
    Object.keys(v).forEach((k) => {
      if (!k) return;
      if (readKeys && readKeys[k]) return;
      count += 1;
    });
    return count;
  }, [alerts.value, readKeys]);

  const markAllRead = useCallback(async () => {
    const v = alerts.value;
    if (!v || typeof v !== 'object') return;
    const next = {};
    Object.keys(v).forEach((k) => {
      next[k] = true;
    });
    setReadKeys(next);
    if (deviceId) await AsyncStorage.setItem(keyFor(deviceId), JSON.stringify(next));
  }, [alerts.value, deviceId]);

  const markRead = useCallback(
    async (alertKey) => {
      if (!alertKey) return;
      if (readKeys && readKeys[alertKey]) return;
      const next = { ...(readKeys || {}), [alertKey]: true };
      setReadKeys(next);
      if (deviceId) await AsyncStorage.setItem(keyFor(deviceId), JSON.stringify(next));
    },
    [deviceId, readKeys]
  );

  return {
    alerts,
    unreadCount,
    readKeys,
    markRead,
    markAllRead,
  };
}

