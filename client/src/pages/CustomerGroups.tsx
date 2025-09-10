import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PlusIcon, EditIcon, TrashIcon, UsersIcon } from "lucide-react";
import type { CustomerGroup, InsertCustomerGroup, CustomerWithUser } from "@shared/schema";

export default function CustomerGroups() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCustomersDialogOpen, setIsCustomersDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CustomerGroup | null>(null);
  const [editingGroup, setEditingGroup] = useState<CustomerGroup | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [formData, setFormData] = useState<Partial<InsertCustomerGroup>>({
    name: "",
    description: "",
    color: "#3B82F6",
  });

  // 고객 그룹 목록 조회
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["/api/customer-groups"],
  });

  // 선택된 그룹의 고객 목록 조회
  const { data: groupCustomers = [] } = useQuery<any[]>({
    queryKey: [`/api/customer-groups/${selectedGroup?.id}/customers`],
    enabled: !!selectedGroup,
  });

  // 모든 고객 목록 조회 (그룹에 추가할 때 사용)
  const { data: allCustomers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
    enabled: isCustomersDialogOpen,
  });

  // 고객 그룹 생성
  const createGroupMutation = useMutation({
    mutationFn: async (data: InsertCustomerGroup) => {
      return await apiRequest("POST", "/api/customer-groups", data);
    },
    onSuccess: () => {
      toast({
        title: "그룹 생성 완료",
        description: "새 고객 그룹이 생성되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups"] });
      setIsCreateDialogOpen(false);
      setFormData({ name: "", description: "", color: "#3B82F6" });
    },
    onError: (error) => {
      toast({
        title: "생성 실패",
        description: error.message || "그룹 생성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  // 고객 그룹 수정
  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CustomerGroup> }) => {
      return await apiRequest("PUT", `/api/customer-groups/${id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "그룹 수정 완료",
        description: "고객 그룹이 수정되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups"] });
      setIsEditDialogOpen(false);
      setEditingGroup(null);
    },
    onError: (error) => {
      toast({
        title: "수정 실패",
        description: error.message || "그룹 수정 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  // 고객 그룹 삭제
  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/customer-groups/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "그룹 삭제 완료",
        description: "고객 그룹이 삭제되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups"] });
    },
    onError: (error) => {
      toast({
        title: "삭제 실패",
        description: error.message || "그룹 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  // 고객을 그룹에 추가
  const addCustomersToGroupMutation = useMutation({
    mutationFn: async ({ groupId, customerIds }: { groupId: string; customerIds: string[] }) => {
      return await apiRequest("POST", `/api/customer-groups/${groupId}/customers`, { customerIds });
    },
    onSuccess: () => {
      toast({
        title: "고객 추가 완료",
        description: "선택한 고객들이 그룹에 추가되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/customer-groups/${selectedGroup?.id}/customers`] });
      setSelectedCustomers([]);
    },
    onError: (error) => {
      toast({
        title: "추가 실패",
        description: error.message || "고객 추가 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  // 그룹에서 고객 제거
  const removeCustomerFromGroupMutation = useMutation({
    mutationFn: async ({ groupId, customerId }: { groupId: string; customerId: string }) => {
      return await apiRequest("DELETE", `/api/customer-groups/${groupId}/customers/${customerId}`);
    },
    onSuccess: () => {
      toast({
        title: "고객 제거 완료",
        description: "고객이 그룹에서 제거되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/customer-groups/${selectedGroup?.id}/customers`] });
    },
    onError: (error) => {
      toast({
        title: "제거 실패",
        description: error.message || "고객 제거 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleCreateGroup = () => {
    if (!formData.name?.trim()) {
      toast({
        title: "입력 오류",
        description: "그룹명을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    createGroupMutation.mutate(formData as InsertCustomerGroup);
  };

  const handleEditGroup = () => {
    if (!editingGroup || !formData.name?.trim()) {
      toast({
        title: "입력 오류",
        description: "그룹명을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    updateGroupMutation.mutate({
      id: editingGroup.id,
      data: formData,
    });
  };

  const openEditDialog = (group: CustomerGroup) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      description: group.description || "",
      color: group.color || "#3B82F6",
    });
    setIsEditDialogOpen(true);
  };

  const openCustomersDialog = (group: CustomerGroup) => {
    setSelectedGroup(group);
    setSelectedCustomers([]);
    setCustomerSearchQuery("");
    setIsCustomersDialogOpen(true);
  };

  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomers(prev => 
      prev.includes(customerId) 
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const handleAddSelectedCustomers = () => {
    if (!selectedGroup || selectedCustomers.length === 0) return;
    
    addCustomersToGroupMutation.mutate({
      groupId: selectedGroup.id,
      customerIds: selectedCustomers,
    });
  };

  const handleRemoveCustomer = (customerId: string) => {
    if (!selectedGroup) return;
    
    removeCustomerFromGroupMutation.mutate({
      groupId: selectedGroup.id,
      customerId,
    });
  };

  // 그룹에 속하지 않은 고객들만 필터링
  const availableCustomers = allCustomers.filter(customer => 
    !groupCustomers.some(groupCustomer => groupCustomer.id === customer.id) &&
    (customerSearchQuery === "" || 
     customer.name?.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
     customer.phone?.includes(customerSearchQuery))
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">고객 그룹 관리</h1>
          <p className="text-gray-600">고객을 그룹으로 분류하여 효율적으로 관리하세요</p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-group">
              <PlusIcon className="h-4 w-4 mr-2" />
              새 그룹 생성
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 고객 그룹 생성</DialogTitle>
              <DialogDescription>
                새로운 고객 그룹을 생성합니다. 그룹명은 필수 항목입니다.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">그룹명 *</Label>
                <Input
                  id="name"
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="예: VIP 고객, 신규 고객"
                  data-testid="input-group-name"
                />
              </div>
              
              <div>
                <Label htmlFor="description">설명</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="그룹에 대한 설명을 입력하세요"
                  rows={3}
                  data-testid="input-group-description"
                />
              </div>
              
              <div>
                <Label htmlFor="color">색상</Label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    id="color"
                    value={formData.color || "#3B82F6"}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-10 h-10 rounded border border-gray-300"
                    data-testid="input-group-color"
                  />
                  <span className="text-sm text-gray-600">그룹을 구분할 색상을 선택하세요</span>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                data-testid="button-cancel-create"
              >
                취소
              </Button>
              <Button
                onClick={handleCreateGroup}
                disabled={createGroupMutation.isPending}
                data-testid="button-confirm-create"
              >
                {createGroupMutation.isPending ? "생성 중..." : "생성"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>고객 그룹이 없습니다</CardTitle>
            <CardDescription>
              첫 번째 고객 그룹을 생성하여 고객을 체계적으로 관리해보세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-group">
              <PlusIcon className="h-4 w-4 mr-2" />
              첫 그룹 생성하기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group: CustomerGroup) => (
            <Card key={group.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: group.color || "#3B82F6" }}
                    ></div>
                    <CardTitle className="text-lg">{group.name}</CardTitle>
                  </div>
                  
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openCustomersDialog(group)}
                      data-testid={`button-view-customers-${group.id}`}
                    >
                      <UsersIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(group)}
                      data-testid={`button-edit-group-${group.id}`}
                    >
                      <EditIcon className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`button-delete-group-${group.id}`}
                        >
                          <TrashIcon className="h-4 w-4 text-red-500" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>그룹 삭제 확인</AlertDialogTitle>
                          <AlertDialogDescription>
                            "{group.name}" 그룹을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                            그룹 내의 고객 정보는 삭제되지 않습니다.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>취소</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteGroupMutation.mutate(group.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            삭제
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                
                {group.description && (
                  <CardDescription className="text-sm">
                    {group.description}
                  </CardDescription>
                )}
              </CardHeader>
              
              <CardContent>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>생성일: {group.createdAt ? new Date(group.createdAt).toLocaleDateString() : '알 수 없음'}</span>
                  {group.isActive && (
                    <Badge variant="secondary" className="text-xs">활성</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 그룹 수정 대화상자 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>그룹 정보 수정</DialogTitle>
            <DialogDescription>
              고객 그룹의 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">그룹명 *</Label>
              <Input
                id="edit-name"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="그룹명을 입력하세요"
                data-testid="input-edit-group-name"
              />
            </div>
            
            <div>
              <Label htmlFor="edit-description">설명</Label>
              <Textarea
                id="edit-description"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="그룹에 대한 설명을 입력하세요"
                rows={3}
                data-testid="input-edit-group-description"
              />
            </div>
            
            <div>
              <Label htmlFor="edit-color">색상</Label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  id="edit-color"
                  value={formData.color || "#3B82F6"}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-10 h-10 rounded border border-gray-300"
                  data-testid="input-edit-group-color"
                />
                <span className="text-sm text-gray-600">그룹을 구분할 색상을 선택하세요</span>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              data-testid="button-cancel-edit"
            >
              취소
            </Button>
            <Button
              onClick={handleEditGroup}
              disabled={updateGroupMutation.isPending}
              data-testid="button-confirm-edit"
            >
              {updateGroupMutation.isPending ? "수정 중..." : "수정"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 고객 관리 모달 */}
      <Dialog open={isCustomersDialogOpen} onOpenChange={setIsCustomersDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5" />
              고객 관리: {selectedGroup?.name}
            </DialogTitle>
            <DialogDescription>
              그룹에 속한 고객을 관리하고 새로운 고객을 추가할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* 현재 그룹에 속한 고객들 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">현재 그룹 고객 ({groupCustomers.length}명)</CardTitle>
              </CardHeader>
              <CardContent>
                {groupCustomers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <UsersIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p>이 그룹에 속한 고객이 없습니다.</p>
                    <p className="text-sm mt-1">아래에서 고객을 선택하여 추가해보세요.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>고객명</TableHead>
                        <TableHead>전화번호</TableHead>
                        <TableHead>이메일</TableHead>
                        <TableHead>담당자</TableHead>
                        <TableHead className="text-right">작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupCustomers.map((customer: any) => (
                        <TableRow key={customer.id}>
                          <TableCell className="font-medium">{customer.name}</TableCell>
                          <TableCell>{customer.phone}</TableCell>
                          <TableCell>{customer.email || '-'}</TableCell>
                          <TableCell>{customer.counselor?.name || '-'}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveCustomer(customer.id)}
                              disabled={removeCustomerFromGroupMutation.isPending}
                              className="text-red-600 hover:text-red-700 hover:border-red-300"
                              data-testid={`button-remove-customer-${customer.id}`}
                            >
                              <UserMinus className="h-4 w-4 mr-1" />
                              제거
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* 고객 추가 섹션 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">고객 추가</CardTitle>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="고객명 또는 전화번호로 검색..."
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      className="pl-10"
                      data-testid="input-customer-search"
                    />
                  </div>
                  <Button
                    onClick={handleAddSelectedCustomers}
                    disabled={selectedCustomers.length === 0 || addCustomersToGroupMutation.isPending}
                    data-testid="button-add-selected-customers"
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    선택한 고객 추가 ({selectedCustomers.length})
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {availableCustomers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p>추가할 수 있는 고객이 없습니다.</p>
                    <p className="text-sm mt-1">모든 고객이 이미 그룹에 속해있거나 검색 결과가 없습니다.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">선택</TableHead>
                        <TableHead>고객명</TableHead>
                        <TableHead>전화번호</TableHead>
                        <TableHead>이메일</TableHead>
                        <TableHead>담당자</TableHead>
                        <TableHead>상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {availableCustomers.map((customer: any) => (
                        <TableRow key={customer.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedCustomers.includes(customer.id)}
                              onCheckedChange={() => handleCustomerSelect(customer.id)}
                              data-testid={`checkbox-customer-${customer.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{customer.name}</TableCell>
                          <TableCell>{customer.phone}</TableCell>
                          <TableCell>{customer.email || '-'}</TableCell>
                          <TableCell>{customer.counselor?.name || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {customer.status === 'active' ? '상담중' : 
                               customer.status === 'completed' ? '완료' : '대기중'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => setIsCustomersDialogOpen(false)}
              data-testid="button-close-customers-dialog"
            >
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}