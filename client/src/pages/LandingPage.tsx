/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import { ShieldCheck, Trophy, Sparkles, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { redirectToHost } from '../lib/hosts';

export function LandingPage() {
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Student metadata fields
  const [usn, setUsn] = useState('');
  const [year, setYear] = useState('1st Year');
  const [branch, setBranch] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        try {
          const user = await fetchApi('/events/me');
          const didRedirect = redirectToHost(user.role, user.role === 'ADMIN' ? '/admin' : '/dashboard');
          if (didRedirect) return;
          navigate(user.role === 'ADMIN' ? '/admin' : '/dashboard');
        } catch {
          // If profile lookup fails, sign out to clear any stale/invalid local session
          await supabase.auth.signOut();
        }
      }
    });
  }, [navigate]);

  const redirectByRole = async () => {
    try {
      const user = await fetchApi('/events/me');
      const didRedirect = redirectToHost(user.role, user.role === 'ADMIN' ? '/admin' : '/dashboard');
      if (didRedirect) return;
      navigate(user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch {
      toast.error('Failed to load user profile. Please try again.');
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
          data: {
            full_name: name,
            usn: usn.trim().toUpperCase(),
            year,
            branch: branch.trim()
          }
        }
      });

      if (error) {
        setError(error.message);
      } else {
        toast.success('Account created! Please check your email for verification, then sign in.');
        setAuthMode('login');
        setPassword('');
      }
    } catch (err: any) {
      setError(err.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row font-sans">
      {/* Left Pane - Product Pitch (45%) */}
      <div className="w-full md:w-[45%] bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-8 md:p-16 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800/60 relative overflow-hidden shrink-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[100px] rounded-full mix-blend-screen pointer-events-none" />
        
        {/* Logo/Branding */}
        <div className="z-10 flex items-center gap-2">
          <div className="w-10 h-10 bg-primary/20 border border-primary/40 rounded-xl flex items-center justify-center text-primary font-bold text-xl">
            A
          </div>
          <span className="text-2xl font-display font-extrabold text-white tracking-tight">ACMQuiz</span>
        </div>

        {/* Hero Pitch */}
        <div className="z-10 my-12 md:my-0">
          <h1 className="text-4xl md:text-5xl font-display font-black text-white leading-tight mb-6">
            The Ultimate Real-time Quiz Platform
          </h1>
          <p className="text-slate-400 leading-relaxed mb-8 text-base">
            Participate in chapter events, attempt live proctored quizzes, and view real-time dynamic leaderboards. Simple for participants, powerful for admins.
          </p>

          {/* Features bullet list */}
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Trophy size={16} />
              </div>
              <div>
                <h4 className="font-bold text-slate-200 text-sm">WebSocket Speed</h4>
                <p className="text-slate-400 text-xs mt-0.5">Live multiplayer score calculations and projector dashboards.</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Sparkles size={16} />
              </div>
              <div>
                <h4 className="font-bold text-slate-200 text-sm">KBC Lifelines & FFF</h4>
                <p className="text-slate-400 text-xs mt-0.5">Built-in Kaun Banega Crorepati TV-show style support.</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <ShieldCheck size={16} />
              </div>
              <div>
                <h4 className="font-bold text-slate-200 text-sm">Smart Proctoring</h4>
                <p className="text-slate-400 text-xs mt-0.5">Anti-cheat warnings and logs whenever a participant changes tabs.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="z-10 text-xs text-slate-500 mt-6 md:mt-0">
          © 2025 ACMQuiz Chapter. Self-hosted and secure.
        </div>
      </div>

      {/* Right Pane - Centered Auth Card (55%) */}
      <div className="flex-1 bg-slate-950 flex items-center justify-center p-6 md:p-16 relative">
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[100px] rounded-full mix-blend-screen pointer-events-none" />

        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-[0_4px_30px_rgba(0,0,0,0.4)] z-10">
          {/* Header tabs to switch between Login and Signup */}
          <div className="flex border-b border-slate-800 mb-6">
            <button
              onClick={() => { setAuthMode('login'); setError(''); }}
              className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all ${
                authMode === 'login' 
                  ? 'border-primary text-white' 
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('signup'); setError(''); }}
              className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-all ${
                authMode === 'signup' 
                  ? 'border-primary text-white' 
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Create Account
            </button>
          </div>

          <h2 className="text-2xl font-display font-extrabold text-white mb-2">
            {authMode === 'login' ? 'Welcome Back' : 'Get Registered'}
          </h2>
          <p className="text-slate-400 text-xs mb-6">
            {authMode === 'login' 
              ? 'Access your events, quizzes, and live scoreboards.' 
              : 'Complete your profile to qualify for the chapter leaderboards.'}
          </p>

          {/* Social OAuth Google Button */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-xl text-slate-200 font-bold text-sm transition-all mb-4 active:scale-[0.98]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-slate-800"></div>
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">OR</span>
            <div className="flex-1 h-px bg-slate-800"></div>
          </div>

          {/* Auth Form */}
          <form onSubmit={authMode === 'login' ? handleEmailLogin : handleEmailSignup} className="space-y-4">
            {authMode === 'signup' && (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:bg-slate-800 transition-colors text-sm"
                  required
                />
                
                <input
                  type="text"
                  placeholder="USN (e.g. 4NM22CS001)"
                  value={usn}
                  onChange={(e) => setUsn(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:bg-slate-800 transition-colors text-sm font-mono uppercase"
                  required
                />

                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <select
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:bg-slate-800 transition-colors text-sm appearance-none cursor-pointer"
                      required
                    >
                      <option value="1st Year" className="bg-slate-900">1st Year</option>
                      <option value="2nd Year" className="bg-slate-900">2nd Year</option>
                      <option value="3rd Year" className="bg-slate-900">3rd Year</option>
                      <option value="4th Year" className="bg-slate-900">4th Year</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                      ▼
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Branch (e.g. CSE)"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:bg-slate-800 transition-colors text-sm"
                    required
                  />
                </div>
              </div>
            )}

            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:bg-slate-800 transition-colors text-sm"
              required
            />
            
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-4 pr-12 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:bg-slate-800 transition-colors text-sm"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-200 transition-colors focus:outline-none"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <p className="text-red-500 text-xs font-semibold bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                ⚠️ {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-primary hover:bg-primary-accent text-white font-extrabold rounded-xl transition-all shadow-md shadow-primary/20 disabled:opacity-50 text-sm active:scale-[0.98]"
            >
              {loading ? 'Please wait...' : (authMode === 'login' ? 'Sign In' : 'Register Profile')}
            </button>
          </form>

          {/* Quick link switcher for local testing */}
          <div className="mt-8 text-center bg-slate-900/50 p-4 border border-slate-800 rounded-xl">
            <p className="text-slate-400 text-xs font-semibold mb-2">Quick Portal Access</p>
            <div className="flex justify-center gap-4 text-xs font-bold">
              <a href="http://localhost:5173" className="text-blue-400 hover:underline">
                Participant Portal (5173)
              </a>
              <span className="text-slate-600">|</span>
              <a href="http://localhost:5174" className="text-amber-400 hover:underline">
                Admin Portal (5174)
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
