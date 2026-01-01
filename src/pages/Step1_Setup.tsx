import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore } from '../store/workflowStore';
import { consultStory, type ChatMessage, type AiCharacter } from '../services/gemini';
import { PERSONA_TEMPLATES, DEFAULT_CONSULTANT_INSTRUCTION } from '../data/personaTemplates';
import type { AspectRatio } from '../store/types';
import { compressImage } from '../utils/imageUtils';
import { CheckCircle, Save, ArrowRight, Bot, User, Sparkles, Film, Send, ChevronDown, Plus, Trash2, Edit2, X, MapPin, Clock, Paperclip, Package } from 'lucide-react';
import { ChatMessageItem } from '../components/ChatMessageItem';

export const Step1_Setup: React.FC = () => {
    console.log("Step1_Setup: Rendering");
    const navigate = useNavigate();
    const store = useWorkflowStore();

    // Safe destructuring with default values from STORE
    const {
        id: projectId,
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
    const seriesProps = Array.isArray(store?.seriesProps) ? store.seriesProps : [];
    const episodeProps = Array.isArray(store?.episodeProps) ? store.episodeProps : [];

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
    const [localSeriesProps, setLocalSeriesProps] = useState<any[]>([]);
    const [localEpisodeProps, setLocalEpisodeProps] = useState<any[]>([]);
    const [localAspectRatio, setLocalAspectRatio] = useState<AspectRatio>('16:9');
    const [localStorylineTable, setLocalStorylineTable] = useState<any[]>([]);
    const [customInstructions, setCustomInstructions] = useState(DEFAULT_CONSULTANT_INSTRUCTION);
    const [selectedPersonaKey, setSelectedPersonaKey] = useState<string>('default');

    // State for file attachment
    const [selectedFile, setSelectedFile] = useState<{
        image?: string;
        fileContent?: string;
        fileName?: string;
        fileType?: 'image' | 'text' | 'json';
    } | null>(null);

    // Chat states
    const [inputMessage, setInputMessage] = useState('');
    const [isConsulting, setIsConsulting] = useState(false);

    // Series selector state
    const [availableSeries, setAvailableSeries] = useState<string[]>([]);
    const [isInheritedFromSeries, setIsInheritedFromSeries] = useState(false);



    const chatEndRef = useRef<HTMLDivElement>(null);

    // Completion checks
    const isSeriesComplete = !!(seriesName && seriesStory && characters.length > 0);
    const isEpisodeComplete = !!(episodeName && episodeNumber && episodePlot && episodeCharacters.length > 0);

    // Initialize Local State from Store when entering Edit Mode or on Mount
    useEffect(() => {
        if (!isEditing) {
            setLocalSeriesName(seriesName || '');
            setLocalEpisodeName(episodeName || '');
            setLocalEpisodeNumber(episodeNumber || 1);
            setLocalSeriesStory(seriesStory || '');
            setLocalEpisodePlot(episodePlot || '');
            setLocalTargetDuration(targetDuration || 60);
            setLocalCharacters(JSON.parse(JSON.stringify(characters)));
            setLocalSeriesLocations(JSON.parse(JSON.stringify(seriesLocations)));
            setLocalEpisodeCharacters(JSON.parse(JSON.stringify(episodeCharacters)));

            setLocalEpisodeLocations(JSON.parse(JSON.stringify(episodeLocations)));
            setLocalSeriesProps(JSON.parse(JSON.stringify(seriesProps)));
            setLocalEpisodeProps(JSON.parse(JSON.stringify(episodeProps)));
            setLocalAspectRatio(store.aspectRatio || '16:9');
            setLocalStorylineTable(JSON.parse(JSON.stringify(store.storylineTable || [])));
        }
    }, [isEditing, seriesName, episodeName, episodeNumber, seriesStory, episodePlot, targetDuration, characters, seriesLocations, episodeCharacters, episodeLocations, seriesProps, episodeProps, store.aspectRatio, store.storylineTable]);

    // Initial Mode Logic
    useEffect(() => {
        if (!seriesName || seriesName === 'New Series') {
            setIsEditing(true);
        }
        if (seriesName && seriesName !== 'New Series' && episodeNumber > 1) {
            setIsInheritedFromSeries(true);
        }
    }, [projectId, seriesName]); // Watch projectId to re-evaluate mode

    // 🔴 CRITICAL: Force reset all local states when project ID changes
    // This prevents "Dirty State" leakage from previously loaded projects
    useEffect(() => {
        if (projectId) {
            console.log(`[Step1] Project changed to ${projectId}. Reseting local states.`);
            setLocalSeriesName(seriesName || '');
            setLocalEpisodeName(episodeName || '');
            setLocalEpisodeNumber(episodeNumber || 1);
            setLocalSeriesStory(seriesStory || '');
            setLocalEpisodePlot(episodePlot || '');
            setLocalTargetDuration(targetDuration || 60);
            setLocalCharacters(JSON.parse(JSON.stringify(characters)));
            setLocalSeriesLocations(JSON.parse(JSON.stringify(seriesLocations)));
            setLocalEpisodeCharacters(JSON.parse(JSON.stringify(episodeCharacters)));
            setLocalEpisodeLocations(JSON.parse(JSON.stringify(episodeLocations)));
            setLocalSeriesProps(JSON.parse(JSON.stringify(seriesProps)));
            setLocalEpisodeProps(JSON.parse(JSON.stringify(episodeProps)));
            setLocalAspectRatio(store.aspectRatio || '16:9');
            setLocalStorylineTable(JSON.parse(JSON.stringify(store.storylineTable || [])));

            // If it's a fresh series, start in edit mode
            if (!seriesName || seriesName === 'New Series') {
                setIsEditing(true);
            } else {
                setIsEditing(false);
            }
        }
    }, [projectId]);

    // Load available series names
    useEffect(() => {
        const loadSeries = async () => {
            const { getAllSeriesNames } = await import('../utils/seriesUtils');
            const names = await getAllSeriesNames();
            setAvailableSeries(names);
        };
        if (isEditing) {
            loadSeries();
        }
    }, [isEditing]);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatHistory]);

    useEffect(() => {
        if (store?.currentStep !== 1) {
            store?.setStep(1);
        }
    }, []);

    const handleSave = () => {
        let finalStorylineTable = localStorylineTable;
        // const isPlotChanged = store.episodePlot !== localEpisodePlot;
        // const isTableUnchanged = JSON.stringify(store.storylineTable) === JSON.stringify(localStorylineTable);

        // FIX: Removed auto-clear logic. We now keep the table even if plot changes.
        // if (isPlotChanged && isTableUnchanged && localStorylineTable.length > 0) {
        //    console.log("[Step1] Clearing stale storyline table.");
        //    finalStorylineTable = [];
        // }

        setProjectInfo({
            seriesName: localSeriesName,
            episodeName: localEpisodeName,
            episodeNumber: localEpisodeNumber,
            seriesStory: localSeriesStory,
            episodePlot: localEpisodePlot,
            storylineTable: finalStorylineTable,
            targetDuration: localTargetDuration,
            characters: localCharacters,
            seriesLocations: localSeriesLocations,
            episodeCharacters: localEpisodeCharacters,

            episodeLocations: localEpisodeLocations,
            seriesProps: localSeriesProps,
            episodeProps: localEpisodeProps,
            aspectRatio: localAspectRatio
        });
        setIsEditing(false);
    };

    const handleCancel = () => {
        setIsEditing(false);
    };

    const handleSeriesSelect = async (selectedSeries: string) => {
        if (!selectedSeries) return;
        try {
            const { getLatestProjectBySeries, extractSeriesData, getNextEpisodeNumber } = await import('../utils/seriesUtils');
            const sourceProject = await getLatestProjectBySeries(selectedSeries);
            if (sourceProject) {
                const seriesData = extractSeriesData(sourceProject);
                const nextEpNum = await getNextEpisodeNumber(selectedSeries);
                setLocalSeriesName(seriesData.seriesName || '');
                setLocalSeriesStory(seriesData.seriesStory || '');
                setLocalCharacters(JSON.parse(JSON.stringify(seriesData.characters || [])));
                setLocalSeriesLocations(JSON.parse(JSON.stringify(seriesData.seriesLocations || [])));
                setLocalSeriesProps(JSON.parse(JSON.stringify(seriesData.seriesProps || [])));
                setLocalAspectRatio(seriesData.aspectRatio || '16:9');
                setLocalEpisodeNumber(nextEpNum);
                setLocalEpisodeName(`Episode ${nextEpNum}`);
                setLocalStorylineTable([]);
                setIsInheritedFromSeries(true);
                if (setProjectInfo) {
                    setProjectInfo({
                        ...seriesData,
                        episodeNumber: nextEpNum,
                        episodeName: `Episode ${nextEpNum}`,
                        storylineTable: [],
                        episodePlot: '',
                        episodeCharacters: [],

                        episodeLocations: [],
                        episodeProps: [],
                        script: [],
                        assets: {},
                        visualAssets: {},
                        masterStyle: seriesData.masterStyle || { description: '', referenceImage: null },
                        assetDefinitions: seriesData.assetDefinitions || {},
                        thumbnailUrl: null,
                        thumbnailSettings: seriesData.thumbnailSettings || {
                            mode: 'framing',
                            scale: 1,
                            imagePosition: { x: 0, y: 0 },
                            textPosition: { x: 0, y: 0 },
                            titleSize: 60,
                            seriesTitleSize: 36,
                            textColor: '#ffffff',
                            fontFamily: 'Inter',
                            frameImage: sourceProject.thumbnailSettings?.frameImage || ''
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Failed to load series data:', error);
            alert('Failed to load series data');
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const fileName = file.name;
        const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
        const reader = new FileReader();

        if (file.type.startsWith('image/')) {
            reader.onloadend = async () => {
                const originalImage = reader.result as string;
                try {
                    // Compress image for chat (800px max, 80% quality)
                    const compressedImage = await compressImage(originalImage, 800, 800, 0.8);
                    setSelectedFile({
                        image: compressedImage,
                        fileName: fileName,
                        fileType: 'image'
                    });
                } catch (error) {
                    console.error('Image compression failed, using original:', error);
                    setSelectedFile({
                        image: originalImage,
                        fileName: fileName,
                        fileType: 'image'
                    });
                }
            };
            reader.readAsDataURL(file);
        } else if (fileExt === 'json' || file.type === 'application/json') {
            reader.onloadend = () => {
                setSelectedFile({
                    fileContent: reader.result as string,
                    fileName: fileName,
                    fileType: 'json'
                });
            };
            reader.readAsText(file);
        } else if (['txt', 'md', 'csv', 'text'].includes(fileExt) || file.type.startsWith('text/')) {
            reader.onloadend = () => {
                setSelectedFile({
                    fileContent: reader.result as string,
                    fileName: fileName,
                    fileType: 'text'
                });
            };
            reader.readAsText(file);
        } else {
            alert('Unsupported file type. Supported: Images, JSON, TXT, MD, CSV');
        }
    };

    const handleClearChatHistory = () => {
        if (chatHistory.length === 0) return;
        if (confirm(`Clear all ${chatHistory.length} messages? This cannot be undone.`)) {
            setChatHistory([]);
            console.log('[Step1] Chat history cleared');
        }
    };

    const handleClearAttachments = () => {
        // Count messages with attachments
        const messagesWithAttachments = chatHistory.filter(msg => msg.image || msg.fileContent);
        if (messagesWithAttachments.length === 0) {
            alert('No attachments found in chat history.');
            return;
        }

        if (confirm(`Remove attachments from ${messagesWithAttachments.length} message(s)? Conversation text will be preserved.`)) {
            const cleanedHistory = chatHistory.map(msg => ({
                ...msg,
                image: undefined,
                fileContent: undefined,
                fileName: undefined,
                fileType: undefined
            }));
            setChatHistory(cleanedHistory);
            console.log(`[Step1] Cleared attachments from ${messagesWithAttachments.length} messages`);
        }
    };

    const handlePersonaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const key = e.target.value;
        setSelectedPersonaKey(key);
        const template = PERSONA_TEMPLATES[key];
        if (template) {
            setCustomInstructions(template.instruction);
        }
    };

    // Calculate sizes for display
    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };

    const attachmentSize = React.useMemo(() => {
        return chatHistory.reduce((sum, msg) => {
            const imageSize = msg.image?.length || 0;
            const fileSize = msg.fileContent?.length || 0;
            return sum + imageSize + fileSize;
        }, 0);
    }, [chatHistory]);

    const totalChatSize = React.useMemo(() => {
        return chatHistory.reduce((sum, msg) => {
            return sum + (msg.content?.length || 0) + (msg.image?.length || 0) + (msg.fileContent?.length || 0);
        }, 0);
    }, [chatHistory]);

    const handleSendMessage = async () => {
        if (!inputMessage.trim() && !selectedFile) return;

        if (!apiKeys?.gemini) {
            alert("Please enter a Gemini API Key in the sidebar configuration first.");
            return;
        }

        const newUserMsg: ChatMessage = {
            role: 'user',
            content: inputMessage,
            image: selectedFile?.image,
            fileContent: selectedFile?.fileContent,
            fileName: selectedFile?.fileName,
            fileType: selectedFile?.fileType
        };
        const updatedHistory = [...chatHistory, newUserMsg];
        setChatHistory(updatedHistory);
        setInputMessage('');
        setSelectedFile(null);
        setIsConsulting(true);

        try {
            const context = {
                seriesName,
                episodeName,
                episodeNumber,
                seriesStory,
                characters,
                seriesLocations,
                seriesProps,
                episodePlot,
                episodeCharacters,
                episodeLocations,
                episodeProps,
                targetDuration,
                aspectRatio: store.aspectRatio
            };

            const result = await consultStory(updatedHistory, context, apiKeys.gemini, customInstructions);
            console.log('[Step1] AI Response - suggestedDeletions:', result.suggestedDeletions, 'Full keys:', Object.keys(result));

            // FALLBACK: If AI didn't return suggestedDeletions, try to detect deletion intent from user message
            if (!result.suggestedDeletions) {
                const userMsg = inputMessage.toLowerCase();
                const deletionKeywords = ['삭제', 'delete', 'remove', '지워', '지우', '없애', 'drop'];
                const hasDeleteIntent = deletionKeywords.some(kw => userMsg.includes(kw));

                if (hasDeleteIntent) {
                    console.log('[Step1] Fallback: Detected deletion intent in user message');
                    const detectedDeletions: any = {};

                    // Match against existing characters
                    characters.forEach((c: any) => {
                        if (userMsg.includes(c.name.toLowerCase())) {
                            if (!detectedDeletions.characters) detectedDeletions.characters = [];
                            detectedDeletions.characters.push(c.name);
                        }
                    });

                    // Match against series locations
                    seriesLocations.forEach((l: any) => {
                        if (userMsg.includes(l.name.toLowerCase())) {
                            if (!detectedDeletions.seriesLocations) detectedDeletions.seriesLocations = [];
                            detectedDeletions.seriesLocations.push(l.name);
                        }
                    });

                    // Match against episode characters
                    episodeCharacters.forEach((c: any) => {
                        if (userMsg.includes(c.name.toLowerCase())) {
                            if (!detectedDeletions.episodeCharacters) detectedDeletions.episodeCharacters = [];
                            detectedDeletions.episodeCharacters.push(c.name);
                        }
                    });

                    // Match against episode locations
                    episodeLocations.forEach((l: any) => {
                        if (userMsg.includes(l.name.toLowerCase())) {
                            if (!detectedDeletions.episodeLocations) detectedDeletions.episodeLocations = [];
                            detectedDeletions.episodeLocations.push(l.name);
                        }
                    });

                    // Match against series props
                    seriesProps.forEach((p: any) => {
                        if (userMsg.includes(p.name.toLowerCase())) {
                            if (!detectedDeletions.seriesProps) detectedDeletions.seriesProps = [];
                            detectedDeletions.seriesProps.push(p.name);
                        }
                    });

                    // Match against episode props
                    episodeProps.forEach((p: any) => {
                        if (userMsg.includes(p.name.toLowerCase())) {
                            if (!detectedDeletions.episodeProps) detectedDeletions.episodeProps = [];
                            detectedDeletions.episodeProps.push(p.name);
                        }
                    });

                    if (Object.keys(detectedDeletions).length > 0) {
                        console.log('[Step1] Fallback: Auto-detected deletions:', detectedDeletions);
                        result.suggestedDeletions = detectedDeletions;
                    }
                }
            }

            const newAiMsg: ChatMessage = { role: 'model', content: result.reply };
            setChatHistory([...updatedHistory, newAiMsg]);

            // Auto-populate fields if suggestions exist (including deletions)
            if (result.suggestedSeriesName || result.suggestedEpisodeName || result.suggestedDuration || result.suggestedEpisodeNumber || result.suggestedSeriesStory || result.suggestedMainCharacters || result.suggestedEpisodePlot || result.suggestedEpisodeCharacters || result.suggestedCharacters || result.suggestedSeriesProps || result.suggestedEpisodeProps || result.suggestedDeletions) {
                const updates: Partial<Parameters<typeof setProjectInfo>[0]> = {
                    seriesName: result.suggestedSeriesName || seriesName,
                    episodeName: result.suggestedEpisodeName || episodeName,
                    episodeNumber: result.suggestedEpisodeNumber || episodeNumber,
                    seriesStory: result.suggestedSeriesStory || seriesStory,
                    mainCharacters: result.suggestedMainCharacters || mainCharacters,
                    episodePlot: result.suggestedEpisodePlot || episodePlot,
                    targetDuration: result.suggestedDuration || targetDuration
                };

                // Handle character array from AI - MERGE STRATEGY
                if (result.suggestedCharacters !== undefined && Array.isArray(result.suggestedCharacters)) {
                    // Start with ALL existing characters to prevent deletion
                    const mergedCharacters = [...localCharacters];

                    result.suggestedCharacters.forEach((char: AiCharacter) => {
                        const existingIndex = mergedCharacters.findIndex(c => c.name === char.name);
                        if (existingIndex >= 0) {
                            // Update existing (preserve ID)
                            mergedCharacters[existingIndex] = {
                                ...mergedCharacters[existingIndex],
                                role: char.role || mergedCharacters[existingIndex].role,
                                description: char.description || mergedCharacters[existingIndex].description,
                                visualSummary: char.visualSummary || mergedCharacters[existingIndex].visualSummary,
                                gender: char.gender || mergedCharacters[existingIndex].gender,
                                age: char.age || mergedCharacters[existingIndex].age
                            };
                        } else {
                            // Add new
                            mergedCharacters.push({
                                id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                                name: char.name || '',
                                role: char.role || '',
                                description: char.description || '',
                                visualSummary: char.visualSummary || '',
                                gender: char.gender || undefined,
                                age: char.age || undefined
                            });
                        }
                    });
                    updates.characters = mergedCharacters;
                }

                // Handle episode character array from AI - MERGE STRATEGY
                if (result.suggestedEpisodeCharacters !== undefined && Array.isArray(result.suggestedEpisodeCharacters)) {
                    const mergedEpCharacters = [...localEpisodeCharacters];

                    result.suggestedEpisodeCharacters.forEach((char: AiCharacter) => {
                        const existingIndex = mergedEpCharacters.findIndex(c => c.name === char.name);
                        if (existingIndex >= 0) {
                            mergedEpCharacters[existingIndex] = {
                                ...mergedEpCharacters[existingIndex],
                                role: char.role || mergedEpCharacters[existingIndex].role,
                                description: char.description || mergedEpCharacters[existingIndex].description,
                                visualSummary: char.visualSummary || mergedEpCharacters[existingIndex].visualSummary,
                                gender: char.gender || mergedEpCharacters[existingIndex].gender,
                                age: char.age || mergedEpCharacters[existingIndex].age
                            };
                        } else {
                            mergedEpCharacters.push({
                                id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                                name: char.name || '',
                                role: char.role || '',
                                description: char.description || '',
                                visualSummary: char.visualSummary || '',
                                gender: char.gender || undefined,
                                age: char.age || undefined
                            });
                        }
                    });
                    updates.episodeCharacters = mergedEpCharacters;
                }

                // Handle series locations from AI (allow empty arrays for deletion)
                // Handle series locations from AI (allow empty arrays for deletion)
                // Handle series locations from AI - MERGE STRATEGY
                if (result.suggestedSeriesLocations !== undefined && Array.isArray(result.suggestedSeriesLocations)) {
                    const mergedLocs = [...localSeriesLocations];

                    result.suggestedSeriesLocations.forEach((loc: any) => {
                        const existingIndex = mergedLocs.findIndex(l => l.name === loc.name);
                        if (existingIndex >= 0) {
                            mergedLocs[existingIndex] = {
                                ...mergedLocs[existingIndex],
                                description: loc.description || mergedLocs[existingIndex].description,
                                visualSummary: loc.visualSummary || mergedLocs[existingIndex].visualSummary
                            };
                        } else {
                            mergedLocs.push({
                                id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                                name: loc.name || '',
                                description: loc.description || '',
                                visualSummary: loc.visualSummary || ''
                            });
                        }
                    });
                    updates.seriesLocations = mergedLocs;
                }

                // Handle episode locations from AI (allow empty arrays for deletion)
                // Handle episode locations from AI (allow empty arrays for deletion)
                // Handle episode locations from AI - MERGE STRATEGY
                if (result.suggestedEpisodeLocations !== undefined && Array.isArray(result.suggestedEpisodeLocations)) {
                    const mergedLocs = [...localEpisodeLocations];

                    result.suggestedEpisodeLocations.forEach((loc: any) => {
                        const existingIndex = mergedLocs.findIndex(l => l.name === loc.name);
                        if (existingIndex >= 0) {
                            mergedLocs[existingIndex] = {
                                ...mergedLocs[existingIndex],
                                description: loc.description || mergedLocs[existingIndex].description,
                                visualSummary: loc.visualSummary || mergedLocs[existingIndex].visualSummary
                            };
                        } else {
                            mergedLocs.push({
                                id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                                name: loc.name || '',
                                description: loc.description || '',
                                visualSummary: loc.visualSummary || ''
                            });
                        }
                    });
                    updates.episodeLocations = mergedLocs;
                }

                // Handle series props from AI (allow empty arrays for deletion)
                // Handle series props from AI (allow empty arrays for deletion)
                // Handle series props from AI - MERGE STRATEGY
                if (result.suggestedSeriesProps !== undefined && Array.isArray(result.suggestedSeriesProps)) {
                    const mergedProps = [...localSeriesProps];

                    result.suggestedSeriesProps.forEach((prop: any) => {
                        const existingIndex = mergedProps.findIndex(p => p.name === prop.name);
                        if (existingIndex >= 0) {
                            mergedProps[existingIndex] = {
                                ...mergedProps[existingIndex],
                                description: prop.description || mergedProps[existingIndex].description,
                                visualSummary: prop.visualSummary || mergedProps[existingIndex].visualSummary
                            };
                        } else {
                            mergedProps.push({
                                id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                                name: prop.name || '',
                                description: prop.description || '',
                                visualSummary: prop.visualSummary || ''
                            });
                        }
                    });
                    updates.seriesProps = mergedProps;
                }

                // Handle episode props from AI (allow empty arrays for deletion)
                // Handle episode props from AI (allow empty arrays for deletion)
                // Handle episode props from AI - MERGE STRATEGY
                if (result.suggestedEpisodeProps !== undefined && Array.isArray(result.suggestedEpisodeProps)) {
                    const mergedProps = [...localEpisodeProps];

                    result.suggestedEpisodeProps.forEach((prop: any) => {
                        const existingIndex = mergedProps.findIndex(p => p.name === prop.name);
                        if (existingIndex >= 0) {
                            mergedProps[existingIndex] = {
                                ...mergedProps[existingIndex],
                                description: prop.description || mergedProps[existingIndex].description,
                                visualSummary: prop.visualSummary || mergedProps[existingIndex].visualSummary
                            };
                        } else {
                            mergedProps.push({
                                id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                                name: prop.name || '',
                                description: prop.description || '',
                                visualSummary: prop.visualSummary || ''
                            });
                        }
                    });
                    updates.episodeProps = mergedProps;
                }

                // Handle storyline scenes from AI
                if (result.suggestedStorylineScenes !== undefined && Array.isArray(result.suggestedStorylineScenes)) {
                    const newScenes = result.suggestedStorylineScenes.map((scene: any) => ({
                        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                        sceneNumber: scene.sceneNumber || 0,
                        estimatedTime: scene.estimatedTime || '',
                        content: scene.content || '',
                        directionNotes: scene.directionNotes || ''
                    }));
                    updates.storylineTable = newScenes;
                }

                // Handle deletions from AI
                if (result.suggestedDeletions && typeof result.suggestedDeletions === 'object') {
                    const del = result.suggestedDeletions;
                    console.log('[Step1] Processing deletions:', del);

                    // Delete characters
                    if (del.characters && Array.isArray(del.characters) && del.characters.length > 0) {
                        const toDelete = new Set(del.characters.map((n: string) => n.toLowerCase().trim()));
                        console.log('[Step1] Deleting characters:', Array.from(toDelete));
                        updates.characters = (updates.characters || localCharacters).filter(
                            (c: any) => !toDelete.has(c.name.toLowerCase().trim())
                        );
                        console.log('[Step1] Characters after deletion:', updates.characters?.map((c: any) => c.name));
                    }

                    // Delete series locations
                    if (del.seriesLocations && Array.isArray(del.seriesLocations) && del.seriesLocations.length > 0) {
                        const toDelete = new Set(del.seriesLocations.map((n: string) => n.toLowerCase().trim()));
                        console.log('[Step1] Deleting series locations:', Array.from(toDelete));
                        updates.seriesLocations = (updates.seriesLocations || localSeriesLocations).filter(
                            (l: any) => !toDelete.has(l.name.toLowerCase().trim())
                        );
                    }

                    // Delete episode characters
                    if (del.episodeCharacters && Array.isArray(del.episodeCharacters) && del.episodeCharacters.length > 0) {
                        const toDelete = new Set(del.episodeCharacters.map((n: string) => n.toLowerCase().trim()));
                        console.log('[Step1] Deleting episode characters:', Array.from(toDelete));
                        updates.episodeCharacters = (updates.episodeCharacters || localEpisodeCharacters).filter(
                            (c: any) => !toDelete.has(c.name.toLowerCase().trim())
                        );
                    }

                    // Delete episode locations
                    if (del.episodeLocations && Array.isArray(del.episodeLocations) && del.episodeLocations.length > 0) {
                        const toDelete = new Set(del.episodeLocations.map((n: string) => n.toLowerCase().trim()));
                        console.log('[Step1] Deleting episode locations:', Array.from(toDelete));
                        updates.episodeLocations = (updates.episodeLocations || localEpisodeLocations).filter(
                            (l: any) => !toDelete.has(l.name.toLowerCase().trim())
                        );
                    }

                    // Delete series props
                    if (del.seriesProps && Array.isArray(del.seriesProps) && del.seriesProps.length > 0) {
                        const toDelete = new Set(del.seriesProps.map((n: string) => n.toLowerCase().trim()));
                        console.log('[Step1] Deleting series props:', Array.from(toDelete));
                        updates.seriesProps = (updates.seriesProps || localSeriesProps).filter(
                            (p: any) => !toDelete.has(p.name.toLowerCase().trim())
                        );
                    }

                    // Delete episode props
                    if (del.episodeProps && Array.isArray(del.episodeProps) && del.episodeProps.length > 0) {
                        const toDelete = new Set(del.episodeProps.map((n: string) => n.toLowerCase().trim()));
                        console.log('[Step1] Deleting episode props:', Array.from(toDelete));
                        updates.episodeProps = (updates.episodeProps || localEpisodeProps).filter(
                            (p: any) => !toDelete.has(p.name.toLowerCase().trim())
                        );
                    }
                }

                setProjectInfo(updates);

                // Force View Mode to show new data
                setIsEditing(false);
            }

        } catch (error: any) {
            console.error("Consultation failed:", error);
            // Extract more detailed error information
            const errorStatus = error?.response?.status;
            const errorMessage = error?.response?.data?.error?.message || error?.message || 'Unknown error';
            const errorDetail = `[${errorStatus || 'ERR'}] ${errorMessage}`;
            console.error("API Error Details:", { status: errorStatus, message: errorMessage, full: error });
            setChatHistory([...updatedHistory, { role: 'model', content: `⚠️ API Error: ${errorDetail}\n\nPlease check:\n1. API key is valid and not expired\n2. Billing is enabled in Google AI Studio\n3. API is enabled in your Google Cloud project` }]);
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
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent border-b border-[var(--color-border)] flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <Sparkles className="text-[var(--color-primary)]" size={28} />
                            <h2 className="text-2xl font-bold text-white">AI Story Consultant</h2>
                        </div>
                        {chatHistory.length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-[var(--color-primary)] font-bold">Clear:</span>
                                {/* Clear Attachments Only */}
                                <button
                                    onClick={handleClearAttachments}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 hover:text-yellow-300 transition-all border border-yellow-500/20 hover:border-yellow-500/50 text-xs font-medium"
                                    title="Remove images/files from messages but keep conversation text"
                                >
                                    <Paperclip size={12} />
                                    <span>Files{attachmentSize > 0 ? ` (${formatSize(attachmentSize)})` : ''}</span>
                                </button>
                                {/* Clear All Messages */}
                                <button
                                    onClick={handleClearChatHistory}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all border border-red-500/20 hover:border-red-500/50 text-xs font-medium"
                                    title="Clear entire chat history"
                                >
                                    <Trash2 size={12} />
                                    <span>All ({formatSize(totalChatSize)})</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* System Prompt Panel (Collapsible) */}
                    <details className="group border-b border-[var(--color-primary)]/30 bg-[var(--color-surface)]/50">
                        <summary className="px-4 py-3 cursor-pointer flex items-center justify-between bg-gradient-to-r from-[var(--color-primary)]/20 via-[var(--color-primary)]/5 to-transparent hover:from-[var(--color-primary)]/30 transition-all select-none">
                            <div className="flex items-center gap-4 flex-1 overflow-hidden">
                                <span className="text-sm font-bold text-[var(--color-primary)] flex items-center gap-2 whitespace-nowrap">
                                    🤖 AI System Instructions
                                </span>
                                <div onClick={(e) => e.stopPropagation()} className="flex-1 max-w-xs">
                                    <select
                                        value={selectedPersonaKey}
                                        onChange={handlePersonaChange}
                                        className="w-full bg-[#1a1a1a] text-white text-xs border border-[var(--color-primary)]/30 rounded px-2 py-1.5 outline-none focus:border-[var(--color-primary)] shadow-sm"
                                    >
                                        {Object.entries(PERSONA_TEMPLATES).map(([key, template]) => (
                                            <option key={key} value={key}>
                                                {template.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 pl-2">
                                <ChevronDown size={14} className="text-[var(--color-primary)] group-open:rotate-180 transition-transform" />
                            </div>
                        </summary>
                        <div className="px-4 pb-4 pt-2 space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-xs text-[var(--color-text-muted)] italic">
                                    {PERSONA_TEMPLATES[selectedPersonaKey]?.description}
                                </span>
                                <button
                                    onClick={() => {
                                        const template = PERSONA_TEMPLATES[selectedPersonaKey];
                                        if (template) setCustomInstructions(template.instruction);
                                    }}
                                    className="text-xs text-[var(--color-primary)] hover:underline whitespace-nowrap"
                                >
                                    Reset to Default
                                </button>
                            </div>
                            <textarea
                                value={customInstructions}
                                onChange={(e) => setCustomInstructions(e.target.value)}
                                className="w-full h-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-sm text-gray-200 font-mono leading-relaxed outline-none focus:border-[var(--color-primary)] resize-y shadow-inner"
                                placeholder="Enter custom instructions for the AI consultant..."
                            />
                            <p className="text-xs text-[var(--color-text-muted)]">
                                * Variables like {"{{seriesName}}"} will be replaced with actual project data.
                            </p>
                        </div>
                    </details>

                    <div className="flex-1 overflow-y-auto space-y-4 p-6 min-h-0">
                        {chatHistory.length === 0 && (
                            <div className="text-center text-[var(--color-text-muted)] py-12">
                                <Bot size={48} className="mx-auto mb-4 opacity-50" />
                                <p className="text-lg">AI 스토리 제안을 받으려면 대화를 시작하세요!</p>
                                <p className="text-sm mt-2">시리즈, 캐릭터, 플롯 아이디어 등 무엇이든 물어보세요.</p>
                            </div>
                        )}


                        {chatHistory.map((msg, idx) => (
                            <ChatMessageItem key={idx} msg={msg} />
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

                    <div className="flex-shrink-0 p-6 pt-0 space-y-3">
                        {/* File Preview */}
                        {selectedFile && (
                            <div className="relative inline-block group">
                                {selectedFile.image ? (
                                    <img src={selectedFile.image} alt="Upload preview" className="h-20 rounded-lg border border-[var(--color-border)] shadow-md" />
                                ) : (
                                    <div className="px-4 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center gap-2">
                                        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${selectedFile.fileType === 'json' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                            {selectedFile.fileType}
                                        </span>
                                        <span className="text-sm text-white truncate max-w-[200px]">{selectedFile.fileName}</span>
                                    </div>
                                )}
                                <button
                                    onClick={() => setSelectedFile(null)}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        )}

                        <div className="flex gap-2 items-end">
                            {/* Hidden File Input - Extended types */}
                            <input
                                type="file"
                                accept="image/*,.json,.txt,.md,.csv,text/plain,application/json"
                                className="hidden"
                                id="chat-file-upload"
                                onChange={handleFileUpload}
                            />

                            {/* Upload Button */}
                            <button
                                onClick={() => document.getElementById('chat-file-upload')?.click()}
                                className="p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-gray-400 hover:text-white hover:border-[var(--color-primary)] transition-all hover:bg-[var(--color-surface-highlight)]"
                                title="Upload File (Image, JSON, TXT, MD, CSV)"
                            >
                                <Paperclip size={20} />
                            </button>

                            {/* Text Input */}
                            <textarea
                                className="input-field flex-1 min-h-[48px] max-h-32 py-3 resize-none"
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                                placeholder="Ask about your story (or upload an image)..."
                                disabled={isConsulting}
                                rows={1}
                                style={{ height: 'auto' }}
                            />

                            {/* Send Button */}
                            <button
                                onClick={handleSendMessage}
                                disabled={isConsulting || (!inputMessage.trim() && !selectedFile)}
                                className="p-3 rounded-xl bg-[var(--color-primary)] text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-[var(--color-primary)]/20"
                            >
                                <Send size={20} />
                            </button>
                        </div>
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
                                    onClick={() => {
                                        setIsEditing(true);
                                    }}
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
                                        {seriesStory && (
                                            <div>
                                                <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-1">Series Story</label>
                                                <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{seriesStory}</p>
                                            </div>
                                        )}
                                        {characters.length > 0 && (
                                            <div>
                                                <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-2">Main Characters</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {characters.map(c => (
                                                        <div key={c.id} className="px-3 py-1.5 rounded-full bg-[var(--color-surface-highlight)] border border-[var(--color-border)] flex items-center gap-2">
                                                            <User size={14} className="text-[var(--color-primary)]" />
                                                            <span className="font-bold text-sm">{c.name}</span>
                                                            <span className="text-xs text-gray-400">({c.role})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {seriesLocations.length > 0 && (
                                            <div>
                                                <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-2">Series Locations</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {seriesLocations.map(l => (
                                                        <div key={l.id} className="px-3 py-1.5 rounded-full bg-[var(--color-surface-highlight)] border border-[var(--color-border)] flex items-center gap-2">
                                                            <MapPin size={14} className="text-[var(--color-primary)]" />
                                                            <span className="font-bold text-sm">{l.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {seriesProps.length > 0 && (
                                            <div>
                                                <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-2">Series Props</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {seriesProps.map(p => (
                                                        <div key={p.id} className="px-3 py-1.5 rounded-full bg-[var(--color-surface-highlight)] border border-[var(--color-border)] flex items-center gap-2">
                                                            <Package size={14} className="text-[var(--color-primary)]" />
                                                            <span className="font-bold text-sm">{p.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {store.aspectRatio && (
                                            <div>
                                                <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-1">Aspect Ratio</label>
                                                <span className="px-2 py-1 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-mono text-[var(--color-primary)]">
                                                    {store.aspectRatio}
                                                </span>
                                            </div>
                                        )}
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
                                        {episodePlot && (
                                            <div>
                                                <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-1">Episode Plot</label>
                                                <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{episodePlot}</p>
                                            </div>
                                        )}

                                        {/* Storyline Table (View Mode - Compact) */}
                                        {store.storylineTable && store.storylineTable.length > 0 && (
                                            <div className="space-y-2">
                                                <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-2 flex items-center gap-2">
                                                    <Film size={14} className="text-[var(--color-primary)]" />
                                                    Storyline Table ({store.storylineTable.length} scenes)
                                                </label>
                                                <div className="space-y-2 p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                                    {store.storylineTable.map((scene) => (
                                                        <div key={scene.id} className="bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 transition-colors">
                                                            <div className="flex items-start gap-4">
                                                                <div className="flex-shrink-0 w-8 text-center pt-1">
                                                                    <div className="text-[var(--color-primary)] font-bold text-base">#{scene.sceneNumber}</div>
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 mb-1">
                                                                        {scene.estimatedTime && (
                                                                            <span className="flex-shrink-0 font-mono text-yellow-500 text-xs font-bold bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">
                                                                                {scene.estimatedTime}
                                                                            </span>
                                                                        )}
                                                                        <span className="text-sm font-semibold text-white leading-snug">
                                                                            {scene.content || '-'}
                                                                        </span>
                                                                    </div>
                                                                    {scene.directionNotes && (
                                                                        <div className="text-xs text-gray-400 italic pl-0 sm:pl-0 border-l-2 border-gray-700 pl-2 mt-1">
                                                                            {scene.directionNotes}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {episodeCharacters.length > 0 && (
                                            <div>
                                                <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-2">Episode Characters</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {episodeCharacters.map(c => (
                                                        <div key={c.id} className="px-3 py-1.5 rounded-full bg-[var(--color-surface-highlight)] border border-[var(--color-border)] flex items-center gap-2">
                                                            <User size={14} className="text-[var(--color-primary)]" />
                                                            <span className="font-bold text-sm">{c.name}</span>
                                                            <span className="text-xs text-gray-400">({c.role})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {episodeLocations.length > 0 && (
                                            <div>
                                                <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-2">Episode Locations</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {episodeLocations.map(l => (
                                                        <div key={l.id} className="px-3 py-1.5 rounded-full bg-[var(--color-surface-highlight)] border border-[var(--color-border)] flex items-center gap-2">
                                                            <MapPin size={14} className="text-[var(--color-primary)]" />
                                                            <span className="font-bold text-sm">{l.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {episodeProps.length > 0 && (
                                            <div>
                                                <label className="text-xs text-[var(--color-text-muted)] uppercase block mb-2">Episode Props</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {episodeProps.map(p => (
                                                        <div key={p.id} className="px-3 py-1.5 rounded-full bg-[var(--color-surface-highlight)] border border-[var(--color-border)] flex items-center gap-2">
                                                            <Package size={14} className="text-[var(--color-primary)]" />
                                                            <span className="font-bold text-sm">{p.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
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
                                    <div className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent border-b border-[var(--color-border)]">
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-sm font-bold text-[var(--color-primary)] uppercase tracking-widest">Series Level</h4>
                                            {isSeriesComplete && <CheckCircle size={18} className="text-green-500" />}
                                        </div>
                                    </div>

                                    <div className="p-4 pt-4 space-y-6 animate-fade-in">
                                        {/* SERIES SELECTOR - Only show when creating new project */}
                                        {(!localSeriesName || localSeriesName === 'New Series') && availableSeries.length > 0 && (
                                            <div className="space-y-2 p-4 bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 rounded-lg">
                                                <label className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-wider flex items-center gap-2">
                                                    <Film size={14} />
                                                    Link to Existing Series (Optional)
                                                </label>
                                                <select
                                                    onChange={(e) => handleSeriesSelect(e.target.value)}
                                                    className="input-field text-sm"
                                                    defaultValue=""
                                                >
                                                    <option value="">-- Start New Series --</option>
                                                    {availableSeries.map((series) => (
                                                        <option key={series} value={series}>
                                                            {series}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-xs text-gray-400">
                                                    Select an existing series to inherit characters, locations, and master style
                                                </p>
                                            </div>
                                        )}

                                        {/* Inheritance Indicator */}
                                        {isInheritedFromSeries && (
                                            <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                                                <CheckCircle size={16} className="text-green-400" />
                                                <span className="text-xs text-green-300 font-medium">
                                                    Series data inherited from "{localSeriesName}"
                                                </span>
                                            </div>
                                        )}

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
                                                    onClick={() => setLocalCharacters([...localCharacters, { id: Date.now().toString(), name: '', role: '', description: '', visualSummary: '' }])}
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
                                                                <div className="flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Role (e.g. Protagonist)"
                                                                        className="flex-1 bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none py-1 text-xs text-[var(--color-primary)] placeholder-gray-600"
                                                                        value={char.role}
                                                                        onChange={(e) => {
                                                                            const newChars = [...localCharacters];
                                                                            newChars[index].role = e.target.value;
                                                                            setLocalCharacters(newChars);
                                                                        }}
                                                                    />
                                                                    <select
                                                                        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                                                                        value={char.gender || ''}
                                                                        onChange={(e) => {
                                                                            const newChars = [...localCharacters];
                                                                            newChars[index].gender = e.target.value as 'male' | 'female' | 'other' | undefined;
                                                                            setLocalCharacters(newChars);
                                                                        }}
                                                                    >
                                                                        <option value="">Gender</option>
                                                                        <option value="male">♂ Male</option>
                                                                        <option value="female">♀ Female</option>
                                                                        <option value="other">Other</option>
                                                                    </select>
                                                                    <select
                                                                        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                                                                        value={char.age || ''}
                                                                        onChange={(e) => {
                                                                            const newChars = [...localCharacters];
                                                                            newChars[index].age = e.target.value as 'child' | 'young' | 'adult' | 'senior' | undefined;
                                                                            setLocalCharacters(newChars);
                                                                        }}
                                                                    >
                                                                        <option value="">Age</option>
                                                                        <option value="child">👶 Child</option>
                                                                        <option value="young">🧑 Young</option>
                                                                        <option value="adult">👤 Adult</option>
                                                                        <option value="senior">👴 Senior</option>
                                                                    </select>
                                                                </div>
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
                                                            placeholder="Story Context: Personality, background, role in the story..."
                                                            className="w-full bg-transparent border border-[var(--color-border)] rounded-lg p-2 text-sm text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none h-16 placeholder-gray-600 mb-2"
                                                            value={char.description}
                                                            onChange={(e) => {
                                                                const newChars = [...localCharacters];
                                                                newChars[index].description = e.target.value;
                                                                setLocalCharacters(newChars);
                                                            }}
                                                        />
                                                        <textarea
                                                            placeholder="Visual Appearance: Describe physical look, clothing, style (Passed to Image Generator)"
                                                            className="w-full bg-black/20 border border-[var(--color-primary)]/30 rounded-lg p-2 text-sm text-[var(--color-primary)] focus:border-[var(--color-primary)] outline-none resize-none h-20 placeholder-[var(--color-primary)]/40"
                                                            value={char.visualSummary || ''}
                                                            onChange={(e) => {
                                                                const newChars = [...localCharacters];
                                                                newChars[index].visualSummary = e.target.value;
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
                                                    onClick={() => setLocalSeriesLocations([...localSeriesLocations, { id: Date.now().toString(), name: '', description: '', visualSummary: '' }])}
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
                                                            placeholder="Story Context: History, significance, atmosphere..."
                                                            className="w-full bg-transparent border border-[var(--color-border)] rounded-lg p-2 text-sm text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none h-16 placeholder-gray-600 mb-2"
                                                            value={loc.description}
                                                            onChange={(e) => {
                                                                const newLocs = [...localSeriesLocations];
                                                                newLocs[index].description = e.target.value;
                                                                setLocalSeriesLocations(newLocs);
                                                            }}
                                                        />
                                                        <textarea
                                                            placeholder="Visual Appearance: Describe architecture, lighting, colors (Passed to Image Generator)"
                                                            className="w-full bg-black/20 border border-[var(--color-primary)]/30 rounded-lg p-2 text-sm text-[var(--color-primary)] focus:border-[var(--color-primary)] outline-none resize-none h-20 placeholder-[var(--color-primary)]/40"
                                                            value={loc.visualSummary || ''}
                                                            onChange={(e) => {
                                                                const newLocs = [...localSeriesLocations];
                                                                newLocs[index].visualSummary = e.target.value;
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

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                {renderLabel("Series Props", localSeriesProps.length > 0)}
                                                <button
                                                    onClick={() => setLocalSeriesProps([...localSeriesProps, { id: Date.now().toString(), name: '', description: '', visualSummary: '' }])}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors text-xs font-bold"
                                                >
                                                    <Plus size={14} />
                                                    Add Prop
                                                </button>
                                            </div>

                                            <div className="space-y-4">
                                                {localSeriesProps.map((prop, index) => (
                                                    <div key={prop.id} className="group relative bg-[var(--color-bg)] p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
                                                        <div className="flex justify-between items-start gap-4 mb-3">
                                                            <div className="flex-1">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Prop Name (e.g. Logo, Weapon)"
                                                                    className="w-full bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none py-1 font-bold text-white placeholder-gray-600"
                                                                    value={prop.name}
                                                                    onChange={(e) => {
                                                                        const newProps = [...localSeriesProps];
                                                                        newProps[index].name = e.target.value;
                                                                        setLocalSeriesProps(newProps);
                                                                    }}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    const newProps = localSeriesProps.filter(p => p.id !== prop.id);
                                                                    setLocalSeriesProps(newProps);
                                                                }}
                                                                className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                        <textarea
                                                            placeholder="Description: Significance, usage..."
                                                            className="w-full bg-transparent border border-[var(--color-border)] rounded-lg p-2 text-sm text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none h-16 placeholder-gray-600 mb-2"
                                                            value={prop.description}
                                                            onChange={(e) => {
                                                                const newProps = [...localSeriesProps];
                                                                newProps[index].description = e.target.value;
                                                                setLocalSeriesProps(newProps);
                                                            }}
                                                        />
                                                        <textarea
                                                            placeholder="Visual Appearance: Describe look, colors (Passed to Image Generator)"
                                                            className="w-full bg-black/20 border border-[var(--color-primary)]/30 rounded-lg p-2 text-sm text-[var(--color-primary)] focus:border-[var(--color-primary)] outline-none resize-none h-20 placeholder-[var(--color-primary)]/40"
                                                            value={prop.visualSummary || ''}
                                                            onChange={(e) => {
                                                                const newProps = [...localSeriesProps];
                                                                newProps[index].visualSummary = e.target.value;
                                                                setLocalSeriesProps(newProps);
                                                            }}
                                                        />
                                                    </div>
                                                ))}
                                                {localSeriesProps.length === 0 && (
                                                    <div className="text-center py-8 border-2 border-dashed border-[var(--color-border)] rounded-xl text-[var(--color-text-muted)] text-sm">
                                                        No series props added.
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
                                </div>


                                {/* EPISODE SECTION */}
                                <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden transition-all duration-300 mt-6">
                                    <div className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-[var(--color-primary)]/10 to-transparent border-b border-[var(--color-border)]">
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-sm font-bold text-[var(--color-primary)] uppercase tracking-widest">Episode Level</h4>
                                            {isEpisodeComplete && <CheckCircle size={18} className="text-green-500" />}
                                        </div>
                                    </div>

                                    <div className="p-4 pt-4 space-y-6 animate-fade-in">
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

                                        {/* Storyline Table (Non-Collapsible) */}
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <Film size={18} className="text-[var(--color-primary)]" />
                                                    <span className="text-sm font-bold text-white">Storyline Table</span>
                                                    <span className="text-xs text-gray-400">({localStorylineTable.length} scenes)</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newScene = {
                                                            id: Date.now().toString(),
                                                            sceneNumber: localStorylineTable.length + 1,
                                                            estimatedTime: '',
                                                            content: '',
                                                            directionNotes: ''
                                                        };
                                                        setLocalStorylineTable([...localStorylineTable, newScene]);
                                                    }}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors text-xs font-bold"
                                                >
                                                    <Plus size={14} />
                                                    Add Scene
                                                </button>
                                            </div>

                                            <div className="space-y-3 p-4 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
                                                <p className="text-xs text-gray-400 mb-2">Break down your episode into key scenes with timing and direction notes</p>

                                                {localStorylineTable.length === 0 ? (
                                                    <div className="text-center py-8 text-gray-500">
                                                        <Film size={40} className="mx-auto mb-2 opacity-30" />
                                                        <p className="text-sm">No scenes yet. Click "Add Scene" to start building your storyline.</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {localStorylineTable.map((scene, index) => (
                                                            <div key={scene.id} className="group relative bg-[var(--color-surface)] p-3 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
                                                                <div className="flex items-start gap-4">
                                                                    <div className="flex-shrink-0 w-8 text-center pt-2">
                                                                        <div className="text-[var(--color-primary)] font-bold text-base">#{scene.sceneNumber}</div>
                                                                    </div>
                                                                    <div className="flex-1 space-y-2">
                                                                        {/* Row 1: Time + Content */}
                                                                        <div className="flex gap-2">
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Time (e.g. 0:00-1:00)"
                                                                                className="w-24 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm font-mono text-yellow-400 focus:border-[var(--color-primary)] outline-none"
                                                                                value={scene.estimatedTime}
                                                                                onChange={(e) => {
                                                                                    const newTable = [...localStorylineTable];
                                                                                    newTable[index].estimatedTime = e.target.value;
                                                                                    setLocalStorylineTable(newTable);
                                                                                }}
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Scene Content (Summary of events)"
                                                                                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-1.5 text-sm font-semibold text-white focus:border-[var(--color-primary)] outline-none"
                                                                                value={scene.content}
                                                                                onChange={(e) => {
                                                                                    const newTable = [...localStorylineTable];
                                                                                    newTable[index].content = e.target.value;
                                                                                    setLocalStorylineTable(newTable);
                                                                                }}
                                                                            />
                                                                        </div>
                                                                        {/* Row 2: Direction */}
                                                                        <textarea
                                                                            placeholder="Direction Notes: Visual mood, lighting, key actions..."
                                                                            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none h-14"
                                                                            value={scene.directionNotes}
                                                                            onChange={(e) => {
                                                                                const newTable = [...localStorylineTable];
                                                                                newTable[index].directionNotes = e.target.value;
                                                                                setLocalStorylineTable(newTable);
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <button
                                                                        onClick={() => {
                                                                            const newTable = localStorylineTable.filter(s => s.id !== scene.id);
                                                                            // Re-number scenes
                                                                            const renumbered = newTable.map((s, i) => ({ ...s, sceneNumber: i + 1 }));
                                                                            setLocalStorylineTable(renumbered);
                                                                        }}
                                                                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all self-center"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                {renderLabel("Episode Characters", localEpisodeCharacters.length > 0)}
                                                <button
                                                    onClick={() => setLocalEpisodeCharacters([...localEpisodeCharacters, { id: Date.now().toString(), name: '', role: '', description: '', visualSummary: '' }])}
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
                                                                <div className="flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Role (e.g. Antagonist)"
                                                                        className="flex-1 bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none py-1 text-xs text-[var(--color-primary)] placeholder-gray-600"
                                                                        value={char.role}
                                                                        onChange={(e) => {
                                                                            const newChars = [...localEpisodeCharacters];
                                                                            newChars[index].role = e.target.value;
                                                                            setLocalEpisodeCharacters(newChars);
                                                                        }}
                                                                    />
                                                                    <select
                                                                        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                                                                        value={char.gender || ''}
                                                                        onChange={(e) => {
                                                                            const newChars = [...localEpisodeCharacters];
                                                                            newChars[index].gender = e.target.value as 'male' | 'female' | 'other' | undefined;
                                                                            setLocalEpisodeCharacters(newChars);
                                                                        }}
                                                                    >
                                                                        <option value="">Gender</option>
                                                                        <option value="male">♂ Male</option>
                                                                        <option value="female">♀ Female</option>
                                                                        <option value="other">Other</option>
                                                                    </select>
                                                                    <select
                                                                        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                                                                        value={char.age || ''}
                                                                        onChange={(e) => {
                                                                            const newChars = [...localEpisodeCharacters];
                                                                            newChars[index].age = e.target.value as 'child' | 'young' | 'adult' | 'senior' | undefined;
                                                                            setLocalEpisodeCharacters(newChars);
                                                                        }}
                                                                    >
                                                                        <option value="">Age</option>
                                                                        <option value="child">👶 Child</option>
                                                                        <option value="young">🧑 Young</option>
                                                                        <option value="adult">👤 Adult</option>
                                                                        <option value="senior">👴 Senior</option>
                                                                    </select>
                                                                </div>
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
                                                            placeholder="Story Context: Role in this episode..."
                                                            className="w-full bg-transparent border border-[var(--color-border)] rounded-lg p-2 text-sm text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none h-16 placeholder-gray-600 mb-2"
                                                            value={char.description}
                                                            onChange={(e) => {
                                                                const newChars = [...localEpisodeCharacters];
                                                                newChars[index].description = e.target.value;
                                                                setLocalEpisodeCharacters(newChars);
                                                            }}
                                                        />
                                                        <textarea
                                                            placeholder="Visual Appearance: Describe physical look (Passed to Image Generator)"
                                                            className="w-full bg-black/20 border border-[var(--color-primary)]/30 rounded-lg p-2 text-sm text-[var(--color-primary)] focus:border-[var(--color-primary)] outline-none resize-none h-20 placeholder-[var(--color-primary)]/40"
                                                            value={char.visualSummary || ''}
                                                            onChange={(e) => {
                                                                const newChars = [...localEpisodeCharacters];
                                                                newChars[index].visualSummary = e.target.value;
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
                                                    onClick={() => setLocalEpisodeLocations([...localEpisodeLocations, { id: Date.now().toString(), name: '', description: '', visualSummary: '' }])}
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
                                                            placeholder="Story Context: Role in this episode, atmosphere..."
                                                            className="w-full bg-transparent border border-[var(--color-border)] rounded-lg p-2 text-sm text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none h-16 placeholder-gray-600 mb-2"
                                                            value={loc.description}
                                                            onChange={(e) => {
                                                                const newLocs = [...localEpisodeLocations];
                                                                newLocs[index].description = e.target.value;
                                                                setLocalEpisodeLocations(newLocs);
                                                            }}
                                                        />
                                                        <textarea
                                                            placeholder="Visual Appearance: Describe aesthetics for AI generation (Passed to Image Generator)"
                                                            className="w-full bg-black/20 border border-[var(--color-primary)]/30 rounded-lg p-2 text-sm text-[var(--color-primary)] focus:border-[var(--color-primary)] outline-none resize-none h-20 placeholder-[var(--color-primary)]/40"
                                                            value={loc.visualSummary || ''}
                                                            onChange={(e) => {
                                                                const newLocs = [...localEpisodeLocations];
                                                                newLocs[index].visualSummary = e.target.value;
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

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                {renderLabel("Episode Props", localEpisodeProps.length > 0)}
                                                <button
                                                    onClick={() => setLocalEpisodeProps([...localEpisodeProps, { id: Date.now().toString(), name: '', description: '', visualSummary: '' }])}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors text-xs font-bold"
                                                >
                                                    <Plus size={14} />
                                                    Add Prop
                                                </button>
                                            </div>

                                            <div className="space-y-4">
                                                {localEpisodeProps.map((prop, index) => (
                                                    <div key={prop.id} className="group relative bg-[var(--color-bg)] p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
                                                        <div className="flex justify-between items-start gap-4 mb-3">
                                                            <div className="flex-1">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Prop Name"
                                                                    className="w-full bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none py-1 font-bold text-white placeholder-gray-600"
                                                                    value={prop.name}
                                                                    onChange={(e) => {
                                                                        const newProps = [...localEpisodeProps];
                                                                        newProps[index].name = e.target.value;
                                                                        setLocalEpisodeProps(newProps);
                                                                    }}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    const newProps = localEpisodeProps.filter(p => p.id !== prop.id);
                                                                    setLocalEpisodeProps(newProps);
                                                                }}
                                                                className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                        <textarea
                                                            placeholder="Story Context: Role in this episode..."
                                                            className="w-full bg-transparent border border-[var(--color-border)] rounded-lg p-2 text-sm text-gray-300 focus:border-[var(--color-primary)] outline-none resize-none h-16 placeholder-gray-600 mb-2"
                                                            value={prop.description}
                                                            onChange={(e) => {
                                                                const newProps = [...localEpisodeProps];
                                                                newProps[index].description = e.target.value;
                                                                setLocalEpisodeProps(newProps);
                                                            }}
                                                        />
                                                        <textarea
                                                            placeholder="Visual Appearance: Describe look (Passed to Image Generator)"
                                                            className="w-full bg-black/20 border border-[var(--color-primary)]/30 rounded-lg p-2 text-sm text-[var(--color-primary)] focus:border-[var(--color-primary)] outline-none resize-none h-20 placeholder-[var(--color-primary)]/40"
                                                            value={prop.visualSummary || ''}
                                                            onChange={(e) => {
                                                                const newProps = [...localEpisodeProps];
                                                                newProps[index].visualSummary = e.target.value;
                                                                setLocalEpisodeProps(newProps);
                                                            }}
                                                        />
                                                    </div>
                                                ))}
                                                {localEpisodeProps.length === 0 && (
                                                    <div className="text-center py-8 border-2 border-dashed border-[var(--color-border)] rounded-xl text-[var(--color-text-muted)] text-sm">
                                                        No episode props added.
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
