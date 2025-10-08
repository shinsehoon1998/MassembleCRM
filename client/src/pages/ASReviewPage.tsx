import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CheckCircle, XCircle, Clock, FileText, Download, Eye } from "lucide-react";
import { Label } from "@/components/ui/label";

export default function ASReviewPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [reviewMemo, setReviewMemo] = useState("");
  const [activeTab, setActiveTab] = useState("pending");

  // Fetch campaigns
  const { data: campaignsData, isLoading } = useQuery<{
    campaigns: any[];
    total: number;
    totalPages: number;
  }>({
    queryKey: ["/api/as-campaigns"],
  });

  const campaigns = campaignsData?.campaigns || [];

  // Fetch campaign details
  const { data: campaignDetails } = useQuery({
    queryKey: [`/api/as-campaigns/${selectedCampaign?.id}`],
    enabled: !!selectedCampaign,
  });

  // Review request mutation
  const reviewMutation = useMutation({
    mutationFn: async (data: { requestId: string; status: string; adminMemo?: string }) => {
      return await apiRequest("PATCH", `/api/as-requests/${data.requestId}/review`, {
        status: data.status,
        adminMemo: data.adminMemo,
      });
    },
    onSuccess: () => {
      toast({
        title: "검수 완료",
        description: "A.S 요청이 검수되었습니다.",
      });
      setSelectedRequest(null);
      setReviewMemo("");
      queryClient.invalidateQueries({ queryKey: ["/api/as-campaigns"] });
      queryClient.invalidateQueries({ queryKey: [`/api/as-campaigns/${selectedCampaign?.id}`] });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "검수 처리 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = () => {
    if (!selectedRequest) return;
    
    reviewMutation.mutate({
      requestId: selectedRequest.id,
      status: "approved",
      adminMemo: reviewMemo,
    });
  };

  const handleReject = () => {
    if (!selectedRequest) return;
    
    if (!reviewMemo.trim()) {
      toast({
        title: "오류",
        description: "반려 사유를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    reviewMutation.mutate({
      requestId: selectedRequest.id,
      status: "rejected",
      adminMemo: reviewMemo,
    });
  };

  const pendingCampaigns = campaigns.filter(c => c.status === 'submitted');
  const reviewedCampaigns = campaigns.filter(c => c.status === 'reviewed');
  const requests = campaignDetails?.requests || [];

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">로딩 중...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">A.S 검수 관리</h1>
        <p className="text-gray-600 mt-2">팀원들의 A.S 요청을 검수합니다</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">검수 대기</p>
                <p className="text-2xl font-bold">{pendingCampaigns.length}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">검수 완료</p>
                <p className="text-2xl font-bold">{reviewedCampaigns.length}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">전체 캠페인</p>
                <p className="text-2xl font-bold">{campaigns.length}</p>
              </div>
              <FileText className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for pending and completed */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending" data-testid="tab-pending">검수 대기</TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">검수 완료</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingCampaigns.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>검수 대기 중인 캠페인이 없습니다</p>
              </CardContent>
            </Card>
          ) : (
            pendingCampaigns.map((campaign: any) => (
              <Card key={campaign.id} data-testid={`campaign-${campaign.id}`}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">{campaign.name}</h3>
                        <Badge variant="default">검수대기</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                        <div>요청자: {campaign.creator?.name || '알 수 없음'}</div>
                        <div>총 배분: {campaign.totalAllocated}</div>
                        <div>A.S 요청: {campaign.asRequestCount}</div>
                        <div>
                          비율: {((campaign.asRequestCount / campaign.totalAllocated) * 100).toFixed(1)}%
                        </div>
                        <div>제출일: {campaign.submittedAt ? format(new Date(campaign.submittedAt), 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}</div>
                      </div>
                    </div>
                    <Button
                      onClick={() => setSelectedCampaign(campaign)}
                      className="bg-massemble-red hover:bg-massemble-red/90"
                      data-testid={`button-review-${campaign.id}`}
                    >
                      검수하기
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {reviewedCampaigns.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>검수 완료된 캠페인이 없습니다</p>
              </CardContent>
            </Card>
          ) : (
            reviewedCampaigns.map((campaign: any) => (
              <Card key={campaign.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">{campaign.name}</h3>
                        <Badge variant="outline">검수완료</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                        <div>요청자: {campaign.creator?.name || '알 수 없음'}</div>
                        <div>검수자: {campaign.reviewer?.name || '알 수 없음'}</div>
                        <div>검수일: {campaign.reviewedAt ? format(new Date(campaign.reviewedAt), 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}</div>
                      </div>
                      {campaign.requestStats && (
                        <div className="mt-2 flex gap-3 text-sm">
                          <span className="text-green-600">승인: {campaign.requestStats.approved}</span>
                          <span className="text-red-600">반려: {campaign.requestStats.rejected}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Review modal */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCampaign?.name} - 검수</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">요청자</p>
                <p className="font-medium">{selectedCampaign?.creator?.name || '알 수 없음'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">총 배분 수량</p>
                <p className="font-medium">{selectedCampaign?.totalAllocated}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">A.S 요청 수량</p>
                <p className="font-medium">{selectedCampaign?.asRequestCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">비율</p>
                <p className="font-medium">
                  {selectedCampaign ? ((selectedCampaign.asRequestCount / selectedCampaign.totalAllocated) * 100).toFixed(1) : 0}%
                </p>
              </div>
            </div>

            {/* Requests list */}
            <div className="space-y-3">
              <h3 className="font-semibold">A.S 요청 목록</h3>
              {requests.length === 0 ? (
                <p className="text-gray-500 text-center py-8">요청이 없습니다</p>
              ) : (
                requests.map((request: any) => (
                  <Card key={request.id} className={selectedRequest?.id === request.id ? 'border-2 border-massemble-red' : ''}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="font-medium">{request.customer?.name || '알 수 없음'}</p>
                            <p className="text-sm text-gray-600">{request.customer?.phone || '-'}</p>
                            <Badge
                              variant={
                                request.status === 'approved' ? 'default' :
                                request.status === 'rejected' ? 'destructive' :
                                'secondary'
                              }
                            >
                              {request.status === 'approved' ? '승인' :
                               request.status === 'rejected' ? '반려' :
                               '대기'}
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <p className="text-sm text-gray-600">A.S 사유</p>
                              <p className="text-sm mt-1 whitespace-pre-wrap">{request.reason}</p>
                            </div>
                            
                            {/* Attachments */}
                            {request.attachments && request.attachments.length > 0 && (
                              <div>
                                <p className="text-sm text-gray-600 mb-2">첨부파일</p>
                                <div className="flex flex-wrap gap-2">
                                  {request.attachments.map((attachment: any) => (
                                    <a
                                      key={attachment.id}
                                      href={attachment.filePath}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                                    >
                                      <FileText className="h-4 w-4" />
                                      <span className="text-sm">{attachment.originalName}</span>
                                      <Download className="h-3 w-3" />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Admin memo if reviewed */}
                            {request.status !== 'pending' && request.adminMemo && (
                              <div className="mt-2 p-2 bg-gray-100 rounded">
                                <p className="text-sm text-gray-600">검수 메모</p>
                                <p className="text-sm mt-1">{request.adminMemo}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {request.status === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(request);
                              setReviewMemo(request.adminMemo || "");
                            }}
                            data-testid={`button-review-request-${request.id}`}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            검수
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Review panel */}
            {selectedRequest && (
              <Card className="border-2 border-massemble-red">
                <CardHeader>
                  <CardTitle>검수 처리</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>고객: {selectedRequest.customer?.name}</Label>
                  </div>
                  <div>
                    <Label>관리자 메모 (반려 시 필수)</Label>
                    <Textarea
                      value={reviewMemo}
                      onChange={(e) => setReviewMemo(e.target.value)}
                      placeholder="검수 메모를 입력하세요..."
                      rows={4}
                      data-testid="textarea-admin-memo"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedRequest(null);
                        setReviewMemo("");
                      }}
                    >
                      취소
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleReject}
                      disabled={reviewMutation.isPending}
                      data-testid="button-reject"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      반려
                    </Button>
                    <Button
                      onClick={handleApprove}
                      disabled={reviewMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                      data-testid="button-approve"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      승인
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
