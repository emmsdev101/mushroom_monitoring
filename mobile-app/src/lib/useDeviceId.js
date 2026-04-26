import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'mushroomNursery.deviceId';

export function useDeviceId() {
  const [deviceId, setDeviceId] = useState('nursery-01');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v) setDeviceId(v);
      })
      .finally(() => setLoading(false));
  }, []);

  const saveDeviceId = useCallback(async (next) => {
    setDeviceId(next);
    await AsyncStorage.setItem(KEY, next);
  }, []);

  return { deviceId, setDeviceId: saveDeviceId, loading };
}

