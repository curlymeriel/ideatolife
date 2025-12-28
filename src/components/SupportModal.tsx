import React, { useState } from 'react';
import { X, AlertTriangle, RotateCcw, Database, HelpCircle, Download, Upload, Zap, Search, HardDrive } from 'lucide-react';
import { useWorkflowStore } from '../store/workflowStore';
import { get as idbGet } from 'idb-keyval';

interface SupportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
    const [diagnosisResult, setDiagnosisResult] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    if (!isOpen) return null;

    const runDiagnosis = async () => {
        setIsRunning(true);
        setDiagnosisResult(null);

        try {
            const currentState = useWorkflowStore.getState();
            const currentId = currentState.id;
            const currentSeriesName = currentState.seriesName;
            const currentEpisodeName = currentState.episodeName;
            const currentScriptLength = currentState.script?.length || 0;
            const firstDialogue = currentState.script?.[0]?.dialogue?.substring(0, 80) || '(없음)';

            // Load from IndexedDB
            const projectData = await idbGet(`project-${currentId}`) as any;
            const diskSeriesName = projectData?.seriesName || '(없음)';
            const diskEpisodeName = projectData?.episodeName || '(없음)';
            const diskScriptLength = projectData?.script?.length || 0;
            const diskFirstDialogue = projectData?.script?.[0]?.dialogue?.substring(0, 80) || '(없음)';

            // Compare
            const isMatch =
                currentSeriesName === diskSeriesName &&
                currentEpisodeName === diskEpisodeName &&
                currentScriptLength === diskScriptLength;

            const result = `
=== 현재 프로젝트 진단 ===

📂 메모리 (현재 로드된 상태)
  - ID: ${currentId}
  - 시리즈: ${currentSeriesName}
  - 에피소드: ${currentEpisodeName}
  - 스크립트 수: ${currentScriptLength}컷
  - 첫 대사: "${firstDialogue}..."

💾 IndexedDB (project-${currentId} 키)
  - 시리즈: ${diskSeriesName}
  - 에피소드: ${diskEpisodeName}
  - 스크립트 수: ${diskScriptLength}컷
  - 첫 대사: "${diskFirstDialogue}..."

${isMatch ? '✅ 데이터 일치: 메모리와 디스크 데이터가 동일합니다.' : '❌ 데이터 불일치: 메모리와 디스크 데이터가 다릅니다! 데이터가 오염되었을 수 있습니다.'}
            `.trim();

            setDiagnosisResult(result);
        } catch (e: any) {
            setDiagnosisResult(`진단 오류: ${e.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            {/* Modal Content */}
            <div className="relative w-full max-w-4xl h-[85vh] glass-panel overflow-hidden flex flex-col animate-fade-in mx-4">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)] shrink-0">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--color-primary)] flex items-center gap-3">
                            <HelpCircle />
                            Support & Troubleshooting
                        </h1>
                        <p className="text-gray-400 mt-1 text-sm">
                            문제 해결을 위한 가이드와 데이터 복구 방법
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={24} className="text-gray-400 hover:text-white" />
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-[var(--color-border)]">

                    {/* Quick Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <button
                            onClick={() => {
                                onClose();
                                window.dispatchEvent(new Event('openRescueModal'));
                            }}
                            className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl hover:bg-orange-500/20 transition-all group text-left"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="text-[var(--color-primary)]" size={20} />
                                <h3 className="text-base font-bold text-[var(--color-primary)]">복구 센터 (Rescue)</h3>
                            </div>
                            <p className="text-xs text-gray-400">
                                앱이 정상 작동하지 않을 때 데이터를 안전하게 백업 및 추출
                            </p>
                        </button>

                        <button
                            onClick={runDiagnosis}
                            disabled={isRunning}
                            className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl hover:bg-blue-500/20 transition-all group text-left disabled:opacity-50"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Search className="text-blue-400" size={20} />
                                <h3 className="text-base font-bold text-blue-400">
                                    {isRunning ? '진단 중...' : '데이터 진단'}
                                </h3>
                            </div>
                            <p className="text-xs text-gray-400">
                                현재 프로젝트의 메모리/디스크 데이터 무결성 검사
                            </p>
                        </button>

                        <button
                            onClick={() => {
                                onClose();
                                window.dispatchEvent(new Event('openWelcomeGuide'));
                            }}
                            className="p-4 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-xl hover:bg-[var(--color-primary)]/20 transition-all group text-left"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Zap className="text-[var(--color-primary)]" size={20} />
                                <h3 className="text-base font-bold text-[var(--color-primary)]">시작 가이드</h3>
                            </div>
                            <p className="text-xs text-gray-400">
                                앱 사용법과 워크플로우 단계별 설명 보기
                            </p>
                        </button>
                    </div>

                    {/* Diagnosis Result */}
                    {diagnosisResult && (
                        <div className="mb-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Search className="text-blue-400" size={18} />
                                진단 결과
                            </h2>
                            <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-black/20 p-4 rounded-lg font-mono overflow-x-auto">
                                {diagnosisResult}
                            </pre>
                        </div>
                    )}

                    {/* Troubleshooting Sections */}
                    <div className="space-y-6">
                        {/* Data Management Section */}
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Database className="text-[var(--color-primary)]" size={18} />
                                데이터 관리 및 복구 도구
                            </h2>

                            <div className="space-y-4">
                                {/* Session Restore */}
                                <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                    <div className="flex items-start gap-3">
                                        <RotateCcw className="text-green-400 mt-1 flex-shrink-0" size={16} />
                                        <div>
                                            <h4 className="font-bold text-white mb-1 text-sm">세션 복구 (Dashboard 사이드바)</h4>
                                            <p className="text-xs text-gray-400 mb-2">
                                                데이터베이스에 저장된 마지막 상태로 현재 세션을 즉시 복원합니다.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Rescue Center */}
                                <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="text-[var(--color-primary)] mt-1 flex-shrink-0" size={16} />
                                        <div>
                                            <h4 className="font-bold text-white mb-1 text-sm">긴급 복구 (Dashboard 사이드바 / Support)</h4>
                                            <p className="text-xs text-gray-400 mb-2">
                                                브라우저 내부 데이터를 스캔하여 프로젝트와 애셋을 ZIP 패키지로 강제 추출합니다.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Storage Hub */}
                                <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                    <div className="flex items-start gap-3">
                                        <HardDrive className="text-blue-400 mt-1 flex-shrink-0" size={16} />
                                        <div>
                                            <h4 className="font-bold text-white mb-1 text-sm">저장소 통합 관리 (Dashboard 사이드바)</h4>
                                            <p className="text-xs text-gray-400 mb-2">
                                                사용 현황 확인, 이미지 압축, 고아 데이터 정리 등 종합 유지보수 도구입니다.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Optimization */}
                                <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                    <div className="flex items-start gap-3">
                                        <Database className="text-purple-400 mt-1 flex-shrink-0" size={16} />
                                        <div>
                                            <h4 className="font-bold text-white mb-1 text-sm">데이터 최적화 (Dashboard 사이드바)</h4>
                                            <p className="text-xs text-gray-400 mb-2">
                                                구식 데이터 구조를 최신 저장 방식으로 일괄 변환하여 앱 성능을 최적화합니다.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Import/Export Section */}
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Download className="text-green-400" size={18} />
                                Import / Export
                            </h2>

                            <div className="space-y-4">
                                <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                    <div className="flex items-start gap-3">
                                        <Upload className="text-blue-400 mt-1 flex-shrink-0" size={16} />
                                        <div>
                                            <h4 className="font-bold text-white mb-1 text-sm">Import (Dashboard 헤더 우측)</h4>
                                            <p className="text-xs text-gray-400 mb-2">
                                                ZIP 패키지 또는 JSON 파일을 업로드하여 프로젝트를 복원합니다.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                    <div className="flex items-start gap-3">
                                        <Download className="text-green-400 mt-1 flex-shrink-0" size={16} />
                                        <div>
                                            <h4 className="font-bold text-white mb-1 text-sm">Export (Dashboard 헤더 우측)</h4>
                                            <p className="text-xs text-gray-400 mb-2">
                                                선택한 프로젝트들을 애셋을 포함한 ZIP 파일로 일괄 백업합니다.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Common Issues */}
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <AlertTriangle className="text-yellow-400" size={18} />
                                자주 발생하는 문제
                            </h2>

                            <div className="space-y-4">
                                <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                    <h4 className="font-bold text-white mb-2 text-sm">🔴 프로젝트가 Dashboard에서 사라졌어요</h4>
                                    <p className="text-xs text-gray-400 mb-2">
                                        Dashboard를 새로고침하면 자동으로 orphan 프로젝트가 복구됩니다.
                                    </p>
                                </div>

                                <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                    <h4 className="font-bold text-white mb-2 text-sm">🔴 이미지/오디오가 안 보여요</h4>
                                    <p className="text-xs text-gray-400 mb-2">
                                        idb:// URL 형식의 이미지가 로드되지 않는 경우: 페이지 새로고침 또는 "저장소 통합 관리"의 이미지 최적화 상태 확인.
                                    </p>
                                </div>

                                <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                    <h4 className="font-bold text-white mb-2 text-sm">🔴 앱이 느려요</h4>
                                    <p className="text-xs text-gray-400 mb-2">
                                        Dashboard에서 "데이터 최적화"를 실행하거나 "저장소 통합 관리"를 통해 불필요한 데이터를 정리하세요.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
