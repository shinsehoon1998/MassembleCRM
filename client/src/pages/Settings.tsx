import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function SystemInfoCard() {
  return (
    <Card className="border-gray-100">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900 flex items-center">
          <i className="fas fa-info-circle mr-2 text-blue-500"></i>
          시스템 정보
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">애플리케이션 버전</span>
            <Badge variant="outline">v1.0.0</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">시스템 상태</span>
            <Badge className="bg-green-100 text-green-800">정상 작동중</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">최근 백업</span>
            <span className="text-sm text-gray-500">2025-01-22 07:00</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DatabaseStatusCard() {
  return (
    <Card className="border-gray-100">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900 flex items-center">
          <i className="fas fa-database mr-2 text-purple-500"></i>
          데이터베이스 상태
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">연결 상태</span>
            <Badge className="bg-green-100 text-green-800">연결됨</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">데이터베이스 유형</span>
            <span className="text-sm text-gray-500">PostgreSQL</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">총 테이블 수</span>
            <span className="text-sm text-gray-500">6개</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GeneralSettingsCard() {
  return (
    <Card className="border-gray-100">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900 flex items-center">
          <i className="fas fa-sliders-h mr-2 text-gray-500"></i>
          일반 설정
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">시스템 설정</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">자동 백업</div>
                  <div className="text-sm text-gray-500">매일 새벽 3시에 자동으로 데이터를 백업합니다</div>
                </div>
                <Badge className="bg-green-100 text-green-800">활성화</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">활동 로그</div>
                  <div className="text-sm text-gray-500">사용자 활동과 시스템 변경사항을 기록합니다</div>
                </div>
                <Badge className="bg-green-100 text-green-800">활성화</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">이메일 알림</div>
                  <div className="text-sm text-gray-500">중요한 시스템 이벤트 발생 시 관리자에게 알림을 보냅니다</div>
                </div>
                <Badge variant="secondary">비활성화</Badge>
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">관리 작업</h4>
            <div className="flex space-x-3">
              <Button variant="outline" className="text-gray-600 hover:text-gray-800">
                <i className="fas fa-download mr-2"></i>
                데이터 내보내기
              </Button>
              <Button variant="outline" className="text-blue-600 hover:text-blue-800">
                <i className="fas fa-sync-alt mr-2"></i>
                캐시 새로고침
              </Button>
              <Button variant="outline" className="text-yellow-600 hover:text-yellow-800">
                <i className="fas fa-broom mr-2"></i>
                임시 파일 정리
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="settings-content">
      <Card className="border-gray-100">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">
            환경설정
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SystemInfoCard />
              <DatabaseStatusCard />
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              <GeneralSettingsCard />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
