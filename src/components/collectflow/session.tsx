import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import type { Role } from '@/data/records';
import { createDemoAdapter, readDemoSnapshot, type DemoSnapshot, type ScenarioId, type DemoReview, type DemoResult } from '@/data/demo';
import { readReferences, createReferenceAdapter, type References, type ReferenceReview } from '@/data/references';
import { createOrderAdapter, type OrderReview } from '@/data/orders';

type Session = {
  role: Role;
  setRole: (value: Role) => void;
  fy: string;
  setFy: (value: string) => void;
  scenario: ScenarioId;
  selectScenario: (value: ScenarioId) => void;
  demo: DemoSnapshot;
  revision: number;
  resetDemo: () => void;
  confirmDemo: (review: DemoReview) => Promise<DemoResult>;
  references: References;
  confirmReference: (review: ReferenceReview) => Promise<void>;
  confirmOrder: (review: OrderReview) => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function MockSessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('finance');
  const [fy, setFy] = useState('FY 2026-27');
  const [scenario, setScenario] = useState<ScenarioId>('baseline');
  const [demo, setDemo] = useState(readDemoSnapshot);
  const [revision, setRevision] = useState(0);
  const adapter = useRef(createDemoAdapter());
  const [references, setReferences] = useState(readReferences);
  const referenceAdapter = useRef(createReferenceAdapter());
  const orderAdapter = useRef(createOrderAdapter());

  const current = useRef({ role, fy, scenario, revision, references });
  current.current = { role, fy, scenario, revision, references };

  function selectScenario(value: ScenarioId) {
    adapter.current.reset();
    referenceAdapter.current.reset();
    orderAdapter.current.reset();
    const restored = readReferences();
    current.current = { ...current.current, scenario: value, references: restored, revision: current.current.revision + 1 };
    setReferences(restored);
    setScenario(value);
    setDemo(readDemoSnapshot());
    setRevision(val => val + 1);
    if (!restored.years.some(year => year.code === fy)) setFy('FY 2026-27');
  }

  function resetDemo() {
    selectScenario('baseline');
    setFy('FY 2026-27');
  }

  async function confirmDemo(review: DemoReview) {
    const context = current.current;
    const result = await adapter.current.confirm(review, context.role, context.fy, context.scenario);
    if (current.current.revision !== context.revision || current.current.role !== context.role || current.current.fy !== context.fy) {
      return { status: 'stale' as const, message: 'Context changed. Review again.', snapshot: readDemoSnapshot() };
    }
    if (result.status === 'success') {
      setDemo(result.snapshot);
      setRevision(val => val + 1);
    }
    return result;
  }

  async function confirmReference(review: ReferenceReview) {
    const context = current.current;
    const result = await referenceAdapter.current.confirm(review, context.role, context.references);
    if (current.current.revision !== context.revision || current.current.role !== context.role || current.current.fy !== context.fy) {
      throw new Error('Context changed. No changes applied.');
    }
    current.current = { ...context, references: result, revision: context.revision + 1 };
    setReferences(result);
    setRevision(val => val + 1);
    if (!result.years.some(year => year.code === context.fy)) setFy(result.years[0]?.code ?? 'FY 2026-27');
  }

  async function confirmOrder(review: OrderReview) {
    const context = current.current;
    const result = await orderAdapter.current.confirm(review, context.role, demo.invoices, context.references, context.fy);
    if (current.current.revision !== context.revision || current.current.role !== context.role || current.current.fy !== context.fy) {
      throw new Error('Context changed. No changes applied.');
    }
    const nextDemo = { ...demo, invoices: result };
    current.current = { ...context, revision: context.revision + 1 };
    setDemo(nextDemo);
    setRevision(val => val + 1);
  }

  return (
    <SessionContext.Provider
      value={{
        role,
        setRole,
        fy,
        setFy,
        scenario,
        selectScenario,
        demo,
        revision,
        resetDemo,
        confirmDemo,
        references,
        confirmReference,
        confirmOrder,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useMockSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Mock session provider is required');
  return session;
}
