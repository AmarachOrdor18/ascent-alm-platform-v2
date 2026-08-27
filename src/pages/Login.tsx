import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useUsers } from '@/lib/hooks';
import { hashPassword } from '@/lib/passwordHash';

const FEATURES = [
  'Deterministic Basel III liquidity, IRRBB and stress-testing engine',
  'Real segregation of duties — maker-checker on every approval',
  'Full audit trail — every mutation traced to who, what, when',
  'Affiliate-scoped access — each market sees only its own data',
];

export function Login() {
  const { login } = useAuth();
  const { data: users = [] } = useUsers();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const account = users.find(
        (u) => u.isActive && u.email.trim().toLowerCase() === email.trim().toLowerCase(),
      );
      const enteredHash = await hashPassword(password);
      if (!account || account.passwordHash !== enteredHash) {
        setError('Invalid email or password.');
        return;
      }
      login({ ...account, lastLoginAt: new Date().toISOString() });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 w-full font-sans">
      {/* Left Panel */}
      <div className="w-[45%] bg-navy-900 flex flex-col justify-between p-12 text-white overflow-y-auto">
        <div>
          <div className="mb-10">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white p-1">
                <img src="/logo-icon.png" alt="Ecobank" className="h-full w-full object-contain" />
              </div>
              <div>
                <h1 className="text-[20px] font-bold tracking-wide">Ecobank</h1>
                <p className="text-[12px] text-white/60">ALM Platform</p>
              </div>
            </div>
          </div>

          <p className="text-gold-400 text-sm tracking-wide uppercase">Group Asset & Liability Management</p>
          <div className="h-1 w-10 bg-gold-500 mt-6 mb-6 rounded-full"></div>

          <h2 className="text-[32px] font-bold leading-tight text-white">
            Asset & Liability Management
            <br />
            <span className="text-gold-400">For Every Affiliate, One Platform.</span>
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-gray-300">
            Consolidated Group oversight and affiliate-level control in one system — every liquidity, interest-rate
            and stress-testing number traceable back to the position data and assumptions it was calculated from.
          </p>

          <div className="mt-10 space-y-5 border-l-2 border-white/10 pl-5">
            {FEATURES.map((feature, i) => (
              <div key={i} className="border-l-2 border-gold-500 pl-4 -ml-[22px]">
                <p className="text-gray-200 text-sm leading-relaxed">{feature}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500">Powered by Qucoon Limited</p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col justify-center items-center p-12 relative overflow-y-auto">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-10 my-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-navy-900 mb-2">Sign In</h2>
            <p className="text-sm text-gray-500">Ascent ALM Platform — Ecobank Group</p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-6">
            <div>
              <label htmlFor="email-input" className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all text-gray-700"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="password-input" className="block text-sm font-medium text-gray-700">Password</label>
                <button type="button" className="text-xs text-gold-600 hover:underline">Forgot password?</button>
              </div>
              <input
                id="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all tracking-wider"
                required
              />
            </div>

            {error && <p className="text-xs font-medium text-danger">{error}</p>}

            <div className="flex items-center">
              <input type="checkbox" id="remember" defaultChecked className="h-4 w-4 text-gold-500 focus:ring-gold-500 border-gray-300 rounded" />
              <label htmlFor="remember" className="ml-2 block text-sm text-gray-600">
                Remember this device
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !email || !password}
              className="w-full py-3 px-4 bg-navy-900 hover:bg-navy-800 text-white font-medium rounded-md shadow hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-navy-900 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Signing In…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 flex items-start p-3 bg-warning-bg rounded border border-warning/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-warning mr-2 shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-xs text-warning-700 font-medium">Multi-factor authentication required on first sign-in.</p>
          </div>
        </div>

        <div className="text-center text-xs text-gray-400 pb-4">
          <p>© 2026 Ecobank Group. All rights reserved.</p>
          <p>Aligned with Basel III / IRRBB regulatory standards across all affiliate markets.</p>
        </div>
      </div>
    </div>
  );
}
