// ============================================================
//  Happy Man Academy — React app context
// ============================================================
import { createContext, useContext, useState, useCallback } from 'react';
import { getCurrentUser } from '../state.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // currentUser lives in state.js (_currentUser module var).
  // We snapshot it at mount time; consumers call refresh()
  // after login/logout to re-read it.
  const [user, setUser] = useState(() => getCurrentUser());
  const refresh = useCallback(() => setUser(getCurrentUser()), []);
  return (
    <AppContext.Provider value={{ user, refresh }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
