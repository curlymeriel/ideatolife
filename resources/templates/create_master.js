import pptxgen from 'pptxgenjs';

let pptx = new pptxgen();

// REQUIRED: Define and set layout BEFORE defining masters
pptx.defineLayout({ name: 'CUSTOM_WIDE', width: 13.333, height: 7.5 });
pptx.layout = 'CUSTOM_WIDE';

const BG_PATH = 'c:/Users/Meriel Kang/Documents/03_Drawing/08_ai/WORK/resources/templates/background.png';

// --- 1. Define Title Slide Master ---
pptx.defineSlideMaster({
    title: 'TITLE_SLIDE',
    background: { path: BG_PATH },
    objects: [
        { rect: { x: 1.04, y: 4.54, w: 7.38, h: 0.01, fill: { color: 'E7A170' } } },
        // Static Page Number Elements (since slide number field is tricky in masters)
        { text: { text: '{{sldNum}}', options: { x: 11.11, y: 6.92, w: 1.08, h: 0.27, align: 'right', fontFace: 'Noto Sans KR', fontSize: 13.5, color: 'E7A170', bold: true } } },
        { rect: { x: 12.27, y: 6.92, w: 0.02, h: 0.27, fill: { color: 'E7A170' } } }
    ]
});

// --- 2. Define Chapter Slide Master ---
pptx.defineSlideMaster({
    title: 'CHAPTER_SLIDE',
    background: { path: BG_PATH },
    objects: [
        { rect: { x: 6.04, y: 4.40, w: 1.25, h: 0.08, fill: { color: 'E7A170' } } },
        { text: { text: '{{sldNum}}', options: { x: 11.11, y: 6.92, w: 1.08, h: 0.27, align: 'right', fontFace: 'Noto Sans KR', fontSize: 13.5, color: 'E7A170', bold: true } } },
        { rect: { x: 12.27, y: 6.92, w: 0.02, h: 0.27, fill: { color: 'E7A170' } } }
    ]
});

// --- 3. Define Content Slide Master ---
pptx.defineSlideMaster({
    title: 'CONTENT_SLIDE',
    background: { path: BG_PATH },
    objects: [
        { rect: { x: 1.04, y: 0.83, w: 0.08, h: 0.60, fill: { color: 'E7A170' } } },
        { text: { text: '{{sldNum}}', options: { x: 11.11, y: 6.92, w: 1.08, h: 0.27, align: 'right', fontFace: 'Noto Sans KR', fontSize: 13.5, color: 'E7A170', bold: true } } },
        { rect: { x: 12.27, y: 6.92, w: 0.02, h: 0.27, fill: { color: 'E7A170' } } }
    ]
});

// --- Create Sample Slides ---

// Slide 1: Title
let slide1 = pptx.addSlide({ masterName: 'TITLE_SLIDE' });
slide1.addText('건설 AX 검토 보고서', {
    x: 1.04, y: 1.82, w: 7.75, h: 2.33,
    fontFace: 'Noto Sans KR', fontSize: 60, color: 'FFFFFF', bold: true, align: 'left', valign: 'top'
});
slide1.addText('한신공영(주) AI 전환 로드맵', {
    x: 0.99, y: 4.80, w: 8.26, h: 0.40,
    fontFace: 'Noto Sans KR', fontSize: 24, color: 'FFFFFF', align: 'left'
});

// Slide 2: Chapter Divider
let slide2 = pptx.addSlide({ masterName: 'CHAPTER_SLIDE' });
slide2.addText('CHAPTER 01', {
    x: 5.71, y: 2.11, w: 1.92, h: 0.28,
    fontFace: 'Noto Sans KR', fontSize: 16.5, color: 'E7A170', bold: true, align: 'center'
});
slide2.addText('건설 산업의 변곡점', {
    x: 2.49, y: 2.69, w: 8.19, h: 1.03,
    fontFace: 'Noto Sans KR', fontSize: 48, color: 'FFFFFF', bold: true, align: 'center'
});
slide2.addText('전통적 노동 집약 구조의 한계와 데이터 기반 혁신의 태동', {
    x: 4.02, y: 5.02, w: 5.69, h: 0.37,
    fontFace: 'Noto Sans KR', fontSize: 17.5, color: '94A3B8', align: 'center'
});

// Slide 3: Content Page
let slide3 = pptx.addSlide({ masterName: 'CONTENT_SLIDE' });
slide3.addText('국내 건설업의 3대 복합 위기 진단', {
    x: 1.33, y: 0.83, w: 11.51, h: 0.66,
    fontFace: 'Noto Sans KR', fontSize: 39, color: 'FFFFFF', bold: true, align: 'left'
});
slide3.addText([
    { text: '생산성 정체: 타 산업군 대비 낮은 지표 지속', options: { bullet: true, color: '94A3B8', fontSize: 18, fontFace: 'Noto Sans KR' } },
    { text: '인력 구조 악화: 숙련공 고령화 및 유입 단절', options: { bullet: true, color: '94A3B8', fontSize: 18, fontFace: 'Noto Sans KR' } },
    { text: '규제 리스크: 중대재해처벌법 및 탄소 배출 규제', options: { bullet: true, color: '94A3B8', fontSize: 18, fontFace: 'Noto Sans KR' } }
], { x: 1.33, y: 2.2, w: '85%', h: 4.0 });

// --- Save ---
const outputPath = 'c:/Users/Meriel Kang/Documents/03_Drawing/08_ai/WORK/resources/templates/IdeaToLife_Master_Template.pptx';
pptx.writeFile({ fileName: outputPath })
    .then(fileName => {
        console.log(`Updated FINAL REFINED Template at: ${fileName}`);
    })
    .catch(err => {
        console.error('Error creating refined PPT:', err);
        process.exit(1);
    });
