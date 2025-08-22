import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertCustomerSchema, updateCustomerSchema, insertConsultationSchema, insertAttachmentSchema } from "@shared/schema";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
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
        userId: req.user.claims.sub,
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

  app.put('/api/customers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = updateCustomerSchema.parse(req.body);
      const customer = await storage.updateCustomer(req.params.id, validatedData);

      // Log activity
      await storage.createActivityLog({
        userId: req.user.claims.sub,
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
        userId: req.user.claims.sub,
        action: "customer_deleted",
        description: `고객 "${customer.name}"을(를) 삭제했습니다.`,
      });

      res.json({ message: "Customer deleted successfully" });
    } catch (error) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ message: "Failed to delete customer" });
    }
  });

  // Batch operations for customers
  app.put('/api/customers/batch', isAuthenticated, async (req: any, res) => {
    try {
      const { customerIds, updates } = req.body;
      
      if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ message: "customerIds array is required" });
      }

      const results = [];
      
      for (const customerId of customerIds) {
        try {
          const customer = await storage.updateCustomer(customerId, updates);
          if (customer) {
            results.push(customer);
            
            // Log activity
            await storage.createActivityLog({
              userId: req.user.claims.sub,
              customerId: customer.id,
              action: "customer_batch_updated",
              description: `고객 "${customer.name}"을(를) 일괄 수정했습니다.`,
            });
          }
        } catch (error) {
          console.error(`Error updating customer ${customerId}:`, error);
        }
      }

      res.json({ updated: results.length, customers: results });
    } catch (error) {
      console.error("Error batch updating customers:", error);
      res.status(500).json({ message: "Failed to batch update customers" });
    }
  });

  app.delete('/api/customers/batch', isAuthenticated, async (req: any, res) => {
    try {
      const { customerIds } = req.body;
      
      if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ message: "customerIds array is required" });
      }

      let deletedCount = 0;
      let notFoundCount = 0;
      const results = [];
      
      for (const customerId of customerIds) {
        try {
          const customer = await storage.getCustomer(customerId);
          if (customer) {
            const deleted = await storage.deleteCustomer(customerId);
            if (deleted) {
              deletedCount++;
              results.push({ id: customerId, status: 'deleted', name: customer.name });
              
              // Log activity
              await storage.createActivityLog({
                userId: req.user.claims.sub,
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

  // Quick update customer status
  app.patch('/api/customers/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const { status } = req.body;
      const customer = await storage.updateCustomer(req.params.id, { status });

      // Log activity
      await storage.createActivityLog({
        userId: req.user.claims.sub,
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
        userId: req.user.claims.sub,
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
        userId: req.user.claims.sub,
      });

      const consultation = await storage.createConsultation(validatedData);

      // Log activity
      await storage.createActivityLog({
        userId: req.user.claims.sub,
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
        uploadedBy: req.user.claims.sub,
        filePath: filePath,
      });

      const attachment = await storage.createAttachment(validatedData);

      // Log activity
      await storage.createActivityLog({
        userId: req.user.claims.sub,
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
        userId: req.user.claims.sub,
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
      const currentUser = await storage.getUser(req.user.claims.sub);
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
      const currentUser = await storage.getUser(req.user.claims.sub);
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
      const currentUser = await storage.getUser(req.user.claims.sub);
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

  const httpServer = createServer(app);
  return httpServer;
}
