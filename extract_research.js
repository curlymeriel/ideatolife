const fs = require('fs');
const json = JSON.parse(fs.readFileSync('c:/Users/Meriel Kang/Downloads/Rescue___ 메인 설정 _모든 프로젝트 목록__idea-lab-storage.json', 'utf8'));
const state = json.state;
const research = {
    ideaPool: state.ideaPool || [],
    strategyInsights: state.strategyInsights || {},
    trendSnapshots: state.trendSnapshots || {},
    competitorSnapshots: state.competitorSnapshots || {}
};
console.log(JSON.stringify(research, null, 2));
