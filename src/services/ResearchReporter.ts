import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } from 'docx';
import pptxgen from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { resolveUrl } from '../utils/imageStorage';
import type { StrategyInsight } from '../store/types';

/**
 * Generate a safe filename for various exports across the app.
 * Handles Korean characters and removes unsafe filename characters.
 */
export function getSafeFilename(baseName: string, extension: string, id?: string) {
    const safeBase = baseName.replace(/[^a-z0-9가-힣\s-_]/gi, '_').trim();
    const suffix = id ? `_${id.slice(0, 8)}` : '';
    return `${safeBase}${suffix}.${extension}`;
}

export class ResearchReporter {
    /**
     * Export Strategy as Microsoft Word (.docx)
     */
    static async exportToDocx(strategy: StrategyInsight) {
        try {
            console.log('[ResearchReporter] Exporting DOCX for strategy:', strategy.id);
            if (!strategy) throw new Error('Strategy data is missing.');

            // Helper to get image data for docx
            const getImageData = async (url?: string) => {
                if (!url) return null;
                try {
                    const resolved = await resolveUrl(url);
                    const response = await fetch(resolved);
                    const blob = await response.blob();
                    const arrayBuffer = await blob.arrayBuffer();
                    return new Uint8Array(arrayBuffer);
                } catch (e) {
                    console.error('Failed to load image for docx:', e);
                    return null;
                }
            };

            const bannerData = await getImageData(strategy.channelIdentity?.bannerUrl);
            const profileData = await getImageData(strategy.channelIdentity?.profileUrl);

            const doc = new Document({
                sections: [{
                    properties: {},
                    children: [
                        new Paragraph({
                            text: "AI Strategic Intelligence Report",
                            heading: HeadingLevel.HEADING_1,
                            alignment: AlignmentType.CENTER,
                        }),
                        new Paragraph({
                            text: strategy.channelIdentity?.channelName || 'YouTube Strategy',
                            heading: HeadingLevel.HEADING_2,
                            alignment: AlignmentType.CENTER,
                        }),
                        new Paragraph({
                            text: `Generated on: ${new Date(strategy.createdAt).toLocaleDateString()}`,
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 400 },
                        }),

                        // Embedded Images (Banner)
                        ...(bannerData ? [
                            new Paragraph({
                                children: [
                                    new ImageRun({
                                        data: bannerData,
                                        transformation: { width: 600, height: 200 },
                                        type: 'jpg'
                                    } as any),
                                ],
                                alignment: AlignmentType.CENTER,
                                spacing: { after: 200 },
                            })
                        ] : []),

                        new Paragraph({ text: "1. Executive Summary", heading: HeadingLevel.HEADING_2 }),
                        new Paragraph({
                            children: [
                                new TextRun({ text: strategy.executiveSummary || 'No summary available.', italics: true })
                            ],
                            spacing: { after: 200 }
                        }),

                        new Paragraph({ text: "2. Strategic Pillars", heading: HeadingLevel.HEADING_2 }),
                        ...(strategy.recommendedPillars || []).map(pillar => [
                            new Paragraph({ text: pillar.pillarName, heading: HeadingLevel.HEADING_3 }),
                            new Paragraph({ text: pillar.reason, spacing: { after: 100 } })
                        ]).flat(),

                        new Paragraph({ text: "3. Brand Persona & Voice", heading: HeadingLevel.HEADING_2 }),
                        ...(profileData ? [
                            new Paragraph({
                                children: [
                                    new ImageRun({
                                        data: profileData,
                                        transformation: { width: 100, height: 100 },
                                        type: 'jpg'
                                    } as any),
                                ],
                                spacing: { after: 100 },
                            })
                        ] : []),
                        new Paragraph({ children: [new TextRun({ text: "Slogan: ", bold: true }), new TextRun({ text: strategy.channelIdentity?.slogan || 'None', italics: true })] }),
                        new Paragraph({ text: `Mission: ${strategy.channelIdentity?.mission || 'None'}` }),
                        new Paragraph({ text: `Tone of Voice: ${strategy.channelIdentity?.toneOfVoice || 'None'}`, spacing: { after: 200 } }),

                        new Paragraph({ text: "4. Recommended Series", heading: HeadingLevel.HEADING_2 }),
                        ...(strategy.recommendedSeries || []).map(series => [
                            new Paragraph({ text: series.title, heading: HeadingLevel.HEADING_3 }),
                            new Paragraph({ text: `Target: ${series.targetPillar} | Audience: ${series.expectedAudience}`, spacing: { after: 50 } }),
                            new Paragraph({ text: series.description, spacing: { after: 100 } })
                        ]).flat(),

                        new Paragraph({ text: "5. Episode Recommendations", heading: HeadingLevel.HEADING_2 }),
                        ...(strategy.recommendedSeries || []).flatMap(series =>
                            (series.episodes || []).map((ep: any) => [
                                new Paragraph({ text: `${ep.ideaTitle} (${ep.format})`, heading: HeadingLevel.HEADING_3 }),
                                new Paragraph({ children: [new TextRun({ text: ep.oneLiner, italics: true })] }),
                                new Paragraph({ text: `Angle: ${ep.angle}`, spacing: { after: 100 } })
                            ])
                        ).flat(),

                        new Paragraph({ text: "6. Character Personas", heading: HeadingLevel.HEADING_2 }),
                        ...(strategy.characters || []).map(char => [
                            new Paragraph({ text: `${char.name} (${char.role})`, heading: HeadingLevel.HEADING_3 }),
                            new Paragraph({ text: char.personality }),
                            new Paragraph({ children: [new TextRun({ text: `Visual Style: ${char.visualGuide}`, italics: true })], spacing: { after: 100 } })
                        ]).flat(),

                        new Paragraph({ text: "7. Recommended AI Tech Stack", heading: HeadingLevel.HEADING_2 }),
                        ...(strategy.techStack || []).map(item => [
                            new Paragraph({ children: [new TextRun({ text: `${item.phase}: `, bold: true }), new TextRun(item.tool)] }),
                            new Paragraph({ text: item.usage, spacing: { after: 50 } })
                        ]).flat(),

                        new Paragraph({ text: "8. Marketing & KPI Strategy", heading: HeadingLevel.HEADING_2 }),
                        new Paragraph({ children: [new TextRun({ text: "Target KPIs: ", bold: true }), new TextRun(strategy.marketingStrategy?.kpis?.join(', ') || 'None')] }),
                        new Paragraph({ children: [new TextRun({ text: "Viral Elements: ", bold: true }), new TextRun(strategy.marketingStrategy?.viralElements?.join(', ') || 'None')] }),
                        new Paragraph({ children: [new TextRun({ text: "Interactive Ideas: ", bold: true }), new TextRun(strategy.marketingStrategy?.interactiveIdeas?.join(', ') || 'None')], spacing: { after: 200 } }),
                    ],
                }],
            });

            const blob = await Packer.toBlob(doc);
            const fileName = getSafeFilename('Strategy_Report', 'docx', strategy.id);
            console.log('[ResearchReporter] Saving DOCX as:', fileName);
            saveAs(blob, fileName);
        } catch (error) {
            console.error('[ResearchReporter] DOCX Export failed:', error);
            alert('Word 파일 내보내기 중 오류가 발생했습니다. 데이터가 올바른지 확인해 주세요.');
        }
    }

    /**
     * Export Strategy as PowerPoint (.pptx)
     */
    static async exportToPptx(strategy: StrategyInsight) {
        try {
            if (!strategy) throw new Error('Strategy data is missing.');
            const pptx = new pptxgen();
            pptx.layout = 'LAYOUT_16x9';

            // Slide 1: Title
            const slide1 = pptx.addSlide();
            slide1.background = { color: '0A0A0A' };
            slide1.addText('Strategic Planning Report', { x: 1, y: 2, w: '80%', fontSize: 36, color: 'FFD700', bold: true, align: 'center' });
            slide1.addText(`${strategy.channelIdentity?.channelName || 'YouTube Strategy'}`, { x: 1, y: 3.2, w: '80%', fontSize: 24, color: 'FFFFFF', align: 'center' });

            // Slide 2: Executive Summary
            const slide2 = pptx.addSlide();
            slide2.background = { color: '0A0A0A' };
            slide2.addText('Executive Summary', { x: 0.5, y: 0.5, fontSize: 24, color: 'FFD700', bold: true });
            slide2.addText(strategy.executiveSummary || 'No summary available.', { x: 0.5, y: 1.5, w: '90%', fontSize: 16, color: 'FFFFFF' });

            // Slide 3: Content Pillars
            const slide3 = pptx.addSlide();
            slide3.background = { color: '0A0A0A' };
            slide3.addText('Content Pillars', { x: 0.5, y: 0.5, fontSize: 24, color: 'FFD700', bold: true });
            (strategy.recommendedPillars || []).forEach((p, i) => {
                slide3.addText(`• ${p.pillarName}: ${p.reason}`, { x: 0.5, y: 1.5 + (i * 1.0), w: '90%', fontSize: 14, color: 'FFFFFF' });
            });

            // Slide 4: Episodes (flattened from all series)
            const slide4 = pptx.addSlide();
            slide4.background = { color: '0A0A0A' };
            slide4.addText('Episode Ideas', { x: 0.5, y: 0.5, fontSize: 24, color: 'FFD700', bold: true });
            const allEpisodes = (strategy.recommendedSeries || []).flatMap(s => s.episodes || []);
            allEpisodes.slice(0, 4).forEach((ep: { ideaTitle: string; oneLiner: string }, i: number) => {
                slide4.addText(`${i + 1}. ${ep.ideaTitle}`, { x: 0.5, y: 1.5 + (i * 0.8), fontSize: 16, color: 'FFFFFF', bold: true });
                slide4.addText(ep.oneLiner, { x: 0.8, y: 1.8 + (i * 0.8), fontSize: 12, color: 'AAAAAA', italic: true });
            });

            // Slide 5: Characters
            const charSlide = pptx.addSlide();
            charSlide.background = { color: '0A0A0A' };
            charSlide.addText('Character Personas', { x: 0.5, y: 0.5, fontSize: 24, color: 'FFD700', bold: true });
            (strategy.characters || []).slice(0, 3).forEach((char, i) => {
                charSlide.addText(`${char.name} (${char.role})`, { x: 0.5, y: 1.5 + (i * 1.2), fontSize: 16, color: 'FFFFFF', bold: true });
                charSlide.addText(char.personality, { x: 0.5, y: 1.9 + (i * 1.2), w: '90%', fontSize: 12, color: 'CCCCCC' });
            });

            // Slide 6: Tech Stack & Marketing
            const mktSlide = pptx.addSlide();
            mktSlide.background = { color: '0A0A0A' };
            mktSlide.addText('AI Tech Stack & Marketing', { x: 0.5, y: 0.5, fontSize: 24, color: 'FFD700', bold: true });
            mktSlide.addText('AI Tools:', { x: 0.5, y: 1.2, fontSize: 18, color: 'FFD700', bold: true });
            (strategy.techStack || []).slice(0, 3).forEach((item, i) => {
                mktSlide.addText(`• ${item.phase}: ${item.tool}`, { x: 0.5, y: 1.6 + (i * 0.4), fontSize: 14, color: 'FFFFFF' });
            });
            mktSlide.addText('Marketing KPIs:', { x: 5.0, y: 1.2, fontSize: 18, color: 'FFD700', bold: true });
            (strategy.marketingStrategy?.kpis || []).forEach((kpi, i) => {
                mktSlide.addText(`- ${kpi}`, { x: 5.0, y: 1.6 + (i * 0.4), fontSize: 14, color: 'FFFFFF' });
            });

            // Slide 5: Brand Identity
            const idSlide = pptx.addSlide();
            idSlide.background = { color: '000000' };
            idSlide.addText("7. Brand Identity & Strategy", { x: 0.5, y: 0.5, w: '90%', h: 0.5, fontSize: 24, bold: true, color: 'FFD700' });
            idSlide.addText(`Name: ${strategy.channelIdentity?.channelName || 'Unset'}`, { x: 0.5, y: 1.2, w: '90%', h: 0.4, fontSize: 18, color: 'FFFFFF', bold: true });
            idSlide.addText(`Slogan: ${strategy.channelIdentity?.slogan || 'None'}`, { x: 0.5, y: 1.6, w: '90%', h: 0.4, fontSize: 16, color: 'FFD700', italic: true });
            idSlide.addText(`Values: ${strategy.channelIdentity?.coreValues?.join(', ') || 'None'}`, { x: 0.5, y: 2.1, w: '90%', h: 0.4, fontSize: 12, color: 'CCCCCC' });
            idSlide.addText(`Mission: ${strategy.channelIdentity?.mission || 'None'}`, { x: 0.5, y: 2.6, w: '90%', h: 0.6, fontSize: 12, color: 'CCCCCC' });
            idSlide.addText(`Tone: ${strategy.channelIdentity?.toneOfVoice || 'None'}`, { x: 0.5, y: 3.3, w: '90%', h: 0.4, fontSize: 12, color: 'CCCCCC', italic: true });
            idSlide.addText(`SEO/Tags: ${strategy.channelIdentity?.seoTags?.join(', ') || 'None'}`, { x: 0.5, y: 3.8, w: '90%', h: 0.6, fontSize: 10, color: '666666' });

            const output = await pptx.write({ outputType: 'blob' });
            const fileName = getSafeFilename('Strategy_Presentation', 'pptx', strategy.id);
            console.log('[ResearchReporter] Saving PPTX as:', fileName);
            saveAs(output as Blob, fileName);
        } catch (error) {
            console.error('[ResearchReporter] PPTX Export failed:', error);
            alert('PowerPoint 파일 내보내기 중 오류가 발생했습니다.');
        }
    }

    /**
     * Export Strategy as PDF (.pdf)
     */
    static async exportToPdf(strategy: StrategyInsight) {
        try {
            if (!strategy) throw new Error('Strategy data is missing.');
            const doc = new jsPDF();

            // Helper for jspdf images
            const getBase64 = async (url?: string) => {
                if (!url) return null;
                try {
                    const resolved = await resolveUrl(url);
                    const response = await fetch(resolved);
                    const blob = await response.blob();
                    return new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                } catch (e) { return null; }
            };

            doc.setFontSize(22);
            doc.text("Strategic Intelligence Report", 20, 20);
            doc.setFontSize(14);
            doc.text(strategy.channelIdentity?.channelName || 'YouTube Strategy', 20, 30);
            doc.setFontSize(10);
            doc.text(`Generated on: ${new Date(strategy.createdAt).toLocaleDateString()}`, 20, 38);

            let currentY = 50;

            // Banner Image
            const banner = await getBase64(strategy.channelIdentity?.bannerUrl);
            if (banner) {
                doc.addImage(banner, 'JPEG', 20, currentY, 170, 60);
                currentY += 70;
            }

            doc.setFontSize(16);
            doc.text("1. Executive Summary", 20, currentY);
            currentY += 10;
            doc.setFontSize(11);
            const splitSummary = doc.splitTextToSize(strategy.executiveSummary || 'No summary available.', 170);
            doc.text(splitSummary, 20, currentY);
            currentY += (splitSummary.length * 7) + 10;

            // Profile & Slogan
            const profile = await getBase64(strategy.channelIdentity?.profileUrl);
            if (profile) {
                doc.addImage(profile, 'JPEG', 20, currentY, 30, 30);
                doc.setFontSize(14);
                doc.text((strategy.channelIdentity as any)?.slogan || '', 60, currentY + 15);
                currentY += 40;
            }

            const fileName = getSafeFilename('Strategy_Report', 'pdf', strategy.id);
            console.log('[ResearchReporter] Saving PDF as:', fileName);
            doc.save(fileName);
        } catch (error) {
            console.error('[ResearchReporter] PDF Export failed:', error);
            alert('PDF 파일 내보내기 중 오류가 발생했습니다.');
        }
    }

    static exportToMarkdown(strategy: StrategyInsight): string {
        return `
# AI Strategic Planning Report
> Generated on: ${new Date(strategy.createdAt).toLocaleDateString()}

## 1. Executive Summary
${strategy.executiveSummary || 'N/A'}

## 2. Content Pillars
${(strategy.recommendedPillars || []).map(p => `### ${p.pillarName}\n${p.reason}`).join('\n\n')}

## 3. Characters
${(strategy.characters || []).map(c => `### ${c.name} (${c.role})\n- Personality: ${c.personality}\n- Visual: ${c.visualGuide}`).join('\n\n')}

## 4. AI Tech Stack
${(strategy.techStack || []).map(s => `- **${s.phase}**: ${s.tool} (${s.usage})`).join('\n')}

## 5. Marketing Strategy
- **KPIs**: ${strategy.marketingStrategy?.kpis?.join(', ') || 'N/A'}
- **Viral Elements**: ${strategy.marketingStrategy?.viralElements?.join(', ') || 'N/A'}

## 6. Brand Identity
- **Name**: ${strategy.channelIdentity?.channelName || 'N/A'}
- **Slogan**: ${strategy.channelIdentity?.slogan || 'N/A'}
- **Core Values**: ${strategy.channelIdentity?.coreValues?.join(', ') || 'N/A'}
- **Bio**: ${strategy.channelIdentity?.bio || 'N/A'}
- **Keywords**: ${strategy.channelIdentity?.seoTags?.join(', ') || 'N/A'}
        `.trim();
    }
}
