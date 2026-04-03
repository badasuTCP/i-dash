import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Loader, Shield, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login, loading, isAuthenticated } = useAuth();
  const { isDark } = useTheme();

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

  // Demo buttons call login() directly — this is what makes RBA work
  const handleDemoLogin = async (demoEmail) => {
    setLocalLoading(true);
    setEmail(demoEmail);
    setPassword('demo123456');

    const result = await login(demoEmail, 'demo123456');

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
    <div className={`min-h-screen flex items-center justify-center relative overflow-hidden px-4 py-8 sm:py-0 ${
      isDark ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950' : 'bg-gradient-to-br from-white via-blue-50 to-white'
    }`}>
      {/* Animated background orbs — hidden on small screens for performance */}
      <motion.div
        className={`hidden sm:block absolute top-20 left-10 w-72 h-72 rounded-full mix-blend-multiply filter blur-3xl ${
          isDark ? 'bg-[#265AA9]/20' : 'bg-[#265AA9]/12'
        }`}
        animate={{ x: [0, 50, 0], y: [0, 30, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className={`hidden sm:block absolute bottom-20 right-10 w-72 h-72 rounded-full mix-blend-multiply filter blur-3xl ${
          isDark ? 'bg-[#55A8C3]/20' : 'bg-[#55A8C3]/12'
        }`}
        animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Content — responsive width */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-sm sm:max-w-md"
      >
        {/* Logo and branding */}
        <div className="text-center mb-6 sm:mb-8">
          <motion.div
            className="inline-flex flex-col items-center gap-3 mb-4 sm:mb-6"
            whileHover={{ scale: 1.03 }}
          >
            {/* Full CP Logo — large and prominent */}
            <img
              src="/logo-full.svg"
              alt="The Concrete Protector"
              className="w-32 h-32 sm:w-40 sm:h-40 object-contain drop-shadow-lg"
              onError={(e) => {
                // Fallback to shield if full logo missing
                e.target.onerror = null;
                e.target.src = '/logo-shield.svg';
                e.target.className = 'w-16 h-16 sm:w-20 sm:h-20 object-contain';
              }}
            />
            <h1 className={`text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              I-Dash
            </h1>
          </motion.div>
          <p className={`text-base sm:text-lg font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Enterprise Analytics Reimagined
          </p>
          <p className={`text-xs sm:text-sm mt-1.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            Premium insights for your business at lightning speed
          </p>
        </div>

        {/* Login card — responsive padding */}
        <motion.div
          className={`rounded-xl p-5 sm:p-8 ${
            isDark
              ? 'bg-[#1e2235]/80 border border-slate-700/50 shadow-2xl backdrop-blur-sm'
              : 'bg-white shadow-lg border border-slate-200'
          }`}
        >
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className={`block text-sm font-medium mb-1.5 sm:mb-2 ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}>
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" size={18} />
                <input
                  id="email"
                  type="email"
                  placeholder="you@theconcreteprotector.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className={`w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-lg text-sm outline-none transition-all ${
                    isDark
                      ? 'bg-[#0f1117] text-white border border-slate-700/50 focus:border-[#55A8C3]/50 placeholder-slate-500'
                      : 'bg-slate-50 text-slate-900 border border-slate-200 focus:border-[#265AA9]/50 placeholder-slate-400'
                  }`}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className={`block text-sm font-medium mb-1.5 sm:mb-2 ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}>
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" size={18} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className={`w-full pl-10 pr-10 py-2.5 sm:py-3 rounded-lg text-sm outline-none transition-all ${
                    isDark
                      ? 'bg-[#0f1117] text-white border border-slate-700/50 focus:border-[#55A8C3]/50 placeholder-slate-500'
                      : 'bg-slate-50 text-slate-900 border border-slate-200 focus:border-[#265AA9]/50 placeholder-slate-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${
                    isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'
                  }`}
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="flex justify-end">
              <a href="#" className="text-xs sm:text-sm text-[#55A8C3] hover:text-[#265AA9] transition-colors">
                Forgot password?
              </a>
            </div>

            {/* Sign in button */}
            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-2.5 sm:py-3 rounded-lg bg-gradient-to-r from-[#265AA9] to-[#55A8C3] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-[#265AA9]/20 transition-shadow disabled:opacity-60"
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

            {/* Divider */}
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className={`w-full border-t ${isDark ? 'border-slate-700/30' : 'border-slate-200'}`} />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className={`px-3 ${isDark ? 'bg-[#1e2235] text-slate-500' : 'bg-white text-slate-400'}`}>Quick Access</span>
              </div>
            </div>

            {/* Demo accounts — these ACTUALLY log in on click */}
            <div className="space-y-2">
              <motion.button
                type="button"
                disabled={isLoading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handleDemoLogin('daniel@theconcreteprotector.com')}
                className={`w-full py-2.5 sm:py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-between px-4 ${
                  isDark
                    ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20 hover:bg-violet-500/20'
                    : 'bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Shield size={16} />
                  <div className="text-left">
                    <span className="block leading-tight">Data Analyst</span>
                    <span className={`text-[10px] ${isDark ? 'text-violet-400/50' : 'text-violet-400'}`}>Super Admin — Full Access</span>
                  </div>
                </div>
                <ChevronRight size={16} className="opacity-40" />
              </motion.button>

              <motion.button
                type="button"
                disabled={isLoading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handleDemoLogin('exec@theconcreteprotector.com')}
                className={`w-full py-2.5 sm:py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-between px-4 ${
                  isDark
                    ? 'bg-[#265AA9]/10 text-[#55A8C3] border border-[#265AA9]/20 hover:bg-[#265AA9]/20'
                    : 'bg-blue-50 text-[#265AA9] border border-blue-200 hover:bg-blue-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Shield size={16} />
                  <div className="text-left">
                    <span className="block leading-tight">Executive</span>
                    <span className={`text-[10px] ${isDark ? 'text-[#55A8C3]/50' : 'text-blue-400'}`}>Dashboards & AI Only</span>
                  </div>
                </div>
                <ChevronRight size={16} className="opacity-40" />
              </motion.button>
            </div>
          </form>

          {/* Sign up link */}
          <div className={`mt-5 sm:mt-6 pt-4 sm:pt-5 border-t text-center ${isDark ? 'border-slate-700/30' : 'border-slate-200'}`}>
            <p className={`text-xs sm:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Don't have an account?{' '}
              <a href="#" className="font-medium text-[#55A8C3] hover:text-[#265AA9] transition-colors">
                Contact your admin
              </a>
            </p>
          </div>
        </motion.div>

        {/* Footer */}
        <div className="mt-6 sm:mt-8 text-center space-y-1.5">
          <p className={`text-[10px] sm:text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            Protected by enterprise-grade security
          </p>
          <div className={`flex items-center justify-center gap-3 sm:gap-4 text-[10px] sm:text-xs ${isDark ? 'text-slate-600' : 'text-slate-600'}`}>
            <a href="#" className={`transition-colors ${isDark ? 'hover:text-slate-400' : 'hover:text-slate-700'}`}>Privacy</a>
            <span>&middot;</span>
            <a href="#" className={`transition-colors ${isDark ? 'hover:text-slate-400' : 'hover:text-slate-700'}`}>Terms</a>
            <span>&middot;</span>
            <a href="#" className={`transition-colors ${isDark ? 'hover:text-slate-400' : 'hover:text-slate-700'}`}>Support</a>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
