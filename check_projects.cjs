const fs = require('fs');
try {
    const raw = fs.readFileSync('c:/Users/Meriel Kang/Downloads/Rescue___ 메인 설정 _모든 프로젝트 목록__idea-lab-storage.json', 'utf8');
    const json = JSON.parse(raw);
    const projects = json.state.savedProjects || {};
    const results = [];
    for (const [id, proj] of Object.entries(projects)) {
        if (proj.trendInsights) {
            results.push({
                id,
                name: proj.episodeName || proj.seriesName,
                trendInsights: proj.trendInsights
            });
        }
    }
    console.log(JSON.stringify(results, null, 2));
} catch (e) {
    console.error(e);
}
