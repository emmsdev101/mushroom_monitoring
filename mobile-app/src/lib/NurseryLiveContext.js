import { createContext, useContext } from 'react';
import { useNurseryLive } from './useNurseryLive';

const NurseryLiveContext = createContext(null);

export function NurseryLiveProvider({ deviceId, children }) {
  const value = useNurseryLive(deviceId);
  return <NurseryLiveContext.Provider value={value}>{children}</NurseryLiveContext.Provider>;
}

export function useSharedNurseryLive() {
  const ctx = useContext(NurseryLiveContext);
  if (!ctx) {
    throw new Error('useSharedNurseryLive must be used inside NurseryLiveProvider');
  }
  return ctx;
}
