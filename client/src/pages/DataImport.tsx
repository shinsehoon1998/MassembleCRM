import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

export default function DataImport() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/data-import/template', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('템플릿 다운로드에 실패했습니다.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'customer_template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "템플릿 다운로드 완료",
        description: "CSV 템플릿이 다운로드되었습니다.",
      });
    } catch (error) {
      console.error('Template download error:', error);
      toast({
        title: "다운로드 실패",
        description: "템플릿 다운로드 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "파일 형식 오류",
        description: "CSV 파일만 업로드 가능합니다.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadResults(null);

    try {
      const formData = new FormData();
      formData.append('csvFile', file);

      const response = await fetch('/api/data-import/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '업로드 처리 중 오류가 발생했습니다.');
      }

      setUploadResults(result);
      
      toast({
        title: "업로드 완료",
        description: result.message,
        variant: result.results.failed > 0 ? "destructive" : "default",
      });

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "업로드 실패",
        description: error instanceof Error ? error.message : "업로드 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const successPercentage = uploadResults 
    ? Math.round((uploadResults.results.success / uploadResults.results.total) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* 템플릿 다운로드 */}
        <Card data-testid="card-template-download">
          <CardHeader>
            <CardTitle className="flex items-center">
              <i className="fas fa-download mr-2 text-blue-500"></i>
              템플릿 다운로드
            </CardTitle>
            <CardDescription>
              고객 정보를 입력할 수 있는 CSV 템플릿을 다운로드하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-600">
              <p className="mb-2">템플릿에 포함된 필드:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>이름 (필수)</li>
                <li>연락처 (필수)</li>
                <li>보조연락처</li>
                <li>생년월일 (YYYY-MM-DD 형식)</li>
                <li>성별 (남성/여성)</li>
                <li>월소득 (숫자만)</li>
                <li>상태 (상담접수, 상담진행, 상담완료, 수임, 불발, 보류)</li>
                <li>메모</li>
              </ul>
            </div>
            <Button 
              onClick={handleDownloadTemplate}
              className="w-full"
              data-testid="button-download-template"
            >
              <i className="fas fa-file-csv mr-2"></i>
              CSV 템플릿 다운로드
            </Button>
          </CardContent>
        </Card>

        {/* 파일 업로드 */}
        <Card data-testid="card-file-upload">
          <CardHeader>
            <CardTitle className="flex items-center">
              <i className="fas fa-upload mr-2 text-green-500"></i>
              대량 업로드
            </CardTitle>
            <CardDescription>
              작성된 CSV 파일을 업로드하여 고객을 대량 등록하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <i className="fas fa-info-circle h-4 w-4"></i>
              <AlertDescription>
                업로드하기 전에 반드시 템플릿을 다운로드하여 형식을 확인하세요.
                파일 크기는 최대 5MB까지 지원합니다.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                data-testid="input-csv-file"
              />
              
              {isUploading && (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  <span className="text-sm text-gray-600">업로드 처리 중...</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 업로드 결과 */}
      {uploadResults && (
        <Card data-testid="card-upload-results">
          <CardHeader>
            <CardTitle className="flex items-center">
              <i className="fas fa-chart-bar mr-2 text-purple-500"></i>
              업로드 결과
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-blue-600" data-testid="text-total-count">
                  {uploadResults.results.total}
                </div>
                <div className="text-sm text-gray-600">총 처리</div>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-green-600" data-testid="text-success-count">
                  {uploadResults.results.success}
                </div>
                <div className="text-sm text-gray-600">성공</div>
              </div>
              <div className="bg-red-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-red-600" data-testid="text-failed-count">
                  {uploadResults.results.failed}
                </div>
                <div className="text-sm text-gray-600">실패</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>성공률</span>
                <span>{successPercentage}%</span>
              </div>
              <Progress value={successPercentage} className="h-2" />
            </div>

            {uploadResults.results.errors.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-900 mb-2">오류 상세:</h4>
                <div className="max-h-40 overflow-y-auto border rounded-md p-3 bg-gray-50">
                  {uploadResults.results.errors.map((error: any, index: number) => (
                    <div key={index} className="text-sm text-red-600 mb-1">
                      <span className="font-medium">행 {error.row}:</span> {error.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadResults.results.success > 0 && (
              <Alert className="border-green-200 bg-green-50">
                <i className="fas fa-check-circle h-4 w-4 text-green-600"></i>
                <AlertDescription className="text-green-800">
                  {uploadResults.results.success}명의 고객이 성공적으로 등록되었습니다.
                  고객관리 페이지에서 확인하실 수 있습니다.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}