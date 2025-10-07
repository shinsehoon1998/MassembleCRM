import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import CustomerModal from "@/components/CustomerModal";
import AppointmentModal from "@/components/AppointmentModal";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowUp, ArrowDown, UserX, UserCheck } from "lucide-react";
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
    sortOrder: "desc" as "asc" | "desc",  // 번호 정렬 순서 (desc: 최신순, asc: 오래된순)
  });
  
  // 검색어 입력을 위한 별도 상태 (디바운싱용)
  const [searchInput, setSearchInput] = useState("");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithUser | null>(null);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [appointmentCustomer, setAppointmentCustomer] = useState<CustomerWithUser | null>(null);
  const [editingMemo, setEditingMemo] = useState<{ [key: string]: { [field: string]: string } }>({});
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [showArsModal, setShowArsModal] = useState(false);
  const [showBatchAppointmentModal, setShowBatchAppointmentModal] = useState(false);
  const [showAllocationModal, setShowAllocationModal] = useState(false);
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [allocationData, setAllocationData] = useState({
    targetUserId: "",
    note: ""
  });
  const [batchAppointmentData, setBatchAppointmentData] = useState({
    appointmentDate: "",
    appointmentTime: "",
    counselorId: "",
    consultationType: "",
    notes: ""
  });
  const [arsData, setArsData] = useState({
    sendNumber: "",
    scenarioId: "marketing_consent",
  });

  // 컬럼 크기 조정을 위한 상태
  const defaultColumnWidths = {
    checkbox: 60,
    number: 80,
    customerInfo: 150,
    contact: 120,
    status: 100,
    assignedUser: 120,
    secondaryUser: 120,
    memo: 150,
    info1: 100,
    info2: 100,
    info3: 100,
    info4: 100,
    info5: 100,
    info6: 100,
    info7: 100,
    info8: 100,
    info9: 100,
    info10: 100,
    registeredAt: 120,
    actions: 100
  };

  const [columnWidths, setColumnWidths] = useState(() => {
    const saved = localStorage.getItem('customer-table-column-widths');
    return saved ? { ...defaultColumnWidths, ...JSON.parse(saved) } : defaultColumnWidths;
  });

  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 디바운싱된 검색어 처리
  const debouncedSearchParams = useMemo(() => {
    const timeoutId = setTimeout(() => {
      if (searchInput !== searchParams.search) {
        setSearchParams(prev => ({ 
          ...prev, 
          search: searchInput,
          page: 1  // 검색어 변경시 자동으로 첫 페이지로
        }));
      }
    }, 500); // 500ms 디바운싱

    return () => clearTimeout(timeoutId);
  }, [searchInput, searchParams.search]);

  // 컴포넌트가 언마운트될 때 타이머 정리
  useEffect(() => {
    return debouncedSearchParams;
  }, [debouncedSearchParams]);

  const { data: customersData, isLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/customers", searchParams],
  });

  const { data: counselors } = useQuery<User[]>({
    queryKey: ["/api/users/counselors"],
  });

  const { data: systemSettings = [] } = useQuery<any[]>({
    queryKey: ['/api/system-settings'],
  });

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  // 팀원 목록 가져오기 (팀장인 경우)
  const { data: teamMembers } = useQuery<User[]>({
    queryKey: ['/api/user-relationships/manager', currentUser?.id],
    enabled: !!currentUser?.id && (currentUser?.role === 'manager' || currentUser?.role === 'admin'),
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

  const batchAppointmentMutation = useMutation({
    mutationFn: async (data: { 
      customerIds: string[], 
      appointmentDate: string,
      appointmentTime: string,
      counselorId: string,
      consultationType: string,
      notes?: string
    }) => {
      const response = await apiRequest("POST", "/api/appointments/batch", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setSelectedCustomers([]);
      setShowBatchActions(false);
      setShowBatchAppointmentModal(false);
      toast({
        title: "일괄 예약 생성 성공",
        description: `${selectedCustomers.length}명의 고객에 대한 예약이 생성되었습니다.`,
      });
    },
    onError: (error) => {
      toast({
        title: "일괄 예약 생성 실패",
        description: error.message || "예약 생성에 실패했습니다. 다시 시도해주세요.",
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

  // 고객 배분 mutation (팀장 → 팀원)
  const allocateCustomersMutation = useMutation({
    mutationFn: async ({ customerIds, toUserId, note }: { customerIds: string[], toUserId: string, note?: string }) => {
      const response = await apiRequest("POST", "/api/customers/allocate", { customerIds, toUserId, note });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setSelectedCustomers([]);
      setShowAllocationModal(false);
      setAllocationData({ targetUserId: "", note: "" });
      
      let description = data.message || `${data.success}명의 고객이 배분되었습니다.`;
      if (data.failureReasons && data.failureReasons.length > 0) {
        description += '\n\n실패 상세:\n' + data.failureReasons.join('\n');
      }
      
      toast({
        title: data.failed > 0 ? "배분 일부 완료" : "배분 완료",
        description,
        variant: data.failed > 0 && data.success === 0 ? "destructive" : "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: "배분 실패",
        description: error.message || "고객 배분에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  // 고객 회수 mutation (팀원 → 팀장)
  const recallCustomersMutation = useMutation({
    mutationFn: async ({ customerIds, fromUserId, note }: { customerIds: string[], fromUserId: string, note?: string }) => {
      const response = await apiRequest("POST", "/api/customers/recall", { customerIds, fromUserId, note });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setSelectedCustomers([]);
      setShowRecallModal(false);
      setAllocationData({ targetUserId: "", note: "" });
      toast({
        title: "회수 완료",
        description: `${data.success}명의 고객이 회수되었습니다.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "회수 실패",
        description: error.message || "고객 회수에 실패했습니다.",
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
    // 즉시 검색 실행 (디바운싱 무시)
    setSearchParams(prev => ({ 
      ...prev, 
      search: searchInput,
      page: 1 
    }));
  };

  // 필터 변경시 자동으로 첫 페이지로 리셋
  const handleFilterChange = (key: string, value: any) => {
    setSearchParams(prev => ({ 
      ...prev, 
      [key]: value,
      page: 1  // 필터 변경시 항상 첫 페이지로
    }));
  };

  const handlePageChange = (page: number) => {
    setSearchParams(prev => ({ ...prev, page }));
  };

  // 정렬 순서 토글
  const toggleSortOrder = () => {
    setSearchParams(prev => ({
      ...prev,
      sortOrder: prev.sortOrder === "desc" ? "asc" : "desc",
      page: 1  // 정렬 변경 시 첫 페이지로
    }));
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

  const handleScheduleAppointment = (customer: CustomerWithUser) => {
    setAppointmentCustomer(customer);
    setIsAppointmentModalOpen(true);
  };

  const handleBatchAppointment = () => {
    setBatchAppointmentData({
      appointmentDate: "",
      appointmentTime: "",
      counselorId: currentUser?.role === 'admin' ? "" : currentUser?.id || "",
      consultationType: "",
      notes: ""
    });
    setShowBatchAppointmentModal(true);
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
    };
    setEditingMemo({ ...editingMemo, [customerId]: currentMemos });
  };

  // 컬럼 크기 조정 관련 함수들
  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startWidth = columnWidths[columnKey as keyof typeof columnWidths];
    
    setIsResizing(columnKey);
    
    // 커서 스타일 변경 및 텍스트 선택 방지
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startX;
      const newWidth = Math.max(50, startWidth + diff); // 최소 너비 50px
      
      setColumnWidths((prev: typeof defaultColumnWidths) => ({
        ...prev,
        [columnKey]: newWidth
      }));
    };
    
    const handleMouseUp = () => {
      setIsResizing(null);
      
      // localStorage에 저장
      setColumnWidths((currentWidths: typeof defaultColumnWidths) => {
        localStorage.setItem('customer-table-column-widths', JSON.stringify(currentWidths));
        return currentWidths;
      });
      
      // 이벤트 리스너 제거
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // 스타일 복원
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    
    // 이벤트 리스너 추가
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const resetColumnWidths = () => {
    setColumnWidths(defaultColumnWidths);
    localStorage.removeItem('customer-table-column-widths');
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

  // memo1 표시하는 함수
  const getMemoSummary = (customer: CustomerWithUser) => {
    return customer.memo1 && customer.memo1.trim() ? customer.memo1 : null;
  };

  // info1~info10 중 값이 있는 것들을 요약해서 표시하는 함수
  const getInfoSummary = (customer: CustomerWithUser) => {
    const infos = [
      customer.info1, customer.info2, customer.info3, customer.info4, customer.info5,
      customer.info6, customer.info7, customer.info8, customer.info9, customer.info10
    ].filter(info => info && info.trim());
    
    if (infos.length === 0) return null;
    if (infos.length === 1) return infos[0];
    return `${infos[0]} (+${infos.length - 1}개 더)`;
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
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
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
                  onValueChange={(value) => handleFilterChange('status', value)}
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
              {/* 관리자와 매니저만 담당자 필터 표시, 팀원은 숨김 */}
              {currentUser?.role !== 'counselor' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">담당자</label>
                  <Select
                    value={searchParams.assignedUserId}
                    onValueChange={(value) => handleFilterChange('assignedUserId', value)}
                  >
                    <SelectTrigger data-testid="select-counselor">
                      <SelectValue placeholder="전체 담당자" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 담당자</SelectItem>
                      {counselors?.map(counselor => (
                        <SelectItem key={counselor.id} value={counselor.id}>
                          {counselor.username} ({counselor.lastName} {counselor.firstName})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            
            {/* 담당자 미정/공유 미정 체크박스 */}
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="unassigned"
                  checked={searchParams.unassigned}
                  onCheckedChange={(checked) => handleFilterChange('unassigned', checked)}
                  data-testid="checkbox-unassigned"
                />
                <label htmlFor="unassigned" className="text-sm text-gray-700">담당자 미정</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="unshared"
                  checked={searchParams.unshared}
                  onCheckedChange={(checked) => handleFilterChange('unshared', checked)}
                  data-testid="checkbox-unshared"
                />
                <label htmlFor="unshared" className="text-sm text-gray-700">공유 미정</label>
              </div>
            </div>

            {/* Action Buttons - Stack on Mobile */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleSearch} className="bg-massemble-red hover:bg-massemble-red-hover text-white" data-testid="button-search">
                <i className="fas fa-search mr-2"></i>즉시 검색
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
              <Button 
                onClick={() => {
                  setSearchInput("");
                  setSearchParams({
                    search: "",
                    status: "",
                    assignedUserId: "",
                    unassigned: false,
                    unshared: false,
                    page: 1,
                    limit: 20,
                    sortOrder: "desc",
                  });
                }}
                variant="outline" 
                className="text-gray-600 hover:text-gray-800"
                data-testid="button-reset-filters"
              >
                <i className="fas fa-undo mr-2"></i>초기화
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
                
                {/* 관리자/상담원만 담당자 변경 및 공유 담당자 기능 사용 */}
                {currentUser?.role !== 'manager' && (
                  <>
                    <Select onValueChange={(assignedUserId) => handleBatchUpdate({ assignedUserId })}>
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="담당자 변경" />
                      </SelectTrigger>
                      <SelectContent>
                        {counselors?.map((counselor) => (
                          <SelectItem key={counselor.id} value={counselor.id}>{counselor.username} ({counselor.lastName} {counselor.firstName})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select onValueChange={(secondaryUserId) => handleBatchUpdate({ secondaryUserId })}>
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="공유 담당자" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLEAR">공유 해제</SelectItem>
                        {counselors?.map((counselor) => (
                          <SelectItem key={counselor.id} value={counselor.id}>{counselor.username} ({counselor.lastName} {counselor.firstName})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                
                {/* 팀장 권한인 경우 재분배/회수 버튼 표시 */}
                {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && teamMembers && teamMembers.length > 0 && (
                  <>
                    <Button
                      onClick={() => {
                        if (selectedCustomers.length === 0) {
                          toast({
                            title: "선택 필요",
                            description: "배분할 고객을 먼저 선택해주세요.",
                            variant: "destructive",
                          });
                          return;
                        }
                        setShowAllocationModal(true);
                      }}
                      variant="outline"
                      size="sm"
                      className="bg-purple-600 text-white hover:bg-purple-700"
                      disabled={selectedCustomers.length === 0}
                      data-testid="button-allocate-customers"
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      팀원 배분
                    </Button>
                    <Button
                      onClick={() => {
                        if (selectedCustomers.length === 0) {
                          toast({
                            title: "선택 필요",
                            description: "회수할 고객을 먼저 선택해주세요.",
                            variant: "destructive",
                          });
                          return;
                        }
                        setShowRecallModal(true);
                      }}
                      variant="outline"
                      size="sm"
                      className="bg-orange-600 text-white hover:bg-orange-700"
                      disabled={selectedCustomers.length === 0}
                      data-testid="button-recall-customers"
                    >
                      <UserX className="h-4 w-4 mr-1" />
                      고객 회수
                    </Button>
                  </>
                )}
                <Button
                  onClick={handleBatchAppointment}
                  variant="outline"
                  size="sm"
                  className="bg-green-600 text-white hover:bg-green-700"
                  data-testid="button-batch-appointment"
                >
                  <i className="fas fa-calendar mr-1"></i>일괄 예약
                </Button>
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
                  onValueChange={(value) => handleFilterChange('limit', parseInt(value))}
                  data-testid="select-page-size"
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20개</SelectItem>
                    <SelectItem value="50">50개</SelectItem>
                    <SelectItem value="100">100개</SelectItem>
                    <SelectItem value="500">500개</SelectItem>
                    <SelectItem value="1000">1000개</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-gray-500">씩 보기</span>
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
                {/* 컬럼 크기 리셋 버튼 */}
                <div className="mb-2 flex justify-end">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={resetColumnWidths}
                    className="text-xs"
                  >
                    컬럼 크기 초기화
                  </Button>
                </div>
                
              <table className="w-full" style={{ tableLayout: 'fixed' }}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="relative px-6 py-3 text-left" style={{ width: `${columnWidths.checkbox}px` }}>
                      <Checkbox
                        checked={selectedCustomers.length === customersData?.customers?.length && customersData.customers.length > 0}
                        onCheckedChange={handleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => {
                          console.log('Resize started for checkbox column');
                          handleResizeStart(e, 'checkbox');
                        }}
                        title="드래그하여 컬럼 크기 조정"
                        style={{ background: isResizing === 'checkbox' ? '#3b82f6' : 'transparent' }}
                      />
                    </th>
                    <th className="relative px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.number}px` }}>
                      <div className="flex items-center gap-1 cursor-pointer select-none" onClick={toggleSortOrder}>
                        <span>번호</span>
                        {searchParams.sortOrder === "desc" ? (
                          <ArrowDown className="w-4 h-4" />
                        ) : (
                          <ArrowUp className="w-4 h-4" />
                        )}
                      </div>
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => {
                          console.log('Resize started for number column');
                          handleResizeStart(e, 'number');
                        }}
                        title="드래그하여 컬럼 크기 조정"
                        style={{ background: isResizing === 'number' ? '#3b82f6' : 'transparent' }}
                      />
                    </th>
                    <th className="relative px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.customerInfo}px` }}>
                      고객정보
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => {
                          console.log('Resize started for customerInfo column');
                          handleResizeStart(e, 'customerInfo');
                        }}
                        title="드래그하여 컬럼 크기 조정"
                        style={{ background: isResizing === 'customerInfo' ? '#3b82f6' : 'transparent' }}
                      />
                    </th>
                    <th className="relative px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.contact}px` }}>
                      연락처
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'contact')}
                      />
                    </th>
                    <th className="relative px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.status}px` }}>
                      상태
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'status')}
                      />
                    </th>
                    <th className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.memo}px` }}>
                      메모
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'memo')}
                      />
                    </th>
                    <th className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.info1}px` }}>
                      정보1
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'info1')}
                      />
                    </th>
                    <th className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.info2}px` }}>
                      정보2
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'info2')}
                      />
                    </th>
                    <th className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.info3}px` }}>
                      정보3
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'info3')}
                      />
                    </th>
                    <th className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.info4}px` }}>
                      정보4
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'info4')}
                      />
                    </th>
                    <th className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.info5}px` }}>
                      정보5
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'info5')}
                      />
                    </th>
                    <th className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.info6}px` }}>
                      정보6
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'info6')}
                      />
                    </th>
                    <th className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.info7}px` }}>
                      정보7
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'info7')}
                      />
                    </th>
                    <th className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.info8}px` }}>
                      정보8
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'info8')}
                      />
                    </th>
                    <th className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.info9}px` }}>
                      정보9
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'info9')}
                      />
                    </th>
                    <th className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.info10}px` }}>
                      정보10
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'info10')}
                      />
                    </th>
                    <th className="relative px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.assignedUser}px` }}>
                      담당자
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'assignedUser')}
                      />
                    </th>
                    <th className="relative px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.secondaryUser}px` }}>
                      공유담당자
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'secondaryUser')}
                      />
                    </th>
                    <th className="relative px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.registeredAt}px` }}>
                      등록일
                      <div 
                        className="absolute -right-1 top-0 w-4 h-full cursor-col-resize hover:bg-blue-400 bg-transparent transition-colors z-10"
                        onMouseDown={(e) => handleResizeStart(e, 'registeredAt')}
                      />
                    </th>
                    <th className="relative px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: `${columnWidths.actions}px` }}>
                      액션
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customersData?.customers?.map((customer, index) => {
                    const customerNumber = searchParams.sortOrder === 'asc' 
                      ? ((searchParams.page - 1) * searchParams.limit) + index + 1
                      : customersData.total - ((searchParams.page - 1) * searchParams.limit) - index;
                    return (
                      <tr key={customer.id} className="hover:bg-gray-50" data-testid={`row-customer-${customer.id}`}>
                        <td className="px-6 py-4 whitespace-nowrap" style={{ width: `${columnWidths.checkbox}px` }}>
                          <Checkbox
                            checked={selectedCustomers.includes(customer.id)}
                            onCheckedChange={(checked) => handleSelectCustomer(customer.id, checked === true)}
                            data-testid={`checkbox-customer-${customer.id}`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" style={{ width: `${columnWidths.number}px` }}>
                          {customerNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" style={{ width: `${columnWidths.customerInfo}px` }}>
                          <div className="overflow-hidden">
                            <Link href={`/customers/${customer.id}`}>
                              <div className="text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer truncate" data-testid="text-customer-name" title={customer.name}>
                                {customer.name}
                              </div>
                            </Link>
                            <div className="text-sm text-gray-500 truncate" title={`${customer.gender === 'M' ? '남' : customer.gender === 'F' ? '여' : ''}${customer.birthDate && customer.gender !== 'N' ? ', ' : ''}${customer.birthDate ? format(new Date(customer.birthDate), 'yyyy.MM.dd', { locale: ko }) : ''}`}>
                              {customer.gender === 'M' ? '남' : customer.gender === 'F' ? '여' : ''}{customer.birthDate && customer.gender !== 'N' ? ', ' : ''}
                              {customer.birthDate && format(new Date(customer.birthDate), 'yyyy.MM.dd', { locale: ko })}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" style={{ width: `${columnWidths.contact}px` }}>
                          <div className="overflow-hidden">
                            <div className="text-sm text-gray-900 truncate" title={customer.phone}>{customer.phone}</div>
                            {customer.secondaryPhone && (
                              <div className="text-sm text-gray-500 truncate" title={customer.secondaryPhone}>{customer.secondaryPhone}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" style={{ width: `${columnWidths.status}px` }}>
                          <div className="overflow-hidden">
                            <Select
                              value={customer.status}
                              onValueChange={(status) => handleStatusChange(customer.id, status)}
                            >
                              <SelectTrigger className="w-full h-7 text-xs">
                                <Badge className={`${getStatusBadgeClass(customer.status)} text-xs font-semibold border-0 truncate`}>
                                  {customer.status}
                                </Badge>
                              </SelectTrigger>
                              <SelectContent>
                                {statusOptions.map((status: string) => (
                                  <SelectItem key={status} value={status}>{status}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </td>
                        {/* memo1 컬럼 */}
                        <td className="px-2 py-4 text-xs" style={{ width: `${columnWidths.memo}px` }}>
                          <div className="overflow-hidden">
                            {editingMemo[customer.id] !== undefined ? (
                              <div className="flex flex-col space-y-1">
                                <Input
                                  value={editingMemo[customer.id]?.memo1 || ''}
                                  onChange={(e) => updateMemoField(customer.id, 'memo1', e.target.value)}
                                  placeholder="메모"
                                  className="text-xs h-6 w-full"
                                  data-testid={`input-memo1-${customer.id}`}
                                />
                                <div className="flex space-x-1">
                                  <Button 
                                    size="sm" 
                                    className="h-5 px-1 text-[10px] bg-green-500 hover:bg-green-600"
                                    onClick={() => handleMemoSave(customer.id)}
                                    data-testid={`button-save-memo1-${customer.id}`}
                                  >
                                    저장
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    className="h-5 px-1 text-[10px]"
                                    onClick={() => handleMemoCancel(customer.id)}
                                    data-testid={`button-cancel-memo1-${customer.id}`}
                                  >
                                    취소
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div 
                                className="text-gray-600 truncate cursor-pointer hover:text-blue-600"
                                title={customer.memo1 || '클릭하여 편집'}
                                onClick={() => handleMemoEdit(customer.id, customer)}
                                data-testid={`text-memo1-${customer.id}`}
                              >
                                {customer.memo1 || (
                                  <span className="text-gray-300">-</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        
                        {/* info1 ~ info10 읽기전용 컬럼들 */}
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => {
                          const field = `info${num}` as keyof CustomerWithUser;
                          const infoValue = customer[field] as string | null;
                          const infoLabels = ['정보1', '정보2', '정보3', '정보4', '정보5', '정보6', '정보7', '정보8', '정보9', '정보10'];
                          
                          return (
                            <td key={field} className="px-2 py-4 text-xs" style={{ width: `${columnWidths[field as keyof typeof columnWidths]}px` }}>
                              <div className="overflow-hidden">
                                <div 
                                  className="text-gray-600 truncate"
                                  title={infoValue ? `${infoLabels[num-1]}: ${infoValue}` : '-'}
                                  data-testid={`text-${field}-${customer.id}`}
                                >
                                  {infoValue || (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                        
                        {/* 담당자 컬럼 */}
                        <td className="px-6 py-4 whitespace-nowrap" style={{ width: `${columnWidths.assignedUser}px` }}>
                          <div className="overflow-hidden">
                            <div className="text-sm text-gray-900 truncate" title={customer.assignedUser?.name || '-'}>{customer.assignedUser?.name || '-'}</div>
                            {customer.assignedUser?.department && (
                              <div className="text-sm text-gray-500 truncate" title={customer.assignedUser.department}>{customer.assignedUser.department}</div>
                            )}
                          </div>
                        </td>
                        
                        {/* 공유담당자 컬럼 */}
                        <td className="px-6 py-4 whitespace-nowrap" style={{ width: `${columnWidths.secondaryUser}px` }}>
                          <div className="overflow-hidden">
                            <div className="text-sm text-gray-900 truncate" title={customer.secondaryUser?.name || '-'}>{customer.secondaryUser?.name || '-'}</div>
                            {customer.secondaryUser?.department && (
                              <div className="text-sm text-gray-500 truncate" title={customer.secondaryUser.department}>{customer.secondaryUser.department}</div>
                            )}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" style={{ width: `${columnWidths.registeredAt}px` }}>
                          <div className="overflow-hidden">
                            <div className="truncate" title={customer.createdAt ? format(new Date(customer.createdAt), 'yyyy-MM-dd', { locale: ko }) : '-'}>
                              {customer.createdAt ? format(new Date(customer.createdAt), 'yyyy-MM-dd', { locale: ko }) : '-'}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" style={{ width: `${columnWidths.actions}px` }}>
                          <Link href={`/customers/${customer.id}`}>
                            <Button variant="ghost" size="sm" className="text-primary-500 hover:text-primary-600 mr-3" title="상세보기" data-testid={`button-view-${customer.id}`}>
                              <i className="fas fa-eye"></i>
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-blue-500 hover:text-blue-600 mr-3" 
                            title="예약"
                            onClick={() => handleScheduleAppointment(customer)}
                            data-testid={`button-schedule-${customer.id}`}
                          >
                            <i className="fas fa-calendar"></i>
                          </Button>
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
                  const customerNumber = searchParams.sortOrder === 'asc' 
                    ? ((searchParams.page - 1) * searchParams.limit) + index + 1
                    : customersData.total - ((searchParams.page - 1) * searchParams.limit) - index;
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
                            className="text-green-500 hover:text-green-600" 
                            title="예약"
                            onClick={() => handleScheduleAppointment(customer)}
                            data-testid={`button-schedule-mobile-${customer.id}`}
                          >
                            <i className="fas fa-calendar"></i>
                          </Button>
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
                        
                        {/* 메모 표시 */}
                        {customer.memo1 && (
                          <div className="text-sm">
                            <span className="text-gray-500 font-medium">메모:</span>
                            <div className="text-xs bg-yellow-50 p-2 rounded mt-1">
                              <div className="text-gray-700">{customer.memo1}</div>
                            </div>
                          </div>
                        )}

                        {/* 설문조사 정보 표시 */}
                        <div className="text-sm">
                          <span className="text-gray-500 font-medium">설문조사 정보:</span>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => {
                              const field = `info${num}` as keyof CustomerWithUser;
                              const infoValue = customer[field] as string | null;
                              const infoLabels = ['정보1', '정보2', '정보3', '정보4', '정보5', '정보6', '정보7', '정보8', '정보9', '정보10'];
                              if (!infoValue) return null;
                              
                              return (
                                <div key={field} className="text-xs bg-blue-50 p-1 rounded">
                                  <span className="font-medium text-blue-600">{infoLabels[num-1]}:</span>
                                  <div className="text-gray-700 truncate">{infoValue}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        
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

      {/* Customer Edit Modal */}
      <CustomerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        customer={editingCustomer}
        counselors={counselors || []}
      />

      {/* Appointment Modal */}
      <AppointmentModal
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        customerId={appointmentCustomer?.id || ""}
        customerName={appointmentCustomer?.name}
        counselors={counselors || []}
      />

      {/* Batch Appointment Modal */}
      <Dialog open={showBatchAppointmentModal} onOpenChange={setShowBatchAppointmentModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <i className="fas fa-calendar text-green-600"></i>
              <span>일괄 예약 생성</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm text-green-800">
                <i className="fas fa-users mr-1"></i>
                선택된 고객: {selectedCustomers.length}명
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {customersData?.customers
                  .filter(customer => selectedCustomers.includes(customer.id))
                  .slice(0, 5)
                  .map(customer => (
                    <Badge key={customer.id} variant="secondary" className="text-xs">
                      {customer.name}
                    </Badge>
                  ))}
                {selectedCustomers.length > 5 && (
                  <Badge variant="secondary" className="text-xs">
                    +{selectedCustomers.length - 5}명 더
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="appointment-date">예약 날짜</Label>
                <Input
                  id="appointment-date"
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={batchAppointmentData.appointmentDate}
                  onChange={(e) => setBatchAppointmentData(prev => ({ ...prev, appointmentDate: e.target.value }))}
                  data-testid="input-batch-appointment-date"
                />
              </div>
              <div>
                <Label htmlFor="appointment-time">예약 시간</Label>
                <Input
                  id="appointment-time"
                  type="time"
                  value={batchAppointmentData.appointmentTime}
                  onChange={(e) => setBatchAppointmentData(prev => ({ ...prev, appointmentTime: e.target.value }))}
                  data-testid="input-batch-appointment-time"
                />
              </div>
            </div>

            {currentUser?.role === 'admin' && (
              <div>
                <Label htmlFor="counselor-select">담당 상담사</Label>
                <Select 
                  value={batchAppointmentData.counselorId}
                  onValueChange={(value) => setBatchAppointmentData(prev => ({ ...prev, counselorId: value }))}
                  data-testid="select-batch-counselor"
                >
                  <SelectTrigger>
                    <SelectValue placeholder="담당 상담사를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {counselors?.map((counselor) => (
                      <SelectItem key={counselor.id} value={counselor.id}>
                        {counselor.username} ({counselor.lastName} {counselor.firstName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="consultation-type">상담 유형</Label>
              <Select 
                value={batchAppointmentData.consultationType}
                onValueChange={(value) => setBatchAppointmentData(prev => ({ ...prev, consultationType: value }))}
                data-testid="select-batch-consultation-type"
              >
                <SelectTrigger>
                  <SelectValue placeholder="상담 유형을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="전화상담">전화상담</SelectItem>
                  <SelectItem value="방문상담">방문상담</SelectItem>
                  <SelectItem value="온라인상담">온라인상담</SelectItem>
                  <SelectItem value="화상상담">화상상담</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="appointment-notes">메모 (선택사항)</Label>
              <Textarea
                placeholder="예약에 대한 추가 메모를 입력하세요..."
                rows={3}
                value={batchAppointmentData.notes}
                onChange={(e) => setBatchAppointmentData(prev => ({ ...prev, notes: e.target.value }))}
                data-testid="textarea-batch-appointment-notes"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowBatchAppointmentModal(false)}
                data-testid="button-cancel-batch-appointment"
              >
                취소
              </Button>
              <Button
                onClick={() => {
                  if (!batchAppointmentData.appointmentDate || !batchAppointmentData.appointmentTime) {
                    toast({
                      title: "입력 오류",
                      description: "예약 날짜와 시간을 모두 입력해주세요.",
                      variant: "destructive",
                    });
                    return;
                  }

                  if (!batchAppointmentData.counselorId) {
                    toast({
                      title: "입력 오류",
                      description: currentUser?.role === 'admin' ? "담당 상담사를 선택해주세요." : "사용자 정보를 확인할 수 없습니다.",
                      variant: "destructive",
                    });
                    return;
                  }

                  if (!batchAppointmentData.consultationType) {
                    toast({
                      title: "입력 오류",
                      description: "상담 유형을 선택해주세요.",
                      variant: "destructive",
                    });
                    return;
                  }

                  batchAppointmentMutation.mutate({
                    customerIds: selectedCustomers,
                    appointmentDate: batchAppointmentData.appointmentDate,
                    appointmentTime: batchAppointmentData.appointmentTime,
                    counselorId: batchAppointmentData.counselorId,
                    consultationType: batchAppointmentData.consultationType,
                    notes: batchAppointmentData.notes
                  });
                }}
                disabled={batchAppointmentMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-create-batch-appointment"
              >
                {batchAppointmentMutation.isPending ? "생성 중..." : "예약 생성"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 고객 배분 모달 (팀장 → 팀원) */}
      <Dialog open={showAllocationModal} onOpenChange={setShowAllocationModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>고객 팀원 배분</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-purple-50 p-3 rounded-lg">
              <p className="text-sm text-purple-800">
                <UserCheck className="inline-block h-4 w-4 mr-1" />
                선택된 고객: {selectedCustomers.length}명
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {customersData?.customers
                  .filter(customer => selectedCustomers.includes(customer.id))
                  .slice(0, 5)
                  .map(customer => (
                    <Badge key={customer.id} variant="secondary" className="text-xs">
                      {customer.name}
                    </Badge>
                  ))}
                {selectedCustomers.length > 5 && (
                  <Badge variant="secondary" className="text-xs">
                    +{selectedCustomers.length - 5}명 더
                  </Badge>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="target-team-member">배분 대상 팀원</Label>
              <Select
                value={allocationData.targetUserId}
                onValueChange={(value) => setAllocationData(prev => ({ ...prev, targetUserId: value }))}
              >
                <SelectTrigger data-testid="select-target-team-member">
                  <SelectValue placeholder="팀원을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers?.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name} ({member.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="allocation-note">메모 (선택사항)</Label>
              <Textarea
                placeholder="배분 사유나 메모를 입력하세요..."
                value={allocationData.note}
                onChange={(e) => setAllocationData(prev => ({ ...prev, note: e.target.value }))}
                rows={3}
                data-testid="textarea-allocation-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAllocationModal(false)}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (selectedCustomers.length === 0) {
                  toast({
                    title: "오류",
                    description: "배분할 고객을 선택해주세요.",
                    variant: "destructive",
                  });
                  return;
                }
                if (!allocationData.targetUserId) {
                  toast({
                    title: "오류",
                    description: "배분 대상 팀원을 선택해주세요.",
                    variant: "destructive",
                  });
                  return;
                }
                allocateCustomersMutation.mutate({
                  customerIds: selectedCustomers,
                  toUserId: allocationData.targetUserId,
                  note: allocationData.note,
                });
              }}
              disabled={allocateCustomersMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="button-confirm-allocation"
            >
              {allocateCustomersMutation.isPending ? "배분 중..." : "배분하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 고객 회수 모달 (팀원 → 팀장) */}
      <Dialog open={showRecallModal} onOpenChange={setShowRecallModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>고객 회수</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-orange-50 p-3 rounded-lg">
              <p className="text-sm text-orange-800">
                <UserX className="inline-block h-4 w-4 mr-1" />
                선택된 고객: {selectedCustomers.length}명
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {customersData?.customers
                  .filter(customer => selectedCustomers.includes(customer.id))
                  .slice(0, 5)
                  .map(customer => (
                    <Badge key={customer.id} variant="secondary" className="text-xs">
                      {customer.name} 
                      {customer.assignedUser && (
                        <span className="ml-1 text-gray-500">
                          ({customer.assignedUser.name})
                        </span>
                      )}
                    </Badge>
                  ))}
                {selectedCustomers.length > 5 && (
                  <Badge variant="secondary" className="text-xs">
                    +{selectedCustomers.length - 5}명 더
                  </Badge>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="recall-from-member">회수 대상 팀원</Label>
              <Select
                value={allocationData.targetUserId}
                onValueChange={(value) => setAllocationData(prev => ({ ...prev, targetUserId: value }))}
              >
                <SelectTrigger data-testid="select-recall-from-member">
                  <SelectValue placeholder="회수할 팀원을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers?.map((member) => {
                    const memberCustomerCount = customersData?.customers
                      .filter(c => selectedCustomers.includes(c.id) && c.assignedUserId === member.id)
                      .length || 0;
                    return (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} ({member.username}) - {memberCustomerCount}명
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="recall-note">메모 (선택사항)</Label>
              <Textarea
                placeholder="회수 사유나 메모를 입력하세요..."
                value={allocationData.note}
                onChange={(e) => setAllocationData(prev => ({ ...prev, note: e.target.value }))}
                rows={3}
                data-testid="textarea-recall-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecallModal(false)}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (selectedCustomers.length === 0) {
                  toast({
                    title: "오류",
                    description: "회수할 고객을 선택해주세요.",
                    variant: "destructive",
                  });
                  return;
                }
                if (!allocationData.targetUserId) {
                  toast({
                    title: "오류",
                    description: "회수 대상 팀원을 선택해주세요.",
                    variant: "destructive",
                  });
                  return;
                }
                recallCustomersMutation.mutate({
                  customerIds: selectedCustomers,
                  fromUserId: allocationData.targetUserId,
                  note: allocationData.note,
                });
              }}
              disabled={recallCustomersMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-confirm-recall"
            >
              {recallCustomersMutation.isPending ? "회수 중..." : "회수하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
