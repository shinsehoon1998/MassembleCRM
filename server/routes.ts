import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from 'bcryptjs';
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./localAuth";
import { insertCustomerSchema, updateCustomerSchema, insertConsultationSchema, insertAttachmentSchema, arsScenarios, insertArsScenarioSchema, insertCustomerGroupSchema, insertCustomerGroupMappingSchema } from "@shared/schema";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import Papa from "papaparse";
import multer from "multer";
import { atalkArsService } from "./arsService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // 회원가입 API
  app.post('/api/register', async (req, res) => {
    try {
      const { username, password, name, email, role = 'counselor', department } = req.body;

      // 입력 검증
      if (!username || !password || !name || !email) {
        return res.status(400).json({ message: '모든 필수 필드를 입력해주세요.' });
      }

      // 사용자명 중복 확인
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: '이미 사용 중인 사용자명입니다.' });
      }

      // 이메일 중복 확인 (기존 사용자들 중에서)
      const users = await storage.getUsers();
      const emailExists = users.some(user => user.email === email);
      if (emailExists) {
        return res.status(400).json({ message: '이미 사용 중인 이메일입니다.' });
      }

      // 비밀번호 암호화
      const hashedPassword = await bcrypt.hash(password, 10);

      // 사용자 생성
      const newUser = await storage.upsertUser({
        id: `user-${Date.now()}`,
        username,
        password: hashedPassword,
        name,
        email,
        role: role === 'admin' ? 'counselor' : role, // 보안상 admin은 직접 생성 불가
        department: department || '상담부'
      });

      // 비밀번호 제거하고 응답
      const { password: _, ...userResponse } = newUser;
      
      res.status(201).json({
        message: '회원가입이 완료되었습니다.',
        user: userResponse
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: '회원가입 중 오류가 발생했습니다.' });
    }
  });

  // Dashboard routes
  app.get('/api/dashboard/stats', isAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard statistics" });
    }
  });

  app.get('/api/dashboard/recent-customers', isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const customers = await storage.getRecentCustomers(limit);
      res.json(customers);
    } catch (error) {
      console.error("Error fetching recent customers:", error);
      res.status(500).json({ message: "Failed to fetch recent customers" });
    }
  });

  // Customer routes
  app.get('/api/customers', isAuthenticated, async (req, res) => {
    try {
      const search = req.query.search as string;
      const status = req.query.status as string;
      const assignedUserId = req.query.assignedUserId as string;
      const unassigned = req.query.unassigned === 'true';
      const unshared = req.query.unshared === 'true';
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await storage.getCustomers({
        search,
        status: status && status !== 'all' ? status : undefined,
        assignedUserId: assignedUserId && assignedUserId !== 'all' ? assignedUserId : undefined,
        unassigned,
        unshared,
        page,
        limit,
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  // 고객 데이터 CSV 내보내기 API (반드시 /:id 라우트보다 먼저 정의)
  app.get('/api/customers/export', isAuthenticated, async (req: any, res) => {
    try {
      // 현재 검색 조건에 맞는 모든 고객 조회
      const searchParams = {
        search: req.query.search || '',
        status: req.query.status && req.query.status !== 'all' ? req.query.status : undefined,
        assignedUserId: req.query.assignedUserId && req.query.assignedUserId !== 'all' ? req.query.assignedUserId : undefined,
        unassigned: req.query.unassigned === 'true',
        unshared: req.query.unshared === 'true',
        page: 1,
        limit: 10000 // 모든 데이터 가져오기
      };

      console.log('Export search params:', searchParams);

      const customersData = await storage.getCustomers(searchParams);
      
      console.log('Found customers:', customersData.customers?.length || 0);
      
      if (!customersData.customers || customersData.customers.length === 0) {
        return res.status(404).json({ message: "내보낼 고객 데이터가 없습니다." });
      }

      // CSV 헤더 정의
      const csvHeaders = [
        '등록번호',
        '이름',
        '연락처',
        '보조연락처',
        '생년월일',
        '성별',
        '월소득',
        '상태',
        '담당자',
        '공유담당자',
        '등록일',
        '메모'
      ];

      // 고객 데이터를 CSV 형식으로 변환
      const csvRows = customersData.customers.map((customer, index) => [
        (index + 1).toString(), // 등록번호
        customer.name || '',
        customer.phone || '',
        customer.secondaryPhone || '',
        customer.birthDate || '',
        customer.gender === 'male' ? '남성' : customer.gender === 'female' ? '여성' : '',
        customer.monthlyIncome ? customer.monthlyIncome.toString() : '',
        customer.status || '',
        customer.assignedUser?.name || '',
        customer.sharedUser?.name || '',
        customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('ko-KR') : '',
        customer.memo || ''
      ]);

      // 헤더와 데이터 결합
      const csvData = [csvHeaders, ...csvRows];
      
      // CSV 형식으로 변환
      const csv = Papa.unparse(csvData, {
        encoding: 'utf8'
      });

      // UTF-8 BOM 추가 (Excel에서 한글 깨짐 방지)
      const csvWithBOM = '\uFEFF' + csv;

      // 현재 날짜를 파일명에 포함
      const today = new Date().toISOString().split('T')[0];
      const filename = `customers_${today}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvWithBOM);

    } catch (error) {
      console.error("Error exporting customers to CSV:", error);
      res.status(500).json({ message: "고객 데이터 내보내기에 실패했습니다." });
    }
  });

  app.get('/api/customers/:id', isAuthenticated, async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      console.error("Error fetching customer:", error);
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  app.post('/api/customers', isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(validatedData);

      // Log activity
      await storage.createActivityLog({
        userId: req.user.id,
        customerId: customer.id,
        action: "customer_created",
        description: `고객 "${customer.name}"을(를) 등록했습니다.`,
      });

      res.status(201).json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating customer:", error);
      res.status(500).json({ message: "Failed to create customer" });
    }
  });

  // Batch operations for customers (배치 엔드포인트를 개별 엔드포인트보다 먼저 정의)
  app.put('/api/customers/batch', isAuthenticated, async (req: any, res) => {
    try {
      const { customerIds, updates } = req.body;
      
      if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ message: "customerIds array is required" });
      }

      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ message: "updates object is required" });
      }

      const results = [];
      let updateCount = 0;
      
      for (const customerId of customerIds) {
        try {
          const customer = await storage.updateCustomer(customerId, updates);
          results.push(customer);
          updateCount++;
          
          // Log activity
          await storage.createActivityLog({
            userId: req.user.id,
            customerId: customer.id,
            action: "customer_batch_updated",
            description: `고객 "${customer.name}"을(를) 일괄 수정했습니다.`,
          });
        } catch (error) {
          console.error(`Error updating customer ${customerId}:`, error);
          // 개별 고객 업데이트 실패는 전체 작업을 중단하지 않음
          results.push({ id: customerId, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      console.log(`Batch update completed: ${updateCount}/${customerIds.length} customers updated`);
      res.json({ 
        updated: updateCount, 
        total: customerIds.length,
        customers: results 
      });
    } catch (error) {
      console.error("Error batch updating customers:", error);
      res.status(500).json({ message: "Failed to batch update customers" });
    }
  });

  app.put('/api/customers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = updateCustomerSchema.parse(req.body);
      const customer = await storage.updateCustomer(req.params.id, validatedData);

      // Log activity
      await storage.createActivityLog({
        userId: req.user.id,
        customerId: customer.id,
        action: "customer_updated",
        description: `고객 "${customer.name}"의 정보를 수정했습니다.`,
      });

      res.json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating customer:", error);
      res.status(500).json({ message: "Failed to update customer" });
    }
  });


  app.delete('/api/customers/batch', isAuthenticated, async (req: any, res) => {
    try {
      const { customerIds } = req.body;
      
      console.log('Batch delete request received:', { customerIds, count: customerIds?.length });
      
      if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
        console.log('Invalid customerIds provided');
        return res.status(400).json({ message: "customerIds array is required" });
      }

      let deletedCount = 0;
      let notFoundCount = 0;
      const results = [];
      
      for (const customerId of customerIds) {
        console.log(`Processing customer delete: ${customerId}`);
        try {
          const customer = await storage.getCustomer(customerId);
          console.log(`Customer lookup result for ${customerId}:`, customer ? 'found' : 'not found');
          
          if (customer) {
            const deleted = await storage.deleteCustomer(customerId);
            console.log(`Delete result for ${customerId}:`, deleted ? 'success' : 'failed');
            
            if (deleted) {
              deletedCount++;
              results.push({ id: customerId, status: 'deleted', name: customer.name });
              
              // Log activity
              await storage.createActivityLog({
                userId: req.user.id,
                action: "customer_batch_deleted",
                description: `고객 "${customer.name}"을(를) 일괄 삭제했습니다.`,
              });
            } else {
              results.push({ id: customerId, status: 'failed', error: 'Delete failed' });
            }
          } else {
            notFoundCount++;
            results.push({ id: customerId, status: 'not_found' });
            console.log(`Customer ${customerId} not found during batch delete`);
          }
        } catch (error) {
          console.error(`Error deleting customer ${customerId}:`, error);
          results.push({ id: customerId, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      console.log(`Batch delete completed: ${deletedCount} deleted, ${notFoundCount} not found, ${customerIds.length} total`);
      
      res.json({ 
        deleted: deletedCount, 
        notFound: notFoundCount,
        total: customerIds.length,
        results: results 
      });
    } catch (error) {
      console.error("Error batch deleting customers:", error);
      res.status(500).json({ message: "Failed to batch delete customers" });
    }
  });

  app.delete('/api/customers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const deleted = await storage.deleteCustomer(req.params.id);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete customer" });
      }

      // Log activity
      await storage.createActivityLog({
        userId: req.user.id,
        action: "customer_deleted",
        description: `고객 "${customer.name}"을(를) 삭제했습니다.`,
      });

      res.json({ message: "Customer deleted successfully" });
    } catch (error) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ message: "Failed to delete customer" });
    }
  });

  // 디버깅용: 고객 ID 확인 API
  app.post('/api/customers/check-ids', isAuthenticated, async (req: any, res) => {
    try {
      const { customerIds } = req.body;
      console.log('Checking customer IDs:', customerIds);
      
      if (!customerIds || !Array.isArray(customerIds)) {
        return res.status(400).json({ message: "customerIds array is required" });
      }

      const results = [];
      for (const customerId of customerIds) {
        try {
          const customer = await storage.getCustomer(customerId);
          results.push({
            id: customerId,
            exists: !!customer,
            name: customer?.name || null
          });
        } catch (error) {
          results.push({
            id: customerId,
            exists: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.json({ results });
    } catch (error) {
      console.error("Error checking customer IDs:", error);
      res.status(500).json({ message: "Failed to check customer IDs" });
    }
  });

  // Quick update customer status
  app.patch('/api/customers/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const { status } = req.body;
      const customer = await storage.updateCustomer(req.params.id, { status });

      // Log activity
      await storage.createActivityLog({
        userId: req.user.id,
        customerId: customer.id,
        action: "customer_status_updated",
        description: `고객 "${customer.name}"의 상태를 "${status}"로 변경했습니다.`,
      });

      res.json(customer);
    } catch (error) {
      console.error("Error updating customer status:", error);
      res.status(500).json({ message: "Failed to update customer status" });
    }
  });

  // Quick update customer memo
  app.patch('/api/customers/:id/memo', isAuthenticated, async (req: any, res) => {
    try {
      const { memo } = req.body;
      const customer = await storage.updateCustomer(req.params.id, { memo });

      // Log activity
      await storage.createActivityLog({
        userId: req.user.id,
        customerId: customer.id,
        action: "customer_memo_updated",
        description: `고객 "${customer.name}"의 메모를 수정했습니다.`,
      });

      res.json(customer);
    } catch (error) {
      console.error("Error updating customer memo:", error);
      res.status(500).json({ message: "Failed to update customer memo" });
    }
  });

  // Consultation routes
  app.get('/api/customers/:id/consultations', isAuthenticated, async (req, res) => {
    try {
      const consultations = await storage.getConsultations(req.params.id);
      res.json(consultations);
    } catch (error) {
      console.error("Error fetching consultations:", error);
      res.status(500).json({ message: "Failed to fetch consultations" });
    }
  });

  app.post('/api/customers/:id/consultations', isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = insertConsultationSchema.parse({
        ...req.body,
        customerId: req.params.id,
        userId: req.user.id,
      });

      const consultation = await storage.createConsultation(validatedData);

      // Log activity
      await storage.createActivityLog({
        userId: req.user.id,
        customerId: req.params.id,
        action: "consultation_created",
        description: `상담 "${consultation.title}"을(를) 등록했습니다.`,
      });

      res.status(201).json(consultation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating consultation:", error);
      res.status(500).json({ message: "Failed to create consultation" });
    }
  });

  // File upload endpoint for getting presigned URL
  app.post('/api/objects/upload', isAuthenticated, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ message: "Failed to get upload URL" });
    }
  });

  // File download endpoint
  app.get('/objects/:objectPath(*)', isAuthenticated, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Attachment routes
  app.get('/api/customers/:id/attachments', isAuthenticated, async (req, res) => {
    try {
      const attachments = await storage.getAttachments(req.params.id);
      res.json(attachments);
    } catch (error) {
      console.error("Error fetching attachments:", error);
      res.status(500).json({ message: "Failed to fetch attachments" });
    }
  });

  app.post('/api/customers/:id/attachments', isAuthenticated, async (req: any, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      let filePath = req.body.filePath;
      
      // If it's a full URL, normalize it
      if (filePath && filePath.includes('storage.googleapis.com')) {
        filePath = objectStorageService.normalizeObjectEntityPath(filePath);
      }

      const validatedData = insertAttachmentSchema.parse({
        ...req.body,
        customerId: req.params.id,
        uploadedBy: req.user.id,
        filePath: filePath,
      });

      const attachment = await storage.createAttachment(validatedData);

      // Log activity
      await storage.createActivityLog({
        userId: req.user.id,
        customerId: req.params.id,
        action: "file_uploaded",
        description: `파일 "${attachment.originalName}"을(를) 첨부했습니다.`,
      });

      res.status(201).json(attachment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating attachment:", error);
      res.status(500).json({ message: "Failed to create attachment" });
    }
  });

  app.delete('/api/attachments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const deleted = await storage.deleteAttachment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Attachment not found" });
      }

      // Log activity
      await storage.createActivityLog({
        userId: req.user.id,
        action: "file_deleted",
        description: "파일을 삭제했습니다.",
      });

      res.json({ message: "Attachment deleted successfully" });
    } catch (error) {
      console.error("Error deleting attachment:", error);
      res.status(500).json({ message: "Failed to delete attachment" });
    }
  });

  // Activity log routes
  app.get('/api/customers/:id/activity-logs', isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const activityLogs = await storage.getActivityLogs(req.params.id, limit);
      res.json(activityLogs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  app.get('/api/activity-logs', isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const activityLogs = await storage.getActivityLogs(undefined, limit);
      res.json(activityLogs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  // User management routes (admin only)
  app.get('/api/users', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user.id);
      if (!currentUser || !['admin', 'manager'].includes(currentUser.role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get('/api/users/counselors', isAuthenticated, async (req, res) => {
    try {
      const counselors = await storage.getCounselors();
      res.json(counselors);
    } catch (error) {
      console.error("Error fetching counselors:", error);
      res.status(500).json({ message: "Failed to fetch counselors" });
    }
  });

  // Create new user - Admin only
  app.post('/api/users', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user.id);
      if (!currentUser || currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Validate required fields
      const { username, password, role = 'counselor', department, name } = req.body;
      if (!username) {
        return res.status(400).json({ message: "Username is required" });
      }

      const newUser = await storage.upsertUser({
        username,
        password,
        name: name || username, // Use username as name if name not provided
        email: req.body.email,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        department,
        role
      });
      
      res.status(201).json(newUser);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.put('/api/users/:id', isAuthenticated, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.user.id);
      if (!currentUser || currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { username, password, name, firstName, lastName, department, role, isActive } = req.body;
      
      const updateData: any = {
        username,
        name: name || username, // Use username as name if name not provided
        firstName,
        lastName,
        department,
        role,
        isActive
      };
      
      // Only include password if it's provided (for updates, password is optional)
      if (password && password.trim()) {
        updateData.password = password;
      }

      const updatedUser = await storage.updateUser(req.params.id, updateData);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Activity log routes
  app.get('/api/activity-logs', isAuthenticated, async (req, res) => {
    try {
      const customerId = req.query.customerId as string;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const logs = await storage.getActivityLogs(customerId, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  // 기존 사용자 조회 (임시 디버깅용)
  app.get('/api/emergency/list-users', async (req, res) => {
    try {
      const secretKey = req.query.secret || req.headers['x-admin-secret'];
      if (secretKey !== 'massemble-emergency-2024') {
        return res.status(403).json({ message: '접근이 거부되었습니다.' });
      }

      const users = await storage.getUsers();
      res.json({
        totalUsers: users.length,
        users: users.map(u => ({
          id: u.id,
          username: u.username,
          email: u.email,
          name: u.name,
          role: u.role
        }))
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 기존 사용자를 admin으로 승격
  app.post('/api/emergency/promote-to-admin', async (req, res) => {
    try {
      const secretKey = req.query.secret || req.headers['x-admin-secret'];
      if (secretKey !== 'massemble-emergency-2024') {
        return res.status(403).json({ message: '접근이 거부되었습니다.' });
      }

      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: 'userId가 필요합니다.' });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
      }

      // 사용자를 admin으로 승격하고 비밀번호 설정
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const updatedUser = await storage.upsertUser({
        ...user,
        username: 'admin', // username을 admin으로 변경
        password: hashedPassword,
        role: 'admin'
      });

      res.json({
        message: `사용자 ${user.name}를 admin으로 승격했습니다. (admin/admin123)`,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          name: updatedUser.name,
          role: updatedUser.role
        }
      });
    } catch (error) {
      console.error('User promotion error:', error);
      res.status(500).json({ 
        error: (error as Error).message,
        message: '사용자 승격 중 오류가 발생했습니다.'
      });
    }
  });

  // 임시 관리자 생성 엔드포인트 (배포 환경용)
  app.post('/api/emergency/create-admin', async (req, res) => {
    try {
      // 간단한 보안 키 체크 (URL 파라미터나 헤더로)
      const secretKey = req.query.secret || req.headers['x-admin-secret'];
      if (secretKey !== 'massemble-emergency-2024') {
        return res.status(403).json({ message: '접근이 거부되었습니다.' });
      }

      console.log('Emergency admin creation requested...');
      
      // 기존 admin 사용자 체크
      const existingAdmin = await storage.getUserByUsername('admin');
      if (existingAdmin) {
        // 기존 admin이 있으면 비밀번호만 업데이트
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await storage.upsertUser({
          ...existingAdmin,
          password: hashedPassword
        });
        
        console.log('Admin password reset successfully');
        return res.json({ 
          message: 'Admin 계정 비밀번호가 admin123으로 재설정되었습니다.',
          action: 'password_reset'
        });
      } else {
        // 완전히 새로운 계정 생성 (고유한 정보 사용)
        const timestamp = Date.now();
        const hashedPassword = await bcrypt.hash('admin123', 10);
        const newAdmin = await storage.upsertUser({
          id: `admin-${timestamp}`,
          username: 'admin',
          password: hashedPassword,
          name: '시스템 관리자',
          email: `system-admin-${timestamp}@massemble.internal`,
          role: 'admin',
          department: '관리부'
        });
        
        console.log('New admin created successfully');
        return res.json({ 
          message: 'Admin 계정이 생성되었습니다. (admin/admin123)',
          action: 'created',
          adminId: newAdmin.id
        });
      }
    } catch (error) {
      console.error('Emergency admin creation error:', error);
      res.status(500).json({ 
        error: (error as Error).message,
        message: '관리자 계정 생성 중 오류가 발생했습니다.'
      });
    }
  });

  // 디버깅용: admin 계정 상태 확인
  app.get('/api/debug/admin-status', async (req, res) => {
    try {
      const adminUser = await storage.getUserByUsername('admin');
      
      res.json({
        adminExists: !!adminUser,
        adminUser: adminUser ? { 
          id: adminUser.id, 
          username: adminUser.username, 
          name: adminUser.name,
          passwordLength: adminUser.password?.length || 0
        } : null,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        emergencyEndpoint: '/api/emergency/create-admin?secret=massemble-emergency-2024'
      });
    } catch (error) {
      console.error('Debug API error:', error);
      res.status(500).json({ 
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // System settings routes
  app.get('/api/system-settings', isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getSystemSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching system settings:", error);
      res.status(500).json({ message: "Failed to fetch system settings" });
    }
  });

  app.put('/api/system-settings/:key', isAuthenticated, async (req: any, res) => {
    try {
      const { value } = req.body;
      const setting = await storage.updateSystemSetting(req.params.key, value);
      res.json(setting);
    } catch (error) {
      console.error("Error updating system setting:", error);
      res.status(500).json({ message: "Failed to update system setting" });
    }
  });

  app.post('/api/system-settings', isAuthenticated, async (req: any, res) => {
    try {
      const { key, category, label, description, value } = req.body;
      const setting = await storage.createSystemSetting({ key, category, label, description, value });
      res.json(setting);
    } catch (error) {
      console.error("Error creating system setting:", error);
      res.status(500).json({ message: "Failed to create system setting" });
    }
  });

  app.delete('/api/system-settings/:key', isAuthenticated, async (req: any, res) => {
    try {
      const deleted = await storage.deleteSystemSetting(req.params.key);
      if (!deleted) {
        return res.status(404).json({ message: "Setting not found" });
      }
      res.json({ message: "Setting deleted successfully" });
    } catch (error) {
      console.error("Error deleting system setting:", error);
      res.status(500).json({ message: "Failed to delete system setting" });
    }
  });

  // CSV 템플릿 다운로드 API
  app.get('/api/data-import/template', isAuthenticated, async (req: any, res) => {
    try {
      // CSV 템플릿 헤더 정의
      const csvHeaders = [
        '이름',
        '연락처',
        '보조연락처',
        '생년월일',
        '성별',
        '월소득',
        '상태',
        '메모'
      ];

      // 샘플 데이터 (1줄)
      const sampleData = [
        '홍길동',
        '010-1234-5678',
        '02-123-4567',
        '1990-01-01',
        '남성',
        '3000000',
        '상담접수',
        '샘플 고객 데이터입니다.'
      ];

      // CSV 형식으로 변환
      const csvData = [csvHeaders, sampleData];
      const csv = Papa.unparse(csvData, {
        encoding: 'utf8'
      });

      // UTF-8 BOM 추가 (Excel에서 한글 깨짐 방지)
      const csvWithBOM = '\uFEFF' + csv;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="customer_template.csv"');
      res.send(csvWithBOM);
    } catch (error) {
      console.error("Error generating CSV template:", error);
      res.status(500).json({ message: "Failed to generate CSV template" });
    }
  });

  // CSV 파일 업로드용 multer 설정
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('CSV 파일만 업로드 가능합니다.'), false);
      }
    },
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB 제한
    }
  });


  // CSV 대량 업로드 API
  app.post('/api/data-import/upload', isAuthenticated, upload.single('csvFile'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "CSV 파일이 필요합니다." });
      }

      // CSV 파일 파싱
      const csvData = req.file.buffer.toString('utf8');
      const parsed = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        encoding: 'utf8'
      });

      if (parsed.errors.length > 0) {
        return res.status(400).json({ 
          message: "CSV 파싱 오류가 발생했습니다.",
          errors: parsed.errors
        });
      }

      const results = {
        total: 0,
        success: 0,
        failed: 0,
        errors: [] as any[]
      };

      // 각 행을 고객 데이터로 변환하여 저장
      for (let i = 0; i < parsed.data.length; i++) {
        const row: any = parsed.data[i];
        results.total++;

        try {
          // 필수 필드 검증
          if (!row['이름'] || !row['연락처']) {
            results.failed++;
            results.errors.push({
              row: i + 1,
              error: '이름과 연락처는 필수입니다.'
            });
            continue;
          }

          // 성별 변환
          let gender = row['성별'];
          if (gender === '남성' || gender === '남' || gender === 'M' || gender === 'male') {
            gender = 'male';
          } else if (gender === '여성' || gender === '여' || gender === 'F' || gender === 'female') {
            gender = 'female';
          } else {
            gender = null;
          }

          // 상태 변환
          let status = row['상태'];
          const validStatuses = ['상담접수', '상담진행', '상담완료', '수임', '불발', '보류'];
          if (!validStatuses.includes(status)) {
            status = '상담접수'; // 기본값
          }

          // 고객 데이터 생성
          const customerData = {
            name: row['이름'].trim(),
            phone: row['연락처'].trim(),
            secondaryPhone: row['보조연락처'] || null,
            birthDate: row['생년월일'] || null,
            gender: gender,
            monthlyIncome: row['월소득'] ? parseInt(row['월소득'].toString().replace(/[^0-9]/g, '')) : null,
            status: status,
            memo: row['메모'] || null
          };

          // 고객 생성
          const customer = await storage.createCustomer(customerData);

          // 활동 로그 생성
          await storage.createActivityLog({
            userId: req.user.id,
            customerId: customer.id,
            action: "customer_csv_imported",
            description: `CSV 대량 업로드로 고객 "${customer.name}"을(를) 등록했습니다.`,
          });

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: i + 1,
            error: error instanceof Error ? error.message : '알 수 없는 오류'
          });
        }
      }

      res.json({
        message: `CSV 업로드 완료: ${results.success}명 성공, ${results.failed}명 실패`,
        results: results
      });

    } catch (error) {
      console.error("Error processing CSV upload:", error);
      res.status(500).json({ message: "CSV 업로드 처리 중 오류가 발생했습니다." });
    }
  });

  // ============================================
  // ARS API 엔드포인트
  // ============================================

  // 개별 고객 ARS 발송
  app.post('/api/ars/send-single', isAuthenticated, async (req: any, res) => {
    try {
      const { customerId, sendNumber, scenarioId = 'marketing_consent' } = req.body;

      if (!customerId || !sendNumber) {
        return res.status(400).json({ message: '고객 ID와 발신번호는 필수입니다.' });
      }

      const result = await atalkArsService.sendSingleArs(customerId, sendNumber, scenarioId);

      if (result.success) {
        // 활동 로그 기록
        await storage.createActivityLog({
          userId: req.user.id,
          customerId,
          action: "ars_sent",
          description: `ARS 발송 완료 (발신번호: ${sendNumber})`,
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Error sending ARS:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'ARS 발송 중 오류가 발생했습니다.' 
      });
    }
  });

  // 대량 ARS 발송 (캠페인)
  app.post('/api/ars/send-bulk', isAuthenticated, async (req: any, res) => {
    try {
      const { customerIds, groupId, sendNumber = '1660-2426', campaignName, scenarioId = 'marketing_consent' } = req.body;

      if (!campaignName) {
        return res.status(400).json({ message: '캠페인명은 필수입니다.' });
      }

      let targetCustomerIds = customerIds;

      // 그룹 ID가 제공된 경우 해당 그룹의 고객들을 가져옴
      if (groupId) {
        const groupCustomers = await storage.getCustomersInGroup(groupId);
        if (!groupCustomers || groupCustomers.length === 0) {
          return res.status(400).json({ message: '선택된 그룹에 고객이 없습니다.' });
        }
        targetCustomerIds = groupCustomers.map(customer => customer.id);
      }

      if (!targetCustomerIds || !Array.isArray(targetCustomerIds) || targetCustomerIds.length === 0) {
        return res.status(400).json({ message: '발송 대상 고객을 선택해주세요.' });
      }

      const result = await atalkArsService.sendBulkArs(
        targetCustomerIds,
        sendNumber,
        campaignName,
        scenarioId
      );

      // 활동 로그 기록
      const logDescription = groupId 
        ? `ARS 캠페인 "${campaignName}" 생성 - 그룹 대상: ${targetCustomerIds.length}명`
        : `ARS 캠페인 "${campaignName}" 생성 - 전체 대상: ${targetCustomerIds.length}명`;

      await storage.createActivityLog({
        userId: req.user.id,
        customerId: null,
        action: "ars_campaign_created",
        description: logDescription,
      });

      res.json({
        success: true,
        message: `${targetCustomerIds.length}명에게 ARS 발송을 시작했습니다.`,
        campaignId: result.campaignId,
        successCount: result.historyKeys.length,
        failedCount: result.failedCount,
      });
    } catch (error) {
      console.error("Error sending bulk ARS:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : '대량 ARS 발송 중 오류가 발생했습니다.' 
      });
    }
  });

  // 마케팅 동의 대상 고객 조회
  app.get('/api/ars/marketing-targets', isAuthenticated, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const targets = await atalkArsService.getMarketingTargetCustomers(limit);
      
      res.json({
        targets,
        count: targets.length,
      });
    } catch (error) {
      console.error("Error getting marketing targets:", error);
      res.status(500).json({ message: "마케팅 대상 조회 중 오류가 발생했습니다." });
    }
  });

  // ARS 발송 이력 조회
  app.get('/api/ars/history/:historyKey', isAuthenticated, async (req: any, res) => {
    try {
      const { historyKey } = req.params;
      const history = await atalkArsService.getCallHistory(historyKey);
      res.json(history);
    } catch (error) {
      console.error("Error getting call history:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "ARS 이력 조회 중 오류가 발생했습니다." 
      });
    }
  });

  // ARS 발송 결과 업데이트 (배치 작업)
  app.post('/api/ars/update-results', isAuthenticated, async (req: any, res) => {
    try {
      await atalkArsService.updateCallResults();
      
      // 활동 로그 기록
      await storage.createActivityLog({
        userId: req.user.id,
        customerId: null,
        action: "ars_results_updated",
        description: "ARS 발송 결과를 업데이트했습니다.",
      });

      res.json({ 
        success: true, 
        message: 'ARS 발송 결과가 업데이트되었습니다.' 
      });
    } catch (error) {
      console.error("Error updating call results:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "ARS 결과 업데이트 중 오류가 발생했습니다." 
      });
    }
  });

  // ARS 캠페인 통계 조회
  app.get('/api/ars/campaigns', isAuthenticated, async (req: any, res) => {
    try {
      const campaigns = await storage.getArsCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error("Error getting ARS campaigns:", error);
      res.status(500).json({ message: "ARS 캠페인 조회 중 오류가 발생했습니다." });
    }
  });

  // ARS 발송 로그 조회
  app.get('/api/ars/logs', isAuthenticated, async (req: any, res) => {
    try {
      const { campaignId, customerId, status, page = 1, limit = 50 } = req.query;
      const logs = await storage.getArsSendLogs({
        campaignId: campaignId ? parseInt(campaignId as string) : undefined,
        customerId: customerId as string,
        status: status as string,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
      });
      res.json(logs);
    } catch (error) {
      console.error("Error getting ARS logs:", error);
      res.status(500).json({ message: "ARS 로그 조회 중 오류가 발생했습니다." });
    }
  });

  // ARS 캠페인 상세 정보 조회
  app.get('/api/ars/campaigns/:campaignId/detail', isAuthenticated, async (req: any, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: '유효하지 않은 캠페인 ID입니다.' });
      }

      const campaign = await storage.getArsCampaignById(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: '캠페인을 찾을 수 없습니다.' });
      }

      // 실시간 진행 상황 계산
      const completedCount = (campaign.successCount || 0) + (campaign.failedCount || 0);
      const pendingCount = (campaign.totalCount || 0) - completedCount;

      res.json({
        ...campaign,
        completedCount,
        pendingCount,
      });
    } catch (error) {
      console.error("Error getting campaign detail:", error);
      res.status(500).json({ message: "캠페인 상세 정보 조회 중 오류가 발생했습니다." });
    }
  });

  // ARS 캠페인 발송 기록 조회
  app.get('/api/ars/campaigns/:campaignId/history', isAuthenticated, async (req: any, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: '유효하지 않은 캠페인 ID입니다.' });
      }

      const logs = await storage.getArsSendLogs({
        campaignId,
        page: 1,
        limit: 1000, // 모든 기록 가져오기
      });

      // 고객 정보를 포함한 발송 기록 조합
      const historyWithCustomers = await Promise.all(
        logs.logs.map(async (log) => {
          const customer = await storage.getCustomer(log.customerId);
          return {
            ...log,
            customerName: customer?.name || '알 수 없음',
            phone: customer?.phone || log.phone,
            result: log.status === 'sent' ? '발송 완료' : 
                   log.status === 'failed' ? '발송 실패' : 
                   log.status === 'completed' ? '통화 완료' : '처리 중',
          };
        })
      );

      res.json(historyWithCustomers);
    } catch (error) {
      console.error("Error getting campaign history:", error);
      res.status(500).json({ message: "캠페인 발송 기록 조회 중 오류가 발생했습니다." });
    }
  });

  // ARS 캠페인 종료
  app.post('/api/ars/campaigns/:campaignId/stop', isAuthenticated, async (req: any, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: '유효하지 않은 캠페인 ID입니다.' });
      }

      const result = await atalkArsService.stopCampaign(campaignId);

      if (result.success) {
        // 활동 로그 기록
        await storage.createActivityLog({
          userId: req.user.id,
          customerId: null,
          action: "ars_campaign_stopped",
          description: `ARS 캠페인 종료 - ${result.message}`,
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Error stopping campaign:", error);
      res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : "캠페인 종료 중 오류가 발생했습니다." 
      });
    }
  });

  // ARS 시나리오 관련 API
  
  // 시나리오 목록 조회
  app.get('/api/ars/scenarios', isAuthenticated, async (req, res) => {
    try {
      const scenarios = await storage.getArsScenarios();
      res.json(scenarios);
    } catch (error) {
      console.error('Failed to get scenarios:', error);
      res.status(500).json({ message: 'Failed to get scenarios' });
    }
  });

  // 시나리오 생성
  app.post('/api/ars/scenarios', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertArsScenarioSchema.parse(req.body);
      validatedData.createdBy = req.user?.username || 'unknown';
      
      const scenario = await storage.createArsScenario(validatedData);
      res.json(scenario);
    } catch (error) {
      console.error('Failed to create scenario:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to create scenario' });
    }
  });

  // 시나리오 수정
  app.put('/api/ars/scenarios/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertArsScenarioSchema.partial().parse(req.body);
      
      const scenario = await storage.updateArsScenario(id, validatedData);
      if (!scenario) {
        return res.status(404).json({ message: 'Scenario not found' });
      }
      
      res.json(scenario);
    } catch (error) {
      console.error('Failed to update scenario:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to update scenario' });
    }
  });

  // 시나리오 삭제 (비활성화)
  app.delete('/api/ars/scenarios/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      
      const scenario = await storage.updateArsScenario(id, { isActive: false });
      if (!scenario) {
        return res.status(404).json({ message: 'Scenario not found' });
      }
      
      res.json({ message: 'Scenario deleted successfully' });
    } catch (error) {
      console.error('Failed to delete scenario:', error);
      res.status(500).json({ message: 'Failed to delete scenario' });
    }
  });

  // ============================================
  // 고객 그룹 관리 API
  // ============================================

  // 고객 그룹 목록 조회
  app.get('/api/customer-groups', isAuthenticated, async (req, res) => {
    try {
      const groups = await storage.getCustomerGroups();
      res.json(groups);
    } catch (error) {
      console.error('Failed to get customer groups:', error);
      res.status(500).json({ message: '고객 그룹 조회 중 오류가 발생했습니다.' });
    }
  });

  // 고객 그룹 생성
  app.post('/api/customer-groups', isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = insertCustomerGroupSchema.parse(req.body);
      validatedData.createdBy = req.user?.id || 'unknown';
      
      const group = await storage.createCustomerGroup(validatedData);
      
      // 활동 로그 기록
      await storage.createActivityLog({
        userId: req.user.id,
        customerId: null,
        action: "customer_group_created",
        description: `고객 그룹 "${group.name}" 생성`,
      });
      
      res.json(group);
    } catch (error) {
      console.error('Failed to create customer group:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: '입력 데이터가 올바르지 않습니다.', errors: error.errors });
      }
      res.status(500).json({ message: '고객 그룹 생성 중 오류가 발생했습니다.' });
    }
  });

  // 고객 그룹 수정
  app.put('/api/customer-groups/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertCustomerGroupSchema.partial().parse(req.body);
      
      const group = await storage.updateCustomerGroup(id, validatedData);
      if (!group) {
        return res.status(404).json({ message: '그룹을 찾을 수 없습니다.' });
      }
      
      // 활동 로그 기록
      await storage.createActivityLog({
        userId: req.user.id,
        customerId: null,
        action: "customer_group_updated",
        description: `고객 그룹 "${group.name}" 수정`,
      });
      
      res.json(group);
    } catch (error) {
      console.error('Failed to update customer group:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: '입력 데이터가 올바르지 않습니다.', errors: error.errors });
      }
      res.status(500).json({ message: '고객 그룹 수정 중 오류가 발생했습니다.' });
    }
  });

  // 고객 그룹 삭제
  app.delete('/api/customer-groups/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const success = await storage.deleteCustomerGroup(id);
      if (!success) {
        return res.status(404).json({ message: '그룹을 찾을 수 없습니다.' });
      }
      
      // 활동 로그 기록
      await storage.createActivityLog({
        userId: req.user.id,
        customerId: null,
        action: "customer_group_deleted",
        description: `고객 그룹 삭제`,
      });
      
      res.json({ message: '고객 그룹이 삭제되었습니다.' });
    } catch (error) {
      console.error('Failed to delete customer group:', error);
      res.status(500).json({ message: '고객 그룹 삭제 중 오류가 발생했습니다.' });
    }
  });

  // 그룹에 고객 추가
  app.post('/api/customer-groups/:groupId/customers', isAuthenticated, async (req: any, res) => {
    try {
      const { groupId } = req.params;
      const { customerIds } = req.body;

      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ message: '고객을 선택해주세요.' });
      }

      const results = [];
      for (const customerId of customerIds) {
        try {
          const mapping = await storage.addCustomerToGroup(customerId, groupId, req.user.id);
          results.push({ customerId, success: true, mapping });
        } catch (error) {
          console.error(`Failed to add customer ${customerId} to group:`, error);
          results.push({ customerId, success: false, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      // 활동 로그 기록
      await storage.createActivityLog({
        userId: req.user.id,
        customerId: null,
        action: "customers_added_to_group",
        description: `고객 ${successCount}명을 그룹에 추가`,
      });

      res.json({
        message: `${successCount}명의 고객이 그룹에 추가되었습니다.`,
        results,
      });
    } catch (error) {
      console.error('Failed to add customers to group:', error);
      res.status(500).json({ message: '고객 그룹 추가 중 오류가 발생했습니다.' });
    }
  });

  // 그룹에서 고객 제거
  app.delete('/api/customer-groups/:groupId/customers/:customerId', isAuthenticated, async (req: any, res) => {
    try {
      const { groupId, customerId } = req.params;
      
      const success = await storage.removeCustomerFromGroup(customerId, groupId);
      if (!success) {
        return res.status(404).json({ message: '그룹에서 고객을 찾을 수 없습니다.' });
      }
      
      // 활동 로그 기록
      await storage.createActivityLog({
        userId: req.user.id,
        customerId,
        action: "customer_removed_from_group",
        description: `고객을 그룹에서 제거`,
      });
      
      res.json({ message: '고객이 그룹에서 제거되었습니다.' });
    } catch (error) {
      console.error('Failed to remove customer from group:', error);
      res.status(500).json({ message: '고객 그룹 제거 중 오류가 발생했습니다.' });
    }
  });

  // 그룹 내 고객 목록 조회
  app.get('/api/customer-groups/:groupId/customers', isAuthenticated, async (req, res) => {
    try {
      const { groupId } = req.params;
      const customers = await storage.getCustomersInGroup(groupId);
      res.json(customers);
    } catch (error) {
      console.error('Failed to get customers in group:', error);
      res.status(500).json({ message: '그룹 내 고객 조회 중 오류가 발생했습니다.' });
    }
  });

  // 특정 고객의 그룹 목록 조회
  app.get('/api/customers/:customerId/groups', isAuthenticated, async (req, res) => {
    try {
      const { customerId } = req.params;
      const groups = await storage.getCustomerGroupsByCustomerId(customerId);
      res.json(groups);
    } catch (error) {
      console.error('Failed to get customer groups:', error);
      res.status(500).json({ message: '고객 그룹 조회 중 오류가 발생했습니다.' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
