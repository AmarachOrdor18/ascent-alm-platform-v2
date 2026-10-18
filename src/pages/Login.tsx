import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useUsers, useSaveUser } from '@/lib/hooks';
import { hashPassword } from '@/lib/passwordHash';
import { isSupabaseMode } from '@/lib/supabase';
import { signInWithPassword } from '@/lib/supabaseAuth';

const FEATURES = [
  'Deterministic Basel III liquidity, IRRBB and stress-testing engine',
  'Real segregation of duties, with maker-checker on every approval',
  'Full audit trail, with every mutation traced to who, what and when',
  'Affiliate-scoped access, so each market sees only its own data',
];

export function Login() {
  const { login } = useAuth();
  // The directory is only readable after sign-in on Supabase; the local path still matches against it.
  const { data: users = [] } = useUsers({ enabled: !isSupabaseMode });
  const saveUser = useSaveUser();
  const [, navigate] = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (isSupabaseMode) {
        try {
          login(await signInWithPassword(email, password));
          navigate('/dashboard');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Sign-in failed.');
        }
        return;
      }
      const account = users.find((u) => u.isActive && u.email.trim().toLowerCase() === email.trim().toLowerCase());
      const enteredHash = await hashPassword(password);
      if (!account || account.passwordHash !== enteredHash) {
        setError('Invalid email or password.');
        return;
      }
      const signedIn = { ...account, lastLoginAt: new Date().toISOString() };
      // Persisted, not just held in the in-memory session - Users & Roles and My Account both read
      // this off the stored user record, which otherwise never learns a login happened at all and
      // shows "Never" forever regardless of how many times someone actually signs in.
      await saveUser.mutateAsync(signedIn);
      login(signedIn);
      navigate('/dashboard');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-full font-sans">
      {/* Left panel - brand */}
      <div className="hidden w-1/2 flex-col bg-navy-900 px-20 py-16 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white p-1">
            <img src="/logo-icon.png" alt="Ecobank" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-[19px] font-bold tracking-wide">Ecobank</p>
            <p className="text-[13px] text-white/60">ALM Platform</p>
          </div>
        </div>
        <p className="mt-8 text-[13px] uppercase tracking-wide text-gold-400">Group Asset & Liability Management</p>
        <div className="mt-3 h-1 w-10 rounded-full bg-gold-500" />

        <div className="flex flex-1 flex-col justify-center">
          <h1 className="text-[34px] font-bold leading-[1.15]">
            Asset & Liability Management
            <br />
            <span className="text-gold-400">For Every Affiliate, One Platform.</span>
          </h1>
          <p className="mt-8 max-w-xl text-[14px] leading-relaxed text-white/75">
            Group oversight and affiliate control in one system, with every number traceable to its source data.
          </p>
          <ul className="mt-14 space-y-6">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-4">
                <span className="h-6 w-1 shrink-0 rounded-full bg-gold-500" />
                <span className="text-[13px] text-white/85">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[12px] text-white/40">Powered by Qucoon Limited</p>
      </div>

      {/* Right panel - sign in */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto bg-gray-50 px-6">
        <div className="w-full max-w-lg">
          <div className="mb-14 text-center">
            <h2 className="text-[24px] font-bold text-navy-900">Sign In</h2>
            <p className="mt-2 text-[13px] text-gray-500">Ascent ALM Platform, Ecobank Group</p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-8">
            <div>
              <label htmlFor="email-input" className="mb-2 block text-[13px] font-semibold text-navy-900">
                Email Address
              </label>
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                className="w-full rounded-lg border border-gray-200 bg-white px-5 py-4 text-[13px] text-gray-800 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="password-input" className="block text-[13px] font-semibold text-navy-900">
                  Password
                </label>
                <button type="button" className="text-[13px] text-gold-600 hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-lg border border-gray-200 bg-white px-5 py-4 pr-12 text-[13px] text-gray-800 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gold-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-navy-900"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                    {showPassword && <line x1="3" y1="3" x2="21" y2="21" />}
                  </svg>
                </button>
              </div>
            </div>

            {error && <p className="text-[13px] font-medium text-danger">{error}</p>}

            <div className="flex items-center">
              <input
                type="checkbox"
                id="remember"
                defaultChecked
                className="h-4 w-4 rounded border-gray-300 text-gold-500 focus:ring-gold-500"
              />
              <label htmlFor="remember" className="ml-2 block text-[13px] text-gray-600">
                Remember this device
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !email || !password}
              className="w-full rounded-lg bg-gold-500 py-4 text-[13px] font-bold text-navy-900 shadow-sm transition-all hover:bg-gold-400 focus:outline-none focus:ring-2 focus:ring-navy-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-16 space-y-1 text-center text-[12px] text-gray-400">
            <p>© 2026 Ecobank Group. All rights reserved.</p>
            <p>Aligned with Basel III / IRRBB regulatory standards across all affiliate markets.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
