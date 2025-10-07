import { useRoute } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { SurveyTemplate, SurveyResponse } from '@shared/schema';

interface SurveyStats {
  totalSent: number;
  totalResponses: number;
  responseRate: number;
  averageScore: number;
}

export default function SurveyResponsesPage() {
  const [, params] = useRoute('/surveys/:id/responses');

  const { data: template, isLoading: templateLoading } = useQuery<SurveyTemplate>({
    queryKey: ['/api/surveys', params?.id],
  });

  const { data: responsesData, isLoading: responsesLoading } = useQuery<{
    responses: SurveyResponse[];
    total: number;
    totalPages: number;
  }>({
    queryKey: ['/api/survey-responses', { surveyTemplateId: params?.id }],
  });

  const responses = responsesData?.responses || [];

  const { data: stats, isLoading: statsLoading } = useQuery<SurveyStats>({
    queryKey: ['/api/surveys', params?.id, 'stats'],
  });

  if (templateLoading || responsesLoading || statsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const questions = Array.isArray(template?.questions) ? template.questions : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{template?.title || '설문 응답'}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {template?.description || '설문 응답 현황을 확인하세요'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">총 발송</p>
              <p className="text-2xl font-bold text-gray-900" data-testid="text-total-sent">
                {stats?.totalSent || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-paper-plane text-blue-600 text-xl"></i>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">총 응답</p>
              <p className="text-2xl font-bold text-green-600" data-testid="text-total-responses">
                {stats?.totalResponses || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-check-circle text-green-600 text-xl"></i>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">응답률</p>
              <p className="text-2xl font-bold text-massemble-red" data-testid="text-response-rate">
                {stats?.responseRate ? `${stats.responseRate.toFixed(1)}%` : '0%'}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-chart-pie text-massemble-red text-xl"></i>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">평균 점수</p>
              <p className="text-2xl font-bold text-purple-600" data-testid="text-average-score">
                {stats?.averageScore ? stats.averageScore.toFixed(1) : '0.0'}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-star text-purple-600 text-xl"></i>
            </div>
          </div>
        </Card>
      </div>

      {/* Responses Table */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">응답 목록</h2>

        {!responses || responses.length === 0 ? (
          <div className="text-center py-12">
            <i className="fas fa-inbox text-gray-300 text-5xl mb-4"></i>
            <p className="text-gray-500">아직 응답이 없습니다.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>응답자</TableHead>
                <TableHead>응답일시</TableHead>
                <TableHead>점수</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {responses.map((response) => (
                <TableRow key={response.id} data-testid={`row-response-${response.id}`}>
                  <TableCell className="font-medium">
                    {response.customer?.name || '알 수 없음'}
                    <div className="text-sm text-gray-500">{response.customer?.phone || '-'}</div>
                  </TableCell>
                  <TableCell>
                    {response.respondedAt 
                      ? new Date(response.respondedAt).toLocaleString('ko-KR')
                      : '-'
                    }
                  </TableCell>
                  <TableCell>
                    {response.overallScore ? (
                      <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
                        <i className="fas fa-star mr-1"></i>
                        {Number(response.overallScore).toFixed(1)}
                      </Badge>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {response.status === 'completed' && (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                        <i className="fas fa-check-circle mr-1"></i>
                        완료
                      </Badge>
                    )}
                    {response.status === 'partial' && (
                      <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
                        <i className="fas fa-hourglass-half mr-1"></i>
                        일부 완료
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          data-testid={`button-view-detail-${response.id}`}
                        >
                          <i className="fas fa-eye mr-1"></i>
                          상세보기
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>응답 상세</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-6 py-4">
                          {/* Response Info */}
                          <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                            <div>
                              <p className="text-sm text-gray-500">응답자</p>
                              <p className="font-medium">{response.customer?.name || '알 수 없음'}</p>
                              <p className="text-sm text-gray-500">{response.customer?.phone || '-'}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">응답일시</p>
                              <p className="font-medium">
                                {response.respondedAt 
                                  ? new Date(response.respondedAt).toLocaleString('ko-KR')
                                  : '-'
                                }
                              </p>
                            </div>
                            {response.overallScore && (
                              <div>
                                <p className="text-sm text-gray-500">평균 점수</p>
                                <p className="font-medium text-yellow-600">
                                  <i className="fas fa-star mr-1"></i>
                                  {Number(response.overallScore).toFixed(1)} / 5.0
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Answers */}
                          <div className="space-y-4">
                            <h3 className="font-semibold text-gray-900">응답 내용</h3>
                            {questions.length === 0 ? (
                              <div className="text-center py-8 text-gray-500">
                                <i className="fas fa-question-circle text-3xl mb-2"></i>
                                <p>질문 정보를 불러올 수 없습니다.</p>
                              </div>
                            ) : !response.answers || Object.keys(response.answers).length === 0 ? (
                              <div className="text-center py-8 text-gray-500">
                                <i className="fas fa-inbox text-3xl mb-2"></i>
                                <p>응답 내용이 없습니다.</p>
                              </div>
                            ) : (
                              questions.map((question: any, index: number) => {
                                const answer = (response.answers as any)?.[question.id];
                                
                                return (
                                  <Card key={question.id} className="p-4 bg-gray-50">
                                    <div className="space-y-2">
                                      <p className="font-medium text-gray-900">
                                        질문 {index + 1}
                                      </p>
                                      <p className="text-gray-700">{question.question}</p>
                                      <div className="mt-3 pt-3 border-t">
                                        <p className="text-sm text-gray-500 mb-1">응답:</p>
                                        {question.type === 'rating' && (
                                          <div className="flex items-center">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                              <i
                                                key={star}
                                                className={`fas fa-star ${
                                                  star <= answer ? 'text-yellow-500' : 'text-gray-300'
                                                }`}
                                              ></i>
                                            ))}
                                            <span className="ml-2 font-medium">{answer || '-'}</span>
                                          </div>
                                        )}
                                        {question.type === 'text' && (
                                          <p className="text-gray-900 bg-white p-3 rounded border">
                                            {answer || '-'}
                                          </p>
                                        )}
                                        {(question.type === 'choice' || question.type === 'multiChoice') && (
                                          <p className="text-gray-900 font-medium">
                                            {Array.isArray(answer) ? answer.join(', ') : answer || '-'}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </Card>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
