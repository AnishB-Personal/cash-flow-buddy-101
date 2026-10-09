import type { Role } from './records';

export type DemoAction = 'read' | 'createOrder' | 'createCustomer' | 'editDocument' | 'convert' | 'payment' | 'cancel' | 'targets' | 'references' | 'manageUsers' | 'export';
export function permits(role: Role, action: DemoAction): boolean {
 if (action === 'read' || action === 'export') return true;
 if (action === 'manageUsers') return role === 'admin';
 if (action === 'createOrder' || action === 'createCustomer') return role !== 'viewer';
 return role === 'admin' || role === 'finance';
}