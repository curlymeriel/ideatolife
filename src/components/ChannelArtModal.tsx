import React, { useState, useEffect, useRef } from 'react';
import { X, Wand2, Download, Check, Loader2, ImageIcon, Maximize2, Sparkles, Send, Plus, Trash2, MessageSquare, Image, ChevronDown } from 'lucide-react';
import { generateImage, editImageWithChat } from '../services/imageGen';
import { generateText } from '../services/gemini';
import { resolveUrl } from '../utils/imageStorage';
import { ImageCropModal } from './ImageCropModal';

interface TaggedReference {
    id: string;
    url: string;
    categories: string[];
}

const DEFAULT_CATEGORIES = [
    { value: 'face', label: '얼굴' },
    { value: 'style', label: '화풍/스타일' },
    { value: 'costume', label: '의상' },
    { value: 'hair', label: '헤어' },
    { value: 'color', label: '색감' },
    { value: 'composition', label: '구도' },
];

interface ChannelArtModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'banner' | 'profile';
    channelName: string;
    initialPrompt: string;
    initialUrl?: string;
    apiKey: string;
    strategyContext: string;
    characters?: Array<{ name: string }>;
    onSave: (url: string, prompt: string) => void;
}

export const ChannelArtModal: React.FC<ChannelArtModalProps> = ({
    isOpen,
    onClose,
    type,
    channelName,
    initialPrompt,
    initialUrl,
    apiKey,
    strategyContext,
    characters = [],
    onSave,
}) => {
    const [prompt, setPrompt] = useState(initialPrompt);
    const [history, setHistory] = useState<string[]>([]);
    const [selectedUrl, setSelectedUrl] = useState<string | null>(initialUrl || null);
    const [taggedReferences, setTaggedReferences] = useState<TaggedReference[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExpanding, setIsExpanding] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [isChatProcessing, setIsChatProcessing] = useState(false);
    const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant', text: string }>>([]);
    const [showLargeView, setShowLargeView] = useState(false);
    const [feedbackTarget, setFeedbackTarget] = useState<'prompt' | 'image'>('prompt');
    const [draftCount, setDraftCount] = useState(2);
    const [activeDrafts, setActiveDrafts] = useState<string[]>([]);
    const [isGridView, setIsGridView] = useState(false);
    const [koreanTranslation, setKoreanTranslation] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-image-preview');
    const [pendingCrop, setPendingCrop] = useState<{ url: string; aspectRatio: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // UI State
    const [isChatExpanded, setIsChatExpanded] = useState(false);

    // Combine default categories with dynamic character categories
    const referenceCategories = [
        ...DEFAULT_CATEGORIES,
        ...characters.map(c => ({ value: `character-${c.name}`, label: `캐릭터: ${c.name}` }))
    ];

    useEffect(() => {
        if (isOpen) {
            setPrompt(initialPrompt);

            // Resolve initial URL if it exists
            const init = async () => {
                let resolvedUrl = initialUrl;
                if (initialUrl?.startsWith('idb://')) {
                    resolvedUrl = await resolveUrl(initialUrl) || undefined;
                }

                setSelectedUrl(resolvedUrl || null);

                // Initialize history with resolved URL
                if (resolvedUrl && history.length === 0) {
                    setHistory([resolvedUrl]);
                }
            };
            init();
        }
    }, [isOpen, initialPrompt, initialUrl]);

    // Automatic Korean translation effect
    useEffect(() => {
        if (!prompt || prompt.trim().length < 5) {
            setKoreanTranslation('');
            return;
        }

        const timer = setTimeout(async () => {
            await performTranslation();
        }, 800);

        return () => clearTimeout(timer);
    }, [prompt, apiKey]);

    const performTranslation = async () => {
        if (!prompt || prompt.trim().length < 2 || !apiKey) return;

        setIsTranslating(true);
        try {
            const translation = await generateText(
                `Translate this English image generation prompt to natural Korean. Only output the Korean translation, nothing else:\n\n${prompt}`,
                apiKey,
                undefined, // mime
                undefined, // images
                undefined, // system
                { temperature: 0.1 }
            );
            if (translation) {
                setKoreanTranslation(translation.trim());
            }
        } catch (error) {
            console.error('Translation failed:', error);
        } finally {
            setIsTranslating(false);
        }
    };

    const analyzeReferences = async () => {
        if (taggedReferences.length === 0) return '';

        const analysisResults = await Promise.all(taggedReferences.map(async (ref, index) => {
            const matches = ref.url.match(/^data:(.+);base64,(.+)$/);
            if (!matches) return null;

            const referenceIndex = index + 1;
            const isCharacter = ref.categories.some(c => c.startsWith('character-'));

            // Derive character name (if any) or labels
            const catLabels = ref.categories.map(c => {
                if (c.startsWith('character-')) return `Character (${c.replace('character-', '')})`;
                return c; // Use English value ('face', 'costume') directly for Prompt
            }).join(', ');

            let characterName = '';
            if (isCharacter) {
                // Find matching character from context or use generic
                const charTag = ref.categories.find(c => c.startsWith('character-'));
                characterName = charTag ? charTag.replace('character-', '') : 'Character';
            }

            let mappingInstruction = "";

            if (isCharacter) {
                // Determine if costume/hair specific tags are ALSO present
                const hasCostume = ref.categories.includes('costume');
                const hasHair = ref.categories.includes('hair');
                let specifics = "face, hair, and attire";
                if (hasCostume && !hasHair) specifics = "face and attire";
                else if (hasHair && !hasCostume) specifics = "face and hair";

                mappingInstruction = `[CRITICAL] This image (Reference #${referenceIndex}) is the DEFINITIVE VISUAL SOURCE for the character "${characterName}". You must perform a deep visual analysis of their ${specifics}.`;
            } else {
                // Multi-category generic mapping
                let instructions = [];
                if (ref.categories.includes('face')) instructions.push("facial structure and features");
                if (ref.categories.includes('style')) instructions.push("artistic style and rendering technique");
                if (ref.categories.includes('costume')) instructions.push("clothing design and fabric texture");
                if (ref.categories.includes('hair')) instructions.push("hairstyle and hair color");
                if (ref.categories.includes('color')) instructions.push("color palette and lighting");
                if (ref.categories.includes('composition')) instructions.push("camera perspective and layout");

                if (instructions.length > 0) {
                    mappingInstruction = `Apply the following characteristics from Reference #${referenceIndex}: ${instructions.join(', ')}.`;
                } else {
                    mappingInstruction = `This image (Reference #${referenceIndex}) provides guidance for: ${catLabels}.`;
                }
            }

            const analysisPrompt = `${mappingInstruction}\nAnalyze this image in extreme detail for these specific characteristics to enable high-quality AI generation. Output ONLY the descriptive English text.`;

            try {
                const result = await generateText(analysisPrompt, apiKey, undefined, [{ mimeType: matches[1], data: matches[2] }]);
                const mappingTag = isCharacter ? characterName : catLabels;
                return `[REF_MAP]: ${mappingTag} = Reference #${referenceIndex}\n[ANALYSIS]: ${result}`;
            } catch (e) {
                return null;
            }
        }));
        return analysisResults.filter(Boolean).join('\n\n');
    };

    const handleGenerate = async () => {
        if (!prompt || !apiKey) return;
        setIsGenerating(true);
        setIsGridView(false);
        setActiveDrafts([]);

        try {
            const analysisContext = await analyzeReferences();
            const fullPrompt = `[Context: ${strategyContext}]\n${analysisContext}\n\nTask: Generate channel art for "${channelName}".\nDescription: ${prompt}`;

            const aspectRatio = type === 'banner' ? '16:9' : '1:1';
            const refUrls = taggedReferences.map(r => r.url);

            // Note: generateImage service needs to be called with draftCount and selected model
            const result = await generateImage(fullPrompt, apiKey, refUrls.length > 0 ? refUrls : undefined, aspectRatio, selectedModel, draftCount);

            if (result.urls && result.urls.length > 0) {
                const resolvedUrls = await Promise.all(result.urls.map(url => resolveUrl(url)));
                const validUrls = resolvedUrls.filter((url): url is string => url !== null);

                setHistory(prev => {
                    const newHistory = [...validUrls, ...prev];
                    return Array.from(new Set(newHistory)); // Ensure uniqueness
                });

                setActiveDrafts(validUrls);

                if (validUrls.length > 1) {
                    setIsGridView(true);
                    setSelectedUrl(null);
                } else {
                    setSelectedUrl(validUrls[0]);
                }
            }
        } catch (error: any) {
            console.error('Generation failed:', error);
            alert(`생성 실패: ${error.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAIExpand = async () => {
        if (!apiKey) return;
        setIsExpanding(true);
        try {
            // Analyze references if present
            const referenceContext = await analyzeReferences();

            const systemPrompt = `당신은 유튜브 ${type === 'banner' ? '배너' : '프로필'} 디자인 및 채널 브랜딩 전문가입니다. 채널의 정체성(Mission, Tone, Target)과 참조 이미지의 시각적 특징을 결합하여, AI 이미지 생성을 위한 고품질의 영어 프롬프트를 작성하세요.`;

            // Gather images for Gemini
            const refImages = taggedReferences.map(ref => {
                const matches = ref.url.match(/^data:(.+);base64,(.+)$/);
                if (matches) return { mimeType: matches[1], data: matches[2] };
                return null;
            }).filter(Boolean) as { mimeType: string; data: string }[];

            const fullPrompt = `[채널 브랜딩 및 전략 정보]
${strategyContext}

[사용자 현재 의도]
${prompt || (type === 'banner' ? 'A professional YouTube banner' : 'A premium profile icon')}

${referenceContext ? `[참조 이미지 시각적 분석]\n${referenceContext}` : ''}

[프롬프트 작성 지침 - 절대 준수]
1. 위 브랜딩 정보(미션, 타겟, 톤앤매너)를 시각적으로 형상화하세요.
2. [CRITICAL] **제공된 참조 이미지들(${refImages.length}장)**의 시각적 특징을 프롬프트 내에 100% 반영하세요.
   * 첫 번째 이미지가 "Reference #1", 두 번째가 "Reference #2" 입니다.
   * 절대로 참조 이미지를 생략하거나, 임외의 다른 인상을 만들지 마세요.
3. [CRITICAL] 참조된 특징을 묘사할 때 반드시 "Reference #X" 번호를 명시적으로 언급하여 AI 엔진이 매핑할 수 있게 하세요.
   * 예: "The character Kang Yi-soo from Reference #1", "the futuristic background from Reference #2" 등
4. 캐릭터(${characters.map(c => c.name).join(', ')}) 묘사 시, 반드시 해당 캐릭터가 매핑된 Reference 번호와 그 시각적 디테일을 프롬프트의 가장 앞에, 가장 비중 있게 작성하세요.
5. 출력은 '오직 1개의 통합된 영어 프롬프트'만 하세요.`;

            const result = await generateText(fullPrompt, apiKey, undefined, refImages, systemPrompt);
            if (result) {
                const cleanResult = result.replace(/^["']|["']$/g, '').replace(/^(Prompt|Output):\s*/i, '').trim();
                setPrompt(cleanResult);
            }
        } catch (error) {
            console.error('AI Expand failed:', error);
        } finally {
            setIsExpanding(false);
        }
    };

    const handleAddReference = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            // Instead of adding immediately, open the crop modal
            setPendingCrop({ url: base64, aspectRatio: '1:1' });
        };
        reader.readAsDataURL(file);
    };

    const handleConfirmCrop = (croppedUrl: string) => {
        setTaggedReferences(prev => [...prev, {
            id: `ref-${Date.now()}`,
            url: croppedUrl,
            categories: ['style']
        }]);
        setPendingCrop(null);
    };

    const handleRemoveReference = (id: string) => {
        setTaggedReferences(prev => prev.filter(r => r.id !== id));
    };

    const handleToggleReferenceCategory = (id: string, cat: string) => {
        setTaggedReferences(prev => prev.map(r => {
            if (r.id === id) {
                const exists = r.categories.includes(cat);
                const newCategories = exists
                    ? r.categories.filter(c => c !== cat)
                    : [...r.categories, cat];
                return { ...r, categories: newCategories };
            }
            return r;
        }));
    };

    const handleChatSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!chatInput.trim() || !apiKey || isChatProcessing) return;

        const userMsg = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setIsChatProcessing(true);

        try {
            if (feedbackTarget === 'prompt') {
                const referenceContext = await analyzeReferences();
                const systemPrompt = `당신은 AI 이미지 생성 프롬프트 전문가입니다. 사용자의 피드백과 제공된 참조 자산 정보를 바탕으로 기존 프롬프트를 보완하거나 수정해주세요. 프리미엄하고 상세한 영어 프롬프트만 출력하세요. 사용자가 한국어로 요청하더라도 영어 프롬프트를 생성해야 합니다.`;
                const fullPrompt = `현재 프롬프트: ${prompt}
사용자 피드백 (한국어 포함 가능): ${userMsg}

[채널 브랜딩 정보 context]
${strategyContext}

${referenceContext ? `[참조 이미지 정보]\n${referenceContext}` : ''}

[지침]
1. 사용자의 피드백을 최우선으로 반영하되, 채널의 브랜딩 톤을 유지하세요.
2. [중요] 참조 이미지가 존재할 경우, 분석된 'Reference #X' 번호와 카테고리를 활용하여 시각적 지시를 구체화하세요.
   * 예: "Adjust the style to match the rendering technique from Reference #2"
3. 각 캐릭터(특히 ${characters.map(c => c.name).join(', ')})가 언급될 때 해당 캐릭터의 Reference 번호와 매핑된 외양 특징을 누락 없이 반영하세요.
4. 참조 이미지에 특정 캐릭터(Character)가 태그되어 있다면, 그 캐릭터의 외양 묘사를 프롬프트의 주 피사체로 정확히 반영하세요.
5. 수정된 상세 영어 프롬프트만 한 문장 혹은 한 단락으로 출력하세요.`;
                const result = await generateText(fullPrompt, apiKey, undefined, undefined, systemPrompt);
                if (result) {
                    const cleanResult = result.replace(/^["']|["']$/g, '').replace(/^(Prompt|Output):\s*/i, '').trim();
                    setPrompt(cleanResult);
                    setChatMessages(prev => [...prev, { role: 'assistant', text: `프롬프트를 수정했습니다. 왼쪽의 '이미지 생성' 버튼을 눌러 결과물을 확인해보세요.` }]);
                }
            } else {
                if (!selectedUrl) {
                    setChatMessages(prev => [...prev, { role: 'assistant', text: `이미지를 먼저 생성한 후 이미지 기반 수정을 진행할 수 있습니다.` }]);
                    return;
                }
                // Resolve reference images to ensure they are base64 (required for API)
                const refUrls = await Promise.all(
                    taggedReferences.map(r => resolveUrl(r.url))
                );

                console.log(`[ChatEdit] Spending edit request with ${refUrls.length} references`);

                const result = await editImageWithChat(selectedUrl, userMsg, apiKey, undefined, refUrls.length > 0 ? refUrls : undefined);
                if (result.image) {
                    const resolved = await resolveUrl(result.image) || result.image;
                    setHistory(prev => {
                        const newHistory = [resolved, ...prev];
                        return Array.from(new Set(newHistory)); // Ensure uniqueness
                    });
                    setSelectedUrl(resolved);
                }
                setChatMessages(prev => [...prev, { role: 'assistant', text: result.explanation }]);
            }
        } catch (error: any) {
            setChatMessages(prev => [...prev, { role: 'assistant', text: `오류: ${error.message}` }]);
        } finally {
            setIsChatProcessing(false);
        }
    };

    const handleDownload = async () => {
        if (!selectedUrl) return;
        setIsGenerating(true);
        try {
            // 1. Resolve potential idb:// URL to real data
            let resolved = await resolveUrl(selectedUrl);

            // 2. Load into image element
            const img = new window.Image();
            img.crossOrigin = "anonymous";
            img.src = resolved;

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("이미지 로드 시간 초과")), 10000);
                img.onload = () => {
                    clearTimeout(timeout);
                    resolve(null);
                };
                img.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error("이미지 로드 실패 (CORS 또는 네트워크 오류)"));
                };
            });

            // 3. Draw on canvas to convert to JPEG
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Canvas context 생성 실패");

            // Fill white background (JPEG transparency fallback)
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);

            // 4. Export as Blob and Trigger Download
            canvas.toBlob((blob) => {
                if (blob) {
                    const blobUrl = URL.createObjectURL(blob);
                    const fileName = `Channel_${type === 'banner' ? 'Banner' : 'Profile'}_${Date.now()}.jpg`;

                    const link = document.createElement('a');
                    link.href = blobUrl;
                    link.download = fileName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    // Delay revocation to ensure browser started the download
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                } else {
                    // Fallback to data URL if toBlob fails
                    const link = document.createElement('a');
                    link.href = canvas.toDataURL('image/jpeg', 0.95);
                    link.download = `Channel_${type === 'banner' ? 'Banner' : 'Profile'}_${Date.now()}.jpg`;
                    link.click();
                }
                setIsGenerating(false);
            }, 'image/jpeg', 0.95);
        } catch (error: any) {
            console.error("Download failed:", error);
            // Absolute fallback: try to download the original resolved URL directly
            try {
                const link = document.createElement('a');
                link.href = await resolveUrl(selectedUrl);
                link.download = `Channel_${type === 'banner' ? 'Banner' : 'Profile'}_Fallback.jpg`;
                link.target = "_blank";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (e) {
                alert(`다운로드 중 오류가 발생했습니다: ${error.message}`);
            }
            setIsGenerating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-2 md:p-4">
            <div className="w-[98vw] h-[96vh] bg-[#111] border border-white/10 rounded-[40px] overflow-hidden flex flex-col shadow-[0_0_150px_rgba(0,0,0,0.7)]">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-[var(--color-primary)] text-black rounded-2xl">
                            <ImageIcon size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white">{type === 'banner' ? 'Channel Banner' : 'Profile Icon'} Studio</h2>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">{channelName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-2xl transition-all">
                        <X size={28} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left: Configuration (Widened to 500px) */}
                    <div className="w-[500px] border-r border-white/5 flex flex-col bg-black/20">
                        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                            {/* References Section */}
                            <section className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <Image size={16} /> Reference Assets
                                    </h3>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-black text-gray-400 transition-all flex items-center gap-2"
                                    >
                                        <Plus size={12} /> 추가
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleAddReference}
                                            onClick={(e) => (e.target as any).value = null} // Reset to allow same file upload
                                        />
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {taggedReferences.map((ref, index) => (
                                        <div key={ref.id} className="relative group/ref bg-white/5 border border-white/10 rounded-xl overflow-hidden p-2">
                                            {/* Reference Index Badge */}
                                            <div className="absolute top-3 left-3 z-10 px-2 py-0.5 bg-black/80 backdrop-blur-md border border-white/20 rounded-md shadow-lg">
                                                <span className="text-[10px] font-black text-[var(--color-primary)]">#{index + 1}</span>
                                            </div>
                                            <div className="aspect-square rounded-lg overflow-hidden mb-2 relative">
                                                <img src={ref.url} className="w-full h-full object-cover" />
                                                <button
                                                    onClick={() => handleRemoveReference(ref.id)}
                                                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-md opacity-0 group-hover/ref:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {referenceCategories.map(cat => (
                                                    <button
                                                        key={cat.value}
                                                        onClick={() => handleToggleReferenceCategory(ref.id, cat.value)}
                                                        className={`px-2 py-1 rounded-md text-[9px] font-bold border transition-all ${ref.categories.includes(cat.value)
                                                            ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)]'
                                                            : 'bg-black/40 border-white/10 text-gray-500 hover:text-white hover:border-white/30'
                                                            }`}
                                                    >
                                                        {cat.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    {taggedReferences.length === 0 && (
                                        <div className="col-span-2 py-8 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-gray-600">
                                            <ImageIcon size={24} className="mb-2 opacity-20" />
                                            <p className="text-[10px] font-bold">참조 이미지가 없습니다.</p>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Prompt Section */}
                            <section className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <Sparkles size={16} /> Image Prompt
                                    </h3>
                                    <button
                                        onClick={handleAIExpand}
                                        disabled={isExpanding}
                                        className="text-[10px] font-black text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-3 py-1.5 rounded-full hover:bg-[var(--color-primary)]/20 transition-all flex items-center gap-2"
                                    >
                                        {isExpanding ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                        전략 + 레퍼런스 분석 확장
                                    </button>
                                </div>
                                <textarea
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    placeholder="Enter image description in English..."
                                    className="w-full h-32 bg-white/5 border border-white/10 rounded-2xl p-5 text-sm text-gray-200 focus:border-[var(--color-primary)] outline-none transition-all leading-relaxed custom-scrollbar"
                                />

                                {/* Korean Translation Box */}
                                <div className="relative">
                                    <div className="absolute top-3 left-3 flex items-center gap-2">
                                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">KR</span>
                                        {isTranslating && <Loader2 size={10} className="animate-spin text-gray-700" />}
                                    </div>
                                    <div className="w-full h-24 bg-black/40 border border-white/10 rounded-2xl p-5 pt-10 text-xs text-gray-400 overflow-y-auto custom-scrollbar leading-relaxed italic">
                                        {koreanTranslation || (isTranslating ? '번역 중...' : '자동 번역이 여기에 표시됩니다...')}
                                    </div>
                                </div>
                                <div className="flex items-end gap-2 pt-2">
                                    {/* 1. Model Selection */}
                                    <div className="flex-1 space-y-1.5">
                                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1 block">AI Model</span>
                                        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 gap-0.5">
                                            {[
                                                { id: 'gemini-3.1-flash-image-preview', label: 'ULTRA' },
                                                { id: 'gemini-3-pro-image-preview', label: 'PRO' },
                                                { id: 'gemini-2.5-flash-image', label: 'STD' }
                                            ].map(model => (
                                                <button
                                                    key={model.id}
                                                    onClick={() => setSelectedModel(model.id)}
                                                    className={`flex-1 py-1.5 font-black rounded-lg transition-all flex items-center justify-center min-w-[60px] ${selectedModel === model.id ? 'bg-white/20 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                                >
                                                    <span className="text-[10px]">{model.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 2. Draft Selection */}
                                    <div className="flex-1 space-y-1.5">
                                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest pl-1 block">Drafts</span>
                                        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 gap-0.5">
                                            {[1, 2, 3, 4].map(count => (
                                                <button
                                                    key={count}
                                                    onClick={() => setDraftCount(count)}
                                                    className={`flex-1 py-1.5 font-black rounded-lg transition-all flex items-center justify-center min-w-[35px] ${draftCount === count ? 'bg-white/20 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                                >
                                                    <span className="text-[11px]">{count}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 3. Generate Action */}
                                    <div className="flex-[1.5] max-w-[140px] space-y-1.5">
                                        <div className="h-[13px]"></div> {/* Spacer for label alignment */}
                                        <button
                                            onClick={handleGenerate}
                                            disabled={isGenerating || !prompt}
                                            className="w-full h-[32px] bg-[var(--color-primary)] text-black font-black rounded-xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[var(--color-primary)]/10 disabled:opacity-30"
                                        >
                                            {isGenerating ? <Loader2 className="animate-spin" size={14} /> : <Wand2 size={14} />}
                                            <span className="text-[11px]">이미지 생성</span>
                                        </button>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>

                    {/* Right: Preview & History & Chat (Main Area) */}
                    <div className="flex-1 flex flex-col bg-black/40 overflow-hidden">
                        {/* Top: Preview & History Center Piece */}
                        <div className="flex-1 flex items-center justify-center p-8 gap-8 min-h-0 bg-black/20 relative">
                            {isGridView && activeDrafts.length > 0 ? (
                                <div className="w-full max-w-[1000px] flex flex-col gap-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-black text-[var(--color-primary)] uppercase tracking-widest flex items-center gap-2">
                                            <Wand2 size={16} /> Generated Drafts ({activeDrafts.length})
                                        </h3>
                                        <p className="text-[10px] text-gray-500 font-bold italic">Select an image to start editing or give chat feedback.</p>
                                    </div>
                                    <div className={`grid gap-4 ${activeDrafts.length === 4 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                                        {activeDrafts.map((url, i) => (
                                            <div
                                                key={i}
                                                className="relative group cursor-pointer aspect-video bg-black/40 rounded-3xl overflow-hidden border border-white/5 hover:border-[var(--color-primary)]/50 transition-all hover:scale-[1.02] shadow-2xl"
                                                onClick={() => {
                                                    setSelectedUrl(url);
                                                    setIsGridView(false);
                                                }}
                                            >
                                                <img src={url} alt={`Draft ${i + 1}`} className="w-full h-full object-contain" />
                                                <div className="absolute inset-0 bg-[var(--color-primary)]/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <span className="px-6 py-3 bg-[var(--color-primary)] text-black text-xs font-black rounded-full shadow-xl">이 버전 선택</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : selectedUrl ? (
                                <div className="flex items-center gap-8 max-w-full relative">
                                    {/* Main Preview Container */}
                                    <div className={`relative group ${type === 'banner' ? 'w-[800px] aspect-[16/9]' : 'w-80 h-80 rounded-full border-4 border-[var(--color-primary)]'} shadow-2xl overflow-hidden`}>
                                        <img src={selectedUrl} alt="Preview" className="w-full h-full object-contain" />
                                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                            <button
                                                onClick={() => setShowLargeView(true)}
                                                className="px-6 py-3 bg-[var(--color-primary)] text-black text-xs font-black rounded-full flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform"
                                            >
                                                <Maximize2 size={16} /> 크게 보기
                                            </button>
                                        </div>
                                    </div>

                                    {/* History Vertical Column (Right of Preview) */}
                                    {history.length > 0 && (
                                        <div className={`w-[180px] flex flex-col gap-4 shrink-0 transition-all duration-500 ${type === 'banner' ? 'h-[450px]' : 'h-80'}`}>
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">History</h3>
                                                {activeDrafts.length > 1 && (
                                                    <button
                                                        onClick={() => setIsGridView(true)}
                                                        className="text-[9px] font-black text-[var(--color-primary)] hover:underline"
                                                    >
                                                        Grid View
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex-1 min-h-0 grid grid-cols-2 gap-2 overflow-y-auto pr-2 custom-scrollbar">
                                                {history.map((url, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => {
                                                            setSelectedUrl(url);
                                                            setIsGridView(false);
                                                        }}
                                                        className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${selectedUrl === url ? 'border-[var(--color-primary)] scale-105' : 'border-white/5 hover:border-white/20'}`}
                                                    >
                                                        <img src={url} alt="" className="w-full h-full object-cover" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="w-full max-w-[800px] aspect-video bg-white/5 border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center space-y-4 text-gray-600">
                                    <ImageIcon size={64} className="opacity-20" />
                                    <p className="font-bold text-sm">프롬프트를 입력하고 이미지를 생성하세요.</p>
                                </div>
                            )}

                            {/* Floating Action Buttons (Fixed Right) */}
                            {selectedUrl && (
                                <div className="absolute top-8 right-8 flex flex-col gap-3">
                                    <button
                                        onClick={handleDownload}
                                        className="p-3 bg-white/10 text-white rounded-2xl hover:bg-white/20 transition-all border border-white/10"
                                        title="이미지 다운로드"
                                    >
                                        <Download size={24} />
                                    </button>
                                    <button
                                        onClick={() => onSave(selectedUrl, prompt)}
                                        className="p-3 bg-[var(--color-primary)] text-black rounded-2xl hover:scale-110 active:scale-95 transition-all shadow-xl shadow-[var(--color-primary)]/20"
                                        title="현재 안으로 확정"
                                    >
                                        <Check size={24} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Bottom: AI Chat Feedback (Collapsible) */}
                        <div className={`border-t border-white/10 bg-black/40 flex flex-col px-6 transition-all duration-300 ease-in-out ${isChatExpanded ? 'h-[400px] py-6' : 'h-[60px] py-0'}`}>
                            <div
                                className="h-[60px] flex items-center justify-between cursor-pointer group"
                                onClick={() => setIsChatExpanded(!isChatExpanded)}
                            >
                                <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 group-hover:text-white transition-colors">
                                    <Send size={16} className={isChatExpanded ? 'text-[var(--color-primary)]' : ''} />
                                    AI 편집장
                                    <span className={`ml-2 text-[9px] px-2 py-0.5 rounded-full font-bold bg-white/5 text-gray-500 transition-all ${isChatExpanded ? 'opacity-0' : 'opacity-100'}`}>
                                        {chatMessages.length > 0 ? `${chatMessages.length} messages` : 'Start Chat'}
                                    </span>
                                </h3>
                                <div className="flex items-center gap-3">
                                    {/* Mode Toggles - Always visible */}
                                    <div
                                        className="flex bg-white/5 p-1 rounded-xl border border-white/5 text-[10px]"
                                        onClick={(e) => e.stopPropagation()} // Prevent collapse when clicking buttons
                                    >
                                        <button
                                            onClick={() => { setFeedbackTarget('prompt'); setIsChatExpanded(true); }}
                                            className={`px-4 py-1.5 font-black rounded-lg transition-all ${feedbackTarget === 'prompt' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500 hover:text-white'}`}
                                        >
                                            프롬프트 수정
                                        </button>
                                        <button
                                            onClick={() => { setFeedbackTarget('image'); setIsChatExpanded(true); }}
                                            className={`px-4 py-1.5 font-black rounded-lg transition-all ${feedbackTarget === 'image' ? 'bg-[var(--color-primary)] text-black' : 'text-gray-500 hover:text-white'}`}
                                        >
                                            이미지 부분 수정
                                        </button>
                                    </div>
                                    <div className={`transition-transform duration-300 ${isChatExpanded ? 'rotate-180' : 'rotate-0'}`}>
                                        <ChevronDown size={16} className="text-gray-500" />
                                    </div>
                                </div>
                            </div>

                            {/* Chat Body - Hidden when collapsed */}
                            <div className={`flex-1 flex flex-col min-h-0 space-y-4 transition-opacity duration-300 ${isChatExpanded ? 'opacity-100 visible' : 'opacity-0 invisible h-0'}`}>

                                <div className="flex-1 bg-black/60 border border-white/10 rounded-2xl p-4 flex flex-col justify-between overflow-hidden shadow-inner">
                                    <div className="flex-1 overflow-y-auto space-y-4 mb-4 custom-scrollbar pr-2">
                                        {chatMessages.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-10">
                                                <MessageSquare size={32} className="mb-3" />
                                                <p className="text-xs italic leading-relaxed">
                                                    {feedbackTarget === 'prompt'
                                                        ? "프롬프트 내용을 어떻게 개선하고 싶으신가요?\n(예: '배경을 더 화려하게', '전체적인 색감을 파스텔톤으로')"
                                                        : "생성된 이미지의 특정 부분을 수정하고 싶으신가요?"}
                                                </p>
                                            </div>
                                        ) : (
                                            chatMessages.map((m, i) => (
                                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[80%] p-4 rounded-2xl text-xs leading-relaxed ${m.role === 'user' ? 'bg-[var(--color-primary)] text-black font-bold shadow-lg' : 'bg-white/10 text-gray-300 border border-white/5'}`}>
                                                        {m.text}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <form onSubmit={handleChatSubmit} className="relative">
                                        <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar">
                                            {taggedReferences.map((ref, i) => (
                                                <button
                                                    key={ref.id}
                                                    type="button"
                                                    onClick={() => setChatInput(prev => `${prev} (Ref #${i + 1}) `)}
                                                    className="flex items-center gap-1.5 px-2 py-1 bg-white/5 border border-white/10 rounded-lg hover:bg-[var(--color-primary)]/20 hover:border-[var(--color-primary)]/30 hover:text-[var(--color-primary)] transition-all shrink-0 text-[10px] text-gray-400 font-bold group"
                                                >
                                                    <ImageIcon size={10} />
                                                    <span>#{i + 1}</span>
                                                </button>
                                            ))}
                                        </div>
                                        <input
                                            value={chatInput}
                                            onChange={e => setChatInput(e.target.value)}
                                            placeholder={feedbackTarget === 'prompt' ? "프롬프트 수정 요청 입력... (태그를 눌러 참조 이미지 언급)" : "이미지 수정 요청 입력... (태그를 눌러 참조 이미지 언급)"}
                                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-xs focus:border-[var(--color-primary)] outline-none transition-all pr-14"
                                        />
                                        <button type="submit" disabled={isChatProcessing} className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-[var(--color-primary)] text-black rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50">
                                            {isChatProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Large View Modal */}
                {showLargeView && selectedUrl && (
                    <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-8 animate-in fade-in zoom-in duration-300">
                        <button
                            onClick={() => setShowLargeView(false)}
                            className="absolute top-8 right-8 p-4 text-white hover:bg-white/10 rounded-full transition-all"
                        >
                            <X size={32} />
                        </button>
                        <div className={`max-w-[90vw] max-h-[85vh] shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 ${type === 'banner' ? 'aspect-[16/9] w-full max-w-6xl' : 'aspect-square h-full rounded-full overflow-hidden border-4 border-[var(--color-primary)]'}`}>
                            <img src={selectedUrl} className="w-full h-full object-contain" />
                        </div>
                    </div>
                )}
            </div>
            {/* Image Crop Modal for References */}
            {pendingCrop && (
                <ImageCropModal
                    imageSrc={pendingCrop.url}
                    aspectRatio={pendingCrop.aspectRatio}
                    onConfirm={handleConfirmCrop}
                    onCancel={() => setPendingCrop(null)}
                />
            )}
        </div>
    );
};
