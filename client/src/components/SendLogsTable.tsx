import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  Phone,
  Clock,
  DollarSign,
  FileText,
  MoreHorizontal
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { CampaignFiltersValue } from "./CampaignFilters";

// 통화 결과 라벨 및 색상
const CALL_RESULT_CONFIG = {
  'connected': { label: '연결', color: 'bg-blue-500' },
  'answered': { label: '응답', color: 'bg-green-500' },
  'busy': { label: '통화중', color: 'bg-yellow-500' },
  'no_answer': { label: '무응답', color: 'bg-gray-500' },
  'voicemail': { label: '사서함', color: 'bg-purple-500' },
  'rejected': { label: '거절', color: 'bg-red-500' },
  'invalid_number': { label: '결번', color: 'bg-orange-500' },
  'fax': { label: '팩스', color: 'bg-indigo-500' },
  'other': { label: '기타', color: 'bg-gray-400' },
  'power_off': { label: '전원오프', color: 'bg-gray-600' },
  'auto_response': { label: '자동응답', color: 'bg-cyan-500' },
  'error': { label: '오류', color: 'bg-red-600' },
  'pending': { label: '대기중', color: 'bg-blue-400' },
  'processing': { label: '처리중', color: 'bg-yellow-600' }
};

// 재발송 유형 라벨
const RETRY_TYPE_LABELS = {
  'initial': '최초',
  'retry': '재발송',
  'repeat': '반복'
};

// 발송 로그 데이터 타입
interface SendLog {
  id: number;
  campaignId: number;
  campaignName: string;
  customerId: string;
  customerName: string;
  phone: string;
  callResult: string;
  retryType: string;
  retryAttempt: number;
  duration: number;
  cost: number;
  dtmfInput?: string;
  errorMessage?: string;
  sentAt: string;
  answeredAt?: string;
  completedAt?: string;
  createdAt: string;
}

interface SendLogsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SendLogsTableProps {
  filters: CampaignFiltersValue;
  className?: string;
}

// 정렬 타입
type SortField = 'createdAt' | 'sentAt' | 'duration' | 'cost' | 'customerName' | 'phoneNumber';
type SortOrder = 'asc' | 'desc';

export default function SendLogsTable({ 
  filters, 
  className = "" 
}: SendLogsTableProps) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState<SortField>('sentAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedLog, setSelectedLog] = useState<SendLog | null>(null);

  // 권한 확인
  const canViewPersonalInfo = user?.role === 'admin';
  const canViewAdvanced = user?.role === 'admin' || user?.role === 'manager';

  // 유효한 필터 체크
  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some(value => {
      if (value === undefined || value === null || value === '') {
        return false;
      }
      if (Array.isArray(value) && value.length === 0) {
        return false;
      }
      return true;
    });
  }, [filters]);

  // API 쿼리 파라미터 구성
  const queryParams = useMemo(() => {
    const params: any = {
      ...filters,
      page,
      limit,
      sortBy,
      sortOrder
    };
    
    // 빈 배열 제거
    Object.keys(params).forEach(key => {
      if (Array.isArray(params[key]) && params[key].length === 0) {
        delete params[key];
      }
    });
    
    return params;
  }, [filters, page, limit, sortBy, sortOrder]);

  // 발송 로그 조회
  const { 
    data: sendLogsData, 
    isLoading, 
    error, 
    refetch 
  } = useQuery<{
    logs: SendLog[];
    pagination: SendLogsPagination;
  }>({
    queryKey: ['/api/ars/send-logs', queryParams],
    enabled: hasActiveFilters, // 유효한 필터가 있을 때만 실행
    staleTime: 2 * 60 * 1000, // 2분
    refetchOnWindowFocus: false,
  });

  // 전화번호 마스킹
  const maskPhone = (phone: string): string => {
    if (!phone || canViewPersonalInfo) return phone;
    if (phone.length <= 4) return phone;
    const visible = Math.max(2, Math.floor(phone.length * 0.3));
    return phone.slice(0, visible) + '*'.repeat(phone.length - visible);
  };

  // 고객명 마스킹
  const maskName = (name: string): string => {
    if (!name || canViewPersonalInfo) return name;
    if (name.length <= 1) return name;
    return name.slice(0, 1) + '*'.repeat(name.length - 1);
  };

  // 시간 포맷
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}초`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}분 ${remainingSeconds}초`;
  };

  // 금액 포맷
  const formatCost = (cost: number): string => {
    return `₩${cost.toFixed(2)}`;
  };

  // 정렬 처리
  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1); // 정렬 변경시 첫 페이지로
  };

  // 정렬 아이콘 렌더링
  const renderSortIcon = (field: SortField) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3" />;
    }
    return sortOrder === 'asc' ? 
      <ArrowUp className="ml-1 h-3 w-3" /> : 
      <ArrowDown className="ml-1 h-3 w-3" />;
  };

  // 페이지네이션 처리
  const pagination = sendLogsData?.pagination;
  const totalPages = pagination?.totalPages || 0;
  const currentPage = pagination?.page || 1;

  const goToPage = (pageNum: number) => {
    setPage(Math.max(1, Math.min(pageNum, totalPages)));
  };

  // 로딩 상태
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>발송 로그</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>발송 로그</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-600">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>발송 로그를 불러오는 중 오류가 발생했습니다.</p>
            <p className="text-sm text-muted-foreground mt-2">
              {error instanceof Error ? error.message : '알 수 없는 오류'}
            </p>
            <Button 
              variant="outline" 
              onClick={() => refetch()} 
              className="mt-4"
              data-testid="button-retry"
            >
              다시 시도
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const logs = sendLogsData?.logs || [];

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0">
          <CardTitle className="flex items-center space-x-2">
            <Phone className="h-5 w-5" />
            <span>발송 로그</span>
            {pagination && (
              <Badge variant="secondary" data-testid="badge-total-count">
                총 {pagination.total.toLocaleString()}건
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">페이지당</span>
            <Select value={limit.toString()} onValueChange={(value) => {
              setLimit(Number(value));
              setPage(1);
            }}>
              <SelectTrigger className="w-20" data-testid="select-page-limit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground" data-testid="empty-state-send-logs">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p data-testid="text-empty-message">표시할 발송 로그가 없습니다.</p>
            <p className="text-sm mt-1" data-testid="text-empty-hint">필터를 조정하거나 다른 검색 조건을 시도해보세요.</p>
          </div>
        ) : (
          <>
            {/* 테이블 */}
            <div className="overflow-x-auto">
              <Table data-testid="table-send-logs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('customerName')}
                        className="h-8 p-1 font-semibold"
                        data-testid="sort-customer"
                      >
                        고객명
                        {renderSortIcon('customerName')}
                      </Button>
                    </TableHead>
                    <TableHead className="w-32">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('phoneNumber')}
                        className="h-8 p-1 font-semibold"
                        data-testid="sort-phone"
                      >
                        전화번호
                        {renderSortIcon('phoneNumber')}
                      </Button>
                    </TableHead>
                    <TableHead className="w-48">캠페인</TableHead>
                    <TableHead className="w-24">통화결과</TableHead>
                    <TableHead className="w-20">유형</TableHead>
                    <TableHead className="w-24">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('duration')}
                        className="h-8 p-1 font-semibold"
                        data-testid="sort-duration"
                      >
                        통화시간
                        {renderSortIcon('duration')}
                      </Button>
                    </TableHead>
                    {canViewAdvanced && (
                      <TableHead className="w-20">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort('cost')}
                          className="h-8 p-1 font-semibold"
                          data-testid="sort-cost"
                        >
                          비용
                          {renderSortIcon('cost')}
                        </Button>
                      </TableHead>
                    )}
                    <TableHead className="w-32">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('sentAt')}
                        className="h-8 p-1 font-semibold"
                        data-testid="sort-sent-at"
                      >
                        발송시간
                        {renderSortIcon('sentAt')}
                      </Button>
                    </TableHead>
                    <TableHead className="w-16">상세</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const callResultConfig = CALL_RESULT_CONFIG[log.callResult as keyof typeof CALL_RESULT_CONFIG];
                    
                    return (
                      <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                        <TableCell className="font-medium">
                          {maskName(log.customerName)}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {maskPhone(log.phone)}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-48 truncate" title={log.campaignName}>
                            {log.campaignName}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className={cn(
                              "text-white border-0", 
                              callResultConfig?.color || 'bg-gray-500'
                            )}
                          >
                            {callResultConfig?.label || log.callResult}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {RETRY_TYPE_LABELS[log.retryType as keyof typeof RETRY_TYPE_LABELS] || log.retryType}
                          </Badge>
                          {log.retryAttempt > 1 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {log.retryAttempt}회차
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">
                              {formatDuration(log.duration)}
                            </span>
                          </div>
                        </TableCell>
                        {canViewAdvanced && (
                          <TableCell>
                            <div className="flex items-center space-x-1">
                              <DollarSign className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">
                                {formatCost(log.cost)}
                              </span>
                            </div>
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="text-xs text-muted-foreground">
                            {new Date(log.sentAt).toLocaleDateString('ko-KR')}
                            <div>
                              {new Date(log.sentAt).toLocaleTimeString('ko-KR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setSelectedLog(log)}
                                data-testid={`button-view-${log.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>발송 로그 상세</DialogTitle>
                              </DialogHeader>
                              
                              {selectedLog && (
                                <ScrollArea className="max-h-96">
                                  <div className="space-y-4">
                                    {/* 기본 정보 */}
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="text-sm font-medium text-muted-foreground">고객명</label>
                                        <div className="mt-1">{maskName(selectedLog.customerName)}</div>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium text-muted-foreground">전화번호</label>
                                        <div className="mt-1 font-mono">{maskPhone(selectedLog.phone)}</div>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium text-muted-foreground">캠페인</label>
                                        <div className="mt-1">{selectedLog.campaignName}</div>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium text-muted-foreground">통화 결과</label>
                                        <div className="mt-1">
                                          <Badge 
                                            variant="outline"
                                            className={cn(
                                              "text-white border-0", 
                                              CALL_RESULT_CONFIG[selectedLog.callResult as keyof typeof CALL_RESULT_CONFIG]?.color || 'bg-gray-500'
                                            )}
                                          >
                                            {CALL_RESULT_CONFIG[selectedLog.callResult as keyof typeof CALL_RESULT_CONFIG]?.label || selectedLog.callResult}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>

                                    <Separator />

                                    {/* 통화 정보 */}
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="text-sm font-medium text-muted-foreground">통화 시간</label>
                                        <div className="mt-1">{formatDuration(selectedLog.duration)}</div>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium text-muted-foreground">발송 유형</label>
                                        <div className="mt-1">
                                          {RETRY_TYPE_LABELS[selectedLog.retryType as keyof typeof RETRY_TYPE_LABELS]} ({selectedLog.retryAttempt}회차)
                                        </div>
                                      </div>
                                      {selectedLog.dtmfInput && (
                                        <div>
                                          <label className="text-sm font-medium text-muted-foreground">DTMF 입력</label>
                                          <div className="mt-1 font-mono">{selectedLog.dtmfInput}</div>
                                        </div>
                                      )}
                                      {canViewAdvanced && (
                                        <div>
                                          <label className="text-sm font-medium text-muted-foreground">비용</label>
                                          <div className="mt-1">{formatCost(selectedLog.cost)}</div>
                                        </div>
                                      )}
                                    </div>

                                    <Separator />

                                    {/* 시간 정보 */}
                                    <div className="grid grid-cols-1 gap-4">
                                      <div>
                                        <label className="text-sm font-medium text-muted-foreground">발송 시간</label>
                                        <div className="mt-1">{new Date(selectedLog.sentAt).toLocaleString('ko-KR')}</div>
                                      </div>
                                      {selectedLog.answeredAt && (
                                        <div>
                                          <label className="text-sm font-medium text-muted-foreground">응답 시간</label>
                                          <div className="mt-1">{new Date(selectedLog.answeredAt).toLocaleString('ko-KR')}</div>
                                        </div>
                                      )}
                                      {selectedLog.completedAt && (
                                        <div>
                                          <label className="text-sm font-medium text-muted-foreground">완료 시간</label>
                                          <div className="mt-1">{new Date(selectedLog.completedAt).toLocaleString('ko-KR')}</div>
                                        </div>
                                      )}
                                    </div>

                                    {/* 에러 메시지 */}
                                    {selectedLog.errorMessage && (
                                      <>
                                        <Separator />
                                        <div>
                                          <label className="text-sm font-medium text-muted-foreground">오류 메시지</label>
                                          <div className="mt-1 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                                            {selectedLog.errorMessage}
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </ScrollArea>
                              )}
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* 페이지네이션 */}
            {pagination && totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {pagination.total.toLocaleString()}건 중 {((currentPage - 1) * limit + 1).toLocaleString()}-{Math.min(currentPage * limit, pagination.total).toLocaleString()}건 표시
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(1)}
                    disabled={currentPage === 1}
                    data-testid="button-first-page"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const startPage = Math.max(1, currentPage - 2);
                      const pageNum = startPage + i;
                      if (pageNum > totalPages) return null;
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => goToPage(pageNum)}
                          className="w-8 h-8 p-0"
                          data-testid={`button-page-${pageNum}`}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(totalPages)}
                    disabled={currentPage === totalPages}
                    data-testid="button-last-page"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}