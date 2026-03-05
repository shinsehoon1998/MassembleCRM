import { useState } from 'react';
import { useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import keystartLogo from '@assets/keystart_logo.png';

interface SurveyData {
  template: {
    id: string;
    title: string;
    description: string;
    questions: any[];
  };
  customer: {
    id: string;
    name: string;
  };
  send: {
    id: string;
    expiresAt: string;
  };
}

export default function SurveyResponsePage() {
  const [, params] = useRoute('/survey/:token');
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const { data, isLoading, error } = useQuery<{ data: SurveyData }>({
    queryKey: ['/api/survey', params?.token],
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: (submitData: { answers: Record<string, any>; overallScore: number }) =>
      apiRequest('POST', `/api/survey/${params?.token}/submit`, submitData),
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: '설문 응답이 제출되었습니다',
        description: '소중한 의견 감사합니다.',
        variant: 'default',
      });
    },
    onError: (error: any) => {
      toast({
        title: '응답 제출에 실패했습니다',
        description: error.message || '다시 시도해주세요.',
        variant: 'destructive',
      });
    },
  });

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleSubmit = () => {
    const template = data?.data?.template;
    if (!template) return;

    // 필수 질문 확인
    const requiredQuestions = template.questions.filter((q: any) => q.required);
    const missingAnswers = requiredQuestions.filter((q: any) => !answers[q.id]);
    
    if (missingAnswers.length > 0) {
      toast({
        title: '필수 항목을 입력해주세요',
        description: '모든 필수 질문에 답변해주세요.',
        variant: 'destructive',
      });
      return;
    }

    // 평균 점수 계산 (평점 질문만)
    const ratingQuestions = template.questions.filter((q: any) => q.type === 'rating');
    const ratingAnswers = ratingQuestions
      .map((q: any) => answers[q.id])
      .filter((a: any) => a !== undefined);
    
    const overallScore = ratingAnswers.length > 0
      ? ratingAnswers.reduce((sum: number, val: number) => sum + val, 0) / ratingAnswers.length
      : 0;

    submitMutation.mutate({ answers, overallScore });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-keystart-blue"></div>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-exclamation-circle text-red-500 text-2xl"></i>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">설문을 찾을 수 없습니다</h2>
          <p className="text-gray-500">
            {(error as any)?.message || '설문 링크가 만료되었거나 이미 응답한 설문입니다.'}
          </p>
        </Card>
      </div>
    );
  }

  const { template, customer, send } = data.data;
  const expiresAt = new Date(send.expiresAt);
  const daysLeft = Math.ceil((expiresAt.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-check-circle text-green-500 text-2xl"></i>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">응답이 완료되었습니다</h2>
          <p className="text-gray-500 mb-6">
            소중한 의견 감사합니다. 더 나은 서비스를 제공하기 위해 노력하겠습니다.
          </p>
          <div className="w-24 h-24 mx-auto">
            <img src={keystartLogo} alt="키스타트 로고" className="w-full h-full object-contain" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <Card className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center p-2">
              <img src={keystartLogo} alt="키스타트 로고" className="w-full h-full object-contain" />
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">응답 기한</p>
              <p className="text-sm font-medium text-gray-900">
                {daysLeft}일 남음 ({expiresAt.toLocaleDateString('ko-KR')})
              </p>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2" data-testid="text-survey-title">
            {template.title}
          </h1>
          {template.description && (
            <p className="text-gray-600 mb-4">{template.description}</p>
          )}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
            <p className="text-sm text-blue-700">
              <i className="fas fa-info-circle mr-2"></i>
              {customer.name}님을 위한 설문입니다
            </p>
          </div>
        </Card>

        {/* Questions */}
        {template.questions.map((question: any, index: number) => (
          <Card key={question.id} className="p-6" data-testid={`card-question-${index}`}>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                질문 {index + 1}
                {question.required && <span className="text-red-500 ml-1">*</span>}
              </h3>
              <p className="text-gray-700 mt-2">{question.question}</p>
            </div>

            {question.type === 'text' && (
              <Textarea
                value={answers[question.id] || ''}
                onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                placeholder="답변을 입력하세요"
                rows={4}
                data-testid={`input-answer-${index}`}
              />
            )}

            {question.type === 'rating' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">1 (매우 불만족)</span>
                  <span className="text-sm text-gray-500">5 (매우 만족)</span>
                </div>
                <div className="flex items-center justify-center space-x-4">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => handleAnswerChange(question.id, rating)}
                      className={`w-12 h-12 rounded-full border-2 transition-all ${
                        answers[question.id] === rating
                          ? 'bg-keystart-blue border-keystart-blue text-white'
                          : 'border-gray-300 hover:border-keystart-blue'
                      }`}
                      data-testid={`button-rating-${index}-${rating}`}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {question.type === 'choice' && (
              <RadioGroup
                value={answers[question.id]}
                onValueChange={(value) => handleAnswerChange(question.id, value)}
              >
                {question.options?.map((option: string, optIndex: number) => (
                  <div key={optIndex} className="flex items-center space-x-2">
                    <RadioGroupItem 
                      value={option} 
                      id={`${question.id}-${optIndex}`}
                      data-testid={`radio-${index}-${optIndex}`}
                    />
                    <Label htmlFor={`${question.id}-${optIndex}`}>{option}</Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            {question.type === 'multiChoice' && (
              <div className="space-y-2">
                {question.options?.map((option: string, optIndex: number) => {
                  const selectedOptions = answers[question.id] || [];
                  const isChecked = selectedOptions.includes(option);
                  
                  return (
                    <div key={optIndex} className="flex items-center space-x-2">
                      <Checkbox
                        id={`${question.id}-${optIndex}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          const newOptions = checked
                            ? [...selectedOptions, option]
                            : selectedOptions.filter((o: string) => o !== option);
                          handleAnswerChange(question.id, newOptions);
                        }}
                        data-testid={`checkbox-${index}-${optIndex}`}
                      />
                      <Label htmlFor={`${question.id}-${optIndex}`}>{option}</Label>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ))}

        {/* Submit Button */}
        <Card className="p-6">
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            className="w-full bg-keystart-blue hover:bg-keystart-blue/90"
            data-testid="button-submit-survey"
          >
            {submitMutation.isPending ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                제출 중...
              </>
            ) : (
              <>
                <i className="fas fa-paper-plane mr-2"></i>
                설문 제출하기
              </>
            )}
          </Button>
          <p className="text-sm text-gray-500 text-center mt-4">
            <i className="fas fa-lock mr-1"></i>
            응답 내용은 안전하게 보관됩니다
          </p>
        </Card>
      </div>
    </div>
  );
}
