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
      debtAmount: "",
      monthlyIncome: "",
      status: "인텍",
      assignedUserId: "",
      memo: "",
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
        debtAmount: customer.debtAmount || "",
        monthlyIncome: customer.monthlyIncome || "",
        status: customer.status,
        assignedUserId: customer.assignedUserId || "",
        memo: customer.memo || "",
      });
    } else {
      reset({
        name: "",
        phone: "",
        secondaryPhone: "",
        birthDate: "",
        gender: "N",
        debtAmount: "",
        monthlyIncome: "",
        status: "인텍",
        assignedUserId: "",
        memo: "",
      });
    }
  }, [customer, reset]);

  const createCustomerMutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      const payload = {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate).toISOString() : null,
        debtAmount: data.debtAmount ? data.debtAmount.toString() : null,
        monthlyIncome: data.monthlyIncome ? data.monthlyIncome.toString() : null,
        assignedUserId: data.assignedUserId || null,
        secondaryPhone: data.secondaryPhone || null,
        memo: data.memo || null,
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
                value={watchedValues.gender}
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
              <Label htmlFor="debtAmount">채무금액</Label>
              <Input
                id="debtAmount"
                type="number"
                {...register("debtAmount")}
                data-testid="input-customer-debt-amount"
              />
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
                value={watchedValues.assignedUserId}
                onValueChange={(value) => setValue("assignedUserId", value)}
              >
                <SelectTrigger data-testid="select-customer-counselor">
                  <SelectValue placeholder="미지정" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">미지정</SelectItem>
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
          
          <div>
            <Label htmlFor="memo">메모</Label>
            <Textarea
              id="memo"
              rows={3}
              {...register("memo")}
              data-testid="input-customer-memo"
            />
          </div>
          
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
