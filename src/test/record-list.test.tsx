import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordList } from '@/components/collectflow/record-list';
const props = { fy:'FY 2026-27',role:'finance' as const,bucket:null,clearBucket:vi.fn(),open:vi.fn(),unavailable:vi.fn() };
afterEach(cleanup);
describe('document table interactions',()=>{
 it('filters orders locally and clears filters',()=>{
 render(<RecordList {...props} screen="Orders"/>);
 fireEvent.change(screen.getByRole('textbox',{name:'Search orders'}),{target:{value:'Nexus'}});
 expect(screen.queryByText('PO-CORP-2026-099')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Reset filters'}));
 expect(screen.getAllByText('PO-CORP-2026-099').length).toBeGreaterThan(0);
 });
 it('shows invoice details but never unbilled orders in invoice tables',()=>{
 render(<RecordList {...props} screen="Invoices"/>);
 expect(screen.queryByText('PO-NEXUS-881')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'View INV-2026-042'}));
 expect(props.open).toHaveBeenCalledWith(expect.objectContaining({id:101}),'invoice');
 });
 it('sorts and provides actionable contextual menus',()=>{
 render(<RecordList {...props} screen="Orders"/>);
 fireEvent.click(screen.getByRole('button',{name:'Order Value'}));
 const action = screen.getAllByRole('button',{name:'Actions for PO-NEXUS-881'})[0];
 if(!action) throw new Error('Missing row action');
 fireEvent.click(action);
 expect(screen.getAllByRole('button',{name:'Convert to Invoice · Unavailable'}).length).toBeGreaterThan(0);
 });
});
