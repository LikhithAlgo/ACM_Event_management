import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { redirectToHost } from '../lib/hosts';
import type { Question, QuizEvent, RevealData, LeaderboardEntry } from '../lib/types';
import { AlertTriangle, ShieldAlert, Trophy, Crown, Clock, Bookmark, ChevronLeft, ChevronRight, CheckCircle2, Send } from 'lucide-react';

function ConfettiShower() {
  const colors = ['bg-amber-400', 'bg-red-400', 'bg-blue-400', 'bg-emerald-400', 'bg-purple-400', 'bg-pink-400', 'bg-teal-400'];
  const particles = Array.from({ length: 60 });
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-50">
      {particles.map((_, i) => {
        const left = `${Math.random() * 100}%`;
        const delay = `${Math.random() * 4}s`;
        const duration = `${3 + Math.random() * 2}s`;
        const color = colors[i % colors.length];
        return (
          <div
            key={i}
            className={`confetti-particle ${color}`}
            style={{
              left,
              animationDelay: delay,
              animationDuration: duration,
            }}
          />
        );
      })}
    </div>
  );
}

export function QuizAttempt() {
  const { eventId } = useParams();
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [revealedAnswer, setRevealedAnswer] = useState<RevealData | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [event, setEvent] = useState<QuizEvent | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [hiddenOptions, setHiddenOptions] = useState<string[]>([]);
  const [usedLifelines, setUsedLifelines] = useState({ fifty: false, flip: false, phone: false });
  const [timerPaused, setTimerPaused] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [me, setMe] = useState<any>(null);

  // Round & Countdown state
  const [roundStatus, setRoundStatus] = useState<'waiting' | 'countdown' | 'active' | 'ended'>('waiting');
  const [activeRoundState, setActiveRoundState] = useState<{
    status: 'WAITING' | 'COUNTDOWN' | 'LIVE' | 'ENDED';
    countdownEndTime?: string;
    roundName?: string;
    roundDescription?: string;
    durationSeconds?: number;
  }>({ status: 'WAITING' });
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [, setTick] = useState<number>(0);

  // MCQ Round State
  const [activeRoundId, setActiveRoundId] = useState<string>('');
  const [mcqQuestions, setMcqQuestions] = useState<Question[]>([]);
  const [currentMcqIndex, setCurrentMcqIndex] = useState<number>(0);
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, string>>({});
  const [markedForReview, setMarkedForReview] = useState<string[]>([]);
  const [mcqAttemptStatus, setMcqAttemptStatus] = useState<'IN_PROGRESS' | 'SUBMITTED' | 'FORCE_SUBMITTED'>('IN_PROGRESS');
  const [mcqScore, setMcqScore] = useState<number>(0);
  const [mcqTotalTimer, setMcqTotalTimer] = useState<number>(0);
  const [mcqSubmitting, setMcqSubmitting] = useState<boolean>(false);
  const [showSubmitConfirmModal, setShowSubmitConfirmModal] = useState<boolean>(false);
  const [resultsReleased, setResultsReleased] = useState<boolean>(false);

  // Ticker for live countdown display
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Total MCQ Round Timer Countdown
  useEffect(() => {
    if (activeRoundState.status !== 'LIVE' || mcqAttemptStatus !== 'IN_PROGRESS' || mcqTotalTimer <= 0) return;
    const interval = setInterval(() => {
      setMcqTotalTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleMcqSubmitAttempt(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeRoundState.status, mcqAttemptStatus, mcqTotalTimer > 0]);

  // Profile modal states
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', usn: '', branch: '', year: '1st Year' });
  
  // Access Code State
  const [verifiedRounds, setVerifiedRounds] = useState<Record<string, boolean>>({});
  const [pendingCode, setPendingCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState('');

  // Proctoring/Cheating State
  const [cheatWarning, setCheatWarning] = useState<boolean>(false);
  const [cheatCount, setCheatCount] = useState<number>(0);

  const loadMcqAttempt = async (roundId: string) => {
    try {
      setActiveRoundId(roundId);
      const data = await fetchApi(`/events/rounds/${roundId}/attempt`);
      if (data.round) {
        setMcqQuestions(data.round.questions || []);
        setResultsReleased(!!data.round.resultsReleased);
      }
      if (data.attempt) {
        setMcqAnswers(data.attempt.answers || {});
        setMarkedForReview(data.attempt.markedForReview || []);
        setMcqAttemptStatus(data.attempt.status || 'IN_PROGRESS');
        setMcqScore(data.attempt.score || 0);
      }
      if (data.remainingRoundSeconds !== undefined) {
        setMcqTotalTimer(data.remainingRoundSeconds);
      }
    } catch (e) {
      console.error('Failed to load MCQ attempt:', e);
    }
  };

  const saveMcqAttempt = async (newAnswers: Record<string, string>, newMarked: string[]) => {
    if (!activeRoundId || mcqAttemptStatus !== 'IN_PROGRESS') return;
    try {
      await fetchApi(`/events/rounds/${activeRoundId}/attempt/save`, {
        method: 'POST',
        body: JSON.stringify({ answers: newAnswers, markedForReview: newMarked })
      });
    } catch (e) {
      console.error('Failed to auto-save attempt:', e);
    }
  };

  const handleSelectOption = (questionId: string, optionId: string) => {
    if (mcqAttemptStatus !== 'IN_PROGRESS') return;
    const updated = { ...mcqAnswers, [questionId]: optionId };
    setMcqAnswers(updated);
    saveMcqAttempt(updated, markedForReview);
  };

  const handleClearAnswer = (questionId: string) => {
    if (mcqAttemptStatus !== 'IN_PROGRESS') return;
    const updated = { ...mcqAnswers };
    delete updated[questionId];
    setMcqAnswers(updated);
    saveMcqAttempt(updated, markedForReview);
  };

  const handleToggleMarkForReview = (questionId: string) => {
    if (mcqAttemptStatus !== 'IN_PROGRESS') return;
    const updatedMarked = markedForReview.includes(questionId)
      ? markedForReview.filter(id => id !== questionId)
      : [...markedForReview, questionId];
    setMarkedForReview(updatedMarked);
    saveMcqAttempt(mcqAnswers, updatedMarked);
  };

  const handleMcqSubmitAttempt = async (auto = false) => {
    if (!activeRoundId || mcqAttemptStatus !== 'IN_PROGRESS') return;
    setMcqSubmitting(true);
    const toastId = toast.loading(auto ? "Time's up! Submitting answers..." : "Submitting round attempt...");
    try {
      const res = await fetchApi(`/events/rounds/${activeRoundId}/attempt/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers: mcqAnswers })
      });
      setMcqAttemptStatus('SUBMITTED');
      if (res.attempt) setMcqScore(res.attempt.score || 0);
      toast.success(auto ? "Time's up! Your answers have been submitted." : "Your answers have been submitted successfully!", { id: toastId });
      setShowSubmitConfirmModal(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to submit attempt", { id: toastId });
    } finally {
      setMcqSubmitting(false);
    }
  };

  useEffect(() => {
    // Load event + create participant session
    fetchApi(`/events/${eventId}`).then(setEvent).catch(console.error);
    fetchApi(`/events/${eventId}/join`, { method: 'POST' }).catch(console.error);
    fetchApi('/events/me').then((u) => {
      const didRedirect = redirectToHost(u.role, `/quiz/${eventId}`);
      if (didRedirect) return;
      setMe(u);

      if (!u.usn || !u.branch || !u.year || !u.name) {
        setProfileForm({
          name: u.name || '',
          usn: u.usn || '',
          branch: u.branch || '',
          year: u.year || '1st Year'
        });
        setShowProfileModal(true);
      }
    }).catch(console.error);

    // Connect to Socket.IO server
    const newSocket = io(import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:3001');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('join_event', eventId);
    });

    newSocket.on('room_count', (count: number) => setOnlineCount(count));

    const handleStatusEvent = (data: any) => {
      if (!data) return;
      const rawStat = (data.rawStatus || data.status || 'WAITING').toUpperCase();
      const normStatus: 'waiting' | 'countdown' | 'active' | 'ended' =
        rawStat === 'COUNTDOWN' ? 'countdown' :
        (rawStat === 'LIVE' || rawStat === 'ACTIVE' ? 'active' :
        (rawStat === 'ENDED' ? 'ended' : 'waiting'));

      setRoundStatus(normStatus);
      setActiveRoundState(prev => ({
        ...prev,
        status: (rawStat === 'ACTIVE' ? 'LIVE' : rawStat) as any,
        countdownEndTime: data.startsAt || data.countdownEndTime || prev.countdownEndTime,
        durationSeconds: data.durationSeconds || prev.durationSeconds,
        roundName: data.round?.name || prev.roundName,
        roundDescription: data.round?.description || prev.roundDescription
      }));

      const targetRoundId = data.roundId || data.round?.id || activeRoundId;
      if (targetRoundId) {
        newSocket.emit('join_round', targetRoundId);
      }
      if ((normStatus === 'active' || rawStat === 'LIVE') && targetRoundId) {
        loadMcqAttempt(targetRoundId);
      }
    };

    newSocket.on('round_status_update', handleStatusEvent);
    newSocket.on('round:status', handleStatusEvent);

    newSocket.on('initial_round_state', (data: any) => {
      if (data?.rounds && data.rounds.length > 0) {
        const firstRound = data.rounds[0];
        const rawStat = (firstRound.status || 'WAITING').toUpperCase();
        const normStatus: 'waiting' | 'countdown' | 'active' | 'ended' =
          rawStat === 'COUNTDOWN' ? 'countdown' :
          (rawStat === 'LIVE' || rawStat === 'ACTIVE' ? 'active' :
          (rawStat === 'ENDED' ? 'ended' : 'waiting'));

        setRoundStatus(normStatus);
        setActiveRoundState({
          status: (rawStat === 'ACTIVE' ? 'LIVE' : rawStat) as any,
          countdownEndTime: firstRound.countdownEndTime,
          roundName: firstRound.name,
          roundDescription: firstRound.description
        });

        if (firstRound.id) {
          newSocket.emit('join_round', firstRound.id);
          // Fetch current REST status on mount / reconnect before socket events arrive
          fetchApi(`/rounds/${firstRound.id}`).then(handleStatusEvent).catch(() => {
            fetchApi(`/events/rounds/${firstRound.id}/status-details`).then(handleStatusEvent).catch(console.error);
          });

          if (normStatus === 'active' || rawStat === 'LIVE') {
            loadMcqAttempt(firstRound.id);
          }
        }
      }
    });

    newSocket.on('round_force_submitted', () => {
      setMcqAttemptStatus('FORCE_SUBMITTED');
      toast.error('The round has been ended by the administrator. Your answers have been submitted.');
    });

    newSocket.on('results_released_update', (data: any) => {
      setResultsReleased(!!data?.resultsReleased);
    });

    newSocket.on('new_question', (question) => {
      setCurrentQuestion(question);
      setSelectedAnswer(null);
      setRevealedAnswer(null);
      setLeaderboard(null); // Hide leaderboard when new question starts
      setHiddenOptions([]); // Reset lifelines
      setTimeLeft(question.timerSeconds || 30);
      setTimerPaused(false);
      setActiveRoundState(prev => ({ ...prev, status: 'LIVE' }));
    });

    newSocket.on('lifeline_fifty_result', (hideOpts) => {
      setHiddenOptions(hideOpts);
    });

    newSocket.on('reveal_answer', (revealData) => {
      setRevealedAnswer(revealData);
      setTimerPaused(true);
    });

    newSocket.on('timer_pause', () => setTimerPaused(true));
    newSocket.on('timer_resume', () => setTimerPaused(false));

    newSocket.on('leaderboard_update', (board) => {
      setLeaderboard(board);
      setCurrentQuestion(null); // Hide question when leaderboard shows
    });

    newSocket.on('quiz_finished', (finalBoard) => {
      setLeaderboard(finalBoard);
      setIsFinished(true);
      setCurrentQuestion(null);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [eventId]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await fetchApi('/events/me/profile', {
        method: 'PUT',
        body: JSON.stringify(profileForm)
      });
      setMe(updated);
      setShowProfileModal(false);
      toast.success('Profile updated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  // Live Timer countdown
  useEffect(() => {
    if (currentQuestion && timeLeft > 0 && !revealedAnswer && !timerPaused) {
      const timer = setTimeout(() => setTimeLeft(l => l - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft, currentQuestion, revealedAnswer, timerPaused]);

  // Anti-Cheat: Tab switch and context menu protection
  useEffect(() => {
    const handleContextMenu = (e: Event) => e.preventDefault();
    const handleCopyPaste = (e: Event) => e.preventDefault();
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Keep tab switch tracking disabled while round is waiting or countdown
        if (roundStatus !== 'active' && activeRoundState.status !== 'LIVE') return;
        setCheatCount(prev => prev + 1);
        setCheatWarning(true);
        fetchApi('/questions/cheat', {
          method: 'POST',
          body: JSON.stringify({ eventId })
        }).catch(console.error);
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopyPaste);
      document.removeEventListener('paste', handleCopyPaste);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [eventId, roundStatus, activeRoundState.status]);

  const handleSubmit = async (answerId: string) => {
    if (selectedAnswer || !currentQuestion) return; // Prevent double submit
    setSelectedAnswer(answerId);

    try {
      await fetchApi('/questions/submit', {
        method: 'POST',
        // eslint-disable-next-line react-hooks/purity
        headers: { 'X-Idempotency-Key': `${eventId}-${currentQuestion.id}-${Date.now()}` },
        body: JSON.stringify({
          eventId,
          roundId: currentQuestion.roundId,
          questionId: currentQuestion.id,
          answer: answerId,
          timeTakenMs: (currentQuestion.timerSeconds - timeLeft) * 1000
        })
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to submit answer. Check your connection.');
    }
  };

  const useFiftyFifty = () => {
    if (!socket || usedLifelines.fifty || !currentQuestion) return;
    setUsedLifelines(prev => ({ ...prev, fifty: true }));
    socket.emit('use_lifeline_fifty', { eventId, questionId: currentQuestion.id });
  };

  const useFlip = () => {
    if (!socket || usedLifelines.flip || !currentQuestion) return;
    setUsedLifelines(prev => ({ ...prev, flip: true }));
    socket.emit('use_lifeline_flip', { eventId, questionId: currentQuestion.id });
  };

  const usePhone = () => {
    if (!socket || usedLifelines.phone || !currentQuestion) return;
    setUsedLifelines(prev => ({ ...prev, phone: true }));
    socket.emit('use_lifeline_phone', { eventId });
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentQuestion) return;
    setVerifying(true);
    try {
      await fetchApi(`/events/rounds/${currentQuestion.roundId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ code: pendingCode })
      });
      setVerifiedRounds(prev => ({ ...prev, [currentQuestion.roundId]: true }));
      setPendingCode('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setCodeError(err.message || 'Invalid access code');
    } finally {
      setVerifying(false);
    }
  };

  const getCountdownRemainingSeconds = () => {
    if (!activeRoundState.countdownEndTime) return 0;
    const endMs = new Date(activeRoundState.countdownEndTime).getTime();
    return Math.max(0, Math.floor((endMs - Date.now()) / 1000));
  };

  const remainingSeconds = getCountdownRemainingSeconds();
  const countdownMinutes = Math.floor(remainingSeconds / 60);
  const countdownSecs = remainingSeconds % 60;
  const formattedCountdown = `${String(countdownMinutes).padStart(2, '0')}:${String(countdownSecs).padStart(2, '0')}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentRound = (event?.rounds as any[])?.find((r: any) => r.id === currentQuestion?.roundId);
  const requiresCode = currentRound?.accessCode === 'REQUIRED';
  const isRoundVerified = !requiresCode || verifiedRounds[currentQuestion?.roundId || ''];

  // Single source of truth for mutually exclusive views
  const effectiveStatus: 'submitted' | 'active' | 'countdown' | 'waiting' =
    (mcqAttemptStatus === 'SUBMITTED' || mcqAttemptStatus === 'FORCE_SUBMITTED') ? 'submitted' :
    (activeRoundState.status === 'LIVE' || roundStatus === 'active') ? 'active' :
    (activeRoundState.status === 'COUNTDOWN' || roundStatus === 'countdown') ? 'countdown' :
    'waiting';

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">

      {/* 1. SUBMITTED VIEW */}
      {effectiveStatus === 'submitted' && (
        <div className="w-full max-w-xl bg-slate-800/90 border border-slate-700/80 rounded-3xl p-8 shadow-2xl text-center space-y-6 animate-fade-in relative z-10">
          <div className="w-16 h-16 bg-emerald-500/10 border-2 border-emerald-500 rounded-full flex items-center justify-center text-emerald-400 mx-auto animate-pulse">
            <CheckCircle2 size={36} />
          </div>
          <h2 className="text-3xl font-display font-extrabold text-white">Submission Recorded</h2>
          <p className="text-slate-300 text-sm">
            Your answers have been saved and submitted successfully.
          </p>

          {resultsReleased ? (
            <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-6 space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Your Total Score</span>
              <span className="text-4xl font-display font-black text-amber-400 font-mono block">{mcqScore} pts</span>
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4 text-xs text-slate-400">
              Results will be announced shortly by the administrator.
            </div>
          )}
        </div>
      )}

      {/* 2. ACTIVE MCQ VIEW */}
      {effectiveStatus === 'active' && !currentQuestion && (
        <div className="w-full max-w-5xl space-y-6 animate-fade-in relative z-10 p-2 md:p-4">
          {/* Top Bar: Header, Total Timer, Submit Button */}
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary/20 border border-primary/40 rounded-xl flex items-center justify-center text-primary font-bold">
                A
              </div>
              <div>
                <h1 className="text-lg font-display font-bold text-white tracking-tight">{event?.name || 'ACM Event'}</h1>
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">{activeRoundState.roundName || 'Round 1 — MCQ'}</span>
              </div>
            </div>

            {/* ONE Total MCQ Round Timer */}
            <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-5 py-2 rounded-xl shadow-inner">
              <Clock size={18} className={mcqTotalTimer <= 180 ? 'text-red-400 animate-pulse' : 'text-amber-400'} />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Time Remaining:</span>
              <span className={`text-2xl font-display font-black font-mono tracking-wider ${mcqTotalTimer <= 180 ? 'text-red-400 animate-pulse' : 'text-amber-400'}`}>
                {`${String(Math.floor(mcqTotalTimer / 60)).padStart(2, '0')}:${String(mcqTotalTimer % 60).padStart(2, '0')}`}
              </span>
            </div>

            {/* Submit Button */}
            {mcqAttemptStatus === 'IN_PROGRESS' && (
              <button
                onClick={() => setShowSubmitConfirmModal(true)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-transform hover:scale-105 shadow-soft flex items-center gap-2"
              >
                <Send size={16} /> Submit Round
              </button>
            )}
          </div>

          {/* MCQ Question Area & Palette */}
          {mcqQuestions.length === 0 ? (
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-8 shadow-2xl text-center text-slate-400">
              No questions found for this MCQ round.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Question Card (3 Cols) */}
              <div className="lg:col-span-3 bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 shadow-xl flex flex-col justify-between min-h-[450px]">
                {(() => {
                  const currentQ = mcqQuestions[currentMcqIndex];
                  if (!currentQ) return null;
                  const selectedOpt = mcqAnswers[currentQ.id];
                  const isMarked = markedForReview.includes(currentQ.id);

                  return (
                    <div className="space-y-6">
                      {/* Question Header */}
                      <div className="flex justify-between items-center border-b border-slate-700/80 pb-3">
                        <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                          Question {currentMcqIndex + 1} of {mcqQuestions.length}
                        </span>
                        {isMarked && (
                          <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold rounded-full flex items-center gap-1">
                            <Bookmark size={12} /> Marked for Review
                          </span>
                        )}
                      </div>

                      {/* Question Text & Media */}
                      <div className="space-y-4">
                        <h3 className="text-xl font-bold text-white leading-relaxed">
                          {currentQ.text}
                        </h3>

                        {currentQ.mediaType === 'IMAGE' && currentQ.mediaUrl && (
                          <img src={currentQ.mediaUrl} alt="Question Media" className="max-h-60 rounded-xl object-contain border border-slate-700" />
                        )}
                        {currentQ.mediaType === 'AUDIO' && currentQ.mediaUrl && (
                          <audio controls src={currentQ.mediaUrl} className="w-full" />
                        )}
                        {currentQ.mediaType === 'VIDEO' && currentQ.mediaUrl && (
                          <video controls src={currentQ.mediaUrl} className="w-full max-h-60 rounded-xl" />
                        )}
                      </div>

                      {/* Option List */}
                      <div className="space-y-3 pt-2">
                        {currentQ.options?.map((opt) => {
                          const isSelected = selectedOpt === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => handleSelectOption(currentQ.id, opt.id)}
                              className={`w-full p-4 rounded-2xl text-left font-medium transition-all flex items-center justify-between group ${
                                isSelected
                                  ? 'bg-primary/20 border-2 border-primary text-white shadow-soft'
                                  : 'bg-slate-900/70 border border-slate-700/80 text-slate-200 hover:border-slate-500 hover:bg-slate-900'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className={`w-8 h-8 rounded-xl font-mono text-xs font-bold flex items-center justify-center ${
                                  isSelected ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}>
                                  {opt.id}
                                </span>
                                <span>{opt.text}</span>
                              </div>

                              {isSelected && (
                                <span className="px-2.5 py-1 bg-primary text-white text-[10px] font-extrabold uppercase tracking-widest rounded-lg">
                                  SELECTED
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Question Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-700/80">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleClearAnswer(currentQ.id)}
                            disabled={!selectedOpt}
                            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition-all disabled:opacity-40"
                          >
                            Clear Answer
                          </button>
                          <button
                            onClick={() => handleToggleMarkForReview(currentQ.id)}
                            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 ${
                              isMarked
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                            }`}
                          >
                            <Bookmark size={14} />
                            {isMarked ? 'Unmark Review' : 'Mark for Review'}
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentMcqIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentMcqIndex === 0}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-700 text-white font-bold rounded-xl text-xs border border-slate-700 transition-all disabled:opacity-40 flex items-center gap-1"
                          >
                            <ChevronLeft size={16} /> Previous
                          </button>
                          <button
                            onClick={() => setCurrentMcqIndex(prev => Math.min(mcqQuestions.length - 1, prev + 1))}
                            disabled={currentMcqIndex === mcqQuestions.length - 1}
                            className="px-4 py-2 bg-primary hover:bg-primary-accent text-white font-bold rounded-xl text-xs transition-all disabled:opacity-40 flex items-center gap-1"
                          >
                            Next <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Sidebar: Question Palette (1 Col) */}
              <div className="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-5 shadow-xl space-y-4">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-700/80 pb-3 flex items-center justify-between">
                  <span>Questions</span>
                  <span className="text-xs text-slate-400 font-mono">{mcqQuestions.length} total</span>
                </h4>

                {/* Legend */}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300 pb-2 border-b border-slate-700/80">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> ✓ Answered</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" /> — Unanswered</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> 🔖 Review</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> ● Current</span>
                </div>

                {/* Question Grid Buttons */}
                <div className="grid grid-cols-5 gap-2 max-h-[320px] overflow-y-auto pr-1">
                  {mcqQuestions.map((q, idx) => {
                    const isAnswered = !!mcqAnswers[q.id];
                    const isMarked = markedForReview.includes(q.id);
                    const isCurrent = idx === currentMcqIndex;

                    return (
                      <button
                        key={q.id}
                        onClick={() => setCurrentMcqIndex(idx)}
                        className={`h-10 rounded-xl font-mono text-xs font-bold flex flex-col items-center justify-center transition-all relative ${
                          isCurrent
                            ? 'ring-2 ring-primary ring-offset-2 ring-offset-slate-900 bg-primary text-white'
                            : isAnswered
                            ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/40'
                            : isMarked
                            ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40 hover:bg-amber-500/40'
                            : 'bg-slate-900 text-slate-400 border border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        <span>{idx + 1}</span>
                        <span className="text-[9px] leading-none">
                          {isAnswered ? '✓' : isMarked ? '🔖' : '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. COUNTDOWN VIEW */}
      {effectiveStatus === 'countdown' && !currentQuestion && (
        <div className="w-full max-w-xl bg-slate-800/90 border border-slate-700/80 rounded-3xl p-8 shadow-2xl text-center space-y-6 animate-fade-in relative z-10">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary/20 border border-primary/40 rounded-xl flex items-center justify-center text-primary font-bold text-sm">
                A
              </div>
              <span className="text-lg font-display font-bold text-white tracking-tight">{event?.name || 'ACM Event'}</span>
            </div>
            {onlineCount > 0 && (
              <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {onlineCount} Online
              </span>
            )}
          </div>
          <div>
            <span className="inline-block px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-xs font-extrabold uppercase tracking-widest rounded-full mb-2">
              {activeRoundState.roundName || 'Round 1 — MCQ'}
            </span>
            <h2 className="text-3xl font-display font-extrabold text-white">
              {activeRoundState.roundName || 'Round 1 — MCQ'}
            </h2>
            {activeRoundState.roundDescription && (
              <p className="text-slate-400 text-sm mt-2">{activeRoundState.roundDescription}</p>
            )}
          </div>
          <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 shadow-inner space-y-4">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center justify-center gap-1.5">
              <Clock size={16} /> Round starts in
            </span>
            <div className="text-5xl font-display font-black text-amber-400 font-mono tracking-wider animate-pulse">
              {formattedCountdown}
            </div>
            <p className="text-xs text-slate-400">
              Please wait for the administrator to start the round.
            </p>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
              <div 
                className="bg-amber-400 h-full transition-all duration-1000"
                style={{
                  width: activeRoundState.durationSeconds 
                    ? `${Math.min(100, (remainingSeconds / activeRoundState.durationSeconds) * 100)}%` 
                    : '100%'
                }}
              />
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-left text-xs text-slate-400 space-y-2">
            <span className="font-bold text-slate-300 block mb-1">📋 Instructions & Rules:</span>
            <ul className="list-disc list-inside space-y-1">
              <li>Do not switch tabs or minimize the browser during the quiz.</li>
              <li>There is ONE total timer for the entire MCQ round.</li>
              <li>Your selected answers are saved automatically on selection.</li>
            </ul>
          </div>
        </div>
      )}

      {/* 4. WAITING VIEW */}
      {effectiveStatus === 'waiting' && !currentQuestion && !leaderboard && !isFinished && (
        <div className="w-full max-w-xl bg-slate-800/90 border border-slate-700/80 rounded-3xl p-8 shadow-2xl text-center space-y-6 animate-fade-in relative z-10">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary/20 border border-primary/40 rounded-xl flex items-center justify-center text-primary font-bold text-sm">
                A
              </div>
              <span className="text-lg font-display font-bold text-white tracking-tight">{event?.name || 'ACM Event'}</span>
            </div>
            {onlineCount > 0 && (
              <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {onlineCount} Online
              </span>
            )}
          </div>
          <div>
            <span className="inline-block px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-xs font-extrabold uppercase tracking-widest rounded-full mb-2">
              {activeRoundState.roundName || 'Round 1 — MCQ'}
            </span>
            <h2 className="text-3xl font-display font-extrabold text-white">
              {activeRoundState.roundName || 'Round 1 — MCQ'}
            </h2>
            {activeRoundState.roundDescription && (
              <p className="text-slate-400 text-sm mt-2">{activeRoundState.roundDescription}</p>
            )}
          </div>
          <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-center gap-2 text-amber-400 font-bold text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              Status: Waiting for administrator
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              The administrator has not started the round yet. You will automatically transition when the countdown or round begins.
            </p>
          </div>
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-left text-xs text-slate-400 space-y-2">
            <span className="font-bold text-slate-300 block mb-1">📋 Instructions & Rules:</span>
            <ul className="list-disc list-inside space-y-1">
              <li>Do not switch tabs or minimize the browser during the quiz.</li>
              <li>There is ONE total timer for the entire MCQ round.</li>
              <li>Your selected answers are saved automatically on selection.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitConfirmModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowSubmitConfirmModal(false)}>
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-800 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold">Submit MCQ Round Attempt?</h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Are you sure you want to submit your round attempt? Once submitted, you cannot change your answers.
            </p>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
              <p className="text-slate-400">Total Questions: <strong className="text-white">{mcqQuestions.length}</strong></p>
              <p className="text-slate-400">Answered: <strong className="text-emerald-400">{Object.keys(mcqAnswers).length}</strong></p>
              <p className="text-slate-400">Unanswered: <strong className="text-amber-400">{Math.max(0, mcqQuestions.length - Object.keys(mcqAnswers).length)}</strong></p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowSubmitConfirmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMcqSubmitAttempt(false)}
                disabled={mcqSubmitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl disabled:opacity-50"
              >
                {mcqSubmitting ? 'Submitting...' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {currentQuestion && !isRoundVerified && (
        <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-brutal border border-slate-700 text-center">
          <h2 className="text-2xl font-bold mb-4">Round Locked</h2>
          <p className="text-slate-400 mb-6">Enter the access code to join this round.</p>
          <form onSubmit={handleVerifyCode}>
            <input 
              type="text" 
              value={pendingCode}
              onChange={e => { setPendingCode(e.target.value.toUpperCase()); setCodeError(''); }}
              placeholder="ENTER 6-DIGIT CODE" 
              maxLength={6}
              className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-700 rounded-xl focus:outline-none focus:border-primary text-center font-mono text-2xl font-bold tracking-widest mb-2 uppercase"
            />
            {codeError && <p className="text-error text-sm font-bold mb-4">{codeError}</p>}
            <button 
              type="submit" 
              disabled={verifying || pendingCode.length < 3}
              className="w-full mt-4 px-4 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-accent transition-colors disabled:opacity-50"
            >
              {verifying ? 'Verifying...' : 'Unlock Round'}
            </button>
          </form>
        </div>
      )}

      {currentQuestion && isRoundVerified && (
        <div className="w-full max-w-2xl">
          {event?.type === 'KBC' && (
            <div className="flex gap-4 justify-center mb-6">
              <button 
                disabled={usedLifelines.fifty || timeLeft === 0 || timerPaused} 
                onClick={useFiftyFifty} 
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full font-bold shadow-soft disabled:opacity-50 transition-transform hover:scale-105"
              >
                50:50
              </button>
              <button 
                disabled={usedLifelines.flip || timeLeft === 0 || timerPaused} 
                onClick={useFlip} 
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full font-bold shadow-soft disabled:opacity-50 transition-transform hover:scale-105"
              >
                Flip Question
              </button>
              <button 
                disabled={usedLifelines.phone || timeLeft === 0 || timerPaused} 
                onClick={usePhone} 
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full font-bold shadow-soft disabled:opacity-50 transition-transform hover:scale-105"
              >
                Phone a Friend
              </button>
            </div>
          )}
          
          {timerPaused && !revealedAnswer && (
            <div className="bg-warning/20 border border-warning text-warning px-4 py-2 rounded-lg text-center mb-4 font-bold animate-pulse">
              Timer Paused
            </div>
          )}

          <div className="bg-slate-800 rounded-2xl p-8 shadow-brutal border border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-bold">
                {currentQuestion.questionIndex && currentQuestion.totalQuestions 
                  ? `Q${currentQuestion.questionIndex} of ${currentQuestion.totalQuestions}`
                  : 'Question'}
              </span>
              <span className={`font-mono font-bold text-xl ${timeLeft <= 5 ? 'text-error animate-urgency' : 'text-warning'}`}>
                {timeLeft}s
              </span>
            </div>
            
            <h2 className="text-3xl font-display font-bold mb-6">{currentQuestion.text}</h2>

            {/* Media Player */}
            {currentQuestion.mediaType && currentQuestion.mediaType !== 'NONE' && currentQuestion.mediaUrl && (
              <div className="mb-8 rounded-2xl overflow-hidden border border-slate-600 bg-slate-900/60">
                {currentQuestion.mediaType === 'IMAGE' && (
                  <img
                    src={currentQuestion.mediaUrl}
                    alt="Question media"
                    className="w-full max-h-72 object-contain"
                  />
                )}
                {currentQuestion.mediaType === 'AUDIO' && (
                  <div className="flex flex-col items-center gap-3 p-6">
                    <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-3xl">
                      🎵
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Voice Note / Audio Clip</p>
                    <audio
                      controls
                      autoPlay
                      src={currentQuestion.mediaUrl}
                      className="w-full"
                    />
                  </div>
                )}
                {currentQuestion.mediaType === 'VIDEO' && (
                  currentQuestion.mediaUrl.includes('youtube.com/embed') || currentQuestion.mediaUrl.includes('youtu.be') ? (
                    <iframe
                      src={currentQuestion.mediaUrl.replace('youtu.be/', 'youtube.com/embed/')}
                      className="w-full aspect-video"
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      controls
                      autoPlay
                      src={currentQuestion.mediaUrl}
                      className="w-full max-h-72"
                    />
                  )
                )}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {currentQuestion.options.map((opt: any, index: number) => {
                const isSelected = selectedAnswer === opt.id;
                const isHidden = hiddenOptions.includes(opt.id);
                
                let btnClass = isSelected
                  ? 'bg-primary border-primary text-white shadow-soft translate-y-1'
                  : 'bg-slate-700 border-slate-600 hover:border-primary hover:bg-slate-600';
                
                if (isHidden) {
                  btnClass = 'bg-slate-900 border-slate-800 text-transparent opacity-0 pointer-events-none';
                } else if (revealedAnswer) {
                if (opt.id === revealedAnswer.correctAnswer) {
                  btnClass = 'bg-success border-success text-white scale-105 shadow-brutal';
                } else if (isSelected && opt.id !== revealedAnswer.correctAnswer) {
                  btnClass = 'bg-error border-error text-white opacity-75';
                } else {
                  btnClass = 'bg-slate-800 border-slate-700 text-slate-500 opacity-50';
                }
              }

              return (
                <button
                  key={opt.id}
                  disabled={!!selectedAnswer || timeLeft === 0 || !!revealedAnswer}
                  onClick={() => handleSubmit(opt.id)}
                  className={`p-6 rounded-xl text-left font-bold text-lg transition-all border-2 ${btnClass}`}
                >
                  <span className="inline-block w-8 h-8 rounded bg-slate-800 text-center leading-8 mr-3">
                    {String.fromCharCode(65 + index)}
                  </span>
                  {opt.text}
                </button>
              );
            })}
            </div>

            {revealedAnswer?.explanation && (
              <div className="mt-8 p-4 bg-slate-700/50 border border-slate-600 rounded-xl">
                <h3 className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">Explanation</h3>
                <p className="text-slate-200">{revealedAnswer.explanation}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {isFinished && leaderboard && me && (
        <div className="w-full max-w-2xl text-center space-y-8 animate-fade-in relative z-10 p-4">
          <ConfettiShower />
          
          <div className="bg-slate-800 rounded-3xl p-8 border border-slate-700 shadow-brutal flex flex-col items-center">
            {/* Crown / Trophy */}
            <div className="w-24 h-24 bg-amber-500/10 border-2 border-amber-500 rounded-full flex items-center justify-center text-amber-400 mb-6 animate-pulse">
              <Trophy size={48} />
            </div>

            <h1 className="text-4xl font-display font-extrabold text-white mb-2">Quiz Finished!</h1>
            <p className="text-slate-400 text-sm mb-8">
              The event host has closed the quiz. Here is your final performance:
            </p>

            {/* Rank and Score display */}
            <div className="grid grid-cols-2 gap-4 w-full mb-8">
              <div className="bg-slate-900/60 border border-slate-700/80 rounded-2xl p-6 text-center">
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Your Rank</span>
                <span className="text-4xl font-display font-black text-amber-400 font-mono">
                  #{leaderboard.findIndex(p => p.name === me.name) + 1 || '-'}
                </span>
              </div>
              
              <div className="bg-slate-900/60 border border-slate-700/80 rounded-2xl p-6 text-center">
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Score</span>
                <span className="text-4xl font-display font-black text-primary font-mono">
                  {leaderboard.find(p => p.name === me.name)?.points ?? 0} pts
                </span>
              </div>
            </div>

            {/* Top 3 podium inside participant view too! */}
            <h3 className="text-slate-300 font-bold text-lg mb-6 tracking-wide">🏆 Podium Finishers</h3>
            
            <div className="flex items-end justify-center gap-3 h-44 w-full bg-slate-900/40 rounded-2xl p-4 border border-slate-800/80 mb-6">
              {/* 2nd place */}
              {leaderboard[1] && (
                <div className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-xs font-bold text-slate-300 truncate max-w-[80px]">{leaderboard[1].name}</span>
                  <span className="text-[10px] text-slate-400 font-mono mb-1">{leaderboard[1].points}</span>
                  <div className="w-full h-[50%] bg-slate-700/50 border-t-2 border-slate-400 rounded-t flex items-center justify-center font-bold text-slate-300">
                    2nd
                  </div>
                </div>
              )}
              {/* 1st place */}
              {leaderboard[0] && (
                <div className="flex-1 flex flex-col items-center justify-end h-full">
                  <Crown size={16} className="text-amber-400 animate-bounce mb-1" />
                  <span className="text-xs font-extrabold text-amber-200 truncate max-w-[90px]">{leaderboard[0].name}</span>
                  <span className="text-[10px] text-amber-300 font-mono mb-1">{leaderboard[0].points}</span>
                  <div className="w-full h-[70%] bg-amber-500/20 border-t-2 border-amber-400 rounded-t flex items-center justify-center font-black text-amber-400">
                    1st
                  </div>
                </div>
              )}
              {/* 3rd place */}
              {leaderboard[2] && (
                <div className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-xs font-bold text-amber-100 truncate max-w-[80px]">{leaderboard[2].name}</span>
                  <span className="text-[10px] text-amber-600/80 font-mono mb-1">{leaderboard[2].points}</span>
                  <div className="w-full h-[35%] bg-amber-700/20 border-t-2 border-amber-600 rounded-t flex items-center justify-center font-bold text-amber-600">
                    3rd
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {leaderboard && !isFinished && (
        <div className="w-full max-w-xl bg-slate-800 rounded-2xl p-8 shadow-soft border border-slate-700">
          <h2 className="text-3xl font-display font-bold mb-6 text-warning text-center">Leaderboard</h2>
          <div className="space-y-3">
            {leaderboard.map((player, idx) => (
              <div key={idx} className="flex justify-between items-center p-4 bg-slate-700 rounded-lg">
                <div className="flex items-center gap-4">
                  <span className="font-bold text-slate-400">#{idx + 1}</span>
                  <span className="font-medium text-lg">{player.name}</span>
                </div>
                <span className="font-bold text-primary">{player.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cheat Warning Modal Overlay */}
      {cheatWarning && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-900 border-2 border-red-500 max-w-md w-full rounded-2xl p-8 text-center shadow-[0_0_50px_rgba(239,68,68,0.3)] transform transition-all duration-300 scale-100 animate-shake">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-red-500/10 border-2 border-red-500 rounded-full flex items-center justify-center text-red-500 animate-pulse">
                <ShieldAlert size={40} />
              </div>
            </div>
            
            <h2 className="text-2xl font-bold font-display text-red-500 mb-3 uppercase tracking-wider">
              Proctoring Violation
            </h2>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              Switching tabs, opening developer tools, or losing browser window focus is strictly prohibited during this quiz. Your focus changes have been logged.
            </p>
            
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 mb-6 grid grid-cols-2 gap-4 text-left">
              <div>
                <span className="block text-xs font-semibold text-slate-400 uppercase">Violations</span>
                <span className="text-lg font-bold text-red-400 font-mono">{cheatCount} Detected</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-400 uppercase">Proctor Status</span>
                <span className="text-xs font-bold text-red-500 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 mt-1 inline-block">
                  FLAGGED
                </span>
              </div>
            </div>
            
            <button
              onClick={() => setCheatWarning(false)}
              className="w-full py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-red-900/30 flex items-center justify-center gap-2"
            >
              <AlertTriangle size={16} /> I Understand, Resume Quiz
            </button>
          </div>
        </div>
      )}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-display font-bold text-white mb-2">Complete Your Profile</h2>
            <p className="text-slate-400 text-sm mb-6">Before you can attempt this quiz, please enter your details so the organizers can record your answers and score.</p>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Full Name *</label>
                <input 
                  type="text" 
                  value={profileForm.name} 
                  onChange={e => setProfileForm({...profileForm, name: e.target.value})} 
                  required
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-3 bg-slate-850 border border-slate-700 rounded-xl focus:outline-none focus:border-primary transition-colors text-white" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">USN *</label>
                <input 
                  type="text" 
                  value={profileForm.usn} 
                  onChange={e => setProfileForm({...profileForm, usn: e.target.value.toUpperCase()})} 
                  required
                  placeholder="e.g. 1RV21CS001"
                  className="w-full px-4 py-3 bg-slate-850 border border-slate-700 rounded-xl focus:outline-none focus:border-primary transition-colors text-white" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Branch *</label>
                  <input 
                    type="text" 
                    value={profileForm.branch} 
                    onChange={e => setProfileForm({...profileForm, branch: e.target.value})} 
                    required
                    placeholder="e.g. CSE"
                    className="w-full px-4 py-3 bg-slate-850 border border-slate-700 rounded-xl focus:outline-none focus:border-primary transition-colors text-white" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Year *</label>
                  <select 
                    value={profileForm.year} 
                    onChange={e => setProfileForm({...profileForm, year: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-850 border border-slate-700 rounded-xl focus:outline-none focus:border-primary transition-colors text-white bg-slate-900"
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
