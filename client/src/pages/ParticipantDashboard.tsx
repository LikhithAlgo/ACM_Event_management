/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { LogOut, Play, Clock, ChevronRight, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { fetchApi } from '../lib/api';
import type { QuizEvent } from '../lib/types';

interface HistoryEntry {
  eventId: string;
  eventName: string;
  eventStatus: string;
  totalPoints: number;
  submissions: number;
  rank: number | null;
}

export function ParticipantDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [dbUser, setDbUser] = useState<any>(null);
  const [events, setEvents] = useState<QuizEvent[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  // Profile modal states
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', usn: '', branch: '', year: '1st Year' });

  async function loadEvents() {
    try {
      const data = await fetchApi('/events');
      setEvents(data);
    } catch (e) { console.error(e); }
  }

  async function loadHistory() {
    try {
      const hist = await fetchApi('/events/me/history');
      setHistory(hist);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { navigate('/'); return; }
      setUser(user);
      try {
        const profile = await fetchApi('/events/me');
        setDbUser(profile);
        
        // Show profile modal if details are missing
        if (!profile.usn || !profile.branch || !profile.year || !profile.name) {
          setProfileForm({
            name: profile.name || '',
            usn: profile.usn || '',
            branch: profile.branch || '',
            year: profile.year || '1st Year'
          });
          setShowProfileModal(true);
        }
        
        loadEvents();
        loadHistory();
      } catch {
        navigate('/');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await fetchApi('/events/me/profile', {
        method: 'PUT',
        body: JSON.stringify(profileForm)
      });
      setDbUser(updated);
      setShowProfileModal(false);
      toast.success('Profile updated successfully!');
      loadEvents();
      loadHistory();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'LIVE': return <span className="inline-block px-2.5 py-1 bg-success/10 text-success text-xs font-bold rounded-full mb-2">LIVE NOW</span>;
      case 'READY': return <span className="inline-block px-2.5 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full mb-2">STARTING SOON</span>;
      case 'DRAFT': return <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-full mb-2">DRAFT</span>;
      case 'CLOSED': return <span className="inline-block px-2.5 py-1 bg-error/10 text-error text-xs font-bold rounded-full mb-2">CLOSED</span>;
      default: return null;
    }
  };

  const liveEvents = events.filter(e => e.status === 'LIVE' || e.status === 'READY');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-borderMuted px-8 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center font-bold text-xl">
            A
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">ACM Quiz Portal</h1>
            <p className="text-xs text-slate-500">Participant Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900">{user?.user_metadata?.full_name || user?.email?.split('@')[0]}</p>
            <p className="text-xs text-slate-500">{user?.email}</p>
          </div>
          {dbUser?.role === 'ADMIN' && (
            <button
              onClick={() => navigate('/admin')}
              className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-accent transition-colors text-sm flex items-center gap-2"
            >
              <Shield size={16} /> Admin
            </button>
          )}
          <button onClick={handleLogout} className="text-slate-500 hover:text-error transition-colors p-1" title="Logout">
            <LogOut size={24} />
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 max-w-5xl mx-auto w-full space-y-8">

        {/* Active Events */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Play className="text-primary" /> Active Events
          </h2>

          {liveEvents.length === 0 ? (
            <div className="p-6 text-center text-slate-500 border border-borderMuted rounded-xl bg-white shadow-soft">
              No live or upcoming events right now.
            </div>
          ) : (
            liveEvents.map((evt) => (
              <motion.div
                key={evt.id}
                whileHover={{ y: -2 }}
                className="p-6 border border-borderMuted bg-white rounded-xl shadow-soft hover:shadow-md transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    {getStatusBadge(evt.status)}
                    <h3 className="text-xl font-bold text-slate-900">{evt.name}</h3>
                    <p className="text-slate-500 text-sm mt-1">{evt.description}</p>
                  </div>
                  <button
                    onClick={() => navigate(`/quiz/${evt.id}`)}
                    disabled={evt.status === 'DRAFT'}
                    className="px-6 py-2 bg-primary text-white font-bold rounded-lg shadow-soft hover:bg-primary-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Join Event
                  </button>
                </div>
              </motion.div>
            ))
          )}

          {/* My Events — real history */}
          <h2 className="text-2xl font-bold text-slate-900 mt-10 mb-4 flex items-center gap-2">
            <Clock size={22} className="text-slate-400" /> My Events
          </h2>
          {loadingHistory ? (
            <div className="p-6 text-center text-slate-400">Loading...</div>
          ) : history.length === 0 ? (
            <div className="p-6 text-center text-slate-500 border border-borderMuted rounded-xl bg-white shadow-soft">
              You haven't participated in any events yet.
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((h) => (
                <div key={h.eventId} className="p-5 border border-borderMuted bg-white rounded-xl shadow-soft flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{h.eventName}</h3>
                    <p className="text-slate-500 text-sm">
                      {h.submissions} answer{h.submissions !== 1 ? 's' : ''} submitted
                      {h.rank ? ` · Ranked #${h.rank}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-primary">{h.totalPoints} pts</span>
                    <ChevronRight size={16} className="text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.15)] border border-borderMuted p-8 w-full max-w-md">
            <h2 className="text-2xl font-display font-bold text-slate-900 mb-2">Complete Your Profile</h2>
            <p className="text-slate-500 text-sm mb-6">Before you can participate in any quiz events, please provide your details so the organizers can track your score.</p>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                <input 
                  type="text" 
                  value={profileForm.name} 
                  onChange={e => setProfileForm({...profileForm, name: e.target.value})} 
                  required
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">USN *</label>
                <input 
                  type="text" 
                  value={profileForm.usn} 
                  onChange={e => setProfileForm({...profileForm, usn: e.target.value.toUpperCase()})} 
                  required
                  placeholder="e.g. 1RV21CS001"
                  className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Branch *</label>
                  <input 
                    type="text" 
                    value={profileForm.branch} 
                    onChange={e => setProfileForm({...profileForm, branch: e.target.value})} 
                    required
                    placeholder="e.g. CSE"
                    className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Year *</label>
                  <select 
                    value={profileForm.year} 
                    onChange={e => setProfileForm({...profileForm, year: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors bg-white"
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                </div>
              </div>
              <button 
                type="submit" 
                disabled={savingProfile}
                className="w-full px-4 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-accent transition-colors disabled:opacity-50 mt-2 shadow-soft"
              >
                {savingProfile ? 'Saving...' : 'Save & Continue'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
