// ATALK API 설정 - 중앙화된 설정 사용
import { getConfigStatus } from './atalkConfig';

// 애플리케이션 시작 시 ATALK 설정 상태 확인 (에러 발생 시에도 서버는 계속 실행)
try {
  const configStatus = getConfigStatus();
  if (configStatus.isConfigured) {
    console.log('✅ ATALK API 설정 확인됨:', {
      environment: configStatus.environment,
      protocol: configStatus.protocol,
      campaignName: configStatus.campaignName,
      source: configStatus.configSource
    });
  } else {
    console.warn('⚠️ ATALK API 설정 문제 감지:', configStatus.issues);
    console.warn('   ARS 기능이 제한될 수 있습니다. 필요 시 환경변수를 설정하세요.');
  }
} catch (error) {
  console.warn('⚠️ ATALK 설정 확인 중 오류:', error instanceof Error ? error.message : 'Unknown error');
  console.warn('   서버는 계속 실행되지만 ARS 기능이 제한될 수 있습니다.');
}

import express, { type Request, Response, NextFunction } from "express";
import multer from 'multer';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import bcrypt from 'bcryptjs';
import { storage } from "./storage";
import './appointmentReminderScheduler'; // 예약 리마인드 스케줄러 시작

const app = express();

// Admin 사용자 초기화 함수
async function initializeAdminUser() {
  try {
    console.log('Checking admin user...');
    const existingAdmin = await storage.getUserByUsername('admin');
    
    if (!existingAdmin) {
      console.log('Creating admin user...');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await storage.upsertUser({
        id: 'admin',
        username: 'admin',
        password: hashedPassword,
        name: '시스템 관리자',
        email: 'admin@massemble.com',
        role: 'admin',
        department: '관리부'
      });
      
      console.log('Admin user created successfully');
    } else {
      console.log('Admin user already exists');
      
      // 배포 환경에서 비밀번호가 맞지 않을 수 있으므로 강제로 업데이트
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await storage.upsertUser({
        ...existingAdmin,
        password: hashedPassword
      });
      console.log('Admin password updated');
    }
  } catch (error) {
    console.error('Error initializing admin user:', error);
  }
}

// CORS 설정
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://massemble-crm-shinsehoona.replit.app',
    /https:\/\/.*\.replit\.dev/,
    /https:\/\/.*\.replit\.app/
  ];
  
  // Origin 체크
  if (origin) {
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      } else {
        return allowed.test(origin);
      }
    });
    
    if (isAllowed) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
  }
  
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Cookie');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// multer 설정 (음원 파일 업로드용)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB 제한
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('지원하지 않는 파일 형식입니다. WAV 또는 MP3 파일만 업로드 가능합니다.'));
    }
  }
});

// multer를 app에 추가하여 routes에서 사용할 수 있도록 함
(app as any).upload = upload;

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize admin user on startup
  await initializeAdminUser();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
