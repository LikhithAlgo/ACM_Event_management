/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import { redirectToHost } from '../lib/hosts';

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuth = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        navigate('/');
        return;
      }

      try {
        // Check the user's role from our backend
        const user = await fetchApi('/events/me');
        const didRedirect = redirectToHost(user.role, '/dashboard');
        if (didRedirect) return;
        navigate('/dashboard');
      } catch {
        // If /me fails, still redirect to dashboard
        navigate('/dashboard');
      }
    };

    handleAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          try {
            const user = await fetchApi('/events/me');
            const didRedirect = redirectToHost(user.role, '/dashboard');
            if (didRedirect) return;
            navigate('/dashboard');
          } catch {
            navigate('/dashboard');
          }
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <h2 className="text-xl font-medium text-slate-700">Authenticating...</h2>
      </div>
    </div>
  );
}
