import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Key, AlertTriangle, Sparkles, ExternalLink } from 'lucide-react';

interface WelcomeGuideProps {
    isOpen: boolean;
    onClose: () => void;
}

const STEPS = [
    {
        icon: Sparkles,
        title: 'Idea to Life에 오신 것을 환영해요! 🎉',
        subtitle: '아이디어를 영상으로 만드는 여정을 시작해볼까요?',
        content: (
            <div className="space-y-4">
                <p className="text-gray-300 leading-relaxed text-sm">
                    <strong className="text-white">Idea to Life</strong>는 6단계의 체계적인 워크플로우를 통해
                    <br />여러분의 상상을 실제 영상 콘텐츠로 구현해주는 AI 파트너입니다.
                </p>
                <div className="bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-border)]">
                    <h4 className="text-[var(--color-primary)] font-bold text-xs mb-2 uppercase">✨ Core Features</h4>
                    <ul className="space-y-1 text-gray-400 text-xs">
                        <li>• <strong>Step 1 Setup:</strong> 시리즈/에피소드 기획 및 기본 설정</li>
                        <li>• <strong>Step 2 Style:</strong> 캐릭터, 장소, 소품의 일관된 스타일 정의</li>
                        <li>• <strong>Step 3 Production:</strong> AI 스크립트 작성 및 이미지/오디오 생성</li>
                        <li>• <strong>Step 4.5 Video:</strong> 이미지 → 비디오 변환 (Grok/Kling/Replicate)</li>
                        <li>• <strong>Step 5 Thumbnail:</strong> 에피소드 썸네일 제작</li>
                        <li>• <strong>Step 6 Final:</strong> 최종 결과물 확인 및 내보내기</li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        icon: Key,
        title: '준비물: API 키 설정 🔑',
        subtitle: 'AI 모델을 사용하기 위해 연결이 필요해요',
        content: (
            <div className="space-y-3">
                <p className="text-gray-300 text-xs">
                    좌측 하단 <strong>⚙️ API Config</strong>에서 키를 입력해주세요.
                </p>
                <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1 text-xs">
                    {/* Gemini API Section */}
                    <div className="bg-[var(--color-surface)] p-3 rounded border border-[var(--color-border)]">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-white font-bold">🧠 Gemini API (필수)</span>
                            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded transition-colors" title="Get API Key">
                                <ExternalLink size={12} />
                            </a>
                        </div>
                        <div className="text-gray-400 space-y-1 text-[10px]">
                            <p><strong className="text-gray-300">#1.</strong> Google AI Studio 접속 → <span className="text-[var(--color-primary)]">Create API Key</span> 클릭</p>
                            <p><strong className="text-gray-300">#2.</strong> <span className="text-blue-400">(Veo 사용시)</span> <a href="https://console.cloud.google.com/apis/library/aiplatform.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline hover:text-orange-300">Google Cloud Console</a> 접속 → <strong className="text-white underline">Vertex AI API</strong> (또는 Vertex AI) → [사용함] 클릭</p>
                            <p><strong className="text-gray-300">#3.</strong> <span className="text-blue-400">(TTS 사용시)</span> <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline hover:text-orange-300">Google Cloud Console</a> → 키 클릭 → API restrictions를 "Don't restrict key"로 변경</p>
                            <p><strong className="text-gray-300">#4.</strong> <span className="text-purple-400">(📊 시장조사 사용시)</span> Google Cloud Console → APIs & Services → <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline hover:text-purple-300">YouTube Data API v3</a> → Enable</p>
                        </div>
                    </div>

                    {/* Replicate API Section */}
                    <div className="bg-[var(--color-surface)] p-3 rounded border border-[var(--color-border)]">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-white font-bold">🎬 Replicate API (영상 생성)</span>
                            <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer" className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded transition-colors" title="Get API Key">
                                <ExternalLink size={12} />
                            </a>
                        </div>
                        <div className="text-gray-400 space-y-1 text-[10px]">
                            <p><strong className="text-gray-300">#1.</strong> Replicate.com 가입/로그인 → <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline">API Tokens</a> 이동</p>
                            <p><strong className="text-gray-300">#2.</strong> Token 생성 후 복사 → 사이드바 <span className="text-[var(--color-primary)] font-bold">Replicate API Key</span>에 입력</p>
                            <p><strong className="text-gray-300">#3.</strong> Wan 2.1, Kling 등 고성능 모델을 통해 고품질 영상을 생성할 수 있습니다.</p>
                        </div>
                    </div>

                    {/* Freesound API Section */}
                    <div className="bg-[var(--color-surface)] p-3 rounded border border-[var(--color-border)]">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-white font-bold">🔊 Freesound API (SFX)</span>
                            <a href="https://freesound.org/apiv2/apply" target="_blank" rel="noopener noreferrer" className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded transition-colors" title="Get API Key">
                                <ExternalLink size={12} />
                            </a>
                        </div>
                        <div className="text-gray-400 space-y-1 text-[10px]">
                            <p><strong className="text-gray-300">#1.</strong> Freesound.org 회원가입/로그인 → Apply for API</p>
                            <p><strong className="text-gray-300">#2.</strong> 승인 후 복사한 <span className="text-purple-400">Client secret/API key</span> 값을 사이드바에 입력</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        icon: AlertTriangle,
        title: '데이터 저장 주의사항 💾',
        subtitle: '브라우저에 저장되니 백업이 필수예요!',
        content: (
            <div className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <p className="text-red-400 font-bold text-sm mb-1">🚨 데이터 휘발 주의</p>
                    <p className="text-gray-300 text-xs">
                        모든 데이터는 서버가 아닌 <strong>여러분의 브라우저(IndexedDB)</strong>에 저장됩니다.
                        브라우저 캐시를 지우거나 시크릿 모드를 닫으면 데이터가 사라집니다.
                    </p>
                </div>
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                    <p className="text-green-400 font-bold text-sm mb-1">✅ 해결책: 안전한 백업</p>
                    <ul className="text-gray-300 text-xs space-y-1">
                        <li>• <strong>Export/Import:</strong> 프로젝트 ZIP 패키지로 전체 백업 및 복원</li>
                        <li>• <strong>복구 센터 (Rescue):</strong> 브라우저 내부 데이터를 추출하는 마지막 보루</li>
                        <li>• <strong>저장소 통합 관리:</strong> 주기적인 이미지 압축 및 데이터 정리</li>
                    </ul>
                </div>
            </div>
        )
    }
];

export const WelcomeGuide: React.FC<WelcomeGuideProps> = ({ isOpen, onClose }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [dontShowAgain, setDontShowAgain] = useState(false);

    if (!isOpen) return null;

    const handleClose = () => {
        if (dontShowAgain) {
            localStorage.setItem('hasSeenWelcomeGuide', 'true');
        }
        setCurrentStep(0);
        onClose();
    };

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            handleClose();
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const step = STEPS[currentStep];
    const Icon = step.icon;

    return (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />

            {/* Modal */}
            <div className="relative w-full max-w-lg mx-4 glass-panel overflow-hidden animate-fade-in">
                {/* Close Button */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
                >
                    <X size={20} />
                </button>

                {/* Progress Dots */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {STEPS.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentStep(idx)}
                            className={`w-2 h-2 rounded-full transition-all ${idx === currentStep
                                ? 'bg-[var(--color-primary)] w-6'
                                : 'bg-gray-600 hover:bg-gray-500'
                                }`}
                        />
                    ))}
                </div>

                {/* Content */}
                <div className="pt-12 pb-6 px-8">
                    {/* Icon */}
                    <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 flex items-center justify-center mx-auto mb-6">
                        <Icon size={32} className="text-[var(--color-primary)]" />
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl font-bold text-white text-center mb-1">
                        {step.title}
                    </h2>
                    <p className="text-gray-400 text-center mb-6">
                        {step.subtitle}
                    </p>

                    {/* Step Content */}
                    <div className="min-h-[200px]">
                        {step.content}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 pb-6 pt-4 border-t border-[var(--color-border)]">
                    {/* Don't show again checkbox */}
                    <label className="flex items-center gap-2 text-sm text-gray-400 mb-4 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={dontShowAgain}
                            onChange={(e) => setDontShowAgain(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-600 bg-transparent text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                        />
                        다시 표시하지 않기
                    </label>

                    {/* Navigation */}
                    <div className="flex justify-between items-center">
                        <button
                            onClick={handlePrev}
                            disabled={currentStep === 0}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${currentStep === 0
                                ? 'text-gray-600 cursor-not-allowed'
                                : 'text-gray-400 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            <ChevronLeft size={18} />
                            이전
                        </button>

                        <span className="text-gray-500 text-sm">
                            {currentStep + 1} / {STEPS.length}
                        </span>

                        <button
                            onClick={handleNext}
                            className="flex items-center gap-2 px-6 py-2 rounded-lg bg-[var(--color-primary)] text-black font-medium hover:opacity-90 transition-all"
                        >
                            {currentStep === STEPS.length - 1 ? '시작하기' : '다음'}
                            {currentStep < STEPS.length - 1 && <ChevronRight size={18} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
