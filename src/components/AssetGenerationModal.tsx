import React, { useState, useEffect, useRef } from 'react';
import {
    X, Wand2, Loader2, ImageIcon, Plus, Trash2,
    MessageSquare, Send, Crop, RotateCcw, Check, Tag, Image, Sparkles
} from 'lucide-react';
import { ImageCropModal } from './ImageCropModal';

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

    // AI Expander state
    const [isExpanding, setIsExpanding] = useState(false);

    // Initialize from initial values
    useEffect(() => {
        if (isOpen) {
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
        }
    }, [isOpen, initialDescription, initialReferenceImage, initialDraftImage]);

    // Auto-translate description to Korean (debounced)
    useEffect(() => {
        if (!description || description.length < 10) {
            setKoreanTranslation('');
            return;
        }

        const timer = setTimeout(async () => {
            setIsTranslating(true);
            try {
                // Simple translation via Gemini
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{ text: `Translate this English text to Korean. Only output the Korean translation, nothing else:\n\n${description}` }]
                            }]
                        })
                    }
                );
                const data = await response.json();
                const translation = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                setKoreanTranslation(translation.trim());
            } catch (error) {
                console.error('Translation failed:', error);
            } finally {
                setIsTranslating(false);
            }
        }, 1500);

        return () => clearTimeout(timer);
    }, [description, apiKey]);

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
                    const response = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{
                                    parts: [
                                        { text: `Analyze this reference image for AI image generation. ${instruction} Output ONLY the descriptive text for this category, nothing else. Write in English.` },
                                        { inlineData: { mimeType: matches[1], data: matches[2] } }
                                    ]
                                }]
                            })
                        }
                    );

                    const data = await response.json();
                    const analysisResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
            // Determine mode based on selected draft
            const isEditMode = !!selectedDraft;

            if (isEditMode && selectedDraft) {
                // IMAGE EDIT MODE - Send image + instruction
                const { editImageWithChat } = await import('../services/imageGen');
                const result = await editImageWithChat(selectedDraft, chatInput, apiKey);

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
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            systemInstruction: {
                                parts: [{
                                    text: `You are a visual prompt engineer for AI image generation.
Help the user refine their English prompt. They may write in Korean.
Current prompt: ${description}
Asset type: ${assetType}
Master style: ${masterStyle || 'Not defined'}

When suggesting improvements, format as:
SUGGESTED_PROMPT: [your improved English prompt]
설명: [Korean explanation]`
                                }]
                            },
                            contents: [{ parts: [{ text: chatInput }] }]
                        })
                    }
                );

                const data = await response.json();
                const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not process that.';

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
        setDescription(suggestedPrompt);
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
                                    {(draftHistory.length > 0 || initialReferenceImage) && (
                                        <button
                                            onClick={() => setShowRefPicker(!showRefPicker)}
                                            className="p-1 hover:bg-white/10 rounded"
                                            title="Add from existing images"
                                        >
                                            <Image size={14} className="text-blue-400" />
                                        </button>
                                    )}
                                    {/* Upload new */}
                                    <label className="cursor-pointer p-1 hover:bg-white/10 rounded" title="Upload image">
                                        <Plus size={14} className="text-[var(--color-primary)]" />
                                        <input type="file" accept="image/*" onChange={handleAddReference} className="hidden" />
                                    </label>
                                </div>
                            </div>

                            {/* Reference Picker from Drafts and Initial Reference */}
                            {showRefPicker && (draftHistory.length > 0 || initialReferenceImage) && (
                                <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                                    <p className="text-[10px] text-blue-400 mb-2">Select from available images:</p>
                                    <div className="grid grid-cols-3 gap-1">
                                        {/* Show initial reference from Step 2 first */}
                                        {initialReferenceImage && (
                                            <button
                                                onClick={() => {
                                                    const newRef: TaggedReference = {
                                                        id: `ref-${Date.now()}`,
                                                        url: initialReferenceImage,
                                                        category: 'style'
                                                    };
                                                    setTaggedReferences(prev => [...prev, newRef]);
                                                    setShowRefPicker(false);
                                                }}
                                                className="aspect-square rounded overflow-hidden border-2 border-green-400/50 hover:border-green-400 relative"
                                            >
                                                <img src={initialReferenceImage} alt="" className="w-full h-full object-cover" />
                                                <span className="absolute bottom-0 left-0 right-0 bg-green-500/80 text-[8px] text-white text-center py-0.5">Original</span>
                                            </button>
                                        )}
                                        {/* Show drafts */}
                                        {draftHistory.map((url, i) => (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    const newRef: TaggedReference = {
                                                        id: `ref-${Date.now()}`,
                                                        url: url,
                                                        category: 'style'
                                                    };
                                                    setTaggedReferences(prev => [...prev, newRef]);
                                                    setShowRefPicker(false);
                                                }}
                                                className="aspect-square rounded overflow-hidden border border-white/10 hover:border-blue-400"
                                            >
                                                <img src={url} alt="" className="w-full h-full object-cover" />
                                            </button>
                                        ))}
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

                            {/* AI Expander Button */}
                            {taggedReferences.length > 0 && (
                                <button
                                    onClick={handleAIExpand}
                                    disabled={isExpanding}
                                    className="w-full mt-2 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold rounded flex items-center justify-center gap-1 disabled:opacity-50"
                                >
                                    {isExpanding ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                    {isExpanding ? 'Analyzing...' : 'AI Expand from Reference'}
                                </button>
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
                                <div className="relative max-w-full max-h-full">
                                    <img src={selectedDraft} alt="" className="max-w-full max-h-[50vh] object-contain rounded-lg shadow-xl" />
                                    {/* Toolbar */}
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/60 backdrop-blur-md rounded-full px-4 py-2">
                                        <button onClick={handleCropSelected} className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-full" title="Crop">
                                            <Crop size={18} />
                                        </button>
                                        <button onClick={() => setSelectedDraft(null)} className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-full" title="Deselect">
                                            <RotateCcw size={18} />
                                        </button>
                                    </div>
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
                                    </div>
                                    <p className="text-xs text-gray-400">{koreanTranslation || '번역 중...'}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Panel: AI Chat */}
                    <div className="w-80 border-l border-[var(--color-border)] flex flex-col bg-black/20">
                        <div className="p-4 border-b border-[var(--color-border)]">
                            <div className="flex items-center gap-2">
                                <MessageSquare size={16} className="text-[var(--color-primary)]" />
                                <h3 className="text-sm font-bold text-white">AI Assistant</h3>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">
                                {selectedDraft ? '이미지 수정 모드 (Edit Mode)' : '프롬프트 도움 모드 (Prompt Mode)'}
                            </p>
                        </div>

                        {/* Chat Messages */}
                        <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto space-y-3">
                            {chatMessages.length === 0 && (
                                <div className="text-center text-gray-600 py-8">
                                    <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-xs mb-3">
                                        {selectedDraft
                                            ? '"머리카락 색상 바꿔줘" 같이 수정 요청'
                                            : '프롬프트 수정 도움 요청'}
                                    </p>
                                    {!selectedDraft && (
                                        <div className="text-[10px] text-gray-500 space-y-1">
                                            <p>💡 "더 신비롭게 만들어줘"</p>
                                            <p>💡 "사이버펑크 스타일 추가"</p>
                                            <p>💡 "한글로 설명하면 영어로 바꿔줘"</p>
                                        </div>
                                    )}
                                    {selectedDraft && (
                                        <p className="text-[10px] text-gray-500 mt-2">
                                            ⚡ 이미지 선택 해제 → 프롬프트 수정 모드
                                        </p>
                                    )}
                                </div>
                            )}
                            {chatMessages.map(msg => (
                                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[90%] p-3 rounded-xl text-sm ${msg.role === 'user'
                                        ? 'bg-[var(--color-primary)] text-black'
                                        : 'bg-white/10 text-gray-300'
                                        }`}>
                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                        {msg.image && (
                                            <img src={msg.image} alt="" className="mt-2 rounded-lg max-w-full" />
                                        )}
                                        {/* Apply button for suggested prompts */}
                                        {msg.role === 'assistant' && msg.content.includes('SUGGESTED_PROMPT:') && (
                                            <button
                                                onClick={() => {
                                                    const match = msg.content.match(/SUGGESTED_PROMPT:\s*(.+?)(?:\n|설명:|$)/s);
                                                    if (match) handleApplyPrompt(match[1].trim());
                                                }}
                                                className="mt-2 px-3 py-1 bg-[var(--color-primary)] text-black text-xs font-bold rounded-lg flex items-center gap-1"
                                            >
                                                <Check size={12} /> 적용하기
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {isChatLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white/10 p-3 rounded-xl">
                                        <Loader2 size={16} className="animate-spin text-[var(--color-primary)]" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Chat Input */}
                        <div className="p-4 border-t border-[var(--color-border)]">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChatSend()}
                                    placeholder={selectedDraft ? "수정 요청..." : "프롬프트 도움 요청..."}
                                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[var(--color-primary)] outline-none"
                                />
                                <button
                                    onClick={handleChatSend}
                                    disabled={isChatLoading || !chatInput.trim()}
                                    className="p-2 bg-[var(--color-primary)] text-black rounded-lg disabled:opacity-50"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
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
