import fixtures from './collectflow.json';
export const data = fixtures;
export type Invoice = typeof fixtures.invoices[number];
export type Design = 'A' | 'B' | 'C';
export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value);
export const exactMoney = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value);
export const designs = { A: { name: 'Precision Enterprise', subtitle: 'Clarity. Control. Confidence.' }, B: { name: 'Calm Modern SaaS', subtitle: 'A clearer view of your business.' }, C: { name: 'Premium Analytics', subtitle: 'Financial intelligence, in focus.' } };
export const aging = ['Current / Not Due', '1–30 days', '31–60 days', '61–90 days', '91–180 days', '180+ days'].map((bucket, i) => ({ bucket, amount: i === 0 ? (fixtures.dashboard_summary.aging[0]?.amount ?? 0) : 0 }));
