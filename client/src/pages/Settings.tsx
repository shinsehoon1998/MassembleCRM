import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus, Edit, Save, X } from "lucide-react";
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
  const [newItemValue, setNewItemValue] = useState('');

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
      setEditingValues({});
      toast({
        title: "성공",
        description: "설정이 수정되었습니다.",
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "설정 수정에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const createSettingMutation = useMutation({
    mutationFn: async (data: { category: string; label: string; value: string }) => {
      const key = `${data.category.toLowerCase()}_${Date.now()}`;
      const response = await apiRequest("POST", "/api/system-settings", {
        key,
        category: data.category,
        label: data.label,
        description: data.label,
        value: data.value,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/system-settings'] });
      setNewItemValue('');
      toast({
        title: "성공",
        description: "새 항목이 추가되었습니다.",
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "항목 추가에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const deleteSettingMutation = useMutation({
    mutationFn: async (key: string) => {
      const response = await apiRequest("DELETE", `/api/system-settings/${key}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/system-settings'] });
      toast({
        title: "성공",
        description: "항목이 삭제되었습니다.",
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "항목 삭제에 실패했습니다.",
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
    if (value !== undefined && value.trim()) {
      updateSettingMutation.mutate({ key, value: value.trim() });
    }
  };

  const handleEdit = (setting: SystemSetting) => {
    setEditingValues({ ...editingValues, [setting.key]: setting.value || '' });
  };

  const handleCancel = (key: string) => {
    setEditingValues(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
  };

  const handleDelete = (key: string) => {
    if (confirm('이 항목을 삭제하시겠습니까?')) {
      deleteSettingMutation.mutate(key);
    }
  };

  const handleAddNew = () => {
    if (newItemValue.trim()) {
      createSettingMutation.mutate({
        category: selectedCategory,
        label: newItemValue.trim(),
        value: newItemValue.trim(),
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
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900">
                      {selectedCategory} 관리
                    </h3>
                  </div>
                  
                  {/* 기존 항목들 */}
                  <div className="space-y-3">
                    {currentCategorySettings.length > 0 ? (
                      currentCategorySettings.map((setting) => (
                        <div key={setting.key} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                          <div className="flex-1">
                            {editingValues[setting.key] !== undefined ? (
                              <Input
                                value={editingValues[setting.key]}
                                onChange={(e) => handleInputChange(setting.key, e.target.value)}
                                className="mr-2"
                                data-testid={`input-${setting.key}`}
                                onKeyPress={(e) => e.key === 'Enter' && handleSave(setting.key)}
                              />
                            ) : (
                              <span className="text-sm font-medium text-gray-900">
                                {setting.value}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center space-x-2 ml-4">
                            {editingValues[setting.key] !== undefined ? (
                              <>
                                <Button
                                  onClick={() => handleSave(setting.key)}
                                  size="sm"
                                  className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700"
                                  disabled={updateSettingMutation.isPending}
                                  data-testid={`save-${setting.key}`}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  onClick={() => handleCancel(setting.key)}
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 p-0"
                                  data-testid={`cancel-${setting.key}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  onClick={() => handleEdit(setting)}
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 p-0"
                                  data-testid={`edit-${setting.key}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  onClick={() => handleDelete(setting.key)}
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  disabled={deleteSettingMutation.isPending}
                                  data-testid={`delete-${setting.key}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                        아직 {selectedCategory} 항목이 없습니다.
                      </div>
                    )}
                  </div>

                  {/* 새 항목 추가 */}
                  <Separator className="my-6" />
                  
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-900">새 항목 추가</h4>
                    <div className="flex space-x-3">
                      <Input
                        value={newItemValue}
                        onChange={(e) => setNewItemValue(e.target.value)}
                        placeholder={`새 ${selectedCategory} 항목을 입력하세요`}
                        className="flex-1"
                        data-testid="input-new-item"
                        onKeyPress={(e) => e.key === 'Enter' && handleAddNew()}
                      />
                      <Button
                        onClick={handleAddNew}
                        disabled={!newItemValue.trim() || createSettingMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700 px-6"
                        data-testid="button-add-new"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        추가
                      </Button>
                    </div>
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