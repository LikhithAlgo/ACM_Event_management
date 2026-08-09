/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Settings, Users, Activity, LogOut, Plus, X } from 'lucide-react';
import { fetchApi } from '../lib/api';
import toast from 'react-hot-toast';
import type { QuizEvent } from '../lib/types';

export function AdminDashboard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<QuizEvent[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    name: '', description: '', type: 'STANDARD', maxParticipants: '',
    startTime: '', endTime: '',
    enableFFF: false, lifelineFifty: false, lifelineFlip: false, lifelinePhone: false
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { navigate('/'); return; }
      try {
        const dbUser = await fetchApi('/events/me');
        if (dbUser.role !== 'ADMIN') { navigate('/dashboard'); return; }
        loadEvents();
      } catch { navigate('/'); }
    });
  }, [navigate]);

  const loadEvents = async () => {
    try {
      const data = await fetchApi('/events');
      setEvents(data);
    } catch (e) { console.error(e); }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await fetchApi('/events', {
        method: 'POST',
        body: JSON.stringify({
          ...newEvent,
          maxParticipants: newEvent.maxParticipants ? parseInt(newEvent.maxParticipants) : null
        })
      });
      setShowCreateModal(false);
      setNewEvent({ name: '', description: '', type: 'STANDARD', maxParticipants: '', startTime: '', endTime: '', enableFFF: false, lifelineFifty: false, lifelineFlip: false, lifelinePhone: false });
      toast.success('Event created successfully!');
      loadEvents();
    } catch (e: any) { toast.error(e.message || 'Failed to create event'); }
    finally { setCreating(false); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'LIVE': return 'bg-success/10 text-success';
      case 'READY': return 'bg-primary/10 text-primary';
      case 'DRAFT': return 'bg-slate-100 text-slate-500';
      case 'CLOSED': return 'bg-error/10 text-error';
      default: return 'bg-slate-100 text-slate-500';
    }
  };

  const totalParticipants = events.reduce((sum, e) => sum + (e._count?.submissions || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col">
        <div className="p-6 border-b border-slate-800 text-white font-display font-bold text-xl">ACMQuiz Admin</div>
        <nav className="flex-1 p-4 space-y-2">
          <a href="#" className="flex items-center gap-3 px-4 py-2 bg-primary/10 text-primary rounded-lg font-medium">
            <Activity size={18} /> Overview
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-2 hover:bg-slate-800 rounded-lg transition-colors">
            <Settings size={18} /> Event Management
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-2 hover:bg-slate-800 rounded-lg transition-colors">
            <Users size={18} /> Participants
          </a>
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button onClick={() => supabase.auth.signOut().then(() => navigate('/'))} className="flex items-center gap-3 px-4 py-2 text-slate-400 hover:text-white transition-colors w-full">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <header className="bg-white border-b border-borderMuted p-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-900">Overview Dashboard</h1>
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-accent transition-colors">
            <Plus size={18} /> Create Event
          </button>
        </header>

        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border border-borderMuted shadow-soft">
            <div className="text-sm font-medium text-slate-500 mb-1">Total Events</div>
            <div className="text-3xl font-bold text-slate-900">{events.length}</div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-borderMuted shadow-soft">
            <div className="text-sm font-medium text-slate-500 mb-1">Total Submissions</div>
            <div className="text-3xl font-bold text-slate-900">{totalParticipants}</div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-borderMuted shadow-soft">
            <div className="text-sm font-medium text-slate-500 mb-1">Live Events</div>
            <div className="text-3xl font-bold text-success flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
              {events.filter(e => e.status === 'LIVE').length}
            </div>
          </div>
        </div>

        {/* Events Table */}
        <div className="px-8 flex-1 pb-8">
          <div className="bg-white border border-borderMuted rounded-xl shadow-soft overflow-hidden">
            <div className="p-6 border-b border-borderMuted bg-slate-50">
              <h2 className="text-lg font-bold text-slate-900">All Events</h2>
            </div>
            {events.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">
                No events yet. Click "Create Event" to get started.
              </div>
            ) : (
              <div className="divide-y divide-borderMuted">
                {events.map((evt) => (
                  <div key={evt.id} className="p-4 flex justify-between items-center hover:bg-slate-50">
                    <div className="flex items-center gap-4">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${getStatusColor(evt.status)}`}>
                        {evt.status}
                      </span>
                      <div>
                        <h3 className="font-bold text-slate-900">{evt.name}</h3>
                        <p className="text-sm text-slate-500">{evt.description} · {evt.type} · {new Date(evt.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => navigate(`/admin/event/${evt.id}`)}
                      className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 font-medium"
                    >
                      Manage
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-brutal p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-display font-bold text-slate-900">Create New Event</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Event Name *</label>
                <input type="text" value={newEvent.name} onChange={e => setNewEvent({...newEvent, name: e.target.value})} required
                  className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors" placeholder="Tech Trivia 2025" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} rows={2}
                  className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors resize-none" placeholder="A fun quiz competition for all ACM members" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Event Type *</label>
                  <select value={newEvent.type} onChange={e => setNewEvent({...newEvent, type: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors bg-white">
                    <option value="STANDARD">Standard Quiz</option>
                    <option value="KBC">KBC Mode</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Max Participants</label>
                  <input type="number" value={newEvent.maxParticipants} onChange={e => setNewEvent({...newEvent, maxParticipants: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors" placeholder="100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
                  <input type="datetime-local" value={newEvent.startTime} onChange={e => setNewEvent({...newEvent, startTime: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Time</label>
                  <input type="datetime-local" value={newEvent.endTime} onChange={e => setNewEvent({...newEvent, endTime: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors" />
                </div>
              </div>

              {newEvent.type === 'KBC' && (
                <div className="bg-slate-50 p-4 rounded-xl border border-borderMuted">
                  <p className="text-sm font-bold text-slate-700 mb-3">KBC Options</p>
                  <div className="space-y-2">
                    {[
                      { key: 'enableFFF', label: 'Enable Fastest Finger First' },
                      { key: 'lifelineFifty', label: '50:50 Lifeline' },
                      { key: 'lifelineFlip', label: 'Flip the Question' },
                      { key: 'lifelinePhone', label: 'Phone a Friend' },
                    ].map(opt => (
                      <label key={opt.key} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={(newEvent as any)[opt.key]} onChange={e => setNewEvent({...newEvent, [opt.key]: e.target.checked})}
                          className="rounded border-slate-300" />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button type="submit" disabled={creating}
                className="w-full px-4 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-accent transition-colors shadow-soft disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Event'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
