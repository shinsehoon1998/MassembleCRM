import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import { Redirect, Link } from 'wouter';
import keystartLogo from '@assets/keystart_logo.png';

export default function Register() {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    name: '',
    email: '',
    role: 'counselor',
    department: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const { isAuthenticated } = useAuth();

  // Redirect if already authenticated
  if (isAuthenticated) {
    return <Redirect to="/" />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // 비밀번호 확인
    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      setIsLoading(false);
      return;
    }

    // 비밀번호 길이 검증
    if (formData.password.length < 4) {
      setError('비밀번호는 최소 4자 이상이어야 합니다.');
      setIsLoading(false);
      return;
    }

    try {
      await apiRequest('POST', '/api/register', {
        username: formData.username,
        password: formData.password,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        department: formData.department || '상담부'
      });

      setSuccess(true);
    } catch (error: any) {
      console.error('Registration error:', error);
      setError(error.message || '회원가입에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  const handleRoleChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      role: value
    }));
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-500 rounded-lg flex items-center justify-center">
                <i className="fas fa-check text-2xl text-white"></i>
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              회원가입 완료
            </CardTitle>
          </CardHeader>
          
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">
              회원가입이 성공적으로 완료되었습니다.
            </p>
            <p className="text-sm text-gray-500">
              이제 로그인하여 시스템을 사용할 수 있습니다.
            </p>
            
            <Link href="/login">
              <Button className="w-full bg-keystart-blue hover:bg-keystart-blue-hover">
                <i className="fas fa-sign-in-alt mr-2"></i>
                로그인하러 가기
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center p-2 shadow-sm border border-gray-100">
              <img src={keystartLogo} alt="키스타트 로고" className="w-full h-full object-contain" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            회원가입
          </CardTitle>
          <p className="text-gray-600">
            키스타트 DB 관리 마법사 계정을 만드세요
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
              <Label htmlFor="username">사용자명 *</Label>
              <Input
                id="username"
                type="text"
                value={formData.username}
                onChange={handleChange('username')}
                placeholder="사용자명을 입력하세요"
                required
                disabled={isLoading}
                data-testid="input-username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">이름 *</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={handleChange('name')}
                placeholder="실명을 입력하세요"
                required
                disabled={isLoading}
                data-testid="input-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">이메일 *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={handleChange('email')}
                placeholder="이메일을 입력하세요"
                required
                disabled={isLoading}
                data-testid="input-email"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호 *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={handleChange('password')}
                placeholder="비밀번호를 입력하세요 (최소 4자)"
                required
                disabled={isLoading}
                data-testid="input-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">비밀번호 확인 *</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange('confirmPassword')}
                placeholder="비밀번호를 다시 입력하세요"
                required
                disabled={isLoading}
                data-testid="input-confirm-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">역할</Label>
              <Select value={formData.role} onValueChange={handleRoleChange} disabled={isLoading}>
                <SelectTrigger data-testid="select-role">
                  <SelectValue placeholder="역할을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="counselor">상담사</SelectItem>
                  <SelectItem value="manager">팀장</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">부서</Label>
              <Input
                id="department"
                type="text"
                value={formData.department}
                onChange={handleChange('department')}
                placeholder="부서명 (선택사항)"
                disabled={isLoading}
                data-testid="input-department"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-keystart-blue hover:bg-keystart-blue-hover"
              disabled={isLoading}
              data-testid="button-register"
            >
              {isLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  가입 중...
                </>
              ) : (
                <>
                  <i className="fas fa-user-plus mr-2"></i>
                  회원가입
                </>
              )}
            </Button>
          </form>
          
          <div className="mt-6 text-center text-sm text-gray-600">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-keystart-blue hover:underline">
              로그인하기
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}