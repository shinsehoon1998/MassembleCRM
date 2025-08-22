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
    name: 'massemble.session',
    secret: process.env.SESSION_SECRET || 'massemble-crm-secret-key-dev',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset expiration on each request
    cookie: {
      httpOnly: true,
      secure: 'auto', // Let express decide based on X-Forwarded-Proto header
      sameSite: 'lax',
      maxAge: sessionTtl,
      domain: undefined, // Let browser decide
    },
  });
}

export async function setupAuth(app: Express) {
  // Trust proxy for proper header handling in deployment
  app.set("trust proxy", 1);
  
  // Add session middleware
  app.use(getSession());

  // Login endpoint
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "사용자명과 비밀번호를 입력해주세요." });
      }

      const user = await storage.getUserByUsername(username);
      console.log(`Login attempt for username: ${username}, user found: ${!!user}`);
      
      if (!user) {
        console.log(`User not found: ${username}`);
        return res.status(401).json({ message: "잘못된 사용자명 또는 비밀번호입니다." });
      }

      const isValidPassword = await bcrypt.compare(password, user.password || '');
      console.log(`Password validation for ${username}: ${isValidPassword}`);
      
      if (!isValidPassword) {
        console.log(`Invalid password for user: ${username}`);
        return res.status(401).json({ message: "잘못된 사용자명 또는 비밀번호입니다." });
      }

      // Store user in session
      console.log(`Setting session for user: ${user.id}`);
      (req.session as any).userId = user.id;
      (req.session as any).user = {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      };
      
      // Save session explicitly
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
        } else {
          console.log('Session saved successfully');
        }
      });

      res.json({ 
        message: "로그인 성공",
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "로그인 중 오류가 발생했습니다." });
    }
  });

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