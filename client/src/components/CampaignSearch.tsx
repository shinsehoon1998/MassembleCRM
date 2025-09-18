import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, History, X, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// 검색 결과 타입 (실제 API 응답에 맞춰 수정 필요)
interface SearchResult {
  type: 'campaign' | 'customer' | 'sendLog';
  id: string | number;
  title: string;
  subtitle?: string;
  badge?: string;
  matchField?: string;
}

interface AutocompleteResult {
  value: string;
  label: string;
  count?: number;
  type?: string;
}

interface CampaignSearchProps {
  onSelect?: (result: SearchResult) => void;
  onSearch?: (query: string, type: 'all' | 'campaigns' | 'customers' | 'logs') => void;
  placeholder?: string;
  className?: string;
}

// 검색 히스토리 관리
const SEARCH_HISTORY_KEY = 'ars-search-history';
const MAX_HISTORY_ITEMS = 10;

function getSearchHistory(): string[] {
  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addToSearchHistory(query: string) {
  if (!query.trim()) return;
  
  const history = getSearchHistory();
  const filtered = history.filter(item => item !== query.trim());
  const newHistory = [query.trim(), ...filtered].slice(0, MAX_HISTORY_ITEMS);
  
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
}

function clearSearchHistory() {
  localStorage.removeItem(SEARCH_HISTORY_KEY);
}

export default function CampaignSearch({
  onSelect,
  onSearch,
  placeholder = "캠페인, 고객명, 전화번호 검색...",
  className = ""
}: CampaignSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchType, setSearchType] = useState<'all' | 'campaigns' | 'customers' | 'logs'>('all');
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  
  // 검색 히스토리
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  
  // 300ms 디바운싱 구현
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);
  
  useEffect(() => {
    setSearchHistory(getSearchHistory());
  }, []);

  // 자동완성 API 호출
  const { data: autocompleteData, isLoading: autocompleteLoading } = useQuery<{
    suggestions: AutocompleteResult[]
  }>({
    queryKey: ['/api/ars/autocomplete', { 
      q: debouncedQuery, 
      field: searchType === 'all' ? 'campaign' : 
             searchType === 'campaigns' ? 'campaign' : 
             searchType === 'customers' ? 'customer' : 'phone'
    }],
    enabled: debouncedQuery.length >= 2 && isOpen,
    staleTime: 2 * 60 * 1000, // 2분
  });

  // 통합 검색 API 호출
  const { data: searchResults, isLoading: searchLoading } = useQuery<{
    results: {
      campaigns: Array<{
        id: number;
        name: string;
        type: 'campaign';
        status?: string;
        matchField: string;
      }>;
      customers: Array<{
        id: string;
        name: string;
        type: 'customer';
        phone?: string;
        matchField: string;
      }>;
      sendLogs: Array<{
        id: number;
        campaignName: string;
        customerName: string;
        type: 'sendLog';
        phoneNumber?: string;
        matchField: string;
      }>;
    };
    totalResults: number;
  }>({
    queryKey: ['/api/ars/quick-search', { q: debouncedQuery, type: searchType, limit: 10 }],
    enabled: debouncedQuery.length >= 2 && isOpen,
    staleTime: 30 * 1000, // 30초
  });

  // 결과 통합
  const allResults = useMemo((): SearchResult[] => {
    if (!searchResults) return [];
    
    const results: SearchResult[] = [];
    
    // 캠페인 결과
    searchResults.results.campaigns.forEach(campaign => {
      results.push({
        type: 'campaign',
        id: campaign.id,
        title: campaign.name,
        subtitle: `캠페인 • ${campaign.status || '상태 미상'}`,
        badge: '캠페인',
        matchField: campaign.matchField
      });
    });
    
    // 고객 결과
    searchResults.results.customers.forEach(customer => {
      results.push({
        type: 'customer',
        id: customer.id,
        title: customer.name,
        subtitle: customer.phone ? `고객 • ${customer.phone}` : '고객',
        badge: '고객',
        matchField: customer.matchField
      });
    });
    
    // 발송 로그 결과
    searchResults.results.sendLogs.forEach(log => {
      results.push({
        type: 'sendLog',
        id: log.id,
        title: log.customerName,
        subtitle: `${log.campaignName} • ${log.phoneNumber || ''}`,
        badge: '발송기록',
        matchField: log.matchField
      });
    });
    
    return results;
  }, [searchResults]);

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    
    const totalItems = (autocompleteData?.suggestions.length || 0) + allResults.length + searchHistory.length;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => prev < totalItems - 1 ? prev + 1 : -1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => prev > -1 ? prev - 1 : totalItems - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0) {
          // Handle selection based on focused index
          handleSearch(query);
        } else {
          handleSearch(query);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setFocusedIndex(-1);
        searchRef.current?.blur();
        break;
    }
  };

  // 검색 실행
  const handleSearch = (searchQuery: string) => {
    if (searchQuery.trim()) {
      addToSearchHistory(searchQuery.trim());
      setSearchHistory(getSearchHistory());
      onSearch?.(searchQuery.trim(), searchType);
      setIsOpen(false);
      setQuery("");
    }
  };

  // 결과 선택
  const handleSelect = (result: SearchResult) => {
    onSelect?.(result);
    addToSearchHistory(query);
    setSearchHistory(getSearchHistory());
    setIsOpen(false);
    setQuery("");
  };

  // 히스토리 클리어
  const handleClearHistory = () => {
    clearSearchHistory();
    setSearchHistory([]);
  };

  const isLoading = autocompleteLoading || searchLoading;

  return (
    <div className={cn("relative", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                type="text"
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsOpen(true)}
                className="pl-9 pr-10"
                data-testid="input-search"
              />
              {isLoading && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {query && !isLoading && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuery("")}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                  data-testid="button-clear-query"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            
            <Select value={searchType} onValueChange={(value: any) => setSearchType(value)}>
              <SelectTrigger className="w-32" data-testid="select-search-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="campaigns">캠페인</SelectItem>
                <SelectItem value="customers">고객</SelectItem>
                <SelectItem value="logs">발송기록</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </PopoverTrigger>

        <PopoverContent 
          className="w-[500px] p-0" 
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Card className="border-0 shadow-none">
            <CardContent className="p-0">
              <ScrollArea className="max-h-96">
                {/* 검색 히스토리 */}
                {query.length < 2 && searchHistory.length > 0 && (
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <History className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">최근 검색</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearHistory}
                        className="text-xs h-6 px-2"
                        data-testid="button-clear-history"
                      >
                        전체 삭제
                      </Button>
                    </div>
                    {searchHistory.map((historyItem, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setQuery(historyItem);
                          handleSearch(historyItem);
                        }}
                        className="w-full text-left p-2 hover:bg-muted rounded-md text-sm"
                        data-testid={`history-item-${index}`}
                      >
                        {historyItem}
                      </button>
                    ))}
                  </div>
                )}

                {/* 자동완성 제안 */}
                {query.length >= 2 && autocompleteData?.suggestions && autocompleteData.suggestions.length > 0 && (
                  <div className="p-3">
                    <div className="text-xs text-muted-foreground mb-2">추천 검색어</div>
                    {autocompleteData.suggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setQuery(suggestion.value);
                          handleSearch(suggestion.value);
                        }}
                        className="w-full text-left p-2 hover:bg-muted rounded-md text-sm flex items-center justify-between"
                        data-testid={`suggestion-${index}`}
                      >
                        <span>{suggestion.label}</span>
                        {suggestion.count && (
                          <Badge variant="secondary" className="text-xs">
                            {suggestion.count}
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* 검색 결과 */}
                {query.length >= 2 && allResults.length > 0 && (
                  <>
                    {autocompleteData?.suggestions && autocompleteData.suggestions.length > 0 && (
                      <Separator />
                    )}
                    <div className="p-3">
                      <div className="text-xs text-muted-foreground mb-2">
                        검색 결과 ({searchResults?.totalResults || 0}건)
                      </div>
                      {allResults.map((result, index) => (
                        <button
                          key={`${result.type}-${result.id}`}
                          onClick={() => handleSelect(result)}
                          className="w-full text-left p-2 hover:bg-muted rounded-md"
                          data-testid={`result-${result.type}-${result.id}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {result.title}
                              </div>
                              {result.subtitle && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {result.subtitle}
                                </div>
                              )}
                            </div>
                            {result.badge && (
                              <Badge variant="outline" className="text-xs ml-2 shrink-0">
                                {result.badge}
                              </Badge>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* 검색 결과 없음 */}
                {query.length >= 2 && !isLoading && allResults.length === 0 && (
                  <div className="p-6 text-center text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>검색 결과가 없습니다</p>
                    <p className="text-xs mt-1">다른 검색어를 시도해보세요</p>
                  </div>
                )}

                {/* 로딩 상태 */}
                {isLoading && (
                  <div className="p-6 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">검색 중...</p>
                  </div>
                )}

                {/* 검색어가 짧을 때 */}
                {query.length > 0 && query.length < 2 && (
                  <div className="p-6 text-center text-muted-foreground">
                    <p className="text-sm">2글자 이상 입력하세요</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </PopoverContent>
      </Popover>
    </div>
  );
}