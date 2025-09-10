import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Phone, Users, Calendar, TrendingUp, Send, RefreshCw, Eye, CheckCircle, XCircle, Clock } from "lucide-react";
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

export default function ArsCampaigns() {
  const { toast } = useToast();
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [bulkCampaignData, setBulkCampaignData] = useState({
    campaignName: "",
    scenarioId: "marketing_consent",
    targetType: "all", // "all" 또는 "group"
    groupId: "",
    targetCount: 0,
  });

  // ARS 캠페인 목록 조회
  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["/api/ars/campaigns"],
  });

  // 마케팅 대상 고객 조회
  const { data: marketingTargets } = useQuery({
    queryKey: ["/api/ars/marketing-targets"],
  });

  // 시나리오 목록 조회
  const { data: scenarios } = useQuery({
    queryKey: ["/api/ars/scenarios"],
  });

  // 고객 그룹 목록 조회
  const { data: customerGroups } = useQuery({
    queryKey: ["/api/customer-groups"],
  });

  // 선택된 그룹의 고객 수 조회
  const { data: groupCustomers } = useQuery({
    queryKey: [`/api/customer-groups/${bulkCampaignData.groupId}/customers`],
    enabled: !!bulkCampaignData.groupId && bulkCampaignData.targetType === "group",
  });

  // 선택된 캠페인의 상세 정보 조회
  const { data: campaignDetail, isLoading: campaignDetailLoading } = useQuery({
    queryKey: [`/api/ars/campaigns/${selectedCampaign?.id}/detail`],
    enabled: !!selectedCampaign?.id && showDetailModal,
    refetchInterval: showDetailModal ? 5000 : false, // 5초마다 자동 갱신
  });

  // 선택된 캠페인의 통화 기록 조회
  const { data: campaignHistory } = useQuery({
    queryKey: [`/api/ars/campaigns/${selectedCampaign?.id}/history`],
    enabled: !!selectedCampaign?.id && showDetailModal,
  });

  // 대량 ARS 발송
  const sendBulkArsMutation = useMutation({
    mutationFn: async (data: {
      customerIds?: string[];
      groupId?: string;
      campaignName: string;
      scenarioId: string;
    }) => {
      return apiRequest("POST", "/api/ars/send-bulk", data);
    },
    onSuccess: () => {
      toast({
        title: "성공",
        description: "대량 ARS 발송이 시작되었습니다.",
      });
      setShowBulkModal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/ars/campaigns"] });
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ARS 결과 업데이트
  const updateResultsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/ars/update-results`);
    },
    onSuccess: () => {
      toast({
        title: "성공",
        description: "ARS 발송 결과가 업데이트되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ars/campaigns"] });
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 캠페인 종료
  const stopCampaignMutation = useMutation({
    mutationFn: async (campaignId: number) => {
      const response = await apiRequest("POST", `/api/ars/campaigns/${campaignId}/stop`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "캠페인 종료",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ars/campaigns"] });
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleBulkSend = () => {
    if (!bulkCampaignData.campaignName) {
      toast({
        title: "입력 오류",
        description: "캠페인명을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (bulkCampaignData.targetType === "group" && !bulkCampaignData.groupId) {
      toast({
        title: "그룹 선택 필요",
        description: "발송할 고객 그룹을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    const sendData: any = {
      campaignName: bulkCampaignData.campaignName,
      scenarioId: bulkCampaignData.scenarioId,
    };

    if (bulkCampaignData.targetType === "group") {
      sendData.groupId = bulkCampaignData.groupId;
    } else {
      // 전체 마케팅 동의 고객
      const targets = (marketingTargets as any)?.targets || [];
      if (!targets.length) {
        toast({
          title: "대상 없음",
          description: "마케팅 대상 고객이 없습니다.",
          variant: "destructive",
        });
        return;
      }
      sendData.customerIds = targets.map((customer: any) => customer.id);
    }
    
    sendBulkArsMutation.mutate(sendData);
  };

  const handleViewCampaignDetail = (campaign: any) => {
    setSelectedCampaign(campaign);
    setShowDetailModal(true);
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

  if (campaignsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">캠페인 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ARS 캠페인 관리</h1>
          <p className="text-gray-600 mt-2">자동 전화 발송 캠페인을 관리하고 모니터링하세요</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => updateResultsMutation.mutate()}
            disabled={updateResultsMutation.isPending}
            variant="outline"
            data-testid="button-refresh-results"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            결과 업데이트
          </Button>
          <Dialog open={showBulkModal} onOpenChange={setShowBulkModal}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-campaign">
                <Send className="h-4 w-4 mr-2" />
                신규 캠페인
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>대량 ARS 발송</DialogTitle>
                <DialogDescription>
                  마케팅 동의 고객들에게 ARS를 발송합니다.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="campaignName">캠페인명</Label>
                  <Input
                    id="campaignName"
                    placeholder="예: 2024년 12월 마케팅 캠페인"
                    value={bulkCampaignData.campaignName}
                    onChange={(e) =>
                      setBulkCampaignData(prev => ({
                        ...prev,
                        campaignName: e.target.value,
                      }))
                    }
                    data-testid="input-campaign-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm text-gray-600 p-3 bg-gray-50 rounded-md">
                    <strong>발신번호:</strong> 1660-2426 (고정)
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scenario">시나리오</Label>
                  <Select
                    value={bulkCampaignData.scenarioId}
                    onValueChange={(value) =>
                      setBulkCampaignData(prev => ({
                        ...prev,
                        scenarioId: value,
                      }))
                    }
                  >
                    <SelectTrigger data-testid="select-scenario">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(scenarios as any)?.map((scenario: any) => (
                        <SelectItem key={scenario.id} value={scenario.id}>
                          {scenario.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>발송 대상</Label>
                  <Select
                    value={bulkCampaignData.targetType}
                    onValueChange={(value) =>
                      setBulkCampaignData(prev => ({
                        ...prev,
                        targetType: value,
                        groupId: value === "all" ? "" : prev.groupId,
                      }))
                    }
                  >
                    <SelectTrigger data-testid="select-target-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 마케팅 동의 고객</SelectItem>
                      <SelectItem value="group">특정 고객 그룹</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {bulkCampaignData.targetType === "group" && (
                  <div className="space-y-2">
                    <Label htmlFor="group">고객 그룹</Label>
                    <Select
                      value={bulkCampaignData.groupId}
                      onValueChange={(value) =>
                        setBulkCampaignData(prev => ({
                          ...prev,
                          groupId: value,
                        }))
                      }
                    >
                      <SelectTrigger data-testid="select-customer-group">
                        <SelectValue placeholder="그룹을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {(customerGroups as any)?.map((group: any) => (
                          <SelectItem key={group.id} value={group.id}>
                            <div className="flex items-center space-x-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: group.color }}
                              ></div>
                              <span>{group.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <Users className="h-4 w-4 inline mr-1" />
                    발송 대상: {
                      bulkCampaignData.targetType === "group" 
                        ? (groupCustomers as any)?.length || 0
                        : (marketingTargets as any)?.count || 0
                    }명
                  </p>
                  {bulkCampaignData.targetType === "group" && bulkCampaignData.groupId && (
                    <p className="text-xs text-blue-600 mt-1">
                      선택된 그룹: {(customerGroups as any)?.find((g: any) => g.id === bulkCampaignData.groupId)?.name}
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowBulkModal(false)}
                    data-testid="button-cancel"
                  >
                    취소
                  </Button>
                  <Button
                    onClick={handleBulkSend}
                    disabled={sendBulkArsMutation.isPending}
                    data-testid="button-send-bulk"
                  >
                    {sendBulkArsMutation.isPending ? "발송 중..." : "발송 시작"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 캠페인 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 캠페인</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-campaigns">
              {(campaigns as any[])?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">전체 생성된 캠페인 수</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">마케팅 대상</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-marketing-targets">
              {(marketingTargets as any)?.count || 0}
            </div>
            <p className="text-xs text-muted-foreground">마케팅 동의 고객</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">이번 달 발송</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-monthly-sends">
              {(campaigns as any[])?.filter((c: any) => {
                const campaignDate = new Date(c.createdAt);
                const currentDate = new Date();
                return campaignDate.getMonth() === currentDate.getMonth() &&
                       campaignDate.getFullYear() === currentDate.getFullYear();
              }).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">이번 달 진행한 캠페인</p>
          </CardContent>
        </Card>
      </div>

      {/* 캠페인 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>최근 캠페인</CardTitle>
        </CardHeader>
        <CardContent>
          {!(campaigns as any[])?.length ? (
            <div className="text-center py-8">
              <Phone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">아직 생성된 캠페인이 없습니다.</p>
              <p className="text-sm text-gray-500 mt-1">신규 캠페인 버튼을 클릭하여 첫 캠페인을 만들어보세요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(campaigns as any[])?.map((campaign: any) => (
                <div key={campaign.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg" data-testid={`text-campaign-name-${campaign.id}`}>
                        {campaign.name}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                        <span data-testid={`text-campaign-date-${campaign.id}`}>
                          <Calendar className="h-4 w-4 inline mr-1" />
                          {new Date(campaign.createdAt).toLocaleDateString('ko-KR')}
                        </span>
                        <span data-testid={`text-campaign-targets-${campaign.id}`}>
                          <Users className="h-4 w-4 inline mr-1" />
                          대상: {campaign.targetCount}명
                        </span>
                        <span data-testid={`text-campaign-phone-${campaign.id}`}>
                          <Phone className="h-4 w-4 inline mr-1" />
                          {campaign.sendNumber}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={campaign.status === 'completed' ? 'default' : campaign.status === 'stopped' ? 'destructive' : 'secondary'} 
                        data-testid={`badge-campaign-status-${campaign.id}`}
                      >
                        {campaign.status === 'completed' ? '완료' : 
                         campaign.status === 'stopped' ? '중단됨' : 
                         campaign.status === 'sent' ? '발송중' : '진행중'}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewCampaignDetail(campaign)}
                        data-testid={`button-view-campaign-${campaign.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        상세보기
                      </Button>
                      {(campaign.status === 'sent' || campaign.status === 'pending') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm(`캠페인 "${campaign.name}"을(를) 종료하시겠습니까?\n진행 중인 발송이 중단됩니다.`)) {
                              stopCampaignMutation.mutate(campaign.id);
                            }
                          }}
                          disabled={stopCampaignMutation.isPending}
                          className="text-red-600 hover:text-red-700 hover:border-red-300"
                          data-testid={`button-stop-campaign-${campaign.id}`}
                        >
                          <i className="fas fa-stop mr-1"></i>
                          {stopCampaignMutation.isPending ? '종료 중...' : '종료'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 캠페인 상세보기 모달 */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              캠페인 상세보기: {selectedCampaign?.name}
            </DialogTitle>
            <DialogDescription>
              캠페인의 실시간 진행 상황과 발송 결과를 확인할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          {campaignDetailLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2">상세 정보를 불러오는 중...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 캠페인 기본 정보 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">캠페인 정보</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-500">캠페인명</Label>
                      <p className="font-semibold">{selectedCampaign?.name}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">상태</Label>
                      <Badge 
                        variant={selectedCampaign?.status === 'completed' ? 'default' : 
                                selectedCampaign?.status === 'stopped' ? 'destructive' : 'secondary'}
                      >
                        {selectedCampaign?.status === 'completed' ? '완료' : 
                         selectedCampaign?.status === 'stopped' ? '중단됨' : 
                         selectedCampaign?.status === 'sent' ? '발송중' : '진행중'}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">시나리오</Label>
                      <p>{selectedCampaign?.scenarioId}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">발신번호</Label>
                      <p>{selectedCampaign?.sendNumber || '1660-2426'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">생성일시</Label>
                      <p>{selectedCampaign?.createdAt ? new Date(selectedCampaign.createdAt).toLocaleString('ko-KR') : '-'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">대상 고객</Label>
                      <p>{selectedCampaign?.targetCount || 0}명</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 실시간 진행 상황 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    실시간 진행 상황
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {campaignDetail ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">전체 진행률</span>
                        <span className="text-sm font-medium">
                          {campaignDetail.completedCount || 0} / {campaignDetail.totalCount || 0}
                        </span>
                      </div>
                      <Progress 
                        value={campaignDetail.totalCount > 0 ? 
                          (campaignDetail.completedCount / campaignDetail.totalCount) * 100 : 0} 
                        className="h-3"
                      />
                      
                      <div className="grid grid-cols-3 gap-4 mt-4">
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <CheckCircle className="h-5 w-5 text-green-500 mr-1" />
                            <span className="font-medium text-green-700">성공</span>
                          </div>
                          <p className="text-2xl font-bold text-green-600">
                            {campaignDetail.successCount || 0}
                          </p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <XCircle className="h-5 w-5 text-red-500 mr-1" />
                            <span className="font-medium text-red-700">실패</span>
                          </div>
                          <p className="text-2xl font-bold text-red-600">
                            {campaignDetail.failedCount || 0}
                          </p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <Clock className="h-5 w-5 text-yellow-500 mr-1" />
                            <span className="font-medium text-yellow-700">대기중</span>
                          </div>
                          <p className="text-2xl font-bold text-yellow-600">
                            {campaignDetail.pendingCount || 0}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      진행 상황 정보를 불러올 수 없습니다.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 발송 기록 상세 */}
              <Card>
                <CardHeader>
                  <CardTitle>발송 기록</CardTitle>
                </CardHeader>
                <CardContent>
                  {campaignHistory && campaignHistory.length > 0 ? (
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
                        {campaignHistory.map((record: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              {record.customerName || '-'}
                            </TableCell>
                            <TableCell>{record.phone || '-'}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`${getStatusColor(record.status)} text-white`}
                              >
                                {getStatusText(record.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {record.sentAt ? new Date(record.sentAt).toLocaleString('ko-KR') : '-'}
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {record.result || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Phone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p>발송 기록이 없습니다.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => setShowDetailModal(false)}
              data-testid="button-close-detail"
            >
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}