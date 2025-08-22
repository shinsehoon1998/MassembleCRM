import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { apiRequest } from "@/lib/queryClient";

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CreateUserData {
  username: string;
  name: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  team?: string;
  role: 'admin' | 'manager' | 'counselor';
  isActive: boolean;
}

export function UserModal({ isOpen, onClose }: UserModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<CreateUserData>({
    username: '',
    name: '',
    email: '',
    firstName: '',
    lastName: '',
    department: '',
    team: '',
    role: 'counselor',
    isActive: true,
  });

  const createUserMutation = useMutation({
    mutationFn: async (userData: CreateUserData) => {
      const response = await fetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(userData),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create user');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: "사용자 추가 완료",
        description: "새 사용자가 성공적으로 추가되었습니다.",
      });
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "사용자 추가 실패",
        description: error.message || "사용자 추가 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.name.trim()) {
      toast({
        title: "입력 오류",
        description: "아이디와 성명은 필수 입력 사항입니다.",
        variant: "destructive",
      });
      return;
    }
    createUserMutation.mutate(formData);
  };

  const handleClose = () => {
    setFormData({
      username: '',
      name: '',
      email: '',
      firstName: '',
      lastName: '',
      department: '',
      team: '',
      role: 'counselor',
      isActive: true,
    });
    onClose();
  };

  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin': return '관리자';
      case 'manager': return '팀장';
      case 'counselor': return '팀원';
      default: return role;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">회원등록</DialogTitle>
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
              placeholder="사용자 아이디를 입력하세요"
              required
              data-testid="input-username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              성명 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="사용자 이름을 입력하세요"
              required
              data-testid="input-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              휴대전화번호
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="이메일을 입력하세요"
              data-testid="input-email"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-medium">성</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="성"
                data-testid="input-firstName"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm font-medium">이름</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="이름"
                data-testid="input-lastName"
              />
            </div>
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
            <Label htmlFor="team" className="text-sm font-medium">팀</Label>
            <Select 
              value={formData.team} 
              onValueChange={(value) => setFormData({ ...formData, team: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="팀을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1팀">1팀</SelectItem>
                <SelectItem value="2팀">2팀</SelectItem>
                <SelectItem value="3팀">3팀</SelectItem>
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

          <div className="space-y-4">
            <Label className="text-sm font-medium">권한</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="read" defaultChecked />
                <Label htmlFor="read" className="text-sm">조회</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="write" />
                <Label htmlFor="write" className="text-sm">작성</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="modify" />
                <Label htmlFor="modify" className="text-sm">수정</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="delete" />
                <Label htmlFor="delete" className="text-sm">삭제</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="manage" />
                <Label htmlFor="manage" className="text-sm">관리</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="admin" />
                <Label htmlFor="admin" className="text-sm">사용</Label>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="isActive" 
              checked={formData.isActive}
              onCheckedChange={(checked) => 
                setFormData({ ...formData, isActive: checked as boolean })
              }
            />
            <Label htmlFor="isActive" className="text-sm">로그인</Label>
          </div>
        </form>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            취소
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={createUserMutation.isPending}
            className="bg-massemble-red hover:bg-massemble-red-hover text-white"
            data-testid="button-create-user"
          >
            {createUserMutation.isPending ? '추가 중...' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}