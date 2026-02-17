import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, Target, Lightbulb, ChevronRight } from 'lucide-react';

export const PrepPhasesGuide: React.FC = () => {
    const navigate = useNavigate();

    const phases = [
        {
            title: "Phase 1: Market Research",
            subtitle: "시장 트렌드 분석",
            icon: <Search size={24} className="text-[var(--color-primary)]" />,
            desc: "YouTube API를 통해 실시간 트렌드를 파악하고, 경쟁력 있는 키워드와 주제를 발굴합니다.",
            points: [
                "키워드/카테고리 기반 실시간 인기 영상 분석",
                "참여율(Engagement Rate) 기반 화제성 평가",
                "관심 스냅샷(Snapshot) 저장 및 데이터 시각화"
            ],
            color: "glass-panel bg-[var(--color-primary)]/5 hover:border-[var(--color-primary)]/50",
            nav: "/research"
        },
        {
            title: "Phase 2: Competitor & Video Analysis",
            subtitle: "경합 영상과 채널 심도 분석",
            icon: <Users size={24} className="text-[var(--color-primary)]" />,
            desc: "경쟁 채널 및 주요 영상의 성공 요인을 분석하여 벤치마킹 포인트와 차별화 전략을 도출합니다.",
            points: [
                "경쟁 채널 및 주요 영상의 성장 지표 분석",
                "성공한 영상의 콘텐츠 필라(Pillars) 역설계",
                "채널 브랜딩 및 영상 썸네일/타이틀 전략 분석"
            ],
            color: "glass-panel bg-[var(--color-primary)]/5 hover:border-[var(--color-primary)]/50",
            nav: "/research/competitor"
        },
        {
            title: "Phase 3: Strategy Formulation",
            subtitle: "전략 수립 & 브랜딩",
            icon: <Target size={24} className="text-[var(--color-primary)]" />,
            desc: "AI 전략팀장과 함께 SWOT 분석을 수행하고, 채널 브랜딩 및 맞춤형 콘텐츠 시리즈를 기획합니다.",
            points: [
                "AI 기반 통합 전략 리포트 (기회/리스크/차별화)",
                "채널 브랜딩 (네이밍, 로고, 배너) 자동 생성 및 시뮬레이션",
                "채널 성격에 최적화된 시리즈 및 에피소드 기획 제안"
            ],
            color: "glass-panel bg-[var(--color-primary)]/5 hover:border-[var(--color-primary)]/50",
            nav: "/research/strategy"
        },
        {
            title: "Phase 4: Idea Pool",
            subtitle: "아이디어 관리",
            icon: <Lightbulb size={24} className="text-[var(--color-primary)]" />,
            desc: "도출된 모든 아이디어를 한곳에 모아 관리하고, 실제 제작 단계로 연결합니다.",
            points: [
                "아이디어 상태 관리 (대기/채택/보류)",
                "제작 단계(Production)로의 원활한 이관",
                "데이터 백업 및 내보내기"
            ],
            color: "glass-panel bg-[var(--color-primary)]/5 hover:border-[var(--color-primary)]/50",
            nav: "/research/ideas"
        }
    ];

    return (
        <div className="min-h-screen bg-[#111111] text-white p-8">
            <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="mb-12">
                    <h1 className="text-4xl font-bold mb-4">Prep Phases Guide</h1>
                    <p className="text-[var(--color-text-muted)] text-lg">
                        성공적인 YouTube 컨텐츠 사업을 위한 4단계 Pre-Production 워크플로우를 소개합니다.
                    </p>
                </div>

                <div className="flex flex-col gap-8 relative">
                    {/* Connection Line (Sequential Flow) */}
                    <div className="hidden md:block absolute left-12 top-12 bottom-12 w-0.5 bg-gradient-to-b from-[var(--color-primary)]/20 via-[var(--color-primary)]/40 to-[var(--color-primary)]/20 z-0" />

                    {phases.map((phase, index) => {
                        const [phaseNum, phaseName] = phase.title.split(': ');
                        return (
                            <div key={index}
                                className={`relative z-10 p-8 rounded-3xl transition-all hover:translate-x-1 hover:shadow-2xl hover:shadow-orange-500/10 flex flex-col md:flex-row items-start gap-12 ${phase.color}`}
                            >
                                {/* Left Section: Title & Navigation */}
                                <div className="flex flex-col gap-6 w-full md:w-[240px] flex-shrink-0">
                                    <div className="flex items-center gap-4">
                                        <span className="text-5xl font-bold text-white/5 font-mono">0{index + 1}</span>
                                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 shadow-inner">
                                            {phase.icon}
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">{phaseNum}</h2>
                                        <h3 className="text-2xl font-bold leading-tight text-white">{phaseName}</h3>
                                    </div>
                                    <button
                                        onClick={() => navigate(phase.nav)}
                                        className="btn-primary w-full flex items-center justify-center gap-2 group text-sm"
                                    >
                                        해당 단계로 이동
                                        <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                    </button>
                                </div>

                                {/* Right Section: Description & Details */}
                                <div className="flex-1 md:border-l border-[var(--color-border)] md:pl-12 pt-1 mt-4 md:mt-0">
                                    <div className="mb-6">
                                        <p className="text-[var(--color-primary)] font-bold text-lg mb-2">{phase.subtitle}</p>
                                        <p className="text-gray-300 text-sm leading-relaxed">{phase.desc}</p>
                                    </div>

                                    <div className="bg-black/20 rounded-2xl p-6 border border-[var(--color-border)]">
                                        <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-4">Key Objectives</h4>
                                        <ul className="flex flex-col gap-4">
                                            {phase.points.map((point, i) => (
                                                <li key={i} className="flex items-center gap-3 text-sm text-gray-300 group/item">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]/50 group-hover/item:bg-[var(--color-primary)] transition-colors scale-75 group-hover/item:scale-100 transition-transform" />
                                                    {point}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-20 py-16 text-center border-t border-[var(--color-border)]">
                    <h3 className="text-3xl font-bold mb-4 text-white">준비되셨나요?</h3>
                    <p className="text-[var(--color-text-muted)] mb-10 max-w-2xl mx-auto text-lg leading-relaxed">
                        체계적인 데이터 분석과 AI 전략 수립을 통해,<br />
                        가치있는 컨텐츠를 기획하세요.
                    </p>
                    <button
                        onClick={() => navigate('/research')}
                        className="px-16 py-5 btn-primary text-xl shadow-2xl shadow-orange-500/20"
                    >
                        Phase 1: 트렌드 분석 시작하기
                    </button>
                </div>
            </div>
        </div>
    );
};
