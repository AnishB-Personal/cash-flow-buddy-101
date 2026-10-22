import { useState, useRef, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  ClipboardCheck,
  UserPlus,
  UserCheck,
  Trash2,
  Edit3,
  Lock,
  Info,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMockSession } from './session';
import { FormSection, FieldError } from './demo-controls';
import {
  type User,
  type Role,
  type UserCreateInput,
  type UserUpdateInput,
  type UserReview,
  type UserReviewDiff,
  validateUsername,
  validatePassword,
  validateRole,
  validateDelete,
  validateUpdate,
  VALID_ROLES,
} from '@/data/users';
import { apiClient } from '@/lib/api-client';

export type UserDrawerMode = 'create' | 'update' | 'delete';

export interface UserDrawerProps {
  mode: UserDrawerMode;
  user?: User | null | undefined;
  container?: HTMLElement | null | undefined;
  existingUsers?: User[];
  onSuccess?: () => void;
  close: () => void;
}

function validateLivePassword(password?: string): { valid: boolean; error?: string } {
  if (!password || password.length < 12) {
    return { valid: false, error: 'Password must be at least 12 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one digit.' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?/~`]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character.' };
  }
  return { valid: true };
}

export function UserDrawer({ mode, user, container, existingUsers, onSuccess, close }: UserDrawerProps) {
  const { role, users, demo, confirmUser, userAdapter, mobile, targets } = useMockSession();
  const isLive = apiClient.getMode() === 'live';
  const currentUser = apiClient.getCurrentUser();
  const activeRole = isLive && currentUser?.role ? currentUser.role : role;
  const initialRole = useRef(activeRole);
  const isAdmin = activeRole === 'admin';
  const currentUsers = existingUsers || users;
  const userTargets = user ? targets.filter(t => t.user_id === user.id) : [];

  // 5-step workflow state
  const [step, setStep] = useState<'form' | 'validation' | 'review' | 'confirm' | 'result'>('form');

  // Form field states
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [roleInput, setRoleInput] = useState<Role>(user?.role ?? 'sales');

  // Validation results state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>('');
  const [validationPassed, setValidationPassed] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string>('');

  // Review & confirm state
  const [review, setReview] = useState<UserReview | null>(null);
  const [resultUser, setResultUser] = useState<User | null>(null);

  // Workflow control state
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);

  const submitting = useRef(false);
  const trigger = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement),
  );

  // Clean up password from memory on unmount
  useEffect(() => {
    return () => {
      setPassword('');
    };
  }, []);

  // Ensure userAdapter accepts sanitized inputs where password is removed from UserReview
  useEffect(() => {
    if (!userAdapter) return;
    const originalValidateCreate = userAdapter.validateCreate;
    userAdapter.validateCreate = (input: UserCreateInput, existingUsers?: User[]) => {
      if (input.password === undefined) {
        const usernameVal = validateUsername(input.username, existingUsers);
        if (!usernameVal.valid) return usernameVal;
        if (input.role) {
          const roleVal = validateRole(input.role);
          if (!roleVal.valid) return roleVal;
        }
        return { valid: true };
      }
      return originalValidateCreate(input, existingUsers);
    };
  }, [userAdapter]);

  function requestClose() {
    if (pending) return;
    if (dirty && step !== 'result') {
      setDiscard(true);
    } else {
      setPassword('');
      close();
    }
  }

  // Live validation for Step 2
  function executeValidation(): boolean {
    setErrors({});
    setError('');

    if (mode === 'create') {
      const fieldErrors: Record<string, string> = {};

      const usernameVal = validateUsername(username, currentUsers);
      if (!usernameVal.valid) {
        fieldErrors['username'] = usernameVal.error || 'Invalid username';
      }

      const passwordVal = isLive ? validateLivePassword(password) : validatePassword(password);
      if (!passwordVal.valid) {
        fieldErrors['password'] = passwordVal.error || 'Password must be at least 6 characters';
      }

      const roleVal = validateRole(roleInput);
      if (!roleVal.valid) {
        fieldErrors['role'] = roleVal.error || 'Invalid role';
      }

      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        setValidationPassed(false);
        setValidationMessage('One or more form inputs failed validation. Please review below.');
        return false;
      }

      setValidationPassed(true);
      setValidationMessage('All credentials and role parameters passed validation.');
      return true;
    }

    if (mode === 'update') {
      if (!user) {
        setError('User not found');
        setValidationPassed(false);
        return false;
      }

      const roleVal = validateRole(roleInput);
      if (!roleVal.valid) {
        setErrors({ role: roleVal.error || 'Invalid role' });
        setValidationPassed(false);
        return false;
      }

      const updateVal = validateUpdate(user.id, roleInput, currentUsers);
      if (!updateVal.valid) {
        setError(updateVal.error || 'Validation failed');
        setValidationPassed(false);
        return false;
      }

      setValidationPassed(true);
      setValidationMessage('User role and name modification verified. System maintains administrator quorum.');
      return true;
    }

    if (mode === 'delete') {
      if (!user) {
        setError('User not found');
        setValidationPassed(false);
        return false;
      }

      if (isLive) {
        if (currentUser && user.id === currentUser.id) {
          setError('Cannot delete your own account');
          setValidationPassed(false);
          return false;
        }
        if (user.role === 'admin') {
          const adminCount = currentUsers.filter(u => u.role === 'admin').length;
          if (adminCount <= 1) {
            setError('Cannot delete the last administrator account');
            setValidationPassed(false);
            return false;
          }
        }
      } else {
        const deleteVal = validateDelete(user.id, users, demo.invoices, 1);
        if (!deleteVal.valid) {
          setError(deleteVal.error || 'Deletion blocked by system safeguard');
          setValidationPassed(false);
          return false;
        }
      }

      setValidationPassed(true);
      setValidationMessage('User account is eligible for permanent deletion. No blocking invoice references found.');
      return true;
    }

    return false;
  }

  function handleProceedToValidation() {
    const ok = executeValidation();
    setStep('validation');
    if (!ok && mode === 'create') {
      // Step 2 will display the inline error feedback
    }
  }

  function handleProceedToReview() {
    if (!validationPassed) return;

    if (mode === 'create') {
      const cleanUsername = username.trim().toLowerCase();
      const finalFullName = fullName.trim() || (cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1));
      const nextId = currentUsers.length > 0 ? Math.max(...currentUsers.map(u => u.id)) + 1 : 1;

      const targetUser: User = {
        id: nextId,
        username: cleanUsername,
        full_name: finalFullName,
        role: roleInput,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      };

      // Strict sanitization: Password is NEVER placed into UserReview
      const sanitizedInput: UserCreateInput = {
        username: cleanUsername,
        full_name: finalFullName,
        role: roleInput,
      };

      const diffs: UserReviewDiff[] = [
        { field: 'Username', previous: '—', current: cleanUsername },
        { field: 'Full Name', previous: '—', current: finalFullName },
        { field: 'Role', previous: '—', current: roleInput },
      ];

      const rev: UserReview = {
        action: 'create',
        targetUser,
        input: sanitizedInput,
        diffs,
        supported: true,
        message: 'Ready to provision user account.',
      };

      setReview(rev);
      setStep('review');
      return;
    }

    if (mode === 'update' && user) {
      const finalFullName = fullName.trim() || user.full_name;

      const diffs: UserReviewDiff[] = [];
      if (finalFullName !== user.full_name) {
        diffs.push({ field: 'Full Name', previous: user.full_name, current: finalFullName });
      }
      if (roleInput !== user.role) {
        diffs.push({ field: 'Role', previous: user.role, current: roleInput });
      }

      const rev: UserReview = {
        action: 'update',
        targetUser: {
          ...user,
          full_name: finalFullName,
          role: roleInput,
        },
        input: {
          id: user.id,
          full_name: finalFullName,
          role: roleInput,
        },
        diffs,
        supported: true,
        message: 'Ready to update user details.',
      };

      setReview(rev);
      setStep('review');
      return;
    }

    if (mode === 'delete' && user) {
      const associatedTargets = targets.filter(t => t.user_id === user.id);
      const diffs: UserReviewDiff[] = [
        { field: 'Status', previous: 'Active', current: 'Deleted' },
        { field: 'Username', previous: `@${user.username}`, current: '—' },
        { field: 'Role', previous: user.role, current: '—' },
      ];

      if (associatedTargets.length > 0) {
        const fyList = [...new Set(associatedTargets.map(t => t.fy_code))].join(', ');
        diffs.push({
          field: 'Associated Sales Targets',
          previous: `${associatedTargets.length} target(s) (${fyList})`,
          current: 'Cascade deleted (backend ON DELETE CASCADE)',
        });
      }

      const rev: UserReview = {
        action: 'delete',
        targetUser: user,
        input: { id: user.id } as UserUpdateInput,
        diffs,
        supported: true,
        message: `Ready to delete user account '@${user.username}'.`,
      };

      setReview(rev);
      setStep('review');
      return;
    }
  }

  async function handleConfirm() {
    if (!review || submitting.current) return;

    // Mid-drawer role permission revalidation
    if (!isAdmin) {
      const denialMsg = isLive
        ? 'Permission Denied: Only Administrators can perform user administration.'
        : `Permission Denied: Simulated role changed to ${role}. Only Administrators can perform user administration.`;
      setError(denialMsg);
      throw new Error(denialMsg);
    }

    submitting.current = true;
    setPending(true);
    setError('');

    try {
      if (isLive) {
        if (review.action === 'create') {
          const res = await apiClient.createUser({
            username: review.input!.username!,
            password: password,
            role: (review.input!.role || 'sales') as any,
            full_name: review.input!.full_name,
          });
          setResultUser({
            id: res.user_id,
            username: review.input!.username!,
            role: (review.input!.role || 'sales') as Role,
            full_name: review.input!.full_name || review.input!.username!,
            created_at: new Date().toISOString(),
          });
        } else if (review.action === 'update' && user) {
          await apiClient.updateUser(user.id, {
            role: review.input!.role,
            full_name: review.input!.full_name,
          });
          setResultUser({
            ...user,
            role: (review.input!.role || user.role) as Role,
            full_name: review.input!.full_name ?? user.full_name,
          });
        } else if (review.action === 'delete' && user) {
          await apiClient.deleteUser(user.id);
          setResultUser(user);
        }
        if (onSuccess) {
          onSuccess();
        }
      } else {
        const committed = await confirmUser(review);
        if (committed) {
          setResultUser(committed);
        } else if (review.targetUser) {
          setResultUser(review.targetUser);
        }
      }
      setPassword('');
      setStep('result');
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'User administration action failed. State remains unchanged.');
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  return (
    <Dialog.Root
      open
      modal={false}
      onOpenChange={open => {
        if (!open) requestClose();
      }}
    >
      <Dialog.Portal container={mobile ? container : undefined}>
        <Dialog.Overlay className="cf-overlay" style={mobile ? undefined : { top: 48, zIndex: 44 }} />
        <Dialog.Content
          className="cf-app cf-drawer cf-demo-drawer"
          style={mobile ? undefined : { top: 48, height: 'calc(100dvh - 48px)', zIndex: 45 }}
          aria-describedby="user-drawer-description"
          onEscapeKeyDown={event => {
            event.preventDefault();
            requestClose();
          }}
          onInteractOutside={event => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('.cf-review-bar')) {
              return;
            }
            event.preventDefault();
          }}
          onPointerDownOutside={event => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('.cf-review-bar')) {
              return;
            }
            event.preventDefault();
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <header className="cf-drawer-header">
            <div>
              <span className="cf-kicker">USER ADMINISTRATION WORKFLOW</span>
              <Dialog.Title>
                {mode === 'create'
                  ? 'Provision New User'
                  : mode === 'update'
                  ? `Edit User · @${user?.username}`
                  : `Delete User · @${user?.username}`}
              </Dialog.Title>
              <Dialog.Description id="user-drawer-description">
                {mode === 'create'
                  ? 'Create a new team user account with assigned role and access credentials.'
                  : mode === 'update'
                  ? `Update role and full name for ${user?.full_name ?? user?.username}`
                  : `Permanently delete user account and revoke associated permissions`}
              </Dialog.Description>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close user drawer"
              disabled={pending}
              onClick={requestClose}
            >
              <X />
            </Button>
          </header>

          <div className="cf-drawer-body">
            {/* 5-Step Workflow Progress Bar */}
            <div
              className="cf-demo-progress"
              style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
              aria-label="User administration workflow progress"
            >
              {['Form', 'Validation', 'Review', 'Confirm', 'Result'].map(label => (
                <span
                  key={label}
                  aria-current={label.toLowerCase() === step ? 'step' : undefined}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Mid-Drawer Role Permission Denial Alert Banner */}
            {!isAdmin && (
              <div
                className="cf-denial-banner"
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  backgroundColor: 'color-mix(in oklch, var(--destructive) 10%, var(--card))',
                  color: 'var(--destructive)',
                  borderRadius: 6,
                  border: '1px solid var(--destructive)',
                  margin: '16px 0',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <ShieldAlert size={18} style={{ flexShrink: 0 }} />
                <span>
                  {isLive
                    ? 'Permission Denied: Only Administrators can perform user administration.'
                    : `Permission Denied: Simulated role changed to ${role}. Only Administrators can perform user administration.`}
                </span>
              </div>
            )}

            {/* STEP 1: FORM */}
            {step === 'form' && (
              <div>
                {mode === 'create' && (
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      handleProceedToValidation();
                    }}
                  >
                    <FormSection title="Account credentials & identity">
                      <div className="cf-reference-fields" style={{ gridTemplateColumns: '1fr' }}>
                        <div>
                          <label htmlFor="user-username">Username (required)</label>
                          <Input
                            id="user-username"
                            placeholder="e.g. priya.sharma"
                            value={username}
                            aria-invalid={Boolean(errors['username'])}
                            aria-describedby="user-username-help"
                            onChange={e => {
                              setUsername(e.target.value);
                              setDirty(true);
                              if (errors['username']) {
                                setErrors(prev => ({ ...prev, username: '' }));
                              }
                            }}
                          />
                          <FieldError id="error-username" message={errors['username']} />
                          <p id="user-username-help" className="cf-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            3–50 chars. Letters, digits, and . _ @ - allowed. Case-insensitive uniqueness enforced.
                          </p>
                        </div>

                        <div>
                          <label htmlFor="user-password">
                            Password (required{isLive ? ', min 12 chars & complex' : ', min 6 chars'})
                          </label>
                          <Input
                            id="user-password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            aria-invalid={Boolean(errors['password'])}
                            aria-describedby="user-password-help"
                            onChange={e => {
                              setPassword(e.target.value);
                              setDirty(true);
                              if (errors['password']) {
                                setErrors(prev => ({ ...prev, password: '' }));
                              }
                            }}
                          />
                          <FieldError id="error-password" message={errors['password']} />
                          <p id="user-password-help" className="cf-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            {isLive
                              ? 'Must contain at least 12 characters with uppercase, lowercase, digit, and special character.'
                              : 'Ephemeral input. Used strictly for length validation and NEVER stored in demo session.'}
                          </p>
                        </div>

                        <div>
                          <label htmlFor="user-fullname">Full Name (optional)</label>
                          <Input
                            id="user-fullname"
                            placeholder="e.g. Priya Sharma"
                            value={fullName}
                            onChange={e => {
                              setFullName(e.target.value);
                              setDirty(true);
                            }}
                          />
                          <p className="cf-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            Display name. Defaults to capitalized username if left blank.
                          </p>
                        </div>

                        <div>
                          <label htmlFor="user-role">Role assignment</label>
                          <select
                            id="user-role"
                            value={roleInput}
                            onChange={e => {
                              setRoleInput(e.target.value as Role);
                              setDirty(true);
                            }}
                            style={{
                              width: '100%',
                              height: 38,
                              background: 'var(--card)',
                              color: 'var(--foreground)',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              padding: '0 10px',
                              fontSize: 13,
                            }}
                          >
                            <option value="sales">Sales (Sales Representative)</option>
                            <option value="finance">Finance (Finance Lead)</option>
                            <option value="admin">Admin (System Administrator)</option>
                            <option value="viewer">Viewer (Auditor / Read-Only)</option>
                          </select>
                        </div>
                      </div>
                    </FormSection>

                    <div
                      className="cf-drawer-footer"
                      style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 20 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <Button type="button" variant="outline" onClick={requestClose}>
                          Cancel
                        </Button>
                        <Button type="submit">
                          Proceed to validation <ArrowRight size={16} />
                        </Button>
                      </div>
                    </div>
                  </form>
                )}

                {mode === 'update' && user && (
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      handleProceedToValidation();
                    }}
                  >
                    <FormSection title="Update user details">
                      <div className="cf-reference-fields" style={{ gridTemplateColumns: '1fr' }}>
                        <div>
                          <label htmlFor="edit-username">Username</label>
                          <Input id="edit-username" value={user.username} disabled />
                          <p className="cf-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            Username cannot be modified after account creation.
                          </p>
                        </div>

                        <div>
                          <label htmlFor="edit-fullname">Full Name</label>
                          <Input
                            id="edit-fullname"
                            value={fullName}
                            onChange={e => {
                              setFullName(e.target.value);
                              setDirty(true);
                            }}
                          />
                        </div>

                        <div>
                          <label htmlFor="edit-role">Role assignment</label>
                          <select
                            id="edit-role"
                            value={roleInput}
                            onChange={e => {
                              setRoleInput(e.target.value as Role);
                              setDirty(true);
                            }}
                            style={{
                              width: '100%',
                              height: 38,
                              background: 'var(--card)',
                              color: 'var(--foreground)',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              padding: '0 10px',
                              fontSize: 13,
                            }}
                          >
                            <option value="sales">Sales (Sales Representative)</option>
                            <option value="finance">Finance (Finance Lead)</option>
                            <option value="admin">Admin (System Administrator)</option>
                            <option value="viewer">Viewer (Auditor / Read-Only)</option>
                          </select>
                        </div>
                      </div>
                    </FormSection>

                    <div
                      className="cf-drawer-footer"
                      style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 20 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <Button type="button" variant="outline" onClick={requestClose}>
                          Cancel
                        </Button>
                        <Button type="submit">
                          Proceed to validation <ArrowRight size={16} />
                        </Button>
                      </div>
                    </div>
                  </form>
                )}

                {mode === 'delete' && user && (
                  <div>
                    <FormSection title="Account to be deleted">
                      <dl className="cf-detail-grid">
                        <div>
                          <dt>User ID</dt>
                          <dd>#{user.id}</dd>
                        </div>
                        <div>
                          <dt>Username</dt>
                          <dd>@{user.username}</dd>
                        </div>
                        <div>
                          <dt>Full Name</dt>
                          <dd>{user.full_name}</dd>
                        </div>
                        <div>
                          <dt>Role</dt>
                          <dd>{user.role}</dd>
                        </div>
                        <div>
                          <dt>Created Date</dt>
                          <dd>{user.created_at}</dd>
                        </div>
                      </dl>
                    </FormSection>

                    <div
                      style={{
                        padding: 14,
                        background: 'var(--accent)',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        marginTop: 16,
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                        <strong>Administrative Safeguards Notice:</strong> Deletion will be verified against
                        sole-administrator requirements, self-deletion rules, and historical invoice linkage.
                        {userTargets.length > 0 && (
                          <span style={{ display: 'block', marginTop: 6 }}>
                            <strong>Notice:</strong> This user has {userTargets.length} assigned sales target(s).
                            Under backend rules (ON DELETE CASCADE), associated sales targets will be cascade deleted
                            while historical invoice integrity is preserved.
                          </span>
                        )}
                      </p>
                    </div>

                    <div
                      className="cf-drawer-footer"
                      style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 20 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <Button type="button" variant="outline" onClick={requestClose}>
                          Cancel
                        </Button>
                        <Button onClick={handleProceedToValidation}>
                          Proceed to validation <ArrowRight size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: VALIDATION */}
            {step === 'validation' && (
              <div>
                <FormSection title="Live validation feedback">
                  {mode === 'create' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: 12,
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          backgroundColor: errors['username'] ? 'color-mix(in oklch, var(--destructive) 8%, var(--card))' : 'var(--card)',
                        }}
                      >
                        {errors['username'] ? (
                          <ShieldAlert size={18} style={{ color: 'var(--destructive)', flexShrink: 0, marginTop: 2 }} />
                        ) : (
                          <CheckCircle2 size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                        )}
                        <div>
                          <strong>Username validation:</strong>
                          <p style={{ margin: '2px 0 0', fontSize: 13, color: errors['username'] ? 'var(--destructive)' : 'var(--muted-foreground)' }}>
                            {errors['username'] || `Username '@${username.trim().toLowerCase()}' is valid and unique.`}
                          </p>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: 12,
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          backgroundColor: errors['password'] ? 'color-mix(in oklch, var(--destructive) 8%, var(--card))' : 'var(--card)',
                        }}
                      >
                        {errors['password'] ? (
                          <ShieldAlert size={18} style={{ color: 'var(--destructive)', flexShrink: 0, marginTop: 2 }} />
                        ) : (
                          <CheckCircle2 size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                        )}
                        <div>
                          <strong>Password policy validation:</strong>
                          <p style={{ margin: '2px 0 0', fontSize: 13, color: errors['password'] ? 'var(--destructive)' : 'var(--muted-foreground)' }}>
                            {errors['password'] || 'Password meets minimum length requirement (6+ characters).' }
                          </p>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: 12,
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--card)',
                        }}
                      >
                        <CheckCircle2 size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                        <div>
                          <strong>Role validity:</strong>
                          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
                            Role &apos;{roleInput}&apos; is authorized in RBAC configuration.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {mode === 'update' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: 12,
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          backgroundColor: error ? 'color-mix(in oklch, var(--destructive) 8%, var(--card))' : 'var(--card)',
                        }}
                      >
                        {error ? (
                          <ShieldAlert size={18} style={{ color: 'var(--destructive)', flexShrink: 0, marginTop: 2 }} />
                        ) : (
                          <CheckCircle2 size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                        )}
                        <div>
                          <strong>Administrator quorum safeguard:</strong>
                          <p
                            role={error ? 'alert' : undefined}
                            className={error ? 'cf-field-error' : undefined}
                            style={{ margin: '2px 0 0', fontSize: 13 }}
                          >
                            {error || 'Role change verified. Demotion rules satisfied.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {mode === 'delete' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: 12,
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          backgroundColor: error ? 'color-mix(in oklch, var(--destructive) 8%, var(--card))' : 'var(--card)',
                        }}
                      >
                        {error ? (
                          <ShieldAlert size={20} style={{ color: 'var(--destructive)', flexShrink: 0, marginTop: 2 }} />
                        ) : (
                          <CheckCircle2 size={20} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                        )}
                        <div>
                          <strong>System safeguards & invoice linkage check:</strong>
                          <p
                            role={error ? 'alert' : undefined}
                            className={error ? 'cf-field-error' : undefined}
                            style={{ margin: '2px 0 0', fontSize: 13, fontWeight: error ? 500 : 400 }}
                          >
                            {error || validationMessage}
                          </p>
                          {!error && userTargets.length > 0 && (
                            <p className="cf-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                              Target Cascade Notice: {userTargets.length} associated target(s) across FY{' '}
                              {[...new Set(userTargets.map(t => t.fy_code))].join(', ')} will be cascade deleted per backend foreign key constraint.
                            </p>
                          )}
                          {error && (
                            <p className="cf-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                              State remains completely unchanged. Action cannot proceed while blocking conditions exist.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </FormSection>

                <div
                  className="cf-drawer-footer"
                  style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 20 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Button variant="outline" onClick={() => setStep('form')}>
                      Back to form
                    </Button>
                    <Button
                      disabled={!validationPassed || !isAdmin}
                      title={
                        !validationPassed
                          ? 'Resolve validation issues before continuing'
                          : !isAdmin
                          ? 'Only Administrators can perform user administration'
                          : 'Continue to review'
                      }
                      onClick={handleProceedToReview}
                    >
                      Continue to review <ArrowRight size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: REVIEW */}
            {step === 'review' && review && (
              <div>
                <FormSection title="Previous vs proposed changes">
                  <table className="cf-table" style={{ marginTop: 8, fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Previous Value</th>
                        <th>Proposed Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {review.diffs.map(diff => (
                        <tr key={diff.field}>
                          <td><strong>{diff.field}</strong></td>
                          <td>{diff.previous}</td>
                          <td><strong>{diff.current}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </FormSection>

                {/* Explicit Demo / Live Disclaimer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: 12,
                    background: 'var(--accent)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    margin: '16px 0',
                    fontSize: 13,
                  }}
                >
                  <Info size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, lineHeight: 1.5 }}>
                    <strong>{isLive ? 'Live system notice:' : 'Demo notice:'}</strong>{' '}
                    {isLive
                      ? 'User administration changes will be persisted to PostgreSQL and audited.'
                      : 'User creation is simulated in local demo state. Does not create a real authenticated account.'}
                  </p>
                </div>

                <div
                  className="cf-drawer-footer"
                  style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 20 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Button variant="outline" onClick={() => setStep('validation')}>
                      Back to validation
                    </Button>
                    <Button
                      disabled={!isAdmin}
                      title={!isAdmin ? 'Only Administrators can perform user administration' : 'Continue to confirmation'}
                      onClick={() => setStep('confirm')}
                    >
                      Continue to confirmation <ClipboardCheck size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: CONFIRM */}
            {step === 'confirm' && review && (
              <div>
                <FormSection title="Confirm administrative action">
                  <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
                    {mode === 'create' && (
                      <>Confirm creating user account <strong>@{review.input && 'username' in review.input ? review.input.username : ''}</strong> with role <strong>{review.input && 'role' in review.input ? review.input.role : 'sales'}</strong>?</>
                    )}
                    {mode === 'update' && user && (
                      <>Confirm updating user account <strong>@{user.username}</strong> to role <strong>{review.input && 'role' in review.input ? review.input.role : user.role}</strong>?</>
                    )}
                    {mode === 'delete' && user && (
                      <>Confirm permanently deleting user account <strong>@{user.username}</strong> (ID: {user.id})?</>
                    )}
                  </p>

                  <dl className="cf-review-values">
                    <div>
                      <dt>Simulated User</dt>
                      <dd>@{review.targetUser?.username ?? user?.username}</dd>
                    </div>
                    <div>
                      <dt>Full Name</dt>
                      <dd>{review.targetUser?.full_name ?? user?.full_name}</dd>
                    </div>
                    <div>
                      <dt>Assigned Role</dt>
                      <dd><strong>{review.targetUser?.role ?? user?.role}</strong></dd>
                    </div>
                  </dl>

                  {/* Audit Logging Notice */}
                  <div
                    style={{
                      padding: 12,
                      background: 'var(--muted)',
                      borderRadius: 6,
                      marginTop: 16,
                      fontSize: 12,
                      color: 'var(--muted-foreground)',
                    }}
                  >
                    <span>
                      {isLive
                        ? 'PostgreSQL audit logging: Action will be recorded as append-only event in audit_logs table.'
                        : 'Simulated audit logging: Action will be recorded as append-only event in audit trail.'}{' '}
                      Sensitive credentials are sanitized and never retained in session state.
                    </span>
                  </div>
                </FormSection>

                {error && (
                  <p role="alert" className="cf-field-error" style={{ marginTop: 12 }}>
                    {error}
                  </p>
                )}

                <div
                  className="cf-drawer-footer"
                  style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 20 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Button variant="outline" disabled={pending} onClick={() => setStep('review')}>
                      Back to review
                    </Button>
                    <Button
                      variant={mode === 'delete' ? 'destructive' : 'default'}
                      disabled={pending || !isAdmin}
                      title={!isAdmin ? 'Only Administrators can perform user administration' : undefined}
                      onClick={handleConfirm}
                    >
                      {pending
                        ? 'Executing…'
                        : mode === 'create'
                        ? 'Confirm create user'
                        : mode === 'update'
                        ? 'Confirm update user'
                        : 'Confirm delete user'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: RESULT */}
            {step === 'result' && (
              <div>
                <div
                  className="cf-success-banner"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                    background: 'var(--accent)',
                    borderRadius: 6,
                    marginBottom: 20,
                  }}
                >
                  <CheckCircle2 size={26} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  <div>
                    <strong style={{ fontSize: 16 }}>
                      {mode === 'create'
                        ? 'User account successfully created'
                        : mode === 'update'
                        ? 'User details successfully updated'
                        : 'User account successfully deleted'}
                    </strong>
                    <p className="cf-muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                      {isLive
                        ? 'User directory state is updated and persisted in PostgreSQL.'
                        : 'Simulated user directory state is updated for the active demo session.'}
                    </p>
                  </div>
                </div>

                <FormSection title="Account summary">
                  <dl className="cf-detail-grid">
                    <div>
                      <dt>User ID</dt>
                      <dd>#{resultUser?.id ?? user?.id ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Username</dt>
                      <dd>@{resultUser?.username ?? user?.username}</dd>
                    </div>
                    <div>
                      <dt>Full Name</dt>
                      <dd>{resultUser?.full_name ?? user?.full_name}</dd>
                    </div>
                    <div>
                      <dt>Role</dt>
                      <dd>{resultUser?.role ?? user?.role}</dd>
                    </div>
                    <div>
                      <dt>Lifecycle Status</dt>
                      <dd>{mode === 'delete' ? 'Deleted' : 'Active'}</dd>
                    </div>
                  </dl>
                </FormSection>

                <div
                  className="cf-drawer-footer"
                  style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 20 }}
                >
                  <Button style={{ width: '100%' }} onClick={close}>
                    Return to user directory
                  </Button>
                </div>
              </div>
            )}

            {/* Discard unsaved inputs dialog prompt */}
            {discard && (
              <div className="cf-discard">
                <p>Discard unsaved user administration inputs?</p>
                <Button variant="outline" onClick={() => setDiscard(false)}>
                  Keep editing
                </Button>
                <Button
                  onClick={() => {
                    setPassword('');
                    setDiscard(false);
                    close();
                  }}
                >
                  Discard inputs
                </Button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
