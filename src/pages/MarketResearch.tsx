/**
 * Step 0: Market Research with AI Collaboration
 * 
 * Phase 1 of Research & Strategy module
 * - AI-assisted market trend analysis
 * - Split-panel UI: Chat (left) + Results Preview (right)
 * - Function calling for YouTube API integration
 */

import React, { useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import {
    MessageSquare, Send, Loader2, Globe, AlertCircle, ChevronRight,
    BarChart3, Play, Download, ArrowRight, Info, Code, ChevronDown, ChevronUp
} from 'lucide-react';

import type { RegionCode, YouTubeTrendVideo, YouTubeCategoryId } from '../store/types';
import { YOUTUBE_CATEGORIES } from '../store/types';
import { fetchTrendingVideos, fetchVideosByCategory, searchVideos, extractTopTopics, formatViewCount, REGION_NAMES } from '../services/youtube';
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
    const { apiKeys } = useWorkflowStore();
    const geminiApiKey = apiKeys?.gemini || '';

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: `안녕하세요! 👋 YouTube 시장 조사를 도와드리겠습니다.

**사용 가능한 기능:**
1. 🔥 카테고리별 인기 영상 조회 (Music, Gaming, News, Movies)
2. 🔍 키워드 검색
3. 📊 트렌드 분석

어떤 조사를 시작할까요? 예를 들어:
1. "한국 게이밍 트렌드 알려줘"
2. "일본 뉴스 카테고리 인기 영상 가져와"
3. "먹방 관련 영상 검색해줘"`,
            timestamp: new Date()
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Results state
    const [currentVideos, setCurrentVideos] = useState<YouTubeTrendVideo[]>([]);
    const [displayedVideos, setDisplayedVideos] = useState<YouTubeTrendVideo[]>([]);
    const [topicsByType, setTopicsByType] = useState<{ topic: any[]; keyword: any[]; hashtag: any[] }>({
        topic: [], keyword: [], hashtag: []
    });
    const [analysisTab, setAnalysisTab] = useState<'topic' | 'keyword' | 'hashtag'>('topic');
    const [selectedTopic, setSelectedTopic] = useState<any>(null);
    const [apiLogs, setApiLogs] = useState<string[]>([]);
    const [showApiLogs, setShowApiLogs] = useState(false);

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
                return await searchVideos(geminiApiKey, args.query, args.regionCode, args.maxResults || 25);
            case 'extractTopTopics':
                return extractTopTopics(args.videos);
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
- "먹방 검색해줘" → [FUNCTION_CALL: searchVideos({"query": "먹방", "regionCode": "KR"})]`;

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
                <div className="p-4 border-b border-[var(--color-border)]">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <MessageSquare className="text-[var(--color-primary)]" size={20} />
                        AI 시장 조사 어시스턴트
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">AI와 대화하며 YouTube 트렌드를 분석하세요</p>
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
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                            placeholder="예: 한국 게이밍 트렌드 분석해줘"
                            className="flex-1 bg-white/5 border border-[var(--color-border)] rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)]"
                            disabled={isProcessing}
                        />
                        <button
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
                <div className="flex-1 overflow-y-auto p-4">
                    {currentVideos.length === 0 && topicsByType.topic.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-500">
                            <div className="text-center">
                                <BarChart3 size={48} className="mx-auto mb-3 opacity-30" />
                                <p>AI와 대화하여 데이터를 가져오세요</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Analysis Tabs */}
                            {(topicsByType.topic.length > 0 || topicsByType.keyword.length > 0 || topicsByType.hashtag.length > 0) && (
                                <div>
                                    {/* Tab Buttons */}
                                    <div className="flex gap-2 mb-3">
                                        <button
                                            onClick={() => { setAnalysisTab('topic'); setSelectedTopic(null); setDisplayedVideos(currentVideos); }}
                                            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all ${analysisTab === 'topic'
                                                ? 'bg-[var(--color-primary)] text-black'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                                }`}
                                        >
                                            📂 주제 ({topicsByType.topic.length})
                                        </button>
                                        <button
                                            onClick={() => { setAnalysisTab('keyword'); setSelectedTopic(null); setDisplayedVideos(currentVideos); }}
                                            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all ${analysisTab === 'keyword'
                                                ? 'bg-[var(--color-primary)] text-black'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                                }`}
                                        >
                                            🔑 키워드 ({topicsByType.keyword.length})
                                        </button>
                                        <button
                                            onClick={() => { setAnalysisTab('hashtag'); setSelectedTopic(null); setDisplayedVideos(currentVideos); }}
                                            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all ${analysisTab === 'hashtag'
                                                ? 'bg-[var(--color-primary)] text-black'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                                }`}
                                        >
                                            # 해시태그 ({topicsByType.hashtag.length})
                                        </button>
                                    </div>

                                    {/* Chart */}
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
                                </div>
                            )}

                            {/* Videos Grid */}
                            {displayedVideos.length > 0 && (
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
                                        {displayedVideos.slice(0, 12).map((video, i) => (
                                            <TrendVideoCard key={video.id} video={video} rank={i + 1} />
                                        ))}
                                    </div>
                                    {displayedVideos.length > 12 && (
                                        <p className="text-xs text-gray-500 mt-2 text-center">
                                            + {displayedVideos.length - 12}개 더 있음
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer: Next Step */}
                {currentVideos.length > 0 && (
                    <div className="p-4 border-t border-[var(--color-border)]">
                        <button className="w-full px-4 py-3 bg-[var(--color-primary)] text-black font-bold rounded-lg hover:bg-[var(--color-primary)]/90 flex items-center justify-center gap-2">
                            <ArrowRight size={18} />
                            선택한 채널/콘텐츠로 벤치마킹 분석 (Phase 2)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MarketResearch;
