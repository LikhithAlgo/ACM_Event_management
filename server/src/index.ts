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
    if (!origin || 
        origin.startsWith("http://localhost:") || 
        origin.startsWith("http://127.0.0.1:") || 
        allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(express.json());

if (!process.env.SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL in server/.env — copy .env.example and fill in values.");
}
if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error("Missing SUPABASE_ANON_KEY in server/.env — copy .env.example and fill in values.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in server/.env — copy .env.example and fill in values.");
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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

    const isAdminEmail = user.email! === "yuvarajkhot2005@gmail.com";

    // Sync user with our database
    let dbUser = await prisma.user.findUnique({
      where: { email: user.email! }
    });

    if (!dbUser) {
      const userCount = await prisma.user.count();
      const role = isAdminEmail ? "ADMIN" : (userCount === 0 ? "ADMIN" : "PARTICIPANT");
      dbUser = await prisma.user.create({
        data: {
          email: user.email!,
          name: user.user_metadata.full_name || user.email!.split("@")[0],
          role: role,
          googleId: user.id,
          usn: user.user_metadata.usn || null,
          year: user.user_metadata.year || null,
          branch: user.user_metadata.branch || null
        }
      });
    } else {
      // Sync info and ensure correct role
      const newRole = isAdminEmail ? "ADMIN" : dbUser.role;
      dbUser = await prisma.user.update({
        where: { email: user.email! },
        data: {
          googleId: dbUser.googleId || user.id,
          name: dbUser.name === dbUser.email.split("@")[0] ? (user.user_metadata.full_name || dbUser.name) : dbUser.name,
          role: newRole,
          usn: dbUser.usn || user.user_metadata.usn || null,
          year: dbUser.year || user.user_metadata.year || null,
          branch: dbUser.branch || user.user_metadata.branch || null
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

// Update user details (USN, Year, Branch, Name)
app.put("/api/v1/events/me/profile", authenticateUser, async (req: any, res: any) => {
  try {
    const { name, usn, year, branch } = req.body;
    if (!name || !usn || !year || !branch) {
      return res.status(400).json({ error: "All profile fields are required" });
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name,
        usn: usn.trim().toUpperCase(),
        year,
        branch: branch.trim()
      }
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
// Promote a user to ADMIN (ADMIN only)
app.post("/api/v1/admin/promote", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const targetEmail = email.trim().toLowerCase();

    // Try to find user in local database
    let user = await prisma.user.findUnique({
      where: { email: targetEmail }
    });

    if (!user) {
      // Create a placeholder user so when they sign up later, they automatically become an admin
      user = await prisma.user.create({
        data: {
          email: targetEmail,
          name: targetEmail.split("@")[0],
          role: "ADMIN"
        }
      });
    } else {
      // Update role of existing user
      user = await prisma.user.update({
        where: { email: targetEmail },
        data: { role: "ADMIN" }
      });
    }

    res.json({ success: true, message: `Successfully promoted ${targetEmail} to Admin!` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Demote an admin to PARTICIPANT (ADMIN only)
app.post("/api/v1/admin/demote", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const targetEmail = email.trim().toLowerCase();

    // Prevent self-demotion
    if (targetEmail === req.user.email) {
      return res.status(400).json({ error: "You cannot demote yourself" });
    }

    // Try to find user in local database
    let user = await prisma.user.findUnique({
      where: { email: targetEmail }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user = await prisma.user.update({
      where: { email: targetEmail },
      data: { role: "PARTICIPANT" }
    });

    res.json({ success: true, message: `Successfully demoted ${targetEmail} to Participant!` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users (ADMIN only)
app.get("/api/v1/admin/users", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const users = await prisma.user.findMany({
      include: {
        _count: {
          select: { submissions: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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
    submissions.forEach((s: any) => {
      if (!eventPoints[s.eventId]) {
        eventPoints[s.eventId] = {
          eventName: s.event.name,
          totalPoints: 0,
          submittedAt: s.createdAt
        };
      }
      eventPoints[s.eventId].totalPoints += s.pointsAwarded;
    });

    const history = Object.entries(eventPoints).map(([eventId, data]: [string, any]) => ({
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
    });    const ranks = users.map((u: any) => {
      const totalPoints = u.submissions.reduce((sum: number, s: any) => sum + s.pointsAwarded, 0);
      return {
        name: u.name,
        totalScore: totalPoints
      };
    }).sort((a: any, b: any) => b.totalScore - a.totalScore);

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

// Delete Event (ADMIN only)
const deleteEventById = async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const eventId = req.params.id;

    const existingEvent = await prisma.quizEvent.findUnique({
      where: { id: eventId }
    });

    if (!existingEvent) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (existingEvent.status === "LIVE") {
      return res.status(400).json({ error: "Cannot delete a LIVE event. Please close the event first." });
    }

    await prisma.quizEvent.delete({
      where: { id: eventId }
    });

    res.json({ success: true, message: `Event "${existingEvent.name}" deleted successfully`, id: eventId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

app.delete("/api/v1/events/:id", authenticateUser, deleteEventById);
app.delete("/api/events/:id", authenticateUser, deleteEventById);

// Join Event
app.post("/api/v1/events/:id/join", authenticateUser, async (req: any, res: any) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;

    // Check if participant already joined to ensure idempotency & allow re-joining
    const existingParticipant = await prisma.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } }
    });

    if (existingParticipant) {
      return res.json(existingParticipant);
    }

    const event = await prisma.quizEvent.findUnique({
      where: { id: eventId },
      include: { participants: true }
    });

    if (!event) return res.status(404).json({ error: "Event not found" });

    if (event.maxParticipants && event.participants.length >= event.maxParticipants) {
      return res.status(400).json({ error: "Event is full" });
    }

    const participant = await prisma.eventParticipant.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId },
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

const handleRoundStatusChange = async (eventId: string, roundId: string, status: "WAITING" | "COUNTDOWN" | "LIVE" | "ENDED", durationSeconds?: number) => {
  if (activeRoundTimers[roundId]) {
    clearTimeout(activeRoundTimers[roundId]);
    delete activeRoundTimers[roundId];
  }

  let countdownEndTime: Date | null = null;
  let roundEndTime: Date | null = null;

  const roundBefore = await prisma.round.findUnique({ where: { id: roundId } });

  if (status === "COUNTDOWN" && durationSeconds && durationSeconds > 0) {
    countdownEndTime = new Date(Date.now() + durationSeconds * 1000);
  } else if (status === "LIVE") {
    const durMins = roundBefore?.durationMinutes || 20;
    roundEndTime = new Date(Date.now() + durMins * 60 * 1000);
  }

  const updatedRound = await prisma.round.update({
    where: { id: roundId },
    data: {
      status,
      countdownEndTime: status === "COUNTDOWN" ? countdownEndTime : null,
      roundEndTime: status === "LIVE" ? roundEndTime : (status === "ENDED" ? null : roundBefore?.roundEndTime)
    }
  });

  const payload = {
    eventId,
    roundId,
    status: status === "LIVE" ? "active" : status.toLowerCase(),
    rawStatus: status,
    startsAt: updatedRound.countdownEndTime ? updatedRound.countdownEndTime.toISOString() : null,
    countdownEndTime: updatedRound.countdownEndTime ? updatedRound.countdownEndTime.toISOString() : null,
    startedAt: updatedRound.roundEndTime ? updatedRound.roundEndTime.toISOString() : null,
    roundEndTime: updatedRound.roundEndTime ? updatedRound.roundEndTime.toISOString() : null,
    durationSeconds: durationSeconds || 0,
    serverTime: new Date().toISOString(),
    round: updatedRound
  };

  io.to(`event_${eventId}`).to(`round_${roundId}`).emit("round_status_update", payload);
  io.to(`event_${eventId}`).to(`round_${roundId}`).emit("round:status", payload);

  if (status === "COUNTDOWN" && durationSeconds && durationSeconds > 0) {
    activeRoundTimers[roundId] = setTimeout(async () => {
      delete activeRoundTimers[roundId];
      await handleRoundStatusChange(eventId, roundId, "LIVE");
    }, durationSeconds * 1000);
  }

  return updatedRound;
};

// Create Round (ADMIN only)
app.post("/api/v1/events/:id/rounds", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { name, description, roundOrder, accessCode, shuffleQuestions, shuffleOptions, type, durationMinutes, marksPerCorrect, randomizeQuestions, randomizeOptions, deliveryMode } = req.body;

    const newRound = await prisma.round.create({
      data: {
        eventId: req.params.id,
        name,
        description,
        type: type || "MCQ",
        deliveryMode: deliveryMode === "LIVE_CONTROLLED" ? "LIVE_CONTROLLED" : "SELF_PACED",
        roundOrder: parseInt(roundOrder) || 1,
        accessCode: accessCode || null,
        shuffleQuestions: !!shuffleQuestions,
        shuffleOptions: !!shuffleOptions,
        durationMinutes: parseInt(durationMinutes) || 20,
        marksPerCorrect: parseInt(marksPerCorrect) || 1,
        randomizeQuestions: !!randomizeQuestions,
        randomizeOptions: !!randomizeOptions
      }
    });
    res.json(newRound);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Round Status / Start Countdown (ADMIN only)
app.patch(["/api/v1/events/:eventId/rounds/:roundId/round-status", "/api/v1/events/:eventId/rounds/:roundId/status"], authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { status, durationSeconds } = req.body;
    const { eventId, roundId } = req.params;

    const updatedRound = await handleRoundStatusChange(
      eventId,
      roundId,
      status,
      durationSeconds ? parseInt(durationSeconds) : undefined
    );
    res.json(updatedRound);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rounds/:id/start-countdown
app.post(["/api/rounds/:id/start-countdown", "/api/v1/rounds/:id/start-countdown", "/api/v1/events/rounds/:id/start-countdown"], authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const roundId = req.params.id;
    const { minutes, durationSeconds } = req.body;
    const durSecs = durationSeconds || (minutes ? minutes * 60 : 600);

    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) return res.status(404).json({ error: "Round not found" });

    const updatedRound = await handleRoundStatusChange(round.eventId, roundId, "COUNTDOWN", durSecs);
    res.json({
      status: "countdown",
      startsAt: updatedRound.countdownEndTime,
      round: updatedRound
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/rounds/:id/start-now
app.post(["/api/rounds/:id/start-now", "/api/v1/rounds/:id/start-now", "/api/v1/events/rounds/:id/start-now"], authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const roundId = req.params.id;

    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) return res.status(404).json({ error: "Round not found" });

    const updatedRound = await handleRoundStatusChange(round.eventId, roundId, "LIVE");
    res.json({
      status: "active",
      startedAt: updatedRound.roundEndTime,
      round: updatedRound
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/rounds/:id - Fetch current round status & info before socket subscription
app.get(["/api/rounds/:id", "/api/v1/rounds/:id", "/api/v1/events/rounds/:id/status-details"], authenticateUser, async (req: any, res: any) => {
  try {
    const roundId = req.params.id;
    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: { questions: true }
    });

    if (!round) return res.status(404).json({ error: "Round not found" });

    if (req.user.role !== "ADMIN" && round.questions) {
      round.questions.forEach((q: any) => {
        delete q.correctAnswer;
        delete q.explanation;
      });
    }

    const rawStatus = round.status;
    const normalizedStatus = rawStatus === "COUNTDOWN" ? "countdown" : (rawStatus === "LIVE" ? "active" : (rawStatus === "ENDED" ? "ended" : "waiting"));

    res.json({
      round,
      status: normalizedStatus,
      rawStatus,
      startsAt: round.countdownEndTime,
      startedAt: round.roundEndTime,
      serverTime: new Date().toISOString()
    });
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
          create: eventToDup.rounds.map((r: any) => ({
            name: r.name,
            description: r.description,
            roundOrder: r.roundOrder,
            accessCode: r.accessCode,
            deliveryMode: r.deliveryMode,
            shuffleQuestions: r.shuffleQuestions,
            shuffleOptions: r.shuffleOptions,
            questions: {
              create: r.questions.map((q: any) => ({
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
    const eventId = req.params.id;

    const participants = await prisma.eventParticipant.findMany({
      where: { eventId },
      include: {
        user: {
          include: {
            submissions: {
              where: { eventId }
            },
            roundAttempts: {
              where: { eventId }
            }
          }
        }
      }
    });

    const data = participants.map((p: any) => {
      const submissionPoints = p.user.submissions.reduce((sum: number, s: any) => sum + s.pointsAwarded, 0);
      const mcqPoints = (p.user.roundAttempts || []).reduce((sum: number, a: any) => sum + (a.score || 0), 0);
      const totalPoints = submissionPoints + mcqPoints;
      const totalSubmissions = p.user.submissions.length + (p.user.roundAttempts || []).length;

      return {
        id: p.user.id,
        name: p.user.name,
        email: p.user.email,
        joinedAt: p.joinedAt,
        tabSwitches: p.tabSwitches,
        submissions: totalSubmissions,
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

// Fetch or Initialize Participant Attempt for an MCQ round
app.get("/api/v1/events/rounds/:roundId/attempt", authenticateUser, async (req: any, res: any) => {
  try {
    const { roundId } = req.params;
    const userId = req.user.id;

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: { questions: true }
    });

    if (!round) return res.status(404).json({ error: "Round not found" });

    // Strip answers if participant
    if (req.user.role !== "ADMIN" && round.questions) {
      round.questions.forEach((q: any) => {
        delete q.correctAnswer;
        delete q.explanation;
      });
    }

    let attempt = await prisma.roundAttempt.findUnique({
      where: { roundId_userId: { roundId, userId } }
    });

    if (!attempt) {
      attempt = await prisma.roundAttempt.create({
        data: {
          roundId,
          userId,
          eventId: round.eventId,
          status: "IN_PROGRESS",
          answers: {},
          markedForReview: []
        }
      });
    }

    let remainingRoundSeconds = 0;
    if (round.roundEndTime) {
      const endMs = new Date(round.roundEndTime).getTime();
      remainingRoundSeconds = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
    } else if (round.status === "LIVE" && round.durationMinutes) {
      remainingRoundSeconds = round.durationMinutes * 60;
    }

    res.json({
      attempt,
      round,
      remainingRoundSeconds,
      serverTime: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Save MCQ draft answers & marked-for-review state
app.post("/api/v1/events/rounds/:roundId/attempt/save", authenticateUser, async (req: any, res: any) => {
  try {
    const { roundId } = req.params;
    const userId = req.user.id;
    const { answers, markedForReview } = req.body;

    let attempt = await prisma.roundAttempt.findUnique({
      where: { roundId_userId: { roundId, userId } }
    });

    if (attempt && attempt.status !== "IN_PROGRESS") {
      return res.status(400).json({ error: "Attempt has already been submitted" });
    }

    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) return res.status(404).json({ error: "Round not found" });

    attempt = await prisma.roundAttempt.upsert({
      where: { roundId_userId: { roundId, userId } },
      update: {
        answers: answers || {},
        markedForReview: markedForReview || []
      },
      create: {
        roundId,
        userId,
        eventId: round.eventId,
        status: "IN_PROGRESS",
        answers: answers || {},
        markedForReview: markedForReview || []
      }
    });

    res.json(attempt);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Submit MCQ Attempt (Calculates score on backend, NO negative marking)
app.post("/api/v1/events/rounds/:roundId/attempt/submit", authenticateUser, async (req: any, res: any) => {
  try {
    const { roundId } = req.params;
    const userId = req.user.id;
    const submittedAnswers = req.body.answers;

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: { questions: true }
    });

    if (!round) return res.status(404).json({ error: "Round not found" });

    let attempt = await prisma.roundAttempt.findUnique({
      where: { roundId_userId: { roundId, userId } }
    });

    if (attempt && attempt.status !== "IN_PROGRESS") {
      return res.json({ message: "Attempt already submitted", attempt });
    }

    const finalAnswers = submittedAnswers || (attempt?.answers as Record<string, string>) || {};

    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    const marksPerCorrect = round.marksPerCorrect || 1;

    round.questions.forEach((q: any) => {
      const selectedOption = finalAnswers[q.id];
      if (selectedOption && q.correctAnswer && selectedOption === q.correctAnswer) {
        correctCount++;
        score += marksPerCorrect;
      } else if (selectedOption) {
        wrongCount++;
        // NO negative marking: 0 points added
      } else {
        unansweredCount++;
      }
    });

    attempt = await prisma.roundAttempt.upsert({
      where: { roundId_userId: { roundId, userId } },
      update: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        score,
        correctCount,
        wrongCount,
        unansweredCount,
        answers: finalAnswers
      },
      create: {
        roundId,
        userId,
        eventId: round.eventId,
        status: "SUBMITTED",
        submittedAt: new Date(),
        score,
        correctCount,
        wrongCount,
        unansweredCount,
        answers: finalAnswers,
        markedForReview: []
      }
    });

    io.to(`event_${round.eventId}_admin`).emit("attempt_submitted", {
      roundId,
      userId,
      score,
      correctCount,
      wrongCount,
      unansweredCount
    });

    res.json({ success: true, attempt });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Force submit all active participant attempts
app.post("/api/v1/events/rounds/:roundId/force-submit-all", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { roundId } = req.params;

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: { questions: true }
    });

    if (!round) return res.status(404).json({ error: "Round not found" });

    const attempts = await prisma.roundAttempt.findMany({
      where: { roundId, status: "IN_PROGRESS" }
    });

    const marksPerCorrect = round.marksPerCorrect || 1;

    for (const attempt of attempts) {
      const finalAnswers = (attempt.answers as Record<string, string>) || {};
      let score = 0;
      let correctCount = 0;
      let wrongCount = 0;
      let unansweredCount = 0;

      round.questions.forEach((q: any) => {
        const selectedOption = finalAnswers[q.id];
        if (selectedOption && q.correctAnswer && selectedOption === q.correctAnswer) {
          correctCount++;
          score += marksPerCorrect;
        } else if (selectedOption) {
          wrongCount++;
        } else {
          unansweredCount++;
        }
      });

      await prisma.roundAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "FORCE_SUBMITTED",
          submittedAt: new Date(),
          score,
          correctCount,
          wrongCount,
          unansweredCount
        }
      });
    }

    io.to(`event_${round.eventId}`).emit("round_force_submitted", { roundId });

    res.json({ success: true, submittedCount: attempts.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: List participant attempts for a round
app.get("/api/v1/events/rounds/:roundId/admin/participant-attempts", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { roundId } = req.params;

    const attempts = await prisma.roundAttempt.findMany({
      where: { roundId },
      include: {
        user: {
          select: { id: true, name: true, email: true, usn: true, branch: true, year: true }
        }
      },
      orderBy: { score: "desc" }
    });

    res.json(attempts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Inspect detailed answers for a specific participant
app.get("/api/v1/events/rounds/:roundId/admin/participant-answers/:userId", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { roundId, userId } = req.params;

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: { questions: true }
    });

    if (!round) return res.status(404).json({ error: "Round not found" });

    const attempt = await prisma.roundAttempt.findUnique({
      where: { roundId_userId: { roundId, userId } },
      include: { user: true }
    });

    const userAnswers = (attempt?.answers as Record<string, string>) || {};
    const marksPerCorrect = round.marksPerCorrect || 1;

    const details = round.questions.map((q: any) => {
      const selectedOption = userAnswers[q.id] || null;
      let result: "CORRECT" | "WRONG" | "UNANSWERED" = "UNANSWERED";
      let marksAwarded = 0;

      if (selectedOption) {
        if (selectedOption === q.correctAnswer) {
          result = "CORRECT";
          marksAwarded = marksPerCorrect;
        } else {
          result = "WRONG";
          marksAwarded = 0;
        }
      }

      return {
        questionId: q.id,
        questionText: q.text,
        options: q.options,
        selectedAnswer: selectedOption,
        correctAnswer: q.correctAnswer,
        result,
        marksAwarded
      };
    });

    res.json({
      attempt,
      user: attempt?.user,
      details,
      round
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Toggle results released state
app.patch("/api/v1/events/rounds/:roundId/release-results", authenticateUser, async (req: any, res: any) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Access denied" });
    const { roundId } = req.params;
    const { resultsReleased } = req.body;

    const updatedRound = await prisma.round.update({
      where: { id: roundId },
      data: { resultsReleased: !!resultsReleased }
    });

    io.to(`event_${updatedRound.eventId}`).emit("results_released_update", {
      roundId,
      resultsReleased: updatedRound.resultsReleased
    });

    res.json(updatedRound);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Express 404 JSON Fallback Handler
app.use((req: any, res: any) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
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
const activeRoundTimers: Record<string, NodeJS.Timeout> = {};
const activeQuestionIndex: Record<string, number> = {};
const gameState: Record<string, "waiting" | "question" | "revealed" | "finished"> = {};
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
      const finalLeaderboard = await calculateLeaderboard(eventId);
      io.to(`event_${eventId}`).emit("quiz_finished", finalLeaderboard);
      gameState[eventId] = "finished";
      activeQuestionIndex[eventId] = -1; // reset
      autoplayMode[eventId] = false; // Turn off autoplay on finish
      sendAdminState(eventId);
    }
  }
};


async function calculateLeaderboard(eventId: string) {
  const participants = await prisma.eventParticipant.findMany({
    where: { eventId },
    include: {
      user: {
        include: {
          submissions: {
            where: { eventId }
          },
          roundAttempts: {
            where: { eventId }
          }
        }
      }
    }
  });

  return participants.map((p: any) => {
    const submissionPoints = p.user.submissions.reduce((sum: number, s: any) => sum + s.pointsAwarded, 0);
    const mcqPoints = (p.user.roundAttempts || []).reduce((sum: number, a: any) => sum + (a.score || 0), 0);
    const points = submissionPoints + mcqPoints;
    return {
      name: p.user.name,
      points
    };
  }).sort((a: any, b: any) => b.points - a.points);
}

const sendRoomCount = (eventId: string) => {
  const room = io.sockets.adapter.rooms.get(`event_${eventId}`);
  const count = room ? room.size : 0;
  io.to(`event_${eventId}_admin`).emit("room_count", count);
};

io.on("connection", (socket) => {
  socket.on("join_event", async (eventId) => {
    socket.join(`event_${eventId}`);
    sendRoomCount(eventId);

    try {
      const rounds = await prisma.round.findMany({
        where: { eventId },
        orderBy: { roundOrder: "asc" }
      });
      socket.emit("initial_round_state", {
        rounds,
        serverTime: new Date().toISOString()
      });
    } catch (e) { console.error(e); }
  });

  socket.on("join_admin", async (eventId) => {
    socket.join(`event_${eventId}`);
    socket.join(`event_${eventId}_admin`);
    sendRoomCount(eventId);
    sendAdminState(eventId);

    try {
      const rounds = await prisma.round.findMany({
        where: { eventId },
        orderBy: { roundOrder: "asc" }
      });
      socket.emit("initial_round_state", {
        rounds,
        serverTime: new Date().toISOString()
      });
    } catch (e) { console.error(e); }
  });

  socket.on("admin_update_round_status", async ({ eventId, roundId, status, durationSeconds }) => {
    try {
      await handleRoundStatusChange(eventId, roundId, status, durationSeconds);
    } catch (e) { console.error(e); }
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

    const index = questions.findIndex((q: any) => q.id === questionId);
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
    socket.rooms.forEach((room: string) => {
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
  console.log(`Server running on port ${PORT}`);
});
