import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore } from '../store/workflowStore';
import { consultStory, type ChatMessage, type AiCharacter } from '../services/gemini';
import type { AspectRatio } from '../store/types';
import { CheckCircle, Save, ArrowRight, Bot, User, Sparkles, Film, Send, ChevronDown, Plus, Trash2, Edit2, X, Clock, MapPin } from 'lucide-react';

export const Step1_Setup: React.FC = () => {
    console.log("Step1_Setup: Rendering");
    const navigate = useNavigate();
    const store = useWorkflowStore();

    // Safe destructuring with default values from STORE
    const {
        seriesName = '',
        episodeName = '',
        episodeNumber = 1,
        seriesStory = '',
        mainCharacters = '',
        episodePlot = '',
        targetDuration = 60,
        apiKeys = { gemini: '', nanoBanana: '' },
        chatHistory = [],
        setProjectInfo,
        setChatHistory,
        nextStep
    } = store || {};

    // Ensure arrays are actually arrays
    const characters = Array.isArray(store?.characters) ? store.characters : [];
    const seriesLocations = Array.isArray(store?.seriesLocations) ? store.seriesLocations : [];
    const episodeCharacters = Array.isArray(store?.episodeCharacters) ? store.episodeCharacters : [];
    const episodeLocations = Array.isArray(store?.episodeLocations) ? store.episodeLocations : [];

    // --- LOCAL STATE FOR EDITING ---
    const [isEditing, setIsEditing] = useState(false);

    // Local form states
    const [localSeriesName, setLocalSeriesName] = useState('');
    const [localEpisodeName, setLocalEpisodeName] = useState('');
    const [localEpisodeNumber, setLocalEpisodeNumber] = useState(1);
    const [localSeriesStory, setLocalSeriesStory] = useState('');
    const [localEpisodePlot, setLocalEpisodePlot] = useState('');
    const [localTargetDuration, setLocalTargetDuration] = useState(60);
    const [localCharacters, setLocalCharacters] = useState<any[]>([]);
    const [localSeriesLocations, setLocalSeriesLocations] = useState<any[]>([]);
    const [localEpisodeCharacters, setLocalEpisodeCharacters] = useState<any[]>([]);
    const [localEpisodeLocations, setLocalEpisodeLocations] = useState<any[]>([]);
    const [localAspectRatio, setLocalAspectRatio] = useState<AspectRatio>('16:9');

    // Chat states
    const [inputMessage, setInputMessage] = useState('');
    const [isConsulting, setIsConsulting] = useState(false);

    // Collapsible states
    const [isSeriesOpen, setIsSeriesOpen] = useState(true);
    const [isEpisodeOpen, setIsEpisodeOpen] = useState(true);

    const chatEndRef = useRef<HTMLDivElement>(null);

    // Completion checks (based on STORE data for navigation, LOCAL for validation during edit)
    const isSeriesComplete = !!(seriesName && seriesStory && characters.length > 0);
    const isEpisodeComplete = !!(episodeName && episodeNumber && episodePlot && episodeCharacters.length > 0);

    // Initialize Local State from Store when entering Edit Mode or on Mount
    useEffect(() => {
        if (!isEditing) {
            // Sync local state with store when NOT editing (so it's ready when we click Edit)
            setLocalSeriesName(seriesName || '');
            setLocalEpisodeName(episodeName || '');
            setLocalEpisodeNumber(episodeNumber || 1);
            setLocalSeriesStory(seriesStory || '');
            setLocalEpisodePlot(episodePlot || '');
            setLocalTargetDuration(targetDuration || 60);
            setLocalCharacters(JSON.parse(JSON.stringify(characters))); // Deep copy
            setLocalSeriesLocations(JSON.parse(JSON.stringify(seriesLocations)));
            setLocalEpisodeCharacters(JSON.parse(JSON.stringify(episodeCharacters)));
            setLocalEpisodeLocations(JSON.parse(JSON.stringify(episodeLocations)));
            setLocalAspectRatio(store.aspectRatio || '16:9');
        }
    }, [isEditing, seriesName, episodeName, episodeNumber, seriesStory, episodePlot, targetDuration, characters, seriesLocations, episodeCharacters, episodeLocations, store.aspectRatio]);

    // Initial Mode Logic
    useEffect(() => {
        // If it's a new project (no series name), start in Edit Mode
        if (!seriesName) {
            setIsEditing(true);
        }
    }, []); // Run once on mount

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatHistory]);

    // Force set step to 1 on mount
    useEffect(() => {
        if (store?.currentStep !== 1) {
            store?.setStep(1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = () => {
        setProjectInfo({
            seriesName: localSeriesName,
            episodeName: localEpisodeName,
            episodeNumber: localEpisodeNumber,
            seriesStory: localSeriesStory,
            episodePlot: localEpisodePlot,
            targetDuration: localTargetDuration,
            characters: localCharacters,
            seriesLocations: localSeriesLocations,
            episodeCharacters: localEpisodeCharacters,
            episodeLocations: localEpisodeLocations,
            aspectRatio: localAspectRatio
        });
        setIsEditing(false);
    };

    const handleCancel = () => {
        setIsEditing(false);
        // Local state will be re-synced by the useEffect
    };

    const handleSendMessage = async () => {
        if (!inputMessage.trim()) return;

        if (!apiKeys?.gemini) {
            alert("Please enter a Gemini API Key in the sidebar configuration first.");
            return;
        }

        const newUserMsg: ChatMessage = { role: 'user', content: inputMessage };
        const updatedHistory = [...chatHistory, newUserMsg];
        setChatHistory(updatedHistory);
        setInputMessage('');
        setIsConsulting(true);

        try {
            const context = {
                seriesName,
                episodeName,
                episodeNumber,
                seriesStory,
                characters,
                seriesLocations,
                episodePlot,
                episodeCharacters,
                episodeLocations,
                targetDuration,
                aspectRatio: store.aspectRatio
            };

            const result = await consultStory(updatedHistory, context, apiKeys.gemini);

            const newAiMsg: ChatMessage = { role: 'model', content: result.reply };
            setChatHistory([...updatedHistory, newAiMsg]);

            // Auto-populate fields if suggestions exist
            if (result.suggestedSeriesName || result.suggestedEpisodeName || result.suggestedDuration || result.suggestedEpisodeNumber || result.suggestedSeriesStory || result.suggestedMainCharacters || result.suggestedEpisodePlot || result.suggestedEpisodeCharacters || result.suggestedCharacters) {
                const updates: Partial<Parameters<typeof setProjectInfo>[0]> = {
                    seriesName: result.suggestedSeriesName || seriesName,
                    episodeName: result.suggestedEpisodeName || episodeName,
                    episodeNumber: result.suggestedEpisodeNumber || episodeNumber,
                    seriesStory: result.suggestedSeriesStory || seriesStory,
                    mainCharacters: result.suggestedMainCharacters || mainCharacters,
                    episodePlot: result.suggestedEpisodePlot || episodePlot,
                    targetDuration: result.suggestedDuration || targetDuration
                };

                // Handle character array from AI
                if (result.suggestedCharacters && result.suggestedCharacters.length > 0) {
                    const newCharacters = result.suggestedCharacters.map((char: AiCharacter) => ({
                        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                        name: char.name || '',
                        role: char.role || '',
                        description: char.description || ''
                    }));
                    updates.characters = newCharacters;
                }

                // Handle episode character array from AI
                if (result.suggestedEpisodeCharacters && Array.isArray(result.suggestedEpisodeCharacters) && result.suggestedEpisodeCharacters.length > 0) {
                    const newEpCharacters = result.suggestedEpisodeCharacters.map((char: AiCharacter) => ({
                        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                        name: char.name || '',
                        role: char.role || '',
                        description: char.description || ''
                    }));
                    updates.episodeCharacters = newEpCharacters;
                }

                // Handle series locations from AI
                if (result.suggestedSeriesLocations && Array.isArray(result.suggestedSeriesLocations) && result.suggestedSeriesLocations.length > 0) {
                    const newLocs = result.suggestedSeriesLocations.map((loc: any) => ({
                        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                        name: loc.name || '',
                        description: loc.description || ''
                    }));
                    updates.seriesLocations = newLocs;
                }

                // Handle episode locations from AI
                if (result.suggestedEpisodeLocations && Array.isArray(result.suggestedEpisodeLocations) && result.suggestedEpisodeLocations.length > 0) {
                    const newLocs = result.suggestedEpisodeLocations.map((loc: any) => ({
                        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                        name: loc.name || '',
                        description: loc.description || ''
                    }));
                    updates.episodeLocations = newLocs;
                }

                setProjectInfo(updates);

                // Open sections to show new data AND switch to View Mode
                setIsSeriesOpen(true);
                setIsEpisodeOpen(true);
                setIsEditing(false); // Force View Mode to show new data
            }

        } catch (error) {
            console.error("Consultation failed:", error);
            setChatHistory([...updatedHistory, { role: 'model', content: "Sorry, I encountered an error. Please check your API key and try again." }]);
        } finally {
            setIsConsulting(false);
        }
    };

    const handleNext = () => {
        if (!seriesName || !episodeName) {
            alert("Please finalize the Series Name and Episode Name before proceeding.");
            return;
        }
        nextStep();
        navigate('/step/2');
    };

    const formatDuration = (seconds: number): string => {
        const minutes = seconds / 60;
        return `${minutes.toFixed(1)} min`;
    };

    const estimateCuts = (seconds: number): number => {
        const avgCutDuration = 6; // Average 6 seconds per cut
        return Math.ceil(seconds / avgCutDuration);
    };

    const renderLabel = (label: string, isConfirmed: boolean) => (
        <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{label}</label>
            {isConfirmed && (
                <CheckCircle size={16} className="text-green-500" />
            )}
        </div>
    );

    const { isHydrated } = useWorkflowStore();

    if (!isHydrated) {
        return (
            <div className="flex flex-col items-center justify-center h-[90vh] text-white gap-4">
                <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-lg font-bold">Loading Project Data...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 max-w-[1600px] mx-auto h-[90vh] p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
                {/* Left Column: AI Chat */}
                <div className="glass-panel p-0 flex flex-col border border-[var(--color-border)] overflow-hidden">
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent border-b border-[var(--color-border)] flex-shrink-0">
                        <Sparkles className="text-[var(--color-primary)]" size={28} />
                        <h2 className="text-2xl font-bold text-white">AI Story Consultant</h2>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 p-6 min-h-0">
                        {chatHistory.length === 0 && (
                            <div className="text-center text-[var(--color-text-muted)] py-12">
                                <Bot size={48} className="mx-auto mb-4 opacity-50" />
                                <p className="text-lg">Start a conversation to get AI-powered story suggestions!</p>
                                <p className="text-sm mt-2">Ask about your series, characters, plot ideas, or anything else.</p>
                            </div>
                        )}

                        {chatHistory.map((msg, idx) => (
                            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'model' && (
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                                        <Bot size={18} className="text-black" />
                                    </div>
                                )}
                                <div className={`max-w-[80%] p-4 rounded-2xl ${msg.role === 'user'
                                    ? 'bg-[var(--color-primary)]/20 text-white border border-[var(--color-primary)]/30'
                                    : 'bg-[var(--color-surface)] text-white border border-[var(--color-border)]'
                                    }`}>
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                </div>
                                {msg.role === 'user' && (
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white opacity-100 flex items-center justify-center">
                                        <User size={18} className="text-[#F97316]" />
                                    </div>
                                )}
                            </div>
                        ))}

                        {isConsulting && (
                            <div className="flex gap-3 justify-start">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                                    <Bot size={18} className="text-black" />
                                </div>
                                <div className="bg-[var(--color-surface)] p-4 rounded-2xl border border-[var(--color-border)]">
                                    <div className="flex gap-2">
                                        <div className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={chatEndRef} />
                    </div>

                    <div className="relative flex-shrink-0 p-6 pt-0">
                        <textarea
                            className="input-field w-full h-24 resize-none pr-14"
                            value={inputMessage}
                            onChange={(e) => setInputMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            placeholder="Ask me anything about your story..."
                            disabled={isConsulting}
                        />
                        <button
                            onClick={handleSendMessage}
                            disabled={isConsulting || !inputMessage.trim()}
                            className="absolute right-8 top-2 p-2 rounded-lg bg-[var(--color-primary)] text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                        >
                            <Send size={20} />
                        </button>
                    </div>
                </div>

                {/* Right Column: Project Settings */}
                <div className="glass-panel p-0 flex flex-col border border-[var(--color-border)] overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent border-b border-[var(--color-border)] flex-shrink-0">
                        <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                            <Film className="text-[var(--color-primary)]" />
                            Project Settings
                        </h3>

                        <div className="flex items-center gap-2">
                            {!isEditing ? (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-surface-highlight)] text-white transition-all border border-[var(--color-border)] font-bold text-sm"
                                >
                                    <Edit2 size={16} />
                                    Edit Project
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={handleCancel}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-red-500/20 text-red-300 hover:text-red-200 transition-all font-bold text-sm"
                                    >
                                        <X size={16} />
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-black hover:opacity-90 shadow-lg font-bold text-sm"
                                    >
                                        <Save size={16} />
                                        Save Changes
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
                        {!isEditing ? (
                            /* --- VIEW MODE --- */
                            <div className="space-y-8">
                                {/* Series Info View */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                                        <h4 className="text-[var(--color-primary)] font-bold uppercase tracking-widest text-sm">Series Level</h4>
                                        {isSeriesComplete && <CheckCircle size={18} className="text-green-500" />}
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-1">Series Name</label>
                                            <p className="text-2xl font-bold text-white">{seriesName || <span className="text-gray-600 italic">Untitled Series</span>}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-1">Series Story</label>
                                            <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{seriesStory || <span className="text-gray-600 italic">No story defined.</span>}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-2">Main Characters</label>
                                            <div className="flex flex-wrap gap-2">
                                                {characters.length > 0 ? characters.map(c => (
                                                    <div key={c.id} className="px-3 py-1.5 rounded-full bg-[var(--color-surface-highlight)] border border-[var(--color-border)] flex items-center gap-2">
                                                        <User size={14} className="text-[var(--color-primary)]" />
                                                        <span className="font-bold text-sm">{c.name}</span>
                                                        <span className="text-xs text-gray-400">({c.role})</span>
                                                    </div>
                                                )) : <span className="text-gray-600 italic text-sm">No characters.</span>}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-2">Series Locations</label>
                                            <div className="flex flex-wrap gap-2">
                                                {seriesLocations.length > 0 ? seriesLocations.map(l => (
                                                    <div key={l.id} className="px-3 py-1.5 rounded-full bg-[var(--color-surface-highlight)] border border-[var(--color-border)] flex items-center gap-2">
                                                        <MapPin size={14} className="text-[var(--color-primary)]" />
                                                        <span className="font-bold text-sm">{l.name}</span>
                                                    </div>
                                                )) : <span className="text-gray-600 italic text-sm">No locations.</span>}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-1">Aspect Ratio</label>
                                            <span className="px-2 py-1 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-mono text-[var(--color-primary)]">
                                                {store.aspectRatio || '16:9'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Episode Info View */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                                        <h4 className="text-[var(--color-primary)] font-bold uppercase tracking-widest text-sm">Episode Level</h4>
                                        {isEpisodeComplete && <CheckCircle size={18} className="text-green-500" />}
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-1">Episode Name</label>
                                                <p className="text-xl font-bold text-white">{episodeName || <span className="text-gray-600 italic">Untitled Episode</span>}</p>
                                            </div>
                                            <div>
                                                <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-1">Ep. #</label>
                                                <p className="text-xl font-bold text-[var(--color-primary)]">#{episodeNumber}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-1">Episode Plot</label>
                                            <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{episodePlot || <span className="text-gray-600 italic">No plot defined.</span>}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-2">Episode Characters</label>
                                            <div className="flex flex-wrap gap-2">
                                                {episodeCharacters.length > 0 ? episodeCharacters.map(c => (
                                                    <div key={c.id} className="px-3 py-1.5 rounded-full bg-[var(--color-surface-highlight)] border border-[var(--color-border)] flex items-center gap-2">
                                                        <User size={14} className="text-[var(--color-primary)]" />
                                                        <span className="font-bold text-sm">{c.name}</span>
                                                        <span className="text-xs text-gray-400">({c.role})</span>
                                                    </div>
                                                )) : <span className="text-gray-600 italic text-sm">No episode characters.</span>}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-2">Episode Locations</label>
                                            <div className="flex flex-wrap gap-2">
                                                {episodeLocations.length > 0 ? episodeLocations.map(l => (
                                                    <div key={l.id} className="px-3 py-1.5 rounded-full bg-[var(--color-surface-highlight)] border border-[var(--color-border)] flex items-center gap-2">
                                                        <MapPin size={14} className="text-[var(--color-primary)]" />
                                                        <span className="font-bold text-sm">{l.name}</span>
                                                    </div>
                                                )) : <span className="text-gray-600 italic text-sm">No episode locations.</span>}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-1">Target Duration</label>
                                            <div className="flex items-center gap-2">
                                                <Clock size={16} className="text-[var(--color-primary)]" />
                                                <span className="font-bold text-white">{formatDuration(targetDuration)}</span>
                                                <span className="text-gray-500 text-sm">({targetDuration}s, ~{estimateCuts(targetDuration)} cuts)</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* --- EDIT MODE --- */
                            <>
                                {/* SERIES SECTION */}
                                <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden transition-all duration-300">
                                    <button
                                        onClick={() => setIsSeriesOpen(!isSeriesOpen)}
                                        className="w-full flex items-center justify-between p-4 hover:bg-[var(--color-surface-highlight)] transition-colors bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent"
                                    >
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-sm font-bold text-[var(--color-primary)] uppercase tracking-widest">Series Level</h4>
                                            {isSeriesComplete && <CheckCircle size={18} className="text-green-500" />}
                                        </div>
                                        <ChevronDown size={20} className={`text-[var(--color-text-muted)] transition-transform duration-300 ${isSeriesOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isSeriesOpen && (
                                        <div className="p-4 pt-4 space-y-6 animate-fade-in border-t border-[var(--color-border)]">
                                            <div className="space-y-2">
                                                {renderLabel("Series Name", !!localSeriesName)}
                                                <input
                                                    type="text"
                                                    className="input-field text-lg font-bold"
                                                    value={localSeriesName}
                                                    onChange={(e) => setLocalSeriesName(e.target.value)}
                                                    placeholder="Waiting for inspiration..."
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                {renderLabel("Series Story", !!localSeriesStory)}
                                                <textarea
                                                    className="input-field h-24 resize-none"
                                                    value={localSeriesStory}
                                                    onChange={(e) => setLocalSeriesStory(e.target.value)}
                                                    placeholder="Brief summary of the series..."
                                                />
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    {renderLabel("Main Characters", localCharacters.length > 0)}
                                                    <button
                                                        onClick={() => setLocalCharacters([...localCharacters, { id: Date.now().toString(), name: '', role: '', description: '' }])}
                                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors text-xs font-bold"
                                                    >
                                                        <Plus size={14} />
                                                        Add Character
                                                    </button>
                                                </div>

                                                <div className="space-y-4">
                                                    {localCharacters.map((char, index) => (
                                                        <div key={char.id} className="group relative bg-[var(--color-bg)] p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
                                                            <div className="flex justify-between items-start gap-4 mb-3">
                                                                <div className="flex-1 space-y-2">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Character Name"
                                                                        className="w-full bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none py-1 font-bold text-white placeholder-gray-600"
                                                                        value={char.name}
                                                                        onChange={(e) => {
                                                                            const newChars = [...localCharacters];
                                                                            newChars[index].name = e.target.value;
                                                                            setLocalCharacters(newChars);
                                                                        }}
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Role (e.g. Protagonist)"
                                                                        className="w-full bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none py-1 text-xs text-[var(--color-primary)] placeholder-gray-600"
                                                                        value={char.role}
                                                                        onChange={(e) => {
                                                                            const newChars = [...localCharacters];
                                                                            newChars[index].role = e.target.value;
                                                                            setLocalCharacters(newChars);
                                                                        }}
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        const newChars = localCharacters.filter(c => c.id !== char.id);
                                                                        setLocalCharacters(newChars);
                                                                    }}
                                                                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                            <textarea
                                                                placeholder="Character traits & description..."
                                                                className="w-full bg-transparent border border-[var(--color-border)] rounded-lg p-2 text-sm text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none h-20 placeholder-gray-600"
                                                                value={char.description}
                                                                onChange={(e) => {
                                                                    const newChars = [...localCharacters];
                                                                    newChars[index].description = e.target.value;
                                                                    setLocalCharacters(newChars);
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                    {localCharacters.length === 0 && (
                                                        <div className="text-center py-8 border-2 border-dashed border-[var(--color-border)] rounded-xl text-[var(--color-text-muted)] text-sm">
                                                            No characters added yet. Click "Add Character" to start.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    {renderLabel("Series Locations", localSeriesLocations.length > 0)}
                                                    <button
                                                        onClick={() => setLocalSeriesLocations([...localSeriesLocations, { id: Date.now().toString(), name: '', description: '' }])}
                                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors text-xs font-bold"
                                                    >
                                                        <Plus size={14} />
                                                        Add Location
                                                    </button>
                                                </div>

                                                <div className="space-y-4">
                                                    {localSeriesLocations.map((loc, index) => (
                                                        <div key={loc.id} className="group relative bg-[var(--color-bg)] p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
                                                            <div className="flex justify-between items-start gap-4 mb-3">
                                                                <div className="flex-1">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Location Name"
                                                                        className="w-full bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none py-1 font-bold text-white placeholder-gray-600"
                                                                        value={loc.name}
                                                                        onChange={(e) => {
                                                                            const newLocs = [...localSeriesLocations];
                                                                            newLocs[index].name = e.target.value;
                                                                            setLocalSeriesLocations(newLocs);
                                                                        }}
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        const newLocs = localSeriesLocations.filter(l => l.id !== loc.id);
                                                                        setLocalSeriesLocations(newLocs);
                                                                    }}
                                                                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                            <textarea
                                                                placeholder="Visual description of this location..."
                                                                className="w-full bg-transparent border border-[var(--color-border)] rounded-lg p-2 text-sm text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none h-20 placeholder-gray-600"
                                                                value={loc.description}
                                                                onChange={(e) => {
                                                                    const newLocs = [...localSeriesLocations];
                                                                    newLocs[index].description = e.target.value;
                                                                    setLocalSeriesLocations(newLocs);
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                    {localSeriesLocations.length === 0 && (
                                                        <div className="text-center py-8 border-2 border-dashed border-[var(--color-border)] rounded-xl text-[var(--color-text-muted)] text-sm">
                                                            No locations added yet.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                {renderLabel("Aspect Ratio", !!localAspectRatio)}
                                                <div className="grid grid-cols-4 gap-2">
                                                    {(['16:9', '9:16', '1:1', '2.35:1'] as const).map((ratio) => (
                                                        <button
                                                            key={ratio}
                                                            onClick={() => setLocalAspectRatio(ratio)}
                                                            className={`p-2 rounded-lg text-xs font-bold border transition-all ${localAspectRatio === ratio
                                                                ? 'bg-[var(--color-primary)] text-black border-[var(--color-primary)]'
                                                                : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]'
                                                                }`}
                                                        >
                                                            {ratio}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* EPISODE SECTION */}
                                <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden transition-all duration-300">
                                    <button
                                        onClick={() => setIsEpisodeOpen(!isEpisodeOpen)}
                                        className="w-full flex items-center justify-between p-4 hover:bg-[var(--color-surface-highlight)] transition-colors bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent"
                                    >
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-sm font-bold text-[var(--color-primary)] uppercase tracking-widest">Episode Level</h4>
                                            {isEpisodeComplete && <CheckCircle size={18} className="text-green-500" />}
                                        </div>
                                        <ChevronDown size={20} className={`text-[var(--color-text-muted)] transition-transform duration-300 ${isEpisodeOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isEpisodeOpen && (
                                        <div className="p-4 pt-4 space-y-6 animate-fade-in border-t border-[var(--color-border)]">
                                            <div className="grid grid-cols-4 gap-4">
                                                <div className="col-span-3 space-y-2">
                                                    {renderLabel("Episode Name", !!localEpisodeName)}
                                                    <input
                                                        type="text"
                                                        className="input-field text-lg"
                                                        value={localEpisodeName}
                                                        onChange={(e) => setLocalEpisodeName(e.target.value)}
                                                        placeholder="Waiting for inspiration..."
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    {renderLabel("Ep. #", !!localEpisodeNumber)}
                                                    <input
                                                        type="number"
                                                        className="input-field text-center"
                                                        value={localEpisodeNumber}
                                                        onChange={(e) => setLocalEpisodeNumber(parseInt(e.target.value) || 1)}
                                                        min="1"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                {renderLabel("Episode Plot", !!localEpisodePlot)}
                                                <textarea
                                                    className="input-field h-24 resize-none"
                                                    value={localEpisodePlot}
                                                    onChange={(e) => setLocalEpisodePlot(e.target.value)}
                                                    placeholder="Plot summary for this episode..."
                                                />
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    {renderLabel("Episode Characters", localEpisodeCharacters.length > 0)}
                                                    <button
                                                        onClick={() => setLocalEpisodeCharacters([...localEpisodeCharacters, { id: Date.now().toString(), name: '', role: '', description: '' }])}
                                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors text-xs font-bold"
                                                    >
                                                        <Plus size={14} />
                                                        Add Character
                                                    </button>
                                                </div>

                                                <div className="space-y-4">
                                                    {localEpisodeCharacters.map((char, index) => (
                                                        <div key={char.id} className="group relative bg-[var(--color-bg)] p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
                                                            <div className="flex justify-between items-start gap-4 mb-3">
                                                                <div className="flex-1 space-y-2">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Character Name"
                                                                        className="w-full bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none py-1 font-bold text-white placeholder-gray-600"
                                                                        value={char.name}
                                                                        onChange={(e) => {
                                                                            const newChars = [...localEpisodeCharacters];
                                                                            newChars[index].name = e.target.value;
                                                                            setLocalEpisodeCharacters(newChars);
                                                                        }}
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Role (e.g. Antagonist)"
                                                                        className="w-full bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none py-1 text-xs text-[var(--color-primary)] placeholder-gray-600"
                                                                        value={char.role}
                                                                        onChange={(e) => {
                                                                            const newChars = [...localEpisodeCharacters];
                                                                            newChars[index].role = e.target.value;
                                                                            setLocalEpisodeCharacters(newChars);
                                                                        }}
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        const newChars = localEpisodeCharacters.filter(c => c.id !== char.id);
                                                                        setLocalEpisodeCharacters(newChars);
                                                                    }}
                                                                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                            <textarea
                                                                placeholder="Character traits & description..."
                                                                className="w-full bg-transparent border border-[var(--color-border)] rounded-lg p-2 text-sm text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none h-20 placeholder-gray-600"
                                                                value={char.description}
                                                                onChange={(e) => {
                                                                    const newChars = [...localEpisodeCharacters];
                                                                    newChars[index].description = e.target.value;
                                                                    setLocalEpisodeCharacters(newChars);
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                    {localEpisodeCharacters.length === 0 && (
                                                        <div className="text-center py-8 border-2 border-dashed border-[var(--color-border)] rounded-xl text-[var(--color-text-muted)] text-sm">
                                                            No episode characters added.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    {renderLabel("Episode Locations", localEpisodeLocations.length > 0)}
                                                    <button
                                                        onClick={() => setLocalEpisodeLocations([...localEpisodeLocations, { id: Date.now().toString(), name: '', description: '' }])}
                                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors text-xs font-bold"
                                                    >
                                                        <Plus size={14} />
                                                        Add Location
                                                    </button>
                                                </div>

                                                <div className="space-y-4">
                                                    {localEpisodeLocations.map((loc, index) => (
                                                        <div key={loc.id} className="group relative bg-[var(--color-bg)] p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
                                                            <div className="flex justify-between items-start gap-4 mb-3">
                                                                <div className="flex-1">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Location Name"
                                                                        className="w-full bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none py-1 font-bold text-white placeholder-gray-600"
                                                                        value={loc.name}
                                                                        onChange={(e) => {
                                                                            const newLocs = [...localEpisodeLocations];
                                                                            newLocs[index].name = e.target.value;
                                                                            setLocalEpisodeLocations(newLocs);
                                                                        }}
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        const newLocs = localEpisodeLocations.filter(l => l.id !== loc.id);
                                                                        setLocalEpisodeLocations(newLocs);
                                                                    }}
                                                                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                            <textarea
                                                                placeholder="Visual description of this location..."
                                                                className="w-full bg-transparent border border-[var(--color-border)] rounded-lg p-2 text-sm text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none h-20 placeholder-gray-600"
                                                                value={loc.description}
                                                                onChange={(e) => {
                                                                    const newLocs = [...localEpisodeLocations];
                                                                    newLocs[index].description = e.target.value;
                                                                    setLocalEpisodeLocations(newLocs);
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                    {localEpisodeLocations.length === 0 && (
                                                        <div className="text-center py-8 border-2 border-dashed border-[var(--color-border)] rounded-xl text-[var(--color-text-muted)] text-sm">
                                                            No episode locations added.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    {renderLabel("Target Duration", !!localTargetDuration)}
                                                    <div className="flex items-center gap-4 mt-2 text-sm">
                                                        <span className="font-bold text-[var(--color-primary)] text-lg">
                                                            {formatDuration(localTargetDuration)}
                                                        </span>
                                                        <span className="text-[var(--color-text-muted)]">
                                                            ({localTargetDuration}s)
                                                        </span>
                                                        <span className="font-bold text-[var(--color-primary)] text-lg">
                                                            ~{estimateCuts(localTargetDuration)} cuts
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="relative">
                                                    <div
                                                        className="absolute top-0 left-0 h-2 bg-[var(--color-primary)] rounded-lg pointer-events-none"
                                                        style={{ width: `${((localTargetDuration - 30) / (300 - 30)) * 100}%` }}
                                                    />
                                                    <input
                                                        type="range"
                                                        min="30"
                                                        max="300"
                                                        step="15"
                                                        value={localTargetDuration}
                                                        onChange={(e) => setLocalTargetDuration(parseInt(e.target.value))}
                                                        className="relative w-full h-2 bg-[var(--color-surface)] rounded-lg appearance-none cursor-pointer 
                                                               [&::-webkit-slider-thumb]:appearance-none 
                                                               [&::-webkit-slider-thumb]:w-4 
                                                               [&::-webkit-slider-thumb]:h-4 
                                                               [&::-webkit-slider-thumb]:rounded-full 
                                                               [&::-webkit-slider-thumb]:bg-[var(--color-primary)]
                                                               [&::-webkit-slider-thumb]:cursor-pointer
                                                               [&::-webkit-slider-thumb]:hover:scale-110
                                                               [&::-webkit-slider-thumb]:transition-transform
                                                               [&::-webkit-slider-thumb]:relative
                                                               [&::-webkit-slider-thumb]:z-10
                                                               [&::-moz-range-thumb]:w-4 
                                                               [&::-moz-range-thumb]:h-4 
                                                               [&::-moz-range-thumb]:rounded-full 
                                                               [&::-moz-range-thumb]:bg-[var(--color-primary)]
                                                               [&::-moz-range-thumb]:border-0
                                                               [&::-moz-range-thumb]:cursor-pointer
                                                               [&::-moz-range-thumb]:relative
                                                               [&::-moz-range-thumb]:z-10"
                                                    />
                                                    <div className="flex justify-between text-xs text-[var(--color-text-muted)] mt-1">
                                                        <span>30s</span>
                                                        <span>5 min</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Start Production Button (Desktop Level) */}
            <div className="flex justify-end">
                <button
                    onClick={handleNext}
                    disabled={!seriesName || !episodeName}
                    className="btn-primary flex items-center gap-2 px-6 py-3 text-lg font-bold shadow-lg hover:shadow-[0_0_20px_rgba(255,159,89,0.4)] hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 rounded-full"
                >
                    Next Step
                    <ArrowRight size={24} />
                </button>
            </div>
        </div >
    );
};
