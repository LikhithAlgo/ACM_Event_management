import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(",") 
  : ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Authentication Middleware using Supabase JWT verification
const authenticateUser = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }
    const token = authHeader.split(" ")[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Sync user with our database
    let dbUser = await prisma.user.findUnique({
      where: { email: user.email! }
    });

    if (!dbUser) {
      const userCount = await prisma.user.count();
      const role = userCount === 0 ? "ADMIN" : "PARTICIPANT";
      dbUser = await prisma.user.create({
        data: {
          email: user.email!,
          name: user.user_metadata.full_name || user.email!.split("@")[0],
          role: role,
          googleId: user.id
        }
      });
    }

    req.user = dbUser;
    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// --- REST Endpoints ---

// Get current user details and sync with database
app.get("/api/v1/events/me", authenticateUser, async (req: any, res: any) => {
  res.json(req.user);
});

// Fetch events list (ADMIN gets all, PARTICIPANT gets only ready/live events)
app.get("/api/v1/events", authenticateUser, async (req: any, res: any) => {
  try {
    const events = await prisma.quizEvent.findMany({
      where: req.user.role === "ADMIN" ? {} : { status: { in: ["READY", "LIVE"] } },
      orderBy: { createdAt: "desc" }
    });
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch participant event history
app.get("/api/v1/events/me/history", authenticateUser, async (req: any, res: any) => {
  try {
    const submissions = await prisma.submission.findMany({
      where: { userId: req.user.id },
      include: { event: true }
    });

    const eventPoints: Record<string, { eventName: string, totalPoints: number, submittedAt: Date }> = {};
    submissions.forEach(s => {
      if (!eventPoints[s.eventId]) {
        eventPoints[s.eventId] = {
          eventName: s.event.name,
          totalPoints: 0,
          submittedAt: s.createdAt
        };
      }
      eventPoints[s.eventId].totalPoints += s.pointsAwarded;
    });

    const history = Object.entries(eventPoints).map(([eventId, data]) => ({
      eventId,
      eventName: data.eventName,
      totalPoints: data.totalPoints,
      submittedAt: data.submittedAt
    }));

    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Global leaderboard/rank list
app.get("/api/v1/events/global-ranks", authenticateUser, async (req: any, res: any) => {
  try {
    const users = await prisma.user.findMany({
      include: { submissions: true }
    });

    const ranks = users.map(u => {
      const totalPoints = u.submissions.reduce((sum, s) => sum + s.pointsAwarded, 0);
      return {
        name: u.name,
        points: totalPoints
      };
    }).sort((a, b) => b.points - a.points);

    res.json(ranks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Event (ADMIN only)
app.post("/api/v1/events", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { name, description, type, maxParticipants, startTime, endTime, enableFFF, lifelineFifty, lifelineFlip, lifelinePhone } = req.body;
    
    const newEvent = await prisma.quizEvent.create({
      data: {
        name,
        description,
        type: type || "STANDARD",
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        enableFFF: !!enableFFF,
        lifelineFifty: !!lifelineFifty,
        lifelineFlip: !!lifelineFlip,
        lifelinePhone: !!lifelinePhone,
        createdBy: req.user.id
      }
    });
    res.json(newEvent);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch Single Event Details (Strips answers for participants)
app.get("/api/v1/events/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const event = await prisma.quizEvent.findUnique({
      where: { id: req.params.id },
      include: {
        rounds: {
          orderBy: { roundOrder: "asc" },
          include: {
            questions: true
          }
        }
      }
    });

    if (!event) return res.status(404).json({ error: "Event not found" });

    // Strip answers for non-admins
    if (req.user.role !== "ADMIN") {
      event.rounds.forEach((round: any) => {
        round.questions.forEach((q: any) => {
          delete q.correctAnswer;
          delete q.explanation;
        });
      });
    }

    res.json(event);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Join Event
app.post("/api/v1/events/:id/join", authenticateUser, async (req: any, res: any) => {
  try {
    const eventId = req.params.id;
    const event = await prisma.quizEvent.findUnique({
      where: { id: eventId },
      include: { participants: true }
    });

    if (!event) return res.status(404).json({ error: "Event not found" });

    if (event.maxParticipants && event.participants.length >= event.maxParticipants) {
      return res.status(400).json({ error: "Event is full" });
    }

    const participant = await prisma.eventParticipant.upsert({
      where: { eventId_userId: { eventId, userId: req.user.id } },
      create: { eventId, userId: req.user.id },
      update: {}
    });

    res.json(participant);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Event Status (ADMIN only)
app.patch("/api/v1/events/:id/status", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { status } = req.body;
    
    const updated = await prisma.quizEvent.update({
      where: { id: req.params.id },
      data: { status }
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Round (ADMIN only)
app.post("/api/v1/events/:id/rounds", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { name, description, roundOrder, accessCode, shuffleQuestions, shuffleOptions } = req.body;

    const newRound = await prisma.round.create({
      data: {
        eventId: req.params.id,
        name,
        description,
        roundOrder: parseInt(roundOrder) || 1,
        accessCode: accessCode || null,
        shuffleQuestions: !!shuffleQuestions,
        shuffleOptions: !!shuffleOptions
      }
    });
    res.json(newRound);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Question (ADMIN only)
app.post("/api/v1/questions/rounds/:roundId/questions", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { text, options, correctAnswer, points, timerSeconds, difficulty, explanation, mediaType, mediaUrl } = req.body;

    const newQuestion = await prisma.question.create({
      data: {
        roundId: req.params.roundId,
        text,
        options,
        correctAnswer,
        points: parseInt(points) || 10,
        timerSeconds: parseInt(timerSeconds) || 30,
        difficulty: difficulty || "MEDIUM",
        explanation: explanation || null,
        mediaType: mediaType || "NONE",
        mediaUrl: mediaUrl || null
      }
    });
    res.json(newQuestion);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk Create Questions (ADMIN only)
app.post("/api/v1/questions/rounds/:roundId/questions/bulk", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { questions } = req.body;

    const data = questions.map((q: any) => ({
      roundId: req.params.roundId,
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
      points: parseInt(q.points) || 10,
      timerSeconds: parseInt(q.timerSeconds) || 30,
      difficulty: q.difficulty || "MEDIUM",
      explanation: q.explanation || null,
      mediaType: q.mediaType || "NONE",
      mediaUrl: q.mediaUrl || null
    }));

    const created = await prisma.question.createMany({ data });
    res.json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Question (ADMIN only)
app.patch("/api/v1/questions/:questionId", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { text, options, correctAnswer, points, timerSeconds, difficulty, explanation, mediaType, mediaUrl } = req.body;

    const updated = await prisma.question.update({
      where: { id: req.params.questionId },
      data: {
        text,
        options,
        correctAnswer,
        points: points ? parseInt(points) : undefined,
        timerSeconds: timerSeconds ? parseInt(timerSeconds) : undefined,
        difficulty,
        explanation,
        mediaType,
        mediaUrl
      }
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Question (ADMIN only)
app.delete("/api/v1/questions/:questionId", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    await prisma.question.delete({
      where: { id: req.params.questionId }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Duplicate Event (ADMIN only)
app.post("/api/v1/events/:id/duplicate", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const eventToDup = await prisma.quizEvent.findUnique({
      where: { id: req.params.id },
      include: {
        rounds: {
          include: { questions: true }
        }
      }
    });

    if (!eventToDup) return res.status(404).json({ error: "Event not found" });

    const newEvent = await prisma.quizEvent.create({
      data: {
        name: `${eventToDup.name} (Copy)`,
        description: eventToDup.description,
        type: eventToDup.type,
        status: "DRAFT",
        maxParticipants: eventToDup.maxParticipants,
        enableFFF: eventToDup.enableFFF,
        lifelineFifty: eventToDup.lifelineFifty,
        lifelineFlip: eventToDup.lifelineFlip,
        lifelinePhone: eventToDup.lifelinePhone,
        createdBy: req.user.id,
        rounds: {
          create: eventToDup.rounds.map(r => ({
            name: r.name,
            description: r.description,
            roundOrder: r.roundOrder,
            accessCode: r.accessCode,
            shuffleQuestions: r.shuffleQuestions,
            shuffleOptions: r.shuffleOptions,
            questions: {
              create: r.questions.map(q => ({
                text: q.text,
                mediaType: q.mediaType,
                mediaUrl: q.mediaUrl,
                options: q.options as any,
                correctAnswer: q.correctAnswer,
                points: q.points,
                timerSeconds: q.timerSeconds,
                difficulty: q.difficulty,
                explanation: q.explanation
              }))
            }
          }))
        }
      }
    });

    res.json(newEvent);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch Participants List (ADMIN only)
app.get("/api/v1/events/:id/participants", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const participants = await prisma.eventParticipant.findMany({
      where: { eventId: req.params.id },
      include: {
        user: {
          include: {
            submissions: {
              where: { eventId: req.params.id }
            }
          }
        }
      }
    });

    const data = participants.map(p => {
      const totalPoints = p.user.submissions.reduce((sum, s) => sum + s.pointsAwarded, 0);
      return {
        id: p.user.id,
        name: p.user.name,
        email: p.user.email,
        joinedAt: p.joinedAt,
        tabSwitches: p.tabSwitches,
        submissions: p.user.submissions.length,
        totalPoints
      };
    });

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Register Cheating/Tab Switches
app.post("/api/v1/questions/cheat", authenticateUser, async (req: any, res: any) => {
  try {
    const { eventId } = req.body;
    const participant = await prisma.eventParticipant.update({
      where: { eventId_userId: { eventId, userId: req.user.id } },
      data: { tabSwitches: { increment: 1 } }
    });
    res.json(participant);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Submit Answer
app.post("/api/v1/questions/submit", authenticateUser, async (req: any, res: any) => {
  try {
    const { questionId, answer, timeTakenMs } = req.body;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { round: true }
    });

    if (!question) return res.status(404).json({ error: "Question not found" });

    // Check if user already submitted for this question
    const existing = await prisma.submission.findUnique({
      where: { userId_questionId: { userId: req.user.id, questionId } }
    });

    if (existing) {
      return res.status(400).json({ error: "Answer already submitted" });
    }

    const isCorrect = question.correctAnswer === answer;
    const pointsAwarded = isCorrect ? question.points : 0;

    const submission = await prisma.submission.create({
      data: {
        userId: req.user.id,
        eventId: question.round.eventId,
        roundId: question.roundId,
        questionId,
        answer,
        isCorrect,
        timeTakenMs,
        pointsAwarded
      }
    });

    res.json(submission);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Verify Access Code
app.post("/api/v1/events/rounds/:roundId/verify", authenticateUser, async (req: any, res: any) => {
  try {
    const { accessCode } = req.body;
    const round = await prisma.round.findUnique({
      where: { id: req.params.roundId }
    });

    if (!round) return res.status(404).json({ error: "Round not found" });

    if (round.accessCode && round.accessCode !== accessCode) {
      return res.status(400).json({ error: "Invalid access code" });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Socket.IO Handlers ---

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});
const activeEventTimers: Record<string, NodeJS.Timeout> = {};
const activeQuestionIndex: Record<string, number> = {};
const gameState: Record<string, "waiting" | "question" | "revealed"> = {};
const autoplayMode: Record<string, boolean> = {};
const autoplayTimers: Record<string, NodeJS.Timeout> = {};

const sendAdminState = (eventId: string) => {
  io.to(`event_${eventId}_admin`).emit("game_state_update", {
    currentState: gameState[eventId] || "waiting",
    currentIndex: activeQuestionIndex[eventId] ?? -1,
    autoplayEnabled: !!autoplayMode[eventId]
  });
};

const revealAnswer = async (eventId: string, questionId: string) => {
  // Clear auto-reveal timer
  if (activeEventTimers[eventId]) {
    clearTimeout(activeEventTimers[eventId]);
    delete activeEventTimers[eventId];
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId }
  });

  if (question) {
    io.to(`event_${eventId}`).emit("reveal_answer", {
      questionId,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation
    });

    gameState[eventId] = "revealed";
    sendAdminState(eventId);

    // Update leaderboard
    const leaderboard = await calculateLeaderboard(eventId);
    io.to(`event_${eventId}`).emit("leaderboard_update", leaderboard);

    // If Autoplay is enabled, automatically go to the next question after a delay
    if (autoplayMode[eventId]) {
      if (autoplayTimers[eventId]) {
        clearTimeout(autoplayTimers[eventId]);
      }
      autoplayTimers[eventId] = setTimeout(() => {
        advanceNextStep(eventId);
      }, 5000); // 5 seconds display of leaderboard
    }
  }
};

const advanceNextStep = async (eventId: string) => {
  // Clear autoplay timer if manual step is requested
  if (autoplayTimers[eventId]) {
    clearTimeout(autoplayTimers[eventId]);
    delete autoplayTimers[eventId];
  }

  const event = await prisma.quizEvent.findUnique({
    where: { id: eventId },
    include: {
      rounds: {
        orderBy: { roundOrder: "asc" },
        include: {
          questions: true
        }
      }
    }
  });

  if (!event) return;

  // Flatten all questions
  const questions: any[] = [];
  event.rounds.forEach((r: any) => {
    questions.push(...r.questions);
  });

  if (questions.length === 0) return;

  const currentState = gameState[eventId] || "waiting";

  if (currentState === "question") {
    // If a question is live, the next step is to reveal the answer
    const currentIndex = activeQuestionIndex[eventId] ?? 0;
    const currentQuestion = questions[currentIndex];
    if (currentQuestion) {
      await revealAnswer(eventId, currentQuestion.id);
    }
  } else {
    // If waiting or answer is already revealed, the next step is to push the next question
    let nextIndex = 0;
    if (activeQuestionIndex[eventId] !== undefined && activeQuestionIndex[eventId] !== -1) {
      nextIndex = activeQuestionIndex[eventId] + 1;
    }

    if (nextIndex < questions.length) {
      const nextQuestion = questions[nextIndex];
      activeQuestionIndex[eventId] = nextIndex;
      gameState[eventId] = "question";
      sendAdminState(eventId);

      // Emit new question
      const cleanQuestion = {
        ...nextQuestion,
        correctAnswer: undefined,
        explanation: undefined
      };
      io.to(`event_${eventId}`).emit("new_question", cleanQuestion);

      // Start automatic reveal timer for this new question
      if (activeEventTimers[eventId]) {
        clearTimeout(activeEventTimers[eventId]);
      }
      const durationMs = (nextQuestion.timerSeconds || 30) * 1000 + 1500;
      activeEventTimers[eventId] = setTimeout(async () => {
        await revealAnswer(eventId, nextQuestion.id);
      }, durationMs);
    } else {
      // No more questions left!
      io.to(`event_${eventId}`).emit("quiz_finished");
      gameState[eventId] = "waiting";
      activeQuestionIndex[eventId] = -1; // reset
      sendAdminState(eventId);
    }
  }
};


const calculateLeaderboard = async (eventId: string) => {
  const participants = await prisma.eventParticipant.findMany({
    where: { eventId },
    include: {
      user: {
        include: {
          submissions: {
            where: { eventId }
          }
        }
      }
    }
  });

  return participants.map(p => {
    const points = p.user.submissions.reduce((sum, s) => sum + s.pointsAwarded, 0);
    return {
      name: p.user.name,
      points
    };
  }).sort((a, b) => b.points - a.points);
};

const sendRoomCount = (eventId: string) => {
  const room = io.sockets.adapter.rooms.get(`event_${eventId}`);
  const count = room ? room.size : 0;
  io.to(`event_${eventId}_admin`).emit("room_count", count);
};

io.on("connection", (socket) => {
  socket.on("join_event", (eventId) => {
    socket.join(`event_${eventId}`);
    sendRoomCount(eventId);
  });

  socket.on("join_admin", (eventId) => {
    socket.join(`event_${eventId}`);
    socket.join(`event_${eventId}_admin`);
    sendRoomCount(eventId);
    sendAdminState(eventId);
  });

  socket.on("admin_push_question", async ({ eventId, questionId }) => {
    const event = await prisma.quizEvent.findUnique({
      where: { id: eventId },
      include: {
        rounds: {
          orderBy: { roundOrder: "asc" },
          include: {
            questions: true
          }
        }
      }
    });
    if (!event) return;

    // Flatten all questions
    const questions: any[] = [];
    event.rounds.forEach((r: any) => {
      questions.push(...r.questions);
    });

    const index = questions.findIndex(q => q.id === questionId);
    if (index !== -1) {
      activeQuestionIndex[eventId] = index;
      gameState[eventId] = "question";
      sendAdminState(eventId);
    }

    const question = questions[index];
    if (question) {
      // Clear any existing timer for this event to avoid overlapping timers
      if (activeEventTimers[eventId]) {
        clearTimeout(activeEventTimers[eventId]);
      }

      // Strip answers from the pushed question
      const cleanQuestion = {
        ...question,
        correctAnswer: undefined,
        explanation: undefined
      };
      io.to(`event_${eventId}`).emit("new_question", cleanQuestion);

      // Start automatic reveal timer based on the question's timerSeconds
      // Plus a 1.5s network buffer to ensure all clients have received and rendered the question
      const durationMs = (question.timerSeconds || 30) * 1000 + 1500;
      activeEventTimers[eventId] = setTimeout(async () => {
        await revealAnswer(eventId, question.id);
      }, durationMs);
    }
  });

  socket.on("admin_reveal_answer", async ({ eventId, questionId }) => {
    await revealAnswer(eventId, questionId);
  });

  socket.on("admin_next_step", async ({ eventId }) => {
    await advanceNextStep(eventId);
  });

  socket.on("admin_toggle_autoplay", ({ eventId, enabled }) => {
    autoplayMode[eventId] = enabled;
    sendAdminState(eventId);

    // If enabled and currently revealed, start the auto-advance immediately
    if (enabled && gameState[eventId] === "revealed") {
      if (autoplayTimers[eventId]) clearTimeout(autoplayTimers[eventId]);
      autoplayTimers[eventId] = setTimeout(() => {
        advanceNextStep(eventId);
      }, 5000);
    } else if (!enabled) {
      if (autoplayTimers[eventId]) {
        clearTimeout(autoplayTimers[eventId]);
        delete autoplayTimers[eventId];
      }
    }
  });

  socket.on("admin_resume_timer", ({ eventId }) => {
    io.to(`event_${eventId}`).emit("timer_resume");
  });

  socket.on("admin_show_leaderboard", async ({ eventId }) => {
    const leaderboard = await calculateLeaderboard(eventId);
    io.to(`event_${eventId}`).emit("leaderboard_update", leaderboard);
  });

  socket.on("use_lifeline_fifty", async ({ eventId, questionId }) => {
    const question = await prisma.question.findUnique({
      where: { id: questionId }
    });

    if (question && question.correctAnswer) {
      // Standard options are A, B, C, D
      const options = ["A", "B", "C", "D"];
      const incorrect = options.filter(o => o !== question.correctAnswer);
      
      // Randomly choose 2 incorrect options to hide
      const shuffled = incorrect.sort(() => 0.5 - Math.random());
      const hideOpts = shuffled.slice(0, 2);

      socket.emit("lifeline_fifty_result", hideOpts);
    }
  });

  socket.on("use_lifeline_flip", async ({ eventId, questionId }) => {
    // Find round for current question
    const currentQ = await prisma.question.findUnique({
      where: { id: questionId }
    });

    if (currentQ) {
      // Find an alternative question in the same round
      const questions = await prisma.question.findMany({
        where: { roundId: currentQ.roundId, id: { not: questionId } }
      });

      if (questions.length > 0) {
        // Pick one at random
        const index = Math.floor(Math.random() * questions.length);
        const altQ = questions[index];
        const cleanQuestion = {
          ...altQ,
          correctAnswer: undefined,
          explanation: undefined
        };
        socket.emit("new_question", cleanQuestion);
      }
    }
  });

  socket.on("use_lifeline_phone", ({ eventId }) => {
    // Simple ack to participant
    socket.emit("lifeline_phone_ack");
  });

  socket.on("disconnecting", () => {
    socket.rooms.forEach(room => {
      if (room.startsWith("event_") && !room.endsWith("_admin")) {
        const eventId = room.replace("event_", "");
        // Use a setImmediate to allow room size to update before recalculating count
        setImmediate(() => sendRoomCount(eventId));
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
