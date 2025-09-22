import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error, isError } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // 401 오류나 네트워크 오류 시 빠르게 실패 처리
    queryFn: async () => {
      try {
        const response = await fetch('/api/auth/user', {
          credentials: 'include',
        });
        
        if (response.status === 401) {
          // 401 응답은 인증되지 않은 상태이므로 null 반환
          return null;
        }
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        // 네트워크 오류나 기타 오류 시 null 반환 (인증되지 않은 것으로 처리)
        console.warn('Auth check failed:', error);
        return null;
      }
    }
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error && !isError,
  };
}
