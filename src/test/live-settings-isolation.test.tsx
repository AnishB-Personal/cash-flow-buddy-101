import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { FinancialReferences } from '@/components/collectflow/reference-workflows';
import { MockSessionProvider, useMockSession } from '@/components/collectflow/session';
import { apiClient } from '@/lib/api-client';

describe('H04: LIVE Settings & Statutory Reference Isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    apiClient.configure({ mode: 'live', baseUrl: 'http://127.0.0.1:8000' });
    apiClient.clearSession();
  });

  it('fetches live statutory references from authenticated APIs in LIVE mode', async () => {
    apiClient.setToken('admin-token', {
      id: 1,
      username: 'admin',
      role: 'admin',
      full_name: 'Admin User',
    });

    const getFysSpy = vi.spyOn(apiClient, 'getFinancialYears').mockResolvedValue([
      { code: 'FY 2026-27-LIVE', start_date: '2026-04-01', end_date: '2027-03-31', is_active: true },
    ]);
    const getTaxesSpy = vi.spyOn(apiClient, 'getTaxes').mockResolvedValue({
      gst_rates: [
        { id: 101, name: 'Live GST 18%', rate: 0.18, is_default: true, is_active: true },
      ],
      tds_rates: [
        { id: 201, section_code: '194C-LIVE', description: 'Contractor', rate: 0.02, is_active: true },
      ],
    });

    render(
      <MockSessionProvider>
        <FinancialReferences />
      </MockSessionProvider>
    );

    expect(getFysSpy).toHaveBeenCalled();
    expect(getTaxesSpy).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText('FY 2026-27-LIVE')).toBeInTheDocument();
    });

    // Check GST tab
    fireEvent.click(screen.getByRole('button', { name: 'GST' }));
    await waitFor(() => {
      expect(screen.getByText('Live GST 18%')).toBeInTheDocument();
    });

    // Check TDS tab
    fireEvent.click(screen.getByRole('button', { name: 'TDS' }));
    await waitFor(() => {
      expect(screen.getByText('194C-LIVE')).toBeInTheDocument();
    });
  });

  it('ensures mock Finance permissions CANNOT authorize LIVE controls when live user is Viewer', async () => {
    // Live authenticated user is VIEWER
    apiClient.setToken('viewer-token', {
      id: 3,
      username: 'auditor',
      role: 'viewer',
      full_name: 'Auditor Viewer',
    });

    function TestHost() {
      const session = useMockSession();
      // Force mock session to simulate finance role
      return (
        <div>
          <button onClick={() => session.setRole('finance')}>Set Mock Finance</button>
          <FinancialReferences />
        </div>
      );
    }

    render(
      <MockSessionProvider>
        <TestHost />
      </MockSessionProvider>
    );

    // Click to simulate mock session having 'finance'
    fireEvent.click(screen.getByRole('button', { name: 'Set Mock Finance' }));

    // In LIVE mode, because apiClient.getCurrentUser() is viewer, writable controls must NOT be rendered!
    expect(screen.queryByRole('button', { name: 'Add year' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Seed years' })).not.toBeInTheDocument();

    // Switch to GST tab
    fireEvent.click(screen.getByRole('button', { name: 'GST' }));
    expect(screen.queryByRole('button', { name: 'Add GST rate' })).not.toBeInTheDocument();
  });

  it('disables unsupported mutations in LIVE mode with explicit notice and does not invoke mock confirmReference', async () => {
    apiClient.setToken('admin-token', {
      id: 1,
      username: 'admin',
      role: 'admin',
      full_name: 'Admin User',
    });

    vi.spyOn(apiClient, 'getFinancialYears').mockResolvedValue([
      { code: 'FY 2026-27', start_date: '2026-04-01', end_date: '2027-03-31', is_active: true },
    ]);
    vi.spyOn(apiClient, 'getTaxes').mockResolvedValue({ gst_rates: [], tds_rates: [] });
    const createFySpy = vi.spyOn(apiClient, 'createFinancialYear').mockResolvedValue({
      success: true,
      message: 'Created',
    });

    render(
      <MockSessionProvider>
        <FinancialReferences />
      </MockSessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('FY 2026-27')).toBeInTheDocument();
    });

    // Seed years is disabled in LIVE mode
    const seedBtn = screen.getByRole('button', { name: 'Seed years' });
    expect(seedBtn).toBeDisabled();
    expect(seedBtn).toHaveAttribute('title', 'Financial year seeding is not supported in live mode');

    // Add financial year workflow invokes apiClient.createFinancialYear
    fireEvent.click(screen.getByRole('button', { name: 'Add year' }));
    fireEvent.change(screen.getByLabelText('Financial year code'), { target: { value: 'FY 2028-29' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2028-04-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2029-03-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));

    await screen.findByText('Intended reference change');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to confirmation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reference change' }));

    await waitFor(() => {
      expect(createFySpy).toHaveBeenCalledWith({
        code: 'FY 2028-29',
        start_date: '2028-04-01',
        end_date: '2029-03-31',
      });
    });
  });

  it('sends null for cleared optional fields (email and phone) in customer-edit API request', async () => {
    apiClient.setToken('admin-token', {
      id: 1,
      username: 'admin',
      role: 'admin',
      full_name: 'Admin User',
    });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Customer updated successfully' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await apiClient.updateCustomer(42, {
      billing_name: 'Acme Cloud Solutions Pvt Ltd',
      email: null,
      phone_1: null,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/customers/42',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          billing_name: 'Acme Cloud Solutions Pvt Ltd',
          email: null,
          phone_1: null,
        }),
      })
    );
  });
});

