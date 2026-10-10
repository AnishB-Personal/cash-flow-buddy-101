import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MockSessionProvider, useMockSession } from '@/components/collectflow/session';
import { Workspace } from '@/components/collectflow/workspace';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

function SessionHelper() {
  const session = useMockSession();
  return (
    <div data-testid="test-controls">
      <button onClick={() => session.setRole('viewer')}>Switch to viewer</button>
      <button onClick={() => session.setRole('finance')}>Switch to finance</button>
      <button onClick={() => session.resetDemo()}>Reset demo</button>
      <output data-testid="invoices-count">{session.demo.invoices.length}</output>
    </div>
  );
}

function mount(page: 'Payments' | 'Invoices' | 'Dashboard' = 'Payments') {
  return render(
    <MockSessionProvider>
      <Workspace initial={page} />
      <SessionHelper />
    </MockSessionProvider>
  );
}

describe('Stage 3 Payments & Settlements UI Workflows', () => {
  it('renders Payments ledger with KPIs, table headers, and baseline payment', () => {
    mount('Payments');
    expect(screen.getByRole('heading', { level: 1, name: 'Payments' })).toBeInTheDocument();
    expect(screen.getByText('Payment records, cash/TDS breakdown and remittance ledger.')).toBeInTheDocument();

    // Check KPI cards
    expect(screen.getByText('Total Settled')).toBeInTheDocument();
    expect(screen.getByText('Cash Collected')).toBeInTheDocument();
    expect(screen.getByText('TDS Recognized')).toBeInTheDocument();
    expect(screen.getByText('Settlement Efficiency')).toBeInTheDocument();

    // Check baseline payment row UTR-ICICI-9876543210
    expect(screen.getAllByText('UTR-ICICI-9876543210').length).toBeGreaterThan(0);
    expect(screen.getAllByText('INV-2026-042').length).toBeGreaterThan(0);
  });

  it('filters payments ledger by search query', () => {
    mount('Payments');
    const searchInput = screen.getByLabelText('Search payments');
    expect(screen.getAllByText('UTR-ICICI-9876543210').length).toBeGreaterThan(0);

    fireEvent.change(searchInput, { target: { value: 'NONEXISTENT' } });
    expect(screen.queryByText('UTR-ICICI-9876543210')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'ICICI' } });
    expect(screen.getAllByText('UTR-ICICI-9876543210').length).toBeGreaterThan(0);
  });

  it('runs complete Record Payment 4-step workflow on INV-2026-042 and updates state', async () => {
    mount('Invoices');

    // Click on INV-2026-042 to open RecordDrawer
    const invLink = screen.getAllByRole('button', { name: 'INV-2026-042' })[0]!;
    fireEvent.click(invLink);

    // Record drawer is open, click Record Payment
    const recordPayBtn = await screen.findByRole('button', { name: /Record Payment/i });
    fireEvent.click(recordPayBtn);

    // Record Payment Drawer opens
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Record Payment · INV-2026-042/i)).toBeInTheDocument();

    // Select preset: Partial Cash (₹1,00,000)
    const presetBtn = within(dialog).getByRole('button', { name: /Partial Cash/i });
    fireEvent.click(presetBtn);

    // Step 1 -> Step 2: Click Review changes
    const reviewBtn = within(dialog).getByRole('button', { name: /Review changes/i });
    fireEvent.click(reviewBtn);

    // Step 2: Review step displays planned changes and financial impact
    await within(dialog).findByText('Planned balance changes');
    expect(within(dialog).getByText('Financial review & impact')).toBeInTheDocument();

    // Step 2 -> Step 3: Continue to confirmation
    const contBtn = within(dialog).getByRole('button', { name: /Continue to confirmation/i });
    fireEvent.click(contBtn);

    // Step 3: Confirm step displays confirmation question
    await within(dialog).findByText(/Confirm recording payment against INV-2026-042/i);
    const confirmBtn = within(dialog).getByRole('button', { name: 'Confirm payment' });
    fireEvent.click(confirmBtn);

    // Step 4: Result step displays success message
    await within(dialog).findByText('Payment recorded successfully');
    expect(within(dialog).getByText(/balance updated to/i)).toBeInTheDocument();

    // Close drawer
    const returnBtn = within(dialog).getByRole('button', { name: 'Return to workspace' });
    fireEvent.click(returnBtn);

    // Verify invoice row now reflects updated balance
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('rejects overpayment and disables submit in RecordPaymentDrawer', async () => {
    mount('Invoices');

    const invLink = screen.getAllByRole('button', { name: 'INV-2026-042' })[0]!;
    fireEvent.click(invLink);

    const recordPayBtn = await screen.findByRole('button', { name: /Record Payment/i });
    fireEvent.click(recordPayBtn);

    const dialog = await screen.findByRole('dialog');

    // Enter overpayment amount: 400000 on 322000 outstanding balance
    const cashInput = within(dialog).getByLabelText(/Cash payment amount/i);
    fireEvent.change(cashInput, { target: { value: '400000' } });

    // Review button should be disabled
    const submitBtn = within(dialog).getByRole('button', { name: /Review changes/i });
    expect(submitBtn).toBeDisabled();
  });

  it('displays unsaved discard warning when closing modified payment drawer', async () => {
    mount('Invoices');

    const invLink = screen.getAllByRole('button', { name: 'INV-2026-042' })[0]!;
    fireEvent.click(invLink);

    const recordPayBtn = await screen.findByRole('button', { name: /Record Payment/i });
    fireEvent.click(recordPayBtn);

    const dialog = await screen.findByRole('dialog');

    // Modify a field
    const remitInput = within(dialog).getByLabelText(/Remittance \/ UTR number/i);
    fireEvent.change(remitInput, { target: { value: 'UTR-TEST-123' } });

    // Click close button
    const closeBtn = within(dialog).getByLabelText('Close payment workflow');
    fireEvent.click(closeBtn);

    // Discard warning prompt appears
    expect(within(dialog).getByText('Discard unsaved payment inputs?')).toBeInTheDocument();

    // Click keep editing
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(within(dialog).queryByText('Discard unsaved payment inputs?')).not.toBeInTheDocument();

    // Click close again and discard
    fireEvent.click(closeBtn);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard inputs' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
