import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Phone, Users, Send, RefreshCw } from "lucide-react";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { arsCallListAddSchema, type ArsCallListAdd } from "@shared/schema";

export default function ArsCampaigns() {
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);

  // 새로운 ARS 발송 폼
  const form = useForm<ArsCallListAdd>({
    resolver: zodResolver(arsCallListAddSchema),
    defaultValues: {
      campaignName: "",
      page: "A",
      phones: [],
    },
  });

  // 마케팅 대상 고객 조회
  const { data: marketingTargets, isLoading: marketingTargetsLoading } = useQuery({
    queryKey: ["/api/ars/marketing-targets"],
  });

  // 고객 그룹 목록 조회
  const { data: customerGroups, isLoading: customerGroupsLoading } = useQuery({
    queryKey: ["/api/customer-groups"],
  });

  // 캠페인 기록 조회
  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["/api/ars/campaigns"],
  });

  // 새로운 ARS 발송 API 호출
  const sendArsMutation = useMutation({
    mutationFn: async (data: ArsCallListAdd) => {
      const response = await apiRequest("POST", "/api/ars/calllist/add", data);
      return response.json();
    },
    onSuccess: (response: any) => {
      if (response?.success) {
        toast({
          title: "발송 성공",
          description: `캠페인 '${response.campaignName || 'Unknown'}'이 성공적으로 발송되었습니다. (총 ${response.totalCount || 0}명)`,
        });
        
        setShowModal(false);
        form.reset();
      } else {
        toast({
          title: "발송 실패",
          description: response?.message || "알 수 없는 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/ars/campaigns"] });
    },
    onError: (error: Error) => {
      toast({
        title: "발송 오류",
        description: `ARS 발송 중 오류가 발생했습니다: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // 대상 선택 상태
  const [selectedTargetType, setSelectedTargetType] = useState<"all" | "group">("all");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");

  // 선택된 그룹의 고객 수 조회
  const { data: groupCustomers, isLoading: groupCustomersLoading, error: groupCustomersError } = useQuery({
    queryKey: ['/api/customer-groups', selectedGroupId, 'customers'],
    enabled: !!selectedGroupId && selectedTargetType === "group",
  });

  const handleSubmit = (data: ArsCallListAdd) => {
    // 캠페인명 검증
    if (!data.campaignName?.trim()) {
      toast({
        title: "캠페인명 필요",
        description: "아톡비즈에서 생성된 캠페인명을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    
    // 전화번호 배열 구성
    let phones: string[] = [];
    
    if (selectedTargetType === "all") {
      // 전체 마케팅 동의 고객
      const targets = (marketingTargets as any)?.targets;
      if (!Array.isArray(targets) || targets.length === 0) {
        toast({
          title: "대상 없음",
          description: "마케팅 동의한 고객이 없습니다.",
          variant: "destructive",
        });
        return;
      }
      phones = targets.map((customer: any) => customer.phone).filter(Boolean);
    } else if (selectedTargetType === "group" && selectedGroupId) {
      // 선택된 그룹의 고객
      const customers = groupCustomers as any;
      if (!Array.isArray(customers) || customers.length === 0) {
        toast({
          title: "대상 없음",
          description: "선택된 그룹에 고객이 없습니다.",
          variant: "destructive",
        });
        return;
      }
      phones = customers.map((customer: any) => customer.phone).filter(Boolean);
    }

    if (phones.length === 0) {
      toast({
        title: "대상 없음",
        description: "발송할 대상의 전화번호가 없습니다.",
        variant: "destructive",
      });
      return;
    }

    sendArsMutation.mutate({
      ...data,
      phones,
    });
  };

  // targetCount 계산을 더 안전하게 수정
  const targetCount = selectedTargetType === "all" 
    ? (marketingTargets as any)?.targets?.length || 0
    : (Array.isArray(groupCustomers) ? groupCustomers.length : 0);


  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">ARS 캠페인</h1>
          <p className="text-muted-foreground">ARS 발송 캠페인을 관리하고 실행합니다</p>
        </div>
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-campaign">
              <Send className="mr-2 h-4 w-4" />
              새 캠페인 발송
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>ARS 캠페인 발송</DialogTitle>
              <DialogDescription>
                캠페인명을 입력하고 발송 대상을 선택하여 ARS를 발송하세요.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                {/* 캠페인명 입력 */}
                <FormField
                  control={form.control}
                  name="campaignName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>캠페인명 *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="아톡비즈에서 생성된 캠페인명을 입력하세요" 
                          data-testid="input-campaign-name"
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        아톡비즈에서 미리 생성된 캠페인명을 정확히 입력해주세요. (필수)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 발송 대상 선택 */}
                <div className="space-y-4">
                  <Label>발송 대상 선택</Label>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="target-all"
                        checked={selectedTargetType === "all"}
                        onCheckedChange={() => setSelectedTargetType("all")}
                        data-testid="checkbox-target-all"
                      />
                      <Label htmlFor="target-all" className="flex items-center space-x-2">
                        <Users className="h-4 w-4" />
                        <span>전체 마케팅 동의 고객</span>
                        <Badge variant="secondary" data-testid="badge-all-count">
                          {(marketingTargets as any)?.targets?.length || 0}명
                        </Badge>
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="target-group"
                        checked={selectedTargetType === "group"}
                        onCheckedChange={() => setSelectedTargetType("group")}
                        data-testid="checkbox-target-group"
                      />
                      <Label htmlFor="target-group" className="flex items-center space-x-2">
                        <Phone className="h-4 w-4" />
                        <span>특정 고객 그룹</span>
                      </Label>
                    </div>
                    
                    {selectedTargetType === "group" && (
                      <div className="ml-6">
                        <Select
                          value={selectedGroupId}
                          onValueChange={setSelectedGroupId}
                          data-testid="select-customer-group"
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="고객 그룹을 선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            {customerGroups && Array.isArray(customerGroups) ? customerGroups.map((group: any) => (
                              <SelectItem key={group.id} value={group.id} data-testid={`select-item-${group.id}`}>
                                {group.name}
                              </SelectItem>
                            )) : null}
                          </SelectContent>
                        </Select>
                        {selectedGroupId && (
                          <div className="mt-2">
                            <p className="text-sm text-muted-foreground" data-testid="text-selected-group-count">
                              선택된 그룹: {targetCount}명
                            </p>
                            {groupCustomersLoading && (
                              <p className="text-sm text-blue-600">고객 정보 로딩 중...</p>
                            )}
                            {groupCustomersError && (
                              <p className="text-sm text-red-600">오류: {(groupCustomersError as any)?.message || '고객 정보를 불러올 수 없습니다'}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="text-sm font-medium">
                    발송 대상: <span className="text-primary">{targetCount}명</span>
                  </div>
                </div>

                {/* 버튼 */}
                <div className="flex justify-end space-x-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowModal(false)}
                    data-testid="button-cancel"
                  >
                    취소
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={
                      sendArsMutation.isPending || 
                      targetCount === 0 || 
                      marketingTargetsLoading || 
                      (selectedTargetType === "group" && (customerGroupsLoading || groupCustomersLoading))
                    }
                    data-testid="button-send"
                  >
                    {sendArsMutation.isPending ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        발송 중...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        발송하기
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 간단한 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">마케팅 동의 고객</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-marketing-targets">
              {(marketingTargets as any)?.targets?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              ARS 발송 가능 대상
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 캠페인</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-campaigns">
              {(campaigns as any[])?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              생성된 캠페인 수
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">고객 그룹</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-customer-groups">
              {(customerGroups as any[])?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              생성된 그룹 수
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 캠페인 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>캠페인 기록</CardTitle>
        </CardHeader>
        <CardContent>
          {campaignsLoading ? (
            <p>로딩 중...</p>
          ) : !campaigns || (Array.isArray(campaigns) && campaigns.length === 0) ? (
            <p className="text-muted-foreground text-center py-8">
              아직 발송된 캠페인이 없습니다. 새 캠페인을 발송해보세요.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>캠페인명</TableHead>
                  <TableHead>발송일시</TableHead>
                  <TableHead>총 발송</TableHead>
                  <TableHead>성공</TableHead>
                  <TableHead>실패</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.isArray(campaigns) && campaigns.map((campaign: any) => (
                  <TableRow key={campaign.id} data-testid={`row-campaign-${campaign.id}`}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                      {campaign.createdAt ? new Date(campaign.createdAt).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell>{campaign.totalCount || 0}</TableCell>
                    <TableCell className="text-green-600">{campaign.successCount || 0}</TableCell>
                    <TableCell className="text-red-600">{campaign.failedCount || 0}</TableCell>
                    <TableCell>
                      <Badge variant={campaign.status === 'completed' ? 'default' : campaign.status === 'failed' ? 'destructive' : 'secondary'}>
                        {campaign.status === 'completed' ? '완료' : 
                         campaign.status === 'failed' ? '실패' : 
                         campaign.status === 'running' ? '진행중' : '대기'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}