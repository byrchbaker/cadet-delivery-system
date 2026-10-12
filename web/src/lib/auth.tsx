import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPermission, isStaff, type HelperPermission, type UserDTO } from '@cds/shared';
import { get, post } from './api';

interface AuthState {
  user: UserDTO | null;
  loading: boolean;
  setUser: (u: UserDTO | null) => void;
  logout: () => Promise<void>;
  can: (perm: HelperPermission) => boolean;
  staff: boolean;
  organizer: boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => get<{ user: UserDTO | null }>('/auth/me'),
    staleTime: 60_000,
  });
  const user = data?.user ?? null;
  const setUser = useCallback((u: UserDTO | null) => qc.setQueryData(['me'], { user: u }), [qc]);
  const logout = useCallback(async () => {
    await post('/auth/logout');
    qc.clear();
    qc.setQueryData(['me'], { user: null });
  }, [qc]);
  const value = useMemo<AuthState>(
    () => ({
      user,
      loading: isLoading,
      setUser,
      logout,
      can: (perm) => hasPermission(user ? { role: user.role, status: user.status, permissions: user.permissions } : null, perm),
      staff: isStaff(user),
      organizer: user?.role === 'organizer',
    }),
    [user, isLoading, setUser, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

export function useUser(): UserDTO {
  const { user } = useAuth();
  if (!user) throw new Error('Signed-in user required');
  return user;
}
