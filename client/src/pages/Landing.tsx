import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";

export default function Landing() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = () => {
    setIsLoading(true);
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700">
      <Card className="w-full max-w-md mx-4 shadow-2xl">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-500 rounded-full mb-4">
              <i className="fas fa-user-tie text-white text-2xl"></i>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">마셈블 CRM</h1>
            <p className="text-gray-600 mt-2">개인회생 상담 관리 시스템</p>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username">아이디</Label>
              <Input 
                id="username" 
                type="text" 
                placeholder="아이디를 입력하세요"
                data-testid="input-username"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="비밀번호를 입력하세요"
                data-testid="input-password"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox id="remember" />
              <Label htmlFor="remember" className="text-sm text-gray-600">
                로그인 상태 유지
              </Label>
            </div>
            
            <Button 
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full bg-primary-500 hover:bg-primary-600"
              data-testid="button-login"
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>로그인 중...</span>
                </div>
              ) : (
                '로그인'
              )}
            </Button>
          </div>
          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              개인회생 상담 전문 CRM 시스템
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
