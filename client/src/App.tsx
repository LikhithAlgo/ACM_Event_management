import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LandingPage } from './pages/LandingPage';
import { ParticipantDashboard } from './pages/ParticipantDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { AuthCallback } from './pages/AuthCallback';
import { QuizAttempt } from './pages/QuizAttempt';
import { AdminEventManage } from './pages/AdminEventManage';
import { PresenterLeaderboard } from './pages/PresenterLeaderboard';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '14px' },
          success: { style: { background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7' } },
          error:   { style: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5' } },
        }}
      />
      <Router>
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/dashboard" element={<ParticipantDashboard />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/event/:eventId" element={<AdminEventManage />} />
            <Route path="/presenter/:eventId" element={<PresenterLeaderboard />} />
            <Route path="/quiz/:eventId" element={<QuizAttempt />} />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
