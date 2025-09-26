import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowLeft, Edit, Plus, FileText, Clock, User, Phone, MapPin, Briefcase, Calendar } from "lucide-react";
import type { CustomerWithUser, Consultation, Attachment, ActivityLog } from "@shared/schema";
import CustomerModal from "@/components/CustomerModal";

export default function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newConsultNote, setNewConsultNote] = useState("");
  const [newConsultType, setNewConsultType] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customer, isLoading } = useQuery<CustomerWithUser>({
    queryKey: [`/api/customers/${params.id}`],
    enabled: !!params.id,
  });

  const { data: consultations = [] } = useQuery<Consultation[]>({
    queryKey: [`/api/customers/${params.id}/consultations`],
    enabled: !!params.id,
  });

  const { data: attachments = [] } = useQuery<Attachment[]>({
    queryKey: [`/api/customers/${params.id}/attachments`],
    enabled: !!params.id,
  });

  const { data: activityLogs = [] } = useQuery<ActivityLog[]>({
    queryKey: [`/api/customers/${params.id}/activity-logs`],
    enabled: !!params.id,
  });

  const { data: counselors = [] } = useQuery<any[]>({
    queryKey: ["/api/users/counselors"],
  });

  const createConsultationMutation = useMutation({
    mutationFn: async (data: { type: string; notes: string }) => {
      const payload = {
        title: `${data.type} 상담`,
        content: data.notes,
        consultType: data.type,
      };
      return await apiRequest("POST", `/api/customers/${params.id}/consultations`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${params.id}/consultations`] });
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${params.id}/activity-logs`] });
      setNewConsultNote("");
      setNewConsultType("");
      toast({
        title: "성공",
        description: "상담 기록이 추가되었습니다.",
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "상담 기록 추가에 실패했습니다.",
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

  const handleAddConsultation = () => {
    if (!newConsultNote.trim() || !newConsultType) {
      toast({
        title: "오류",
        description: "상담 유형과 내용을 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    createConsultationMutation.mutate({
      type: newConsultType,
      notes: newConsultNote.trim(),
    });
  };

  const getUploadParameters = async () => {
    const response = await apiRequest("POST", "/api/objects/upload");
    return {
      method: "PUT" as const,
      url: response.uploadURL,
    };
  };

  const handleFileUploadComplete = async (result: any) => {
    if (result.successful && result.successful.length > 0) {
      const file = result.successful[0];
      try {
        await apiRequest("POST", `/api/customers/${params.id}/attachments`, {
          originalName: file.name,
          filePath: file.uploadURL,
          fileSize: file.size,
          mimeType: file.type,
        });
        
        queryClient.invalidateQueries({ queryKey: [`/api/customers/${params.id}/attachments`] });
        queryClient.invalidateQueries({ queryKey: [`/api/customers/${params.id}/activity-logs`] });
        
        toast({
          title: "성공",
          description: "파일이 업로드되었습니다.",
        });
      } catch (error) {
        toast({
          title: "오류",
          description: "파일 정보 저장에 실패했습니다.",
          variant: "destructive",
        });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-gray-500">고객을 찾을 수 없습니다.</p>
          <Button 
            onClick={() => navigate("/customers")} 
            className="mt-4"
            data-testid="button-back-to-customers"
          >
            고객 목록으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="customer-detail-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={() => navigate("/customers")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            뒤로가기
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="customer-name">
              {customer.name}
            </h1>
            <div className="flex items-center gap-4 mt-2">
              <Badge className={getStatusBadgeClass(customer.status)} data-testid="customer-status">
                {customer.status}
              </Badge>
              <span className="text-sm text-gray-600">
                등록일: {format(new Date(customer.createdAt), 'yyyy년 MM월 dd일', { locale: ko })}
              </span>
            </div>
          </div>
        </div>
        <Button onClick={() => setIsEditModalOpen(true)} data-testid="button-edit-customer">
          <Edit className="h-4 w-4 mr-2" />
          수정
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" data-testid="tab-overview">개요</TabsTrigger>
          <TabsTrigger value="consultations" data-testid="tab-consultations">상담 기록</TabsTrigger>
          <TabsTrigger value="attachments" data-testid="tab-attachments">첨부파일</TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">활동 기록</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  기본 정보
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">이름</Label>
                    <p className="font-semibold" data-testid="customer-detail-name">{customer.name}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">성별</Label>
                    <p data-testid="customer-detail-gender">
                      {customer.gender === 'M' ? '남성' : customer.gender === 'F' ? '여성' : '미설정'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">생년월일</Label>
                    <p data-testid="customer-detail-birth-date">
                      {customer.birthDate 
                        ? format(new Date(customer.birthDate), 'yyyy년 MM월 dd일', { locale: ko })
                        : '-'
                      }
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">담당자</Label>
                    <p data-testid="customer-detail-counselor">
                      {customer.assignedUser?.name || '미지정'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  연락처 정보
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">주 연락처</Label>
                  <p className="font-semibold" data-testid="customer-detail-phone">{customer.phone}</p>
                </div>
                {customer.secondaryPhone && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">보조 연락처</Label>
                    <p data-testid="customer-detail-secondary-phone">{customer.secondaryPhone}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Address Information */}
            {(customer.address || customer.zipcode) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    주소 정보
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {customer.zipcode && (
                    <div>
                      <Label className="text-sm font-medium text-gray-500">우편번호</Label>
                      <p data-testid="customer-detail-zipcode">{customer.zipcode}</p>
                    </div>
                  )}
                  {customer.address && (
                    <div>
                      <Label className="text-sm font-medium text-gray-500">주소</Label>
                      <p data-testid="customer-detail-address">{customer.address}</p>
                      {customer.addressDetail && (
                        <p className="text-sm text-gray-600" data-testid="customer-detail-address-detail">
                          {customer.addressDetail}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Job Information */}
            {(customer.jobType || customer.companyName) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    직업 정보
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {customer.jobType && (
                    <div>
                      <Label className="text-sm font-medium text-gray-500">직업</Label>
                      <p data-testid="customer-detail-job-type">{customer.jobType}</p>
                    </div>
                  )}
                  {customer.companyName && (
                    <div>
                      <Label className="text-sm font-medium text-gray-500">회사명</Label>
                      <p data-testid="customer-detail-company-name">{customer.companyName}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Financial Information */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>재정 정보</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">월 소득</Label>
                  <p className="text-lg font-semibold text-green-600" data-testid="customer-detail-monthly-income">
                    {formatNumber(customer.monthlyIncome)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Consultation Information */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>상담 정보</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customer.consultType && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">상담 유형</Label>
                    <p data-testid="customer-detail-consult-type">{customer.consultType}</p>
                  </div>
                )}
                {customer.consultPath && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">상담 경로</Label>
                    <p data-testid="customer-detail-consult-path">{customer.consultPath}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Memo */}
            {customer.memo && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>메모</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap" data-testid="customer-detail-memo">{customer.memo}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Consultations Tab */}
        <TabsContent value="consultations" className="space-y-6">
          {/* Add Consultation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                상담 기록 추가
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="consultType">상담 유형</Label>
                  <Select value={newConsultType} onValueChange={setNewConsultType}>
                    <SelectTrigger data-testid="select-new-consult-type">
                      <SelectValue placeholder="상담 유형 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="전화상담">전화상담</SelectItem>
                      <SelectItem value="방문상담">방문상담</SelectItem>
                      <SelectItem value="이메일">이메일</SelectItem>
                      <SelectItem value="온라인상담">온라인상담</SelectItem>
                      <SelectItem value="기타">기타</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="consultNotes">상담 내용</Label>
                <Textarea
                  id="consultNotes"
                  value={newConsultNote}
                  onChange={(e) => setNewConsultNote(e.target.value)}
                  rows={3}
                  placeholder="상담 내용을 입력하세요..."
                  data-testid="textarea-consult-notes"
                />
              </div>
              <Button 
                onClick={handleAddConsultation} 
                disabled={createConsultationMutation.isPending}
                data-testid="button-add-consultation"
              >
                {createConsultationMutation.isPending ? "추가 중..." : "상담 기록 추가"}
              </Button>
            </CardContent>
          </Card>

          {/* Consultation History */}
          <Card>
            <CardHeader>
              <CardTitle>상담 이력</CardTitle>
            </CardHeader>
            <CardContent>
              {consultations.length === 0 ? (
                <p className="text-center text-gray-500 py-8" data-testid="no-consultations">
                  상담 기록이 없습니다.
                </p>
              ) : (
                <div className="space-y-4">
                  {consultations.map((consultation) => (
                    <div 
                      key={consultation.id} 
                      className="border-l-4 border-blue-500 pl-4 py-2"
                      data-testid={`consultation-${consultation.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" data-testid="consultation-type">
                          {consultation.consultType}
                        </Badge>
                        <span className="text-sm text-gray-500" data-testid="consultation-date">
                          {format(new Date(consultation.createdAt), 'yyyy년 MM월 dd일 HH:mm', { locale: ko })}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap" data-testid="consultation-notes">
                        {consultation.content}
                      </p>
                      {consultation.user && (
                        <p className="text-sm text-gray-500 mt-2" data-testid="consultation-counselor">
                          상담자: {consultation.user.name}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attachments Tab */}
        <TabsContent value="attachments" className="space-y-6">
          {/* File Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                파일 업로드
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ObjectUploader
                maxNumberOfFiles={5}
                maxFileSize={52428800} // 50MB
                onGetUploadParameters={getUploadParameters}
                onComplete={handleFileUploadComplete}
                data-testid="file-uploader"
              >
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  파일 업로드
                </div>
              </ObjectUploader>
            </CardContent>
          </Card>

          {/* Attachments List */}
          <Card>
            <CardHeader>
              <CardTitle>첨부파일 목록</CardTitle>
            </CardHeader>
            <CardContent>
              {attachments.length === 0 ? (
                <p className="text-center text-gray-500 py-8" data-testid="no-attachments">
                  첨부파일이 없습니다.
                </p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <div 
                      key={attachment.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`attachment-${attachment.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-gray-500" />
                        <div>
                          <p className="font-medium" data-testid="attachment-name">
                            {attachment.originalName}
                          </p>
                          <p className="text-sm text-gray-500" data-testid="attachment-info">
                            {Math.round(attachment.fileSize / 1024)}KB • {' '}
                            {format(new Date(attachment.createdAt), 'yyyy-MM-dd HH:mm', { locale: ko })}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" data-testid="button-download-attachment">
                        다운로드
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                활동 기록
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activityLogs.length === 0 ? (
                <p className="text-center text-gray-500 py-8" data-testid="no-activity-logs">
                  활동 기록이 없습니다.
                </p>
              ) : (
                <div className="space-y-4">
                  {activityLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className="flex items-start gap-4 pb-4 border-b border-gray-100 last:border-b-0"
                      data-testid={`activity-log-${log.id}`}
                    >
                      <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                      <div className="flex-1">
                        <p className="font-medium" data-testid="activity-description">
                          {log.description}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span data-testid="activity-user">
                            {log.user?.name || '시스템'}
                          </span>
                          <span data-testid="activity-date">
                            {format(new Date(log.createdAt), 'yyyy년 MM월 dd일 HH:mm', { locale: ko })}
                          </span>
                          <Badge variant="outline" className="text-xs" data-testid="activity-action">
                            {log.action}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Customer Edit Modal */}
      <CustomerModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        customer={customer}
        counselors={counselors}
      />
    </div>
  );
}