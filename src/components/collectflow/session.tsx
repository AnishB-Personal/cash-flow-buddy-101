import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import type { Role } from '@/data/records';
import { createDemoAdapter, readDemoSnapshot, type DemoSnapshot, type ScenarioId, type DemoReview, type DemoResult } from '@/data/demo';
type Session = { role: Role; setRole: (value: Role) => void; fy: string; setFy: (value: string) => void; scenario: ScenarioId; selectScenario: (value: ScenarioId) => void; demo: DemoSnapshot; revision: number; resetDemo: () => void; confirmDemo: (review: DemoReview) => Promise<DemoResult> };
const SessionContext = createContext<Session | null>(null);
export function MockSessionProvider({ children }: { children: ReactNode }) {
 const [role,setRole] = useState<Role>('finance');const [fy,setFy] = useState('FY 2026-27');
 const [scenario,setScenario] = useState<ScenarioId>('baseline');
 const [demo,setDemo] = useState(readDemoSnapshot);
 const [revision,setRevision] = useState(0);
 const adapter = useRef(createDemoAdapter());
 const current = useRef({role,fy,scenario,revision}); current.current = {role,fy,scenario,revision};
 function selectScenario(value: ScenarioId) { adapter.current.reset();setScenario(value);setDemo(readDemoSnapshot());setRevision(value=>value+1); }
 function resetDemo() { selectScenario('baseline');setFy('FY 2026-27'); }
 async function confirmDemo(review: DemoReview) {
  const context = current.current;
  const result = await adapter.current.confirm(review, context.role, context.fy, context.scenario);
  if (current.current.revision !== context.revision || current.current.role !== context.role || current.current.fy !== context.fy) return {status:'stale' as const,message:'Context changed. Review again.',snapshot:readDemoSnapshot()};
  if (result.status === 'success') {setDemo(result.snapshot);setRevision(value=>value+1);}
  return result;
 }
 return <SessionContext.Provider value={{role,setRole,fy,setFy,scenario,selectScenario,demo,revision,resetDemo,confirmDemo}}>{children}</SessionContext.Provider>;
}
export function useMockSession() {const session = useContext(SessionContext);if(!session) throw new Error('Mock session provider is required');return session;}
