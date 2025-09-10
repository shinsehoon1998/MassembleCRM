import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash2, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function ScenarioManagement() {
  const { toast } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingScenario, setEditingScenario] = useState<any>(null);
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    description: "",
  });

  // 시나리오 목록 조회
  const { data: scenarios, isLoading } = useQuery({
    queryKey: ["/api/ars/scenarios"],
  });

  // 시나리오 생성
  const createScenarioMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; description: string }) => {
      return apiRequest("POST", "/api/ars/scenarios", data);
    },
    onSuccess: () => {
      toast({
        title: "성공",
        description: "시나리오가 생성되었습니다.",
      });
      setShowCreateModal(false);
      setFormData({ id: "", name: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/ars/scenarios"] });
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 시나리오 수정
  const updateScenarioMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<any> }) => {
      return apiRequest("PUT", `/api/ars/scenarios/${data.id}`, data.updates);
    },
    onSuccess: () => {
      toast({
        title: "성공",
        description: "시나리오가 수정되었습니다.",
      });
      setEditingScenario(null);
      setFormData({ id: "", name: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/ars/scenarios"] });
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 시나리오 삭제 (비활성화)
  const deleteScenarioMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/ars/scenarios/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "성공",
        description: "시나리오가 삭제되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ars/scenarios"] });
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    if (!formData.id || !formData.name) {
      toast({
        title: "입력 오류",
        description: "시나리오 ID와 이름을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    createScenarioMutation.mutate(formData);
  };

  const handleEdit = (scenario: any) => {
    setEditingScenario(scenario);
    setFormData({
      id: scenario.id,
      name: scenario.name,
      description: scenario.description || "",
    });
  };

  const handleUpdate = () => {
    if (!formData.name) {
      toast({
        title: "입력 오류",
        description: "시나리오 이름을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    updateScenarioMutation.mutate({
      id: editingScenario.id,
      updates: {
        name: formData.name,
        description: formData.description,
      },
    });
  };

  const handleDelete = (id: string) => {
    deleteScenarioMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ARS 시나리오 관리</h1>
          <p className="text-gray-600 mt-1">ARS 발송에 사용할 시나리오를 관리합니다.</p>
        </div>
        
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-scenario">
              <Plus className="h-4 w-4 mr-2" />
              새 시나리오
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>새 시나리오 생성</DialogTitle>
              <DialogDescription>
                새로운 ARS 시나리오를 생성합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="scenarioId">시나리오 ID</Label>
                <Input
                  id="scenarioId"
                  placeholder="예: marketing_promotion"
                  value={formData.id}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      id: e.target.value,
                    }))
                  }
                  data-testid="input-scenario-id"
                />
                <p className="text-sm text-gray-500">
                  영문, 숫자, 언더스코어(_)만 사용하세요.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="scenarioName">시나리오 이름</Label>
                <Input
                  id="scenarioName"
                  placeholder="예: 마케팅 프로모션 안내"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  data-testid="input-scenario-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scenarioDescription">설명</Label>
                <Textarea
                  id="scenarioDescription"
                  placeholder="시나리오에 대한 설명을 입력하세요."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData(prev => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  data-testid="textarea-scenario-description"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowCreateModal(false)}
                data-testid="button-cancel"
              >
                취소
              </Button>
              <Button 
                onClick={handleCreate}
                disabled={createScenarioMutation.isPending}
                data-testid="button-create"
              >
                {createScenarioMutation.isPending ? "생성 중..." : "생성"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 시나리오 목록 */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">등록된 시나리오</h2>
        </div>
        
        <div className="divide-y divide-gray-200">
          {(scenarios as any)?.map((scenario: any) => (
            <div key={scenario.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <MessageSquare className="h-5 w-5 text-blue-600" />
                    <h3 className="text-lg font-medium text-gray-900" data-testid={`text-scenario-name-${scenario.id}`}>
                      {scenario.name}
                    </h3>
                    <Badge variant="secondary" data-testid={`badge-scenario-id-${scenario.id}`}>
                      {scenario.id}
                    </Badge>
                    {scenario.isActive && (
                      <Badge variant="default" data-testid={`badge-scenario-status-${scenario.id}`}>
                        활성
                      </Badge>
                    )}
                  </div>
                  
                  {scenario.description && (
                    <p className="text-gray-600 mb-3" data-testid={`text-scenario-description-${scenario.id}`}>
                      {scenario.description}
                    </p>
                  )}
                  
                  <div className="text-sm text-gray-500">
                    생성일: {new Date(scenario.createdAt).toLocaleDateString('ko-KR')}
                    {scenario.createdBy && ` | 생성자: ${scenario.createdBy}`}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(scenario)}
                    data-testid={`button-edit-scenario-${scenario.id}`}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    수정
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:border-red-300"
                        data-testid={`button-delete-scenario-${scenario.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        삭제
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>시나리오 삭제</AlertDialogTitle>
                        <AlertDialogDescription>
                          '{scenario.name}' 시나리오를 삭제하시겠습니까?
                          이 작업은 되돌릴 수 없습니다.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(scenario.id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          삭제
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}
          
          {(!scenarios || (scenarios as any).length === 0) && (
            <div className="p-6 text-center text-gray-500">
              등록된 시나리오가 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* 시나리오 수정 모달 */}
      <Dialog open={!!editingScenario} onOpenChange={() => setEditingScenario(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>시나리오 수정</DialogTitle>
            <DialogDescription>
              시나리오 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>시나리오 ID</Label>
              <Input
                value={formData.id}
                disabled
                className="bg-gray-50"
              />
              <p className="text-sm text-gray-500">
                시나리오 ID는 수정할 수 없습니다.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="editScenarioName">시나리오 이름</Label>
              <Input
                id="editScenarioName"
                placeholder="예: 마케팅 프로모션 안내"
                value={formData.name}
                onChange={(e) =>
                  setFormData(prev => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                data-testid="input-edit-scenario-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="editScenarioDescription">설명</Label>
              <Textarea
                id="editScenarioDescription"
                placeholder="시나리오에 대한 설명을 입력하세요."
                value={formData.description}
                onChange={(e) =>
                  setFormData(prev => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                data-testid="textarea-edit-scenario-description"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => setEditingScenario(null)}
              data-testid="button-cancel-edit"
            >
              취소
            </Button>
            <Button 
              onClick={handleUpdate}
              disabled={updateScenarioMutation.isPending}
              data-testid="button-update"
            >
              {updateScenarioMutation.isPending ? "수정 중..." : "수정"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}