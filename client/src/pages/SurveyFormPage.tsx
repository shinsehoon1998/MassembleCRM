import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { SurveyTemplate } from '@shared/schema';

const questionSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'rating', 'choice', 'multiChoice']),
  question: z.string().min(1, '질문을 입력해주세요'),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
});

const surveyFormSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  description: z.string().optional(),
  surveyType: z.enum(['satisfaction', 'nps', 'custom']),
  questions: z.array(questionSchema).min(1, '최소 1개의 질문이 필요합니다'),
  isActive: z.boolean(),
});

type SurveyFormData = z.infer<typeof surveyFormSchema>;

export default function SurveyFormPage() {
  const [, params] = useRoute('/surveys/:id/edit');
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEditMode = Boolean(params?.id);

  const { data: template, isLoading } = useQuery<SurveyTemplate>({
    queryKey: ['/api/surveys', params?.id],
    enabled: isEditMode,
  });

  const form = useForm<SurveyFormData>({
    resolver: zodResolver(surveyFormSchema),
    defaultValues: {
      title: '',
      description: '',
      surveyType: 'satisfaction',
      questions: [
        {
          id: crypto.randomUUID(),
          type: 'rating',
          question: '',
          required: true,
          options: [],
        },
      ],
      isActive: true,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'questions',
  });

  useEffect(() => {
    if (template && isEditMode) {
      const questions = Array.isArray(template.questions) 
        ? template.questions 
        : [];
      
      form.reset({
        title: template.title,
        description: template.description || '',
        surveyType: template.surveyType as any,
        questions: questions.map((q: any) => ({
          id: q.id || crypto.randomUUID(),
          type: q.type || 'text',
          question: q.question || '',
          required: q.required !== false,
          options: q.options || [],
        })),
        isActive: template.isActive,
      });
    }
  }, [template, isEditMode, form]);

  const createMutation = useMutation({
    mutationFn: (data: SurveyFormData) => 
      apiRequest('POST', '/api/surveys', data),
    onSuccess: () => {
      toast({
        title: '설문 템플릿이 생성되었습니다',
        variant: 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/surveys'] });
      navigate('/surveys');
    },
    onError: () => {
      toast({
        title: '설문 템플릿 생성에 실패했습니다',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: SurveyFormData) => 
      apiRequest('PUT', `/api/surveys/${params?.id}`, data),
    onSuccess: () => {
      toast({
        title: '설문 템플릿이 수정되었습니다',
        variant: 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/surveys'] });
      navigate('/surveys');
    },
    onError: () => {
      toast({
        title: '설문 템플릿 수정에 실패했습니다',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: SurveyFormData) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const addQuestion = () => {
    append({
      id: crypto.randomUUID(),
      type: 'rating',
      question: '',
      required: true,
      options: [],
    });
  };

  if (isLoading && isEditMode) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded w-1/4"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditMode ? '설문 템플릿 수정' : '설문 템플릿 생성'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              고객만족도 설문 템플릿을 {isEditMode ? '수정' : '생성'}하세요
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/surveys')}
            data-testid="button-cancel"
          >
            <i className="fas fa-times mr-2"></i>
            취소
          </Button>
        </div>

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <Card className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">기본 정보</h2>
              
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>템플릿 제목 *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="예: 2024년 고객만족도 조사"
                        data-testid="input-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>설명</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="설문 템플릿에 대한 설명을 입력하세요"
                        rows={3}
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="surveyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>설문 유형 *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-survey-type">
                          <SelectValue placeholder="설문 유형 선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="satisfaction">만족도 조사</SelectItem>
                        <SelectItem value="nps">NPS 조사</SelectItem>
                        <SelectItem value="custom">커스텀</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Card>

            {/* Questions */}
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">질문 목록</h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addQuestion}
                  data-testid="button-add-question"
                >
                  <i className="fas fa-plus mr-2"></i>
                  질문 추가
                </Button>
              </div>

              {fields.map((field, index) => (
                <Card key={field.id} className="p-4 bg-gray-50">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-700">
                      질문 {index + 1}
                    </h3>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        data-testid={`button-remove-question-${index}`}
                      >
                        <i className="fas fa-trash text-red-500"></i>
                      </Button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name={`questions.${index}.type`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>질문 유형</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid={`select-question-type-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="text">주관식</SelectItem>
                              <SelectItem value="rating">평점</SelectItem>
                              <SelectItem value="choice">객관식 (단일선택)</SelectItem>
                              <SelectItem value="multiChoice">객관식 (다중선택)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`questions.${index}.question`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>질문 내용 *</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="질문 내용을 입력하세요"
                              rows={2}
                              data-testid={`input-question-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {(form.watch(`questions.${index}.type`) === 'choice' || 
                      form.watch(`questions.${index}.type`) === 'multiChoice') && (
                      <FormField
                        control={form.control}
                        name={`questions.${index}.options`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>선택지 (쉼표로 구분)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value?.join(', ') || ''}
                                onChange={(e) => 
                                  field.onChange(
                                    e.target.value.split(',').map(s => s.trim()).filter(s => s)
                                  )
                                }
                                placeholder="예: 매우 만족, 만족, 보통, 불만족, 매우 불만족"
                                data-testid={`input-options-${index}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </Card>
              ))}
            </Card>

            {/* Submit Button */}
            <div className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/surveys')}
                data-testid="button-cancel-bottom"
              >
                취소
              </Button>
              <Button
                type="submit"
                className="bg-keystart-blue hover:bg-keystart-blue/90"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit"
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    저장 중...
                  </>
                ) : (
                  <>
                    <i className="fas fa-save mr-2"></i>
                    {isEditMode ? '수정' : '생성'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
