import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit, Trash2, UserPlus, Users as UsersIcon, Link2, Unlink } from "lucide-react";
import type { User } from "@shared/schema";
import { UserModal } from "@/components/UserModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";

// 팀 관계 관리 컴포넌트
function TeamRelationshipManager({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedManager, setSelectedManager] = useState<string>("");
  const [selectedCounselor, setSelectedCounselor] = useState<string>("");

  // 사용자 목록 가져오기
  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  // 팀 관계 가져오기
  const { data: relationships, isLoading } = useQuery<Array<{
    id: string;
    managerId: string;
    counselorId: string;
    managerName?: string;
    counselorName?: string;
    createdAt?: string;
    isActive?: boolean;
  }>>({
    queryKey: ['/api/user-relationships'],
    enabled: isAdmin,
  });

  // 팀 관계 생성 mutation
  const createRelationshipMutation = useMutation({
    mutationFn: (data: { managerId: string; counselorId: string }) =>
      apiRequest('POST', '/api/user-relationships', data),
    onSuccess: () => {
      toast({
        title: "성공",
        description: "팀 관계가 생성되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user-relationships'] });
      setIsDialogOpen(false);
      setSelectedManager("");
      setSelectedCounselor("");
    },
    onError: () => {
      toast({
        title: "오류",
        description: "팀 관계 생성에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  // 팀 관계 삭제 mutation
  const deleteRelationshipMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest('DELETE', `/api/user-relationships/${id}`),
    onSuccess: () => {
      toast({
        title: "성공",
        description: "팀 관계가 삭제되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user-relationships'] });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "팀 관계 삭제에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const managers = users?.filter(u => u.role === 'manager') || [];
  const counselors = users?.filter(u => u.role === 'counselor') || [];

  if (!isAdmin) return null;

  return (
    <>
      <Card className="border-gray-100">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-gray-900">
              <UsersIcon className="inline-block h-5 w-5 mr-2" />
              팀장-팀원 관계 관리
            </CardTitle>
            <Button
              onClick={() => setIsDialogOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-add-relationship"
            >
              <Link2 className="h-4 w-4 mr-2" />
              관계 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : relationships && relationships.length > 0 ? (
            <div className="space-y-3">
              {relationships.map((rel) => (
                <div
                  key={rel.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Badge className="bg-blue-100 text-blue-800">팀장</Badge>
                      <span className="font-medium">{rel.managerName}</span>
                    </div>
                    <div className="text-gray-400">→</div>
                    <div className="flex items-center space-x-2">
                      <Badge className="bg-green-100 text-green-800">팀원</Badge>
                      <span className="font-medium">{rel.counselorName}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteRelationshipMutation.mutate(rel.id)}
                    data-testid={`button-delete-relationship-${rel.id}`}
                  >
                    <Unlink className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              등록된 팀 관계가 없습니다.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 팀 관계 추가 다이얼로그 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>팀 관계 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">팀장 선택</label>
              <Select value={selectedManager} onValueChange={setSelectedManager}>
                <SelectTrigger data-testid="select-manager">
                  <SelectValue placeholder="팀장을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {managers.map(manager => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">팀원 선택</label>
              <Select value={selectedCounselor} onValueChange={setSelectedCounselor}>
                <SelectTrigger data-testid="select-counselor">
                  <SelectValue placeholder="팀원을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {counselors.map(counselor => (
                    <SelectItem key={counselor.id} value={counselor.id}>
                      {counselor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (selectedManager && selectedCounselor) {
                  createRelationshipMutation.mutate({
                    managerId: selectedManager,
                    counselorId: selectedCounselor,
                  });
                }
              }}
              disabled={!selectedManager || !selectedCounselor}
              data-testid="button-save-relationship"
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UsersList({ 
  onEditUser, 
  isAdmin, 
  selectedUsers, 
  onToggleUser, 
  onToggleAll 
}: { 
  onEditUser: (user: User) => void; 
  isAdmin: boolean;
  selectedUsers: Set<string>;
  onToggleUser: (userId: string) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'manager':
        return 'bg-blue-100 text-blue-800';
      case 'counselor':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin':
        return '관리자';
      case 'manager':
        return '팀장';
      case 'counselor':
        return '팀원';
      default:
        return role;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!users || users.length === 0) {
    return (
      <div className="text-center py-12">
        <i className="fas fa-users text-4xl text-gray-400 mb-4"></i>
        <h3 className="text-lg font-medium text-gray-900 mb-2">등록된 사용자가 없습니다</h3>
        <p className="text-gray-500">새 사용자를 추가해보세요.</p>
      </div>
    );
  }

  // selectedUsers에 대한 안전한 처리
  const safeSelectedUsers = selectedUsers || new Set<string>();
  const allUsersSelected = users && users.length > 0 && users.every(user => safeSelectedUsers.has(user.id));
  const someUsersSelected = users && users.some(user => safeSelectedUsers.has(user.id));

  return (
    <div className="space-y-4">
      {/* 헤더 - 전체 선택 체크박스 */}
      {isAdmin && users && users.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center space-x-3">
            <Checkbox
              checked={allUsersSelected}
              onCheckedChange={(checked) => onToggleAll(checked as boolean)}
              data-testid="checkbox-select-all"
            />
            <span className="text-sm font-medium text-gray-700">
              {safeSelectedUsers.size > 0 ? `${safeSelectedUsers.size}명 선택됨` : '전체 선택'}
            </span>
          </div>
          {safeSelectedUsers.size > 0 && (
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm"
                className="text-blue-600 border-blue-600 hover:bg-blue-50"
                data-testid="button-bulk-edit"
              >
                <Edit className="h-4 w-4 mr-1" />
                선택 수정
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="text-red-600 border-red-600 hover:bg-red-50"
                data-testid="button-bulk-delete"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                선택 삭제
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 사용자 목록 */}
      {users.map((user) => (
        <div key={user.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
          <div className="flex items-center space-x-4">
            {isAdmin && (
              <Checkbox
                checked={safeSelectedUsers.has(user.id)}
                onCheckedChange={() => onToggleUser(user.id)}
                data-testid={`checkbox-user-${user.id}`}
              />
            )}
            <div className="w-10 h-10 bg-keystart-blue rounded-full flex items-center justify-center">
              <i className="fas fa-user text-white text-sm"></i>
            </div>
            <div>
              <div className="font-medium text-gray-900">{user.username || user.name}</div>
              <div className="text-sm text-gray-500">{user.name}</div>
              {user.department && (
                <div className="text-xs text-gray-400">{user.department}</div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Badge className={getRoleBadgeClass(user.role)}>
              {getRoleText(user.role)}
            </Badge>
            <Badge variant={user.isActive ? "default" : "secondary"}>
              {user.isActive ? "활성" : "비활성"}
            </Badge>
            {isAdmin && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-gray-400 hover:text-gray-600"
                onClick={() => onEditUser(user)}
                data-testid={`button-edit-user-${user.id}`}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Users() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsUserModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingUser(null);
    setIsUserModalOpen(false);
  };

  // 체크박스 관련 함수들
  const handleToggleUser = (userId: string) => {
    setSelectedUsers(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(userId)) {
        newSelected.delete(userId);
      } else {
        newSelected.add(userId);
      }
      return newSelected;
    });
  };

  const handleToggleAll = (checked: boolean) => {
    if (checked && users) {
      setSelectedUsers(new Set(users.map(user => user.id)));
    } else {
      setSelectedUsers(new Set());
    }
  };

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading]);
  // Note: toast is deliberately excluded from dependencies to prevent infinite re-renders

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="users-content">
      <Card className="border-gray-100">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">
            사용자 관리
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">시스템 사용자</h2>
              {user?.role === 'admin' && (
                <Button 
                  className="bg-keystart-blue hover:bg-keystart-blue-hover text-white"
                  onClick={() => setIsUserModalOpen(true)}
                  data-testid="button-add-user"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  사용자 추가
                </Button>
              )}
            </div>
            
            <UsersList 
              onEditUser={handleEditUser} 
              isAdmin={user?.role === 'admin'} 
              selectedUsers={selectedUsers}
              onToggleUser={handleToggleUser}
              onToggleAll={handleToggleAll}
            />
          </div>
        </CardContent>
      </Card>
      
      {/* 팀 관계 관리 - 관리자만 표시 */}
      <TeamRelationshipManager isAdmin={user?.role === 'admin'} />
      
      <UserModal 
        isOpen={isUserModalOpen}
        onClose={handleCloseModal}
        editingUser={editingUser}
      />
    </div>
  );
}
