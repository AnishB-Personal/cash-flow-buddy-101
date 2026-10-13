import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { LockKeyhole, User, KeyRound, AlertCircle, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient, ApiError, type UserProfile } from "@/lib/api-client";

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successUser, setSuccessUser] = useState<UserProfile | null>(null);
  const activeLoginIdRef = useRef(0);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
      }
    };
  }, []);

  const isLive = apiClient.getMode() === "live";

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Please provide both username and password.");
      return;
    }

    if (!isLive) {
      setError(
        "Notice: Application is currently in 'mock' mode (VITE_API_MODE=mock). " +
        "Live authentication requires setting VITE_API_MODE=live and VITE_API_BASE_URL to the sandbox backend."
      );
      return;
    }

    const currentLoginId = ++activeLoginIdRef.current;
    setLoading(true);
    setError(null);

    apiClient.login({
      username: username.trim(),
      password,
    })
      .then((session) => {
        if (currentLoginId !== activeLoginIdRef.current) {
          return;
        }
        setSuccessUser(session.user);
        if (navTimerRef.current) {
          clearTimeout(navTimerRef.current);
        }
        navTimerRef.current = setTimeout(() => {
          if (currentLoginId === activeLoginIdRef.current) {
            void navigate({ to: "/" });
          }
        }, 300);
      })
      .catch((err: unknown) => {
        if (currentLoginId !== activeLoginIdRef.current) {
          return;
        }
        if (err instanceof ApiError && err.isSuperseded) {
          return;
        }
        if (err instanceof ApiError) {
          setError(err.message);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unexpected error occurred during authentication.");
        }
      })
      .finally(() => {
        if (currentLoginId === activeLoginIdRef.current) {
          setLoading(false);
        }
      });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-900">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LockKeyhole size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            CollectFlow
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isLive
              ? "Sign in to your isolated sandbox session"
              : "Live Authentication Sandbox Portal"}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="login-alert"
            className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <strong className="font-semibold">Authentication Failed</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {successUser && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-300"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <div>
              <strong>Authenticated as {successUser.username}</strong> ({successUser.role})
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="username"
              className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
            >
              Username
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <User size={16} />
              </div>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sandbox_admin"
                className="pl-9"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
            >
              Password
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <KeyRound size={16} />
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="pl-9"
                disabled={loading}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={loading}
          >
            {loading ? "Authenticating…" : "Sign In"}
            {!loading && <ArrowRight size={16} />}
          </Button>
        </form>

        <div className="border-t border-slate-100 pt-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <div className="flex items-center justify-center gap-1.5 font-medium">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Mode: {isLive ? "LIVE" : "MOCK"}</span>
          </div>
          <p className="mt-2">
            <Link to="/" className="text-primary hover:underline">
              ← Return to Financial Workspace
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
