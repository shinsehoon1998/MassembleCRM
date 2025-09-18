import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, FilterIcon, X, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

// 통화 결과 라벨
const CALL_RESULT_OPTIONS = [
  { value: 'connected', label: '연결' },
  { value: 'answered', label: '응답' },
  { value: 'busy', label: '통화중' },
  { value: 'no_answer', label: '무응답' },
  { value: 'voicemail', label: '사서함' },
  { value: 'rejected', label: '거절' },
  { value: 'invalid_number', label: '결번' },
  { value: 'fax', label: '팩스' },
  { value: 'other', label: '기타' },
  { value: 'power_off', label: '전원오프' },
  { value: 'auto_response', label: '자동응답' },
  { value: 'error', label: '오류' },
  { value: 'pending', label: '대기중' },
  { value: 'processing', label: '처리중' }
];

// 재발송 유형 옵션
const RETRY_TYPE_OPTIONS = [
  { value: 'initial', label: '최초 발송' },
  { value: 'retry', label: '재발송' },
  { value: 'repeat', label: '반복' }
];

// 캠페인 상태 옵션
const CAMPAIGN_STATUS_OPTIONS = [
  { value: 'draft', label: '임시저장' },
  { value: 'scheduled', label: '예약됨' },
  { value: 'running', label: '실행중' },
  { value: 'completed', label: '완료' },
  { value: 'failed', label: '실패' },
  { value: 'cancelled', label: '취소됨' }
];

export interface CampaignFiltersValue {
  // 날짜 필터
  dateFrom?: string;
  dateTo?: string;
  
  // 캠페인 필터
  campaignIds?: number[];
  campaignStatus?: string[];
  
  // 통화 결과 필터
  callResults?: string[];
  retryTypes?: string[];
  
  // 고객 그룹 필터
  customerGroupIds?: string[];
  
  // 통화 시간 필터
  durationMin?: number;
  durationMax?: number;
  
  // 비용 필터
  costMin?: number;
  costMax?: number;
  
  // 검색 필터
  phoneNumber?: string;
  customerName?: string;
}

interface CampaignFiltersProps {
  value: CampaignFiltersValue;
  onChange: (filters: CampaignFiltersValue) => void;
  onReset: () => void;
  className?: string;
  collapsible?: boolean;
}

export default function CampaignFilters({
  value,
  onChange,
  onReset,
  className = "",
  collapsible = false
}: CampaignFiltersProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(!collapsible);
  const [datePickerOpen, setDatePickerOpen] = useState<'from' | 'to' | null>(null);

  // 고객 그룹 목록 조회
  const { data: customerGroups, isLoading: groupsLoading } = useQuery({
    queryKey: ['/api/customer-groups'],
    staleTime: 10 * 60 * 1000, // 10분
  });

  // 캠페인 목록 조회 (필터용)
  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ['/api/ars/campaigns'],
    staleTime: 5 * 60 * 1000, // 5분
  });

  // 필터 개수 계산
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (value.dateFrom || value.dateTo) count++;
    if (value.campaignIds?.length) count++;
    if (value.campaignStatus?.length) count++;
    if (value.callResults?.length) count++;
    if (value.retryTypes?.length) count++;
    if (value.customerGroupIds?.length) count++;
    if (value.durationMin || value.durationMax) count++;
    if (value.costMin || value.costMax) count++;
    if (value.phoneNumber) count++;
    if (value.customerName) count++;
    return count;
  }, [value]);

  // 날짜 업데이트 함수
  const handleDateChange = (field: 'dateFrom' | 'dateTo', date?: Date) => {
    onChange({
      ...value,
      [field]: date ? format(date, 'yyyy-MM-dd') : undefined
    });
  };

  // 배열 필터 업데이트 함수
  const handleArrayFilterChange = <T,>(
    field: keyof CampaignFiltersValue,
    itemValue: T,
    checked: boolean
  ) => {
    const currentArray = (value[field] as T[]) || [];
    const newArray = checked
      ? [...currentArray, itemValue]
      : currentArray.filter(item => item !== itemValue);
    
    onChange({
      ...value,
      [field]: newArray.length > 0 ? newArray : undefined
    });
  };

  // 숫자 필터 업데이트 함수
  const handleNumberChange = (field: keyof CampaignFiltersValue, inputValue: string) => {
    const numValue = inputValue === '' ? undefined : Number(inputValue);
    onChange({
      ...value,
      [field]: numValue
    });
  };

  // 권한 확인
  const canViewAdvancedFilters = user?.role === 'admin' || user?.role === 'manager';

  const FilterContent = () => (
    <div className="space-y-4">
      {/* 날짜 범위 필터 */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">발송 날짜</Label>
        <div className="grid grid-cols-2 gap-2">
          <Popover 
            open={datePickerOpen === 'from'} 
            onOpenChange={(open) => setDatePickerOpen(open ? 'from' : null)}
          >
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className={cn(
                  "justify-start text-left font-normal h-8",
                  !value.dateFrom && "text-muted-foreground"
                )}
                data-testid="button-date-from"
              >
                <CalendarIcon className="mr-1 h-3 w-3" />
                {value.dateFrom 
                  ? format(new Date(value.dateFrom), "MM/dd", { locale: ko })
                  : "시작일"
                }
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value.dateFrom ? new Date(value.dateFrom) : undefined}
                onSelect={(date) => {
                  handleDateChange('dateFrom', date);
                  setDatePickerOpen(null);
                }}
                initialFocus
                locale={ko}
              />
            </PopoverContent>
          </Popover>

          <Popover 
            open={datePickerOpen === 'to'} 
            onOpenChange={(open) => setDatePickerOpen(open ? 'to' : null)}
          >
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className={cn(
                  "justify-start text-left font-normal h-8",
                  !value.dateTo && "text-muted-foreground"
                )}
                data-testid="button-date-to"
              >
                <CalendarIcon className="mr-1 h-3 w-3" />
                {value.dateTo 
                  ? format(new Date(value.dateTo), "MM/dd", { locale: ko })
                  : "종료일"
                }
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value.dateTo ? new Date(value.dateTo) : undefined}
                onSelect={(date) => {
                  handleDateChange('dateTo', date);
                  setDatePickerOpen(null);
                }}
                initialFocus
                locale={ko}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Separator />

      {/* 캠페인 상태 필터 */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">캠페인 상태</Label>
        <div className="grid grid-cols-2 gap-1">
          {CAMPAIGN_STATUS_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox
                id={`status-${option.value}`}
                checked={value.campaignStatus?.includes(option.value) ?? false}
                onCheckedChange={(checked) => 
                  handleArrayFilterChange('campaignStatus', option.value, !!checked)
                }
                data-testid={`checkbox-status-${option.value}`}
              />
              <Label 
                htmlFor={`status-${option.value}`}
                className="text-xs"
              >
                {option.label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* 통화 결과 필터 */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">통화 결과</Label>
        <ScrollArea className="h-32">
          <div className="space-y-1">
            {CALL_RESULT_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`result-${option.value}`}
                  checked={value.callResults?.includes(option.value) ?? false}
                  onCheckedChange={(checked) => 
                    handleArrayFilterChange('callResults', option.value, !!checked)
                  }
                  data-testid={`checkbox-result-${option.value}`}
                />
                <Label 
                  htmlFor={`result-${option.value}`}
                  className="text-xs"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <Separator />

      {/* 재발송 유형 필터 */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">발송 유형</Label>
        <div className="space-y-1">
          {RETRY_TYPE_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox
                id={`retry-${option.value}`}
                checked={value.retryTypes?.includes(option.value) ?? false}
                onCheckedChange={(checked) => 
                  handleArrayFilterChange('retryTypes', option.value, !!checked)
                }
                data-testid={`checkbox-retry-${option.value}`}
              />
              <Label 
                htmlFor={`retry-${option.value}`}
                className="text-xs"
              >
                {option.label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* 고객 그룹 필터 */}
      {canViewAdvancedFilters && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label className="text-sm font-medium">고객 그룹</Label>
            {groupsLoading ? (
              <div className="space-y-1">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              <ScrollArea className="h-24">
                <div className="space-y-1">
                  {Array.isArray(customerGroups) && customerGroups.map((group: any) => (
                    <div key={group.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`group-${group.id}`}
                        checked={value.customerGroupIds?.includes(group.id) ?? false}
                        onCheckedChange={(checked) => 
                          handleArrayFilterChange('customerGroupIds', group.id, !!checked)
                        }
                        data-testid={`checkbox-group-${group.id}`}
                      />
                      <Label 
                        htmlFor={`group-${group.id}`}
                        className="text-xs"
                      >
                        {group.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </>
      )}

      {/* 통화시간 필터 (고급) */}
      {canViewAdvancedFilters && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label className="text-sm font-medium">통화시간 (초)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">최소</Label>
                <input
                  type="number"
                  placeholder="0"
                  className="w-full h-8 px-2 text-xs border rounded-md"
                  value={value.durationMin || ''}
                  onChange={(e) => handleNumberChange('durationMin', e.target.value)}
                  data-testid="input-duration-min"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">최대</Label>
                <input
                  type="number"
                  placeholder="999"
                  className="w-full h-8 px-2 text-xs border rounded-md"
                  value={value.durationMax || ''}
                  onChange={(e) => handleNumberChange('durationMax', e.target.value)}
                  data-testid="input-duration-max"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* 비용 필터 (고급) */}
      {canViewAdvancedFilters && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label className="text-sm font-medium">비용 (원)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">최소</Label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  className="w-full h-8 px-2 text-xs border rounded-md"
                  value={value.costMin || ''}
                  onChange={(e) => handleNumberChange('costMin', e.target.value)}
                  data-testid="input-cost-min"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">최대</Label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="9999"
                  className="w-full h-8 px-2 text-xs border rounded-md"
                  value={value.costMax || ''}
                  onChange={(e) => handleNumberChange('costMax', e.target.value)}
                  data-testid="input-cost-max"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* 검색 필터 */}
      <Separator />
      <div className="space-y-2">
        <Label className="text-sm font-medium">검색</Label>
        <div className="space-y-1">
          <input
            type="text"
            placeholder="전화번호 검색"
            className="w-full h-8 px-2 text-xs border rounded-md"
            value={value.phoneNumber || ''}
            onChange={(e) => onChange({ ...value, phoneNumber: e.target.value || undefined })}
            data-testid="input-phone-search"
          />
          <input
            type="text"
            placeholder="고객명 검색"
            className="w-full h-8 px-2 text-xs border rounded-md"
            value={value.customerName || ''}
            onChange={(e) => onChange({ ...value, customerName: e.target.value || undefined })}
            data-testid="input-customer-search"
          />
        </div>
      </div>

      {/* 초기화 버튼 */}
      {activeFilterCount > 0 && (
        <>
          <Separator />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onReset}
            className="w-full"
            data-testid="button-reset-filters"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            필터 초기화
          </Button>
        </>
      )}
    </div>
  );

  if (collapsible) {
    return (
      <Collapsible 
        open={isOpen} 
        onOpenChange={setIsOpen}
        className={className}
      >
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50">
              <CardTitle className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <FilterIcon className="h-4 w-4" />
                  <span>필터</span>
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-2" data-testid="badge-filter-count">
                      {activeFilterCount}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isOpen ? '숨기기' : '보기'}
                </div>
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <FilterContent />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <FilterIcon className="h-4 w-4" />
            <span>필터</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" data-testid="badge-filter-count">
                {activeFilterCount}
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <FilterContent />
      </CardContent>
    </Card>
  );
}