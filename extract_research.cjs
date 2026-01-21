const fs = require('fs');
try {
    const raw = fs.readFileSync('c:/Users/Meriel Kang/Downloads/Rescue___ 메인 설정 _모든 프로젝트 목록__idea-lab-storage.json', 'utf8');
    const json = JSON.parse(raw);
    const state = json.state;
    const research = {
        ideaPoolLength: (state.ideaPool || []).length,
        strategyInsightsCount: Object.keys(state.strategyInsights || {}).length,
        trendSnapshotsCount: Object.keys(state.trendSnapshots || {}).length,
        competitorSnapshotsCount: Object.keys(state.competitorSnapshots || {}).length,
        // Also dump the content if not empty
        ideaPool: state.ideaPool || [],
        strategyInsights: state.strategyInsights || {}
    };
    console.log(JSON.stringify(research, null, 2));
} catch (e) {
    console.error(e);
}
