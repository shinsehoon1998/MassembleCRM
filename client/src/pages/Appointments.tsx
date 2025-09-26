import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Calendar, Clock, User, Phone, MapPin, Plus, Search, Filter } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import AppointmentModal from "@/components/AppointmentModal";
import type { AppointmentWithDetails } from "@shared/schema";

export default function Appointments() {
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();

  // Fetch appointments
  const { data: appointments = [], isLoading } = useQuery<AppointmentWithDetails[]>({
    queryKey: ["/api/appointments"],
  });

  // Fetch counselors for the modal
  const { data: counselors = [] } = useQuery<any[]>({
    queryKey: ["/api/users/counselors"],
  });

  // Filter appointments based on status and search term
  const filteredAppointments = appointments.filter((appointment) => {
    const matchesStatus = statusFilter === "all" || appointment.status === statusFilter;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      (appointment.customerName || "").toLowerCase().includes(searchLower) ||
      (appointment.title || "").toLowerCase().includes(searchLower) ||
      (appointment.counselorName || "").toLowerCase().includes(searchLower);
    return matchesStatus && matchesSearch;
  });

  const handleAddAppointment = () => {
    setEditingAppointment(null);
    setIsAppointmentModalOpen(true);
  };

  const handleEditAppointment = (appointment: any) => {
    setEditingAppointment(appointment);
    setIsAppointmentModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      scheduled: { label: "예정", variant: "default" as const },
      completed: { label: "완료", variant: "default" as const },
      cancelled: { label: "취소", variant: "destructive" as const },
      no_show: { label: "노쇼", variant: "secondary" as const },
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || { label: status, variant: "default" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDateTime = (startAt: string | Date) => {
    return format(new Date(startAt), "yyyy년 M월 d일 (EEE) HH:mm", { locale: ko });
  };

  const calculateDuration = (startAt: string | Date, endAt: string | Date) => {
    const start = new Date(startAt);
    const end = new Date(endAt);
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    return durationMinutes;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">예약 목록을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">예약 관리</h1>
          <p className="text-gray-600 mt-1">모든 상담 예약을 관리할 수 있습니다</p>
        </div>
        <Button 
          onClick={handleAddAppointment}
          className="bg-blue-600 hover:bg-blue-700 text-white"
          data-testid="button-add-appointment"
        >
          <Plus className="h-4 w-4 mr-2" />
          새 예약 추가
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="고객명, 상담사명, 제목으로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-appointments"
                />
              </div>
            </div>
            <div className="sm:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="상태 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 상태</SelectItem>
                  <SelectItem value="scheduled">예정</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                  <SelectItem value="cancelled">취소</SelectItem>
                  <SelectItem value="no_show">노쇼</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appointments List */}
      <div className="grid gap-4">
        {filteredAppointments.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium mb-2">예약이 없습니다</p>
                <p className="text-sm">
                  {searchTerm || statusFilter !== "all" 
                    ? "검색 조건에 맞는 예약이 없습니다" 
                    : "첫 번째 예약을 추가해보세요"}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredAppointments.map((appointment) => (
            <Card key={appointment.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg text-gray-900" data-testid={`text-appointment-title-${appointment.id}`}>
                          {appointment.title}
                        </h3>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            <span data-testid={`text-appointment-datetime-${appointment.id}`}>
                              {formatDateTime(appointment.startAt)}
                            </span>
                          </div>
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            <span>{calculateDuration(appointment.startAt, appointment.endAt)}분</span>
                          </div>
                        </div>
                      </div>
                      {getStatusBadge(appointment.status)}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center text-gray-600">
                        <User className="h-4 w-4 mr-2" />
                        <span>고객: </span>
                        <span className="font-medium ml-1" data-testid={`text-customer-name-${appointment.id}`}>
                          {appointment.customerName}
                        </span>
                      </div>
                      <div className="flex items-center text-gray-600">
                        <User className="h-4 w-4 mr-2" />
                        <span>상담사: </span>
                        <span className="font-medium ml-1" data-testid={`text-counselor-name-${appointment.id}`}>
                          {appointment.counselorName}
                        </span>
                      </div>
                      {appointment.location && (
                        <div className="flex items-center text-gray-600">
                          <MapPin className="h-4 w-4 mr-2" />
                          <span data-testid={`text-location-${appointment.id}`}>
                            {appointment.location}
                          </span>
                        </div>
                      )}
                      {appointment.remindSms && (
                        <div className="flex items-center text-gray-600">
                          <Phone className="h-4 w-4 mr-2" />
                          <span>SMS 알림</span>
                        </div>
                      )}
                    </div>

                    {appointment.notes && (
                      <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                        <p data-testid={`text-notes-${appointment.id}`}>{appointment.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 lg:flex-col lg:w-24">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditAppointment(appointment)}
                      className="flex-1 lg:flex-none"
                      data-testid={`button-edit-appointment-${appointment.id}`}
                    >
                      수정
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 lg:flex-none text-red-600 hover:text-red-700 hover:bg-red-50"
                      data-testid={`button-delete-appointment-${appointment.id}`}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Appointment Modal */}
      <AppointmentModal
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        appointment={editingAppointment}
        counselors={counselors}
      />
    </div>
  );
}