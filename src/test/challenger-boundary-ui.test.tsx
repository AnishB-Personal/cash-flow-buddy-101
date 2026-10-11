import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MockSessionProvider, useMockSession } from '@/components/collectflow/session';
import { UsersScreen } from '@/components/collectflow/users-screen';
import type { Role } from '@/data/users';

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

function Wrapper({
  role = 'admin',
  children,
}: {
  role?: Role;
  children: React.ReactNode;
}) {
  return (
    <MockSessionProvider>
      <RoleSetter role={role} />
      {children}
    </MockSessionProvider>
  );
}

describe('Adversarial Boundary Testing on UI Workflows', () => {
  it('UI rejects 2-character username and displays exact length error', () => {
    render(
      <Wrapper role="admin">
        <UsersScreen />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('btn-new-user'));

    const usernameInput = screen.getByLabelText(/username \(required\)/i);
    const passwordInput = screen.getByLabelText(/password \(required, min 6 chars\)/i);

    fireEvent.change(usernameInput, { target: { value: 'ab' } });
    fireEvent.change(passwordInput, { target: { value: 'secret123' } });

    fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));

    expect(screen.getByText('Username must be between 3 and 50 characters')).toBeDefined();
    const continueBtn = screen.getByRole('button', { name: /continue to review/i });
    expect(continueBtn.hasAttribute('disabled')).toBe(true);
  });

  it('UI rejects 51-character username and displays exact length error', () => {
    render(
      <Wrapper role="admin">
        <UsersScreen />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('btn-new-user'));

    const usernameInput = screen.getByLabelText(/username \(required\)/i);
    const passwordInput = screen.getByLabelText(/password \(required, min 6 chars\)/i);

    fireEvent.change(usernameInput, { target: { value: 'a'.repeat(51) } });
    fireEvent.change(passwordInput, { target: { value: 'secret123' } });

    fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));

    expect(screen.getByText('Username must be between 3 and 50 characters')).toBeDefined();
    const continueBtn = screen.getByRole('button', { name: /continue to review/i });
    expect(continueBtn.hasAttribute('disabled')).toBe(true);
  });

  it('UI accepts exact boundary usernames 3 and 50 chars', () => {
    render(
      <Wrapper role="admin">
        <UsersScreen />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('btn-new-user'));

    const usernameInput = screen.getByLabelText(/username \(required\)/i);
    const passwordInput = screen.getByLabelText(/password \(required, min 6 chars\)/i);

    // 3 chars
    fireEvent.change(usernameInput, { target: { value: 'u.1' } });
    fireEvent.change(passwordInput, { target: { value: 'secret123' } });

    fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));

    expect(screen.getByText(/is valid and unique/i)).toBeDefined();
    const continueBtn = screen.getByRole('button', { name: /continue to review/i });
    expect(continueBtn.hasAttribute('disabled')).toBe(false);

    // Back to form and test 50 chars
    fireEvent.click(screen.getByRole('button', { name: /back to form/i }));

    fireEvent.change(usernameInput, { target: { value: 'b'.repeat(50) } });
    fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));

    expect(screen.getByText(/is valid and unique/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /continue to review/i }).hasAttribute('disabled')).toBe(false);
  });

  it('UI rejects invalid symbols in username (!, #, $, %, *, space)', () => {
    const invalidSymbols = ['user!test', 'user#tag', 'user$cash', 'calc%rate', 'star*user', 'space user'];

    for (const badUser of invalidSymbols) {
      const { unmount } = render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('btn-new-user'));

      const usernameInput = screen.getByLabelText(/username \(required\)/i);
      const passwordInput = screen.getByLabelText(/password \(required, min 6 chars\)/i);

      fireEvent.change(usernameInput, { target: { value: badUser } });
      fireEvent.change(passwordInput, { target: { value: 'secret123' } });

      fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));

      expect(screen.getByText('Username can only contain alphanumeric characters, ., _, @, -')).toBeDefined();
      expect(screen.getByRole('button', { name: /continue to review/i }).hasAttribute('disabled')).toBe(true);

      unmount();
    }
  });

  it('UI rejects case-insensitive duplicate usernames: ADMIN, SILIYA, siliya', () => {
    const duplicates = ['ADMIN', 'SILIYA', 'siliya', 'Finance_Lead', 'AUDITOR'];

    for (const dup of duplicates) {
      const { unmount } = render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('btn-new-user'));

      const usernameInput = screen.getByLabelText(/username \(required\)/i);
      const passwordInput = screen.getByLabelText(/password \(required, min 6 chars\)/i);

      fireEvent.change(usernameInput, { target: { value: dup } });
      fireEvent.change(passwordInput, { target: { value: 'secret123' } });

      fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));

      expect(screen.getByText('A user with this username already exists')).toBeDefined();
      expect(screen.getByRole('button', { name: /continue to review/i }).hasAttribute('disabled')).toBe(true);

      unmount();
    }
  });

  it('UI rejects passwords with 0-5 characters and accepts >=6 characters', () => {
    const shortPasswords = ['', '1', '12', '123', '1234', '12345'];

    for (const shortPwd of shortPasswords) {
      const { unmount } = render(
        <Wrapper role="admin">
          <UsersScreen />
        </Wrapper>,
      );

      fireEvent.click(screen.getByTestId('btn-new-user'));

      const usernameInput = screen.getByLabelText(/username \(required\)/i);
      const passwordInput = screen.getByLabelText(/password \(required, min 6 chars\)/i);

      fireEvent.change(usernameInput, { target: { value: 'new_valid_rep' } });
      fireEvent.change(passwordInput, { target: { value: shortPwd } });

      fireEvent.click(screen.getByRole('button', { name: /proceed to validation/i }));

      expect(screen.getByText('Password must be at least 6 characters')).toBeDefined();
      expect(screen.getByRole('button', { name: /continue to review/i }).hasAttribute('disabled')).toBe(true);

      unmount();
    }
  });
});
