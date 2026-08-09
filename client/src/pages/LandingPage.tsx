/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';

export function LandingPage() {
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        try {
          const user = await fetchApi('/events/me');
          navigate(user.role === 'ADMIN' ? '/admin' : '/dashboard');
        } catch {
          navigate('/dashboard');
        }
      }
    });
  }, [navigate]);

  const redirectByRole = async () => {
    try {
      const user = await fetchApi('/events/me');
      navigate(user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch {
      navigate('/dashboard');
    }
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        await redirectByRole();
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name }
        }
      });
      if (error) {
        setError(error.message);
      } else {
        setError('');
        setAuthMode('login');
        alert('Account created! Please check your email for verification, then log in.');
      }
    } catch (err: any) {
      setError(err.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6 border-b border-borderMuted">
        <div className="text-2xl font-display font-bold text-slate-900 tracking-tight">ACMQuiz</div>
        <div className="flex gap-4">
          <button 
            onClick={() => { setAuthMode('login'); setShowAuthModal(true); setError(''); }}
            className="px-5 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
          >
            Login
          </button>
          <button 
            onClick={() => { setAuthMode('signup'); setShowAuthModal(true); setError(''); }}
            className="px-5 py-2 text-sm font-medium bg-primary text-white rounded-md hover:bg-primary-accent transition-colors shadow-soft"
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center max-w-5xl mx-auto py-24">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <h1 className="text-5xl md:text-6xl font-display font-extrabold text-slate-900 leading-tight mb-6">
            The Ultimate Quiz Platform for <span className="text-primary">ACM Chapters</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-10">
            Run competitive, real-time quiz events with granular admin controls, KBC-style game modes, and lightning-fast WebSockets—all for free.
          </p>
          
          <button 
            onClick={() => { setAuthMode('signup'); setShowAuthModal(true); setError(''); }}
            className="px-8 py-4 text-lg font-bold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all shadow-brutal active:translate-y-1 active:shadow-none"
          >
            Create Your First Event
          </button>
        </motion.div>

        {/* Bento Grid Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 w-full">
          {[
            { title: "Real-Time Leaderboards", desc: "Sub-second updates pushed via WebSockets for a thrilling live competition." },
            { title: "KBC Game Mode", desc: "Complete TV-show experience with Fastest Finger First and Lifelines." },
            { title: "Granular Control", desc: "Per-question custom points, timers, and staged round access." }
          ].map((feature, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.2 }}
              className="p-8 border border-borderMuted rounded-xl bg-white shadow-soft text-left hover:-translate-y-1 transition-transform"
            >
              <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
              <p className="text-slate-600">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </main>
      
      {/* Footer */}
      <footer className="py-8 text-center text-slate-500 border-t border-borderMuted mt-auto">
        <p>© 2025 ACMQuiz. Open Source and self-hosted.</p>
      </footer>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowAuthModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-brutal p-8 w-full max-w-md"
            >
              <h2 className="text-2xl font-display font-bold text-slate-900 mb-2">
                {authMode === 'login' ? 'Welcome Back' : 'Create an Account'}
              </h2>
              <p className="text-slate-500 text-sm mb-6">
                {authMode === 'login' 
                  ? 'Sign in to access your quizzes and events.' 
                  : 'Join ACMQuiz to compete or create quiz events.'}
              </p>

              {/* Google Login Button */}
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-borderMuted rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors mb-4"
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-borderMuted"></div>
                <span className="text-xs text-slate-400 font-medium">OR</span>
                <div className="flex-1 h-px bg-borderMuted"></div>
              </div>

              {/* Email/Password Form */}
              <form onSubmit={authMode === 'login' ? handleEmailLogin : handleEmailSignup} className="space-y-3">
                {authMode === 'signup' && (
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary transition-colors"
                    required
                  />
                )}
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary transition-colors"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary transition-colors"
                  required
                  minLength={6}
                />

                {error && (
                  <p className="text-error text-sm font-medium">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-accent transition-colors shadow-soft disabled:opacity-50"
                >
                  {loading ? 'Please wait...' : (authMode === 'login' ? 'Sign In' : 'Create Account')}
                </button>
              </form>

              {/* Toggle between login/signup */}
              <p className="text-center text-sm text-slate-500 mt-4">
                {authMode === 'login' ? (
                  <>Don't have an account? <button onClick={() => { setAuthMode('signup'); setError(''); }} className="text-primary font-medium hover:underline">Sign up</button></>
                ) : (
                  <>Already have an account? <button onClick={() => { setAuthMode('login'); setError(''); }} className="text-primary font-medium hover:underline">Sign in</button></>
                )}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
