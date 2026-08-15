// Shared TypeScript interfaces for ACMQuiz

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'PARTICIPANT';
  googleId?: string;
  usn?: string;
  year?: string;
  branch?: string;
}

export interface QuizEvent {
  id: string;
  name: string;
  description?: string;
  type: 'STANDARD' | 'KBC';
  status: 'DRAFT' | 'READY' | 'LIVE' | 'CLOSED' | 'ARCHIVED';
  maxParticipants?: number;
  startTime?: string;
  endTime?: string;
  enableFFF: boolean;
  lifelineFifty: boolean;
  lifelineFlip: boolean;
  lifelinePhone: boolean;
  createdBy: string;
  createdAt: string;
  rounds?: Round[];
  _count?: { submissions: number };
}

export interface Round {
  id: string;
  eventId: string;
  name: string;
  description?: string;
  type?: 'MCQ' | 'STANDARD';
  roundOrder: number;
  accessCode?: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  durationMinutes?: number;
  marksPerCorrect?: number;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  resultsReleased?: boolean;
  status?: 'WAITING' | 'COUNTDOWN' | 'LIVE' | 'ENDED';
  countdownEndTime?: string;
  roundEndTime?: string;
  questions?: Question[];
}

export interface RoundAttempt {
  id: string;
  roundId: string;
  userId: string;
  eventId: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'FORCE_SUBMITTED';
  startedAt: string;
  submittedAt?: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  answers: Record<string, string>;
  markedForReview: string[];
  user?: User;
}

export interface ParticipantAnswerDetail {
  questionId: string;
  questionText: string;
  options: Option[];
  selectedAnswer: string | null;
  correctAnswer: string;
  result: 'CORRECT' | 'WRONG' | 'UNANSWERED';
  marksAwarded: number;
}

export interface Option {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  roundId: string;
  text: string;
  mediaType: 'NONE' | 'IMAGE' | 'AUDIO' | 'VIDEO';
  mediaUrl?: string;
  options: Option[];
  correctAnswer?: string; // stripped for participants
  points: number;
  timerSeconds: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  explanation?: string;
  // injected by server push
  questionIndex?: number;
  totalQuestions?: number;
}

export interface Submission {
  id: string;
  userId: string;
  eventId: string;
  roundId: string;
  questionId: string;
  answer: string;
  isCorrect: boolean;
  timeTakenMs: number;
  pointsAwarded: number;
  createdAt: string;
}

export interface ParticipantEntry {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  tabSwitches: number;
  submissions: number;
  totalPoints: number;
}

export interface LeaderboardEntry {
  name: string;
  points: number;
}

export interface RevealData {
  questionId: string;
  correctAnswer: string;
  explanation?: string;
}

export interface UserHistory {
  eventId: string;
  eventName: string;
  totalPoints: number;
  rank?: number;
  submittedAt: string;
}
