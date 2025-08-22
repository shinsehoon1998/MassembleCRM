import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Users() {
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
    <div className="p-6 space-y-6" data-testid="users-content">
      <Card className="border-gray-100">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">
            사용자 관리
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <i className="fas fa-users text-4xl text-gray-400 mb-4"></i>
            <h3 className="text-lg font-medium text-gray-900 mb-2">사용자 관리 기능</h3>
            <p className="text-gray-500">
              사용자 관리 기능이 준비 중입니다.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
