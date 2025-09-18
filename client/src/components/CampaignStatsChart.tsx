import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, TrendingUp, Phone, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { z } from "zod";
import type { 
  campaignStatsOverviewSchema, 
  campaignDetailedStatsSchema, 
  timelineStatsSchema 
} from "@shared/schema";

// 타입 정의
type CampaignStatsOverview = z.infer<typeof campaignStatsOverviewSchema>;
type CampaignDetailedStats = z.infer<typeof campaignDetailedStatsSchema>;
type TimelineStats = z.infer<typeof timelineStatsSchema>;

// 한국어 라벨 매핑
const CALL_RESULT_LABELS: Record<string, string> = {
  'connected': '연결',
  'answered': '응답',
  'busy': '통화중',
  'no_answer': '무응답',
  'voicemail': '사서함',
  'rejected': '거절',
  'invalid_number': '결번',
  'fax': '팩스',
  'other': '기타',
  'power_off': '전원오프',
  'auto_response': '자동응답',
  'error': '오류',
  'pending': '대기중',
  'processing': '처리중'
};

// 차트 색상 팔레트
const CHART_COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8',
  '#82ca9d', '#ffc658', '#8dd1e1', '#d084d0', '#87d068'
];

interface CampaignStatsChartProps {
  selectedCampaignId?: number | null;
  className?: string;
}

export default function CampaignStatsChart({ 
  selectedCampaignId, 
  className = "" 
}: CampaignStatsChartProps) {
  const { user } = useAuth();
  const [timelinePeriod, setTimelinePeriod] = useState<'daily' | 'hourly'>('daily');
  const [timelineDays, setTimelineDays] = useState<string>('7');

  // 캠페인 통계 개요 조회
  const { data: overviewStats, isLoading: overviewLoading, error: overviewError } = useQuery<CampaignStatsOverview>({
    queryKey: ['/api/ars/campaign-stats'],
    staleTime: 5 * 60 * 1000, // 5분
    refetchOnWindowFocus: false,
  });

  // 선택된 캠페인 상세 통계 조회 (선택된 경우만)
  const { data: detailedStats, isLoading: detailedLoading, error: detailedError } = useQuery<CampaignDetailedStats>({
    queryKey: ['/api/ars/campaign-stats', selectedCampaignId],
    enabled: !!selectedCampaignId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // 시간대별 통계 조회
  const { data: timelineData, isLoading: timelineLoading, error: timelineError } = useQuery<TimelineStats>({
    queryKey: ['/api/ars/stats/timeline', { period: timelinePeriod, days: timelineDays }],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // 파이 차트용 데이터 가공
  const pieChartData = useMemo(() => {
    if (!detailedStats?.callResults) return [];
    
    return Object.entries(detailedStats.callResults)
      .map(([key, value]) => ({
        name: CALL_RESULT_LABELS[key] || key,
        value: value as number,
        percentage: detailedStats.summary.totalCount > 0 
          ? ((value as number / detailedStats.summary.totalCount) * 100).toFixed(1)
          : '0'
      }))
      .sort((a, b) => b.value - a.value);
  }, [detailedStats]);

  // 라인 차트용 데이터 가공
  const lineChartData = useMemo(() => {
    if (!timelineData?.data) return [];
    
    return timelineData.data.map(item => ({
      date: new Date(item.date).toLocaleDateString('ko-KR', 
        timelinePeriod === 'daily' 
          ? { month: 'short', day: 'numeric' }
          : { month: 'short', day: 'numeric', hour: 'numeric' }
      ),
      totalSent: item.totalSent,
      successCount: item.successCount,
      failedCount: item.failedCount,
      successRate: Number(item.successRate.toFixed(1))
    }));
  }, [timelineData, timelinePeriod]);

  // 권한 확인
  const canViewDetailedStats = user?.role === 'admin' || user?.role === 'manager';

  // 로딩 상태
  if (overviewLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (overviewError) {
    return (
      <div className={`space-y-4 ${className}`}>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <p>통계 데이터를 불러오는 중 오류가 발생했습니다.</p>
              <p className="text-sm text-muted-foreground mt-1">
                {overviewError instanceof Error ? overviewError.message : '알 수 없는 오류'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!overviewStats) {
    return (
      <div className={`space-y-4 ${className}`}>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <p>통계 데이터가 없습니다.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 키 메트릭 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-campaigns">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 캠페인</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-campaigns">
              {overviewStats.totalCampaigns.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              활성: {overviewStats.activeCampaigns}개
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-sent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 발송</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-sent">
              {overviewStats.totalSent.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              성공: {overviewStats.totalSuccess.toLocaleString()}건
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-success-rate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 성공률</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-success-rate">
              {overviewStats.successRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              실패: {overviewStats.totalFailed.toLocaleString()}건
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-avg-duration">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 통화시간</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-duration">
              {detailedStats?.timeAnalysis?.averageDuration 
                ? `${detailedStats.timeAnalysis.averageDuration.toFixed(0)}초`
                : '-'
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {detailedStats?.timeAnalysis?.peakHour 
                ? `피크: ${detailedStats.timeAnalysis.peakHour}`
                : '데이터 없음'
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 차트 섹션 */}
      <Tabs defaultValue="timeline" className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0">
          <TabsList>
            <TabsTrigger value="timeline" data-testid="tab-timeline">
              시간대별 분석
            </TabsTrigger>
            <TabsTrigger 
              value="results" 
              disabled={!selectedCampaignId || !canViewDetailedStats}
              data-testid="tab-results"
            >
              통화 결과 분석
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center space-x-2">
            <Select value={timelinePeriod} onValueChange={(value: 'daily' | 'hourly') => setTimelinePeriod(value)}>
              <SelectTrigger className="w-24" data-testid="select-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">일별</SelectItem>
                <SelectItem value="hourly">시간별</SelectItem>
              </SelectContent>
            </Select>

            <Select value={timelineDays} onValueChange={setTimelineDays}>
              <SelectTrigger className="w-20" data-testid="select-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1일</SelectItem>
                <SelectItem value="7">7일</SelectItem>
                <SelectItem value="30">30일</SelectItem>
                <SelectItem value="90">90일</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>발송 성공률 추이</span>
                {timelineLoading && (
                  <Badge variant="outline">로딩중...</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timelineLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : timelineError ? (
                <div className="h-80 flex items-center justify-center text-red-600">
                  <p>차트 데이터를 불러올 수 없습니다.</p>
                </div>
              ) : lineChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320} data-testid="chart-timeline">
                  <LineChart data={lineChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip 
                      formatter={(value, name) => [
                        typeof value === 'number' ? value.toLocaleString() : value,
                        name === 'successRate' ? '성공률(%)' :
                        name === 'totalSent' ? '총 발송' :
                        name === 'successCount' ? '성공' :
                        name === 'failedCount' ? '실패' : name
                      ]}
                      labelFormatter={(label) => `날짜: ${label}`}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="totalSent" fill="#8884d8" name="총 발송" />
                    <Bar yAxisId="left" dataKey="successCount" fill="#82ca9d" name="성공" />
                    <Bar yAxisId="left" dataKey="failedCount" fill="#ffc658" name="실패" />
                    <Line 
                      yAxisId="right" 
                      type="monotone" 
                      dataKey="successRate" 
                      stroke="#ff7300" 
                      strokeWidth={3}
                      name="성공률(%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                  <p>표시할 데이터가 없습니다.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {!selectedCampaignId ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <p>캠페인을 선택하면 상세 통화 결과를 볼 수 있습니다.</p>
                </div>
              </CardContent>
            </Card>
          ) : !canViewDetailedStats ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-red-600">
                  <p>상세 통계는 관리자 또는 매니저 권한이 필요합니다.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 통화 결과 파이 차트 */}
              <Card>
                <CardHeader>
                  <CardTitle>통화 결과 분포</CardTitle>
                </CardHeader>
                <CardContent>
                  {detailedLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : detailedError ? (
                    <div className="h-64 flex items-center justify-center text-red-600">
                      <p>데이터를 불러올 수 없습니다.</p>
                    </div>
                  ) : pieChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260} data-testid="chart-pie">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percentage }) => `${name} ${percentage}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={CHART_COLORS[index % CHART_COLORS.length]} 
                            />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value) => [
                            `${(value as number).toLocaleString()}건`,
                            '건수'
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-muted-foreground">
                      <p>표시할 데이터가 없습니다.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 통화 결과 상세 정보 */}
              <Card>
                <CardHeader>
                  <CardTitle>통화 결과 상세</CardTitle>
                </CardHeader>
                <CardContent>
                  {detailedLoading ? (
                    <div className="space-y-2">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="flex justify-between">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-4 w-16" />
                        </div>
                      ))}
                    </div>
                  ) : pieChartData.length > 0 ? (
                    <div className="space-y-2" data-testid="list-call-results">
                      {pieChartData.map((item, index) => (
                        <div 
                          key={item.name}
                          className="flex justify-between items-center p-2 rounded-md hover:bg-muted/50"
                        >
                          <div className="flex items-center space-x-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                            />
                            <span className="text-sm">{item.name}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold">
                              {item.value.toLocaleString()}건
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {item.percentage}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      <p>표시할 데이터가 없습니다.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}