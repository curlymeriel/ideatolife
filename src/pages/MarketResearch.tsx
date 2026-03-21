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
    BarChart3, Download, ArrowRight, Code, ChevronDown, ChevronUp, CheckCircle2,
    Flame, Search, Youtube, MonitorPlay, Globe, ListFilter, Calendar, Clock, ArrowUpDown, Tag,
    Music, Gamepad2, Newspaper, Film
} from 'lucide-react';

import type { YouTubeTrendVideo, TrendSnapshot, ChannelAnalysis } from '../store/types';
import { fetchTrendingVideos, fetchVideosByCategory, searchVideos, extractAllAnalytics, searchChannels } from '../services/youtube';
import { TrendChart } from '../components/Trend/TrendChart';
import { TrendVideoCard } from '../components/Trend/TrendVideoCard';
import { generateText } from '../services/gemini';

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

// Available functions for AI to call (FunctionDeclaration interface removed as it was unused after prompt simplification)

// Available functions list (simplified for prompt)
const FUNCTION_DEFINITIONS = [
    'fetchTrendingVideos(regionCode, maxResults)',
    'fetchVideosByCategory(regionCode, categoryId, maxResults)',
    'searchVideos(query, regionCode, maxResults)',
    'searchChannels(query, regionCode, maxResults)',
    'extractAllAnalytics(videos)'
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
            content: `안녕하세요! 👋 AI 리서치팀장입니다.

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
            case 'extractAllAnalytics':
                return extractAllAnalytics(args.videos);
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

            const startTime = performance.now();
            console.log(`[Performance] Starting AI Intent Detection...`);

            // Build system prompt with function declarations
            const systemPrompt = `당신은 YouTube 시장 조사 전문가입니다. 
현재 필터: 모드=${searchMode}, 국가=${searchRegion}, 카테고리=${trendingCategory}, 기간=${searchPeriod}, 정렬=${searchOrder}.

지침:
1. "보여줘", "분석해줘" 등 조건 없는 요청엔 위 필터값으로 함수 호출.
2. 조건 명시 때만 해당 값 반영.
3. 검색 모드에서 검색어 없으면 안내.
4. 검색 시 현지어 키워드 병행 사용 (예: "아이폰" -> "아이폰" OR "iPhone").

함수:
${FUNCTION_DEFINITIONS.map(f => `- ${f}`).join('\n')}

카테고리: 10(음악), 20(게임), 25(뉴스), 44(영화).

응답 형식: [FUNCTION_CALL: functionName({"param": "value"})]`;

            const aiResponse = await generateText(
                inputValue,
                geminiApiKey,
                undefined, // responseMimeType
                undefined, // images
                systemPrompt,
                { 
                    temperature: 0.7, 
                    maxOutputTokens: 2048,
                    preferredModel: 'Gemini 2.5 Flash' // [PERFORMANCE] Use faster model for intent detection
                },
                conversationHistory
            );

            const intentTime = performance.now();
            console.log(`[Performance] AI Intent Detection took ${((intentTime - startTime) / 1000).toFixed(2)}s`);

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
                    const funcStartTime = performance.now();
                    const result = await executeFunction(functionName, functionArgs);
                    const funcEndTime = performance.now();
                    console.log(`[Performance] Function execution (${functionName}) took ${((funcEndTime - funcStartTime) / 1000).toFixed(2)}s`);

                    // Update results panel
                    if (Array.isArray(result) && result.length > 0) {
                        if (result[0].id && result[0].title) {
                            // Videos - extract all types in one go
                            setCurrentVideos(result);
                            setDisplayedVideos(result);
                            const analytics = extractAllAnalytics(result);
                            setTopicsByType({
                                topic: analytics.categories,
                                keyword: analytics.keywords,
                                hashtag: analytics.hashtags
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
                            AI 리서치팀장
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
                    {/* Mode Selector */}
                    <div className="mb-4">
                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block mb-2">조사 방식 선택:</span>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setSearchMode('trending')}
                                className={`flex flex-col items-start p-4 rounded-xl border transition-all ${searchMode === 'trending'
                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                                    : 'border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20'}`}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <div className={`p-2 rounded-lg ${searchMode === 'trending' ? 'bg-[var(--color-primary)] text-black' : 'bg-black/40 text-gray-400'}`}>
                                        <Flame size={20} className={searchMode === 'trending' ? 'animate-pulse' : ''} />
                                    </div>
                                    <span className={`font-bold text-lg ${searchMode === 'trending' ? 'text-white' : 'text-gray-400'}`}>실시간 인기</span>
                                </div>
                                <p className="text-xs text-gray-400 text-left">
                                    유튜브가 선정한 현재 <span className={`${searchMode === 'trending' ? 'text-[var(--color-primary)]' : 'text-gray-500'}`}>가장 핫한 영상</span>
                                </p>
                            </button>

                            <button
                                onClick={() => setSearchMode('search')}
                                className={`flex flex-col items-start p-4 rounded-xl border transition-all ${searchMode === 'search'
                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                                    : 'border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20'}`}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <div className={`p-2 rounded-lg ${searchMode === 'search' ? 'bg-[var(--color-primary)] text-black' : 'bg-black/40 text-gray-400'}`}>
                                        <Search size={20} />
                                    </div>
                                    <span className={`font-bold text-lg ${searchMode === 'search' ? 'text-white' : 'text-gray-400'}`}>키워드 검색</span>
                                </div>
                                <p className="text-xs text-gray-400 text-left">
                                    관심 있는 주제로 <span className={`${searchMode === 'search' ? 'text-[var(--color-primary)]' : 'text-gray-500'}`}>정밀 탐색</span>
                                </p>
                            </button>
                        </div>

                        {/* Search Type Selector (Visible only in Search Mode) */}
                        {searchMode === 'search' && (
                            <div className="mt-3 bg-black/20 p-1 rounded-lg flex items-center gap-1 border border-white/5">
                                <button
                                    onClick={() => setSearchType('video')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${searchType === 'video'
                                        ? 'bg-[var(--color-primary)] text-black'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                >
                                    <Youtube size={14} />
                                    동영상
                                </button>
                                <button
                                    onClick={() => setSearchType('channel')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${searchType === 'channel'
                                        ? 'bg-[var(--color-primary)] text-black'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                >
                                    <MonitorPlay size={14} />
                                    전문 채널 검색
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Filter Section */}
                    <div className="mb-4 p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                        <div className="text-xs text-gray-400 font-bold mb-4 flex items-center gap-2 uppercase tracking-wider">
                            <ListFilter size={14} className="text-[var(--color-primary)]" />
                            Target Filters
                        </div>

                        <div className="space-y-4">
                            {/* 국가 */}
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 w-20 min-w-20 text-gray-400">
                                    <Globe size={14} />
                                    <span className="text-xs font-medium">국가</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
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
                                            className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${searchRegion === r.id
                                                ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/50 text-[var(--color-primary)] font-bold'
                                                : 'bg-black/20 border-white/5 text-gray-400 hover:border-white/20 hover:text-gray-200'}`}
                                        >
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Trending Mode: 카테고리 */}
                            {searchMode === 'trending' && (
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 w-20 min-w-20 text-gray-400">
                                        <Tag size={14} />
                                        <span className="text-xs font-medium">카테고리</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {[
                                            { id: 'mix', label: 'Mix', icon: <ListFilter size={12} /> },
                                            { id: '10', label: 'Music', icon: <Music size={12} /> },
                                            { id: '20', label: 'Gaming', icon: <Gamepad2 size={12} /> },
                                            { id: '25', label: 'News', icon: <Newspaper size={12} /> },
                                            { id: '44', label: 'Movies', icon: <Film size={12} /> }
                                        ].map((c) => (
                                            <button
                                                key={c.id}
                                                onClick={() => setTrendingCategory(c.id as any)}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${trendingCategory === c.id
                                                    ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/50 text-[var(--color-primary)] font-bold'
                                                    : 'bg-black/20 border-white/5 text-gray-400 hover:border-white/20 hover:text-gray-200'}`}
                                            >
                                                {c.icon}
                                                {c.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Search Mode filters */}
                            {searchMode === 'search' && (
                                <>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 w-20 min-w-20 text-gray-400">
                                            <Calendar size={14} />
                                            <span className="text-xs font-medium">기간</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {[
                                                { id: 'any', label: '전체' },
                                                { id: 'month', label: '1개월' },
                                                { id: '3months', label: '3개월' },
                                                { id: 'year', label: '1년' }
                                            ].map((p) => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => setSearchPeriod(p.id as any)}
                                                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${searchPeriod === p.id
                                                        ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/50 text-[var(--color-primary)] font-bold'
                                                        : 'bg-black/20 border-white/5 text-gray-400 hover:border-white/20 hover:text-gray-200'}`}
                                                >
                                                    {p.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 w-20 min-w-20 text-gray-400">
                                            <ArrowUpDown size={14} />
                                            <span className="text-xs font-medium">정렬</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {[
                                                { id: 'relevance', label: '관련성' },
                                                { id: 'viewCount', label: '조회수' },
                                                { id: 'date', label: '최신순' }
                                            ].map((o) => (
                                                <button
                                                    key={o.id}
                                                    onClick={() => setSearchOrder(o.id as any)}
                                                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${searchOrder === o.id
                                                        ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/50 text-[var(--color-primary)] font-bold'
                                                        : 'bg-black/20 border-white/5 text-gray-400 hover:border-white/20 hover:text-gray-200'}`}
                                                >
                                                    {o.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 w-20 min-w-20 text-gray-400">
                                            <Clock size={14} />
                                            <span className="text-xs font-medium">길이</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {[
                                                { id: 'any', label: '전체' },
                                                { id: 'short', label: 'Shorts' },
                                                { id: 'medium', label: '4~20분' },
                                                { id: 'long', label: '20분+' }
                                            ].map((d) => (
                                                <button
                                                    key={d.id}
                                                    onClick={() => setSearchDuration(d.id as any)}
                                                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${searchDuration === d.id
                                                        ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/50 text-[var(--color-primary)] font-bold'
                                                        : 'bg-black/20 border-white/5 text-gray-400 hover:border-white/20 hover:text-gray-200'}`}
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
                        <button
                            onClick={() => exportResearchData()}
                            className="px-3 py-1.5 text-xs bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 flex items-center gap-1"
                            title="리서치 데이터 백업 (JSON)"
                        >
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
                                        <div className="min-w-0">
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
                                        </div>
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
                {(currentVideos.length > 0 || currentChannels.length > 0) && (
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
