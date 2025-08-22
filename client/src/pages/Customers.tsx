import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import CustomerModal from "@/components/CustomerModal";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { CustomerWithUser, User } from "@shared/schema";

interface CustomersResponse {
  customers: CustomerWithUser[];
  total: number;
  totalPages: number;
}

export default function Customers() {
  const [searchParams, setSearchParams] = useState({
    search: "",
    status: "",
    assignedUserId: "",
    page: 1,
    limit: 20,
  });
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithUser | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customersData, isLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/customers", searchParams],
  });

  const { data: counselors } = useQuery<User[]>({
    queryKey: ["/api/users/counselors"],
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      await apiRequest("DELETE", `/api/customers/${customerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "성공",
        description: "고객이 삭제되었습니다.",
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "고객 삭제에 실패했습니다.",
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

  const handleSearch = () => {
    setSearchParams(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setSearchParams(prev => ({ ...prev, page }));
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCustomers(customersData?.customers.map(c => c.id) || []);
    } else {
      setSelectedCustomers([]);
    }
  };

  const handleSelectCustomer = (customerId: string, checked: boolean) => {
    if (checked) {
      setSelectedCustomers(prev => [...prev, customerId]);
    } else {
      setSelectedCustomers(prev => prev.filter(id => id !== customerId));
    }
  };

  const handleEditCustomer = (customer: CustomerWithUser) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      deleteCustomerMutation.mutate(customerId);
    }
  };

  const handleNewCustomer = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  return (
    <div className="p-6 space-y-6" data-testid="customers-content">
      {/* Search Filters */}
      <Card className="border-gray-100">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">검색</label>
              <Input
                placeholder="이름, 전화번호 검색"
                value={searchParams.search}
                onChange={(e) => setSearchParams(prev => ({ ...prev, search: e.target.value }))}
                data-testid="input-search"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">상태</label>
              <Select
                value={searchParams.status}
                onValueChange={(value) => setSearchParams(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="전체 상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">전체 상태</SelectItem>
                  <SelectItem value="인텍">인텍</SelectItem>
                  <SelectItem value="수수">수수</SelectItem>
                  <SelectItem value="접수">접수</SelectItem>
                  <SelectItem value="작업">작업</SelectItem>
                  <SelectItem value="완료">완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">담당자</label>
              <Select
                value={searchParams.assignedUserId}
                onValueChange={(value) => setSearchParams(prev => ({ ...prev, assignedUserId: value }))}
              >
                <SelectTrigger data-testid="select-counselor">
                  <SelectValue placeholder="전체 담당자" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">전체 담당자</SelectItem>
                  {counselors?.map(counselor => (
                    <SelectItem key={counselor.id} value={counselor.id}>
                      {counselor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex space-x-3">
              <Button onClick={handleSearch} className="bg-primary-500 hover:bg-primary-600" data-testid="button-search">
                <i className="fas fa-search mr-2"></i>검색
              </Button>
              <Button onClick={handleNewCustomer} className="bg-green-500 hover:bg-green-600" data-testid="button-add-customer">
                <i className="fas fa-plus mr-2"></i>신규 등록
              </Button>
              <Button variant="outline" className="bg-gray-500 text-white hover:bg-gray-600">
                <i className="fas fa-download mr-2"></i>엑셀
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card className="border-gray-100">
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-gray-900">고객 목록</CardTitle>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                총 {customersData?.total ? new Intl.NumberFormat('ko-KR').format(customersData.total) : 0}명
              </span>
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-500">페이지당</label>
                <Select
                  value={searchParams.limit.toString()}
                  onValueChange={(value) => setSearchParams(prev => ({ ...prev, limit: parseInt(value), page: 1 }))}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20개</SelectItem>
                    <SelectItem value="50">50개</SelectItem>
                    <SelectItem value="100">100개</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <Checkbox
                        checked={selectedCustomers.length === customersData?.customers?.length && customersData.customers.length > 0}
                        onCheckedChange={handleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">번호</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">고객정보</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">연락처</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">채무금액</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">담당자</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">등록일</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">액션</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customersData?.customers?.map((customer, index) => {
                    const customerNumber = customersData.total - ((searchParams.page - 1) * searchParams.limit) - index;
                    return (
                      <tr key={customer.id} className="hover:bg-gray-50" data-testid={`row-customer-${customer.id}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Checkbox
                            checked={selectedCustomers.includes(customer.id)}
                            onCheckedChange={(checked) => handleSelectCustomer(customer.id, checked)}
                            data-testid={`checkbox-customer-${customer.id}`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {customerNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900" data-testid="text-customer-name">
                              {customer.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {customer.gender === 'M' ? '남' : customer.gender === 'F' ? '여' : ''}{customer.birthDate && customer.gender !== 'N' ? ', ' : ''}
                              {customer.birthDate && format(new Date(customer.birthDate), 'yyyy.MM.dd', { locale: ko })}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{customer.phone}</div>
                          {customer.secondaryPhone && (
                            <div className="text-sm text-gray-500">{customer.secondaryPhone}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {formatNumber(customer.debtAmount)}
                          </div>
                          {customer.monthlyIncome && (
                            <div className="text-sm text-gray-500">
                              월소득: {formatNumber(customer.monthlyIncome)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge className={`${getStatusBadgeClass(customer.status)} text-xs font-semibold`}>
                            {customer.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{customer.assignedUser?.name || '-'}</div>
                          {customer.assignedUser?.department && (
                            <div className="text-sm text-gray-500">{customer.assignedUser.department}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {format(new Date(customer.createdAt), 'yyyy-MM-dd', { locale: ko })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Button variant="ghost" size="sm" className="text-primary-500 hover:text-primary-600 mr-3" title="상세보기">
                            <i className="fas fa-eye"></i>
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-yellow-500 hover:text-yellow-600 mr-3" 
                            title="수정"
                            onClick={() => handleEditCustomer(customer)}
                            data-testid={`button-edit-${customer.id}`}
                          >
                            <i className="fas fa-edit"></i>
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-500 hover:text-red-600" 
                            title="삭제"
                            onClick={() => handleDeleteCustomer(customer.id)}
                            data-testid={`button-delete-${customer.id}`}
                          >
                            <i className="fas fa-trash"></i>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {(!customersData?.customers || customersData.customers.length === 0) && (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                        검색 결과가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        {/* Pagination */}
        {customersData && customersData.totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {((searchParams.page - 1) * searchParams.limit) + 1}-{Math.min(searchParams.page * searchParams.limit, customersData.total)} of {customersData.total} results
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(searchParams.page - 1)}
                  disabled={searchParams.page <= 1}
                  data-testid="button-prev-page"
                >
                  <i className="fas fa-chevron-left"></i>
                </Button>
                {[...Array(Math.min(5, customersData.totalPages))].map((_, i) => {
                  const page = searchParams.page <= 3 ? i + 1 : searchParams.page - 2 + i;
                  if (page > customersData.totalPages) return null;
                  
                  return (
                    <Button
                      key={page}
                      variant={page === searchParams.page ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePageChange(page)}
                      className={page === searchParams.page ? "bg-primary-500 text-white" : ""}
                      data-testid={`button-page-${page}`}
                    >
                      {page}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(searchParams.page + 1)}
                  disabled={searchParams.page >= customersData.totalPages}
                  data-testid="button-next-page"
                >
                  <i className="fas fa-chevron-right"></i>
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Customer Modal */}
      <CustomerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        customer={editingCustomer}
        counselors={counselors || []}
      />
    </div>
  );
}
