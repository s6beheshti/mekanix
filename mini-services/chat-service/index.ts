import { Server as IOServer } from "socket.io";
import { PrismaClient } from "/home/z/my-project/node_modules/.prisma/client/index.js";
import { jwtVerify } from "/home/z/my-project/node_modules/jose/dist/webapi/index.js";

const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
const PORT = 3003;
const JWT_SECRET = process.env.JWT_SECRET || "mekanix-dev-secret-change-in-production";
const encoder = new TextEncoder();
const MAX_MSG = 5000;
const MAX_PER_MIN = 20;
const msgCounts = new Map<string, { count: number; resetAt: number }>();
const userConns = new Map<string, Set<string>>();

const io = new IOServer(PORT, {
  cors: { origin: process.env.NODE_ENV === "production" ? ["https://mekanix.ir"] : "*", methods: ["GET", "POST"] },
});

console.log(`🔒 Chat service on port ${PORT}`);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Auth required"));
    const { payload } = await jwtVerify(token as string, encoder.encode(JWT_SECRET));
    if (!payload.userId) return next(new Error("Invalid token"));
    const existing = userConns.get(payload.userId as string) || new Set();
    if (existing.size >= 3) return next(new Error("Too many connections"));
    socket.userId = payload.userId as string;
    socket.userRole = payload.role as string;
    socket.joinedRooms = new Set<string>();
    existing.add(socket.id);
    userConns.set(payload.userId as string, existing);
    next();
  } catch { next(new Error("Auth failed")); }
});

io.on("connection", (socket) => {
  console.log(`✓ ${socket.userId} connected`);

  socket.on("job:join", async (jobId: string) => {
    try {
      const job = await db.job.findUnique({ where: { id: jobId }, select: { id: true, request: { select: { customerId: true } }, technicianId: true } });
      if (!job) return socket.emit("error", { message: "Job not found" });
      let ok = false;
      if (socket.userRole === "ADMIN") ok = true;
      else if (socket.userRole === "CUSTOMER") { const c = await db.customer.findUnique({ where: { userId: socket.userId }, select: { id: true } }); ok = c?.id === job.request.customerId; }
      else if (socket.userRole === "TECHNICIAN") { const t = await db.technician.findUnique({ where: { userId: socket.userId }, select: { id: true } }); ok = t?.id === job.technicianId; }
      if (!ok) return socket.emit("error", { message: "Access denied" });
      socket.join(`job:${jobId}`);
      socket.joinedRooms?.add(`job:${jobId}`);
    } catch {}
  });

  socket.on("job:leave", (jobId: string) => { socket.leave(`job:${jobId}`); socket.joinedRooms?.delete(`job:${jobId}`); });

  socket.on("message:send", async (data: { jobId: string; body: string; kind?: string }) => {
    try {
      const key = `msg:${socket.userId}`;
      const now = Date.now();
      const e = msgCounts.get(key);
      if (!e || e.resetAt < now) msgCounts.set(key, { count: 1, resetAt: now + 60000 });
      else if (e.count >= MAX_PER_MIN) return socket.emit("error", { message: "Rate limit" });
      else e.count++;
      if (!data?.body || data.body.length > MAX_MSG) return;
      if (!socket.joinedRooms?.has(`job:${data.jobId}`)) return;
      const msg = await db.message.create({
        data: { jobId: data.jobId, fromUserId: socket.userId, body: data.body, kind: data.kind || "text" },
        include: { fromUser: { select: { id: true, name: true, avatar: true } } },
      });
      io.to(`job:${data.jobId}`).emit("message:new", msg);
    } catch {}
  });

  socket.on("typing:start", (jobId: string) => { if (socket.joinedRooms?.has(`job:${jobId}`)) socket.to(`job:${jobId}`).emit("typing:start", { userId: socket.userId }); });
  socket.on("typing:stop", (jobId: string) => { if (socket.joinedRooms?.has(`job:${jobId}`)) socket.to(`job:${jobId}`).emit("typing:stop", { userId: socket.userId }); });
  socket.on("job:status", (data: { jobId: string; status: string }) => { if (socket.joinedRooms?.has(`job:${data.jobId}`)) socket.to(`job:${data.jobId}`).emit("job:status", data); });

  socket.on("disconnect", () => {
    const conns = userConns.get(socket.userId);
    if (conns) { conns.delete(socket.id); if (conns.size === 0) userConns.delete(socket.userId); }
  });
});
