import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Redirect, useLocation } from 'wouter';

export default function Login() {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { isAuthenticated } = useAuth();
  const [location] = useLocation();

  // Extract redirectTo parameter from URL
  const getRedirectUrl = () => {
    const urlParams = new URLSearchParams(location.split('?')[1] || '');
    const redirectTo = urlParams.get('redirectTo');
    return redirectTo && redirectTo !== '/login' && redirectTo !== '/register' ? redirectTo : '/';
  };

  // Redirect if already authenticated
  if (isAuthenticated) {
    return <Redirect to={getRedirectUrl()} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await apiRequest('POST', '/api/auth/login', credentials);

      // Invalidate auth query to refetch user data
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      
      // Redirect will happen automatically when user data is refetched
    } catch (error: any) {
      console.error('Login error:', error);
      
      // API 오류 메시지에서 실제 메시지만 추출
      let errorMessage = '로그인에 실패했습니다.';
      
      if (error.message) {
        // "401: {"message":"메시지"}" 형태에서 메시지만 추출
        const match = error.message.match(/^\d+:\s*(.+)$/);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            errorMessage = parsed.message || errorMessage;
          } catch {
            errorMessage = match[1];
          }
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: keyof typeof credentials) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-massemble-red rounded-lg flex items-center justify-center">
              <i className="fas fa-building text-2xl text-white"></i>
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            MassembleCRM
          </CardTitle>
          <p className="text-gray-600">
            고객관리시스템
          </p>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-700 bg-red-100 border border-red-300 rounded-md">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="username">사용자명</Label>
              <Input
                id="username"
                type="text"
                value={credentials.username}
                onChange={handleChange('username')}
                placeholder="사용자명을 입력하세요"
                required
                disabled={isLoading}
                data-testid="input-username"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={credentials.password}
                onChange={handleChange('password')}
                placeholder="비밀번호를 입력하세요"
                required
                disabled={isLoading}
                data-testid="input-password"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-massemble-red hover:bg-massemble-red-hover"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  로그인 중...
                </>
              ) : (
                <>
                  <i className="fas fa-sign-in-alt mr-2"></i>
                  로그인
                </>
              )}
            </Button>
          </form>
          
          <div className="mt-6 text-center text-sm text-gray-600">
            계정이 없으신가요?{' '}
            <a href="/register" className="text-massemble-red hover:underline">
              회원가입하기
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}