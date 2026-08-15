/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Settings, Users, Activity, Plus, X, Shield, Trash2 } from 'lucide-react';
import { fetchApi } from '../lib/api';
import toast from 'react-hot-toast';
import type { QuizEvent } from '../lib/types';
import { redirectToHost } from '../lib/hosts';

export function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'participants'>('overview');
  const [events, setEvents] = useState<QuizEvent[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    name: '', description: '', type: 'STANDARD', maxParticipants: '',
    startTime: '', endTime: '',
    enableFFF: false, lifelineFifty: false, lifelineFlip: false, lifelinePhone: false
  });
  const [creating, setCreating] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoting, setPromoting] = useState(false);

  const [adminEmail, setAdminEmail] = useState<string>('');
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (!isMounted) return;

      if (error || !session || !session.user) {
        toast.error('Session expired. Please log in again.');
        navigate('/');
        return;
      }

      setAdminEmail(session.user.email || '');

      try {
        const dbUser = await fetchApi('/events/me');
        if (!isMounted) return;
        const didRedirect = redirectToHost(dbUser.role, '/admin');
        if (didRedirect) return;
        if (dbUser.role !== 'ADMIN') {
          toast.error('Access denied. Admin permissions required.');
          navigate('/dashboard');
          return;
        }
        setAuthChecking(false);
        loadEvents();
        loadUsers();
      } catch (err: any) {
        if (!isMounted) return;
        toast.error(err.message || 'Session expired. Please log in again.');
        navigate('/');
      }
    });

    return () => { isMounted = false; };
  }, [navigate]);

  const loadEvents = async () => {
    try {
      const data = await fetchApi('/events');
      setEvents(data);
    } catch (e) { console.error(e); }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await fetchApi('/admin/users');
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUsers(false);
    }
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

  const handlePromoteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoteEmail.trim()) return;
    setPromoting(true);
    const toastId = toast.loading('Promoting user...');
    try {
      await fetchApi('/admin/promote', {
        method: 'POST',
        body: JSON.stringify({ email: promoteEmail.trim().toLowerCase() })
      });
      toast.success(`User ${promoteEmail} promoted to Admin!`, { id: toastId });
      setShowPromoteModal(false);
      setPromoteEmail('');
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to promote user', { id: toastId });
    } finally {
      setPromoting(false);
    }
  };

  const handlePromoteUser = async (email: string) => {
    const toastId = toast.loading('Promoting user...');
    try {
      await fetchApi('/admin/promote', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      toast.success(`User ${email} promoted to Admin!`, { id: toastId });
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to promote user', { id: toastId });
    }
  };

  const handleDemoteUser = async (email: string) => {
    if (!window.confirm(`Are you sure you want to demote ${email} to Participant?`)) return;
    const toastId = toast.loading('Demoting user...');
    try {
      await fetchApi('/admin/demote', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      toast.success(`User ${email} demoted to Participant!`, { id: toastId });
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to demote user', { id: toastId });
    }
  };

  const handleDeleteEvent = async (evt: QuizEvent) => {
    if (evt.status === 'LIVE') {
      toast.error(`Cannot delete LIVE event "${evt.name}". Please close the event first.`);
      return;
    }

    const confirmMsg = `Are you sure you want to permanently delete event "${evt.name}"?\n\nThis will remove all associated rounds, questions, submissions, and participant attempts. This action cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    const toastId = toast.loading(`Deleting event "${evt.name}"...`);
    try {
      await fetchApi(`/events/${evt.id}`, { method: 'DELETE' });
      setEvents(prev => prev.filter(e => e.id !== evt.id));
      toast.success(`Event "${evt.name}" deleted successfully!`, { id: toastId });
    } catch (err: any) {
      toast.error(err.message || `Failed to delete event "${evt.name}"`, { id: toastId });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'LIVE': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      case 'READY': return 'bg-primary/20 text-primary border border-primary/30';
      case 'DRAFT': return 'bg-slate-700 text-slate-400';
      case 'CLOSED': return 'bg-red-500/20 text-red-400 border border-red-500/30';
      default: return 'bg-slate-700 text-slate-400';
    }
  };

  const totalParticipants = events.reduce((sum, e) => sum + (e._count?.submissions || 0), 0);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
          <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-bold text-slate-300">Verifying session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <section className="p-8 max-w-6xl mx-auto w-full pb-16">
        <div className="bg-slate-900 text-slate-100 rounded-2xl shadow-xl border-2 border-slate-800 overflow-hidden">
          
          {/* Admin Panel Banner / Header */}
          <div className="bg-slate-950 p-6 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 text-primary rounded-xl border border-primary/30 shrink-0">
                <Shield size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold font-display text-white">Admin Control Panel</h2>
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-primary/20 text-primary border border-primary/30 uppercase tracking-wider">
                    Admin Access
                  </span>
                </div>
                <p className="text-sm text-slate-400">Manage events, MCQ/coding rounds, and registered participants.</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button 
                onClick={() => setShowPromoteModal(true)} 
                className="flex items-center gap-2 border border-slate-700 bg-slate-800 text-slate-200 px-4 py-2 rounded-lg font-medium hover:bg-slate-700 transition-colors text-sm"
              >
                <Users size={16} /> Add Admin
              </button>
              <button 
                onClick={() => setShowCreateModal(true)} 
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-accent transition-colors text-sm shadow-soft"
              >
                <Plus size={16} /> Create Event
              </button>
            </div>
          </div>

          {/* Admin Panel Body: Navigation & Views */}
          <div className="flex flex-col md:flex-row border-t border-slate-800 min-h-[450px]">
            {/* Sidebar Sub-Nav */}
            <aside className="w-full md:w-64 bg-slate-950/60 p-4 border-b md:border-b-0 md:border-r border-slate-800 shrink-0 space-y-2">
              <button 
                onClick={() => setActiveTab('overview')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all w-full text-left ${
                  activeTab === 'overview' ? 'bg-primary text-white shadow-soft' : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity size={18} /> Overview
              </button>
              <button 
                onClick={() => setActiveTab('events')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all w-full text-left ${
                  activeTab === 'events' ? 'bg-primary text-white shadow-soft' : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Settings size={18} /> Event Management
              </button>
              <button 
                onClick={() => setActiveTab('participants')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all w-full text-left ${
                  activeTab === 'participants' ? 'bg-primary text-white shadow-soft' : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users size={18} /> Participants
              </button>
            </aside>

            {/* Tab View Content */}
            <main className="flex-1 p-6 md:p-8 bg-slate-900 text-slate-100 flex flex-col">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-800/80 p-6 rounded-xl border border-slate-700 shadow-soft">
                      <div className="text-sm font-medium text-slate-400 mb-1">Total Events</div>
                      <div className="text-3xl font-bold text-white">{events.length}</div>
                    </div>
                    <div className="bg-slate-800/80 p-6 rounded-xl border border-slate-700 shadow-soft">
                      <div className="text-sm font-medium text-slate-400 mb-1">Total Submissions</div>
                      <div className="text-3xl font-bold text-white">{totalParticipants}</div>
                    </div>
                    <div className="bg-slate-800/80 p-6 rounded-xl border border-slate-700 shadow-soft">
                      <div className="text-sm font-medium text-slate-400 mb-1">Live Events</div>
                      <div className="text-3xl font-bold text-emerald-400 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        {events.filter(e => e.status === 'LIVE').length}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
                    <div className="p-5 border-b border-slate-700 bg-slate-800/90">
                      <h3 className="text-base font-bold text-white">Active / Live Events</h3>
                    </div>
                    {events.filter(e => e.status === 'LIVE').length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-sm">
                        No events are currently live. Switch to the <button onClick={() => setActiveTab('events')} className="text-primary font-bold hover:underline">Event Management</button> tab to launch one.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-700">
                        {events.filter(e => e.status === 'LIVE').map((evt) => (
                          <div key={evt.id} className="p-4 flex justify-between items-center hover:bg-slate-800/50">
                            <div className="flex items-center gap-4">
                              <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                LIVE
                              </span>
                              <div>
                                <h4 className="font-bold text-white">{evt.name}</h4>
                                <p className="text-sm text-slate-400">{evt.description} · {evt.type}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => navigate(`/admin/event/${evt.id}`)}
                              className="px-3 py-1.5 text-sm bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 font-medium transition-colors"
                            >
                              Manage Live Event
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'events' && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
                  <div className="p-5 border-b border-slate-700 bg-slate-800/90">
                    <h3 className="text-base font-bold text-white">All Events</h3>
                  </div>
                  {events.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-sm">
                      No events yet. Click "Create Event" to get started.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-700">
                      {events.map((evt) => (
                        <div key={evt.id} className="p-4 flex justify-between items-center hover:bg-slate-800/50">
                          <div className="flex items-center gap-4">
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${getStatusColor(evt.status)}`}>
                              {evt.status}
                            </span>
                            <div>
                              <h4 className="font-bold text-white">{evt.name}</h4>
                              <p className="text-sm text-slate-400">{evt.description || 'No description'} · {evt.type} · {new Date(evt.createdAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => navigate(`/admin/event/${evt.id}`)}
                              className="px-3 py-1.5 text-sm bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 font-medium transition-colors"
                            >
                              Manage
                            </button>
                            <button 
                              onClick={() => handleDeleteEvent(evt)}
                              title={evt.status === 'LIVE' ? 'Cannot delete a LIVE event. Close the event first.' : `Delete "${evt.name}"`}
                              className={`p-2 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium ${
                                evt.status === 'LIVE'
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                                  : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-600 hover:text-white'
                              }`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'participants' && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
                  <div className="p-5 border-b border-slate-700 bg-slate-800/90">
                    <h3 className="text-base font-bold text-white">Registered Participants</h3>
                  </div>
                  {loadingUsers ? (
                    <div className="p-8 text-center text-slate-400 text-sm">
                      Loading users...
                    </div>
                  ) : users.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-sm">
                      No users registered yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-800/90 border-b border-slate-700 text-slate-400 text-xs font-bold uppercase tracking-wider">
                            <th className="p-4">Name</th>
                            <th className="p-4">USN / Branch / Year</th>
                            <th className="p-4">Role</th>
                            <th className="p-4 text-center">Submissions</th>
                            <th className="p-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700 text-sm text-slate-300">
                          {users.map((u) => (
                            <tr key={u.id} className="hover:bg-slate-800/50">
                              <td className="p-4">
                                <div className="font-bold text-white">{u.name}</div>
                                <div className="text-xs text-slate-400">{u.email}</div>
                              </td>
                              <td className="p-4 text-slate-300">
                                <div>{u.usn || 'N/A'}</div>
                                <div className="text-xs text-slate-400">
                                  {u.branch || 'N/A'} · {u.year || 'N/A'}
                                </div>
                              </td>
                              <td className="p-4">
                                <span className={`inline-block px-2.5 py-0.5 text-xs font-bold rounded-full ${
                                  u.role === 'ADMIN' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-slate-700 text-slate-300'
                                }`}>
                                  {u.role}
                                </span>
                              </td>
                              <td className="p-4 text-center font-semibold text-white">
                                {u._count?.submissions ?? 0}
                              </td>
                              <td className="p-4 text-right">
                                {u.role !== 'ADMIN' ? (
                                  <button 
                                    onClick={() => handlePromoteUser(u.email)}
                                    className="px-2.5 py-1 text-xs bg-primary text-white rounded hover:bg-primary-accent transition-colors font-medium"
                                  >
                                    Promote
                                  </button>
                                ) : (
                                  u.email !== adminEmail && (
                                    <button 
                                      onClick={() => handleDemoteUser(u.email)}
                                      className="px-2.5 py-1 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/30 transition-colors font-medium"
                                    >
                                      Demote
                                    </button>
                                  )
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </main>
          </div>
        </div>
      </section>

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
                  className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors text-slate-900" placeholder="Tech Trivia 2025" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} rows={2}
                  className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors resize-none text-slate-900" placeholder="A fun quiz competition for all ACM members" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Event Type *</label>
                  <select value={newEvent.type} onChange={e => setNewEvent({...newEvent, type: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors bg-white text-slate-900">
                    <option value="STANDARD">Standard Quiz</option>
                    <option value="KBC">KBC Mode</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Max Participants</label>
                  <input type="number" value={newEvent.maxParticipants} onChange={e => setNewEvent({...newEvent, maxParticipants: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors text-slate-900" placeholder="100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
                  <input type="datetime-local" value={newEvent.startTime} onChange={e => setNewEvent({...newEvent, startTime: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors text-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Time</label>
                  <input type="datetime-local" value={newEvent.endTime} onChange={e => setNewEvent({...newEvent, endTime: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors text-slate-900" />
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

      {/* Promote Admin Modal */}
      {showPromoteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPromoteModal(false)}>
          <div className="bg-white rounded-2xl shadow-brutal p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-display font-bold text-slate-900">Promote to Admin</h2>
              <button onClick={() => setShowPromoteModal(false)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <form onSubmit={handlePromoteAdmin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">User Email *</label>
                <input 
                  type="email" 
                  value={promoteEmail} 
                  onChange={e => setPromoteEmail(e.target.value)} 
                  required
                  placeholder="e.g. member@gmail.com"
                  className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors text-slate-900" 
                />
                <p className="text-slate-400 text-xs mt-2">
                  Enter the email address of the user you want to promote. If they haven't registered yet, they will automatically be assigned the Admin role when they first sign up.
                </p>
              </div>
              <button 
                type="submit" 
                disabled={promoting || !promoteEmail}
                className="w-full px-4 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-accent transition-colors disabled:opacity-50"
              >
                {promoting ? 'Promoting...' : 'Confirm Promotion'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
