import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Phone, Users, Calendar, TrendingUp, Send, RefreshCw } from "lucide-react";
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
  const [bulkCampaignData, setBulkCampaignData] = useState({
    campaignName: "",
    sendNumber: "",
    scenarioId: "marketing_consent",
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

  // 대량 ARS 발송
  const sendBulkArsMutation = useMutation({
    mutationFn: async (data: {
      customerIds: string[];
      sendNumber: string;
      campaignName: string;
      scenarioId: string;
    }) => {
      return apiRequest("POST", `/api/ars/send-bulk`, data);
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

  const handleBulkSend = () => {
    if (!bulkCampaignData.campaignName || !bulkCampaignData.sendNumber) {
      toast({
        title: "입력 오류",
        description: "캠페인명과 발신번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const targets = (marketingTargets as any)?.targets || [];
    if (!targets.length) {
      toast({
        title: "대상 없음",
        description: "마케팅 대상 고객이 없습니다.",
        variant: "destructive",
      });
      return;
    }

    const customerIds = targets.map((customer: any) => customer.id);
    
    sendBulkArsMutation.mutate({
      customerIds,
      sendNumber: bulkCampaignData.sendNumber,
      campaignName: bulkCampaignData.campaignName,
      scenarioId: bulkCampaignData.scenarioId,
    });
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
                  <Label htmlFor="sendNumber">발신번호</Label>
                  <Input
                    id="sendNumber"
                    placeholder="02-1234-5678"
                    value={bulkCampaignData.sendNumber}
                    onChange={(e) =>
                      setBulkCampaignData(prev => ({
                        ...prev,
                        sendNumber: e.target.value,
                      }))
                    }
                    data-testid="input-send-number"
                  />
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
                      <SelectItem value="marketing_consent">마케팅 동의 확인</SelectItem>
                      <SelectItem value="consultation_reminder">상담 안내</SelectItem>
                      <SelectItem value="follow_up">후속 연락</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <Users className="h-4 w-4 inline mr-1" />
                    발송 대상: {(marketingTargets as any)?.count || 0}명
                  </p>
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
                      <Badge variant="secondary" data-testid={`badge-campaign-status-${campaign.id}`}>
                        {campaign.status === 'completed' ? '완료' : '진행중'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}