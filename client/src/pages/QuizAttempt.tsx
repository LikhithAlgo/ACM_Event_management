import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import type { Question, QuizEvent, RevealData, LeaderboardEntry } from '../lib/types';

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
  
  // Access Code State
  const [verifiedRounds, setVerifiedRounds] = useState<Record<string, boolean>>({});
  const [pendingCode, setPendingCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState('');

  useEffect(() => {
    // Load event + create participant session
    fetchApi(`/events/${eventId}`).then(setEvent).catch(console.error);
    fetchApi(`/events/${eventId}/join`, { method: 'POST' }).catch(console.error);

    // Connect to Socket.IO server
    const newSocket = io(import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:3001');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('join_event', eventId);
    });

    newSocket.on('new_question', (question) => {
      setCurrentQuestion(question);
      setSelectedAnswer(null);
      setRevealedAnswer(null);
      setLeaderboard(null); // Hide leaderboard when new question starts
      setHiddenOptions([]); // Reset lifelines
      setTimeLeft(question.timerSeconds || 30);
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

    return () => {
      newSocket.disconnect();
    };
  }, [eventId]);

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
        alert('Warning: Switching tabs is not allowed during the quiz! This has been logged.');
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
  }, [eventId]);

  const handleSubmit = async (answerId: string) => {
    if (selectedAnswer) return; // Prevent double submit
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentRound = (event?.rounds as any[])?.find((r: any) => r.id === currentQuestion?.roundId);
  const requiresCode = currentRound?.accessCode === 'REQUIRED';
  const isRoundVerified = !requiresCode || verifiedRounds[currentQuestion?.roundId || ''];

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
      {!currentQuestion && !leaderboard && (
        <div className="text-center animate-pulse">
          <h2 className="text-2xl font-bold mb-2">Waiting for the host...</h2>
          <p className="text-slate-400">The next question will appear here shortly.</p>
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

      {leaderboard && (
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
    </div>
  );
}
