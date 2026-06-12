import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Member } from '../types';
import { initAdmin } from '../api/data';

interface AuthState {
  isLoggedIn: boolean;
  role: 'member' | 'admin' | null;
  token: string | null;
  members: Member[];            // 世帯（同一メールを共有する会員一覧）
  member: Member | null;        // 選択中（アクティブ）の会員
  activeMemberId: string | null;
  login: (token: string, role: 'member' | 'admin', members?: Member[]) => void;
  logout: () => void;
  setActiveMemberId: (id: string) => void;
  setMember: (m: Member) => void;          // アクティブ会員を更新（世帯内を差し替え）
  setHousehold: (members: Member[]) => void; // 世帯一覧を差し替え（退会後など）
}

const AuthContext = createContext<AuthState | null>(null);

function loadStored<T>(key: string, fallback: T): T {
  try {
    const s = sessionStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch { return fallback; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('tsc_token'));
  const [role, setRole] = useState<'member' | 'admin' | null>(
    () => sessionStorage.getItem('tsc_role') as 'member' | 'admin' | null
  );
  const [members, setMembers] = useState<Member[]>(() => loadStored<Member[]>('tsc_members', []));
  const [activeMemberId, setActiveId] = useState<string | null>(
    () => sessionStorage.getItem('tsc_active')
  );

  useEffect(() => { initAdmin(); }, []);

  const persistMembers = (ms: Member[], activeId: string | null) => {
    sessionStorage.setItem('tsc_members', JSON.stringify(ms));
    if (activeId) sessionStorage.setItem('tsc_active', activeId);
    else sessionStorage.removeItem('tsc_active');
  };

  const login = (t: string, r: 'member' | 'admin', ms: Member[] = []) => {
    setToken(t);
    setRole(r);
    setMembers(ms);
    const activeId = ms[0]?.id ?? null;
    setActiveId(activeId);
    sessionStorage.setItem('tsc_token', t);
    sessionStorage.setItem('tsc_role', r);
    persistMembers(ms, activeId);
  };

  const logout = () => {
    setToken(null);
    setRole(null);
    setMembers([]);
    setActiveId(null);
    sessionStorage.removeItem('tsc_token');
    sessionStorage.removeItem('tsc_role');
    sessionStorage.removeItem('tsc_members');
    sessionStorage.removeItem('tsc_active');
  };

  const setActiveMemberId = (id: string) => {
    setActiveId(id);
    sessionStorage.setItem('tsc_active', id);
  };

  const setMember = (m: Member) => {
    setMembers(prev => {
      const exists = prev.some(x => x.id === m.id);
      const next = exists ? prev.map(x => (x.id === m.id ? m : x)) : [m];
      persistMembers(next, activeMemberId ?? m.id);
      return next;
    });
    if (!activeMemberId) setActiveMemberId(m.id);
  };

  const setHousehold = (ms: Member[]) => {
    setMembers(ms);
    const activeId = ms.some(m => m.id === activeMemberId) ? activeMemberId : (ms[0]?.id ?? null);
    setActiveId(activeId);
    persistMembers(ms, activeId);
  };

  const member = members.find(m => m.id === activeMemberId) ?? members[0] ?? null;

  return (
    <AuthContext.Provider value={{
      isLoggedIn: !!token,
      role,
      token,
      members,
      member,
      activeMemberId,
      login,
      logout,
      setActiveMemberId,
      setMember,
      setHousehold,
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
