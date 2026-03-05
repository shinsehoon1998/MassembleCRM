import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

const NOTION_PAGE_URL = 'https://spiky-estimate-e01.notion.site/MassembleCRM-2854d5b8a2968028becbcca4071d3a81';

interface NotionBlock {
  id: string;
  type: string;
  [key: string]: any;
}

interface NotionPageData {
  page: any;
  blocks: NotionBlock[];
}

function renderNotionBlock(block: NotionBlock, allBlocks: NotionBlock[]): JSX.Element | null {
  const blockType = block.type;
  
  try {
    switch (blockType) {
      case 'heading_1':
        const h1Text = block.heading_1?.rich_text?.[0]?.plain_text || '';
        return <h1 key={block.id} id={`heading-${block.id}`} className="text-3xl font-bold mt-8 mb-4">{h1Text}</h1>;
      
      case 'heading_2':
        const h2Text = block.heading_2?.rich_text?.[0]?.plain_text || '';
        return <h2 key={block.id} id={`heading-${block.id}`} className="text-2xl font-semibold mt-6 mb-3">{h2Text}</h2>;
      
      case 'heading_3':
        const h3Text = block.heading_3?.rich_text?.[0]?.plain_text || '';
        return <h3 key={block.id} id={`heading-${block.id}`} className="text-xl font-semibold mt-4 mb-2">{h3Text}</h3>;
      
      case 'paragraph':
        const pText = block.paragraph?.rich_text?.[0]?.plain_text || '';
        if (!pText) return null;
        return <p key={block.id} className="mb-4 text-gray-700 leading-relaxed">{pText}</p>;
      
      case 'bulleted_list_item':
        const bulletText = block.bulleted_list_item?.rich_text?.[0]?.plain_text || '';
        return (
          <li key={block.id} className="ml-6 mb-2 text-gray-700 list-disc">
            {bulletText}
          </li>
        );
      
      case 'numbered_list_item':
        const numberText = block.numbered_list_item?.rich_text?.[0]?.plain_text || '';
        return (
          <li key={block.id} className="ml-6 mb-2 text-gray-700 list-decimal">
            {numberText}
          </li>
        );
      
      case 'divider':
        return <hr key={block.id} className="my-6 border-gray-300" />;
      
      case 'quote':
        const quoteText = block.quote?.rich_text?.[0]?.plain_text || '';
        return (
          <blockquote key={block.id} className="border-l-4 border-gray-300 pl-4 my-4 italic text-gray-600">
            {quoteText}
          </blockquote>
        );
      
      case 'code':
        const codeText = block.code?.rich_text?.[0]?.plain_text || '';
        return (
          <pre key={block.id} className="bg-gray-100 p-4 rounded-md my-4 overflow-x-auto">
            <code className="text-sm">{codeText}</code>
          </pre>
        );
      
      case 'callout':
        const calloutText = block.callout?.rich_text?.[0]?.plain_text || '';
        const icon = block.callout?.icon?.emoji || '💡';
        return (
          <div key={block.id} className="bg-blue-50 border-l-4 border-blue-500 p-4 my-4 rounded-r-md">
            <span className="mr-2">{icon}</span>
            <span className="text-gray-700">{calloutText}</span>
          </div>
        );
      
      case 'image':
        const imageUrl = block.image?.file?.url || block.image?.external?.url;
        const caption = block.image?.caption?.[0]?.plain_text || '';
        if (!imageUrl) return null;
        return (
          <figure key={block.id} className="my-6">
            <img 
              src={imageUrl} 
              alt={caption || '이미지'} 
              className="w-full rounded-lg shadow-md"
              loading="lazy"
            />
            {caption && (
              <figcaption className="text-center text-sm text-gray-500 mt-2">
                {caption}
              </figcaption>
            )}
          </figure>
        );
      
      case 'table_of_contents':
        const headings = allBlocks.filter(b => 
          b.type === 'heading_1' || b.type === 'heading_2' || b.type === 'heading_3'
        );
        
        if (headings.length === 0) return null;
        
        return (
          <nav key={block.id} className="my-6 p-6 bg-gray-50 rounded-lg border border-gray-200">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">📑 목차</h2>
            <ul className="space-y-2">
              {headings.map(heading => {
                const text = heading[heading.type]?.rich_text?.[0]?.plain_text || '';
                const level = heading.type === 'heading_1' ? 0 : heading.type === 'heading_2' ? 1 : 2;
                const paddingClass = level === 0 ? '' : level === 1 ? 'ml-4' : 'ml-8';
                
                return (
                  <li key={heading.id} className={paddingClass}>
                    <a 
                      href={`#heading-${heading.id}`} 
                      className="text-keystart-blue hover:underline"
                    >
                      {text}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        );
      
      case 'toggle':
        const toggleText = block.toggle?.rich_text?.[0]?.plain_text || '';
        return (
          <details key={block.id} className="my-4 bg-gray-50 rounded-lg p-4">
            <summary className="cursor-pointer font-medium text-gray-900 hover:text-keystart-blue">
              {toggleText}
            </summary>
            <div className="mt-2 text-gray-700">
              {block.toggle?.children?.map((child: NotionBlock) => renderNotionBlock(child, allBlocks))}
            </div>
          </details>
        );
      
      default:
        return null;
    }
  } catch (error) {
    console.error('Error rendering block:', block, error);
    return null;
  }
}

export default function ManualPage() {
  const { data, isLoading, error } = useQuery<{ success: boolean; data: NotionPageData }>({
    queryKey: ['/api/notion/page', NOTION_PAGE_URL],
    queryFn: async () => {
      const response = await fetch(`/api/notion/page?url=${encodeURIComponent(NOTION_PAGE_URL)}`);
      
      // 응답 타입이 JSON인지 확인
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Received non-JSON response:', text.substring(0, 200));
        throw new Error('서버 응답이 올바른 형식이 아닙니다.');
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '노션 페이지를 불러오는데 실패했습니다.');
      }
      
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-keystart-blue" />
          <p className="text-gray-600">CRM 사용설명서를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="p-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-red-600 mb-2">오류가 발생했습니다</h2>
            <p className="text-gray-600">
              {error instanceof Error ? error.message : '노션 페이지를 불러올 수 없습니다.'}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const pageTitle = data?.data?.page?.properties?.title?.title?.[0]?.plain_text || '키스타트 DB 관리 마법사 사용설명서';
  const blocks = data?.data?.blocks || [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl" data-testid="page-manual">
      <Card className="p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2" data-testid="text-manual-title">
            {pageTitle}
          </h1>
          <p className="text-gray-500 text-sm">노션에서 불러온 최신 내용</p>
        </div>

        <div className="prose max-w-none">
          {blocks.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              사용설명서 내용이 없습니다. 노션 페이지에 내용을 추가해주세요.
            </p>
          ) : (
            blocks.map(block => renderNotionBlock(block, blocks))
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <a
            href={NOTION_PAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-keystart-blue hover:underline inline-flex items-center"
            data-testid="link-notion-page"
          >
            <span>노션에서 원본 보기</span>
            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </Card>
    </div>
  );
}
