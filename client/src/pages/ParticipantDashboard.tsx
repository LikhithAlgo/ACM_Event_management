/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { LogOut, Play, Trophy, Clock, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
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

interface GlobalRankEntry {
  name: string;
  totalScore: number;
}

export function ParticipantDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [events, setEvents] = useState<QuizEvent[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [globalRanks, setGlobalRanks] = useState<GlobalRankEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  async function loadEvents() {
    try {
      const data = await fetchApi('/events');
      setEvents(data);
    } catch (e) { console.error(e); }
  }

  async function loadHistory() {
    try {
      const [hist, ranks] = await Promise.all([
        fetchApi('/events/me/history'),
        fetchApi('/events/global-ranks'),
      ]);
      setHistory(hist);
      setGlobalRanks(ranks);
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
        const dbUser = await fetchApi('/events/me');
        if (dbUser.role === 'ADMIN') { navigate('/admin'); return; }
      // eslint-disable-next-line no-empty
      } catch {}
      loadEvents();
      loadHistory();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="flex items-center justify-between px-8 py-4 bg-white shadow-soft border-b border-borderMuted">
        <div className="text-xl font-display font-bold text-slate-900">ACMQuiz</div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {user?.email?.charAt(0).toUpperCase()}
            </span>
            <span className="text-sm font-medium">{user?.user_metadata?.full_name || user?.email}</span>
          </div>
          <button onClick={handleLogout} className="text-slate-500 hover:text-error transition-colors" title="Logout">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column: Events */}
        <div className="lg:col-span-2 space-y-6">
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

        {/* Right Column: Global Rankings */}
        <div className="space-y-8">
          <div className="bg-white border border-borderMuted rounded-xl p-6 shadow-soft">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Trophy className="text-warning" size={20} /> Global Rankings
            </h3>
            {loadingHistory ? (
              <div className="text-center text-slate-400 py-4 text-sm">Loading...</div>
            ) : globalRanks.length === 0 ? (
              <div className="text-center text-slate-400 py-4 text-sm">No rankings yet.</div>
            ) : (
              <div className="space-y-3">
                {globalRanks.slice(0, 5).map((r, i) => {
                  const isMe = r.name === (user?.user_metadata?.full_name || user?.email?.split('@')[0]);
                  return (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${isMe ? 'bg-primary/5 border border-primary/20' : 'bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${i === 0 ? 'text-warning' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-600' : 'text-slate-400'}`}>#{i + 1}</span>
                        <span className={`text-sm ${isMe ? 'font-bold text-primary' : 'text-slate-700'}`}>{isMe ? 'You' : r.name}</span>
                      </div>
                      <span className="text-sm font-medium text-slate-600">{r.totalScore} pts</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
