import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import type { User } from "@shared/schema";
import keystartLogo from '@assets/keystart_logo.png';

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
      '/appointments': '예약관리',
      '/data-import': '데이터 관리',
      '/ars-campaigns': 'ARS 캠페인',
      '/scenario-management': '시나리오 관리',
      '/customer-groups': '고객 그룹 관리',
      '/users': '사용자관리',
      '/sms-settings': 'SMS 설정',
      '/surveys': '설문조사',
      '/settings': '환경설정',
      '/as-requests': 'A.S 요청',
      '/as-review': 'A.S 검수',
      '/manual': 'CRM사용설명서',
    };
    return titles[location] || '키스타트 DB 관리 마법사';
  };

  const getPageDescription = () => {
    const descriptions: Record<string, string> = {
      '/': '시스템 현황을 한눈에 확인하세요',
      '/customers': '고객 정보를 관리하고 상담을 진행하세요',
      '/appointments': '상담 예약을 관리하고 일정을 확인하세요',
      '/data-import': 'CSV 템플릿 다운로드 및 대량 업로드를 진행하세요',
      '/ars-campaigns': 'ARS 마케팅 캠페인을 관리하고 모니터링하세요',
      '/scenario-management': 'ARS 시나리오를 생성하고 관리하세요',
      '/customer-groups': '고객을 그룹으로 분류하여 효율적으로 관리하세요',
      '/users': '시스템 사용자를 관리하세요',
      '/sms-settings': 'SMS 알림 및 템플릿을 관리하세요',
      '/surveys': '고객만족도 설문을 생성하고 응답을 관리하세요',
      '/settings': '시스템 환경을 설정하세요',
      '/as-requests': '고객 A.S 요청 캠페인을 생성하고 관리하세요',
      '/as-review': '팀원들의 A.S 요청을 검수하고 승인/반려하세요',
      '/manual': 'CRM 사용 방법과 기능을 확인하세요',
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
      <div className={`w-64 bg-sidebar text-white flex-shrink-0 transform transition-transform duration-300 ease-in-out ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 fixed lg:relative z-50 h-full flex flex-col`}>
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center p-1">
              <img src={keystartLogo} alt="키스타트 로고" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">키스타트</h1>
              <p className="text-xs text-gray-300">DB 관리 마법사</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 mt-6 flex flex-col overflow-y-auto">
          {/* 메인 메뉴 */}
          <div>
            <Link 
              href="/"
              className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                isNavItemActive('/') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-gray-200 hover:text-white'
              }`} 
              data-testid="nav-dashboard"
            >
              <i className="fas fa-tachometer-alt w-5"></i>
              <span className="ml-3">대시보드</span>
            </Link>
            
            <Link 
              href="/customers"
              className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                isNavItemActive('/customers') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-gray-200 hover:text-white'
              }`} 
              data-testid="nav-customers"
            >
              <i className="fas fa-users w-5"></i>
              <span className="ml-3">고객관리</span>
            </Link>

            <Link 
              href="/appointments"
              className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                isNavItemActive('/appointments') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-gray-200 hover:text-white'
              }`} 
              data-testid="nav-appointments"
            >
              <i className="fas fa-calendar w-5"></i>
              <span className="ml-3">예약관리</span>
            </Link>

            <Link 
              href="/data-import"
              className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                isNavItemActive('/data-import') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-gray-200 hover:text-white'
              }`} 
              data-testid="nav-data-import"
            >
              <i className="fas fa-database w-5"></i>
              <span className="ml-3">데이터 관리</span>
            </Link>
          </div>

          {/* 관리자 메뉴 */}
          {user?.role === 'admin' && (
            <>
              <div className="mx-6 my-4 border-t border-white/20"></div>
              <div>
                <Link 
                  href="/ars-campaigns"
                  className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                    isNavItemActive('/ars-campaigns') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-gray-200 hover:text-white'
                  }`} 
                  data-testid="nav-ars-campaigns"
                >
                  <i className="fas fa-phone w-5"></i>
                  <span className="ml-3">ARS 캠페인</span>
                </Link>

                <Link 
                  href="/scenario-management"
                  className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                    isNavItemActive('/scenario-management') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-gray-200 hover:text-white'
                  }`} 
                  data-testid="nav-scenario-management"
                >
                  <i className="fas fa-comments w-5"></i>
                  <span className="ml-3">시나리오 관리</span>
                </Link>

                <Link 
                  href="/customer-groups"
                  className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                    isNavItemActive('/customer-groups') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-gray-200 hover:text-white'
                  }`} 
                  data-testid="nav-customer-groups"
                >
                  <i className="fas fa-layer-group w-5"></i>
                  <span className="ml-3">고객 그룹</span>
                </Link>
                
                <Link 
                  href="/users"
                  className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                    isNavItemActive('/users') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-gray-200 hover:text-white'
                  }`} 
                  data-testid="nav-users"
                >
                  <i className="fas fa-user-cog w-5"></i>
                  <span className="ml-3">사용자관리</span>
                </Link>
                
                <Link 
                  href="/sms-settings"
                  className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                    isNavItemActive('/sms-settings') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-gray-200 hover:text-white'
                  }`} 
                  data-testid="nav-sms-settings"
                >
                  <i className="fas fa-sms w-5"></i>
                  <span className="ml-3">SMS 설정</span>
                </Link>

                <Link 
                  href="/surveys"
                  className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                    isNavItemActive('/surveys') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-gray-200 hover:text-white'
                  }`} 
                  data-testid="nav-surveys"
                >
                  <i className="fas fa-poll w-5"></i>
                  <span className="ml-3">설문조사</span>
                </Link>

                <Link 
                  href="/settings"
                  className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                    isNavItemActive('/settings') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-gray-200 hover:text-white'
                  }`} 
                  data-testid="nav-settings"
                >
                  <i className="fas fa-cog w-5"></i>
                  <span className="ml-3">환경설정</span>
                </Link>
              </div>
            </>
          )}

          {/* A.S 관리 섹션 */}
          <div className="mx-6 my-4 border-t border-white/20"></div>
          <div className="bg-white/5">
            {/* A.S 요청 메뉴 (팀장/팀원) */}
            {(user?.role === 'manager' || user?.role === 'counselor') && (
              <Link 
                href="/as-requests"
                className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                  isNavItemActive('/as-requests') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-white hover:text-white'
                }`} 
                data-testid="nav-as-requests"
              >
                <i className="fas fa-tools w-5"></i>
                <span className="ml-3">A.S 요청</span>
              </Link>
            )}

            {/* A.S 검수 메뉴 (관리자) */}
            {user?.role === 'admin' && (
              <Link 
                href="/as-review"
                className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                  isNavItemActive('/as-review') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-white hover:text-white'
                }`} 
                data-testid="nav-as-review"
              >
                <i className="fas fa-clipboard-check w-5"></i>
                <span className="ml-3">A.S 검수</span>
              </Link>
            )}

            <Link 
              href="/manual"
              className={`flex items-center px-6 py-3 hover:bg-white/10 border-l-4 transition-colors ${
                isNavItemActive('/manual') ? 'border-keystart-blue bg-white/10 text-white' : 'border-transparent text-white hover:text-white'
              }`} 
              data-testid="nav-manual"
            >
              <i className="fas fa-book w-5"></i>
              <span className="ml-3">CRM사용설명서</span>
            </Link>
          </div>
          
          {/* 로그아웃 섹션 */}
          <div className="mt-auto">
            <div className="mx-6 mb-4 border-t border-white/20"></div>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full flex items-center justify-start px-6 py-3 text-white hover:bg-white/10 hover:text-white"
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
                <div className="w-8 h-8 bg-keystart-blue rounded-full flex items-center justify-center">
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
