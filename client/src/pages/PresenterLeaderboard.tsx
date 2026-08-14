import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Trophy, Medal, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchApi } from '../lib/api';
import type { LeaderboardEntry } from '../lib/types';
import { redirectToHost } from '../lib/hosts';

function ConfettiShower() {
  const colors = ['bg-amber-400', 'bg-red-400', 'bg-blue-400', 'bg-emerald-400', 'bg-purple-400', 'bg-pink-400', 'bg-teal-400'];
  const particles = Array.from({ length: 80 });
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

export function PresenterLeaderboard() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    // Admin-only guard
    fetchApi('/events/me').then((u) => {
      const didRedirect = redirectToHost(u.role, `/presenter/${eventId}`);
      if (didRedirect) return;
      if (u.role !== 'ADMIN') { navigate('/'); return; }
      setAuthed(true);
    }).catch(() => navigate('/'));

    const newSocket = io(import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:3001');

    newSocket.on('connect', () => {
      newSocket.emit('join_event', eventId);
    });

    newSocket.on('leaderboard_update', (board) => {
      setLeaderboard(board);
    });

    newSocket.on('quiz_finished', (finalBoard) => {
      setLeaderboard(finalBoard);
      setIsFinished(true);
    });

    return () => {
      newSocket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (!authed) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>;


  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3, 10);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8 overflow-hidden font-sans">
      {isFinished && <ConfettiShower />}
      
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full mix-blend-screen"></div>
      </div>

      <div className="z-10 w-full max-w-6xl flex flex-col items-center">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 text-center"
        >
          {isFinished ? (
            <div className="space-y-4">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="inline-block"
              >
                <Crown size={72} className="text-amber-400 filter drop-shadow-[0_0_15px_rgba(251,191,36,0.6)]" />
              </motion.div>
              <h1 className="text-6xl md:text-7xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 tracking-tight filter drop-shadow-md">
                QUIZ CHAMPIONS
              </h1>
              <p className="text-slate-400 text-lg font-medium tracking-wide">
                Congratulations to the top performers of this event!
              </p>
            </div>
          ) : (
            <h1 className="text-5xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 flex items-center justify-center gap-4">
              <Trophy size={48} className="text-amber-400" />
              Live Leaderboard
              <Trophy size={48} className="text-amber-400" />
            </h1>
          )}
        </motion.div>

        {leaderboard.length === 0 ? (
          <div className="text-2xl text-slate-500 animate-pulse mt-20">Waiting for results...</div>
        ) : (
          <div className="w-full flex flex-col items-center gap-12">
            
            {/* Podium for Top 3 */}
            <div className="flex items-end justify-center gap-4 h-80 mt-12 mb-4">
              {/* Rank 2 (Silver) */}
              {top3[1] && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: '70%', opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  className="w-48 flex flex-col items-center justify-end relative"
                >
                  <div className="absolute top-[-70px] flex flex-col items-center w-full">
                    <span className="text-xl font-bold text-center text-slate-200 max-w-full px-2 break-words">{top3[1].name}</span>
                    <span className="font-mono text-slate-400 font-bold text-sm">{top3[1].points} pts</span>
                  </div>
                  <div className={`w-full h-full bg-gradient-to-t ${isFinished ? 'from-slate-400/30 to-slate-200/50 border-t-8 border-slate-300' : 'from-slate-400/20 to-slate-300/40 border-t-4 border-slate-300'} rounded-t-xl flex flex-col items-center justify-start pt-6 backdrop-blur-sm shadow-[0_0_35px_rgba(203,213,225,0.25)]`}>
                    <span className="text-4xl font-black text-slate-300 drop-shadow-md">2</span>
                  </div>
                </motion.div>
              )}

              {/* Rank 1 (Gold) */}
              {top3[0] && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: '100%', opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                  className="w-56 flex flex-col items-center justify-end relative z-10"
                >
                  <div className="absolute top-[-85px] flex flex-col items-center w-full">
                    {isFinished ? (
                      <Crown size={36} className="text-amber-300 mb-1 animate-bounce" />
                    ) : (
                      <Medal size={32} className="text-amber-400 mb-1" />
                    )}
                    <span className="text-2xl font-bold text-amber-100 text-center max-w-full px-2 break-words">{top3[0].name}</span>
                    <span className="font-mono text-amber-300 font-bold text-lg">{top3[0].points} pts</span>
                  </div>
                  <div className={`w-full h-full bg-gradient-to-t ${isFinished ? 'from-amber-600/40 via-amber-500/30 to-amber-300/60 border-t-8 border-amber-300 scale-105' : 'from-amber-500/20 to-amber-400/50 border-t-4 border-amber-400'} rounded-t-xl flex flex-col items-center justify-start pt-6 backdrop-blur-sm shadow-[0_0_60px_rgba(251,191,36,0.55)]`}>
                    <span className="text-5xl font-black text-amber-300 drop-shadow-md">1</span>
                  </div>
                </motion.div>
              )}

              {/* Rank 3 (Bronze) */}
              {top3[2] && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: '50%', opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.7 }}
                  className="w-48 flex flex-col items-center justify-end relative"
                >
                  <div className="absolute top-[-70px] flex flex-col items-center w-full">
                    <span className="text-xl font-bold text-center text-amber-100 max-w-full px-2 break-words">{top3[2].name}</span>
                    <span className="font-mono text-amber-600/80 font-bold text-sm">{top3[2].points} pts</span>
                  </div>
                  <div className={`w-full h-full bg-gradient-to-t ${isFinished ? 'from-amber-800/30 to-amber-600/50 border-t-8 border-amber-600' : 'from-amber-700/20 to-amber-600/40 border-t-4 border-amber-600'} rounded-t-xl flex flex-col items-center justify-start pt-6 backdrop-blur-sm shadow-[0_0_35px_rgba(217,119,6,0.25)]`}>
                    <span className="text-4xl font-black text-amber-600 drop-shadow-md">3</span>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Rest of Leaderboard */}
            {rest.length > 0 && (
              <div className="w-full max-w-4xl grid grid-cols-2 gap-4 mt-8">
                <AnimatePresence>
                  {rest.map((player, idx) => (
                    <motion.div 
                      key={player.name + idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * idx }}
                      className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-xl backdrop-blur-sm hover:border-slate-700/80 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-xl font-bold text-slate-500 w-8">#{idx + 4}</span>
                        <span className="text-lg font-medium">{player.name}</span>
                      </div>
                      <span className="font-mono font-bold text-primary">{player.points} pts</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
