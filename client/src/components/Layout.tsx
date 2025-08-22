import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import type { User } from "@shared/schema";
import masembleLogo from '@assets/마셈블 로고_1755848502895.jpg';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const getPageTitle = () => {
    const titles: Record<string, string> = {
      '/': '대시보드',
      '/customers': '고객관리',
      '/data-import': '데이터 관리',
      '/users': '사용자관리',
      '/settings': '환경설정',
    };
    return titles[location] || '마셈블 CRM';
  };

  const getPageDescription = () => {
    const descriptions: Record<string, string> = {
      '/': '시스템 현황을 한눈에 확인하세요',
      '/customers': '고객 정보를 관리하고 상담을 진행하세요',
      '/data-import': 'CSV 템플릿 다운로드 및 대량 업로드를 진행하세요',
      '/users': '시스템 사용자를 관리하세요',
      '/settings': '시스템 환경을 설정하세요',
    };
    return descriptions[location] || '';
  };

  const isNavItemActive = (path: string) => {
    if (path === '/' && location === '/') return true;
    if (path !== '/' && location.startsWith(path)) return true;
    return false;
  };

  const handleLogout = async () => {
    try {
      await apiRequest('POST', '/api/logout');
      queryClient.clear(); // Clear all cached data
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      // Still redirect even if logout fails
      queryClient.clear();
      window.location.href = '/login';
    }
  };

  return (
    <div className="flex h-screen bg-gray-50" data-testid="main-layout">
      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
          data-testid="button-mobile-menu"
        >
          <i className={`fas ${isMobileMenuOpen ? 'fa-times' : 'fa-bars'}`}></i>
        </Button>
      </div>

      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <div className={`w-64 bg-massemble-black text-white flex-shrink-0 transform transition-transform duration-300 ease-in-out ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 fixed lg:relative z-50 h-full lg:h-auto`}>
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center p-1">
              <img src={masembleLogo} alt="마셈블 로고" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">마셈블 CRM</h1>
              <p className="text-xs text-gray-300">개인회생·파산 상담 관리 시스템</p>
            </div>
          </div>
        </div>
        
        <nav className="mt-6">
          <Link href="/">
            <a className={`flex items-center px-6 py-3 text-gray-300 hover:bg-white/10 hover:text-white border-l-4 transition-colors ${
              isNavItemActive('/') ? 'border-massemble-red bg-white/10 text-white' : 'border-transparent'
            }`} data-testid="nav-dashboard">
              <i className="fas fa-tachometer-alt w-5"></i>
              <span className="ml-3">대시보드</span>
            </a>
          </Link>
          
          <Link href="/customers">
            <a className={`flex items-center px-6 py-3 text-gray-300 hover:bg-white/10 hover:text-white border-l-4 transition-colors ${
              isNavItemActive('/customers') ? 'border-massemble-red bg-white/10 text-white' : 'border-transparent'
            }`} data-testid="nav-customers">
              <i className="fas fa-users w-5"></i>
              <span className="ml-3">고객관리</span>
            </a>
          </Link>

          <Link href="/data-import">
            <a className={`flex items-center px-6 py-3 text-gray-300 hover:bg-white/10 hover:text-white border-l-4 transition-colors ${
              isNavItemActive('/data-import') ? 'border-massemble-red bg-white/10 text-white' : 'border-transparent'
            }`} data-testid="nav-data-import">
              <i className="fas fa-database w-5"></i>
              <span className="ml-3">데이터 관리</span>
            </a>
          </Link>
          
          {(user?.role === 'admin' || user?.role === 'manager') && (
            <Link href="/users">
              <a className={`flex items-center px-6 py-3 text-gray-300 hover:bg-white/10 hover:text-white border-l-4 transition-colors ${
                isNavItemActive('/users') ? 'border-massemble-red bg-white/10 text-white' : 'border-transparent'
              }`} data-testid="nav-users">
                <i className="fas fa-user-cog w-5"></i>
                <span className="ml-3">사용자관리</span>
              </a>
            </Link>
          )}
          
          {user?.role === 'admin' && (
            <Link href="/settings">
              <a className={`flex items-center px-6 py-3 text-gray-300 hover:bg-white/10 hover:text-white border-l-4 transition-colors ${
                isNavItemActive('/settings') ? 'border-massemble-red bg-white/10 text-white' : 'border-transparent'
              }`} data-testid="nav-settings">
                <i className="fas fa-cog w-5"></i>
                <span className="ml-3">환경설정</span>
              </a>
            </Link>
          )}
          
          <div className="border-t border-white/10 mt-6 pt-6">
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full flex items-center justify-start px-6 py-3 text-gray-300 hover:bg-white/10 hover:text-white"
              data-testid="button-logout"
            >
              <i className="fas fa-sign-out-alt w-5"></i>
              <span className="ml-3">로그아웃</span>
            </Button>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900" data-testid="text-page-title">
                {getPageTitle()}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {getPageDescription()}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center text-sm text-gray-500">
                <i className="fas fa-clock mr-2"></i>
                <span data-testid="text-current-time">
                  {currentTime.toLocaleString('ko-KR')}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-massemble-red rounded-full flex items-center justify-center">
                  <i className="fas fa-user text-white text-sm"></i>
                </div>
                <div className="text-sm">
                  <div className="font-medium text-gray-900" data-testid="text-user-name">
                    {user?.name || '사용자'}
                  </div>
                  <div className="text-gray-500" data-testid="text-user-department">
                    {user?.department || ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
