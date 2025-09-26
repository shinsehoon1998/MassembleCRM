import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCustomerSchema, type CustomerWithUser, type User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: CustomerWithUser | null;
  counselors: User[];
}

const customerFormSchema = insertCustomerSchema.extend({
  birthDate: z.string().optional(),
  debtAmount: z.string().optional(),
  monthlyIncome: z.string().optional(),
});

type CustomerFormData = z.infer<typeof customerFormSchema>;

export default function CustomerModal({ isOpen, onClose, customer, counselors }: CustomerModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      secondaryPhone: "",
      birthDate: "",
      gender: "N",
      zipcode: "",
      address: "",
      addressDetail: "",
      debtAmount: "",
      monthlyIncome: "",
      jobType: "",
      companyName: "",
      consultType: "",
      consultPath: "",
      status: "인텍",
      assignedUserId: "",
      secondaryUserId: "",
      department: "",
      team: "",
      source: "manual",
      memo1: "",
    },
  });

  const watchedValues = watch();

  useEffect(() => {
    if (customer) {
      reset({
        name: customer.name,
        phone: customer.phone,
        secondaryPhone: customer.secondaryPhone || "",
        birthDate: customer.birthDate ? new Date(customer.birthDate).toISOString().split('T')[0] : "",
        gender: customer.gender || "N",
        zipcode: customer.zipcode || "",
        address: customer.address || "",
        addressDetail: customer.addressDetail || "",
        debtAmount: "",
        monthlyIncome: customer.monthlyIncome?.toString() || "",
        jobType: customer.jobType || "",
        companyName: customer.companyName || "",
        consultType: customer.consultType || "",
        consultPath: customer.consultPath || "",
        status: customer.status,
        assignedUserId: customer.assignedUserId || "",
        secondaryUserId: customer.secondaryUserId || "",
        department: customer.department || "",
        team: customer.team || "",
        source: customer.source || "manual",
        memo1: customer.memo1 || "",
      });
    } else {
      reset({
        name: "",
        phone: "",
        secondaryPhone: "",
        birthDate: "",
        gender: "N",
        zipcode: "",
        address: "",
        addressDetail: "",
        debtAmount: "",
        monthlyIncome: "",
        jobType: "",
        companyName: "",
        consultType: "",
        consultPath: "",
        status: "인텍",
        assignedUserId: "",
        secondaryUserId: "",
        department: "",
        team: "",
        source: "manual",
        memo1: "",
      });
    }
  }, [customer, reset]);

  const createCustomerMutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      const payload = {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate).toISOString() : null,
        debtAmount: data.debtAmount || null,
        monthlyIncome: data.monthlyIncome || null,
        assignedUserId: data.assignedUserId || null,
        secondaryUserId: data.secondaryUserId || null,
        secondaryPhone: data.secondaryPhone || null,
        zipcode: data.zipcode || null,
        address: data.address || null,
        addressDetail: data.addressDetail || null,
        jobType: data.jobType || null,
        companyName: data.companyName || null,
        consultType: data.consultType || null,
        consultPath: data.consultPath || null,
        department: data.department || null,
        team: data.team || null,
        source: data.source || "manual",
        memo1: data.memo1 || null,
      };
      
      if (customer) {
        return await apiRequest("PUT", `/api/customers/${customer.id}`, payload);
      } else {
        return await apiRequest("POST", "/api/customers", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: "성공",
        description: customer ? "고객 정보가 수정되었습니다." : "새 고객이 등록되었습니다.",
      });
      onClose();
    },
    onError: (error) => {
      console.error("Customer save error:", error);
      toast({
        title: "오류",
        description: customer ? "고객 정보 수정에 실패했습니다." : "고객 등록에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CustomerFormData) => {
    createCustomerMutation.mutate(data);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="customer-modal">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-gray-900">
            {customer ? "고객 정보 수정" : "신규 고객 등록"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="name">이름 *</Label>
              <Input
                id="name"
                {...register("name")}
                data-testid="input-customer-name"
                className={errors.name ? "border-red-500" : ""}
              />
              {errors.name && (
                <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="phone">연락처 *</Label>
              <Input
                id="phone"
                type="tel"
                {...register("phone")}
                data-testid="input-customer-phone"
                className={errors.phone ? "border-red-500" : ""}
              />
              {errors.phone && (
                <p className="text-sm text-red-500 mt-1">{errors.phone.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="secondaryPhone">보조 연락처</Label>
              <Input
                id="secondaryPhone"
                type="tel"
                {...register("secondaryPhone")}
                data-testid="input-customer-secondary-phone"
              />
            </div>
            
            <div>
              <Label htmlFor="birthDate">생년월일</Label>
              <Input
                id="birthDate"
                type="date"
                {...register("birthDate")}
                data-testid="input-customer-birth-date"
              />
            </div>
            
            <div>
              <Label htmlFor="gender">성별</Label>
              <Select
                value={watchedValues.gender || "N"}
                onValueChange={(value) => setValue("gender", value as "M" | "F" | "N")}
              >
                <SelectTrigger data-testid="select-customer-gender">
                  <SelectValue placeholder="선택안함" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="N">선택안함</SelectItem>
                  <SelectItem value="M">남성</SelectItem>
                  <SelectItem value="F">여성</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="monthlyIncome">월소득</Label>
              <Input
                id="monthlyIncome"
                type="number"
                {...register("monthlyIncome")}
                data-testid="input-customer-monthly-income"
              />
            </div>
            
            <div>
              <Label htmlFor="assignedUserId">담당자</Label>
              <Select
                value={watchedValues.assignedUserId || ""}
                onValueChange={(value) => setValue("assignedUserId", value)}
              >
                <SelectTrigger data-testid="select-customer-counselor">
                  <SelectValue placeholder="미지정" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">미지정</SelectItem>
                  {counselors.map((counselor) => (
                    <SelectItem key={counselor.id} value={counselor.id}>
                      {counselor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="status">상태</Label>
              <Select
                value={watchedValues.status}
                onValueChange={(value) => setValue("status", value as any)}
              >
                <SelectTrigger data-testid="select-customer-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="인텍">인텍</SelectItem>
                  <SelectItem value="수수">수수</SelectItem>
                  <SelectItem value="접수">접수</SelectItem>
                  <SelectItem value="작업">작업</SelectItem>
                  <SelectItem value="완료">완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* 주소 정보 */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">주소 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="zipcode">우편번호</Label>
                <Input
                  id="zipcode"
                  {...register("zipcode")}
                  data-testid="input-customer-zipcode"
                  placeholder="12345"
                />
              </div>
              
              <div className="md:col-span-2">
                <Label htmlFor="address">주소</Label>
                <Input
                  id="address"
                  {...register("address")}
                  data-testid="input-customer-address"
                  placeholder="서울시 강남구 역삼동"
                />
              </div>
              
              <div className="md:col-span-3">
                <Label htmlFor="addressDetail">상세주소</Label>
                <Input
                  id="addressDetail"
                  {...register("addressDetail")}
                  data-testid="input-customer-address-detail"
                  placeholder="123번지 456호"
                />
              </div>
            </div>
          </div>
          
          {/* 직업 정보 */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">직업 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="jobType">직업</Label>
                <Input
                  id="jobType"
                  {...register("jobType")}
                  data-testid="input-customer-job-type"
                  placeholder="사무직, 서비스업, 자영업 등"
                />
              </div>
              
              <div>
                <Label htmlFor="companyName">회사명</Label>
                <Input
                  id="companyName"
                  {...register("companyName")}
                  data-testid="input-customer-company-name"
                  placeholder="회사명 입력"
                />
              </div>
            </div>
          </div>
          
          {/* 상담 정보 */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">상담 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="consultType">상담 유형</Label>
                <Select
                  value={watchedValues.consultType || ""}
                  onValueChange={(value) => setValue("consultType", value)}
                >
                  <SelectTrigger data-testid="select-customer-consult-type">
                    <SelectValue placeholder="상담 유형 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="other">다른위치</SelectItem>
                    <SelectItem value="개인회생">개인회생</SelectItem>
                    <SelectItem value="개인파산">개인파산</SelectItem>
                    <SelectItem value="임임처분">임임처분</SelectItem>
                    <SelectItem value="상담만">상담만</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="consultPath">상담 경로</Label>
                <Select
                  value={watchedValues.consultPath || ""}
                  onValueChange={(value) => setValue("consultPath", value)}
                >
                  <SelectTrigger data-testid="select-customer-consult-path">
                    <SelectValue placeholder="상담 경로 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="waiting">대기</SelectItem>
                    <SelectItem value="인터넷">인터넷</SelectItem>
                    <SelectItem value="전화">전화</SelectItem>
                    <SelectItem value="지인소개">지인소개</SelectItem>
                    <SelectItem value="방문">방문</SelectItem>
                    <SelectItem value="기타">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* 부가 담당자 */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">추가 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="secondaryUserId">부가 담당자</Label>
                <Select
                  value={watchedValues.secondaryUserId || ""}
                  onValueChange={(value) => setValue("secondaryUserId", value)}
                >
                  <SelectTrigger data-testid="select-customer-secondary-counselor">
                    <SelectValue placeholder="부가 담당자 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    {counselors.map((counselor) => (
                      <SelectItem key={counselor.id} value={counselor.id}>
                        {counselor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="source">등록 경로</Label>
                <Select
                  value={watchedValues.source || "manual"}
                  onValueChange={(value) => setValue("source", value)}
                >
                  <SelectTrigger data-testid="select-customer-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">수동 등록</SelectItem>
                    <SelectItem value="web">웹 사이트</SelectItem>
                    <SelectItem value="phone">전화 상담</SelectItem>
                    <SelectItem value="import">데이터 가져오기</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <div className="border-t pt-6">
            <Label className="text-lg font-semibold mb-4 block">메모</Label>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="memo1">메모</Label>
                <Textarea
                  id="memo1"
                  rows={3}
                  {...register("memo1")}
                  data-testid="input-customer-memo1"
                  placeholder="메모를 입력하세요..."
                />
              </div>
            </div>
          </div>

          {customer && (
            <div className="border-t pt-6">
              <Label className="text-lg font-semibold mb-4 block">설문조사 정보 (읽기전용)</Label>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {customer.info1 && (
                  <div>
                    <Label className="text-sm text-gray-600">정보1</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm" data-testid="text-info1">
                      {customer.info1}
                    </div>
                  </div>
                )}
                {customer.info2 && (
                  <div>
                    <Label className="text-sm text-gray-600">정보2</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm" data-testid="text-info2">
                      {customer.info2}
                    </div>
                  </div>
                )}
                {customer.info3 && (
                  <div>
                    <Label className="text-sm text-gray-600">정보3</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm" data-testid="text-info3">
                      {customer.info3}
                    </div>
                  </div>
                )}
                {customer.info4 && (
                  <div>
                    <Label className="text-sm text-gray-600">정보4</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm" data-testid="text-info4">
                      {customer.info4}
                    </div>
                  </div>
                )}
                {customer.info5 && (
                  <div>
                    <Label className="text-sm text-gray-600">정보5</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm" data-testid="text-info5">
                      {customer.info5}
                    </div>
                  </div>
                )}
                {customer.info6 && (
                  <div>
                    <Label className="text-sm text-gray-600">정보6</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm" data-testid="text-info6">
                      {customer.info6}
                    </div>
                  </div>
                )}
                {customer.info7 && (
                  <div>
                    <Label className="text-sm text-gray-600">정보7</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm" data-testid="text-info7">
                      {customer.info7}
                    </div>
                  </div>
                )}
                {customer.info8 && (
                  <div>
                    <Label className="text-sm text-gray-600">정보8</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm" data-testid="text-info8">
                      {customer.info8}
                    </div>
                  </div>
                )}
                {customer.info9 && (
                  <div>
                    <Label className="text-sm text-gray-600">정보9</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm" data-testid="text-info9">
                      {customer.info9}
                    </div>
                  </div>
                )}
                {customer.info10 && (
                  <div className="lg:col-span-2">
                    <Label className="text-sm text-gray-600">정보10</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm" data-testid="text-info10">
                      {customer.info10}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter className="pt-6 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={handleClose} data-testid="button-cancel">
              취소
            </Button>
            <Button 
              type="submit" 
              disabled={createCustomerMutation.isPending}
              className="bg-primary-500 hover:bg-primary-600"
              data-testid="button-save-customer"
            >
              {createCustomerMutation.isPending ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>저장 중...</span>
                </div>
              ) : (
                customer ? "수정" : "등록"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
