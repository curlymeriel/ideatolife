import React, { useState, useEffect, useRef } from 'react';
import { X, Wand2, Loader2, ImageIcon, Plus, Trash2, Send, MessageSquare, Crop, Check, Tag, Image, Sparkles, RotateCcw } from 'lucide-react';
import { ImageCropModal } from './ImageCropModal';
import { InteractiveImageViewer } from './InteractiveImageViewer';

// Types
export interface TaggedReference {
    id: string;
    url: string;
    category: 'face' | 'body' | 'costume' | 'props' | 'style' | 'color' | 'pose';
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    image?: string;
    timestamp: number;
}

interface AssetGenerationModalProps {
    isOpen: boolean;
    onClose: () => void;
    assetId: string;
    assetType: 'character' | 'location' | 'prop';
    assetName: string;
    initialDescription: string;
    initialReferenceImage?: string | null;
    initialDraftImage?: string | null;
    masterStyle?: string;
    aspectRatio: string;
    apiKey: string;
    projectContext?: string; // [NEW] Full project context from parent
    existingAssets?: { id: string, name: string, url: string, type: string }[]; // [NEW]
    onSave: (result: GenerationResult) => void;
}

export interface GenerationResult {
    description: string;
    taggedReferences: TaggedReference[];
    selectedDraft: string | null;
    draftHistory: string[];
}

const REFERENCE_CATEGORIES = [
    { value: 'face', label: '얼굴 / Face' },
    { value: 'body', label: '신체 / Body' },
    { value: 'costume', label: '의상 / Costume' },
    { value: 'props', label: '소품 / Props' },
    { value: 'style', label: '스타일 / Style' },
    { value: 'color', label: '색감 / Color' },
    { value: 'pose', label: '포즈 / Pose' },
];

export const AssetGenerationModal: React.FC<AssetGenerationModalProps> = ({
    isOpen,
    onClose,

    assetType,
    assetName,
    initialDescription,
    initialReferenceImage,
    initialDraftImage,
    masterStyle,
    aspectRatio,
    apiKey,
    projectContext,
    existingAssets,
    onSave,
}) => {
    // Core state
    const [description, setDescription] = useState(initialDescription);
    const [koreanTranslation, setKoreanTranslation] = useState('');
    const [taggedReferences, setTaggedReferences] = useState<TaggedReference[]>([]);
    const [draftHistory, setDraftHistory] = useState<string[]>([]);
    const [selectedDraft, setSelectedDraft] = useState<string | null>(initialDraftImage || null);

    // Generation state
    const [isGenerating, setIsGenerating] = useState(false);
    const [draftCount, setDraftCount] = useState(2);

    // Chat state
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Cropping state
    const [showCropModal, setShowCropModal] = useState(false);
    const [imageToCrop, setImageToCrop] = useState<string | null>(null);

    // Translation state
    const [isTranslating, setIsTranslating] = useState(false);

    // Reference picker state
    const [showRefPicker, setShowRefPicker] = useState(false);
    const [pickerTab, setPickerTab] = useState<'drafts' | 'assets'>('drafts'); // [NEW]

    // AI Expander state
    // AI Expander state
    const [isExpanding, setIsExpanding] = useState(false);

    // [New] Resolved assets state for IDB url support
    const [resolvedAssets, setResolvedAssets] = useState<{ id: string, name: string, url: string, type: string }[]>([]);

    // AI [NEW] Chat Intent state
    const [chatIntent, setChatIntent] = useState<'image' | 'prompt'>('image');

    // [New] Masking State
    const [currentMask, setCurrentMask] = useState<string | null>(null);

    // Clear mask when selected draft changes
    useEffect(() => {
        setCurrentMask(null);
    }, [selectedDraft]);

    // Track if modal was previously open to allow single-shot initialization
    const wasOpenRef = useRef(false);

    // Initialize from initial values
    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            setDescription(initialDescription);
            if (initialReferenceImage) {
                setTaggedReferences([{
                    id: `ref-${Date.now()}`,
                    url: initialReferenceImage,
                    category: 'style'
                }]);
            }
            if (initialDraftImage) {
                setDraftHistory([initialDraftImage]);
                setSelectedDraft(initialDraftImage);
            }
            wasOpenRef.current = true;
        } else if (!isOpen) {
            wasOpenRef.current = false;
        }
    }, [isOpen, initialDescription, initialReferenceImage, initialDraftImage]);

    // [New] Resolve existing assets URLs
    useEffect(() => {
        const resolveIds = async () => {
            if (!existingAssets || existingAssets.length === 0) {
                setResolvedAssets([]);
                return;
            }

            try {
                const { resolveUrl } = await import('../utils/imageStorage');
                // We only need to resolve idb:// urls. Data/Blob urls are fine.
                const resolved = await Promise.all(existingAssets.map(async (asset) => {
                    if (asset.url.startsWith('idb://')) {
                        const blobUrl = await resolveUrl(asset.url);
                        return { ...asset, url: blobUrl || asset.url };
                    }
                    return asset;
                }));
                setResolvedAssets(resolved);
            } catch (err) {
                console.error("Failed to resolve asset URLs:", err);
                setResolvedAssets(existingAssets); // Fallback
            }
        };

        if (isOpen) {
            resolveIds();
        }
    }, [isOpen, existingAssets]);

    // Auto-translate description to Korean (debounced)
    useEffect(() => {
        if (!description || description.trim().length < 5) { // Lowered threshold (10 -> 5)
            setKoreanTranslation('');
            return;
        }

        const timer = setTimeout(async () => {
            await performTranslation();
        }, 800); // Shorter debounce (1500 -> 800)

        return () => clearTimeout(timer);
    }, [description, apiKey]);

    // Shared translation logic
    const performTranslation = async () => {
        if (!description || description.trim().length < 2) return;

        setIsTranslating(true);
        try {
            const { generateText } = await import('../services/gemini');
            const translation = await generateText(
                `Translate this English text to Korean. Only output the Korean translation, nothing else:\n\n${description}`,
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
            // Don't clear the old one if it failed, just log it
        } finally {
            setIsTranslating(false);
        }
    };

    // Handle reference image upload
    const handleAddReference = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            const newRef: TaggedReference = {
                id: `ref-${Date.now()}`,
                url: base64,
                category: 'style'
            };
            setTaggedReferences(prev => [...prev, newRef]);
        };
        reader.readAsDataURL(file);
    };

    // Update reference category
    const handleUpdateRefCategory = (id: string, category: TaggedReference['category']) => {
        setTaggedReferences(prev =>
            prev.map(ref => ref.id === id ? { ...ref, category } : ref)
        );
    };

    // Remove reference
    const handleRemoveRef = (id: string) => {
        setTaggedReferences(prev => prev.filter(ref => ref.id !== id));
    };

    // Crop a reference image
    const handleCropRef = (refId: string, refUrl: string) => {
        setImageToCrop(refUrl);
        setShowCropModal(true);
        // Store ref ID to update after crop
        (window as any).__cropRefId = refId;
    };

    // AI Expand: Analyze ALL reference images by their category and enhance prompt
    const handleAIExpand = async () => {
        if (taggedReferences.length === 0) {
            alert('Add reference images first to use AI Expander.');
            return;
        }

        setIsExpanding(true);
        try {
            // Use arrays to collect ALL analyses per category
            const categoryAnalyses: Record<string, string[]> = {};

            // Process each reference image by its category
            for (let i = 0; i < taggedReferences.length; i++) {
                const ref = taggedReferences[i];
                const matches = ref.url.match(/^data:(.+);base64,(.+)$/);
                if (!matches) {
                    console.warn(`Reference ${i + 1} skipped: not a data URL`);
                    continue;
                }

                // Category-specific analysis prompts
                const categoryInstructions: Record<string, string> = {
                    face: 'Focus ONLY on facial features: face shape, eyes (color, shape), eyebrows, nose, lips, skin tone, facial expression. Be very detailed.',
                    body: 'Focus ONLY on body type and build: height impression, body shape, musculature, posture, proportions. Be very detailed.',
                    costume: 'Focus ONLY on clothing and outfit: garment types, materials, textures, colors, patterns, accessories, how they drape or fit. Be very detailed.',
                    props: 'Focus ONLY on objects and props: what they are, materials, colors, details, how they are held or positioned. Be very detailed.',
                    style: 'Focus ONLY on the artistic style: art style (photorealistic, anime, etc.), rendering technique, overall aesthetic, medium. Be very detailed.',
                    color: 'Focus ONLY on the color palette: dominant colors, color harmony, saturation, contrast, color mood. Be very detailed.',
                    pose: 'Focus ONLY on the pose and body position: stance, gesture, limb positions, camera angle, dynamic vs static, expression of movement. Be very detailed.'
                };

                const instruction = categoryInstructions[ref.category] || 'Describe the key visual elements in detail.';

                try {
                    const { generateText } = await import('../services/gemini');
                    const analysisResult = await generateText(
                        `Analyze this reference image for AI image generation. ${instruction} Output ONLY the descriptive text for this category, nothing else. Write in English.`,
                        apiKey,
                        undefined,
                        [{ mimeType: matches[1], data: matches[2] }],
                        undefined,
                        { temperature: 0.7 }
                    );

                    if (analysisResult) {
                        // Collect all analyses per category as array
                        if (!categoryAnalyses[ref.category]) {
                            categoryAnalyses[ref.category] = [];
                        }
                        categoryAnalyses[ref.category].push(analysisResult.trim());
                        console.log(`Reference ${i + 1} (${ref.category}) analyzed successfully`);
                    }
                } catch (refError) {
                    console.error(`Failed to analyze reference ${i + 1}:`, refError);
                }
            }

            // Build structured prompt enhancement from arrays
            const categoryOrder = ['face', 'body', 'costume', 'props', 'pose', 'style', 'color'];
            const enhancementParts: string[] = [];

            for (const cat of categoryOrder) {
                if (categoryAnalyses[cat] && categoryAnalyses[cat].length > 0) {
                    const categoryLabel = REFERENCE_CATEGORIES.find(c => c.value === cat)?.label || cat;
                    if (categoryAnalyses[cat].length === 1) {
                        // Single reference for this category
                        enhancementParts.push(`[${categoryLabel}]: ${categoryAnalyses[cat][0]}`);
                    } else {
                        // Multiple references for this category - number them
                        const multiParts = categoryAnalyses[cat].map((text, idx) => `  (${idx + 1}) ${text}`).join('\n');
                        enhancementParts.push(`[${categoryLabel}]:\n${multiParts}`);
                    }
                }
            }

            // Add any remaining categories not in the order list
            for (const cat of Object.keys(categoryAnalyses)) {
                if (!categoryOrder.includes(cat) && categoryAnalyses[cat] && categoryAnalyses[cat].length > 0) {
                    const categoryLabel = REFERENCE_CATEGORIES.find(c => c.value === cat)?.label || cat;
                    if (categoryAnalyses[cat].length === 1) {
                        enhancementParts.push(`[${categoryLabel}]: ${categoryAnalyses[cat][0]}`);
                    } else {
                        const multiParts = categoryAnalyses[cat].map((text, idx) => `  (${idx + 1}) ${text}`).join('\n');
                        enhancementParts.push(`[${categoryLabel}]:\n${multiParts}`);
                    }
                }
            }

            if (enhancementParts.length > 0) {
                const referenceDetails = enhancementParts.join('\n\n');

                // [NEW] Synthesize everything using enhancePrompt service
                // This combines the current description, the new reference details, AND the full project context
                try {
                    const { enhancePrompt } = await import('../services/gemini');

                    // Construct a base prompt that includes the newly analyzed references
                    const basePrompt = description
                        ? `${description}\n\n--- Visual References Analysis ---\n${referenceDetails}`
                        : referenceDetails;

                    // Call the same enhance function as the main page, injecting the logic
                    // Mapping assetType to what enhancePrompt expects ('character' | 'location' | 'style')
                    const aiType = (assetType === 'prop' ? 'character' : assetType) as 'character' | 'location' | 'style';

                    const enhanced = await enhancePrompt(
                        basePrompt,
                        aiType,
                        projectContext || `Master Style: ${masterStyle || ''}`, // Fallback context
                        apiKey
                    );

                    setDescription(enhanced);
                } catch (enhanceError) {
                    console.error("Synthesis failed, falling back to append:", enhanceError);
                    // Fallback to simple append
                    setDescription(prev => prev ? `${prev}\n\n--- Reference Details ---\n${referenceDetails}` : referenceDetails);
                }
            }

        } catch (error) {
            console.error('AI Expand failed:', error);
            alert('AI Expand failed. Please try again.');
        } finally {
            setIsExpanding(false);
        }
    };

    // Generate draft candidates
    const handleGenerate = async () => {
        if (!description) return;
        setIsGenerating(true);

        try {
            const { generateImage } = await import('../services/imageGen');
            const { cleanPromptForGeneration } = await import('../utils/promptUtils');
            const { resolveUrl } = await import('../utils/imageStorage');

            // Build prompt with reference categories
            let prompt = description;
            if (masterStyle) {
                prompt = `[Master Style: ${masterStyle}]\n\n${prompt}`;
            }

            // Add reference category hints
            const categoryHints = taggedReferences.map(ref => {
                const label = REFERENCE_CATEGORIES.find(c => c.value === ref.category)?.label || ref.category;
                return `[${label} reference provided]`;
            }).join(' ');
            if (categoryHints) {
                prompt = `${categoryHints}\n\n${prompt}`;
            }

            const cleanedPrompt = cleanPromptForGeneration(prompt);
            const refImages = taggedReferences.map(r => r.url);

            const result = await generateImage(
                cleanedPrompt,
                apiKey,
                refImages.length > 0 ? refImages : undefined,
                aspectRatio,
                'gemini-3-pro-image-preview',
                draftCount
            );

            // Resolve and ADD to history (not replace)
            const resolvedUrls = await Promise.all(
                result.urls.map(url => resolveUrl(url))
            );
            const newDrafts = resolvedUrls.map((url, i) => url || result.urls[i]);

            setDraftHistory(prev => [...prev, ...newDrafts]);

            // Auto-select first new draft
            if (newDrafts.length > 0) {
                setSelectedDraft(newDrafts[0]);
            }
        } catch (error: any) {
            console.error('Generation failed:', error);
            alert(`Generation failed: ${error.message || 'Unknown error'}`);
        } finally {
            setIsGenerating(false);
        }
    };

    // Handle AI Chat send
    const handleChatSend = async () => {
        if (!chatInput.trim()) return;

        const userMessage: ChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'user',
            content: chatInput,
            timestamp: Date.now()
        };
        setChatMessages(prev => [...prev, userMessage]);
        setChatInput('');
        setIsChatLoading(true);

        try {
            // Determine mode. Use explicit chatIntent instead of keyword detection.
            const isEditMode = chatIntent === 'image';

            const resetKeywords = ['reset', 'restore', 'original', 'initial', 'revert', '초기화', '원래대로', '복원', '처음', '되돌리'];
            const isResetRequest = resetKeywords.some(kw => chatInput.toLowerCase().includes(kw));

            if (isResetRequest) {
                handleResetToOriginal();
                const assistantMessage: ChatMessage = {
                    id: `msg-${Date.now()}`,
                    role: 'assistant',
                    content: '프롬프트를 최초 상태로 복원했습니다.',
                    timestamp: Date.now()
                };
                setChatMessages(prev => [...prev, assistantMessage]);
                setChatInput('');
                setIsChatLoading(false);
                return;
            }


            if (isEditMode && selectedDraft) {
                // IMAGE EDIT MODE - Send image + instruction + references
                const { editImageWithChat } = await import('../services/imageGen');
                const refImages = taggedReferences.map(r => r.url);
                const result = await editImageWithChat(selectedDraft, chatInput, apiKey, currentMask, refImages);

                if (result.image) {
                    setDraftHistory(prev => [...prev, result.image!]);
                    setSelectedDraft(result.image);
                }

                const assistantMessage: ChatMessage = {
                    id: `msg-${Date.now()}`,
                    role: 'assistant',
                    content: result.explanation || '이미지를 수정했습니다.',
                    image: result.image,
                    timestamp: Date.now()
                };
                setChatMessages(prev => [...prev, assistantMessage]);
            } else {
                // PROMPT REFINEMENT MODE
                const { generateText } = await import('../services/gemini');
                const reply = await generateText(
                    chatInput,
                    apiKey,
                    undefined,
                    taggedReferences.map(ref => ({
                        mimeType: "image/jpeg",
                        data: ref.url.split(',')[1] || ""
                    })),
                    `You are a visual prompt engineer for AI image generation. 
Help the user refine, clean up, and deduplicate their English prompt. 
They may write in Korean.

Current prompt: ${description}
Asset type: ${assetType}
Master style: ${masterStyle || 'Not defined'}
References available: ${taggedReferences.map(r => r.category).join(', ') || 'None'}

Your goal:
1. Remove redundant or overlapping keywords (e.g., if "realistic" and "photorealistic" are both present, keep one).
2. Organize the prompt logically (Subject -> Details -> Style -> Lighting).
3. If the user refers to references (e.g., "like the character"), incorporate their names into the prompt naturally.

Output Format:
SUGGESTED_PROMPT: [your improved English prompt]
설명: [Concise Korean summary of what you cleaned up/changed]`,
                    { temperature: 0.7 }
                );

                const assistantMessage: ChatMessage = {
                    id: `msg-${Date.now()}`,
                    role: 'assistant',
                    content: reply,
                    timestamp: Date.now()
                };
                setChatMessages(prev => [...prev, assistantMessage]);

                // Extract suggested prompt if present
                const promptMatch = reply.match(/SUGGESTED_PROMPT:\s*(.+?)(?:\n|설명:|$)/s);
                if (promptMatch) {
                    // Show apply button in the message
                }
            }
        } catch (error) {
            console.error('Chat failed:', error);
            const errorMessage: ChatMessage = {
                id: `msg-${Date.now()}`,
                role: 'assistant',
                content: 'Error processing your request. Please try again.',
                timestamp: Date.now()
            };
            setChatMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsChatLoading(false);
        }
    };

    // Apply suggested prompt from chat
    const handleApplyPrompt = (suggestedPrompt: string) => {
        // Clean up markdown code blocks and backticks
        const cleaned = suggestedPrompt
            .replace(/```[a-z]*\n?/gi, '')
            .replace(/```/g, '')
            .trim();
        setDescription(cleaned);
    };

    // Reset prompt to initial default state
    const handleResetToOriginal = () => {
        if (confirm('최초의 기본 프롬프트로 복원하시겠습니까?')) {
            setDescription(initialDescription);
            setKoreanTranslation(''); // Reset translation too
        }
    };

    // Handle crop
    const handleCropSelected = () => {
        if (selectedDraft) {
            setImageToCrop(selectedDraft);
            setShowCropModal(true);
        }
    };

    const handleCropConfirm = (croppedImage: string) => {
        // Check if we're cropping a reference
        const refId = (window as any).__cropRefId;
        if (refId) {
            setTaggedReferences(prev =>
                prev.map(ref => ref.id === refId ? { ...ref, url: croppedImage } : ref)
            );
            delete (window as any).__cropRefId;
        } else {
            // Regular draft crop
            setDraftHistory(prev => [...prev, croppedImage]);
            setSelectedDraft(croppedImage);
        }
        setShowCropModal(false);
        setImageToCrop(null);
    };

    // Clear history
    const handleClearHistory = () => {
        if (confirm('Clear all draft history?')) {
            setDraftHistory([]);
            setSelectedDraft(null);
        }
    };

    // Save and close
    const handleSave = () => {
        onSave({
            description,
            taggedReferences,
            selectedDraft,
            draftHistory
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-2">
            <div className="w-[98vw] h-[96vh] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[var(--color-primary)] text-black rounded-lg">
                            <Wand2 size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{assetName}</h2>
                            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Asset Generation Studio</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel: History + References */}
                    <div className="w-64 border-r border-[var(--color-border)] flex flex-col bg-black/20">
                        {/* Draft History */}
                        <div className="flex-1 p-4 overflow-y-auto">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Draft History</h3>
                                {draftHistory.length > 0 && (
                                    <button onClick={handleClearHistory} className="text-[10px] text-red-400 hover:text-red-300">
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {draftHistory.map((url, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedDraft(url)}
                                        className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${selectedDraft === url
                                            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30'
                                            : 'border-transparent hover:border-white/20'
                                            }`}
                                    >
                                        <img src={url} alt="" className="w-full h-full object-cover" />
                                    </button>
                                ))}
                                {draftHistory.length === 0 && (
                                    <div className="col-span-2 py-8 text-center text-gray-600 text-sm">
                                        No drafts yet
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* References */}
                        <div className="p-4 border-t border-[var(--color-border)]">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">References</h3>
                                <div className="flex items-center gap-1">
                                    {/* Pick from existing sources */}
                                    {(draftHistory.length > 0 || initialReferenceImage || (existingAssets && existingAssets.length > 0)) && (
                                        <button
                                            onClick={() => setShowRefPicker(!showRefPicker)}
                                            className={`p-1 rounded ${showRefPicker ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-gray-400'}`}
                                            title="Add from existing images"
                                        >
                                            <Image size={14} className={showRefPicker ? "text-white" : "text-blue-400"} />
                                        </button>
                                    )}
                                    {/* Upload new */}
                                    <label className="cursor-pointer p-1 hover:bg-white/10 rounded" title="Upload image">
                                        <Plus size={14} className="text-[var(--color-primary)]" />
                                        <input type="file" accept="image/*" onChange={handleAddReference} className="hidden" />
                                    </label>
                                </div>
                            </div>

                            {/* Reference Picker */}
                            {showRefPicker && (
                                <div className="mb-3 p-2 bg-black/40 border border-white/10 rounded-lg">
                                    {/* Tabs */}
                                    <div className="flex gap-2 mb-2 border-b border-white/10 pb-1">
                                        <button
                                            onClick={() => setPickerTab('drafts')}
                                            className={`text-[10px] px-2 py-0.5 rounded ${pickerTab === 'drafts' ? 'bg-[var(--color-primary)] text-black font-bold' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            Drafts
                                        </button>
                                        <button
                                            onClick={() => setPickerTab('assets')}
                                            className={`text-[10px] px-2 py-0.5 rounded ${pickerTab === 'assets' ? 'bg-[var(--color-primary)] text-black font-bold' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            Assets ({existingAssets?.length || 0})
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-3 gap-1 max-h-32 overflow-y-auto">
                                        {/* DRAFTS TAB */}
                                        {pickerTab === 'drafts' && (
                                            <>
                                                {initialReferenceImage && (
                                                    <button
                                                        onClick={() => {
                                                            const newRef: TaggedReference = { id: `ref-${Date.now()}`, url: initialReferenceImage, category: 'style' };
                                                            setTaggedReferences(prev => [...prev, newRef]);
                                                            setShowRefPicker(false);
                                                        }}
                                                        className="aspect-square rounded overflow-hidden border-2 border-green-400/50 hover:border-green-400 relative"
                                                    >
                                                        <img src={initialReferenceImage} alt="" className="w-full h-full object-cover" />
                                                        <span className="absolute bottom-0 left-0 right-0 bg-green-500/80 text-[8px] text-white text-center py-0.5">Original</span>
                                                    </button>
                                                )}
                                                {draftHistory.map((url, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => {
                                                            const newRef: TaggedReference = { id: `ref-${Date.now()}`, url: url, category: 'style' };
                                                            setTaggedReferences(prev => [...prev, newRef]);
                                                            setShowRefPicker(false);
                                                        }}
                                                        className="aspect-square rounded overflow-hidden border border-white/10 hover:border-blue-400"
                                                    >
                                                        <img src={url} alt="" className="w-full h-full object-cover" />
                                                    </button>
                                                ))}
                                                {draftHistory.length === 0 && !initialReferenceImage && (
                                                    <div className="col-span-3 text-[10px] text-gray-500 text-center py-2">No drafts available</div>
                                                )}
                                            </>
                                        )}

                                        {/* ASSETS TAB */}
                                        {pickerTab === 'assets' && (
                                            <>
                                                {resolvedAssets.map((asset) => (
                                                    <button
                                                        key={asset.id}
                                                        onClick={() => {
                                                            const newRef: TaggedReference = {
                                                                id: `ref-${Date.now()}`,
                                                                url: asset.url,
                                                                category: (asset.type === 'character' ? 'face' : asset.type === 'location' ? 'style' : 'props') as any
                                                            };
                                                            setTaggedReferences(prev => [...prev, newRef]);
                                                            setShowRefPicker(false);
                                                        }}
                                                        className="aspect-square rounded overflow-hidden border border-white/10 hover:border-blue-400 relative group"
                                                        title={asset.name}
                                                    >
                                                        <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                                                        <div className="absolute inset-x-0 bottom-0 bg-black/70 p-0.5 text-[8px] text-white truncate text-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {asset.name}
                                                        </div>
                                                    </button>
                                                ))}
                                                {(!resolvedAssets || resolvedAssets.length === 0) && (
                                                    <div className="col-span-3 text-[10px] text-gray-500 text-center py-2">No other assets found</div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2 max-h-32 overflow-y-auto">
                                {taggedReferences.map(ref => (
                                    <div key={ref.id} className="flex items-center gap-2 p-2 bg-black/30 rounded-lg">
                                        <img src={ref.url} alt="" className="w-10 h-10 rounded object-cover" />
                                        <select
                                            value={ref.category}
                                            onChange={(e) => handleUpdateRefCategory(ref.id, e.target.value as any)}
                                            className="flex-1 bg-black border border-white/10 rounded px-1 py-0.5 text-[10px] text-white"
                                        >
                                            {REFERENCE_CATEGORIES.map(cat => (
                                                <option key={cat.value} value={cat.value} className="bg-black text-white">{cat.label}</option>
                                            ))}
                                        </select>
                                        <button onClick={() => handleCropRef(ref.id, ref.url)} className="p-1 text-gray-500 hover:text-blue-400" title="Crop">
                                            <Crop size={12} />
                                        </button>
                                        <button onClick={() => handleRemoveRef(ref.id)} className="p-1 text-gray-500 hover:text-red-400" title="Remove">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                                {taggedReferences.length === 0 && (
                                    <div className="py-4 text-center text-gray-600 text-xs">
                                        Add reference images
                                    </div>
                                )}
                            </div>

                            {/* AI Expander & Reset Buttons */}
                            {taggedReferences.length > 0 && (
                                <div className="flex gap-2 mt-2">
                                    <button
                                        onClick={handleAIExpand}
                                        disabled={isExpanding}
                                        className="flex-1 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1 disabled:opacity-50"
                                    >
                                        {isExpanding ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                        <span className="text-center leading-tight">
                                            참조활용<br />AI 프롬프트 강화
                                        </span>
                                    </button>
                                    <button
                                        onClick={handleResetToOriginal}
                                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-gray-300 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors h-auto min-h-[40px]"
                                        title="원본 프롬프트로 복원"
                                    >
                                        <RotateCcw size={12} />
                                        <span className="text-center leading-tight">
                                            원본 프롬프트로<br />되돌리기
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Generate Button */}
                        <div className="p-4 border-t border-[var(--color-border)]">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] text-gray-500">Count:</span>
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setDraftCount(n)}
                                            className={`w-6 h-6 text-xs rounded ${draftCount === n ? 'bg-[var(--color-primary)] text-black' : 'bg-white/10 text-gray-400'}`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={handleGenerate}
                                disabled={isGenerating || !description}
                                className="w-full py-2 bg-[var(--color-primary)] text-black font-bold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                {isGenerating ? 'Generating...' : 'Generate'}
                            </button>
                        </div>
                    </div>

                    {/* Center: Canvas/Preview */}
                    <div className="flex-1 flex flex-col">
                        <div className="flex-1 p-6 flex items-center justify-center bg-black/30">
                            {selectedDraft ? (
                                <div className="w-full h-full relative overflow-hidden bg-black/50 rounded-lg">
                                    <InteractiveImageViewer
                                        src={selectedDraft}
                                        onMaskChange={setCurrentMask}
                                        onCrop={handleCropSelected}
                                        onClose={() => setSelectedDraft(null)}
                                        className="absolute inset-0 w-full h-full"
                                    />
                                </div>
                            ) : (
                                <div className="text-center text-gray-600">
                                    <ImageIcon size={64} className="mx-auto mb-4 opacity-30" />
                                    <p className="text-sm">Generate drafts or select from history</p>
                                </div>
                            )}
                        </div>

                        {/* Prompt Editor */}
                        <div className="p-4 border-t border-[var(--color-border)]">
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white text-sm min-h-[80px] focus:border-[var(--color-primary)] outline-none resize-none"
                                placeholder="Describe the visual in English..."
                            />
                            {/* Korean Translation */}
                            {(koreanTranslation || isTranslating) && (
                                <div className="mt-2 p-2 bg-black/20 rounded-lg border border-white/5 max-h-24 overflow-y-auto">
                                    <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-1 sticky top-0 bg-black/20">
                                        <Tag size={10} />
                                        한글 번역
                                        {isTranslating && <Loader2 size={10} className="animate-spin" />}
                                        {!isTranslating && (
                                            <button
                                                onClick={() => performTranslation()}
                                                className="ml-auto hover:text-[var(--color-primary)] transition-colors flex items-center gap-1"
                                                title="번역 새로고침"
                                            >
                                                <RotateCcw size={8} />
                                                Retry
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400">{koreanTranslation || '번역 중...'}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Panel: AI Chat (AI 편집팀장) */}
                    <div className="w-80 border-l border-[var(--color-border)] flex flex-col bg-black/20">
                        {/* 1. Header & Mode Selection */}
                        <div className="p-4 border-b border-[var(--color-border)] bg-black/10">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={16} className="text-[var(--color-primary)]" />
                                    <h3 className="text-sm font-bold text-white">AI 편집팀장</h3>
                                </div>
                                <div className="text-[10px] px-2 py-0.5 bg-white/5 rounded text-gray-400">
                                    {chatIntent === 'image' ? 'IMAGE EDIT' : 'PROMPT REFINE'}
                                </div>
                            </div>

                            {/* Intent Selector (Segmented Toggle) */}
                            <div className="flex gap-1 p-1 bg-black/40 rounded-lg">
                                <button
                                    onClick={() => setChatIntent('image')}
                                    className={`flex-1 py-1.5 text-[10px] rounded-md transition-all flex items-center justify-center gap-1.5 ${chatIntent === 'image' ? 'bg-[var(--color-primary)] text-black font-bold shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                >
                                    <Image size={12} />
                                    이미지 수정
                                </button>
                                <button
                                    onClick={() => setChatIntent('prompt')}
                                    className={`flex-1 py-1.5 text-[10px] rounded-md transition-all flex items-center justify-center gap-1.5 ${chatIntent === 'prompt' ? 'bg-[var(--color-primary)] text-black font-bold shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                >
                                    <Plus size={12} />
                                    프롬프트 정제
                                </button>
                            </div>
                        </div>

                        {/* 2. Command Input Area (At the Top) */}
                        <div className="p-4 border-b border-[var(--color-border)] space-y-3 bg-white/5">
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">수정 지시사항</label>
                                <textarea
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    placeholder={chatIntent === 'image' ? "예: 더 사실적으로 묘사하도록 수정해줘." : "예: 프롬프트를 간결하게 정리하고 스타일 보강해줘."}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-[var(--color-primary)] outline-none resize-none h-24 transition-all"
                                />
                            </div>
                            <button
                                onClick={handleChatSend}
                                disabled={isChatLoading || !chatInput.trim()}
                                className="w-full py-2.5 bg-[var(--color-primary)] text-black font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:brightness-110 active:scale-[0.98] transition-all"
                            >
                                {isChatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                {isChatLoading ? '분석 중...' : '명령 실행'}
                            </button>
                        </div>

                        {/* 3. AI Responses (Scrollable History at the Bottom) */}
                        <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto space-y-4 bg-black/5 custom-scrollbar">
                            <div className="text-[10px] text-gray-600 font-bold uppercase tracking-widest text-center mb-2">실행 결과 히스토리</div>

                            {chatMessages.length === 0 && (
                                <div className="text-center py-10 opacity-30">
                                    <MessageSquare size={32} className="mx-auto mb-2" />
                                    <p className="text-[10px]">위에서 명령을 입력하면<br />결과가 여기에 표시됩니다.</p>
                                </div>
                            )}

                            {chatMessages.map(msg => (
                                <div key={msg.id} className="space-y-1.5">
                                    {msg.role === 'user' ? (
                                        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-gray-500 font-bold bg-white/5 rounded w-fit">
                                            <Send size={8} />
                                            명령: {msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content}
                                        </div>
                                    ) : (
                                        <div className="max-w-[100%] w-full bg-white/5 border border-white/5 p-3 rounded-xl text-[13px] text-gray-300 leading-relaxed shadow-sm mb-4">
                                            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold text-[var(--color-primary)] uppercase">
                                                <Sparkles size={10} />
                                                AI Team Leader Result
                                            </div>
                                            <p className="whitespace-pre-wrap">{msg.content}</p>
                                            {msg.image && (
                                                <img src={msg.image} alt="" className="mt-2 rounded-lg max-w-full border border-white/10" />
                                            )}
                                            {/* Apply button for suggested prompts */}
                                            {msg.role === 'assistant' && msg.content.includes('SUGGESTED_PROMPT:') && (
                                                <button
                                                    onClick={() => {
                                                        const match = msg.content.match(/SUGGESTED_PROMPT:\s*([\s\S]+?)(?=\s*설명:|$)/i);
                                                        if (match) handleApplyPrompt(match[1].trim());
                                                    }}
                                                    className="mt-3 w-full py-2 bg-[var(--color-primary)] text-black text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 hover:brightness-110 transition-all"
                                                >
                                                    <Check size={14} /> 최종 프롬프트로 적용하기
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {isChatLoading && (
                                <div className="flex justify-start animate-pulse">
                                    <div className="bg-white/5 p-4 rounded-xl w-full border border-white/5">
                                        <div className="h-2 w-20 bg-white/10 rounded mb-2"></div>
                                        <div className="h-10 w-full bg-white/5 rounded"></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)]">
                    <button onClick={onClose} className="px-6 py-2 text-gray-400 hover:text-white">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-[var(--color-primary)] text-black font-bold rounded-lg flex items-center gap-2"
                    >
                        <Check size={18} />
                        Save & Close
                    </button>
                </div>
            </div>

            {/* Crop Modal */}
            {showCropModal && imageToCrop && (
                <ImageCropModal
                    imageSrc={imageToCrop}
                    onConfirm={handleCropConfirm}
                    onCancel={() => { setShowCropModal(false); setImageToCrop(null); }}
                    aspectRatio={aspectRatio}
                />
            )}
        </div>
    );
};
