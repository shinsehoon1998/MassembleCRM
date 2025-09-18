import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Phone, Users, TrendingUp, Send, RefreshCw, Eye, CheckCircle, XCircle, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { arsCallListAddSchema, type ArsCallListAdd } from "@shared/schema";

interface ArsHistoryItem {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  status: string;
  sentAt: string;
  result: string;
}

interface ArsHistoryResult {
  historyKey: string;
  campaignName: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  completedCount: number;
  pendingCount: number;
  items: ArsHistoryItem[];
}

export default function ArsCampaigns() {
  const { toast } = useToast();
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedHistoryKey, setSelectedHistoryKey] = useState<string | null>(null);

  // 새로운 ARS 발송 폼
  const form = useForm<ArsCallListAdd>({
    resolver: zodResolver(arsCallListAddSchema),
    defaultValues: {
      campaignName: "",
      page: "A",
      phones: [],
    },
  });

  // 마케팅 대상 고객 조회
  const { data: marketingTargets } = useQuery({
    queryKey: ["/api/ars/marketing-targets"],
  });

  // 고객 그룹 목록 조회
  const { data: customerGroups } = useQuery({
    queryKey: ["/api/customer-groups"],
  });

  // 기존 캠페인 기록 조회 (참고용)
  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["/api/ars/campaigns"],
  });

  // 선택된 historyKey의 상세 결과 조회
  const { data: historyResponse, isLoading: historyDetailLoading } = useQuery<any>({
    queryKey: ["/api/ars/calllist/history", selectedHistoryKey],
    enabled: !!selectedHistoryKey && showDetailModal,
    refetchInterval: showDetailModal ? 5000 : false, // 5초마다 자동 갱신
  });

  // 백엔드 응답에서 실제 history data 추출 및 fallback 처리
  const historyDetail: ArsHistoryResult | null = historyResponse?.data ? {
    historyKey: (historyResponse as any).historyKey || '',
    campaignName: (historyResponse as any).campaignName || '',
    totalCount: (historyResponse as any).totalCount || 0,
    successCount: (historyResponse as any).data?.successCount || 0,
    failedCount: (historyResponse as any).data?.failedCount || 0,
    completedCount: (historyResponse as any).data?.completedCount || 0,
    pendingCount: (historyResponse as any).data?.pendingCount || 0,
    items: Array.isArray((historyResponse as any).data?.items) ? (historyResponse as any).data.items : Array.isArray((historyResponse as any).data?.data) ? (historyResponse as any).data.data : []
  } : null;

  // 새로운 ARS 발송 API 호출
  const sendArsMutation = useMutation({
    mutationFn: async (data: ArsCallListAdd) => {
      const response = await apiRequest("POST", "/api/ars/calllist/add", data);
      return response.json();
    },
    onSuccess: (response: any) => {
      if (response?.success) {
        toast({
          title: "발송 성공",
          description: `캠페인 '${response.campaignName || 'Unknown'}'이 성공적으로 발송되었습니다. (총 ${response.totalCount || 0}명)`,
        });
        
        // 발송 성공 시 결과 조회를 위해 historyKey 저장
        if (response.historyKey) {
          setSelectedHistoryKey(response.historyKey);
          setShowDetailModal(true);
        }
        
        setShowBulkModal(false);
        form.reset();
      } else {
        toast({
          title: "발송 실패",
          description: response?.message || "알 수 없는 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/ars/campaigns"] });
    },
    onError: (error: Error) => {
      toast({
        title: "발송 오류",
        description: `ARS 발송 중 오류가 발생했습니다: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // 대상 선택 상태
  const [selectedTargetType, setSelectedTargetType] = useState<"all" | "group">("all");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");

  // 선택된 그룹의 고객 수 조회
  const { data: groupCustomers } = useQuery({
    queryKey: [`/api/customer-groups/${selectedGroupId}/customers`],
    enabled: !!selectedGroupId && selectedTargetType === "group",
  });

  const handleSubmit = (data: ArsCallListAdd) => {
    // 전화번호 배열 구성
    let phones: string[] = [];
    
    if (selectedTargetType === "all") {
      // 전체 마케팅 동의 고객
      const targets = (marketingTargets as any)?.targets;
      if (!Array.isArray(targets) || targets.length === 0) {
        toast({
          title: "대상 없음",
          description: "마케팅 동의한 고객이 없습니다.",
          variant: "destructive",
        });
        return;
      }
      phones = targets.map((customer: any) => customer.phone).filter(Boolean);
    } else if (selectedTargetType === "group" && selectedGroupId) {
      // 선택된 그룹의 고객
      const customers = groupCustomers as any;
      if (!Array.isArray(customers) || customers.length === 0) {
        toast({
          title: "대상 없음",
          description: "선택된 그룹에 고객이 없습니다.",
          variant: "destructive",
        });
        return;
      }
      phones = customers.map((customer: any) => customer.phone).filter(Boolean);
    }

    if (phones.length === 0) {
      toast({
        title: "대상 없음",
        description: "발송할 대상의 전화번호가 없습니다.",
        variant: "destructive",
      });
      return;
    }

    sendArsMutation.mutate({
      ...data,
      phones,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-500";
      case "failed": return "bg-red-500"; 
      case "pending": return "bg-yellow-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed": return "완료";
      case "failed": return "실패";
      case "pending": return "대기중";
      default: return "알 수 없음";
    }
  };

  const targetCount = selectedTargetType === "all" 
    ? (marketingTargets as any)?.count || 0
    : (groupCustomers as any)?.length || 0;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">ARS 캠페인</h1>
          <p className="text-muted-foreground">ARS 발송 캠페인을 관리하고 실행합니다</p>
        </div>
        <Dialog open={showBulkModal} onOpenChange={setShowBulkModal}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-campaign">
              <Send className="mr-2 h-4 w-4" />
              새 캠페인 발송
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>ARS 캠페인 발송</DialogTitle>
              <DialogDescription>
                캠페인명을 입력하고 발송 대상을 선택하여 ARS를 발송하세요.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                {/* 캠페인명 입력 */}
                <FormField
                  control={form.control}
                  name="campaignName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>캠페인명 *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="아톡비즈에서 생성된 캠페인명을 입력하세요" 
                          data-testid="input-campaign-name"
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        아톡비즈에서 미리 생성된 캠페인명을 정확히 입력해주세요.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Page 필드 */}
                <FormField
                  control={form.control}
                  name="page"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>페이지</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="A" 
                          data-testid="input-page"
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        기본값: A
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 발송 대상 선택 */}
                <div className="space-y-4">
                  <Label>발송 대상 선택</Label>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="target-all"
                        checked={selectedTargetType === "all"}
                        onCheckedChange={() => setSelectedTargetType("all")}
                        data-testid="checkbox-target-all"
                      />
                      <Label htmlFor="target-all" className="flex items-center space-x-2">
                        <Users className="h-4 w-4" />
                        <span>전체 마케팅 동의 고객</span>
                        <Badge variant="secondary" data-testid="badge-all-count">
                          {(marketingTargets as any)?.count || 0}명
                        </Badge>
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="target-group"
                        checked={selectedTargetType === "group"}
                        onCheckedChange={() => setSelectedTargetType("group")}
                        data-testid="checkbox-target-group"
                      />
                      <Label htmlFor="target-group" className="flex items-center space-x-2">
                        <TrendingUp className="h-4 w-4" />
                        <span>특정 고객 그룹</span>
                      </Label>
                    </div>
                    
                    {selectedTargetType === "group" && (
                      <div className="ml-6">
                        <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                          <SelectTrigger data-testid="select-customer-group">
                            <SelectValue placeholder="고객 그룹을 선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            {(customerGroups as any[])?.map((group) => (
                              <SelectItem key={group.id} value={group.id}>
                                <div className="flex items-center space-x-2">
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: group.color }}
                                  />
                                  <span>{group.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedGroupId && (
                          <Badge variant="outline" className="mt-2" data-testid="badge-group-count">
                            선택된 그룹: {(groupCustomers as any)?.length || 0}명
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 발송 요약 */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Phone className="h-4 w-4" />
                        <span>발송 대상</span>
                      </div>
                      <Badge data-testid="badge-target-count">{targetCount}명</Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* 발송 버튼 */}
                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowBulkModal(false)}
                    data-testid="button-cancel"
                  >
                    취소
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={sendArsMutation.isPending || targetCount === 0}
                    data-testid="button-send"
                  >
                    {sendArsMutation.isPending ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        발송 중...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        발송 시작
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">마케팅 동의 고객</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-marketing-targets">
              {(marketingTargets as any)?.count || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              ARS 발송 가능 대상
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 캠페인</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-campaigns">
              {(campaigns as any[])?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              생성된 캠페인 수
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">고객 그룹</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-customer-groups">
              {(customerGroups as any[])?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              생성된 그룹 수
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">발송 성공률</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-success-rate">
              {campaigns && (campaigns as any[]).length > 0 
                ? Math.round(
                    ((campaigns as any[]).reduce((sum: number, c: any) => sum + (c.successCount || 0), 0) /
                    (campaigns as any[]).reduce((sum: number, c: any) => sum + (c.totalCount || 0), 1)) * 100
                  )
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              전체 캠페인 평균
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 캠페인 기록 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>캠페인 기록</CardTitle>
        </CardHeader>
        <CardContent>
          {campaignsLoading ? (
            <div className="text-center py-4">로딩 중...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>캠페인명</TableHead>
                  <TableHead>대상 수</TableHead>
                  <TableHead>성공/실패</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>생성일</TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(campaigns as any[])?.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium" data-testid={`text-campaign-name-${campaign.id}`}>
                      {campaign.name}
                    </TableCell>
                    <TableCell data-testid={`text-target-count-${campaign.id}`}>
                      {campaign.totalCount || 0}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Badge variant="outline" className="bg-green-50">
                          <CheckCircle className="mr-1 h-3 w-3 text-green-600" />
                          {campaign.successCount || 0}
                        </Badge>
                        <Badge variant="outline" className="bg-red-50">
                          <XCircle className="mr-1 h-3 w-3 text-red-600" />
                          {campaign.failedCount || 0}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        className={getStatusColor(campaign.status)}
                        data-testid={`badge-status-${campaign.id}`}
                      >
                        {getStatusText(campaign.status)}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-created-at-${campaign.id}`}>
                      {new Date(campaign.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (campaign.historyKey) {
                            setSelectedHistoryKey(campaign.historyKey);
                            setShowDetailModal(true);
                          }
                        }}
                        data-testid={`button-view-detail-${campaign.id}`}
                        disabled={!campaign.historyKey}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 캠페인 상세 모달 */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>캠페인 상세 결과</DialogTitle>
            <DialogDescription>
              {historyDetail?.campaignName && `캠페인: ${historyDetail.campaignName}`}
            </DialogDescription>
          </DialogHeader>
          
          {historyDetailLoading ? (
            <div className="text-center py-8">결과를 불러오는 중...</div>
          ) : historyDetail ? (
            <div className="space-y-6">
              {/* 진행률 */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>진행률</span>
                  <span>
                    {historyDetail.completedCount} / {historyDetail.totalCount}
                  </span>
                </div>
                <Progress 
                  value={historyDetail.totalCount > 0 ? (historyDetail.completedCount / historyDetail.totalCount) * 100 : 0} 
                  data-testid="progress-campaign"
                />
              </div>

              {/* 결과 요약 */}
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600" data-testid="text-detail-total">
                    {historyDetail.totalCount}
                  </div>
                  <div className="text-sm text-muted-foreground">총 대상</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600" data-testid="text-detail-success">
                    {historyDetail.successCount}
                  </div>
                  <div className="text-sm text-muted-foreground">성공</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600" data-testid="text-detail-failed">
                    {historyDetail.failedCount}
                  </div>
                  <div className="text-sm text-muted-foreground">실패</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600" data-testid="text-detail-pending">
                    {historyDetail.pendingCount}
                  </div>
                  <div className="text-sm text-muted-foreground">대기중</div>
                </div>
              </div>

              {/* 상세 리스트 */}
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>고객명</TableHead>
                      <TableHead>전화번호</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>발송시간</TableHead>
                      <TableHead>결과</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyDetail.items?.map((item: ArsHistoryItem) => (
                      <TableRow key={item.id}>
                        <TableCell data-testid={`text-customer-name-${item.id}`}>
                          {item.customerName}
                        </TableCell>
                        <TableCell data-testid={`text-phone-${item.id}`}>
                          {item.phone}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            className={getStatusColor(item.status)}
                            data-testid={`badge-item-status-${item.id}`}
                          >
                            {getStatusText(item.status)}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-sent-at-${item.id}`}>
                          {item.sentAt ? new Date(item.sentAt).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell data-testid={`text-result-${item.id}`}>
                          {item.result || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              결과 데이터를 불러올 수 없습니다.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}