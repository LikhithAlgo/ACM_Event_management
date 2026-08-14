/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchApi } from '../lib/api';
import type { QuizEvent, Round, Question, ParticipantEntry } from '../lib/types';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Play, Download, Eye, Users, AlertTriangle, X, Copy, QrCode, Edit2, Trash2, Copy as CopyIcon } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { redirectToHost } from '../lib/hosts';

const BLANK_QUESTION = {
  text: '', optA: '', optB: '', optC: '', optD: '',
  correctAnswer: 'A', points: '10', timerSeconds: '30', difficulty: 'MEDIUM', explanation: '',
  mediaType: 'NONE', mediaUrl: ''
};

const MEDIA_TYPE_LABELS: Record<string, string> = {
  NONE: 'No Media',
  IMAGE: '🖼️ Image',
  AUDIO: '🎵 Audio',
  VIDEO: '🎬 Video'
};

export function AdminEventManage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<QuizEvent | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [showQuestionForm, setShowQuestionForm] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [participants, setParticipants] = useState<ParticipantEntry[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const [newQuestion, setNewQuestion] = useState({ ...BLANK_QUESTION });
  const [gameState, setGameState] = useState<'waiting' | 'question' | 'revealed'>('waiting');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(-1);
  const [autoplayEnabled, setAutoplayEnabled] = useState<boolean>(false);

  // Round name modal state
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [roundName, setRoundName] = useState('');
  const [creatingRound, setCreatingRound] = useState(false);

  // Event duplication state
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { navigate('/'); return; }
      try {
        const dbUser = await fetchApi('/events/me');
        const didRedirect = redirectToHost(dbUser.role, `/admin/event/${eventId}`);
        if (didRedirect) return;
        if (dbUser.role !== 'ADMIN') { navigate('/dashboard'); return; }
        loadEvent();
      } catch {
        navigate('/');
      }
    });

    const newSocket = io(import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:3001');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(newSocket);

    // Real-time participant count
    newSocket.on('connect', () => {
      newSocket.emit('join_admin', eventId);
    });
    newSocket.on('room_count', (count: number) => setLiveCount(count));
    newSocket.on('game_state_update', (state: { currentState: 'waiting' | 'question' | 'revealed'; currentIndex: number; autoplayEnabled: boolean }) => {
      setGameState(state.currentState);
      setCurrentQuestionIndex(state.currentIndex);
      setAutoplayEnabled(state.autoplayEnabled);
    });

    return () => { newSocket.disconnect(); };
  }, [eventId]);

  const loadEvent = async () => {
    try {
      const data = await fetchApi(`/events/${eventId}`);
      setEvent(data);
    } catch { toast.error('Failed to load event'); }
  };

  const loadParticipants = async () => {
    const toastId = toast.loading('Loading participants...');
    try {
      const data = await fetchApi(`/events/${eventId}/participants`);
      setParticipants(data);
      setShowParticipants(true);
      toast.success(`${data.length} participant(s) loaded`, { id: toastId });
    } catch (e) { toast.error('Failed to load participants', { id: toastId }); }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await fetchApi(`/events/${eventId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      toast.success(`Status updated to ${newStatus}`);
      loadEvent();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleCreateRound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundName.trim()) return;
    setCreatingRound(true);
    try {
      await fetchApi(`/events/${eventId}/rounds`, {
        method: 'POST',
        body: JSON.stringify({ name: roundName.trim(), roundOrder: ((event as any)?.rounds?.length || 0) + 1 })
      });
      toast.success(`Round "${roundName}" created!`);
      setShowRoundModal(false);
      setRoundName('');
      loadEvent();
    } catch (e: any) { toast.error(e.message); }
    finally { setCreatingRound(false); }
  };

  const handleCreateQuestion = async (e: React.FormEvent, roundId: string) => {
    e.preventDefault();
    const toastId = toast.loading('Saving question...');
    try {
      await fetchApi(`/questions/rounds/${roundId}/questions`, {
        method: 'POST',
        body: JSON.stringify({
          text: newQuestion.text,
          options: [
            { id: 'A', text: newQuestion.optA },
            { id: 'B', text: newQuestion.optB },
            { id: 'C', text: newQuestion.optC },
            { id: 'D', text: newQuestion.optD }
          ],
          correctAnswer: newQuestion.correctAnswer,
          points: parseInt(newQuestion.points) || 10,
          timerSeconds: parseInt(newQuestion.timerSeconds) || 30,
          difficulty: newQuestion.difficulty,
          explanation: newQuestion.explanation || null,
          mediaType: newQuestion.mediaType || 'NONE',
          mediaUrl: newQuestion.mediaType !== 'NONE' ? (newQuestion.mediaUrl || null) : null
        })
      });
      toast.success('Question saved!', { id: toastId });
      setShowQuestionForm(null);
      setNewQuestion({ ...BLANK_QUESTION });
      loadEvent();
    } catch (e: any) { toast.error(e.message, { id: toastId }); }
  };

  const handleEditQuestion = async (e: React.FormEvent, questionId: string) => {
    e.preventDefault();
    const toastId = toast.loading('Updating question...');
    try {
      await fetchApi(`/questions/${questionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          text: newQuestion.text,
          options: [
            { id: 'A', text: newQuestion.optA },
            { id: 'B', text: newQuestion.optB },
            { id: 'C', text: newQuestion.optC },
            { id: 'D', text: newQuestion.optD }
          ],
          correctAnswer: newQuestion.correctAnswer,
          points: parseInt(newQuestion.points) || 10,
          timerSeconds: parseInt(newQuestion.timerSeconds) || 30,
          difficulty: newQuestion.difficulty,
          explanation: newQuestion.explanation || null,
          mediaType: newQuestion.mediaType || 'NONE',
          mediaUrl: newQuestion.mediaType !== 'NONE' ? (newQuestion.mediaUrl || null) : null
        })
      });
      toast.success('Question updated!', { id: toastId });
      setEditingQuestion(null);
      setNewQuestion({ ...BLANK_QUESTION });
      loadEvent();
    } catch (e: any) { toast.error(e.message, { id: toastId }); }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!window.confirm('Delete this question? This cannot be undone.')) return;
    const toastId = toast.loading('Deleting...');
    try {
      await fetchApi(`/questions/${questionId}`, { method: 'DELETE' });
      toast.success('Question deleted', { id: toastId });
      loadEvent();
    } catch (e: any) { toast.error(e.message, { id: toastId }); }
  };

  const startEditQuestion = (q: Question) => {
    const opts = q.options as any[];
    setNewQuestion({
      text: q.text,
      optA: opts.find((o: any) => o.id === 'A')?.text || '',
      optB: opts.find((o: any) => o.id === 'B')?.text || '',
      optC: opts.find((o: any) => o.id === 'C')?.text || '',
      optD: opts.find((o: any) => o.id === 'D')?.text || '',
      correctAnswer: q.correctAnswer || 'A',
      points: String(q.points),
      timerSeconds: String(q.timerSeconds),
      difficulty: q.difficulty,
      explanation: q.explanation || '',
      mediaType: q.mediaType || 'NONE',
      mediaUrl: q.mediaUrl || ''
    });
    setEditingQuestion(q.id);
    setShowQuestionForm(null);
  };

  const handleDuplicateEvent = async () => {
    setDuplicating(true);
    const toastId = toast.loading('Duplicating event...');
    try {
      const newEvent = await fetchApi(`/events/${eventId}/duplicate`, { method: 'POST' });
      toast.success('Event duplicated! Redirecting...', { id: toastId });
      setTimeout(() => navigate(`/admin/event/${newEvent.id}`), 1500);
    } catch (e: any) { toast.error(e.message, { id: toastId }); }
    finally { setDuplicating(false); }
  };

  const pushQuestionLive = (questionId: string) => {
    if (socket) {
      socket.emit('admin_push_question', { eventId, questionId });
      toast.success('Question pushed live!');
    }
  };

  const revealAnswerLive = (questionId: string) => {
    if (socket) {
      socket.emit('admin_reveal_answer', { eventId, questionId });
      toast.success('Answer revealed!');
    }
  };

  const resumeTimerLive = () => {
    if (socket) {
      socket.emit('admin_resume_timer', { eventId });
      toast.success('Timer resumed!');
    }
  };

  const showLeaderboard = () => {
    if (socket) {
      socket.emit('admin_show_leaderboard', { eventId });
      toast.success('Leaderboard pushed!');
    }
  };

  const nextStepLive = () => {
    if (socket) {
      socket.emit('admin_next_step', { eventId });
      toast.success('Advancing to next step!');
    }
  };

  const toggleAutoplay = () => {
    if (socket) {
      socket.emit('admin_toggle_autoplay', { eventId, enabled: !autoplayEnabled });
    }
  };

  const handleFileUpload = async (roundId: string, evt: React.ChangeEvent<HTMLInputElement>) => {
    const file = evt.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      const questions = lines.slice(1).map(line => {
        const cols = line.split(',');
        return {
          text: cols[0], correctAnswer: cols[5]?.trim(),
          options: [{ id: 'A', text: cols[1] }, { id: 'B', text: cols[2] }, { id: 'C', text: cols[3] }, { id: 'D', text: cols[4] }],
          points: parseInt(cols[6]) || 10, timerSeconds: parseInt(cols[7]) || 30
        };
      });
      const toastId = toast.loading(`Importing ${questions.length} questions...`);
      try {
        await fetchApi(`/questions/rounds/${roundId}/questions/bulk`, { method: 'POST', body: JSON.stringify({ questions }) });
        toast.success(`Imported ${questions.length} questions!`, { id: toastId });
        loadEvent();
      } catch (err: any) { toast.error(err.message, { id: toastId }); }
    };
    reader.readAsText(file);
  };

  const exportResults = async () => {
    const toastId = toast.loading('Preparing export...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';
      const res = await fetch(`${API_URL}/events/${eventId}/export`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${event?.name || 'event'}-results.csv`;
      a.click(); window.URL.revokeObjectURL(url);
      toast.success('Export downloaded!', { id: toastId });
    } catch (e) { toast.error('Export failed', { id: toastId }); }
  };

  const copyJoinLink = () => {
    const link = `${window.location.origin}/quiz/${eventId}`;
    navigator.clipboard.writeText(link);
    toast.success('Join link copied to clipboard!');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'LIVE': return 'bg-success text-white';
      case 'READY': return 'bg-primary text-white';
      case 'DRAFT': return 'bg-slate-200 text-slate-700';
      case 'CLOSED': return 'bg-error text-white';
      default: return 'bg-slate-200 text-slate-700';
    }
  };

  const getNextStatus = (current: string) => {
    switch (current) {
      case 'DRAFT': return 'READY';
      case 'READY': return 'LIVE';
      case 'LIVE': return 'CLOSED';
      default: return null;
    }
  };

  const renderQuestionForm = (roundId: string, questionId?: string) => (
    <form
      onSubmit={(e) => questionId ? handleEditQuestion(e, questionId) : handleCreateQuestion(e, roundId)}
      className="bg-slate-50 rounded-xl p-6 mb-6 border border-borderMuted space-y-4"
    >
      <div className="flex justify-between items-center">
        <h4 className="font-bold text-slate-700">{questionId ? 'Edit Question' : 'New Question'}</h4>
        <button type="button" onClick={() => { setShowQuestionForm(null); setEditingQuestion(null); setNewQuestion({ ...BLANK_QUESTION }); }}
          className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
      </div>

      {/* Question Text */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Question Text *</label>
        <textarea value={newQuestion.text} onChange={e => setNewQuestion({...newQuestion, text: e.target.value})} required rows={2}
          className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors resize-none" placeholder="What is the time complexity of binary search?" />
      </div>

      {/* Media Attachment */}
      <div className="border-2 border-dashed border-borderMuted rounded-xl p-4 space-y-3 bg-white">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-slate-700">📎 Media Attachment</span>
          <span className="text-xs text-slate-400">(optional — attach an image, audio clip, or video to this question)</span>
        </div>
        <div className="flex gap-3 flex-wrap">
          {(['NONE', 'IMAGE', 'AUDIO', 'VIDEO'] as const).map(mt => (
            <label key={mt} className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all text-sm font-medium select-none
              ${ newQuestion.mediaType === mt
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-borderMuted bg-white text-slate-600 hover:border-primary/50' }`}>
              <input
                type="radio"
                name={`mediaType-${roundId}-${questionId || 'new'}`}
                value={mt}
                checked={newQuestion.mediaType === mt}
                onChange={() => setNewQuestion({...newQuestion, mediaType: mt, mediaUrl: mt === 'NONE' ? '' : newQuestion.mediaUrl})}
                className="hidden"
              />
              {MEDIA_TYPE_LABELS[mt]}
            </label>
          ))}
        </div>

        {newQuestion.mediaType !== 'NONE' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              {newQuestion.mediaType === 'IMAGE' && '🖼️ Image URL'}
              {newQuestion.mediaType === 'AUDIO' && '🎵 Audio / Voice Note URL'}
              {newQuestion.mediaType === 'VIDEO' && '🎬 Video URL (YouTube embed or direct .mp4)'}
            </label>
            <input
              type="url"
              value={newQuestion.mediaUrl}
              onChange={e => setNewQuestion({...newQuestion, mediaUrl: e.target.value})}
              className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors"
              placeholder={
                newQuestion.mediaType === 'IMAGE' ? 'https://example.com/image.png' :
                newQuestion.mediaType === 'AUDIO' ? 'https://example.com/voice-note.mp3' :
                'https://www.youtube.com/embed/VIDEO_ID  or  https://example.com/clip.mp4'
              }
            />
            {/* Live preview */}
            {newQuestion.mediaUrl && (
              <div className="mt-2 rounded-xl overflow-hidden border border-borderMuted bg-slate-100 flex items-center justify-center">
                {newQuestion.mediaType === 'IMAGE' && (
                  <img src={newQuestion.mediaUrl} alt="Preview" className="max-h-48 object-contain" onError={e => (e.currentTarget.style.display='none')} />
                )}
                {newQuestion.mediaType === 'AUDIO' && (
                  <audio controls src={newQuestion.mediaUrl} className="w-full p-3" />
                )}
                {newQuestion.mediaType === 'VIDEO' && (
                  newQuestion.mediaUrl.includes('youtube.com/embed') || newQuestion.mediaUrl.includes('youtu.be') ? (
                    <iframe
                      src={newQuestion.mediaUrl.replace('youtu.be/', 'youtube.com/embed/')}
                      className="w-full aspect-video"
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                    />
                  ) : (
                    <video controls src={newQuestion.mediaUrl} className="max-h-48 w-full" />
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-3">
        {(['A', 'B', 'C', 'D'] as const).map(letter => (
          <div key={letter} className="relative">
            <span className="absolute left-3 top-3 text-xs font-bold text-slate-400">{letter}</span>
            <input type="text" value={(newQuestion as any)[`opt${letter}`]} onChange={e => setNewQuestion({...newQuestion, [`opt${letter}`]: e.target.value})} required
              className="w-full pl-8 pr-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors" placeholder={`Option ${letter}`} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Correct</label>
          <select value={newQuestion.correctAnswer} onChange={e => setNewQuestion({...newQuestion, correctAnswer: e.target.value})}
            className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary bg-white">
            <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Points</label>
          <input type="number" value={newQuestion.points} onChange={e => setNewQuestion({...newQuestion, points: e.target.value})} min="1" max="1000"
            className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Timer (s)</label>
          <input type="number" value={newQuestion.timerSeconds} onChange={e => setNewQuestion({...newQuestion, timerSeconds: e.target.value})} min="5" max="300"
            className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Difficulty</label>
          <select value={newQuestion.difficulty} onChange={e => setNewQuestion({...newQuestion, difficulty: e.target.value})}
            className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary bg-white">
            <option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Explanation (shown after reveal)</label>
        <input type="text" value={newQuestion.explanation} onChange={e => setNewQuestion({...newQuestion, explanation: e.target.value})}
          className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary" placeholder="Binary search divides the search space in half each iteration..." />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-accent">
          {questionId ? 'Update Question' : 'Save Question'}
        </button>
        <button type="button" onClick={() => { setShowQuestionForm(null); setEditingQuestion(null); setNewQuestion({ ...BLANK_QUESTION }); }}
          className="px-6 py-2 bg-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-300">Cancel</button>
      </div>
    </form>
  );

  if (!event) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto">
        <button onClick={() => navigate('/admin')} className="flex items-center gap-2 text-slate-500 mb-6 hover:text-slate-900">
          <ArrowLeft size={18} /> Back to Dashboard
        </button>

        {/* Event Header */}
        <div className="bg-white rounded-xl shadow-soft border border-borderMuted p-8 mb-8">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-slate-900">{event.name}</h1>
                <span className={`px-3 py-1 text-xs font-bold rounded-full ${getStatusColor(event.status)}`}>{event.status}</span>
                {liveCount > 0 && (
                  <span className="px-3 py-1 text-xs font-bold rounded-full bg-success/10 text-success flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse inline-block" />
                    {liveCount} Online
                  </span>
                )}
              </div>
              <p className="text-slate-500">{event.description} · {event.type}</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <button onClick={() => setShowQrCode(true)} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 flex items-center gap-1"><QrCode size={14} /> QR Code</button>
              <button onClick={copyJoinLink} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 flex items-center gap-1"><Copy size={14} /> Copy Link</button>
              <button onClick={loadParticipants} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 flex items-center gap-1"><Users size={14} /> Participants</button>
              <button onClick={exportResults} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 flex items-center gap-1"><Download size={14} /> Export CSV</button>
              <button onClick={handleDuplicateEvent} disabled={duplicating} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 flex items-center gap-1 disabled:opacity-50"><CopyIcon size={14} /> Duplicate</button>
              <button onClick={resumeTimerLive} className="px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800">Resume Timer</button>
              <button onClick={showLeaderboard} className="px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800">Show Leaderboard</button>
              <button onClick={() => navigate(`/presenter/${eventId}`)} className="px-4 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary-accent flex items-center gap-1"><Eye size={14} /> Presenter</button>
              {getNextStatus(event.status) && (
                <button onClick={() => handleStatusChange(getNextStatus(event.status)!)}
                  className="px-4 py-2 bg-success text-white text-sm font-bold rounded-lg hover:bg-emerald-600">
                  → {getNextStatus(event.status)}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* QR Code Modal */}
        {showQrCode && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowQrCode(false)}>
            <div className="bg-white rounded-2xl shadow-brutal p-8 flex flex-col items-center" onClick={e => e.stopPropagation()}>
              <div className="w-full flex justify-end mb-2">
                <button onClick={() => setShowQrCode(false)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Join {event.name}</h2>
              <div className="p-4 bg-white border-2 border-borderMuted rounded-xl shadow-soft">
                <QRCodeSVG value={`${window.location.origin}/quiz/${eventId}`} size={256} />
              </div>
              <p className="mt-6 font-mono text-lg font-bold text-primary bg-primary/10 px-4 py-2 rounded-lg">
                {window.location.origin}/quiz/{eventId}
              </p>
            </div>
          </div>
        )}

        {/* Round Name Modal */}
        {showRoundModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowRoundModal(false)}>
            <div className="bg-white rounded-2xl shadow-brutal p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-900">Add Round</h2>
                <button onClick={() => setShowRoundModal(false)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
              </div>
              <form onSubmit={handleCreateRound} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Round Name *</label>
                  <input
                    type="text"
                    value={roundName}
                    onChange={e => setRoundName(e.target.value)}
                    autoFocus
                    required
                    className="w-full px-4 py-3 border-2 border-borderMuted rounded-xl focus:outline-none focus:border-primary transition-colors"
                    placeholder="e.g. Round 1 – Prelims"
                  />
                </div>
                <button type="submit" disabled={creatingRound || !roundName.trim()}
                  className="w-full px-4 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-accent transition-colors disabled:opacity-50">
                  {creatingRound ? 'Creating...' : 'Create Round'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Participant Monitoring Panel */}
        {showParticipants && (
          <div className="bg-white rounded-xl shadow-soft border border-borderMuted p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Users size={20} /> Participants ({participants.length})</h2>
              <button onClick={() => setShowParticipants(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            {participants.length === 0 ? (
              <p className="text-slate-500 text-sm">No participants have joined yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500 border-b border-borderMuted">
                    <th className="pb-2">Name</th><th className="pb-2">Email</th><th className="pb-2">Joined</th>
                    <th className="pb-2">Submissions</th><th className="pb-2">Score</th><th className="pb-2">Tab Switches</th>
                  </tr></thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={p.id} className="border-b border-borderMuted hover:bg-slate-50">
                        <td className="py-3 font-medium text-slate-900">{p.name}</td>
                        <td className="py-3 text-slate-500">{p.email}</td>
                        <td className="py-3 text-slate-500">{new Date(p.joinedAt).toLocaleTimeString()}</td>
                        <td className="py-3">{p.submissions}</td>
                        <td className="py-3 font-bold text-primary">{p.totalPoints}</td>
                        <td className="py-3">
                          <span className={`flex items-center gap-1 ${p.tabSwitches > 3 ? 'text-error font-bold' : 'text-slate-500'}`}>
                            {p.tabSwitches > 3 && <AlertTriangle size={14} />} {p.tabSwitches}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Game Flow Control Center */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 mb-8 text-white flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" /> Live Controller
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-slate-300 text-sm">
                Status:{" "}
                <strong className={`font-bold capitalize ${
                  gameState === 'question' ? 'text-emerald-400' :
                  gameState === 'revealed' ? 'text-amber-400' : 'text-slate-400'
                }`}>
                  {gameState === 'question' ? 'Question Live ⏳' :
                   gameState === 'revealed' ? 'Answer Revealed 🏆' : 'Waiting 💤'}
                </strong>
              </span>
              {currentQuestionIndex !== -1 && (
                <span className="bg-slate-800 px-3 py-1 rounded-full text-xs font-semibold text-indigo-200">
                  Question #{currentQuestionIndex + 1}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Auto-Play Toggle */}
            <button 
              onClick={toggleAutoplay}
              className={`px-4 py-2 rounded-lg text-xs font-bold border-2 transition-all flex items-center gap-2 select-none
                ${autoplayEnabled 
                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-emerald-900/20 shadow-md' 
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoplayEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              {autoplayEnabled ? 'Auto-Play Active' : 'Enable Auto-Play'}
            </button>

            {/* Next Step Button */}
            <button 
              onClick={nextStepLive}
              className="px-5 py-2 bg-primary hover:bg-primary-accent text-white rounded-lg text-xs font-bold shadow-soft flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
            >
              {gameState === 'question' ? 'Reveal Answer & Leaderboard →' : 'Push Next Question →'}
            </button>
          </div>
        </div>

        {/* Rounds */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Rounds</h2>
          <button onClick={() => setShowRoundModal(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-accent transition-colors">
            <Plus size={18} /> Add Round
          </button>
        </div>

        <div className="space-y-6">
          {(event as any).rounds?.map((round: Round) => (
            <div key={round.id} className="bg-white rounded-xl shadow-soft border border-borderMuted p-6">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-borderMuted">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{round.name}</h3>
                  <p className="text-sm text-slate-500">Access Code: <span className="font-mono font-bold text-primary">{round.accessCode}</span></p>
                </div>
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-slate-500 hover:text-slate-900 cursor-pointer flex items-center gap-1">
                    Upload CSV
                    <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileUpload(round.id, e)} />
                  </label>
                  <button onClick={() => { setShowQuestionForm(showQuestionForm === round.id ? null : round.id); setEditingQuestion(null); setNewQuestion({ ...BLANK_QUESTION }); }}
                    className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
                    <Plus size={16} /> Add Question
                  </button>
                </div>
              </div>

              {/* Question Creation Form */}
              {showQuestionForm === round.id && renderQuestionForm(round.id)}

              {round.questions?.length === 0 ? (
                <p className="text-sm text-slate-500">No questions in this round yet.</p>
              ) : (
                <div className="space-y-3">
                  {round.questions?.map((q: Question, idx: number) => (
                    <div key={q.id}>
                      {editingQuestion === q.id ? (
                        renderQuestionForm(round.id, q.id)
                      ) : (
                        <div className="flex justify-between items-center p-4 bg-slate-50 border border-borderMuted rounded-lg hover:border-slate-300 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-400">Q{idx + 1}</span>
                              <span className="font-medium text-slate-900">{q.text}</span>
                              {q.mediaType && q.mediaType !== 'NONE' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full
                                  bg-indigo-50 text-indigo-600 border border-indigo-200">
                                  {q.mediaType === 'IMAGE' && '🖼️ Image'}
                                  {q.mediaType === 'AUDIO' && '🎵 Audio'}
                                  {q.mediaType === 'VIDEO' && '🎬 Video'}
                                </span>
                              )}
                            </div>
                            <span className="ml-0 text-xs text-slate-400">{q.points}pts · {q.timerSeconds}s · {q.difficulty}</span>
                            {q.explanation && (
                              <p className="text-xs text-slate-400 mt-1 truncate">💡 {q.explanation}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4 shrink-0">
                            <button onClick={() => startEditQuestion(q)}
                              className="p-1.5 text-slate-400 hover:text-primary transition-colors" title="Edit question">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDeleteQuestion(q.id)}
                              className="p-1.5 text-slate-400 hover:text-error transition-colors" title="Delete question">
                              <Trash2 size={14} />
                            </button>
                            <button onClick={() => revealAnswerLive(q.id)}
                              className="px-3 py-1.5 bg-warning text-white text-xs font-bold rounded hover:bg-yellow-500 transition-colors">
                              Reveal
                            </button>
                            <button onClick={() => pushQuestionLive(q.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-success text-white text-xs font-bold rounded hover:bg-emerald-600 transition-colors">
                              <Play size={12} /> Push Live
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
