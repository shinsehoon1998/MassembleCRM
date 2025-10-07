import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
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
import type { SurveyTemplate } from '@shared/schema';

export default function SurveysPage() {
  const { data: templates, isLoading } = useQuery<SurveyTemplate[]>({
    queryKey: ['/api/surveys'],
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">설문조사 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            고객만족도 설문 템플릿을 관리하고 응답을 확인하세요
          </p>
        </div>
        <Link href="/surveys/new">
          <Button 
            className="bg-massemble-red hover:bg-massemble-red/90"
            data-testid="button-create-survey"
          >
            <i className="fas fa-plus mr-2"></i>
            설문 템플릿 생성
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">총 템플릿</p>
              <p className="text-2xl font-bold text-gray-900" data-testid="text-total-templates">
                {templates?.length || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-clipboard-list text-blue-600 text-xl"></i>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">활성 템플릿</p>
              <p className="text-2xl font-bold text-green-600" data-testid="text-active-templates">
                {templates?.filter(t => t.isActive).length || 0}
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
              <p className="text-sm text-gray-500">비활성 템플릿</p>
              <p className="text-2xl font-bold text-gray-400" data-testid="text-inactive-templates">
                {templates?.filter(t => !t.isActive).length || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-pause-circle text-gray-400 text-xl"></i>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">총 응답</p>
              <p className="text-2xl font-bold text-massemble-red" data-testid="text-total-responses">
                0
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-chart-bar text-massemble-red text-xl"></i>
            </div>
          </div>
        </Card>
      </div>

      {/* Templates Table */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">설문 템플릿 목록</h2>
        
        {!templates || templates.length === 0 ? (
          <div className="text-center py-12">
            <i className="fas fa-clipboard-list text-gray-300 text-5xl mb-4"></i>
            <p className="text-gray-500">아직 생성된 설문 템플릿이 없습니다.</p>
            <p className="text-sm text-gray-400 mt-2">
              첫 번째 설문 템플릿을 생성해보세요.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>템플릿명</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>질문 수</TableHead>
                <TableHead>생성일</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                  <TableCell className="font-medium">
                    {template.title}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {template.surveyType === 'satisfaction' && '만족도 조사'}
                      {template.surveyType === 'nps' && 'NPS 조사'}
                      {template.surveyType === 'custom' && '커스텀'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {template.isActive ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                        <i className="fas fa-check-circle mr-1"></i>
                        활성
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
                        <i className="fas fa-pause-circle mr-1"></i>
                        비활성
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {Array.isArray(template.questions) ? template.questions.length : 0}개
                  </TableCell>
                  <TableCell>
                    {new Date(template.createdAt!).toLocaleDateString('ko-KR')}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Link href={`/surveys/${template.id}/responses`}>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        data-testid={`button-view-responses-${template.id}`}
                      >
                        <i className="fas fa-chart-line mr-1"></i>
                        응답보기
                      </Button>
                    </Link>
                    <Link href={`/surveys/${template.id}/edit`}>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        data-testid={`button-edit-${template.id}`}
                      >
                        <i className="fas fa-edit mr-1"></i>
                        수정
                      </Button>
                    </Link>
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
