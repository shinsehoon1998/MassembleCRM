import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import CustomerModal from "@/components/CustomerModal";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { CustomerWithUser, User } from "@shared/schema";

interface CustomersResponse {
  customers: CustomerWithUser[];
  total: number;
  totalPages: number;
}

export default function Customers() {
  const [searchParams, setSearchParams] = useState({
    search: "",
    status: "",
    assignedUserId: "",
    unassigned: false,  // 담당자 미정
    unshared: false,    // 공유담당자 미정
    page: 1,
    limit: 20,
  });
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithUser | null>(null);
  const [editingMemo, setEditingMemo] = useState<{ [key: string]: { [field: string]: string } }>({});
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [showArsModal, setShowArsModal] = useState(false);
  const [arsData, setArsData] = useState({
    sendNumber: "",
    scenarioId: "marketing_consent",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customersData, isLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/customers", searchParams],
  });

  const { data: counselors } = useQuery<User[]>({
    queryKey: ["/api/users/counselors"],
  });

  const { data: systemSettings = [] } = useQuery<any[]>({
    queryKey: ['/api/system-settings'],
  });

  // 환경설정에서 상태 항목들 추출
  const statusOptions = systemSettings
    .filter((setting: any) => setting.category === '상태항목')
    .map((setting: any) => setting.value)
    .filter((value: string) => value && value.trim());

  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      await apiRequest("DELETE", `/api/customers/${customerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "성공",
        description: "고객이 삭제되었습니다.",
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "고객 삭제에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const batchUpdateMutation = useMutation({
    mutationFn: async ({ customerIds, updates }: { customerIds: string[], updates: any }) => {
      const response = await apiRequest("PUT", "/api/customers/batch", { customerIds, updates });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setSelectedCustomers([]);
      setShowBatchActions(false);
      toast({
        title: "성공",
        description: `${data.updated || 0}명의 고객이 수정되었습니다.`,
      });
    },
    onError: (error) => {
      console.error("Batch update error:", error);
      toast({
        title: "오류",
        description: "일괄 수정에 실패했습니다. 다시 시도해 주세요.",
        variant: "destructive",
      });
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (customerIds: string[]) => {
      const response = await apiRequest("DELETE", "/api/customers/batch", { customerIds });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setSelectedCustomers([]);
      setShowBatchActions(false);
      
      let message = `${data.deleted}명의 고객이 삭제되었습니다.`;
      if (data.notFound > 0) {
        message += ` (${data.notFound}명은 이미 삭제되었거나 존재하지 않습니다.)`;
      }
      
      toast({
        title: "완료",
        description: message,
        variant: data.deleted > 0 ? "default" : "destructive"
      });
    },
    onError: (error) => {
      console.error("Batch delete error:", error);
      
      // 더 구체적인 오류 메시지 표시
      let errorMessage = "일괄 삭제에 실패했습니다.";
      if (error?.message) {
        if (error.message.includes("404")) {
          errorMessage = "선택된 고객 중 일부를 찾을 수 없습니다. 페이지를 새로고침 후 다시 시도해주세요.";
        } else if (error.message.includes("401")) {
          errorMessage = "인증이 만료되었습니다. 다시 로그인해주세요.";
        } else {
          errorMessage = `오류: ${error.message}`;
        }
      }
      
      toast({
        title: "삭제 실패",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // ARS 발송 기능
  const sendSingleArsMutation = useMutation({
    mutationFn: async ({ customerId, sendNumber, scenarioId }: { 
      customerId: string, 
      sendNumber: string, 
      scenarioId: string 
    }) => {
      const response = await apiRequest("POST", `/api/ars/send-single`, { 
        customerId, 
        sendNumber, 
        scenarioId 
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "ARS 발송 성공",
        description: `고객에게 ARS가 발송되었습니다.`,
      });
    },
    onError: (error) => {
      toast({
        title: "ARS 발송 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendBulkArsMutation = useMutation({
    mutationFn: async ({ customerIds, sendNumber, scenarioId }: { 
      customerIds: string[], 
      sendNumber: string, 
      scenarioId: string 
    }) => {
      const response = await apiRequest("POST", `/api/ars/send-bulk`, { 
        customerIds, 
        sendNumber, 
        scenarioId,
        campaignName: `일괄 ARS 발송 (${new Date().toLocaleDateString('ko-KR')})`,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSelectedCustomers([]);
      setShowBatchActions(false);
      setShowArsModal(false);
      toast({
        title: "대량 ARS 발송 성공",
        description: `${selectedCustomers.length}명에게 ARS 발송을 시작했습니다.`,
      });
    },
    onError: (error) => {
      toast({
        title: "대량 ARS 발송 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const statusUpdateMutation = useMutation({
    mutationFn: async ({ customerId, status }: { customerId: string, status: string }) => {
      const response = await apiRequest("PATCH", `/api/customers/${customerId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "성공",
        description: "고객 상태가 변경되었습니다.",
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "상태 변경에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const memoUpdateMutation = useMutation({
    mutationFn: async ({ customerId, memos }: { customerId: string, memos: { [field: string]: string } }) => {
      const updateData = Object.fromEntries(
        Object.entries(memos).map(([field, value]) => [field, value || null])
      );
      const response = await apiRequest("PUT", `/api/customers/${customerId}`, updateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setEditingMemo({});
      toast({
        title: "성공",
        description: "메모가 저장되었습니다.",
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "메모 저장에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const getStatusBadgeClass = (status: string) => {
    const statusClasses: Record<string, string> = {
      '인텍': 'bg-yellow-400 text-black hover:bg-yellow-500',
      '수수': 'bg-green-400 text-white hover:bg-green-500',
      '접수': 'bg-blue-400 text-white hover:bg-blue-500',
      '작업': 'bg-orange-400 text-white hover:bg-orange-500',
      '완료': 'bg-green-500 text-white hover:bg-green-600',
    };
    return statusClasses[status] || 'bg-gray-400 text-white';
  };

  const formatNumber = (num: number | string | null) => {
    if (!num) return '-';
    return new Intl.NumberFormat('ko-KR').format(Number(num)) + '원';
  };

  const handleSearch = () => {
    setSearchParams(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setSearchParams(prev => ({ ...prev, page }));
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = customersData?.customers.map(c => c.id) || [];
      setSelectedCustomers(allIds);
      setShowBatchActions(allIds.length > 0);
    } else {
      setSelectedCustomers([]);
      setShowBatchActions(false);
    }
  };

  const handleSelectCustomer = (customerId: string, checked: boolean) => {
    if (checked) {
      setSelectedCustomers(prev => {
        const newSelection = [...prev, customerId];
        setShowBatchActions(newSelection.length > 0);
        return newSelection;
      });
    } else {
      setSelectedCustomers(prev => {
        const newSelection = prev.filter(id => id !== customerId);
        setShowBatchActions(newSelection.length > 0);
        return newSelection;
      });
    }
  };

  const handleEditCustomer = (customer: CustomerWithUser) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      deleteCustomerMutation.mutate(customerId);
    }
  };

  const handleNewCustomer = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const handleExportCSV = async () => {
    try {
      // 현재 검색 조건을 쿼리 파라미터로 변환
      const queryParams = new URLSearchParams();
      if (searchParams.search) queryParams.append('search', searchParams.search);
      if (searchParams.status && searchParams.status !== 'all') queryParams.append('status', searchParams.status);
      if (searchParams.assignedUserId && searchParams.assignedUserId !== 'all') queryParams.append('assignedUserId', searchParams.assignedUserId);
      if (searchParams.unassigned) queryParams.append('unassigned', 'true');
      if (searchParams.unshared) queryParams.append('unshared', 'true');

      const response = await fetch(`/api/customers/export?${queryParams.toString()}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'CSV 내보내기에 실패했습니다.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // 파일명 설정 (응답 헤더에서 가져오거나 기본값 사용)
      const contentDisposition = response.headers.get('content-disposition');
      let filename = 'customers.csv';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "내보내기 완료",
        description: "고객 데이터가 CSV 파일로 다운로드되었습니다.",
      });
    } catch (error) {
      console.error('CSV export error:', error);
      toast({
        title: "내보내기 실패",
        description: error instanceof Error ? error.message : "CSV 내보내기 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = (customerId: string, status: string) => {
    statusUpdateMutation.mutate({ customerId, status });
  };

  const handleMemoEdit = (customerId: string, customer: CustomerWithUser) => {
    const currentMemos = {
      memo1: customer.memo1 || '',
      memo2: customer.memo2 || '',
      memo3: customer.memo3 || '',
      memo4: customer.memo4 || '',
      memo5: customer.memo5 || '',
      memo6: customer.memo6 || '',
      memo7: customer.memo7 || '',
      memo8: customer.memo8 || '',
      memo9: customer.memo9 || '',
      memo10: customer.memo10 || '',
    };
    setEditingMemo({ ...editingMemo, [customerId]: currentMemos });
  };

  const handleMemoSave = (customerId: string) => {
    const memos = editingMemo[customerId] || {};
    memoUpdateMutation.mutate({ customerId, memos });
  };

  const handleMemoCancel = (customerId: string) => {
    setEditingMemo(prev => {
      const newState = { ...prev };
      delete newState[customerId];
      return newState;
    });
  };

  // memo1~memo10 중 값이 있는 것들을 요약해서 표시하는 함수
  const getMemoSummary = (customer: CustomerWithUser) => {
    const memos = [
      customer.memo1, customer.memo2, customer.memo3, customer.memo4, customer.memo5,
      customer.memo6, customer.memo7, customer.memo8, customer.memo9, customer.memo10
    ].filter(memo => memo && memo.trim());
    
    if (memos.length === 0) return null;
    if (memos.length === 1) return memos[0];
    return `${memos[0]} (+${memos.length - 1}개 더)`;
  };

  // memo 편집 모드에서 특정 memo 필드 값 업데이트
  const updateMemoField = (customerId: string, field: string, value: string) => {
    setEditingMemo(prev => ({
      ...prev,
      [customerId]: {
        ...prev[customerId],
        [field]: value
      }
    }));
  };

  const handleBatchUpdate = (updates: any) => {
    if (selectedCustomers.length === 0) return;
    
    let confirmMessage = '';
    if (updates.status) {
      confirmMessage = `선택된 ${selectedCustomers.length}명의 고객 상태를 "${updates.status}"(으)로 변경하시겠습니까?`;
    } else if (updates.assignedUserId) {
      const counselor = counselors?.find(c => c.id === updates.assignedUserId);
      confirmMessage = `선택된 ${selectedCustomers.length}명의 고객 담당자를 "${counselor?.name || '미지정'}"(으)로 변경하시겠습니까?`;
    } else if (updates.secondaryUserId !== undefined) {
      if (updates.secondaryUserId === 'CLEAR') {
        confirmMessage = `선택된 ${selectedCustomers.length}명의 고객 공유를 해제하시겠습니까?`;
        updates.secondaryUserId = null;
      } else {
        const counselor = counselors?.find(c => c.id === updates.secondaryUserId);
        confirmMessage = `선택된 ${selectedCustomers.length}명의 고객을 "${counselor?.name || '미지정'}"와(과) 공유하시겠습니까?`;
      }
    }
    
    if (confirmMessage && confirm(confirmMessage)) {
      batchUpdateMutation.mutate({ customerIds: selectedCustomers, updates });
    }
  };

  const handleBatchDelete = () => {
    if (selectedCustomers.length === 0) return;
    if (confirm(`선택된 ${selectedCustomers.length}개의 고객을 영구적으로 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
      batchDeleteMutation.mutate(selectedCustomers);
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="customers-content">
      {/* Search Filters */}
      <Card className="border-gray-100">
        <CardContent className="p-6">
          {/* Mobile-First Filter Layout */}
          <div className="space-y-4">
            {/* Search Input - Full Width on Mobile */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">검색</label>
              <Input
                placeholder="이름, 전화번호 검색"
                value={searchParams.search}
                onChange={(e) => setSearchParams(prev => ({ ...prev, search: e.target.value }))}
                data-testid="input-search"
                className="w-full"
              />
            </div>
            
            {/* Filters Grid - Responsive */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">상태</label>
                <Select
                  value={searchParams.status}
                  onValueChange={(value) => setSearchParams(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger data-testid="select-status">
                    <SelectValue placeholder="전체 상태" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 상태</SelectItem>
                    {statusOptions.map((status: string) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">담당자</label>
                <Select
                  value={searchParams.assignedUserId}
                  onValueChange={(value) => setSearchParams(prev => ({ ...prev, assignedUserId: value }))}
                >
                  <SelectTrigger data-testid="select-counselor">
                    <SelectValue placeholder="전체 담당자" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 담당자</SelectItem>
                    {counselors?.map(counselor => (
                      <SelectItem key={counselor.id} value={counselor.id}>
                        {counselor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Action Buttons - Stack on Mobile */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleSearch} className="bg-massemble-red hover:bg-massemble-red-hover text-white" data-testid="button-search">
                <i className="fas fa-search mr-2"></i>검색
              </Button>
              <Button onClick={handleNewCustomer} className="bg-massemble-red hover:bg-massemble-red-hover text-white" data-testid="button-add-customer">
                <i className="fas fa-plus mr-2"></i>신규 등록
              </Button>
              <Button 
                onClick={handleExportCSV} 
                variant="outline" 
                className="bg-green-600 text-white hover:bg-green-700"
                data-testid="button-export-excel"
              >
                <i className="fas fa-file-excel mr-2"></i>엑셀
              </Button>
            </div>
          </div>
          {/* 체크박스 필터 */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex flex-wrap gap-6 items-center">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={searchParams.unassigned}
                  onCheckedChange={(checked) => 
                    setSearchParams(prev => ({ ...prev, unassigned: checked === true }))
                  }
                  data-testid="checkbox-unassigned"
                />
                <label className="text-sm text-gray-700 cursor-pointer">팀분배대기: 담당자 미정</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={searchParams.unshared}
                  onCheckedChange={(checked) => 
                    setSearchParams(prev => ({ ...prev, unshared: checked === true }))
                  }
                  data-testid="checkbox-unshared"
                />
                <label className="text-sm text-gray-700 cursor-pointer">공유대기: 공유담당자 미정</label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Batch Actions */}
      {showBatchActions && (
        <Card className="border-gray-100 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                {selectedCustomers.length}개 고객 선택됨
              </span>
              <div className="flex space-x-3">
                <Select onValueChange={(status) => handleBatchUpdate({ status })}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="상태 변경" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status: string) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select onValueChange={(assignedUserId) => handleBatchUpdate({ assignedUserId })}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="담당자 변경" />
                  </SelectTrigger>
                  <SelectContent>
                    {counselors?.map((counselor) => (
                      <SelectItem key={counselor.id} value={counselor.id}>{counselor.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select onValueChange={(secondaryUserId) => handleBatchUpdate({ secondaryUserId })}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="공유 담당자" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLEAR">공유 해제</SelectItem>
                    {counselors?.map((counselor) => (
                      <SelectItem key={counselor.id} value={counselor.id}>{counselor.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => setShowArsModal(true)}
                  variant="outline"
                  size="sm"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  data-testid="button-bulk-ars"
                >
                  <i className="fas fa-phone mr-1"></i>ARS 발송
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleBatchDelete}
                  data-testid="button-batch-delete"
                >
                  <i className="fas fa-trash mr-2"></i>일괄 삭제
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setSelectedCustomers([]);
                    setShowBatchActions(false);
                  }}
                >
                  선택 해제
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customers Table */}
      <Card className="border-gray-100">
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-gray-900">고객 목록</CardTitle>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                총 {customersData?.total ? new Intl.NumberFormat('ko-KR').format(customersData.total) : 0}명
              </span>
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-500">페이지당</label>
                <Select
                  value={searchParams.limit.toString()}
                  onValueChange={(value) => setSearchParams(prev => ({ ...prev, limit: parseInt(value), page: 1 }))}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20개</SelectItem>
                    <SelectItem value="50">50개</SelectItem>
                    <SelectItem value="100">100개</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto min-w-full">
              <table className="min-w-max w-full table-fixed" style={{ minWidth: '1600px' }}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <Checkbox
                        checked={selectedCustomers.length === customersData?.customers?.length && customersData.customers.length > 0}
                        onCheckedChange={handleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">번호</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">고객정보</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">연락처</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">담당자</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">공유담당자</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-20">정보1</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-20">정보2</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-20">정보3</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-20">정보4</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-20">정보5</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-20">정보6</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-20">정보7</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-20">정보8</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-20">정보9</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-20">정보10</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">등록일</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">액션</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customersData?.customers?.map((customer, index) => {
                    const customerNumber = customersData.total - ((searchParams.page - 1) * searchParams.limit) - index;
                    return (
                      <tr key={customer.id} className="hover:bg-gray-50" data-testid={`row-customer-${customer.id}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Checkbox
                            checked={selectedCustomers.includes(customer.id)}
                            onCheckedChange={(checked) => handleSelectCustomer(customer.id, checked === true)}
                            data-testid={`checkbox-customer-${customer.id}`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {customerNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <Link href={`/customers/${customer.id}`}>
                              <div className="text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer" data-testid="text-customer-name">
                                {customer.name}
                              </div>
                            </Link>
                            <div className="text-sm text-gray-500">
                              {customer.gender === 'M' ? '남' : customer.gender === 'F' ? '여' : ''}{customer.birthDate && customer.gender !== 'N' ? ', ' : ''}
                              {customer.birthDate && format(new Date(customer.birthDate), 'yyyy.MM.dd', { locale: ko })}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{customer.phone}</div>
                          {customer.secondaryPhone && (
                            <div className="text-sm text-gray-500">{customer.secondaryPhone}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Select
                            value={customer.status}
                            onValueChange={(status) => handleStatusChange(customer.id, status)}
                          >
                            <SelectTrigger className="w-24 h-7 text-xs">
                              <Badge className={`${getStatusBadgeClass(customer.status)} text-xs font-semibold border-0`}>
                                {customer.status}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {statusOptions.map((status: string) => (
                                <SelectItem key={status} value={status}>{status}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{customer.assignedUser?.name || '-'}</div>
                          {customer.assignedUser?.department && (
                            <div className="text-sm text-gray-500">{customer.assignedUser.department}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{customer.secondaryUser?.name || '-'}</div>
                          {customer.secondaryUser?.department && (
                            <div className="text-sm text-gray-500">{customer.secondaryUser.department}</div>
                          )}
                        </td>
                        {/* memo1 ~ memo10 개별 컬럼들 */}
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => {
                          const field = `memo${num}`;
                          const memoValue = customer[field];
                          const isEditing = editingMemo[customer.id] !== undefined;
                          
                          return (
                            <td key={field} className="px-2 py-4 text-xs w-24">
                              {isEditing ? (
                                <div className="flex flex-col space-y-1">
                                  <Input
                                    value={editingMemo[customer.id]?.[field] || ''}
                                    onChange={(e) => updateMemoField(customer.id, field, e.target.value)}
                                    placeholder={`정보${num}`}
                                    className="text-xs h-6 w-20"
                                    data-testid={`input-${field}-${customer.id}`}
                                  />
                                  <div className="flex space-x-1">
                                    <Button 
                                      size="sm" 
                                      className="h-5 px-1 text-[10px] bg-green-500 hover:bg-green-600"
                                      onClick={() => handleMemoSave(customer.id)}
                                      data-testid={`button-save-${field}-${customer.id}`}
                                    >
                                      저장
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      className="h-5 px-1 text-[10px]"
                                      onClick={() => handleMemoCancel(customer.id)}
                                      data-testid={`button-cancel-${field}-${customer.id}`}
                                    >
                                      취소
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div 
                                  className="text-gray-600 max-w-20 truncate cursor-pointer hover:text-blue-600"
                                  title={memoValue || '클릭하여 편집'}
                                  onClick={() => handleMemoEdit(customer.id, customer)}
                                  data-testid={`text-${field}-${customer.id}`}
                                >
                                  {memoValue || (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {customer.createdAt ? format(new Date(customer.createdAt), 'yyyy-MM-dd', { locale: ko }) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Link href={`/customers/${customer.id}`}>
                            <Button variant="ghost" size="sm" className="text-primary-500 hover:text-primary-600 mr-3" title="상세보기" data-testid={`button-view-${customer.id}`}>
                              <i className="fas fa-eye"></i>
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-yellow-500 hover:text-yellow-600 mr-3" 
                            title="수정"
                            onClick={() => handleEditCustomer(customer)}
                            data-testid={`button-edit-${customer.id}`}
                          >
                            <i className="fas fa-edit"></i>
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-500 hover:text-red-600" 
                            title="삭제"
                            onClick={() => handleDeleteCustomer(customer.id)}
                            data-testid={`button-delete-${customer.id}`}
                          >
                            <i className="fas fa-trash"></i>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {(!customersData?.customers || customersData.customers.length === 0) && (
                    <tr>
                      <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                        검색 결과가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Mobile Card View */}
            <div className="lg:hidden">
              <div className="p-4 border-b">
                <Checkbox
                  checked={selectedCustomers.length === customersData?.customers?.length && customersData.customers.length > 0}
                  onCheckedChange={handleSelectAll}
                  data-testid="checkbox-select-all-mobile"
                />
                <span className="ml-2 text-sm text-gray-600">전체 선택</span>
              </div>
              
              <div className="space-y-4 p-4">
                {customersData?.customers?.map((customer, index) => {
                  const customerNumber = customersData.total - ((searchParams.page - 1) * searchParams.limit) - index;
                  return (
                    <div key={customer.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm" data-testid={`card-customer-${customer.id}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <Checkbox
                            checked={selectedCustomers.includes(customer.id)}
                            onCheckedChange={(checked) => handleSelectCustomer(customer.id, checked === true)}
                            data-testid={`checkbox-customer-mobile-${customer.id}`}
                          />
                          <span className="text-xs bg-gray-100 px-2 py-1 rounded">#{customerNumber}</span>
                        </div>
                        <div className="flex space-x-2">
                          <Link href={`/customers/${customer.id}`}>
                            <Button variant="ghost" size="sm" className="text-blue-500 hover:text-blue-600" title="상세보기">
                              <i className="fas fa-eye"></i>
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-yellow-500 hover:text-yellow-600" 
                            title="수정"
                            onClick={() => handleEditCustomer(customer)}
                          >
                            <i className="fas fa-edit"></i>
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-blue-500 hover:text-blue-600" 
                            title="ARS 발송"
                            onClick={() => {
                              sendSingleArsMutation.mutate({
                                customerId: customer.id,
                                sendNumber: "02-1234-5678", // 기본 발신번호
                                scenarioId: "marketing_consent"
                              });
                            }}
                            disabled={sendSingleArsMutation.isPending}
                          >
                            <i className="fas fa-phone"></i>
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-500 hover:text-red-600" 
                            title="삭제"
                            onClick={() => handleDeleteCustomer(customer.id)}
                          >
                            <i className="fas fa-trash"></i>
                          </Button>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div>
                          <Link href={`/customers/${customer.id}`}>
                            <div className="text-lg font-semibold text-blue-600 hover:text-blue-800 cursor-pointer">
                              {customer.name}
                            </div>
                          </Link>
                          <div className="text-sm text-gray-500">
                            {customer.gender === 'M' ? '남성' : customer.gender === 'F' ? '여성' : ''}{customer.birthDate && customer.gender !== 'N' ? ' • ' : ''}
                            {customer.birthDate && format(new Date(customer.birthDate), 'yyyy.MM.dd', { locale: ko })}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">연락처:</span>
                            <div className="font-medium">{customer.phone}</div>
                            {customer.secondaryPhone && (
                              <div className="text-gray-600">{customer.secondaryPhone}</div>
                            )}
                          </div>
                          <div>
                            <span className="text-gray-500">상태:</span>
                            <div className="font-medium">
                              <span className={`inline-flex px-2 py-1 text-xs rounded-full ${getStatusBadgeClass(customer.status || '')}`}>
                                {customer.status}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">담당자:</span>
                            <div className="font-medium">{customer.assignedUser?.name || '미지정'}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">공유담당자:</span>
                            <div className="font-medium">{customer.assignedUser?.name || '미지정'}</div>
                          </div>
                        </div>
                        
                        {getMemoSummary(customer) && (
                          <div className="text-sm">
                            <span className="text-gray-500">메모:</span>
                            <div className="text-gray-700 max-h-12 overflow-hidden">{getMemoSummary(customer)}</div>
                          </div>
                        )}
                        
                        <div className="text-xs text-gray-500 pt-2 border-t">
                          등록일: {customer.createdAt ? format(new Date(customer.createdAt), 'yyyy-MM-dd', { locale: ko }) : '-'}
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {(!customersData?.customers || customersData.customers.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    검색 결과가 없습니다.
                  </div>
                )}
              </div>
            </div>
            </div>
          )}
        </CardContent>

        {/* Pagination */}
        {customersData && customersData.totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {((searchParams.page - 1) * searchParams.limit) + 1}-{Math.min(searchParams.page * searchParams.limit, customersData.total)} of {customersData.total} results
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(searchParams.page - 1)}
                  disabled={searchParams.page <= 1}
                  data-testid="button-prev-page"
                >
                  <i className="fas fa-chevron-left"></i>
                </Button>
                {[...Array(Math.min(5, customersData.totalPages))].map((_, i) => {
                  const page = searchParams.page <= 3 ? i + 1 : searchParams.page - 2 + i;
                  if (page > customersData.totalPages) return null;
                  
                  return (
                    <Button
                      key={page}
                      variant={page === searchParams.page ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePageChange(page)}
                      className={page === searchParams.page ? "bg-primary-500 text-white" : ""}
                      data-testid={`button-page-${page}`}
                    >
                      {page}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(searchParams.page + 1)}
                  disabled={searchParams.page >= customersData.totalPages}
                  data-testid="button-next-page"
                >
                  <i className="fas fa-chevron-right"></i>
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Customer Modal */}
      <CustomerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        customer={editingCustomer}
        counselors={counselors || []}
      />

      {/* ARS Modal */}
      {showArsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">ARS 대량 발송</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowArsModal(false)}
                data-testid="button-close-ars-modal"
              >
                <i className="fas fa-times"></i>
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="sendNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  발신번호
                </label>
                <Input
                  id="sendNumber"
                  placeholder="02-1234-5678"
                  value={arsData.sendNumber}
                  onChange={(e) => setArsData(prev => ({ ...prev, sendNumber: e.target.value }))}
                  data-testid="input-ars-send-number"
                />
              </div>
              
              <div>
                <label htmlFor="scenario" className="block text-sm font-medium text-gray-700 mb-1">
                  시나리오
                </label>
                <Select
                  value={arsData.scenarioId}
                  onValueChange={(value) => setArsData(prev => ({ ...prev, scenarioId: value }))}
                >
                  <SelectTrigger data-testid="select-ars-scenario">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing_consent">마케팅 동의 확인</SelectItem>
                    <SelectItem value="consultation_reminder">상담 안내</SelectItem>
                    <SelectItem value="follow_up">후속 연락</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-blue-800">
                  <i className="fas fa-users mr-1"></i>
                  발송 대상: {selectedCustomers.length}명
                </p>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowArsModal(false)}
                  data-testid="button-cancel-ars"
                >
                  취소
                </Button>
                <Button
                  onClick={() => {
                    if (!arsData.sendNumber) {
                      toast({
                        title: "입력 오류",
                        description: "발신번호를 입력해주세요.",
                        variant: "destructive",
                      });
                      return;
                    }
                    sendBulkArsMutation.mutate({
                      customerIds: selectedCustomers,
                      sendNumber: arsData.sendNumber,
                      scenarioId: arsData.scenarioId,
                    });
                  }}
                  disabled={sendBulkArsMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-send-ars"
                >
                  {sendBulkArsMutation.isPending ? "발송 중..." : "ARS 발송"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
