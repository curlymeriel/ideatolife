import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Key, AlertTriangle, Download, Upload, Sparkles } from 'lucide-react';

interface WelcomeGuideProps {
    isOpen: boolean;
    onClose: () => void;
}

const STEPS = [
    {
        icon: Sparkles,
        title: '환영합니다! 🎉',
        subtitle: 'Idea to Life에 오신 것을 환영해요',
        content: (
            <div className="space-y-4">
                <p className="text-gray-300 leading-relaxed">
                    <strong className="text-white">Idea to Life</strong>는 아이디어를 영상 콘텐츠로 변환하는 AI 기반 창작 도구입니다.
                </p>
                <ul className="space-y-2 text-gray-400 text-sm">
                    <li className="flex items-center gap-2">✨ AI가 스크립트를 분석하고 이미지를 생성</li>
                    <li className="flex items-center gap-2">🎙️ 자동 음성 합성 (TTS)</li>
                    <li className="flex items-center gap-2">🎬 영상 조립 및 내보내기</li>
                </ul>
                <p className="text-[var(--color-primary)] text-sm font-medium mt-4">
                    다음 단계에서 시작하는 방법을 알려드릴게요!
                </p>
            </div>
        )
    },
    {
        icon: Key,
        title: 'API 키 설정 🔑',
        subtitle: '이미지와 음성 생성에 필요해요',
        content: (
            <div className="space-y-4">
                <p className="text-gray-300 leading-relaxed text-sm">
                    AI 기능을 사용하려면 API 키가 필요합니다. 아래 링크에서 무료로 발급받을 수 있어요.
                </p>

                <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2">
                    {/* Gemini API Key */}
                    <div className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)]">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-white font-medium text-sm">🧠 Gemini API Key</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">필수</span>
                        </div>
                        <p className="text-gray-400 text-xs mb-2">스크립트 생성, 이미지 생성, AI 키워드 추천</p>
                        <a
                            href="https://aistudio.google.com/app/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-primary)] text-xs hover:underline flex items-center gap-1"
                        >
                            → Google AI Studio에서 발급 ↗
                        </a>
                    </div>

                    {/* Google Cloud TTS Key */}
                    <div className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)]">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-white font-medium text-sm">🎙️ Google Cloud Key</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">TTS용</span>
                        </div>
                        <p className="text-gray-400 text-xs mb-2">음성 합성 (Text-to-Speech) - 신규가입 시 $300 무료 크레딧</p>
                        <a
                            href="https://console.cloud.google.com/apis/credentials"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-primary)] text-xs hover:underline flex items-center gap-1"
                        >
                            → Google Cloud Console에서 발급 ↗
                        </a>
                        <p className="text-gray-500 text-[10px] mt-1">* Cloud Console → API 및 서비스 → 사용자 인증정보 → API 키 만들기</p>
                    </div>

                    {/* Replicate API Key */}
                    <div className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)]">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-white font-medium text-sm">🎬 Replicate API Key</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">Video용</span>
                        </div>
                        <p className="text-gray-400 text-xs mb-2">AI 비디오 생성 (Kling, Runway 등) - Step 4.5에서 사용</p>
                        <a
                            href="https://replicate.com/account/api-tokens"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-primary)] text-xs hover:underline flex items-center gap-1"
                        >
                            → Replicate에서 발급 ↗
                        </a>
                    </div>

                    {/* Freesound API Key */}
                    <div className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)]">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-white font-medium text-sm">🔊 Freesound API Key</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">SFX용</span>
                        </div>
                        <p className="text-gray-400 text-xs mb-2">무료 사운드 이펙트 검색 (완전 무료)</p>
                        <a
                            href="https://freesound.org/apiv2/apply/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-primary)] text-xs hover:underline flex items-center gap-1"
                        >
                            → Freesound에서 발급 ↗
                        </a>
                        <p className="text-gray-500 text-[10px] mt-1">* 가입 후 API Key 신청 → 앱 이름/설명 입력 → 즉시 발급</p>
                    </div>
                </div>

                <p className="text-yellow-400 text-xs flex items-center gap-2">
                    <AlertTriangle size={14} />
                    키는 좌측 하단 ⚙️ API Config에서 입력하세요
                </p>
            </div>
        )
    },
    {
        icon: AlertTriangle,
        title: '중요: 데이터 백업 ⚠️',
        subtitle: '브라우저 데이터는 언제든 사라질 수 있어요',
        content: (
            <div className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <p className="text-red-400 font-medium mb-2">🚨 데이터 휘발 위험!</p>
                    <p className="text-gray-300 text-sm leading-relaxed">
                        모든 프로젝트 데이터는 <strong className="text-white">브라우저 저장소</strong>에 저장됩니다.
                        브라우저 캐시 삭제, 시크릿 모드 종료, 다른 기기 사용 시 <strong className="text-red-400">데이터가 사라집니다!</strong>
                    </p>
                </div>

                <p className="text-[var(--color-primary)] font-medium">
                    ✅ 해결책: 작업 완료 후 반드시 백업하세요!
                </p>

                <p className="text-gray-400 text-sm">
                    다음 단계에서 백업 방법을 알려드릴게요.
                </p>
            </div>
        )
    },
    {
        icon: Download,
        title: '백업 & 복원 방법 📦',
        subtitle: 'ZIP 파일로 완전한 백업이 가능해요',
        content: (
            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                    <div className="bg-[var(--color-surface)] rounded-lg p-4 border border-green-500/30">
                        <div className="flex items-center gap-2 text-green-400 font-medium mb-2">
                            <Download size={16} />
                            백업 (Export)
                        </div>
                        <ul className="text-gray-400 text-sm space-y-1">
                            <li>• <strong className="text-white">Dashboard</strong>: 프로젝트 선택 → "Export Selected"</li>
                            <li>• <strong className="text-white">Step 6</strong>: "Download Assets" 버튼</li>
                        </ul>
                        <p className="text-gray-500 text-xs mt-2">→ 이미지, 오디오, project.json 모두 포함</p>
                    </div>

                    <div className="bg-[var(--color-surface)] rounded-lg p-4 border border-blue-500/30">
                        <div className="flex items-center gap-2 text-blue-400 font-medium mb-2">
                            <Upload size={16} />
                            복원 (Import)
                        </div>
                        <ul className="text-gray-400 text-sm space-y-1">
                            <li>• <strong className="text-white">Dashboard</strong>: "Import Project (ZIP/JSON)" 버튼</li>
                            <li>• 백업 ZIP 파일 선택</li>
                        </ul>
                        <p className="text-gray-500 text-xs mt-2">→ 프로젝트 완전 복원!</p>
                    </div>
                </div>

                <p className="text-[var(--color-primary)] text-sm font-medium text-center mt-4">
                    🎉 준비 완료! 이제 시작해보세요!
                </p>
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
