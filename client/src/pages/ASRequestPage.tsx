import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Plus, X, Upload, FileText, CheckCircle, Clock, XCircle } from "lucide-react";

export default function ASRequestPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [totalAllocated, setTotalAllocated] = useState("");
  const [asRequestCount, setAsRequestCount] = useState("");
  const [selectedCustomers, setSelectedCustomers] = useState<any[]>([]);
  const [customerReasons, setCustomerReasons] = useState<Record<string, string>>({});
  const [customerFiles, setCustomerFiles] = useState<Record<string, Array<{ url: string; fileName: string; originalName: string; size: number; type: string }>>>({});
  const [isCustomerSelectOpen, setIsCustomerSelectOpen] = useState(false);
  const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(null);
  const [selectedCampaignForDetail, setSelectedCampaignForDetail] = useState<any | null>(null);

  // Fetch AS campaigns
  const { data: campaignsData, isLoading } = useQuery<{
    campaigns: any[];
    total: number;
    totalPages: number;
  }>({
    queryKey: ["/api/as-campaigns"],
  });

  const campaigns = campaignsData?.campaigns || [];

  // Fetch customers for selection
  const { data: customersData } = useQuery<{ customers: any[] }>({
    queryKey: ["/api/customers"],
  });

  const customers = customersData?.customers || [];

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    mutationFn: async (data: { name: string; totalAllocated: number; asRequestCount: number }) => {
      return await apiRequest("POST", "/api/as-campaigns", data);
    },
    onSuccess: (campaign: any) => {
      toast({
        title: "캠페인이 생성되었습니다",
        description: "이제 A.S 요청을 추가하세요.",
      });
      setCurrentCampaignId(campaign.id);
      setIsCreateModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/as-campaigns"] });
    },
    onError: (error: any) => {
      toast({
        title: "오류",
        description: error.message || "캠페인 생성에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  // Submit campaign mutation
  const submitCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      return await apiRequest("POST", `/api/as-campaigns/${campaignId}/submit`, {});
    },
    onSuccess: () => {
      toast({
        title: "검수 요청 완료",
        description: "관리자 검수를 기다려주세요.",
      });
      setCurrentCampaignId(null);
      setSelectedCustomers([]);
      setCustomerReasons({});
      queryClient.invalidateQueries({ queryKey: ["/api/as-campaigns"] });
    },
    onError: (error: any) => {
      toast({
        title: "오류",
        description: error.message || "검수 요청에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  // Create AS request mutation
  const createASRequestMutation = useMutation({
    mutationFn: async (data: { campaignId: string; customerId: string; reason: string }) => {
      return await apiRequest("POST", "/api/as-requests", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/as-campaigns"] });
    },
  });

  // Upload attachment mutation
  const uploadAttachmentMutation = useMutation({
    mutationFn: async (data: {
      asRequestId: string;
      fileName: string;
      originalName: string;
      filePath: string;
      fileSize: number;
      fileType: string;
      mimeType: string;
    }) => {
      return await apiRequest("POST", "/api/as-attachments", data);
    },
  });

  const handleCreateCampaign = async () => {
    const allocated = Number(totalAllocated);
    const requested = Number(asRequestCount);

    if (!campaignName || !allocated || !requested) {
      toast({
        title: "오류",
        description: "캠페인명, 총 배분 수량, A.S 요청 수량은 필수입니다.",
        variant: "destructive",
      });
      return;
    }

    if (requested > allocated * 0.2) {
      toast({
        title: "오류",
        description: "A.S 요청 수량은 총 배분 수량의 20%를 초과할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    try {
      // 1. 캠페인 생성
      const campaign = await createCampaignMutation.mutateAsync({
        name: campaignName,
        totalAllocated: allocated,
        asRequestCount: requested,
      });

      // 2. 선택된 고객들에 대해 A.S 요청 생성
      if (selectedCustomers.length > 0) {
        for (const customer of selectedCustomers) {
          const reason = customerReasons[customer.id] || "";
          
          const asRequest: any = await createASRequestMutation.mutateAsync({
            campaignId: campaign.id,
            customerId: customer.id,
            reason,
          });

          // 3. 해당 고객의 파일이 있으면 업로드
          const files = customerFiles[customer.id] || [];
          if (files.length > 0) {
            for (const file of files) {
              await uploadAttachmentMutation.mutateAsync({
                asRequestId: asRequest.id,
                fileName: file.fileName,
                originalName: file.originalName,
                filePath: file.url,
                fileSize: file.size,
                fileType: file.type.startsWith("audio") ? "audio" : "image",
                mimeType: file.type,
              });
            }
          }
        }

        // 4. 캠페인 제출
        await submitCampaignMutation.mutateAsync(campaign.id);

        toast({
          title: "캠페인 생성 완료",
          description: "A.S 캠페인이 성공적으로 생성되고 제출되었습니다.",
        });
      } else {
        toast({
          title: "캠페인 생성 완료",
          description: "캠페인이 생성되었습니다. 고객을 추가하고 검수 요청하세요.",
        });
        setCurrentCampaignId(campaign.id);
      }

      // 초기화
      setCampaignName("");
      setTotalAllocated("");
      setAsRequestCount("");
      setSelectedCustomers([]);
      setCustomerReasons({});
      setCustomerFiles({});
      setIsCreateModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/as-campaigns"] });

    } catch (error: any) {
      toast({
        title: "오류",
        description: error.message || "캠페인 생성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleAddCustomers = () => {
    if (!currentCampaignId) {
      toast({
        title: "오류",
        description: "먼저 캠페인을 생성해주세요.",
        variant: "destructive",
      });
      return;
    }
    setIsCustomerSelectOpen(true);
  };

  const handleCustomerSelect = (customer: any) => {
    const isSelected = selectedCustomers.some(c => c.id === customer.id);
    if (isSelected) {
      setSelectedCustomers(selectedCustomers.filter(c => c.id !== customer.id));
      const newReasons = { ...customerReasons };
      delete newReasons[customer.id];
      setCustomerReasons(newReasons);
    } else {
      setSelectedCustomers([...selectedCustomers, customer]);
    }
  };

  const handleSubmitCampaign = async () => {
    if (!currentCampaignId) return;

    // Create AS requests for all selected customers
    for (const customer of selectedCustomers) {
      const reason = customerReasons[customer.id] || "";
      if (!reason) {
        toast({
          title: "오류",
          description: `${customer.name}의 A.S 사유를 입력해주세요.`,
          variant: "destructive",
        });
        return;
      }

      await createASRequestMutation.mutateAsync({
        campaignId: currentCampaignId,
        customerId: customer.id,
        reason,
      });
    }

    // Submit campaign
    submitCampaignMutation.mutate(currentCampaignId);
  };

  const getUploadParameters = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("파일 업로드에 실패했습니다.");
    }

    const data = await response.json();
    return {
      url: data.url,
      fileName: data.fileName,
    };
  };

  const handleFileUploadComplete = async (files: Array<{ url: string; fileName: string; originalName: string; size: number; type: string }>, asRequestId: string) => {
    for (const file of files) {
      await uploadAttachmentMutation.mutateAsync({
        asRequestId,
        fileName: file.fileName,
        originalName: file.originalName,
        filePath: file.url,
        fileSize: file.size,
        fileType: file.type.startsWith("audio") ? "audio" : "image",
        mimeType: file.type,
      });
    }

    toast({
      title: "파일 업로드 완료",
      description: `${files.length}개의 파일이 업로드되었습니다.`,
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">로딩 중...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">A.S 요청 관리</h1>
          <p className="text-gray-600 mt-2">고객 A.S 요청을 생성하고 관리합니다</p>
        </div>
        
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-massemble-red hover:bg-massemble-red/90" data-testid="button-create-campaign">
              <Plus className="h-4 w-4 mr-2" />
              새 캠페인 생성
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>A.S 캠페인 생성</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* 기본 정보 */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">기본 정보</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>캠페인명 *</Label>
                    <Input
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="2025년 1월 A.S 요청"
                      data-testid="input-campaign-name"
                    />
                  </div>
                  <div>
                    <Label>총 배분 수량 *</Label>
                    <Input
                      type="number"
                      value={totalAllocated}
                      onChange={(e) => setTotalAllocated(e.target.value)}
                      placeholder="100"
                      data-testid="input-total-allocated"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>A.S 요청 수량 * (최대 {totalAllocated ? Math.floor(Number(totalAllocated) * 0.2) : 0})</Label>
                    <Input
                      type="number"
                      value={asRequestCount}
                      onChange={(e) => setAsRequestCount(e.target.value)}
                      placeholder="20"
                      data-testid="input-as-count"
                    />
                    {totalAllocated && asRequestCount && Number(asRequestCount) > Number(totalAllocated) * 0.2 && (
                      <p className="text-sm text-red-600 mt-1">
                        A.S 수량은 총 배분 수량의 20%를 초과할 수 없습니다
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 고객 선택 및 개별 설정 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="font-semibold text-lg">고객 선택 및 설정 (선택사항)</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCustomerSelectOpen(true)}
                    data-testid="button-select-customers"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    고객 추가
                  </Button>
                </div>
                
                {selectedCustomers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">고객을 추가하여 A.S 요청을 시작하세요</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {selectedCustomers.map((customer) => (
                      <Card key={customer.id} className="border-2">
                        <CardContent className="pt-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">{customer.name}</p>
                              <p className="text-sm text-gray-600">{customer.phone}</p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedCustomers(selectedCustomers.filter(c => c.id !== customer.id));
                                const newReasons = { ...customerReasons };
                                delete newReasons[customer.id];
                                setCustomerReasons(newReasons);
                                const newFiles = { ...customerFiles };
                                delete newFiles[customer.id];
                                setCustomerFiles(newFiles);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          {/* 개별 메모 */}
                          <div>
                            <Label className="text-sm">A.S 사유</Label>
                            <Textarea
                              value={customerReasons[customer.id] || ""}
                              onChange={(e) =>
                                setCustomerReasons({ ...customerReasons, [customer.id]: e.target.value })
                              }
                              placeholder="A.S가 필요한 사유를 입력하세요..."
                              rows={2}
                              data-testid={`textarea-reason-${customer.id}`}
                            />
                          </div>

                          {/* 개별 파일 업로드 */}
                          <div>
                            <Label className="text-sm">증빙 파일</Label>
                            <ObjectUploader
                              maxNumberOfFiles={5}
                              maxFileSize={52428800}
                              onGetUploadParameters={async () => {
                                const response = await fetch("/api/object-storage/signed-url", {
                                  method: "POST",
                                  credentials: "include",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ fileName: `as-${customer.id}-${Date.now()}` }),
                                });
                                const data = await response.json();
                                return { method: "PUT" as const, url: data.url };
                              }}
                              onComplete={(result) => {
                                const files = (result.successful || []).map((file) => ({
                                  url: file.uploadURL || "",
                                  fileName: file.name || "",
                                  originalName: file.name || "",
                                  size: file.size || 0,
                                  type: file.type || "",
                                }));
                                const currentFiles = customerFiles[customer.id] || [];
                                setCustomerFiles({ 
                                  ...customerFiles, 
                                  [customer.id]: [...currentFiles, ...files] 
                                });
                                toast({
                                  title: "파일 업로드 완료",
                                  description: `${customer.name}의 파일 ${files.length}개가 업로드되었습니다.`,
                                });
                              }}
                              buttonClassName="w-full"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              파일 선택 (최대 5개)
                            </ObjectUploader>
                            {(customerFiles[customer.id] || []).length > 0 && (
                              <div className="mt-2 space-y-1">
                                {(customerFiles[customer.id] || []).map((file, idx) => (
                                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                                    <span className="truncate flex-1">{file.originalName}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const newFiles = (customerFiles[customer.id] || []).filter((_, i) => i !== idx);
                                        setCustomerFiles({ ...customerFiles, [customer.id]: newFiles });
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* 버튼 */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setCampaignName("");
                    setTotalAllocated("");
                    setAsRequestCount("");
                    setSelectedCustomers([]);
                    setCustomerReasons({});
                    setCustomerFiles({});
                  }}
                >
                  취소
                </Button>
                <Button
                  onClick={handleCreateCampaign}
                  disabled={createCampaignMutation.isPending || submitCampaignMutation.isPending}
                  className="bg-massemble-red hover:bg-massemble-red/90"
                  data-testid="button-confirm-create"
                >
                  {createCampaignMutation.isPending || submitCampaignMutation.isPending ? "생성 중..." : "생성 완료"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Campaign stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">검수 대기</p>
                <p className="text-2xl font-bold">
                  {campaigns.filter(c => c.status === 'submitted').length}
                </p>
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
                <p className="text-2xl font-bold">
                  {campaigns.filter(c => c.status === 'reviewed').length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current campaign editing */}
      {currentCampaignId && (
        <Card className="border-2 border-massemble-red">
          <CardHeader>
            <CardTitle>현재 작업 중인 캠페인</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">선택된 고객: {selectedCustomers.length}명</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleAddCustomers} data-testid="button-add-customers">
                  <Plus className="h-4 w-4 mr-2" />
                  고객 추가
                </Button>
                <Button
                  onClick={handleSubmitCampaign}
                  disabled={selectedCustomers.length === 0 || submitCampaignMutation.isPending}
                  className="bg-massemble-red hover:bg-massemble-red/90"
                  data-testid="button-submit-campaign"
                >
                  검수 요청
                </Button>
              </div>
            </div>

            {selectedCustomers.length > 0 && (
              <div className="space-y-3">
                {selectedCustomers.map((customer) => (
                  <Card key={customer.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium">{customer.name}</p>
                          <p className="text-sm text-gray-600">{customer.phone}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCustomerSelect(customer)}
                          data-testid={`button-remove-customer-${customer.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label>A.S 사유</Label>
                        <Textarea
                          value={customerReasons[customer.id] || ""}
                          onChange={(e) =>
                            setCustomerReasons({ ...customerReasons, [customer.id]: e.target.value })
                          }
                          placeholder="A.S가 필요한 사유를 입력하세요..."
                          data-testid={`textarea-reason-${customer.id}`}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Customer selection modal */}
      <Dialog open={isCustomerSelectOpen} onOpenChange={setIsCustomerSelectOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>고객 선택</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {customers.map((customer: any) => {
              const isSelected = selectedCustomers.some(c => c.id === customer.id);
              return (
                <div
                  key={customer.id}
                  className={`p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                    isSelected ? 'border-massemble-red bg-red-50' : ''
                  }`}
                  onClick={() => handleCustomerSelect(customer)}
                  data-testid={`customer-option-${customer.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-sm text-gray-600">{customer.phone}</p>
                    </div>
                    {isSelected && <CheckCircle className="h-5 w-5 text-massemble-red" />}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Campaigns list */}
      <Card>
        <CardHeader>
          <CardTitle>내 A.S 캠페인</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>생성된 캠페인이 없습니다</p>
              <p className="text-sm mt-2">새 캠페인을 생성해보세요</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign: any) => (
                <Card key={campaign.id} className="hover:shadow-md transition-shadow" data-testid={`campaign-${campaign.id}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{campaign.name}</h3>
                          <Badge
                            variant={
                              campaign.status === 'draft' ? 'secondary' :
                              campaign.status === 'submitted' ? 'default' :
                              'outline'
                            }
                          >
                            {campaign.status === 'draft' ? '작성중' :
                             campaign.status === 'submitted' ? '검수대기' :
                             '검수완료'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                          <div>총 배분: {campaign.totalAllocated}</div>
                          <div>A.S 요청: {campaign.asRequestCount}</div>
                          <div>생성일: {format(new Date(campaign.createdAt), 'yyyy-MM-dd', { locale: ko })}</div>
                          <div>
                            비율: {((campaign.asRequestCount / campaign.totalAllocated) * 100).toFixed(1)}%
                          </div>
                        </div>
                        {campaign.requestStats && (
                          <div className="mt-2 flex gap-3 text-sm">
                            <span className="text-green-600">승인: {campaign.requestStats.approved}</span>
                            <span className="text-red-600">반려: {campaign.requestStats.rejected}</span>
                            <span className="text-yellow-600">대기: {campaign.requestStats.pending}</span>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedCampaignForDetail(campaign)}
                        data-testid={`button-view-campaign-${campaign.id}`}
                      >
                        상세보기
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Detail Dialog */}
      <Dialog open={!!selectedCampaignForDetail} onOpenChange={(open) => !open && setSelectedCampaignForDetail(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>캠페인 상세정보</DialogTitle>
          </DialogHeader>
          {selectedCampaignForDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">캠페인명</Label>
                  <p className="text-lg font-semibold">{selectedCampaignForDetail.name}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">상태</Label>
                  <div className="mt-1">
                    <Badge
                      variant={
                        selectedCampaignForDetail.status === 'draft' ? 'secondary' :
                        selectedCampaignForDetail.status === 'submitted' ? 'default' :
                        'outline'
                      }
                    >
                      {selectedCampaignForDetail.status === 'draft' ? '작성중' :
                       selectedCampaignForDetail.status === 'submitted' ? '검수대기' :
                       '검수완료'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">총 배분</Label>
                  <p className="text-lg">{selectedCampaignForDetail.totalAllocated}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">A.S 요청</Label>
                  <p className="text-lg">{selectedCampaignForDetail.asRequestCount}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">생성일</Label>
                  <p className="text-lg">
                    {format(new Date(selectedCampaignForDetail.createdAt), 'yyyy-MM-dd HH:mm', { locale: ko })}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">비율</Label>
                  <p className="text-lg">
                    {((selectedCampaignForDetail.asRequestCount / selectedCampaignForDetail.totalAllocated) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              {selectedCampaignForDetail.requestStats && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">요청 통계</Label>
                  <div className="mt-2 flex gap-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="text-green-600 font-medium">승인: {selectedCampaignForDetail.requestStats.approved}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <span className="text-red-600 font-medium">반려: {selectedCampaignForDetail.requestStats.rejected}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-yellow-600" />
                      <span className="text-yellow-600 font-medium">대기: {selectedCampaignForDetail.requestStats.pending}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">캠페인 작업</h3>
                <div className="flex gap-2">
                  {selectedCampaignForDetail.status === 'draft' && (
                    <>
                      <Button
                        onClick={() => {
                          setCurrentCampaignId(selectedCampaignForDetail.id);
                          setSelectedCampaignForDetail(null);
                          setIsCustomerSelectOpen(true);
                        }}
                        data-testid="button-add-customers-detail"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        고객 추가
                      </Button>
                      {selectedCustomers.length > 0 && (
                        <Button
                          onClick={() => {
                            setCurrentCampaignId(selectedCampaignForDetail.id);
                            handleSubmitCampaign();
                            setSelectedCampaignForDetail(null);
                          }}
                          variant="default"
                          data-testid="button-submit-campaign-detail"
                        >
                          검수 요청
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => setSelectedCampaignForDetail(null)}
                    data-testid="button-close-detail"
                  >
                    닫기
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
