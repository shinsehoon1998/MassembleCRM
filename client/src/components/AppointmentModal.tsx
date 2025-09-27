import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar, Clock, MapPin, Bell, User } from "lucide-react";
import type { Appointment, User as UserType } from "@shared/schema";

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment?: Appointment | null;
  customerId?: string;
  customerName?: string;
  counselors?: UserType[];
}

export default function AppointmentModal({
  isOpen,
  onClose,
  appointment,
  customerId,
  customerName,
  counselors = []
}: AppointmentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch customers if customerId is not provided
  const { data: customersResponse = { customers: [] } } = useQuery<{customers: any[]}>({
    queryKey: ["/api/customers"],
    enabled: !customerId, // Only fetch if customerId is not provided
  });
  
  const customers = customersResponse.customers || [];

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    startAt: "",
    endAt: "",
    counselorId: "",
    selectedCustomerId: customerId || "",
    location: "",
    notes: "",
    remindSms: false,
    remindPopup: true,
    status: "scheduled"
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Helper function to convert field names and error messages to user-friendly Korean
  const getFieldErrorMessage = (fieldName: string, originalMessage: string): string => {
    const fieldNameMap: Record<string, string> = {
      title: "제목",
      customerId: "고객",
      counselorId: "담당 상담사",
      startAt: "시작 시간",
      endAt: "종료 시간",
      location: "장소",
      notes: "메모",
      createdBy: "생성자"
    };
    
    const fieldDisplayName = fieldNameMap[fieldName] || fieldName;
    
    if (originalMessage.includes("Required")) {
      return `${fieldDisplayName}을(를) 입력해주세요.`;
    }
    if (originalMessage.includes("Invalid date")) {
      return `${fieldDisplayName}의 날짜 형식이 올바르지 않습니다.`;
    }
    if (originalMessage.includes("String must contain at least")) {
      return `${fieldDisplayName}을(를) 입력해주세요.`;
    }
    if (originalMessage.includes("Expected string")) {
      return `${fieldDisplayName}은(는) 텍스트 형태여야 합니다.`;
    }
    
    // Default fallback
    return `${fieldDisplayName}: ${originalMessage}`;
  };

  // Reset form when modal opens/closes or appointment changes
  useEffect(() => {
    if (isOpen) {
      if (appointment) {
        // Edit mode - populate with existing data
        setFormData({
          title: appointment.title || "",
          startAt: format(new Date(appointment.startAt), "yyyy-MM-dd'T'HH:mm"),
          endAt: format(new Date(appointment.endAt), "yyyy-MM-dd'T'HH:mm"),
          counselorId: appointment.counselorId || "",
          selectedCustomerId: appointment.customerId || customerId || "",
          location: appointment.location || "",
          notes: appointment.notes || "",
          remindSms: appointment.remindSms || false,
          remindPopup: appointment.remindPopup !== false, // default to true
          status: appointment.status || "scheduled"
        });
      } else {
        // Create mode - set defaults
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
        
        setFormData({
          title: customerName ? `${customerName}님 상담` : "상담 예약",
          startAt: format(now, "yyyy-MM-dd'T'HH:mm"),
          endAt: format(oneHourLater, "yyyy-MM-dd'T'HH:mm"),
          counselorId: "",
          selectedCustomerId: customerId || "",
          location: "",
          notes: "",
          remindSms: false,
          remindPopup: true,
          status: "scheduled"
        });
      }
      setErrors({});
    }
  }, [isOpen, appointment, customerName]);

  // Create appointment mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const finalCustomerId = data.selectedCustomerId || customerId;
      if (!finalCustomerId) {
        throw new Error("고객을 선택해주세요.");
      }
      
      const payload = {
        ...data,
        customerId: finalCustomerId,
        startAt: new Date(data.startAt).toISOString(),
        endAt: new Date(data.endAt).toISOString(),
      };
      delete payload.selectedCustomerId; // Remove this as it's not part of the API schema
      return await apiRequest("POST", "/api/appointments", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: "성공",
        description: "예약이 생성되었습니다.",
      });
      onClose();
    },
    onError: (error: any) => {
      console.error('Appointment creation error:', error);
      
      // Handle validation errors from the server
      if (error?.errors && Array.isArray(error.errors)) {
        const fieldErrors: Record<string, string> = {};
        
        error.errors.forEach((zodError: any) => {
          if (zodError.path && zodError.path.length > 0) {
            const fieldName = zodError.path[0];
            fieldErrors[fieldName] = getFieldErrorMessage(fieldName, zodError.message);
          }
        });
        
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          toast({
            title: "입력 오류",
            description: "입력하신 정보를 확인해주세요.",
            variant: "destructive",
          });
          return;
        }
      }
      
      toast({
        title: "오류",
        description: error?.message || "예약 생성에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  // Update appointment mutation
  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        ...data,
        startAt: new Date(data.startAt).toISOString(),
        endAt: new Date(data.endAt).toISOString(),
      };
      return await apiRequest("PUT", `/api/appointments/${appointment?.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: "성공",
        description: "예약이 수정되었습니다.",
      });
      onClose();
    },
    onError: (error: any) => {
      console.error('Appointment update error:', error);
      
      // Handle validation errors from the server
      if (error?.errors && Array.isArray(error.errors)) {
        const fieldErrors: Record<string, string> = {};
        
        error.errors.forEach((zodError: any) => {
          if (zodError.path && zodError.path.length > 0) {
            const fieldName = zodError.path[0];
            fieldErrors[fieldName] = getFieldErrorMessage(fieldName, zodError.message);
          }
        });
        
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          toast({
            title: "입력 오류",
            description: "입력하신 정보를 확인해주세요.",
            variant: "destructive",
          });
          return;
        }
      }
      
      toast({
        title: "오류",
        description: error?.message || "예약 수정에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Check customer selection if customerId is not provided
    if (!customerId && !formData.selectedCustomerId) {
      newErrors.selectedCustomerId = "고객을 선택해주세요.";
    }

    if (!formData.title.trim()) {
      newErrors.title = "제목을 입력해주세요.";
    }

    if (!formData.startAt) {
      newErrors.startAt = "시작 시간을 선택해주세요.";
    }

    if (!formData.endAt) {
      newErrors.endAt = "종료 시간을 선택해주세요.";
    }

    if (!formData.counselorId) {
      newErrors.counselorId = "담당 상담사를 선택해주세요.";
    }

    if (formData.startAt && formData.endAt) {
      const startDate = new Date(formData.startAt);
      const endDate = new Date(formData.endAt);

      if (endDate <= startDate) {
        newErrors.endAt = "종료 시간은 시작 시간보다 늦어야 합니다.";
      }

      if (startDate < new Date()) {
        newErrors.startAt = "과거 시간으로는 예약할 수 없습니다.";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (appointment) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {appointment ? "예약 수정" : "새 예약 생성"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Selection (only if customerId not provided) */}
          {!customerId && (
            <div className="space-y-2">
              <Label htmlFor="selectedCustomerId" className="text-sm font-medium flex items-center gap-1">
                <User className="h-4 w-4" />
                고객 선택 *
              </Label>
              <Select
                value={formData.selectedCustomerId}
                onValueChange={(value) => handleInputChange("selectedCustomerId", value)}
              >
                <SelectTrigger className={errors.selectedCustomerId ? "border-red-500" : ""} data-testid="select-customer">
                  <SelectValue placeholder="고객을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer: any) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name} ({customer.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.selectedCustomerId && (
                <p className="text-sm text-red-500">{errors.selectedCustomerId}</p>
              )}
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium">
              예약 제목 *
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange("title", e.target.value)}
              placeholder="예: 김철수님 상담"
              className={errors.title ? "border-red-500" : ""}
              data-testid="input-appointment-title"
            />
            {errors.title && (
              <p className="text-sm text-red-500">{errors.title}</p>
            )}
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startAt" className="text-sm font-medium flex items-center gap-1">
                <Clock className="h-4 w-4" />
                시작 시간 *
              </Label>
              <Input
                id="startAt"
                type="datetime-local"
                value={formData.startAt}
                onChange={(e) => handleInputChange("startAt", e.target.value)}
                className={errors.startAt ? "border-red-500" : ""}
                data-testid="input-appointment-start"
              />
              {errors.startAt && (
                <p className="text-sm text-red-500">{errors.startAt}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endAt" className="text-sm font-medium flex items-center gap-1">
                <Clock className="h-4 w-4" />
                종료 시간 *
              </Label>
              <Input
                id="endAt"
                type="datetime-local"
                value={formData.endAt}
                onChange={(e) => handleInputChange("endAt", e.target.value)}
                className={errors.endAt ? "border-red-500" : ""}
                data-testid="input-appointment-end"
              />
              {errors.endAt && (
                <p className="text-sm text-red-500">{errors.endAt}</p>
              )}
            </div>
          </div>

          {/* Counselor */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1">
              <User className="h-4 w-4" />
              담당 상담사 *
            </Label>
            <Select
              value={formData.counselorId}
              onValueChange={(value) => handleInputChange("counselorId", value)}
            >
              <SelectTrigger className={errors.counselorId ? "border-red-500" : ""} data-testid="select-counselor">
                <SelectValue placeholder="상담사를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {counselors.map((counselor) => (
                  <SelectItem key={counselor.id} value={counselor.id}>
                    {counselor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.counselorId && (
              <p className="text-sm text-red-500">{errors.counselorId}</p>
            )}
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location" className="text-sm font-medium flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              장소 (선택사항)
            </Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => handleInputChange("location", e.target.value)}
              placeholder="예: 1층 상담실, 화상 상담"
              data-testid="input-appointment-location"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium">
              메모 (선택사항)
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange("notes", e.target.value)}
              placeholder="추가 정보나 특이사항을 입력하세요"
              rows={3}
              data-testid="textarea-appointment-notes"
            />
          </div>

          {/* Status (for edit mode) */}
          {appointment && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">상태</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => handleInputChange("status", value)}
              >
                <SelectTrigger data-testid="select-appointment-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">예정</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                  <SelectItem value="cancelled">취소</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Reminder Options */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-1">
              <Bell className="h-4 w-4" />
              알림 설정
            </Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="popupReminder"
                  checked={formData.remindPopup}
                  onCheckedChange={(checked) => handleInputChange("remindPopup", checked === true)}
                  data-testid="checkbox-popup-reminder"
                />
                <Label htmlFor="popupReminder" className="text-sm font-normal">
                  팝업 알림 (브라우저)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="smsReminder"
                  checked={formData.remindSms}
                  onCheckedChange={(checked) => handleInputChange("remindSms", checked === true)}
                  data-testid="checkbox-sms-reminder"
                />
                <Label htmlFor="smsReminder" className="text-sm font-normal">
                  SMS 알림
                </Label>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              data-testid="button-cancel-appointment"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-save-appointment"
            >
              {isLoading ? "저장 중..." : appointment ? "수정" : "생성"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}