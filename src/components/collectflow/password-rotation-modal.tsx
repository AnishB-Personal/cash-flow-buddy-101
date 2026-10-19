import { useState } from "react";
import { LockKeyhole, ShieldAlert, AlertCircle, CheckCircle2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient, ApiError } from "@/lib/api-client";

interface PasswordRotationModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onLogout: () => void;
}

export function PasswordRotationModal({ isOpen, onSuccess, onLogout }: PasswordRotationModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  function validateClientPassword(pw: string): string | null {
    if (!pw) return "New password is required.";
    if (pw.length < 12) return "Password must be at least 12 characters long.";
    if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(pw)) return "Password must contain at least one lowercase letter.";
    if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)) return "Password must contain at least one special character.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }

    const validationError = validateClientPassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setError("New password cannot be the same as your current password.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      setSuccessMsg(res.message || "Password successfully updated. Please log in with your new credentials.");
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred while updating your password.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-rotation-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="w-full max-w-md p-6 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-100 dark:bg-amber-950/60 rounded-full text-amber-600 dark:text-amber-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 id="password-rotation-title" className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              Mandatory Password Rotation
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Corporate policy requires changing initial or expired passwords before accessing financial systems.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="font-medium">{error}</div>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-start gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="font-medium">{successMsg}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Current Password
            </label>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
              <Input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="pl-9 text-sm"
                disabled={loading || Boolean(successMsg)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              New Password
            </label>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
              <Input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new strong password"
                className="pl-9 text-sm"
                disabled={loading || Boolean(successMsg)}
              />
            </div>
            <p className="text-[11px] text-zinc-500">
              At least 12 characters, with uppercase, lowercase, number, and symbol.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Confirm New Password
            </label>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
              <Input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="pl-9 text-sm"
                disabled={loading || Boolean(successMsg)}
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onLogout}
              disabled={loading}
              className="text-xs flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </Button>

            <Button
              type="submit"
              disabled={loading || Boolean(successMsg)}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4"
            >
              {loading ? "Updating..." : "Update Password & Continue"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
