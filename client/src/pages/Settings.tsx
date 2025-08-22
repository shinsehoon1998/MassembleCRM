import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { SystemSetting } from "@shared/schema";

const CATEGORIES = [
  { id: '계층구조', name: '계층구조' },
  { id: '부서구조', name: '부서구조' },
  { id: '상태항목', name: '상태항목' },
];

interface GroupedSettings {
  [category: string]: SystemSetting[];
}

export default function Settings() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState('계층구조');
  const [editingValues, setEditingValues] = useState<{ [key: string]: string }>({});

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

  const { data: settings = [], isLoading: isSettingsLoading } = useQuery<SystemSetting[]>({
    queryKey: ['/api/system-settings'],
    enabled: !!isAuthenticated,
  });

  const updateSettingMutation = useMutation({
    mutationFn: async (data: { key: string; value: string }) => {
      const response = await apiRequest("PUT", `/api/system-settings/${data.key}`, { value: data.value });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/system-settings'] });
      toast({
        title: "성공",
        description: "설정이 저장되었습니다.",
        variant: "default",
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "설정 저장에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  // Group settings by category
  const groupedSettings: GroupedSettings = settings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {} as GroupedSettings);

  const currentCategorySettings = groupedSettings[selectedCategory] || [];

  const handleInputChange = (key: string, value: string) => {
    setEditingValues(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = (key: string) => {
    const value = editingValues[key];
    if (value !== undefined) {
      updateSettingMutation.mutate({ key, value });
      // Remove from editing values after save
      setEditingValues(prev => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
    }
  };

  const getDisplayValue = (setting: SystemSetting) => {
    return editingValues[setting.key] !== undefined 
      ? editingValues[setting.key] 
      : (setting.value || '');
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6" data-testid="settings-content">
      <Card className="border-gray-100">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">
            환경설정
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex min-h-[600px]">
            {/* Left sidebar */}
            <div className="w-64 bg-gray-100 border-r">
              <div className="bg-blue-500 text-white p-3">
                <h3 className="font-medium">환경설정</h3>
              </div>
              <nav className="p-0">
                {CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`w-full px-4 py-3 text-left text-sm border-b border-gray-200 hover:bg-blue-50 transition-colors ${
                      selectedCategory === category.id 
                        ? 'bg-blue-500 text-white' 
                        : 'text-gray-700 hover:text-blue-600'
                    }`}
                    data-testid={`category-${category.id}`}
                  >
                    {category.name}
                  </button>
                ))}
              </nav>
            </div>

            {/* Right content area */}
            <div className="flex-1 p-6">
              {isSettingsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              ) : (
                <div className="space-y-6">
                  {currentCategorySettings.length > 0 ? (
                    currentCategorySettings.map((setting) => (
                      <div key={setting.key} className="space-y-2">
                        <Label htmlFor={setting.key} className="text-sm font-medium text-gray-900">
                          {setting.label}
                        </Label>
                        {setting.description && setting.description.length > 50 ? (
                          <Textarea
                            id={setting.key}
                            value={getDisplayValue(setting)}
                            onChange={(e) => handleInputChange(setting.key, e.target.value)}
                            className="min-h-[120px]"
                            placeholder={setting.description}
                            data-testid={`input-${setting.key}`}
                          />
                        ) : (
                          <Input
                            id={setting.key}
                            value={getDisplayValue(setting)}
                            onChange={(e) => handleInputChange(setting.key, e.target.value)}
                            placeholder={setting.description}
                            data-testid={`input-${setting.key}`}
                          />
                        )}
                        {editingValues[setting.key] !== undefined && (
                          <div className="flex space-x-2">
                            <Button
                              onClick={() => handleSave(setting.key)}
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700"
                              disabled={updateSettingMutation.isPending}
                              data-testid={`save-${setting.key}`}
                            >
                              저장
                            </Button>
                            <Button
                              onClick={() => setEditingValues(prev => {
                                const newState = { ...prev };
                                delete newState[setting.key];
                                return newState;
                              })}
                              size="sm"
                              variant="outline"
                              data-testid={`cancel-${setting.key}`}
                            >
                              취소
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      선택된 카테고리에 설정 항목이 없습니다.
                    </div>
                  )}

                  <Separator className="my-6" />
                  
                  <div className="text-center">
                    <Button
                      onClick={() => {
                        // Save all edited values
                        Object.entries(editingValues).forEach(([key, value]) => {
                          updateSettingMutation.mutate({ key, value });
                        });
                        setEditingValues({});
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={Object.keys(editingValues).length === 0 || updateSettingMutation.isPending}
                      data-testid="save-all-button"
                    >
                      저장
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}