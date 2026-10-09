import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Role } from '@/data/records';
const SessionContext = createContext<{ role: Role; setRole: (value: Role) => void; fy: string; setFy: (value: string) => void } | null>(null);
export function MockSessionProvider({ children }: { children: ReactNode }) {
 const [role,setRole] = useState<Role>('finance');const [fy,setFy] = useState('FY 2026-27');
 return <SessionContext.Provider value={{role,setRole,fy,setFy}}>{children}</SessionContext.Provider>;
}
export function useMockSession() {const session = useContext(SessionContext);if(!session) throw new Error('Mock session provider is required');return session;}
