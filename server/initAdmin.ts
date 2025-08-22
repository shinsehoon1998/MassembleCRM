import bcrypt from 'bcryptjs';
import { storage } from './storage';

export async function initializeAdminUser() {
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
        department: '관리부',
        createdBy: 'system'
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