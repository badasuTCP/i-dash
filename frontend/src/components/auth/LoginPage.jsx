import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

// Login page is intentionally dark-only. It's the first impression for
// IT/exec walkthroughs and must present a consistent, high-contrast
// brand surface regardless of what theme the user picked inside the
// dashboard. Do NOT wire this to the ThemeContext.
export const LoginPage = () => {
  const navigate = useNavigate();
  const { login, loading, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalLoading(true);

    if (!email || !password) {
      toast.error('Please fill in all fields');
      setLocalLoading(false);
      return;
    }

    const result = await login(email, password);

    if (result.success) {
      toast.success('Welcome back!');
      navigate('/dashboard', { replace: true });
    } else {
      toast.error(result.error || 'Login failed');
    }

    setLocalLoading(false);
  };

  const isLoading = loading || localLoading;

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4 py-8 sm:py-0 bg-[#0B0E14]">
      {/* Ambient brand orbs — subtle, only on larger screens */}
      <motion.div
        className="hidden sm:block absolute top-20 left-10 w-72 h-72 rounded-full mix-blend-screen filter blur-3xl bg-[#265AA9]/20"
        animate={{ x: [0, 50, 0], y: [0, 30, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="hidden sm:block absolute bottom-20 right-10 w-72 h-72 rounded-full mix-blend-screen filter blur-3xl bg-[#55A8C3]/15"
        animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-sm sm:max-w-md"
      >
        {/* Hero brand lockup — logo + app name, nothing else */}
        <div className="flex flex-col items-center text-center mb-8 sm:mb-10">
          <img
            src="/logo-cp-simplified-white.svg"
            alt="The Concrete Protector"
            className="h-16 sm:h-20 w-auto object-contain drop-shadow-[0_8px_24px_rgba(85,168,195,0.25)] mb-5"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '/logo-full.svg';
            }}
          />
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            I-Dash
          </h1>
        </div>

        {/* Login card — glassmorphism on deep charcoal */}
        <motion.div className="rounded-2xl p-6 sm:p-8 bg-white/[0.03] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2 text-slate-300">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" size={18} />
                <input
                  id="email"
                  type="email"
                  placeholder="you@theconcreteprotector.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 rounded-lg text-sm outline-none transition-all bg-[#0f1117] text-white border border-slate-700/50 focus:border-[#55A8C3]/50 placeholder-slate-500"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2 text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" size={18} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-3 rounded-lg text-sm outline-none transition-all bg-[#0f1117] text-white border border-slate-700/50 focus:border-[#55A8C3]/50 placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors text-slate-500 hover:text-slate-300"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Forgot password — subtle, does not compete with Sign In */}
            <div className="flex justify-end">
              <a href="#" className="text-xs sm:text-sm text-slate-500 hover:text-slate-300 transition-colors">
                Forgot password?
              </a>
            </div>

            {/* Sign in — the only primary action on the page */}
            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-[#265AA9] to-[#55A8C3] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-[#265AA9]/25 transition-shadow disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </motion.button>
          </form>

          {/* Contact admin — same subtle grey as forgot password */}
          <div className="mt-6 pt-5 border-t border-white/5 text-center">
            <p className="text-xs sm:text-sm text-slate-500">
              Don't have an account?{' '}
              <a href="#" className="text-slate-400 hover:text-slate-200 transition-colors">
                Contact your admin
              </a>
            </p>
          </div>
        </motion.div>
      </motion.div>

      {/* Build version — bottom-right, understated. Update this string on each release. */}
      <div className="absolute bottom-3 right-4 z-10 text-[10px] font-mono tracking-wide select-none text-slate-600">
        v1.0.4
      </div>
    </div>
  );
};

export default LoginPage;
