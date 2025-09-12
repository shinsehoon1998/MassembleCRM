import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Upload, FileAudio, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [formData, setFormData] = useState({
    description: "",
  });

  // 아톡 음원 목록 조회
  const { data: audioFiles, isLoading } = useQuery({
    queryKey: ["/api/ars/audio-files"],
  });

  // 시나리오 생성 + 음원 업로드 (아톡비즈 연동)
  const createScenarioMutation = useMutation({
    mutationFn: async (data: { description: string; audioFile: File }) => {
      const formData = new FormData();
      formData.append('description', data.description);
      formData.append('audioFile', data.audioFile);
      formData.append('uploadToAtalk', 'true'); // 아톡비즈 연동 플래그

      const response = await fetch('/api/ars/scenarios/create-with-audio', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        let errorMessage = '시나리오 생성에 실패했습니다.';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch {
          // JSON 파싱 실패 시 텍스트로 시도
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch {
            // 최종 fallback
            errorMessage = `서버 오류 (${response.status})`;
          }
        }
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "시나리오 생성 완료",
        description: `음원이 아톡비즈에도 자동 등록되었습니다: ${data.fileName}`,
      });
      setShowCreateModal(false);
      setFormData({ description: "" });
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/ars/audio-files"] });
    },
    onError: (error: Error) => {
      toast({
        title: "생성 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 음원 삭제
  const deleteAudioMutation = useMutation({
    mutationFn: async (audioId: string) => {
      return apiRequest("DELETE", `/api/ars/audio-files/${audioId}`);
    },
    onSuccess: () => {
      toast({
        title: "삭제 완료",
        description: "음원이 삭제되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ars/audio-files"] });
    },
    onError: (error: Error) => {
      toast({
        title: "삭제 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const validateFile = (file: File) => {
    // 파일 형식 검증
    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "파일 형식 오류",
        description: "WAV 또는 MP3 파일만 업로드 가능합니다.",
        variant: "destructive",
      });
      return false;
    }
    
    // 파일 크기 검증 (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "파일 크기 오류",
        description: "10MB 이하의 파일만 업로드 가능합니다.",
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragActive(false);
    
    const files = Array.from(event.dataTransfer.files);
    const audioFile = files.find(file => file.type.startsWith('audio/'));
    
    if (audioFile && validateFile(audioFile)) {
      setSelectedFile(audioFile);
    } else if (files.length > 0 && !audioFile) {
      toast({
        title: "파일 형식 오류",
        description: "음원 파일만 업로드 가능합니다.",
        variant: "destructive",
      });
    }
  };

  const handleCreate = () => {
    if (!formData.description.trim()) {
      toast({
        title: "입력 오류",
        description: "시나리오 설명을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedFile) {
      toast({
        title: "파일 선택 필요",
        description: "음원 파일을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    createScenarioMutation.mutate({
      description: formData.description,
      audioFile: selectedFile
    });
  };

  const handleDelete = (audioId: string) => {
    deleteAudioMutation.mutate(audioId);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
          <h1 className="text-2xl font-bold text-gray-900">시나리오 관리</h1>
          <p className="text-gray-600 mt-1">ARS 시나리오와 음원을 관리합니다.</p>
        </div>
        
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-scenario">
              <Plus className="h-4 w-4 mr-2" />
              새 시나리오
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>새 시나리오 생성</DialogTitle>
              <DialogDescription>
                새로운 ARS 시나리오를 생성합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* 설명 입력 */}
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
                  className="h-20"
                  data-testid="textarea-scenario-description"
                />
              </div>

              {/* 음원 파일 업로드 */}
              <div className="space-y-2">
                <Label htmlFor="audioFile">음원 파일</Label>
                <div 
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    isDragActive 
                      ? 'border-blue-400 bg-blue-50' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Upload className={`h-8 w-8 mx-auto mb-2 ${
                    isDragActive ? 'text-blue-500' : 'text-gray-400'
                  }`} />
                  <input
                    type="file"
                    id="audioFile"
                    accept="audio/wav,audio/mp3,audio/mpeg"
                    onChange={handleFileChange}
                    className="hidden"
                    data-testid="input-audio-file"
                  />
                  <div className="space-y-3">
                    <div className="text-sm text-gray-600">
                      <span className={`font-semibold ${
                        isDragActive ? 'text-blue-600' : 'text-blue-600'
                      }`}>
                        여기로 드래그하거나
                      </span>{" "}
                      아래 버튼을 클릭하세요
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('audioFile')?.click()}
                      className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                      data-testid="button-select-file"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      파일 선택
                    </Button>
                    <div className="text-xs text-gray-500">
                      WAV, MP3 파일만 지원 (최대 10MB)
                    </div>
                  </div>
                  
                  {selectedFile && (
                    <div className="mt-3 p-2 bg-blue-50 rounded border">
                      <div className="flex items-center justify-center">
                        <FileAudio className="h-4 w-4 text-blue-600 mr-2" />
                        <span className="text-sm text-blue-800 font-medium">
                          {selectedFile.name}
                        </span>
                        <span className="text-xs text-blue-600 ml-2">
                          ({formatFileSize(selectedFile.size)})
                        </span>
                      </div>
                    </div>
                  )}
                </div>
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

      {/* 음원 관리 테이블 */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <FileAudio className="h-5 w-5 mr-2 text-blue-600" />
            음원 리스트
          </h2>
        </div>
        
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-12 text-center">번호</TableHead>
                <TableHead>파일명</TableHead>
                <TableHead>설명</TableHead>
                <TableHead className="w-24 text-center">파일크기</TableHead>
                <TableHead className="w-32 text-center">등록일</TableHead>
                <TableHead className="w-32 text-center">아톡상태</TableHead>
                <TableHead className="w-20 text-center">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(audioFiles as any)?.map((audio: any, index: number) => (
                <TableRow key={audio.id}>
                  <TableCell className="text-center font-medium">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <FileAudio className="h-4 w-4 text-blue-600 mr-2" />
                      <span className="font-medium" data-testid={`text-audio-name-${audio.id}`}>
                        {audio.fileName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-gray-600" data-testid={`text-audio-description-${audio.id}`}>
                      {audio.description || "설명 없음"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm text-gray-500">
                      {audio.fileSize ? formatFileSize(audio.fileSize) : "알 수 없음"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm text-gray-500">
                      {new Date(audio.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant={audio.atalkSynced ? "default" : "secondary"}
                      data-testid={`badge-atalk-status-${audio.id}`}
                    >
                      {audio.atalkSynced ? "동기화됨" : "대기중"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-delete-audio-${audio.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>음원 삭제</AlertDialogTitle>
                          <AlertDialogDescription>
                            '{audio.fileName}' 음원을 삭제하시겠습니까?
                            이 작업은 되돌릴 수 없습니다.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>취소</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(audio.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            삭제
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
              
              {(!audioFiles || (audioFiles as any).length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    등록된 음원이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}