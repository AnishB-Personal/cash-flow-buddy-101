import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MockSessionProvider, useMockSession } from '@/components/collectflow/session';
import { UsersScreen } from '@/components/collectflow/users-screen';
import { UserDrawer } from '@/components/collectflow/user-drawer';
import type { Role, User } from '@/data/users';

function Wrapper({
  role = 'admin',
  initialMobile = false,
  children,
}: {
  role?: Role;
  initialMobile?: boolean;
  children: React.ReactNode;
}) {
  return (
    <MockSessionProvider initialMobile={initialMobile}>
      <RoleSetter role={role} />
      {children}
    </MockSessionProvider>
  );
}

function RoleSetter({ role }: { role: Role }) {
  const session = useMockSession();
  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      if (session.role !== role) {
        session.setRole(role);
      }
    }
  }, [role, session]);
  return null;
}

// Controller component to test mid-drawer simulated role changes and resetDemo
function DynamicRoleController({
  children,
  onSessionReady,
}: {
  children: React.ReactNode;
  onSessionReady?: (session: ReturnType<typeof useMockSession>) => void;
}) {
  const session = useMockSession();
  React.useEffect(() => {
    if (onSessionReady) {
      onSessionReady(session);
    }
  }, [session, onSessionReady]);
  return <>{children}</>;
}

describe('Stage 5 — Users & Roles UI and Workflows (Component Tests)', () => {
  // ─── 1. DIRECTORY RENDERING & SEARCH/FILTER ──────────────────────────────
  describe('User Directory Rendering & Filters', () => {
    it('renders all 6 baseline users with roles, created dates, and KPI metrics', () => {
      render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      // Section header
      expect(screen.getByRole('heading', { name: /user directory & administration/i })).toBeDefined();

      // Top KPI metrics
      expect(screen.getByTestId('metric-total-users')).toHaveTextContent('6');
      expect(screen.getByTestId('metric-admins')).toHaveTextContent('1');
      expect(screen.getByTestId('metric-finance')).toHaveTextContent('1');
      expect(screen.getByTestId('metric-sales')).toHaveTextContent('3');
      expect(screen.getByTestId('metric-viewers')).toHaveTextContent('1');

      // Table layout and rows
      expect(screen.getByTestId('users-table')).toBeDefined();
      expect(screen.getByTestId('user-row-1')).toHaveTextContent('System Administrator');
      expect(screen.getByTestId('user-row-2')).toHaveTextContent('Aisha Khan');
      expect(screen.getByTestId('user-row-3')).toHaveTextContent('Neha Rao');
      expect(screen.getByTestId('user-row-4')).toHaveTextContent('Kavya Nair');
      expect(screen.getByTestId('user-row-5')).toHaveTextContent('Arjun Mehta');
      expect(screen.getByTestId('user-row-6')).toHaveTextContent('Kavita Rao');

      // Check dates rendered
      expect(screen.getByTestId('user-row-1')).toHaveTextContent('2026-04-01');
    });

    it('filters user rows by search query (username or full name)', () => {
      render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      const searchInput = screen.getByLabelText(/search users by name or username/i);

      // Search by username 'siliya'
      fireEvent.change(searchInput, { target: { value: 'siliya' } });
      expect(screen.getByTestId('user-row-3')).toBeDefined();
      expect(screen.queryByTestId('user-row-1')).toBeNull();
      expect(screen.queryByTestId('user-row-2')).toBeNull();

      // Search by full name 'Aisha'
      fireEvent.change(searchInput, { target: { value: 'Aisha' } });
      expect(screen.getByTestId('user-row-2')).toBeDefined();
      expect(screen.queryByTestId('user-row-3')).toBeNull();

      // Reset search
      fireEvent.change(searchInput, { target: { value: '' } });
      expect(screen.getByTestId('user-row-1')).toBeDefined();
    });

    it('displays empty state when search matches no users and allows resetting', () => {
      render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      const searchInput = screen.getByLabelText(/search users by name or username/i);
      fireEvent.change(searchInput, { target: { value: 'non_existent_query_xyz' } });

      expect(screen.getByText(/no matching records/i)).toBeDefined();

      const clearBtn = screen.getByRole('button', { name: /clear filters/i });
      fireEvent.click(clearBtn);

      expect(screen.getByTestId('user-row-1')).toBeDefined();
    });
  });

  // ─── 2. ROLE-AWARE UI & ACCESS CONTROL BOUNDARIES ────────────────────────
  describe('Role-Aware UI & Access Control Boundaries', () => {
    it('grants full administrative permissions to Admin role', () => {
      render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      // Viewing mode banner should NOT be present
      expect(screen.queryByTestId('users-viewing-banner')).toBeNull();

      // "New User" button enabled
      const newBtn = screen.getByTestId('btn-new-user');
      expect(newBtn).toBeDefined();
      expect(newBtn.hasAttribute('disabled')).toBe(false);

      // Edit and delete action buttons enabled on rows
      const editBtn = within(screen.getByTestId('user-row-4')).getByRole('button', { name: /edit role for syama/i });
      expect(editBtn.hasAttribute('disabled')).toBe(false);

      const deleteBtn = within(screen.getByTestId('user-row-4')).getByRole('button', { name: /delete user syama/i });
      expect(deleteBtn.hasAttribute('disabled')).toBe(false);
    });

    it('displays viewing mode banner and disables actions for Finance role', () => {
      render(
        <Wrapper role="finance">
          <UsersScreen />
        </Wrapper>,
      );

      // Viewing mode banner displayed
      const banner = screen.getByTestId('users-viewing-banner');
      expect(banner).toBeDefined();
      expect(banner).toHaveTextContent(
        'Viewing mode: User administration is restricted to Administrators. Role permissions are enforced.',
      );

      // "New User" button disabled
      const newBtnDisabled = screen.getByTestId('btn-new-user-disabled');
      expect(newBtnDisabled.hasAttribute('disabled')).toBe(true);

      // Row action buttons disabled
      const editBtn = within(screen.getByTestId('user-row-4')).getByRole('button', { name: /edit role for syama \(disabled\)/i });
      expect(editBtn.hasAttribute('disabled')).toBe(true);

      const deleteBtn = within(screen.getByTestId('user-row-4')).getByRole('button', { name: /delete user syama \(disabled\)/i });
      expect(deleteBtn.hasAttribute('disabled')).toBe(true);
    });

    it('enforces viewing mode and disables actions for Sales and Viewer roles', () => {
      const nonAdminRoles: Role[] = ['sales', 'viewer'];

      nonAdminRoles.forEach(r => {
        const { unmount } = render(
          <Wrapper role={r}>
            <UsersScreen />
          </Wrapper>,
        );

        expect(screen.getByTestId('users-viewing-banner')).toBeDefined();
        expect(screen.getByTestId('btn-new-user-disabled').hasAttribute('disabled')).toBe(true);

        unmount();
      });
    });
  });

  // ─── 3. 5-STEP CREATE USER WORKFLOW & PASSWORD SECURITY ──────────────────
  describe('5-Step Create User Workflow & Password Security', () => {
    it('completes the full 5-step create user progression and clears password', async () => {
      render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      // Open drawer
      fireEvent.click(screen.getByTestId('btn-new-user'));

      // ── Step 1: Form
      expect(screen.getByRole('heading', { name: /provision new user/i })).toBeDefined();
      expect(screen.getByText('Form').getAttribute('aria-current')).toBe('step');

      const usernameInput = screen.getByLabelText(/username \(required\)/i) as HTMLInputElement;
      const passwordInput = screen.getByLabelText(/password \(required, min 6 chars\)/i) as HTMLInputElement;
      const fullNameInput = screen.getByLabelText(/full name \(optional\)/i) as HTMLInputElement;
      const roleSelect = screen.getByLabelText(/role assignment/i) as HTMLSelectElement;

      // Password input security check
      expect(passwordInput.type).toBe('password');

      fireEvent.change(usernameInput, { target: { value: 'priya.sharma' } });
      fireEvent.change(passwordInput, { target: { value: 'secretPassword123' } });
      fireEvent.change(fullNameInput, { target: { value: 'Priya Sharma' } });
      fireEvent.change(roleSelect, { target: { value: 'sales' } });

      // Advance to Step 2: Validation
      fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));

      // ── Step 2: Validation
      expect(screen.getByText('Validation').getAttribute('aria-current')).toBe('step');
      expect(screen.getByText(/is valid and unique/i)).toBeDefined();
      expect(screen.getByText(/password meets minimum length requirement/i)).toBeDefined();

      // Advance to Step 3: Review
      fireEvent.click(screen.getByRole('button', { name: /continue to review/i }));

      // ── Step 3: Review
      expect(screen.getByText('Review').getAttribute('aria-current')).toBe('step');
      expect(screen.getByText(/demo notice/i)).toBeDefined();
      expect(screen.getByText(/user creation is simulated in local demo state/i)).toBeDefined();

      // Diffs verification
      expect(screen.getByText('priya.sharma')).toBeDefined();
      expect(screen.getByText('Priya Sharma')).toBeDefined();

      // CRITICAL SECURITY ASSERTION: Password NEVER appears in review screen or DOM
      expect(screen.queryByText('secretPassword123')).toBeNull();

      // Advance to Step 4: Confirm
      fireEvent.click(screen.getByRole('button', { name: /continue to confirmation/i }));

      // ── Step 4: Confirm
      expect(screen.getByText('Confirm').getAttribute('aria-current')).toBe('step');
      expect(screen.getByText(/confirm creating user account/i)).toBeDefined();
      expect(screen.getByText(/simulated audit logging/i)).toBeDefined();

      // Password still NOT in DOM
      expect(screen.queryByText('secretPassword123')).toBeNull();

      // Execute confirmation
      fireEvent.click(screen.getByRole('button', { name: /confirm create user/i }));

      // ── Step 5: Result
      await waitFor(() => {
        expect(screen.getByText('Result').getAttribute('aria-current')).toBe('step');
        expect(screen.getByText(/user account successfully created/i)).toBeDefined();
      });

      // Close drawer to return to directory
      fireEvent.click(screen.getByRole('button', { name: /return to user directory/i }));

      // Assert user is now rendered in the table
      await waitFor(() => {
        expect(screen.getAllByText('Priya Sharma').length).toBeGreaterThan(0);
        expect(screen.getAllByText(/@priya\.sharma/).length).toBeGreaterThan(0);
      });
    });

    it('shows inline validation errors on duplicate username and blocks progression', () => {
      render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('btn-new-user'));

      const usernameInput = screen.getByLabelText(/username \(required\)/i);
      const passwordInput = screen.getByLabelText(/password \(required, min 6 chars\)/i);

      // Attempt duplicate username (case-insensitive)
      fireEvent.change(usernameInput, { target: { value: 'ADMIN' } });
      fireEvent.change(passwordInput, { target: { value: 'pass123' } });

      fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));

      // Step 2 shows duplicate error
      expect(screen.getByText(/a user with this username already exists/i)).toBeDefined();

      const continueBtn = screen.getByRole('button', { name: /continue to review/i });
      expect(continueBtn.hasAttribute('disabled')).toBe(true);
    });
  });

  // ─── 4. EDIT USER & ROLE WORKFLOW ────────────────────────────────────────
  describe('Edit User & Role Workflow', () => {
    it('updates full name and role with diff verification', async () => {
      render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      // Click Edit Role for Kavya Nair (id: 4)
      fireEvent.click(within(screen.getByTestId('user-row-4')).getByRole('button', { name: /edit role for syama/i }));

      expect(screen.getByRole('heading', { name: /edit user · @syama/i })).toBeDefined();

      const fullNameInput = screen.getByLabelText(/full name/i);
      const roleSelect = screen.getByLabelText(/role assignment/i);

      fireEvent.change(fullNameInput, { target: { value: 'Kavya Nair (Senior)' } });
      fireEvent.change(roleSelect, { target: { value: 'finance' } });

      // Proceed through steps
      fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));
      fireEvent.click(screen.getByRole('button', { name: /continue to review/i }));

      // Review shows diffs
      expect(screen.getByText('Kavya Nair (Senior)')).toBeDefined();

      fireEvent.click(screen.getByRole('button', { name: /continue to confirmation/i }));
      fireEvent.click(screen.getByRole('button', { name: /confirm update user/i }));

      await waitFor(() => {
        expect(screen.getByText(/user details successfully updated/i)).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /return to user directory/i }));

      await waitFor(() => {
        expect(within(screen.getByTestId('user-row-4')).getByText('Kavya Nair (Senior)')).toBeDefined();
      });
    });

    it('strictly blocks sole administrator demotion with warning alert', () => {
      render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      // Edit sole admin (id: 1)
      fireEvent.click(within(screen.getByTestId('user-row-1')).getByRole('button', { name: /edit role for admin/i }));

      const roleSelect = screen.getByLabelText(/role assignment/i);
      fireEvent.change(roleSelect, { target: { value: 'sales' } });

      fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));

      // Validation displays blocking message
      expect(screen.getByText(/cannot demote the only remaining administrator/i)).toBeDefined();

      const continueBtn = screen.getByRole('button', { name: /continue to review/i });
      expect(continueBtn.hasAttribute('disabled')).toBe(true);
    });
  });

  // ─── 5. DELETE USER WORKFLOW & INVOICE LINKAGE GUARD ─────────────────────
  describe('Delete User Workflow & Invoice Linkage Safeguard', () => {
    it('strictly blocks deleting user Neha Rao (id: 3) due to invoice INV-2026-042', () => {
      render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      // Click Delete on Neha Rao (id: 3 / username: siliya)
      fireEvent.click(within(screen.getByTestId('user-row-3')).getByRole('button', { name: /delete user siliya/i }));

      expect(screen.getByRole('heading', { name: /delete user · @siliya/i })).toBeDefined();

      // Proceed to validation
      fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));

      // Assert exact foreign key blocking alert
      expect(
        screen.getByText(
          "Cannot delete user 'siliya' because they are referenced as sales representative on 1 invoice(s).",
        ),
      ).toBeDefined();

      expect(screen.getByText(/state remains completely unchanged/i)).toBeDefined();

      const continueBtn = screen.getByRole('button', { name: /continue to review/i });
      expect(continueBtn.hasAttribute('disabled')).toBe(true);

      // Close drawer and verify user still present
      fireEvent.click(screen.getByRole('button', { name: /close user drawer/i }));
      expect(screen.getByTestId('user-row-3')).toBeDefined();
    });

    it('deletes an eligible user cleanly and updates the directory table', async () => {
      render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      // User 5 (Arjun Mehta / anshar) has 0 invoice links
      expect(screen.getByTestId('user-row-5')).toBeDefined();

      fireEvent.click(within(screen.getByTestId('user-row-5')).getByRole('button', { name: /delete user anshar/i }));

      fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));
      expect(screen.getByText(/user account is eligible for permanent deletion/i)).toBeDefined();

      fireEvent.click(screen.getByRole('button', { name: /continue to review/i }));
      fireEvent.click(screen.getByRole('button', { name: /continue to confirmation/i }));
      fireEvent.click(screen.getByRole('button', { name: /confirm delete user/i }));

      await waitFor(() => {
        expect(screen.getByText(/user account successfully deleted/i)).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /return to user directory/i }));

      await waitFor(() => {
        expect(screen.queryByTestId('user-row-5')).toBeNull();
      });
    });
  });

  // ─── 6. MID-DRAWER ROLE RE-VALIDATION ────────────────────────────────────
  describe('Mid-Drawer Role Permission Re-validation', () => {
    it('immediately renders denial alert and disables confirm button when acting role changes mid-drawer', async () => {
      let sessionRef: ReturnType<typeof useMockSession> | undefined;

      render(
        <Wrapper role="admin">
          <DynamicRoleController onSessionReady={s => { sessionRef = s; }}>
            <UsersScreen />
          </DynamicRoleController>
        </Wrapper>,
      );

      // Open drawer as admin
      fireEvent.click(screen.getByTestId('btn-new-user'));

      // Advance to Step 3: Review
      const usernameInput = screen.getByLabelText(/username \(required\)/i);
      const passwordInput = screen.getByLabelText(/password \(required, min 6 chars\)/i);

      fireEvent.change(usernameInput, { target: { value: 'mid.drawer.test' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));
      fireEvent.click(screen.getByRole('button', { name: /continue to review/i }));

      expect(screen.getByText('Review').getAttribute('aria-current')).toBe('step');

      // Now simulate role change mid-workflow to 'sales'
      expect(sessionRef).toBeDefined();
      act(() => {
        sessionRef!.setRole('sales');
      });

      // Denial banner immediately rendered with role="alert"
      await waitFor(() => {
        const denialBanner = screen.getByRole('alert');
        expect(denialBanner).toHaveTextContent(
          'Permission Denied: Simulated role changed to sales. Only Administrators can perform user administration.',
        );
      });

      // Continue to confirmation button is disabled
      const continueBtn = screen.getByRole('button', { name: /continue to confirmation/i });
      expect(continueBtn.hasAttribute('disabled')).toBe(true);
    });
  });

  // ─── 7. RESET DEMO RESTORATION STATE & INVARIANTS ────────────────────────
  describe('Reset Demo Invariants Restoration', () => {
    it('restores all 6 baseline users without corrupting targets or financial invariants', async () => {
      let sessionRef: ReturnType<typeof useMockSession> | undefined;

      render(
        <Wrapper role="admin">
          <DynamicRoleController onSessionReady={s => { sessionRef = s; }}>
            <UsersScreen />
          </DynamicRoleController>
        </Wrapper>,
      );

      // Delete user 4
      fireEvent.click(within(screen.getByTestId('user-row-4')).getByRole('button', { name: /delete user syama/i }));
      fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));
      fireEvent.click(screen.getByRole('button', { name: /continue to review/i }));
      fireEvent.click(screen.getByRole('button', { name: /continue to confirmation/i }));
      fireEvent.click(screen.getByRole('button', { name: /confirm delete user/i }));

      await waitFor(() => {
        expect(screen.getByText(/user account successfully deleted/i)).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /return to user directory/i }));

      await waitFor(() => {
        expect(screen.queryByTestId('user-row-4')).toBeNull();
      });

      // Now trigger resetDemo
      expect(sessionRef).toBeDefined();
      act(() => {
        sessionRef!.resetDemo();
      });

      // Verify all 6 users restored in directory
      await waitFor(() => {
        expect(screen.getByTestId('user-row-1')).toBeDefined();
        expect(screen.getByTestId('user-row-2')).toBeDefined();
        expect(screen.getByTestId('user-row-3')).toBeDefined();
        expect(screen.getByTestId('user-row-4')).toBeDefined();
        expect(screen.getByTestId('user-row-5')).toBeDefined();
        expect(screen.getByTestId('user-row-6')).toBeDefined();
      });

      // Verify Stage 4 targets integrity in session
      const targets = sessionRef!.targets;
      expect(targets).toBeDefined();
      const fy26Targets = targets.filter(t => t.fy_code === 'FY 2026-27');
      const total26 = fy26Targets.reduce((sum, t) => sum + t.yearly_target, 0);
      expect(total26).toBe(7500000); // ₹75L

      const fy25Targets = targets.filter(t => t.fy_code === 'FY 2025-26');
      const total25 = fy25Targets.reduce((sum, t) => sum + t.yearly_target, 0);
      expect(total25).toBe(9100000); // ₹91L

      // Verify Stage 3 financial invoices integrity in session
      const invoices = sessionRef!.demo.invoices;
      expect(invoices).toBeDefined();
      expect(invoices.length).toBeGreaterThan(0);
    });
  });
});
