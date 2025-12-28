import React, { useState } from 'react';
import { useWorkflowStore } from '../store/workflowStore';
import { generateScript } from '../services/gemini';
import type { ScriptCut } from '../services/gemini';
import { generateImage } from '../services/imageGen';
import { useNavigate } from 'react-router-dom';
import { Wand2, Loader2, Image as ImageIcon, Mic, ArrowRight, Eye, Plus, X, Check, Lock, Unlock } from 'lucide-react';

export const Step4_Draft: React.FC = () => {
    const {
        seriesName, episodeName, targetDuration, styleAnchor, apiKeys,
        script, setScript, ttsModel, setTtsModel, imageModel, setImageModel, nextStep, assetDefinitions,
        episodePlot, characters, episodeCharacters, seriesLocations, episodeLocations, masterStyle, aspectRatio
    } = useWorkflowStore();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [localScript, setLocalScript] = useState<ScriptCut[]>(script);
    const [draftLoading, setDraftLoading] = useState<Record<number, boolean>>({});
    const [showAssetSelector, setShowAssetSelector] = useState<number | null>(null); // Cut ID for asset selector

    // Auto-save helper
    const saveToStore = (currentScript: ScriptCut[]) => {
        setScript(currentScript);
    };

    const TTS_MODELS = [
        { value: 'standard' as const, label: 'Standard', cost: '$', hint: 'Basic quality, lowest cost' },
        { value: 'wavenet' as const, label: 'WaveNet', cost: '$$', hint: 'High quality, moderate cost' },
        { value: 'neural2' as const, label: 'Neural2', cost: '$$$', hint: 'Premium quality, highest cost' },
    ];

    const IMAGE_MODELS = [
        { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash', cost: '$', hint: 'Fast, efficient' },
        { value: 'gemini-3.0-pro-image', label: 'Gemini 3.0 Pro', cost: '$$$', hint: 'High fidelity, premium' },
    ];

    const handleGenerateScript = async () => {
        setLoading(true);
        try {
            const allCharacters = [...(characters || []), ...(episodeCharacters || [])];
            const allLocations = [...(seriesLocations || []), ...(episodeLocations || [])];

            const generated = await generateScript(
                seriesName,
                episodeName,
                targetDuration,
                styleAnchor.prompts,
                apiKeys.gemini,
                episodePlot,
                allCharacters,
                allLocations
            );

            // Merge generated script with confirmed cuts
            const mergedScript = generated.map((newCut, index) => {
                const existingCut = localScript[index];
                if (existingCut && existingCut.isConfirmed) {
                    return existingCut;
                }
                return newCut;
            });

            // If existing script was longer, keep the extra confirmed cuts? 
            // For now, we'll stick to the generated length but prioritize confirmed content where indices match.

            setLocalScript(mergedScript);
            saveToStore(mergedScript); // Auto-save generated script
        } catch (error) {
            console.error(error);
            setLocalScript([
                { id: 1, speaker: 'Narrator', dialogue: 'In a world of pure imagination...', visualPrompt: 'Wide shot of a fantasy landscape, golden hour', estimatedDuration: 5 },
                { id: 2, speaker: 'Hero', dialogue: 'We have to keep moving.', visualPrompt: 'Close up of hero looking determined', estimatedDuration: 3 },
            ]);
        } finally {
            setLoading(false);
        }
    };

    // Helper function to check if asset name matches prompt
    const isNameMatch = (assetName: string, promptText: string): boolean => {
        const assetLower = assetName.toLowerCase().trim();
        const promptLower = promptText.toLowerCase();

        // Strategy: Match asset names with Korean particles (조사) support
        // e.g., "우영우" should match "우영우가", "우영우를", etc.

        // 1. Exact full match (highest priority)
        if (assetLower === promptLower) return true;

        // 2. Word boundary match with Korean particle support
        const escapedAsset = assetLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Common Korean particles (조사): 이, 가, 은, 는, 을, 를, 의, 에, 에서, 로, 으로, 와, 과, 도, 만, 부터, 까지, 한테, 께
        const koreanParticles = '(?:이|가|은|는|을|를|의|에|에서|로|으로|와|과|도|만|부터|까지|한테|께|보고)?';

        // Match asset name optionally followed by a Korean particle
        const wordBoundaryRegex = new RegExp(
            `(^|\\s|[^a-z0-9가-힣])${escapedAsset}${koreanParticles}($|\\s|[^a-z0-9가-힣])`,
            'i'
        );

        if (wordBoundaryRegex.test(promptLower)) return true;

        // 3. For multi-word asset names (e.g., "메리얼 캐릭터"), match all words
        const assetWords = assetName.split(/[\s\-_]+/).filter(w => w.length >= 4);
        if (assetWords.length > 1) {
            return assetWords.every(word => {
                const escapedWord = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const wordRegex = new RegExp(
                    `(^|\\s|[^a-z0-9가-힣])${escapedWord}${koreanParticles}($|\\s|[^a-z0-9가-힣])`,
                    'i'
                );
                return wordRegex.test(promptLower);
            });
        }

        return false;
    };

    // Helper function to get matched and deduplicated assets for a cut
    const getMatchedAssets = (prompt: string, manualAssetIds: string[], cutId?: number) => {
        const potentialMatches: Array<{ asset: any; isManual: boolean }> = [];

        // Collect all potential matches (manual + auto)
        Object.values(assetDefinitions || {}).forEach((asset: any) => {
            const isManual = manualAssetIds.includes(asset.id);
            const isAuto = isNameMatch(asset.name, prompt);

            if (isManual || isAuto) {
                potentialMatches.push({ asset, isManual });
                if (cutId) {
                    console.log(`[Draft ${cutId}] 🔍 Found potential match: "${asset.name}" (ID: ${asset.id}, Manual: ${isManual}, Updated: ${asset.lastUpdated || 'N/A'})`);
                }
            }
        });

        // Group by asset name to find duplicates
        const assetsByName = new Map<string, Array<{ asset: any; isManual: boolean }>>();
        potentialMatches.forEach((match) => {
            const name = match.asset.name;
            if (!assetsByName.has(name)) {
                assetsByName.set(name, []);
            }
            assetsByName.get(name)!.push(match);
        });

        // For each asset name, keep only the latest version
        const deduplicated: Array<{ asset: any; isManual: boolean }> = [];

        assetsByName.forEach((matches, assetName) => {
            // Sort by lastUpdated timestamp (most recent first)
            matches.sort((a, b) => {
                const timeA = a.asset.lastUpdated || 0;
                const timeB = b.asset.lastUpdated || 0;
                return timeB - timeA; // Descending order (newest first)
            });

            // Keep the most recent version
            const latestMatch = matches[0];
            deduplicated.push(latestMatch);

            if (cutId) {
                if (matches.length > 1) {
                    console.log(`[Draft ${cutId}] 🔄 Multiple versions of "${assetName}" found. Using latest (ID: ${latestMatch.asset.id}, Updated: ${latestMatch.asset.lastUpdated || 'N/A'})`);
                    matches.slice(1).forEach((oldMatch) => {
                        console.log(`[Draft ${cutId}]    ⏭️  SKIP older: "${oldMatch.asset.name}" (ID: ${oldMatch.asset.id}, Updated: ${oldMatch.asset.lastUpdated || 'N/A'})`);
                    });
                }
                console.log(`[Draft ${cutId}] ✅ KEEP: "${latestMatch.asset.name}" (ID: ${latestMatch.asset.id})`);
            }
        });

        // Sort by name length (longest first) to prefer "우영우 변호사" over "우영우"
        deduplicated.sort((a, b) => b.asset.name.length - a.asset.name.length);

        return deduplicated;
    };

    const handleGenerateDraftImage = async (cutId: number, prompt: string) => {
        setDraftLoading(prev => ({ ...prev, [cutId]: true }));
        try {
            console.log(`[Draft ${cutId}] Visual Prompt:`, prompt);
            console.log(`[Draft ${cutId}] Available Assets:`, Object.keys(assetDefinitions || {}));

            const characterImages: string[] = [];
            const locationImages: string[] = [];
            const matchedAssets: string[] = [];

            // 1. Get manually selected assets
            const manualAssetIds = localScript.find(c => c.id === cutId)?.referenceAssetIds || [];

            // 2. Get matched and deduplicated assets using helper
            const deduplicatedMatches = getMatchedAssets(prompt, manualAssetIds, cutId);

            deduplicatedMatches.forEach(({ asset, isManual }) => {
                if (isManual) console.log(`[Draft ${cutId}] 👆 Using manual asset: "${asset.name}"`);
                if (!isManual) console.log(`[Draft ${cutId}] 🤖 Auto-matched asset: "${asset.name}"`);

                matchedAssets.push(asset.name);

                const imageToUse = asset.draftImage || asset.referenceImage;

                if (imageToUse) {
                    if (asset.type === 'character') {
                        characterImages.push(imageToUse);
                        console.log(`[Draft ${cutId}]   - Added CHARACTER: "${asset.name}" (${asset.draftImage ? 'draft' : 'reference'})`);
                    } else {
                        locationImages.push(imageToUse);
                        console.log(`[Draft ${cutId}]   - Added LOCATION: "${asset.name}" (${asset.draftImage ? 'draft' : 'reference'})`);
                    }
                } else {
                    console.log(`[Draft ${cutId}]   - ⚠️ No image for "${asset.name}"`);
                }
            });

            // Combine: characters first, then locations (up to 3 total images)
            const allReferenceImages = [...characterImages, ...locationImages].slice(0, 3);

            if (allReferenceImages.length > 0) {
                console.log(`[Draft ${cutId}] 🎨 Using ${allReferenceImages.length} reference image(s):`);
                console.log(`[Draft ${cutId}]   - ${characterImages.length} character(s)`);
                console.log(`[Draft ${cutId}]   - ${locationImages.length} location(s)`);
            } else {
                console.warn(`[Draft ${cutId}] ⚠  No reference images matched! Matched assets:`, matchedAssets);
            }

            // 3. Construct Character Details Prompt
            let characterDetails = '';
            matchedAssets.forEach(assetName => {
                // Find the asset definition
                const asset = Object.values(assetDefinitions || {}).find((a: any) => a.name === assetName);
                if (asset && asset.type === 'character' && asset.description) {
                    characterDetails += `\n- ${asset.name}: ${asset.description}`;
                }
            });

            if (characterDetails) {
                characterDetails = `\n\n[Character Details]${characterDetails}`;
            }

            // Append Master Visual Style to the prompt
            let stylePrompt = '';
            if (masterStyle?.description) {
                stylePrompt += `\n\n[Master Visual Style]\n${masterStyle.description}`;
            }
            // NOTE: styleAnchor.prompts removed from image prompt
            // Reason: Raw JSON like {"font":"Inter, sans-serif"} was being rendered as text in images

            const finalPrompt = prompt + characterDetails + stylePrompt;

            const result = await generateImage(
                finalPrompt,
                apiKeys.gemini,
                allReferenceImages.length > 0 ? allReferenceImages : undefined,
                aspectRatio,
                imageModel
            );

            // Update local script with new image URL and auto-save
            const updatedScript = localScript.map(cut =>
                cut.id === cutId ? { ...cut, draftImageUrl: result.urls[0] } : cut
            );
            setLocalScript(updatedScript);
            saveToStore(updatedScript);

            setDraftLoading(prev => ({ ...prev, [cutId]: false }));
            console.log(`[Draft ${cutId}] ✅ Generated successfully`);
        } catch (error) {
            console.error(`[Draft ${cutId}] ❌ Generation failed:`, error);
            setDraftLoading(prev => ({ ...prev, [cutId]: false }));
        }
    };

    const handleApprove = () => {
        setScript(localScript);
        nextStep();
        navigate('/step/4');
    };

    const toggleConfirm = (cutId: number) => {
        const updatedScript = localScript.map(cut =>
            cut.id === cutId ? { ...cut, isConfirmed: !cut.isConfirmed } : cut
        );
        setLocalScript(updatedScript);
        saveToStore(updatedScript);
    };

    const addAssetToCut = (cutId: number, assetId: string) => {
        const updatedScript = localScript.map(cut => {
            if (cut.id === cutId) {
                const currentAssets = cut.referenceAssetIds || [];
                if (!currentAssets.includes(assetId)) {
                    return { ...cut, referenceAssetIds: [...currentAssets, assetId] };
                }
            }
            return cut;
        });
        setLocalScript(updatedScript);
        saveToStore(updatedScript);
        setShowAssetSelector(null);
    };

    const removeAssetFromCut = (cutId: number, assetId: string) => {
        const updatedScript = localScript.map(cut => {
            if (cut.id === cutId) {
                return {
                    ...cut,
                    referenceAssetIds: (cut.referenceAssetIds || []).filter(id => id !== assetId)
                };
            }
            return cut;
        });
        setLocalScript(updatedScript);
        saveToStore(updatedScript);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Script & Storyboard</h2>
                    <p className="text-[var(--color-text-muted)]">Review the AI-generated script and visual prompts.</p>
                </div>
                <div className="flex gap-3">
                    <div className="flex flex-col">
                        <label className="text-xs text-[var(--color-text-muted)] mb-1 font-medium">Image Model</label>
                        <select
                            className="bg-[var(--color-surface)] border border-[var(--color-border)] text-white rounded-lg px-4 py-2 outline-none focus:border-[var(--color-primary)] min-w-[200px]"
                            value={imageModel}
                            onChange={(e) => setImageModel(e.target.value as any)}
                        >
                            {IMAGE_MODELS.map(model => (
                                <option key={model.value} value={model.value}>
                                    {model.label} {model.cost}
                                </option>
                            ))}
                        </select>
                        <span className="text-xs text-[var(--color-text-muted)] mt-1">
                            {IMAGE_MODELS.find(m => m.value === imageModel)?.hint}
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs text-[var(--color-text-muted)] mb-1 font-medium">TTS Model</label>
                        <select
                            className="bg-[var(--color-surface)] border border-[var(--color-border)] text-white rounded-lg px-4 py-2 outline-none focus:border-[var(--color-primary)] min-w-[200px]"
                            value={ttsModel}
                            onChange={(e) => setTtsModel(e.target.value as any)}
                        >
                            {TTS_MODELS.map(model => (
                                <option key={model.value} value={model.value}>
                                    {model.label} {model.cost}
                                </option>
                            ))}
                        </select>
                        <span className="text-xs text-[var(--color-text-muted)] mt-1">
                            {TTS_MODELS.find(m => m.value === ttsModel)?.hint}
                        </span>
                    </div>
                    <button
                        onClick={handleGenerateScript}
                        disabled={loading}
                        className="btn-secondary flex items-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                        {localScript.length > 0 ? 'Regenerate Script' : 'Generate Script'}
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {localScript.length === 0 ? (
                    <div className="glass-panel p-12 text-center space-y-6">
                        <div className="w-20 h-20 rounded-full bg-[rgba(255,255,255,0.03)] flex items-center justify-center mx-auto border border-[var(--color-border)]">
                            <Wand2 size={40} className="text-[var(--color-primary)]" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Ready to Write</h3>
                            <p className="text-[var(--color-text-muted)] max-w-md mx-auto mt-2">
                                Gemini will generate a script broken down into shots, complete with dialogue and visual descriptions based on your style anchor.
                            </p>
                        </div>
                        <button onClick={handleGenerateScript} className="btn-primary">
                            Start Magic Generation
                        </button>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {localScript.map((cut, index) => {
                            const isConfirmed = cut.isConfirmed;
                            const manualAssets = cut.referenceAssetIds || [];

                            // Calculate matched assets for display using the same helper as image generation
                            const allMatchedAssets = getMatchedAssets(cut.visualPrompt, manualAssets);
                            const manualAssetObjs = allMatchedAssets.filter(m => m.isManual).map(m => m.asset);
                            const autoMatchedAssets = allMatchedAssets.filter(m => !m.isManual).map(m => m.asset);

                            return (
                                <div key={cut.id} className={`glass-panel p-6 flex gap-6 group transition-all relative ${isConfirmed ? 'border-green-500/50 bg-green-500/5' : 'hover:border-[var(--color-primary-dim)]'}`}>
                                    <div className="flex-shrink-0 flex flex-col items-center gap-3">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold border ${isConfirmed ? 'bg-green-500 text-black border-green-500' : 'bg-[var(--color-surface)] text-[var(--color-primary)] border-[var(--color-border)]'}`}>
                                            {isConfirmed ? <Check size={24} /> : index + 1}
                                        </div>
                                        <button
                                            onClick={() => toggleConfirm(cut.id)}
                                            className={`p-2 rounded-full transition-colors ${isConfirmed ? 'text-green-400 hover:bg-green-500/10' : 'text-[var(--color-text-muted)] hover:text-white hover:bg-white/5'}`}
                                            title={isConfirmed ? "Unlock Cut" : "Confirm Cut"}
                                        >
                                            {isConfirmed ? <Lock size={16} /> : <Unlock size={16} />}
                                        </button>
                                    </div>

                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                                                <Mic size={12} /> Audio / Dialogue
                                            </div>
                                            <div className="space-y-2">
                                                <input
                                                    className={`bg-transparent border-none text-[var(--color-primary)] font-bold w-full focus:ring-0 p-0 ${isConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                                                    value={cut.speaker}
                                                    disabled={isConfirmed}
                                                    onChange={(e) => {
                                                        const newScript = [...localScript];
                                                        newScript[index].speaker = e.target.value;
                                                        setLocalScript(newScript);
                                                    }}
                                                    onBlur={() => saveToStore(localScript)}
                                                />
                                                <textarea
                                                    className={`w-full bg-[rgba(0,0,0,0.2)] border border-[var(--color-border)] rounded-lg p-3 text-white text-sm min-h-[80px] focus:border-[var(--color-primary)] outline-none resize-none ${isConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                                                    value={cut.dialogue}
                                                    disabled={isConfirmed}
                                                    onChange={(e) => {
                                                        const newScript = [...localScript];
                                                        newScript[index].dialogue = e.target.value;
                                                        setLocalScript(newScript);
                                                    }}
                                                    onBlur={() => saveToStore(localScript)}
                                                />
                                                <div className="text-xs text-gray-500 text-right">{cut.estimatedDuration}s est.</div>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                                                <ImageIcon size={12} /> Visual Prompt
                                            </div>
                                            <div className="flex gap-3">
                                                <textarea
                                                    className={`w-full bg-[rgba(0,0,0,0.2)] border border-[var(--color-border)] rounded-lg p-3 text-gray-300 text-sm min-h-[80px] focus:border-[var(--color-primary)] outline-none resize-none ${isConfirmed ? 'opacity-70 cursor-not-allowed' : ''}`}
                                                    value={cut.visualPrompt}
                                                    disabled={isConfirmed}
                                                    onChange={(e) => {
                                                        const newScript = [...localScript];
                                                        newScript[index].visualPrompt = e.target.value;
                                                        setLocalScript(newScript);
                                                    }}
                                                    onBlur={() => saveToStore(localScript)}
                                                />
                                                <button
                                                    onClick={() => handleGenerateDraftImage(cut.id, cut.visualPrompt)}
                                                    disabled={draftLoading[cut.id]}
                                                    className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-gray-400 hover:text-white hover:border-[var(--color-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Generate Draft Preview"
                                                >
                                                    {draftLoading[cut.id] ? (
                                                        <Loader2 size={16} className="animate-spin" />
                                                    ) : (
                                                        <Eye size={16} />
                                                    )}
                                                </button>
                                            </div>

                                            {/* Asset Selection UI */}
                                            <div className="flex flex-wrap gap-2 items-center min-h-[32px]">
                                                <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mr-2">Assets:</span>

                                                {/* Manual Assets */}
                                                {manualAssetObjs.map((asset: any) => (
                                                    <div key={asset.id} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs border border-[var(--color-primary)]/30">
                                                        <span>{asset.name}</span>
                                                        {!isConfirmed && (
                                                            <button onClick={() => removeAssetFromCut(cut.id, asset.id)} className="hover:text-white">
                                                                <X size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}

                                                {/* Auto-matched Assets */}
                                                {autoMatchedAssets.map((asset: any) => (
                                                    <div key={asset.id} className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 text-gray-400 text-xs border border-white/10" title="Auto-detected">
                                                        <span>{asset.name}</span>
                                                        <span className="text-[10px] opacity-50">(Auto)</span>
                                                    </div>
                                                ))}

                                                {/* Add Asset Button */}
                                                {!isConfirmed && (
                                                    <div className="relative">
                                                        <button
                                                            onClick={() => setShowAssetSelector(showAssetSelector === cut.id ? null : cut.id)}
                                                            className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 text-gray-400 text-xs border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
                                                        >
                                                            <Plus size={12} /> Add
                                                        </button>

                                                        {/* Asset Selector Dropdown */}
                                                        {showAssetSelector === cut.id && (
                                                            <>
                                                                <div
                                                                    className="fixed inset-0 z-[90]"
                                                                    onClick={() => setShowAssetSelector(null)}
                                                                />
                                                                <div className="absolute top-full right-0 mt-2 w-48 bg-[#1a1a1a] border border-[var(--color-border)] rounded-lg shadow-xl z-[100] max-h-60 overflow-y-auto">
                                                                    <div className="p-2 text-xs text-gray-500 font-bold uppercase">Select Asset</div>
                                                                    {Object.values(assetDefinitions || {}).map((asset: any) => (
                                                                        <button
                                                                            key={asset.id}
                                                                            onClick={() => addAssetToCut(cut.id, asset.id)}
                                                                            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2"
                                                                        >
                                                                            <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]"></div>
                                                                            {asset.name}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {cut.draftImageUrl && (
                                                <div className="mt-3 rounded-lg overflow-hidden border border-[var(--color-border)]">
                                                    <img
                                                        src={cut.draftImageUrl}
                                                        alt="Draft preview"
                                                        className="w-full h-auto"
                                                    />
                                                    <div className="bg-[rgba(0,0,0,0.3)] px-2 py-1 text-xs text-[var(--color-text-muted)]">
                                                        Draft Preview (Low Quality)
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {localScript.length > 0 && (
                <div className="flex justify-end pt-6 pb-12">
                    <button
                        onClick={handleApprove}
                        className="btn-primary flex items-center gap-2 px-6 py-3 rounded-full font-bold shadow-lg hover:shadow-[0_0_20px_rgba(255,159,89,0.4)] hover:scale-105 transition-all sticky bottom-8"
                    >
                        Next Step
                        <ArrowRight size={24} />
                    </button>
                </div>
            )}
        </div>
    );
};
