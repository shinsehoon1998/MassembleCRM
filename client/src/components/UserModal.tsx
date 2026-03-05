import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingUser?: User | null;
}

interface CreateUserData {
  username: string;
  password?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  department?: string;
  role: 'admin' | 'manager' | 'counselor';
  isActive?: boolean;
}

export function UserModal({ isOpen, onClose, editingUser }: UserModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  
  // Check if current user is admin
  const isAdmin = currentUser?.role === 'admin';
  const [formData, setFormData] = useState<CreateUserData>({
    username: '',
    password: '',
    name: '',
    firstName: '',
    lastName: '',
    phone: '',
    department: '',
    role: 'counselor',
    isActive: true,
  });

  // Password reset state
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetPassword, setResetPassword] = useState('');

  // Reset form when editing user changes or modal opens
  useEffect(() => {
    if (editingUser) {
      setFormData({
        username: editingUser.username || '',
        password: '', // Don't pre-fill password for security
        name: editingUser.name || '',
        firstName: editingUser.firstName || '',
        lastName: editingUser.lastName || '',
        phone: editingUser.phone || '',
        department: editingUser.department || '',
        role: editingUser.role,
        isActive: editingUser.isActive,
      });
    } else {
      setFormData({
        username: '',
        password: '',
        name: '',
        firstName: '',
        lastName: '',
        phone: '',
        department: '',
        role: 'counselor',
        isActive: true,
      });
    }
  }, [editingUser, isOpen]);

  const createUserMutation = useMutation({
    mutationFn: async (userData: CreateUserData) => {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        body: JSON.stringify(userData),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Failed to ${editingUser ? 'update' : 'create'} user`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: editingUser ? "사용자 수정 완료" : "사용자 추가 완료",
        description: editingUser 
          ? "사용자 정보가 성공적으로 수정되었습니다." 
          : "새 사용자가 성공적으로 추가되었습니다.",
      });
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: editingUser ? "사용자 수정 실패" : "사용자 추가 실패",
        description: error.message || `사용자 ${editingUser ? '수정' : '추가'} 중 오류가 발생했습니다.`,
        variant: "destructive",
      });
    },
  });

  // Password reset mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const response = await apiRequest('POST', `/api/users/${userId}/reset-password`, { password });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: "비밀번호 설정 완료",
        description: "사용자 비밀번호가 성공적으로 설정되었습니다.",
      });
      setShowPasswordReset(false);
      setResetPassword('');
    },
    onError: (error: Error) => {
      toast({
        title: "비밀번호 설정 실패",
        description: error.message || "비밀번호 설정 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const handlePasswordReset = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetPassword.trim()) {
      toast({
        title: "입력 오류",
        description: "새 비밀번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (resetPassword.length < 4) {
      toast({
        title: "입력 오류",
        description: "비밀번호는 최소 4자 이상이어야 합니다.",
        variant: "destructive",
      });
      return;
    }

    if (editingUser) {
      resetPasswordMutation.mutate({ 
        userId: editingUser.id, 
        password: resetPassword 
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Admin permission check before API call
    if (!isAdmin) {
      toast({
        title: "권한 없음",
        description: "사용자 관리는 관리자만 가능합니다.",
        variant: "destructive",
      });
      return;
    }
    
    if (!formData.username.trim()) {
      toast({
        title: "입력 오류",
        description: "아이디는 필수 입력 사항입니다.",
        variant: "destructive",
      });
      return;
    }
    if (!editingUser && !formData.password) {
      toast({
        title: "입력 오류",
        description: "비밀번호는 필수 입력 사항입니다.",
        variant: "destructive",
      });
      return;
    }
    if (formData.phone && !validatePhoneNumber(formData.phone)) {
      toast({
        title: "입력 오류",
        description: "올바른 휴대폰 번호 형식을 입력해주세요. (예: 010-1234-5678)",
        variant: "destructive",
      });
      return;
    }
    // Prepare the payload - exclude empty password during editing
    const payload: CreateUserData = { ...formData };
    
    // Security fix: Remove empty password from payload during editing
    if (editingUser && (!payload.password || payload.password.trim() === '')) {
      delete payload.password;
    }
    
    createUserMutation.mutate(payload);
  };

  const handleClose = () => {
    setFormData({
      username: '',
      password: '',
      name: '',
      firstName: '',
      lastName: '',
      phone: '',
      department: '',
      role: 'counselor',
      isActive: true,
    });
    setShowPasswordReset(false);
    setResetPassword('');
    onClose();
  };

  // 한국 휴대폰 번호 형식 검증 함수
  const validatePhoneNumber = (phone: string): boolean => {
    if (!phone || phone.trim() === '') return true; // 선택적 필드이므로 빈 값은 유효
    
    // 한국 휴대폰 번호 정규식: 010-xxxx-xxxx 또는 01x-xxxx-xxxx
    const phoneRegex = /^01[0-9]-\d{4}-\d{4}$/;
    return phoneRegex.test(phone);
  };

  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin': return '관리자';
      case 'manager': return '팀장';
      case 'counselor': return '팀원';
      default: return role;
    }
  };

  // Show access denied message for non-admin users
  if (!isAdmin) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-red-600">
              접근 권한 없음
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-6 text-center">
            <div className="text-red-500 text-4xl mb-4">🚫</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              관리자 권한이 필요합니다
            </h3>
            <p className="text-gray-600 mb-4">
              사용자 관리 기능은 관리자만 사용할 수 있습니다.
            </p>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Password reset dialog
  if (showPasswordReset && editingUser) {
    return (
      <Dialog open={showPasswordReset} onOpenChange={() => setShowPasswordReset(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              비밀번호 설정 - {editingUser.name}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetPassword" className="text-sm font-medium">
                새 비밀번호 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="resetPassword"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="새 비밀번호를 입력하세요 (최소 4자)"
                required
                minLength={4}
                data-testid="input-reset-password"
              />
            </div>
            
            <div className="p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-700">
                이 사용자의 비밀번호를 설정하면 즉시 로그인할 수 있습니다.
              </p>
            </div>

            <DialogFooter className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowPasswordReset(false)}
                data-testid="button-cancel-reset"
              >
                취소
              </Button>
              <Button 
                type="submit"
                disabled={resetPasswordMutation.isPending}
                data-testid="button-confirm-reset"
                className="bg-blue-600 hover:bg-blue-700"
              >
                {resetPasswordMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    설정 중...
                  </>
                ) : (
                  '비밀번호 설정'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {editingUser ? '사용자 수정' : '회원등록'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium">
              아이디 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="아이디를 입력하세요"
              required
              data-testid="input-username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              비밀번호 {!editingUser && <span className="text-red-500">*</span>}
            </Label>
            <div className="flex gap-2">
              <Input
                id="password"
                type="password"
                value={formData.password || ''}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={editingUser ? "변경할 비밀번호 (선택사항)" : "비밀번호를 입력하세요"}
                data-testid="input-password"
                className="flex-1"
              />
              {editingUser && !editingUser.password && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPasswordReset(true)}
                  className="text-orange-600 hover:text-orange-700 border-orange-300 hover:border-orange-400"
                  data-testid="button-reset-password"
                >
                  비밀번호 설정
                </Button>
              )}
            </div>
            {editingUser && !editingUser.password && (
              <p className="text-sm text-orange-600 bg-orange-50 p-2 rounded border border-orange-200">
                ⚠️ 이 사용자는 비밀번호가 설정되지 않아 로그인할 수 없습니다.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-medium">성</Label>
              <Input
                id="firstName"
                value={formData.firstName || ''}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="성"
                data-testid="input-firstName"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm font-medium">이름</Label>
              <Input
                id="lastName"
                value={formData.lastName || ''}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="이름"
                data-testid="input-lastName"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-medium">휴대폰 번호</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="010-1234-5678"
              data-testid="input-phone"
            />
            <p className="text-xs text-gray-500">
              형식: 010-1234-5678 (선택사항)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="department" className="text-sm font-medium">부서</Label>
            <Select 
              value={formData.department} 
              onValueChange={(value) => setFormData({ ...formData, department: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="부서를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="법무팀">법무팀</SelectItem>
                <SelectItem value="상담팀">상담팀</SelectItem>
                <SelectItem value="영업팀">영업팀</SelectItem>
                <SelectItem value="관리팀">관리팀</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role" className="text-sm font-medium">업무구분</Label>
            <Select 
              value={formData.role} 
              onValueChange={(value: 'admin' | 'manager' | 'counselor') => 
                setFormData({ ...formData, role: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">관리자</SelectItem>
                <SelectItem value="manager">팀장</SelectItem>
                <SelectItem value="counselor">팀원</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {editingUser && (
            <div className="flex items-center space-x-2 pt-4 border-t">
              <Checkbox 
                id="isActive" 
                checked={formData.isActive || false}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, isActive: checked as boolean })
                }
                data-testid="checkbox-active"
              />
              <Label htmlFor="isActive" className="text-sm">계정 활성화</Label>
            </div>
          )}

        </form>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            취소
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={createUserMutation.isPending}
            className="bg-keystart-blue hover:bg-keystart-blue-hover text-white"
            data-testid="button-create-user"
          >
            {createUserMutation.isPending ? (editingUser ? '수정 중...' : '추가 중...') : (editingUser ? '수정' : '추가')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}