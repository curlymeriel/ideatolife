import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, AlertTriangle, RotateCcw, Database, HelpCircle, Download, Upload, RefreshCw, Trash2, Zap, Search } from 'lucide-react';
import { useWorkflowStore } from '../store/workflowStore';
import { get as idbGet, keys as idbKeys } from 'idb-keyval';

export const Support: React.FC = () => {
    const navigate = useNavigate();
    const [diagnosisResult, setDiagnosisResult] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);

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
        <div className="min-h-screen bg-[var(--color-bg)] text-white p-8 font-sans">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-[var(--color-primary)] flex items-center gap-3">
                            <HelpCircle />
                            Support & Troubleshooting
                        </h1>
                        <p className="text-gray-400 mt-2">
                            문제 해결을 위한 가이드와 데이터 복구 방법
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/')}
                        className="px-4 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-primary)]/20 rounded flex items-center gap-2 transition-colors border border-[var(--color-border)]"
                    >
                        <Home size={18} />
                        Dashboard
                    </button>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <button
                        onClick={() => navigate('/rescue')}
                        className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl hover:bg-red-500/20 transition-all group text-left"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <AlertTriangle className="text-red-400" size={24} />
                            <h3 className="text-lg font-bold text-red-400">Rescue Center</h3>
                        </div>
                        <p className="text-sm text-gray-400">
                            앱이 정상 작동하지 않을 때 데이터를 안전하게 백업
                        </p>
                    </button>

                    <button
                        onClick={runDiagnosis}
                        disabled={isRunning}
                        className="p-6 bg-blue-500/10 border border-blue-500/30 rounded-xl hover:bg-blue-500/20 transition-all group text-left disabled:opacity-50"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <Search className="text-blue-400" size={24} />
                            <h3 className="text-lg font-bold text-blue-400">
                                {isRunning ? '진단 중...' : '데이터 진단'}
                            </h3>
                        </div>
                        <p className="text-sm text-gray-400">
                            현재 프로젝트의 메모리/디스크 데이터 비교
                        </p>
                    </button>

                    <button
                        onClick={() => window.dispatchEvent(new Event('openWelcomeGuide'))}
                        className="p-6 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-xl hover:bg-[var(--color-primary)]/20 transition-all group text-left"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <Zap className="text-[var(--color-primary)]" size={24} />
                            <h3 className="text-lg font-bold text-[var(--color-primary)]">시작 가이드</h3>
                        </div>
                        <p className="text-sm text-gray-400">
                            앱 사용법과 워크플로우 단계별 설명 보기
                        </p>
                    </button>
                </div>

                {/* Diagnosis Result */}
                {diagnosisResult && (
                    <div className="mb-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Search className="text-blue-400" size={20} />
                            진단 결과
                        </h2>
                        <pre className="text-sm text-gray-300 whitespace-pre-wrap bg-black/20 p-4 rounded-lg font-mono overflow-x-auto">
                            {diagnosisResult}
                        </pre>
                    </div>
                )}

                {/* Troubleshooting Sections */}
                <div className="space-y-6">
                    {/* Data Recovery Section */}
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Database className="text-blue-400" size={20} />
                            데이터 복구 도구
                        </h2>

                        <div className="space-y-4">
                            {/* Restore Data */}
                            <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                <div className="flex items-start gap-3">
                                    <RotateCcw className="text-green-400 mt-1 flex-shrink-0" size={18} />
                                    <div>
                                        <h4 className="font-bold text-white mb-1">Restore Data (사이드바)</h4>
                                        <p className="text-sm text-gray-400 mb-2">
                                            IndexedDB에 저장된 마지막 상태로 현재 세션을 복원합니다.
                                        </p>
                                        <div className="text-xs text-gray-500 bg-[var(--color-surface)] p-2 rounded">
                                            <strong>사용 시나리오:</strong>
                                            <ul className="list-disc list-inside mt-1 space-y-1">
                                                <li>방금 수정한 내용을 취소하고 싶을 때</li>
                                                <li>메모리와 디스크 데이터가 동기화되지 않을 때</li>
                                                <li>앱이 비정상적으로 작동할 때</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Rescue Center */}
                            <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="text-red-400 mt-1 flex-shrink-0" size={18} />
                                    <div>
                                        <h4 className="font-bold text-white mb-1">Rescue Center (사이드바)</h4>
                                        <p className="text-sm text-gray-400 mb-2">
                                            LocalStorage와 IndexedDB의 모든 데이터를 스캔하고 JSON으로 다운로드합니다.
                                        </p>
                                        <div className="text-xs text-gray-500 bg-[var(--color-surface)] p-2 rounded">
                                            <strong>사용 시나리오:</strong>
                                            <ul className="list-disc list-inside mt-1 space-y-1">
                                                <li>앱이 완전히 동작하지 않을 때 데이터 백업</li>
                                                <li>저장된 데이터 구조를 확인하고 싶을 때</li>
                                                <li>JSON 파일로 다운로드 후 나중에 Import로 복구</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Storage Cleanup */}
                            <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                <div className="flex items-start gap-3">
                                    <Trash2 className="text-orange-400 mt-1 flex-shrink-0" size={18} />
                                    <div>
                                        <h4 className="font-bold text-white mb-1">Storage Cleanup (Dashboard)</h4>
                                        <p className="text-sm text-gray-400 mb-2">
                                            저장소에 있는 모든 항목을 상세하게 보고 개별적으로 삭제하거나 다운로드합니다.
                                        </p>
                                        <div className="text-xs text-gray-500 bg-[var(--color-surface)] p-2 rounded">
                                            <strong>사용 시나리오:</strong>
                                            <ul className="list-disc list-inside mt-1 space-y-1">
                                                <li>불필요한 백업 데이터 정리</li>
                                                <li>저장 공간 확보가 필요할 때</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Optimize Storage */}
                            <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                <div className="flex items-start gap-3">
                                    <RefreshCw className="text-blue-400 mt-1 flex-shrink-0" size={18} />
                                    <div>
                                        <h4 className="font-bold text-white mb-1">Optimize Storage (Dashboard)</h4>
                                        <p className="text-sm text-gray-400 mb-2">
                                            Base64로 저장된 이미지/오디오를 IndexedDB로 마이그레이션하여 메모리 사용량을 최적화합니다.
                                        </p>
                                        <div className="text-xs text-gray-500 bg-[var(--color-surface)] p-2 rounded">
                                            <strong>사용 시나리오:</strong>
                                            <ul className="list-disc list-inside mt-1 space-y-1">
                                                <li>앱이 느려졌을 때</li>
                                                <li>구버전에서 업그레이드 후</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Import/Export Section */}
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Download className="text-green-400" size={20} />
                            Import / Export
                        </h2>

                        <div className="space-y-4">
                            <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                <div className="flex items-start gap-3">
                                    <Upload className="text-blue-400 mt-1 flex-shrink-0" size={18} />
                                    <div>
                                        <h4 className="font-bold text-white mb-1">Import Project (ZIP/JSON)</h4>
                                        <p className="text-sm text-gray-400 mb-2">
                                            ZIP 또는 JSON 파일을 통해 프로젝트를 복원합니다.
                                        </p>
                                        <div className="text-xs text-gray-500 bg-[var(--color-surface)] p-2 rounded">
                                            <strong>지원 형식:</strong>
                                            <ul className="list-disc list-inside mt-1 space-y-1">
                                                <li><strong>ZIP:</strong> 이미지/오디오 포함 완전한 프로젝트 복원</li>
                                                <li><strong>JSON:</strong> 프로젝트 메타데이터만 복원 (이미지 없음)</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                <div className="flex items-start gap-3">
                                    <Download className="text-green-400 mt-1 flex-shrink-0" size={18} />
                                    <div>
                                        <h4 className="font-bold text-white mb-1">Export Selected (ZIP)</h4>
                                        <p className="text-sm text-gray-400 mb-2">
                                            선택한 프로젝트들을 ZIP 파일로 백업합니다.
                                        </p>
                                        <div className="text-xs text-gray-500 bg-[var(--color-surface)] p-2 rounded">
                                            <strong>포함 내용:</strong>
                                            <ul className="list-disc list-inside mt-1 space-y-1">
                                                <li>project.json (모든 프로젝트 데이터)</li>
                                                <li>images/ (모든 생성된 이미지)</li>
                                                <li>audio/ (모든 TTS 오디오)</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Common Issues */}
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <AlertTriangle className="text-yellow-400" size={20} />
                            자주 발생하는 문제
                        </h2>

                        <div className="space-y-4">
                            <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                <h4 className="font-bold text-white mb-2">🔴 프로젝트가 Dashboard에서 사라졌어요</h4>
                                <p className="text-sm text-gray-400 mb-2">
                                    Dashboard를 새로고침하면 자동으로 orphan 프로젝트가 복구됩니다.
                                    만약 여전히 안 보인다면:
                                </p>
                                <ol className="text-xs text-gray-500 list-decimal list-inside space-y-1">
                                    <li>Rescue Center에서 프로젝트 데이터가 있는지 확인</li>
                                    <li>있다면 JSON으로 다운로드</li>
                                    <li>Dashboard에서 Import Project로 복원</li>
                                </ol>
                            </div>

                            <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                <h4 className="font-bold text-white mb-2">🔴 이미지/오디오가 안 보여요</h4>
                                <p className="text-sm text-gray-400 mb-2">
                                    idb:// URL 형식의 이미지가 로드되지 않는 경우:
                                </p>
                                <ol className="text-xs text-gray-500 list-decimal list-inside space-y-1">
                                    <li>페이지를 새로고침</li>
                                    <li>Dashboard에서 "Optimize Storage" 실행</li>
                                    <li>여전히 안 되면 ZIP으로 Export 후 Import</li>
                                </ol>
                            </div>

                            <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                <h4 className="font-bold text-white mb-2">🔴 앱이 느려요</h4>
                                <p className="text-sm text-gray-400 mb-2">
                                    대용량 프로젝트나 오래된 데이터가 있는 경우:
                                </p>
                                <ol className="text-xs text-gray-500 list-decimal list-inside space-y-1">
                                    <li>Dashboard에서 "Optimize Storage" 실행</li>
                                    <li>Storage Cleanup에서 불필요한 backup 삭제</li>
                                    <li>브라우저 캐시 정리</li>
                                </ol>
                            </div>

                            <div className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
                                <h4 className="font-bold text-white mb-2">🔴 localhost에서 연결 거부</h4>
                                <p className="text-sm text-gray-400 mb-2">
                                    개발 서버가 종료된 경우:
                                </p>
                                <ol className="text-xs text-gray-500 list-decimal list-inside space-y-1">
                                    <li>터미널에서 <code className="bg-gray-700 px-1 rounded">npm run dev</code> 실행</li>
                                    <li>브라우저에서 http://localhost:5173 접속</li>
                                </ol>
                            </div>
                        </div>
                    </div>

                    {/* Contact */}
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6 text-center">
                        <p className="text-blue-300">
                            추가 도움이 필요하시면 개발자에게 문의하세요.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
