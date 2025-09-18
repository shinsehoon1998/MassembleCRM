import bcrypt from 'bcryptjs';
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    name: 'connect.sid',
    secret: process.env.SESSION_SECRET || 'massemble-crm-secret-key-dev',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none', // 필요한 경우 크로스 사이트 요청 허용
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  // Trust proxy for proper header handling in deployment
  app.set("trust proxy", 1);
  
  // Add session middleware
  app.use(getSession());

  // Login endpoint removed - now handled in routes.ts

  // Logout endpoint
  app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "로그아웃 중 오류가 발생했습니다." });
      }
      res.clearCookie('connect.sid');
      res.json({ message: "로그아웃되었습니다." });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const session = req.session as any;
  
  if (!session.userId) {
    return res.status(401).json({ message: "인증이 필요합니다." });
  }

  try {
    const user = await storage.getUser(session.userId);
    if (!user) {
      return res.status(401).json({ message: "사용자를 찾을 수 없습니다." });
    }

    // Add user to request object
    (req as any).user = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ message: "인증 확인 중 오류가 발생했습니다." });
  }
};

/**
 * Admin-only access control middleware
 * Only allows users with 'admin' role to access protected endpoints
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ message: '인증이 필요합니다.' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
  }
  next();
};