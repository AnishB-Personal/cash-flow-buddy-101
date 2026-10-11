import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MockSessionProvider, useMockSession } from '@/components/collectflow/session';
import { TargetsScreen } from '@/components/collectflow/targets-screen';
import { TargetDrawer } from '@/components/collectflow/target-drawer';
import type { Role } from '@/data/records';

function Wrapper({
  role = 'finance',
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
  React.useEffect(() => {
    if (session.role !== role) {
      session.setRole(role);
    }
  }, [role, session]);
  return null;
}

describe('Sales Targets UI & Workflows', () => {
  describe('TargetsScreen View & RBAC', () => {
    it('renders TargetsScreen with title, metrics, and active Configure Target button for finance role', () => {
      render(
        <Wrapper role="finance">
          <TargetsScreen />
        </Wrapper>,
      );

      expect(screen.getByRole('heading', { name: /sales targets & quotas/i })).toBeDefined();
      expect(screen.getByText(/annual target quota/i)).toBeDefined();
      expect(screen.getByText(/sales achieved/i)).toBeDefined();
      expect(screen.getByText(/overall attainment/i)).toBeDefined();

      const configureBtn = screen.getByRole('button', { name: /configure sales target/i });
      expect(configureBtn).toBeDefined();
      expect(configureBtn.hasAttribute('disabled')).toBe(false);

      // Verify baseline targets rendered in table
      expect(screen.getAllByText('Neha Rao').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Kavya Nair').length).toBeGreaterThan(0);
    });

    it('enforces RBAC viewing mode for sales role: disables configure button and displays warning badge', () => {
      render(
        <Wrapper role="sales">
          <TargetsScreen />
        </Wrapper>,
      );

      const badges = screen.getAllByTitle(/viewing mode: only admin and finance can configure targets/i);
      expect(badges.length).toBeGreaterThan(0);

      const configureBtn = screen.getByRole('button', { name: /configure target \(disabled in viewing mode\)/i });
      expect(configureBtn).toBeDefined();
      expect(configureBtn.hasAttribute('disabled')).toBe(true);

      // Verify actions in table show view only
      expect(screen.getAllByText(/view only/i).length).toBeGreaterThan(0);
    });

    it('enforces RBAC viewing mode for viewer role', () => {
      render(
        <Wrapper role="viewer">
          <TargetsScreen />
        </Wrapper>,
      );

      const configureBtn = screen.getByRole('button', { name: /configure target \(disabled in viewing mode\)/i });
      expect(configureBtn.hasAttribute('disabled')).toBe(true);
    });

    it('filters targets by search query', () => {
      render(
        <Wrapper role="finance">
          <TargetsScreen />
        </Wrapper>,
      );

      const searchInput = screen.getByLabelText(/search targets by representative/i);
      fireEvent.change(searchInput, { target: { value: 'Kavya' } });

      expect(screen.getAllByText('Kavya Nair').length).toBeGreaterThan(0);
      expect(screen.queryByText('Neha Rao')).toBeNull();
    });

    it('displays empty state when search query matches nothing', () => {
      render(
        <Wrapper role="finance">
          <TargetsScreen />
        </Wrapper>,
      );

      const searchInput = screen.getByLabelText(/search targets by representative/i);
      fireEvent.change(searchInput, { target: { value: 'NonExistentRepresentativeName' } });

      expect(screen.getByText(/no matching records/i)).toBeDefined();
    });
  });

  describe('TargetDrawer 4-Step Workflow', () => {
    it('executes full 4-step workflow: Form -> Review -> Confirm -> Result and updates target state', async () => {
      const closeSpy = vi.fn();

      render(
        <Wrapper role="finance">
          <TargetDrawer close={closeSpy} />
        </Wrapper>,
      );

      // Step 1: Form step
      expect(screen.getByRole('heading', { name: /configure sales target/i })).toBeDefined();
      expect(screen.getByText('Form').getAttribute('aria-current')).toBe('step');

      // Click preset ₹50,00,000
      const preset50L = screen.getByRole('button', { name: '₹50,00,000' });
      fireEvent.click(preset50L);

      const yearlyInput = screen.getByLabelText(/annual target \(inr\)/i) as HTMLInputElement;
      expect(yearlyInput.value).toBe('5000000');

      // Advance to Review
      const reviewBtn = screen.getByRole('button', { name: /review target changes/i });
      fireEvent.click(reviewBtn);

      // Step 2: Review step
      expect(screen.getByText('Review').getAttribute('aria-current')).toBe('step');
      expect(screen.getByText(/target quota comparison/i)).toBeDefined();
      expect(screen.getByText(/sales attainment impact/i)).toBeDefined();
      expect(screen.getByText(/verified quota calculation ready for confirmation/i)).toBeDefined();

      // Advance to Confirm
      const continueBtn = screen.getByRole('button', { name: /continue to confirmation/i });
      fireEvent.click(continueBtn);

      // Step 3: Confirm step
      expect(screen.getByText('Confirm').getAttribute('aria-current')).toBe('step');
      expect(screen.getByText(/confirm target update/i)).toBeDefined();

      const confirmBtn = screen.getByRole('button', { name: /confirm target changes/i });
      fireEvent.click(confirmBtn);

      // Step 4: Result step
      await waitFor(() => {
        expect(screen.getByText(/sales target successfully configured/i)).toBeDefined();
      });
      expect(screen.getByText('Result').getAttribute('aria-current')).toBe('step');

      const returnBtn = screen.getByRole('button', { name: /return to targets/i });
      fireEvent.click(returnBtn);
      expect(closeSpy).toHaveBeenCalled();
    });

    it('flags unverified custom inputs with review-only notice and blocks confirmation', () => {
      render(
        <Wrapper role="finance">
          <TargetDrawer close={() => {}} />
        </Wrapper>,
      );

      // Enable manual override
      const overrideCheckbox = screen.getByLabelText(/enable manual sub-period overrides/i);
      fireEvent.click(overrideCheckbox);

      // Edit monthly target to arbitrary custom amount
      const monthlyInput = screen.getByLabelText(/monthly target \(inr\)/i);
      fireEvent.change(monthlyInput, { target: { value: '999999' } });

      // Advance to Review
      const reviewBtn = screen.getByRole('button', { name: /review target changes/i });
      fireEvent.click(reviewBtn);

      // Verify Review-only banner is displayed
      expect(
        screen.getByText(/review only: custom inputs have no verified scenario outcome/i),
      ).toBeDefined();

      // Verify confirmation button is disabled
      const continueBtn = screen.getByRole('button', { name: /continue to confirmation/i });
      expect(continueBtn.hasAttribute('disabled')).toBe(true);
    });

    it('displays unsaved changes discard prompt when user closes while dirty', () => {
      const closeSpy = vi.fn();

      render(
        <Wrapper role="finance">
          <TargetDrawer close={closeSpy} />
        </Wrapper>,
      );

      // Make a change
      const yearlyInput = screen.getByLabelText(/annual target \(inr\)/i);
      fireEvent.change(yearlyInput, { target: { value: '4500000' } });

      // Click Close (X) button
      const closeBtn = screen.getByRole('button', { name: /close target workflow/i });
      fireEvent.click(closeBtn);

      // Discard prompt appears
      expect(screen.getByText(/discard unsaved demo inputs\?/i)).toBeDefined();

      // Clicking Keep editing stays open
      const keepEditingBtn = screen.getByRole('button', { name: /keep editing/i });
      fireEvent.click(keepEditingBtn);
      expect(screen.queryByText(/discard unsaved demo inputs\?/i)).toBeNull();
      expect(closeSpy).not.toHaveBeenCalled();

      // Closing and clicking Discard inputs triggers close
      fireEvent.click(closeBtn);
      const discardInputsBtn = screen.getByRole('button', { name: /discard inputs/i });
      fireEvent.click(discardInputsBtn);
      expect(closeSpy).toHaveBeenCalled();
    });

    it('zero target preset sets target to ₹0 and handles zero quota safely with clean zero breakdown (CF4-05)', () => {
      render(
        <Wrapper role="finance">
          <TargetDrawer initialZero={true} close={() => {}} />
        </Wrapper>,
      );

      const yearlyInput = screen.getByLabelText(/annual target \(inr\)/i) as HTMLInputElement;
      expect(yearlyInput.value).toBe('0');

      // Verify that sub-period cards show ₹0 and not stale nonzero numbers
      const subCards = screen.getAllByText('₹0');
      expect(subCards.length).toBeGreaterThanOrEqual(1);

      // Also test clicking the Zero Target preset button on an existing dirty form
      const zeroPresetBtn = screen.getByRole('button', { name: 'Zero Target' });
      fireEvent.click(zeroPresetBtn);
      expect((screen.getByLabelText(/annual target \(inr\)/i) as HTMLInputElement).value).toBe('0');

      // Review zero target
      const reviewBtn = screen.getByRole('button', { name: /review target changes/i });
      fireEvent.click(reviewBtn);

      expect(screen.getByText('0.0%')).toBeDefined();
    });

    it('rejects negative target amount with inline error and blocks proceeding to Review (CF4-04)', () => {
      render(
        <Wrapper role="finance">
          <TargetDrawer close={() => {}} />
        </Wrapper>,
      );

      const yearlyInput = screen.getByLabelText(/annual target \(inr\)/i);
      // Type -1
      fireEvent.change(yearlyInput, { target: { value: '-1' } });

      // Inline error must appear immediately
      expect(screen.getByText(/yearly target must be greater than or equal to 0\.00/i)).toBeDefined();

      // Attempting to advance to review should be blocked
      const reviewBtn = screen.getByRole('button', { name: /review target changes/i });
      fireEvent.click(reviewBtn);

      // Still on Form step, not Review step
      expect(screen.getByText('Form').getAttribute('aria-current')).toBe('step');
      expect(screen.queryByText(/verified quota calculation ready for confirmation/i)).toBeNull();
    });
  });
});
