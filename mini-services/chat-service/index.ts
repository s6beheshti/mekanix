// MEKANIX Secure Chat Service — Socket.IO with JWT authentication
// Port 3003
// Security: JWT verification, job participation check, rate limiting, message size limit

import { Server as IOServer } from "socket.io";
import { PrismaClient } from "/home/z/my-project/node_modules/.prisma/client/index.js";
import { jwtVerify } from "/home/z/my-project/node_modules/jose/index.js";

const db = new PrismaClient({
  datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } },
});

const PORT = 3003;
const JWT_SECRET = process.env.JWT_SECRET || "mekanix-dev-secret-change-in-production";
const encoder = new TextEncoder();
const MAX_MESSAGE_SIZE = 5000; // 5KB
const MAX_MESSAGES_PER_MIN = 20;
const MAX_CONNECTIONS_PER_USER = 3;

// Rate limiter
const messageCounts = new Map<string, { count: number; resetAt: number }>();

// Connection tracking
const userConnections = new Map<string, Set<string>>();

const io = new IOServer(PORT, {
  cors: {
    origin: process.env.NODE_ENV === "production" 
      ? ["https://mekanix.ir", "https://www.mekanix.ir"]
      : "*",
    methods: ["GET", "POST"],
  },
});

console.log(`🔒 Secure chat service on port ${PORT}`);

// Middleware: JWT authentication on connection
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }

    // Verify JWT
    const { payload } = await jwtVerify(token as string, encoder.encode(JWT_SECRET));
    const userId = payload.userId as string;
    const role = payload.role as string;

    if (!userId) {
      return next(new Error("Invalid token"));
    }

    // Check connection limit per user
    const existing = userConnections.get(userId) || new Set();
    if (existing.size >= MAX_CONNECTIONS_PER_USER) {
      return next(new Error("Too many connections"));
    }

    // Attach to socket
    socket.userId = userId;
    socket.userRole = role;
    socket.joinedRooms = new Set<string>();

    // Track connection
    existing.add(socket.id);
    userConnections.set(userId, existing);

    next();
  } catch (err) {
    next(new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  console.log(`✓ User ${socket.userId} connected (${socket.id})`);

  // Join a job room — verify participation
  socket.on("job:join", async (jobId: string) => {
    try {
      if (!jobId || typeof jobId !== "string") return;

      // Check if user is participant in this job
      const job = await db.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          request: { select: { customerId: true } },
          technicianId: true,
        },
      });

      if (!job) {
        socket.emit("error", { message: "Job not found" });
        return;
      }

      // Verify access
      let hasAccess = false;
      if (socket.userRole === "ADMIN") {
        hasAccess = true;
      } else if (socket.userRole === "CUSTOMER") {
        const customer = await db.customer.findUnique({
          where: { userId: socket.userId },
          select: { id: true },
        });
        hasAccess = customer?.id === job.request.customerId;
      } else if (socket.userRole === "TECHNICIAN") {
        const tech = await db.technician.findUnique({
          where: { userId: socket.userId },
          select: { id: true },
        });
        hasAccess = tech?.id === job.technicianId;
      }

      if (!hasAccess) {
        socket.emit("error", { message: "Access denied to this job" });
        return;
      }

      socket.join(`job:${jobId}`);
      socket.joinedRooms?.add(`job:${jobId}`);
      console.log(`✓ ${socket.userId} joined job:${jobId}`);
    } catch (err) {
      console.error("job:join error:", err);
    }
  });

  // Leave a job room
  socket.on("job:leave", (jobId: string) => {
    socket.leave(`job:${jobId}`);
    socket.joinedRooms?.delete(`job:${jobId}`);
  });

  // Send message — server-authoritative fromUserId
  socket.on("message:send", async (data: { jobId: string; body: string; kind?: string }) => {
    try {
      // Rate limit
      const key = `msg:${socket.userId}`;
      const now = Date.now();
      const entry = messageCounts.get(key);
      if (!entry || entry.resetAt < now) {
        messageCounts.set(key, { count: 1, resetAt: now + 60_000 });
      } else if (entry.count >= MAX_MESSAGES_PER_MIN) {
        socket.emit("error", { message: "Rate limit exceeded" });
        return;
      } else {
        entry.count++;
      }

      // Validate message
      if (!data?.body || typeof data.body !== "string" || data.body.length > MAX_MESSAGE_SIZE) {
        socket.emit("error", { message: "Invalid message" });
        return;
      }

      // Verify job participation
      const roomName = `job:${data.jobId}`;
      if (!socket.joinedRooms?.has(roomName)) {
        socket.emit("error", { message: "Not in this job room" });
        return;
      }

      // Save message with server-authoritative fromUserId
      const message = await db.message.create({
        data: {
          jobId: data.jobId,
          fromUserId: socket.userId, // SERVER-AUTHORITATIVE — not from client
          body: data.body,
          kind: data.kind || "text",
        },
        include: { fromUser: { select: { id: true, name: true, avatar: true } } },
      });

      // Broadcast to room
      io.to(roomName).emit("message:new", message);
    } catch (err) {
      console.error("message:send error:", err);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Typing indicators
  socket.on("typing:start", (jobId: string) => {
    if (!socket.joinedRooms?.has(`job:${jobId}`)) return;
    socket.to(`job:${jobId}`).emit("typing:start", { userId: socket.userId });
  });

  socket.on("typing:stop", (jobId: string) => {
    if (!socket.joinedRooms?.has(`job:${jobId}`)) return;
    socket.to(`job:${jobId}`).emit("typing:stop", { userId: socket.userId });
  });

  // Job status update — broadcast only (status change happens via REST API)
  socket.on("job:status", (data: { jobId: string; status: string }) => {
    if (!socket.joinedRooms?.has(`job:${data.jobId}`)) return;
    socket.to(`job:${data.jobId}`).emit("job:status", data);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log(`✗ User ${socket.userId} disconnected (${socket.id})`);
    // Clean up connection tracking
    const existing = userConnections.get(socket.userId);
    if (existing) {
      existing.delete(socket.id);
      if (existing.size === 0) {
        userConnections.delete(socket.userId);
      }
    }
  });
});

// Heartbeat — disconnect idle connections
setInterval(() => {
  for (const [userId, sockets] of userConnections.entries()) {
    for (const socketId of sockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) {
        sockets.delete(socketId);
      }
    }
    if (sockets.size === 0) {
      userConnections.delete(userId);
    }
  }
}, 30_000);
