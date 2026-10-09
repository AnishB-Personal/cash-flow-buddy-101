import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MockSessionProvider, useMockSession } from '@/components/collectflow/session';
import { Workspace } from '@/components/collectflow/workspace';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

function RoleSwitcher() {
  const session = useMockSession();
  return (
    <div data-testid="test-controls">
      <button onClick={() => session.setRole('sales')}>Switch to sales</button>
      <button onClick={() => session.setRole('viewer')}>Switch to viewer</button>
      <button onClick={() => session.setRole('finance')}>Switch to finance</button>
      <button onClick={() => session.setRole('admin')}>Switch to admin</button>
      <output data-testid="orders-count">{session.demo.invoices.length}</output>
      <output data-testid="first-invoice">{session.demo.invoices[0]?.invoice_number}</output>
    </div>
  );
}

function mount(page: 'Orders' | 'Invoices' | 'Dashboard' = 'Orders') {
  return render(
    <MockSessionProvider>
      <Workspace initial={page} />
      <RoleSwitcher />
    </MockSessionProvider>
  );
}

describe('Stage 2 Orders & Invoices UI Workflows', () => {
  it('renders New Order button for finance/sales but hides it for viewer', () => {
    mount('Orders');
    expect(screen.getByRole('button', { name: 'New Order' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to viewer' }));
    expect(screen.queryByRole('button', { name: 'New Order' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to sales' }));
    expect(screen.getByRole('button', { name: 'New Order' })).toBeInTheDocument();
  });

  it('runs complete order creation workflow, updates orders table, and resets to baseline', async () => {
    mount('Orders');
    fireEvent.click(screen.getByRole('button', { name: 'New Order' }));

    // Modal opens
    await screen.findByRole('dialog');
    expect(screen.getByText('Create Purchase Order')).toBeInTheDocument();

    // Use verified example
    fireEvent.click(screen.getByRole('button', { name: 'Use verified example' }));
    expect(screen.getByDisplayValue('PO-2026-DEMO-001')).toBeInTheDocument();

    // Review step
    fireEvent.click(screen.getByRole('button', { name: /Review changes/i }));
    await screen.findByText('Intended document change');
    expect(screen.getAllByText(/PO-2026-DEMO-001/).length).toBeGreaterThan(0);
    expect(screen.getByText('Financial review & impact')).toBeInTheDocument();

    // Confirm step
    fireEvent.click(screen.getByRole('button', { name: 'Continue to confirmation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm create purchase order' }));

    // Result step
    await screen.findByText('Demo result');
    fireEvent.click(screen.getByRole('button', { name: 'Return to workspace' }));

    // Verify record appears in orders table
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByText('PO-2026-DEMO-001').length).toBeGreaterThan(0);
    expect(screen.getByTestId('orders-count')).toHaveTextContent('3');

    // Reset Demo restores baseline
    fireEvent.click(screen.getByRole('button', { name: 'Reset Demo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore baseline' }));
    expect(screen.queryByText('PO-2026-DEMO-001')).not.toBeInTheDocument();
    expect(screen.getByTestId('orders-count')).toHaveTextContent('2');
  });

  it('runs convert-to-invoice workflow on Order 102 and converts it to issued invoice', async () => {
    mount('Orders');

    // Click on PO-NEXUS-881 to open record drawer
    const openBtn = screen.getAllByRole('button', { name: 'PO-NEXUS-881' })[0];
    if (!openBtn) throw new Error('Missing PO button');
    fireEvent.click(openBtn);
    await screen.findByText('ORDER DETAILS');

    // Click Convert to Invoice inside drawer
    fireEvent.click(screen.getByRole('button', { name: 'Convert to Invoice' }));
    await screen.findByText('Conversion to commercial invoice');

    // Use verified example
    fireEvent.click(screen.getByRole('button', { name: 'Use verified example' }));
    expect(screen.getByDisplayValue('INV-2026-045')).toBeInTheDocument();

    // Review step
    fireEvent.click(screen.getByRole('button', { name: /Review changes/i }));
    await screen.findByText('Intended document change');
    expect(screen.getAllByText('INV-2026-045').length).toBeGreaterThan(0);

    // Confirm step
    fireEvent.click(screen.getByRole('button', { name: 'Continue to confirmation' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm convert/i }));

    // Result step
    const returnBtn = await screen.findByRole('button', { name: 'Return to workspace' });
    fireEvent.click(returnBtn);

    // Close record drawer
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Reset Demo
    fireEvent.click(screen.getByRole('button', { name: 'Reset Demo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore baseline' }));
  });

  it('displays unsaved discard warning on close and restores focus', async () => {
    mount('Orders');
    const trigger = screen.getByRole('button', { name: 'New Order' });
    trigger.focus();
    fireEvent.click(trigger);

    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('PO number'), { target: { value: 'PO-UNSAVED' } });

    // Click close
    fireEvent.click(screen.getByRole('button', { name: 'Close order workflow' }));
    expect(screen.getByText('Discard unsaved order inputs?')).toBeInTheDocument();

    // Keep editing
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('PO number')).toHaveValue('PO-UNSAVED');

    // Discard
    fireEvent.click(screen.getByRole('button', { name: 'Close order workflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard inputs' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('renders review-only when custom unverified inputs are submitted', async () => {
    mount('Orders');
    fireEvent.click(screen.getByRole('button', { name: 'New Order' }));
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Use verified example' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Custom unverified services' } });

    fireEvent.click(screen.getByRole('button', { name: /Review changes/i }));
    await screen.findByText(/Review only: custom inputs have no verified scenario outcome/i);

    // Confirmation button is not available
    expect(screen.queryByRole('button', { name: 'Continue to confirmation' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close order workflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard inputs' }));
  });

  it('runs edit order workflow, displays previous and new values in Review and Confirm steps, and updates order state', async () => {
    mount('Orders');

    // Open unbilled order PO-NEXUS-881 (Order 102) drawer
    const openBtn = screen.getAllByRole('button', { name: 'PO-NEXUS-881' })[0];
    if (!openBtn) throw new Error('Missing PO button');
    fireEvent.click(openBtn);
    await screen.findByText('ORDER DETAILS');

    // Click Edit Order to open the modal
    fireEvent.click(screen.getByRole('button', { name: 'Edit Order' }));
    await screen.findByRole('dialog');
    expect(screen.getByText('Order metadata')).toBeInTheDocument();

    // Modify editable fields: PO date, due date, account executive, line-item description, remarks
    fireEvent.change(screen.getByLabelText('PO date'), { target: { value: '2026-04-18' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-05-30' } });
    fireEvent.change(screen.getByLabelText('Account executive'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Line-item description'), {
      target: { value: 'DevOps Pipeline & Multi-Cloud Setup' },
    });
    fireEvent.change(screen.getByLabelText('Remarks'), {
      target: { value: 'Client kickoff revised and approved' },
    });

    // Review step
    fireEvent.click(screen.getByRole('button', { name: /Review changes/i }));
    await screen.findByText('Planned field changes');

    // Verify .cf-change-list and .cf-change-row with previous and current values
    const changeList = document.querySelector('.cf-change-list') as HTMLElement;
    expect(changeList).toBeInTheDocument();
    const listScope = within(changeList);

    const changeRows = document.querySelectorAll('.cf-change-row');
    expect(changeRows.length).toBe(5);

    expect(listScope.getByText('14 Apr 2026')).toHaveClass('cf-change-prev');
    expect(listScope.getByText('18 Apr 2026')).toHaveClass('cf-change-curr');

    expect(listScope.getByText('30 May 2026')).toHaveClass('cf-change-curr');

    expect(listScope.getByText('Kavya Nair')).toHaveClass('cf-change-prev');
    expect(listScope.getByText('Neha Rao')).toHaveClass('cf-change-curr');

    expect(listScope.getByText('DevOps Pipeline Implementation')).toHaveClass('cf-change-prev');
    expect(listScope.getByText('DevOps Pipeline & Multi-Cloud Setup')).toHaveClass('cf-change-curr');

    expect(listScope.getByText('Pending project kickoff')).toHaveClass('cf-change-prev');
    expect(listScope.getByText('Client kickoff revised and approved')).toHaveClass('cf-change-curr');

    // Confirm step
    fireEvent.click(screen.getByRole('button', { name: 'Continue to confirmation' }));
    await screen.findByText('Confirmed field change set');

    // Verify Confirmation step renders identical change set
    const confirmChangeList = document.querySelector('.cf-change-list') as HTMLElement;
    expect(confirmChangeList).toBeInTheDocument();
    const confirmScope = within(confirmChangeList);

    const confirmRows = document.querySelectorAll('.cf-change-row');
    expect(confirmRows.length).toBe(5);
    expect(confirmScope.getByText('14 Apr 2026')).toHaveClass('cf-change-prev');
    expect(confirmScope.getByText('18 Apr 2026')).toHaveClass('cf-change-curr');
    expect(confirmScope.getByText('Kavya Nair')).toHaveClass('cf-change-prev');
    expect(confirmScope.getByText('Neha Rao')).toHaveClass('cf-change-curr');

    // Apply confirmation
    fireEvent.click(screen.getByRole('button', { name: 'Confirm edit order' }));

    // Result step
    await screen.findByText('Demo result');
    fireEvent.click(screen.getByRole('button', { name: 'Return to workspace' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Reset Demo
    fireEvent.click(screen.getByRole('button', { name: 'Reset Demo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore baseline' }));
  });
});
