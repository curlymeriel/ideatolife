/**
 * Step 0: Market Research with AI Collaboration
 * 
 * Phase 1 of Research & Strategy module
 * - AI-assisted market trend analysis
 * - Split-panel UI: Chat (left) + Results Preview (right)
 * - Function calling for YouTube API integration
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWorkflowStore } from '../store/workflowStore';
import {
    MessageSquare, Send, Loader2,
    BarChart3, Download, ArrowRight, Code, ChevronDown, ChevronUp, CheckCircle2
} from 'lucide-react';

import type { YouTubeTrendVideo, TrendSnapshot, ChannelAnalysis } from '../store/types';
import { fetchTrendingVideos, fetchVideosByCategory, searchVideos, extractTopTopics, searchChannels } from '../services/youtube';
import { TrendChart } from '../components/Trend/TrendChart';
import { TrendVideoCard } from '../components/Trend/TrendVideoCard';

// Chat message type
interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    functionCall?: {
        name: string;
        args: Record<string, any>;
        status: 'pending' | 'executing' | 'completed' | 'error';
        result?: any;
    };
}

// Function declaration for Gemini
interface FunctionDeclaration {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, any>;
        required: string[];
    };
}

// Available functions for AI to call
const AVAILABLE_FUNCTIONS: FunctionDeclaration[] = [
    {
        name: 'fetchTrendingVideos',
        description: '특정 지역의 전체 인기 영상(Mix)을 가져옵니다. Music, Gaming, News, Movies 카테고리의 영상이 혼합됩니다.',
        parameters: {
            type: 'object',
            properties: {
                regionCode: { type: 'string', description: '지역 코드 (KR, JP, US 등)', enum: ['KR', 'JP', 'FR', 'DE', 'ES', 'US', 'Global'] },
                maxResults: { type: 'number', description: '최대 결과 수 (기본 50)' }
            },
            required: ['regionCode']
        }
    },
    {
        name: 'fetchVideosByCategory',
        description: '특정 카테고리의 인기 영상을 가져옵니다.',
        parameters: {
            type: 'object',
            properties: {
                regionCode: { type: 'string', description: '지역 코드', enum: ['KR', 'JP', 'FR', 'DE', 'ES', 'US', 'Global'] },
                categoryId: { type: 'string', description: '카테고리 ID', enum: ['10', '20', '25', '44'] },
                maxResults: { type: 'number', description: '최대 결과 수 (기본 50)' }
            },
            required: ['regionCode', 'categoryId']
        }
    },
    {
        name: 'searchVideos',
        description: '키워드로 영상을 검색합니다.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '검색어' },
                regionCode: { type: 'string', description: '지역 코드', enum: ['KR', 'JP', 'FR', 'DE', 'ES', 'US', 'Global'] },
                maxResults: { type: 'number', description: '최대 결과 수 (기본 25)' }
            },
            required: ['query', 'regionCode']
        }
    },
    {
        name: 'searchChannels',
        description: '키워드로 관련 전문 채널을 검색하고 구독자 수 기반으로 정렬합니다.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '채널 검색어' },
                regionCode: { type: 'string', description: '지역 코드', enum: ['KR', 'JP', 'FR', 'DE', 'ES', 'US', 'Global'] },
                maxResults: { type: 'number', description: '최대 결과 수 (기본 15)' }
            },
            required: ['query', 'regionCode']
        }
    },
    {
        name: 'extractTopTopics',
        description: '영상 목록에서 인기 주제와 해시태그를 추출합니다.',
        parameters: {
            type: 'object',
            properties: {
                videos: { type: 'array', description: '분석할 영상 목록' }
            },
            required: ['videos']
        }
    }
];

export const MarketResearch: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const queryParam = searchParams.get('query');
    const { apiKeys, saveTrendSnapshot, exportResearchData, importResearchData } = useWorkflowStore();
    const geminiApiKey = apiKeys?.gemini || '';
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: `안녕하세요! 👋 AI 시장조사팀장입니다.

**사용 방법:**

**1. 필터 활용 (아래 옵션 설정 후)**
- 🔥 실시간 인기: **"보여줘"**라고 입력
- 🔍 키워드 검색: **"아이폰 리뷰 찾아줘"** 처럼 주제를 포함하여 입력

**2. 직접 요청 (필터 무관)**
- 구체적으로 명령 (예: "일본 게이밍 트렌드 알려줘")`,
            timestamp: new Date()
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Results state
    const [currentVideos, setCurrentVideos] = useState<YouTubeTrendVideo[]>([]);
    const [currentChannels, setCurrentChannels] = useState<ChannelAnalysis[]>([]); // NEW
    const [displayedVideos, setDisplayedVideos] = useState<YouTubeTrendVideo[]>([]);
    const [isExpanded, setIsExpanded] = useState(false); // NEW: Toggle 'Show More'
    const [topicsByType, setTopicsByType] = useState<{ topic: any[]; keyword: any[]; hashtag: any[] }>({
        topic: [], keyword: [], hashtag: []
    });
    const [analysisTab, setAnalysisTab] = useState<'topic' | 'keyword' | 'hashtag' | 'channel'>('topic');
    const [selectedTopic, setSelectedTopic] = useState<any>(null);
    const [apiLogs, setApiLogs] = useState<string[]>([]);
    const [showApiLogs, setShowApiLogs] = useState(false);

    // Search filter states
    const [searchMode, setSearchMode] = useState<'trending' | 'search'>('trending');
    const [searchType, setSearchType] = useState<'video' | 'channel'>('video'); // NEW
    const [searchRegion, setSearchRegion] = useState<'Global' | 'KR' | 'US' | 'JP' | 'FR' | 'DE' | 'ES'>('KR');
    const [trendingCategory, setTrendingCategory] = useState<'mix' | '10' | '20' | '25' | '44'>('mix');
    const [searchPeriod, setSearchPeriod] = useState<'any' | 'month' | '3months' | 'year'>('any');
    const [searchOrder, setSearchOrder] = useState<'relevance' | 'viewCount' | 'date'>('relevance');
    const [searchDuration, setSearchDuration] = useState<'any' | 'short' | 'medium' | 'long'>('any');
    const [executedQuery, setExecutedQuery] = useState(''); // NEW: Persist actual search term
    const initialQueryProcessed = useRef(false);

    // Effect to handle incoming query from URL
    useEffect(() => {
        if (queryParam && !initialQueryProcessed.current && geminiApiKey) {
            initialQueryProcessed.current = true;
            setSearchMode('search');
            // Populate input and trigger send
            setInputValue(`${queryParam} 분석해줘`);

            // To automate, we need to defer execution until state is updated
            setTimeout(() => {
                const sendBtn = document.getElementById('chat-send-button');
                sendBtn?.click();
            }, 500);
        }
    }, [queryParam, geminiApiKey]);

    // NEW: Phase 2 Navigation Handler
    const handleNavigateToPhase2 = () => {
        // Create Snapshot
        const snapshotId = Date.now().toString();
        const snapshot: TrendSnapshot = {
            id: snapshotId,
            createdAt: Date.now(),
            queryContext: searchMode === 'trending'
                ? `${searchRegion} / ${trendingCategory}`
                : `${searchRegion} / Search: ${executedQuery || inputValue || 'Unknown'}`,
            keywords: topicsByType.keyword.slice(0, 5).map(t => t.topic),
            description: selectedTopic
                ? `'${selectedTopic.topic}' 관련 심층 분석 요청`
                : '전체 트렌드 분석 요청',
            trendTopics: topicsByType.topic, // Original analysis
            channels: currentChannels, // NEW: Save channels
            // Use displayedVideos to capture the current filter context (if any specific topic was selected)
            // But we might want to store ALL videos in the snapshot, but mark the 'focus'
            rawData: {
                selectedTopicId: selectedTopic?.id,
                videos: displayedVideos
            }
        };

        // Save to Store
        saveTrendSnapshot(snapshot);

        // Navigate
        navigate(`/research/competitor?snapshotId=${snapshotId}`);
    };


    // Scroll to bottom on new messages
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Execute function call
    const executeFunction = async (name: string, args: Record<string, any>): Promise<any> => {
        const logEntry = `[${new Date().toLocaleTimeString()}] ${name}(${JSON.stringify(args)})`;
        setApiLogs(prev => [...prev, logEntry]);

        switch (name) {
            case 'fetchTrendingVideos':
                return await fetchTrendingVideos(geminiApiKey, args.regionCode, args.maxResults || 50);
            case 'fetchVideosByCategory':
                return await fetchVideosByCategory(geminiApiKey, args.regionCode, args.categoryId, args.maxResults || 50);
            case 'searchVideos':
                // Calculate publishedAfter based on searchPeriod state
                let publishedAfter: string | undefined;
                if (searchPeriod !== 'any') {
                    const date = new Date();
                    if (searchPeriod === 'month') date.setMonth(date.getMonth() - 1);
                    else if (searchPeriod === '3months') date.setMonth(date.getMonth() - 3);
                    else if (searchPeriod === 'year') date.setFullYear(date.getFullYear() - 1);
                    publishedAfter = date.toISOString();
                }

                // Capture the executed query for Phase 2 context
                setExecutedQuery(args.query);

                return await searchVideos(
                    geminiApiKey,
                    args.query,
                    args.regionCode,
                    args.maxResults || 25,
                    publishedAfter,
                    searchOrder,
                    searchDuration
                );
            case 'extractTopTopics':
                return extractTopTopics(args.videos);
            case 'searchChannels':
                // Capture the executed query
                setExecutedQuery(args.query);
                return await searchChannels(
                    geminiApiKey,
                    args.query,
                    args.regionCode,
                    args.maxResults || 15
                );
            default:
                throw new Error(`Unknown function: ${name}`);
        }
    };

    // Process user message with Gemini
    const handleSendMessage = async () => {
        if (!inputValue.trim() || isProcessing) return;
        if (!geminiApiKey) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                content: '⚠️ Gemini API 키가 필요합니다. 설정에서 입력해주세요.',
                timestamp: new Date()
            }]);
            return;
        }

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsProcessing(true);

        try {
            // Build conversation history for context
            const conversationHistory = messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

            // Build system prompt with function declarations
            const systemPrompt = `당신은 YouTube 시장 조사 전문가입니다. 사용자의 요청에 따라 YouTube 데이터를 분석합니다.

현재 사용자가 UI에서 선택한 필터 설정은 다음과 같습니다:
- 조사 모드: ${searchMode === 'trending' ? '실시간 인기 트렌드 (Trending)' : '키워드 검색 (Search)'}
- 대상 국가: ${searchRegion}
${searchMode === 'trending' ? `- 선택된 카테고리: ${trendingCategory} (mix=전체, 10=Music, 20=Gaming, 25=News, 44=Movies)` : ''}
${searchMode === 'search' ? `- 기간: ${searchPeriod}` : ''}
${searchMode === 'search' ? `- 정렬: ${searchOrder}` : ''}
${searchMode === 'search' ? `- 길이: ${searchDuration}` : ''}

중요 지침:
1. 사용자가 "보여줘", "분석해줘", "시작해" 등 구체적인 조건(국가, 카테고리 등) 없이 요청하면, 무조건 위 **[현재 필터 설정]** 값을 사용하여 함수를 호출하세요.
   - 예: "보여줘" (현재설정: KR, Gaming) -> fetchVideosByCategory(regionCode='KR', categoryId='20') 호출
   - 예: "보여줘" (현재설정: JP, Mix) -> fetchTrendingVideos(regionCode='JP') 호출
2. 사용자가 명시적으로 조건을 변경하여 요청한 경우에만(예: "미국 거 보여줘") 그 조건을 우선시하세요.
3. 검색 모드(search)에서 검색어 없이 "보여줘"라고 하면 "검색어를 입력해주세요"라고 안내하세요.
4. **스마트 키워드 확장**: 사용자가 입력한 검색어가 대상 국가의 언어와 다를 경우, 더 정확한 결과를 위해 해당 언어로 번역하거나 관련 현지 키워드를 포함하여 검색하세요. (예: KR 대상 "K-Drama" -> "한국 드라마" OR "K-Drama")

사용 가능한 함수:
${AVAILABLE_FUNCTIONS.map(f => `- ${f.name}: ${f.description}`).join('\n')}

카테고리 ID 참조:
- 10: Music (음악)
- 20: Gaming (게임)
- 25: News (뉴스)
- 44: Movies/Trailers (영화)

지역 코드 참조:
- KR: 한국
- JP: 일본
- US: 미국
- Global: 전세계

사용자 요청을 분석하고, 적절한 함수를 호출하세요.
함수를 호출하려면 다음 형식으로 응답하세요:
[FUNCTION_CALL: functionName({"param": "value"})]

예시:
- "한국 게이밍 인기 영상 가져와" → [FUNCTION_CALL: fetchVideosByCategory({"regionCode": "KR", "categoryId": "20"})]
- "먹방 검색해줘" → [FUNCTION_CALL: searchVideos({"query": "먹방", "regionCode": "KR"})]
- "보여줘" (만약 현재 설정이 JP, Music이라면) → [FUNCTION_CALL: fetchVideosByCategory({"regionCode": "JP", "categoryId": "10"})]`;

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [
                            { role: 'user', parts: [{ text: systemPrompt }] },
                            ...conversationHistory,
                            { role: 'user', parts: [{ text: inputValue }] }
                        ],
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 2048
                        }
                    })
                }
            );

            if (!response.ok) {
                throw new Error('Gemini API 호출 실패');
            }

            const data = await response.json();
            const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // Check for function call in response
            const functionCallMatch = aiResponse.match(/\[FUNCTION_CALL:\s*(\w+)\(({[^}]+})\)\]/);

            if (functionCallMatch) {
                const functionName = functionCallMatch[1];
                const functionArgs = JSON.parse(functionCallMatch[2]);

                // Add AI message with function call info
                const aiMessage: ChatMessage = {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: `${functionName} 함수를 호출합니다...`,
                    timestamp: new Date(),
                    functionCall: {
                        name: functionName,
                        args: functionArgs,
                        status: 'executing'
                    }
                };
                setMessages(prev => [...prev, aiMessage]);

                // Execute the function
                try {
                    const result = await executeFunction(functionName, functionArgs);

                    // Update results panel
                    if (Array.isArray(result) && result.length > 0) {
                        if (result[0].id && result[0].title) {
                            // Videos - extract all 3 types
                            setCurrentVideos(result);
                            setDisplayedVideos(result);
                            setTopicsByType({
                                topic: extractTopTopics(result, 'topic'),
                                keyword: extractTopTopics(result, 'keyword'),
                                hashtag: extractTopTopics(result, 'hashtag')
                            });
                            setSelectedTopic(null);
                            setAnalysisTab('topic'); // Default to topic tab
                        } else if (result[0].channelId && result[0].subscriberCount !== undefined) {
                            // Channels
                            setCurrentChannels(result);
                            setAnalysisTab('channel'); // Switch to channel tab
                        }
                    }

                    // Update message with success
                    setMessages(prev => prev.map(m =>
                        m.id === aiMessage.id
                            ? {
                                ...m,
                                content: `✅ ${functionName} 완료!\n\n${result.length}개 결과를 가져왔습니다. 오른쪽 패널에서 확인하세요.\n\n추가로 분석하거나 다른 데이터를 가져올까요?`,
                                functionCall: { ...m.functionCall!, status: 'completed', result }
                            }
                            : m
                    ));
                } catch (error: any) {
                    setMessages(prev => prev.map(m =>
                        m.id === aiMessage.id
                            ? {
                                ...m,
                                content: `❌ 오류 발생: ${error.message}`,
                                functionCall: { ...m.functionCall!, status: 'error' }
                            }
                            : m
                    ));
                }
            } else {
                // Regular text response
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: aiResponse.replace(/\[FUNCTION_CALL:[^\]]+\]/g, '').trim() || '요청을 이해하지 못했습니다. 다시 말씀해주세요.',
                    timestamp: new Date()
                }]);
            }
        } catch (error: any) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                content: `⚠️ 오류: ${error.message}`,
                timestamp: new Date()
            }]);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="h-[calc(100vh-120px)] flex gap-4">
            {/* Left Panel: AI Chat */}
            <div className="w-[40%] flex flex-col bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
                {/* Header */}
                <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <MessageSquare className="text-[var(--color-primary)]" size={20} />
                            AI 시장조사팀장
                            <span className="ml-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/10 text-[10px] text-green-500 border border-green-500/20 font-medium">
                                <CheckCircle2 size={10} /> Auto-saved to Browser
                            </span>
                        </h2>
                        <p className="text-xs text-gray-400 mt-1">AI와 대화하며 YouTube 트렌드를 분석하세요</p>
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept=".json"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                        if (ev.target?.result) {
                                            importResearchData(ev.target.result as string);
                                        }
                                    };
                                    reader.readAsText(file);
                                }
                            }}
                        />
                        <button
                            onClick={() => exportResearchData()}
                            className="p-1.5 text-gray-400 hover:text-[var(--color-primary)] hover:bg-white/5 rounded-lg transition-colors"
                            title="리서치 데이터 백업 (JSON)"
                        >
                            <Download size={16} />
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-white/5 rounded-lg transition-colors"
                            title="리서치 데이터 복구"
                        >
                            <ArrowRight className="rotate-90" size={16} /> {/* Import Icon substitute */}
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] p-3 rounded-lg text-sm ${msg.role === 'user'
                                ? 'bg-[var(--color-primary)] text-black'
                                : msg.role === 'system'
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    : 'bg-white/5 text-gray-200'
                                }`}>
                                <div className="whitespace-pre-wrap">{msg.content}</div>
                                {msg.functionCall && (
                                    <div className="mt-2 p-2 bg-black/20 rounded text-xs font-mono">
                                        <div className="flex items-center gap-1 text-[var(--color-primary)]">
                                            <Code size={12} />
                                            {msg.functionCall.name}
                                            {msg.functionCall.status === 'executing' && (
                                                <Loader2 className="animate-spin ml-2" size={12} />
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isProcessing && (
                        <div className="flex justify-start">
                            <div className="bg-white/5 p-3 rounded-lg">
                                <Loader2 className="animate-spin text-[var(--color-primary)]" size={20} />
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div className="p-4 border-t border-[var(--color-border)]">
                    {/* Mode Selector */}
                    <div className="mb-4">
                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block mb-2">조사 방식 선택:</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSearchMode('trending')}
                                className={`flex-1 p-3 rounded-lg border-2 transition-all text-left ${searchMode === 'trending'
                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                                    : 'border-white/10 hover:border-white/30'}`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-lg">🔥</span>
                                    <span className={`font-bold ${searchMode === 'trending' ? 'text-[var(--color-primary)]' : 'text-white'}`}>실시간 인기</span>
                                </div>
                                <p className="text-[10px] text-gray-300">유튜브가 선정한 현재<span className="text-gray-400"> (추정 24~72시간 집계)</span> 가장 핫한 영상</p>
                            </button>
                            <button
                                onClick={() => setSearchMode('search')}
                                className={`flex-1 p-3 rounded-lg border-2 transition-all text-left ${searchMode === 'search'
                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                                    : 'border-white/10 hover:border-white/30'}`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-lg">🔍</span>
                                    <span className={`font-bold ${searchMode === 'search' ? 'text-[var(--color-primary)]' : 'text-white'}`}>키워드 검색</span>
                                </div>
                                <p className="text-[10px] text-gray-300">특정 주제로 검색. 모든 필터 적용 가능.</p>
                            </button>
                        </div>

                        {/* Search Type Selector (Visible only in Search Mode) */}
                        {searchMode === 'search' && (
                            <div className="mt-2 bg-white/5 p-2 rounded-lg flex items-center gap-3">
                                <span className="text-[10px] text-gray-400 font-bold ml-1">검색 대상:</span>
                                <div className="flex gap-1 flex-1">
                                    <button
                                        onClick={() => setSearchType('video')}
                                        className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-all ${searchType === 'video'
                                            ? 'bg-[var(--color-primary)] text-black'
                                            : 'bg-black/20 text-gray-400 hover:text-white'}`}
                                    >
                                        🎬 동영상
                                    </button>
                                    <button
                                        onClick={() => setSearchType('channel')}
                                        className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-all ${searchType === 'channel'
                                            ? 'bg-[var(--color-primary)] text-black'
                                            : 'bg-black/20 text-gray-400 hover:text-white'}`}
                                    >
                                        📺 전문 채널
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Filter Section */}
                    <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
                        <div className="text-[11px] text-gray-300 font-bold mb-3 flex items-center gap-2">
                            <span className="text-[var(--color-primary)]">📋</span>
                            [조사대상필터]
                            <span className="text-[9px] font-normal text-gray-400">
                                {searchMode === 'trending'
                                    ? '실시간 인기 모드: 국가와 카테고리만 적용됩니다.'
                                    : '키워드 검색 모드: 모든 필터가 적용됩니다.'}
                            </span>
                        </div>

                        <div className="space-y-2">
                            {/* 국가 */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-300 font-bold w-16">• 국가:</span>
                                <div className="flex bg-black/20 rounded-md p-0.5 flex-wrap gap-0.5">
                                    {[
                                        { id: 'Global', label: '전세계' },
                                        { id: 'KR', label: '한국' },
                                        { id: 'US', label: '미국' },
                                        { id: 'JP', label: '일본' },
                                        { id: 'FR', label: '프랑스' },
                                        { id: 'DE', label: '독일' },
                                        { id: 'ES', label: '스페인' }
                                    ].map((r) => (
                                        <button
                                            key={r.id}
                                            onClick={() => setSearchRegion(r.id as any)}
                                            className={`px-2 py-1 text-[10px] rounded transition-all ${searchRegion === r.id
                                                ? 'bg-[var(--color-primary)] text-black font-bold'
                                                : 'text-gray-300 hover:text-white'}`}
                                        >
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Trending Mode: 카테고리 */}
                            {searchMode === 'trending' && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-gray-300 font-bold w-16">• 카테고리:</span>
                                    <div className="flex bg-black/20 rounded-md p-0.5">
                                        {[
                                            { id: 'mix', label: '전체 Mix' },
                                            { id: '10', label: '🎵 Music' },
                                            { id: '20', label: '🎮 Gaming' },
                                            { id: '25', label: '📰 News' },
                                            { id: '44', label: '🎬 Movies' }
                                        ].map((c) => (
                                            <button
                                                key={c.id}
                                                onClick={() => setTrendingCategory(c.id as any)}
                                                className={`px-2 py-1 text-[10px] rounded transition-all ${trendingCategory === c.id
                                                    ? 'bg-[var(--color-primary)] text-black font-bold'
                                                    : 'text-gray-300 hover:text-white'}`}
                                            >
                                                {c.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Search Mode filters */}
                            {searchMode === 'search' && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-gray-300 font-bold w-16">• 업로드시점:</span>
                                        <div className="flex bg-black/20 rounded-md p-0.5">
                                            {[
                                                { id: 'any', label: '전체' },
                                                { id: 'month', label: '최근 1개월' },
                                                { id: '3months', label: '최근 3개월' },
                                                { id: 'year', label: '최근 1년' }
                                            ].map((p) => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => setSearchPeriod(p.id as any)}
                                                    className={`px-2 py-1 text-[10px] rounded transition-all ${searchPeriod === p.id
                                                        ? 'bg-[var(--color-primary)] text-black font-bold'
                                                        : 'text-gray-300 hover:text-white'}`}
                                                >
                                                    {p.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-gray-300 font-bold w-16">• 선별기준:</span>
                                        <div className="flex bg-black/20 rounded-md p-0.5">
                                            {[
                                                { id: 'relevance', label: '알고리즘 추천' },
                                                { id: 'viewCount', label: '누적 인기순' },
                                                { id: 'date', label: '최신 업로드' }
                                            ].map((o) => (
                                                <button
                                                    key={o.id}
                                                    onClick={() => setSearchOrder(o.id as any)}
                                                    className={`px-2 py-1 text-[10px] rounded transition-all ${searchOrder === o.id
                                                        ? 'bg-[var(--color-primary)] text-black font-bold'
                                                        : 'text-gray-300 hover:text-white'}`}
                                                >
                                                    {o.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-gray-300 font-bold w-16">• 영상길이:</span>
                                        <div className="flex bg-black/20 rounded-md p-0.5">
                                            {[
                                                { id: 'any', label: '전체' },
                                                { id: 'short', label: 'Shorts (4분↓)' },
                                                { id: 'medium', label: '중간 (4~20분)' },
                                                { id: 'long', label: '장편 (20분↑)' }
                                            ].map((d) => (
                                                <button
                                                    key={d.id}
                                                    onClick={() => setSearchDuration(d.id as any)}
                                                    className={`px-2 py-1 text-[10px] rounded transition-all ${searchDuration === d.id
                                                        ? 'bg-[var(--color-primary)] text-black font-bold'
                                                        : 'text-gray-300 hover:text-white'}`}
                                                >
                                                    {d.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                            placeholder={searchMode === 'trending'
                                ? '"분석 시작해줘" 또는 "보여줘"라고 입력하세요'
                                : '검색할 키워드를 입력하세요 (예: 한국 드라마, 아이폰 리뷰)'}
                            className="flex-1 bg-white/5 border border-[var(--color-border)] rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)]"
                            disabled={isProcessing}
                        />
                        <button
                            id="chat-send-button"
                            onClick={handleSendMessage}
                            disabled={isProcessing || !inputValue.trim()}
                            className="px-4 py-2 bg-[var(--color-primary)] text-black rounded-lg font-medium hover:bg-[var(--color-primary)]/90 disabled:opacity-50"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Panel: Results Preview */}
            <div className="w-[60%] flex flex-col bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
                {/* Header */}
                <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <BarChart3 className="text-[var(--color-primary)]" size={20} />
                            분석 결과
                        </h2>
                        <p className="text-xs text-gray-400 mt-1">
                            영상 {currentVideos.length}개 | 주제 {topicsByType.topic.length}개
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowApiLogs(!showApiLogs)}
                            className="px-3 py-1.5 text-xs bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 flex items-center gap-1"
                        >
                            <Code size={14} />
                            API 로그
                            {showApiLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <button className="px-3 py-1.5 text-xs bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 flex items-center gap-1">
                            <Download size={14} />
                            다운로드
                        </button>
                    </div>
                </div>

                {/* API Logs (collapsible) */}
                {showApiLogs && apiLogs.length > 0 && (
                    <div className="p-3 bg-black/30 border-b border-[var(--color-border)] max-h-32 overflow-y-auto">
                        <p className="text-xs text-gray-500 mb-2">API 호출 로그:</p>
                        {apiLogs.map((log, i) => (
                            <p key={i} className="text-xs font-mono text-green-400/70">{log}</p>
                        ))}
                    </div>
                )}

                {/* Results Content */}
                {/* Results Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {currentVideos.length === 0 && currentChannels.length === 0 && topicsByType.topic.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-500">
                            <div className="text-center">
                                <BarChart3 size={48} className="mx-auto mb-3 opacity-30" />
                                <p>AI와 대화하여 데이터를 가져오세요</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Analysis Tabs */}
                            <div>
                                {/* Tab Buttons */}
                                <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                                    {(topicsByType.topic.length > 0) && (
                                        <button
                                            onClick={() => { setAnalysisTab('topic'); setSelectedTopic(null); setDisplayedVideos(currentVideos); }}
                                            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all whitespace-nowrap ${analysisTab === 'topic'
                                                ? 'bg-[var(--color-primary)] text-black'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                                }`}
                                        >
                                            📂 주제 ({topicsByType.topic.length})
                                        </button>
                                    )}
                                    {(currentChannels.length > 0) && (
                                        <button
                                            onClick={() => { setAnalysisTab('channel'); setSelectedTopic(null); }}
                                            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all whitespace-nowrap ${analysisTab === 'channel'
                                                ? 'bg-[var(--color-primary)] text-black'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                                }`}
                                        >
                                            📺 채널 ({currentChannels.length})
                                        </button>
                                    )}
                                    {topicsByType.keyword.length > 0 && (
                                        <button
                                            onClick={() => { setAnalysisTab('keyword'); setSelectedTopic(null); setDisplayedVideos(currentVideos); }}
                                            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all whitespace-nowrap ${analysisTab === 'keyword'
                                                ? 'bg-[var(--color-primary)] text-black'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                                }`}
                                        >
                                            🔑 키워드 ({topicsByType.keyword.length})
                                        </button>
                                    )}
                                    {topicsByType.hashtag.length > 0 && (
                                        <button
                                            onClick={() => { setAnalysisTab('hashtag'); setSelectedTopic(null); setDisplayedVideos(currentVideos); }}
                                            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all whitespace-nowrap ${analysisTab === 'hashtag'
                                                ? 'bg-[var(--color-primary)] text-black'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                                }`}
                                        >
                                            # 해시태그 ({topicsByType.hashtag.length})
                                        </button>
                                    )}
                                </div>

                                {/* Chart (Hide for Channel Tab) */}
                                {analysisTab !== 'channel' && topicsByType[analysisTab] && (
                                    <>
                                        <TrendChart
                                            topics={topicsByType[analysisTab]}
                                            selectedTopicId={selectedTopic?.id}
                                            onTopicClick={(topic) => {
                                                setSelectedTopic(topic);
                                                if (topic.relatedVideos && topic.relatedVideos.length > 0) {
                                                    setDisplayedVideos(topic.relatedVideos);
                                                } else {
                                                    setDisplayedVideos(currentVideos);
                                                }
                                            }}
                                        />
                                        {selectedTopic && (
                                            <button
                                                onClick={() => {
                                                    setSelectedTopic(null);
                                                    setDisplayedVideos(currentVideos);
                                                }}
                                                className="mt-2 text-xs text-[var(--color-primary)] hover:underline"
                                            >
                                                ✕ 필터 해제 (전체 보기)
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Content Grid */}
                            {analysisTab === 'channel' ? (
                                <div>
                                    <h3 className="text-md font-bold text-white mb-3 flex items-center gap-2">
                                        📢 전문 채널 목록
                                        <span className="text-xs font-normal text-gray-500 ml-2">구독자 순 정렬</span>
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {currentChannels.map((channel) => (
                                            <div key={channel.channelId} className="bg-white/5 p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <img src={channel.channelThumbnail} alt={channel.channelName} className="w-12 h-12 rounded-full object-cover border border-white/10" />
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-bold text-white text-sm truncate">{channel.channelName}</h4>
                                                        <p className="text-xs text-gray-400">구독자 {channel.subscriberCount.toLocaleString()}명</p>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-center mb-3">
                                                    <div className="bg-black/20 p-2 rounded-lg">
                                                        <span className="block text-[10px] text-gray-500">총 조회수</span>
                                                        <span className="text-xs font-bold text-gray-300">{channel.viewCount > 10000 ? `${(channel.viewCount / 10000).toFixed(1)}만` : channel.viewCount.toLocaleString()}</span>
                                                    </div>
                                                    <div className="bg-black/20 p-2 rounded-lg">
                                                        <span className="block text-[10px] text-gray-500">동영상</span>
                                                        <span className="text-xs font-bold text-gray-300">{channel.videoCount}개</span>
                                                    </div>
                                                </div>
                                                {channel.keywords && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {channel.keywords.split(' ').slice(0, 3).map((k: string, i: number) => (
                                                            <span key={i} className="text-[10px] text-gray-400 bg-white/5 px-1.5 py-0.5 rounded">
                                                                {k.replace(/"/g, '')}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                /* Video Grid */
                                displayedVideos.length > 0 && (
                                    <div>
                                        <h3 className="text-md font-bold text-white mb-3 flex items-center gap-2">
                                            🎬 영상 목록
                                            {selectedTopic && (
                                                <span className="text-sm font-normal text-[var(--color-primary)]">
                                                    - {selectedTopic.topic}
                                                </span>
                                            )}
                                        </h3>
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                            {(isExpanded ? displayedVideos : displayedVideos.slice(0, 12)).map((video, i) => (
                                                <TrendVideoCard key={video.id} video={video} rank={i + 1} />
                                            ))}
                                        </div>
                                        {displayedVideos.length > 12 && (
                                            <button
                                                onClick={() => setIsExpanded(!isExpanded)}
                                                className="w-full mt-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center justify-center gap-1"
                                            >
                                                {isExpanded ? (
                                                    <>접기 <ChevronUp size={14} /></>
                                                ) : (
                                                    <>+ {displayedVideos.length - 12}개 더 보기 <ChevronDown size={14} /></>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                )
                            )}
                        </div>
                    )}
                </div>

                {/* Footer: Next Step */}
                {currentVideos.length > 0 && (
                    <div className="p-4 border-t border-[var(--color-border)]">
                        <button
                            onClick={handleNavigateToPhase2}
                            className="w-full px-4 py-3 bg-[var(--color-primary)] text-black font-bold rounded-lg hover:bg-[var(--color-primary)]/90 flex items-center justify-center gap-2 transition-colors"
                        >
                            <ArrowRight size={18} />
                            {selectedTopic
                                ? `'${selectedTopic.topic}' 심층 벤치마킹 분석 (Phase 2)`
                                : '조회된 결과로 벤치마킹 분석 (Phase 2)'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MarketResearch;
