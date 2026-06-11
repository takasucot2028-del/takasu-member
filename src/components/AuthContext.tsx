import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Member } from '../types';
import { initAdmin } from '../api/data';

interface AuthState {
  isLoggedIn: boolean;
  role: 'member' | 'admin' | null;
  token: string | null;
  member: Member | null;
  login: (token: string, role: 'member' | 'admin', member?: Member) => void;
  logout: () => void;
  setMember: (m: Member) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('tsc_token'));
  const [role, setRole] = useState<'member' | 'admin' | null>(
    () => sessionStorage.getItem('tsc_role') as 'member' | 'admin' | null
  );
  const [member, setMember] = useState<Member | null>(() => {
    try {
      const s = sessionStorage.getItem('tsc_member');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });

  useEffect(() => { initAdmin(); }, []);

  const login = (t: string, r: 'member' | 'admin', m?: Member) => {
    setToken(t);
    setRole(r);
    if (m) setMember(m);
    sessionStorage.setItem('tsc_token', t);
    sessionStorage.setItem('tsc_role', r);
    if (m) sessionStorage.setItem('tsc_member', JSON.stringify(m));
  };

  const logout = () => {
    setToken(null);
    setRole(null);
    setMember(null);
    sessionStorage.removeItem('tsc_token');
    sessionStorage.removeItem('tsc_role');
    sessionStorage.removeItem('tsc_member');
  };

  const updateMember = (m: Member) => {
    setMember(m);
    sessionStorage.setItem('tsc_member', JSON.stringify(m));
  };

  return (
    <AuthContext.Provider value={{
      isLoggedIn: !!token,
      role,
      token,
      member,
      login,
      logout,
      setMember: updateMember,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
