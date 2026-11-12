import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api.js';

// The sidebar pages the signed-in user may open, from the server. Null while they load.
interface MenuAccessValue {
  routes: string[] | null;
}

const MenuAccessContext = createContext<MenuAccessValue>({ routes: null });

export function MenuAccessProvider({ children }: { children: ReactNode }) {
  const [routes, setRoutes] = useState<string[] | null>(null);

  useEffect(() => {
    // If the list cannot be read, the user sees no pages rather than pages they should not open.
    api.get<{ routes: string[] }>('/menu-access/me').then((r) => setRoutes(r.routes)).catch(() => setRoutes([]));
  }, []);

  return <MenuAccessContext.Provider value={{ routes }}>{children}</MenuAccessContext.Provider>;
}

export function useMenuAccess(): MenuAccessValue {
  return useContext(MenuAccessContext);
}
