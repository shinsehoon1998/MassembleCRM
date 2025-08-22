import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import StatusChart from "@/components/StatusChart";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { CustomerWithUser } from "@shared/schema";

interface DashboardStats {
  todayNew: number;
  totalCustomers: number;
  inProgress: number;
  completed: number;
  statusBreakdown: { status: string; count: number }[];
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentCustomers, isLoading: customersLoading } = useQuery<CustomerWithUser[]>({
    queryKey: ["/api/dashboard/recent-customers"],
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

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  if (statsLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="dashboard-content">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-gray-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">오늘 신규</p>
                <p className="text-3xl font-bold text-gray-900" data-testid="text-today-new">
                  {formatNumber(stats?.todayNew || 0)}
                </p>
                <p className="text-xs text-green-600 flex items-center mt-2">
                  <i className="fas fa-arrow-up mr-1"></i>
                  전일 대비 신규 고객
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="fas fa-user-plus text-blue-600 text-xl"></i>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">전체 고객</p>
                <p className="text-3xl font-bold text-gray-900" data-testid="text-total-customers">
                  {formatNumber(stats?.totalCustomers || 0)}
                </p>
                <p className="text-xs text-green-600 flex items-center mt-2">
                  <i className="fas fa-arrow-up mr-1"></i>
                  누적 고객 수
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="fas fa-users text-green-600 text-xl"></i>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">진행 중</p>
                <p className="text-3xl font-bold text-gray-900" data-testid="text-in-progress">
                  {formatNumber(stats?.inProgress || 0)}
                </p>
                <p className="text-xs text-orange-600 flex items-center mt-2">
                  <i className="fas fa-clock mr-1"></i>
                  상담 진행 중
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <i className="fas fa-clock text-orange-600 text-xl"></i>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">완료</p>
                <p className="text-3xl font-bold text-gray-900" data-testid="text-completed">
                  {formatNumber(stats?.completed || 0)}
                </p>
                <p className="text-xs text-green-600 flex items-center mt-2">
                  <i className="fas fa-check-circle mr-1"></i>
                  상담 완료
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="fas fa-check-circle text-green-600 text-xl"></i>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Customers Table */}
        <Card className="lg:col-span-2 border-gray-100">
          <CardHeader className="border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-gray-900">
                최근 등록 고객
              </CardTitle>
              <Button variant="ghost" className="text-sm text-massemble-red hover:text-massemble-red-hover">
                전체보기 →
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {customersLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        고객
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        연락처
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        상태
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        담당자
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        등록일
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        액션
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {recentCustomers?.map((customer) => (
                      <tr key={customer.id} className="hover:bg-gray-50" data-testid={`row-customer-${customer.id}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900" data-testid="text-customer-name">
                              {customer.name}
                            </div>
                            {customer.birthDate && (
                              <div className="text-sm text-gray-500">
                                {format(new Date(customer.birthDate), 'yyyy.MM.dd', { locale: ko })}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {customer.phone}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge className={`${getStatusBadgeClass(customer.status)} text-xs font-semibold`}>
                            {customer.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {customer.assignedUser?.name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {format(new Date(customer.createdAt), 'MM/dd HH:mm', { locale: ko })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Button variant="ghost" size="sm" className="text-massemble-red hover:text-massemble-red-hover mr-3">
                            <i className="fas fa-eye"></i>
                          </Button>
                          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                            <i className="fas fa-edit"></i>
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {(!recentCustomers || recentCustomers.length === 0) && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                          등록된 고객이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Chart */}
        <Card className="border-gray-100">
          <CardHeader className="border-b border-gray-100">
            <CardTitle className="text-lg font-semibold text-gray-900">
              상태별 현황
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {stats?.statusBreakdown ? (
              <StatusChart data={stats.statusBreakdown} />
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                차트 데이터를 로딩 중입니다...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
