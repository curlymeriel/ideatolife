import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import pptxgen from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import type { StrategyInsight } from '../store/types';

export class ResearchReporter {
    /**
     * Export Strategy as Microsoft Word (.docx)
     */
    static async exportToDocx(strategy: StrategyInsight) {
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
                        text: `Generated on: ${new Date(strategy.createdAt).toLocaleDateString()}`,
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 400 },
                    }),

                    new Paragraph({ text: "1. Executive Summary", heading: HeadingLevel.HEADING_2 }),
                    new Paragraph({ text: strategy.executiveSummary, spacing: { after: 200 } }),

                    new Paragraph({ text: "2. Strategic Pillars", heading: HeadingLevel.HEADING_2 }),
                    ...strategy.recommendedPillars.map(pillar => [
                        new Paragraph({ text: pillar.pillarName, heading: HeadingLevel.HEADING_3 }),
                        new Paragraph({ text: pillar.reason, spacing: { after: 100 } })
                    ]).flat(),

                    new Paragraph({ text: "3. Recommended Series", heading: HeadingLevel.HEADING_2 }),
                    ...strategy.recommendedSeries.map(series => [
                        new Paragraph({ text: series.title, heading: HeadingLevel.HEADING_3 }),
                        new Paragraph({ text: `Target: ${series.targetPillar} | Audience: ${series.expectedAudience}`, spacing: { after: 50 } }),
                        new Paragraph({ text: series.description, spacing: { after: 100 } })
                    ]).flat(),

                    new Paragraph({ text: "4. Episode Recommendations", heading: HeadingLevel.HEADING_2 }),
                    ...strategy.recommendedEpisodes.map(ep => [
                        new Paragraph({ text: `${ep.ideaTitle} (${ep.format})`, heading: HeadingLevel.HEADING_3 }),
                        new Paragraph({ children: [new TextRun({ text: ep.oneLiner, italics: true })] }),
                        new Paragraph({ text: `Angle: ${ep.angle}`, spacing: { after: 100 } })
                    ]).flat(),

                    new Paragraph({ text: "5. Character Personas", heading: HeadingLevel.HEADING_2 }),
                    ...(strategy.characters || []).map(char => [
                        new Paragraph({ text: `${char.name} (${char.role})`, heading: HeadingLevel.HEADING_3 }),
                        new Paragraph({ text: char.personality }),
                        new Paragraph({ children: [new TextRun({ text: `Visual Style: ${char.visualGuide}`, italics: true })], spacing: { after: 100 } })
                    ]).flat(),

                    new Paragraph({ text: "6. Recommended AI Tech Stack", heading: HeadingLevel.HEADING_2 }),
                    ...(strategy.techStack || []).map(item => [
                        new Paragraph({ children: [new TextRun({ text: `${item.phase}: `, bold: true }), new TextRun(item.tool)] }),
                        new Paragraph({ text: item.usage, spacing: { after: 50 } })
                    ]).flat(),

                    new Paragraph({ text: "7. Marketing & KPI Strategy", heading: HeadingLevel.HEADING_2 }),
                    new Paragraph({ children: [new TextRun({ text: "Target KPIs: ", bold: true }), new TextRun(strategy.marketingStrategy?.kpis.join(', ') || 'None')] }),
                    new Paragraph({ children: [new TextRun({ text: "Viral Elements: ", bold: true }), new TextRun(strategy.marketingStrategy?.viralElements.join(', ') || 'None')] }),
                    new Paragraph({ children: [new TextRun({ text: "Interactive Ideas: ", bold: true }), new TextRun(strategy.marketingStrategy?.interactiveIdeas?.join(', ') || 'None')], spacing: { after: 200 } }),

                    new Paragraph({ text: "8. Channel Brand Identity", heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
                    new Paragraph({ children: [new TextRun({ text: `Channel Name: ${strategy.channelIdentity?.channelName || 'Unset'}`, bold: true })] }),
                    new Paragraph({ children: [new TextRun({ text: `Slogan: ${(strategy.channelIdentity as any)?.slogan || 'None'}`, italics: true })] }),
                    new Paragraph({ text: `Handle: @${strategy.channelIdentity?.handle || 'handle'}` }),
                    new Paragraph({ text: `Bio: ${strategy.channelIdentity?.bio || 'None'}` }),
                    new Paragraph({ text: `Core Values: ${(strategy.channelIdentity as any)?.coreValues?.join(', ') || 'None'}`, spacing: { after: 100 } }),
                    new Paragraph({ text: `Mission: ${(strategy.channelIdentity as any)?.mission || 'None'}` }),
                    new Paragraph({ text: `Tone of Voice: ${(strategy.channelIdentity as any)?.toneOfVoice || 'None'}` }),
                    new Paragraph({ text: `Target Audience: ${(strategy.channelIdentity as any)?.targetAudience || 'None'}`, spacing: { after: 200 } }),
                    new Paragraph({ text: `SEO Tags: ${strategy.channelIdentity?.seoTags?.join(', ') || 'None'}` }),
                    new Paragraph({ text: `Hashtags: ${strategy.channelIdentity?.hashtags?.map(h => '#' + h).join(' ') || 'N/A'}`, spacing: { after: 100 } }),
                ],
            }],
        });

        const blob = await Packer.toBlob(doc);
        const fileName = `Strategy_Report_${strategy.id.substring(0, 8)}.docx`;
        saveAs(blob, fileName);
    }

    /**
     * Export Strategy as PowerPoint (.pptx)
     */
    static async exportToPptx(strategy: StrategyInsight) {
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
        slide2.addText(strategy.executiveSummary, { x: 0.5, y: 1.5, w: '90%', fontSize: 16, color: 'FFFFFF' });

        // Slide 3: Content Pillars
        const slide3 = pptx.addSlide();
        slide3.background = { color: '0A0A0A' };
        slide3.addText('Content Pillars', { x: 0.5, y: 0.5, fontSize: 24, color: 'FFD700', bold: true });
        strategy.recommendedPillars.forEach((p, i) => {
            slide3.addText(`• ${p.pillarName}: ${p.reason}`, { x: 0.5, y: 1.5 + (i * 1.0), w: '90%', fontSize: 14, color: 'FFFFFF' });
        });

        // Slide 4: Episodes
        const slide4 = pptx.addSlide();
        slide4.background = { color: '0A0A0A' };
        slide4.addText('Episode Ideas', { x: 0.5, y: 0.5, fontSize: 24, color: 'FFD700', bold: true });
        strategy.recommendedEpisodes.slice(0, 4).forEach((ep, i) => {
            slide4.addText(`${i + 1}. ${ep.ideaTitle}`, { x: 0.5, y: 1.5 + (i * 0.8), fontSize: 16, color: 'FFFFFF', bold: true });
            slide4.addText(ep.oneLiner, { x: 0.8, y: 1.8 + (i * 0.8), fontSize: 12, color: 'AAAAAA', italic: true });
        });

        // Slide 5: Characters
        const charSlide = pptx.addSlide();
        charSlide.background = { color: '0A0A0A' };
        charSlide.addText('Character Personas', { x: 0.5, y: 0.5, fontSize: 24, color: 'FFD700', bold: true });
        strategy.characters?.slice(0, 3).forEach((char, i) => {
            charSlide.addText(`${char.name} (${char.role})`, { x: 0.5, y: 1.5 + (i * 1.2), fontSize: 16, color: 'FFFFFF', bold: true });
            charSlide.addText(char.personality, { x: 0.5, y: 1.9 + (i * 1.2), w: '90%', fontSize: 12, color: 'CCCCCC' });
        });

        // Slide 6: Tech Stack & Marketing
        const mktSlide = pptx.addSlide();
        mktSlide.background = { color: '0A0A0A' };
        mktSlide.addText('AI Tech Stack & Marketing', { x: 0.5, y: 0.5, fontSize: 24, color: 'FFD700', bold: true });
        mktSlide.addText('AI Tools:', { x: 0.5, y: 1.2, fontSize: 18, color: 'FFD700', bold: true });
        strategy.techStack?.slice(0, 3).forEach((item, i) => {
            mktSlide.addText(`• ${item.phase}: ${item.tool}`, { x: 0.5, y: 1.6 + (i * 0.4), fontSize: 14, color: 'FFFFFF' });
        });
        mktSlide.addText('Marketing KPIs:', { x: 5.0, y: 1.2, fontSize: 18, color: 'FFD700', bold: true });
        strategy.marketingStrategy?.kpis.forEach((kpi, i) => {
            mktSlide.addText(`- ${kpi}`, { x: 5.0, y: 1.6 + (i * 0.4), fontSize: 14, color: 'FFFFFF' });
        });

        // Slide 5: Brand Identity
        const idSlide = pptx.addSlide();
        idSlide.background = { color: '000000' };
        idSlide.addText("7. Brand Identity & Strategy", { x: 0.5, y: 0.5, w: '90%', h: 0.5, fontSize: 24, bold: true, color: 'FFD700' });
        idSlide.addText(`Name: ${strategy.channelIdentity?.channelName || 'Unset'}`, { x: 0.5, y: 1.2, w: '90%', h: 0.4, fontSize: 18, color: 'FFFFFF', bold: true });
        idSlide.addText(`Slogan: ${(strategy.channelIdentity as any)?.slogan || 'None'}`, { x: 0.5, y: 1.6, w: '90%', h: 0.4, fontSize: 16, color: 'FFD700', italic: true });
        idSlide.addText(`Values: ${(strategy.channelIdentity as any)?.coreValues?.join(', ') || 'None'}`, { x: 0.5, y: 2.1, w: '90%', h: 0.4, fontSize: 12, color: 'CCCCCC' });
        idSlide.addText(`Mission: ${(strategy.channelIdentity as any)?.mission || 'None'}`, { x: 0.5, y: 2.6, w: '90%', h: 0.6, fontSize: 12, color: 'CCCCCC' });
        idSlide.addText(`Tone: ${(strategy.channelIdentity as any)?.toneOfVoice || 'None'}`, { x: 0.5, y: 3.3, w: '90%', h: 0.4, fontSize: 12, color: 'CCCCCC', italic: true });
        idSlide.addText(`SEO/Tags: ${strategy.channelIdentity?.seoTags?.join(', ') || 'None'}`, { x: 0.5, y: 3.8, w: '90%', h: 0.6, fontSize: 10, color: '666666' });

        const output = await pptx.write({ outputType: 'blob' });
        saveAs(output as Blob, `Strategy_Presentation_${strategy.id.substring(0, 8)}.pptx`);
    }

    /**
     * Export Strategy as PDF (.pdf)
     */
    static exportToPdf(strategy: StrategyInsight) {
        const doc = new jsPDF();
        doc.setFontSize(22);
        doc.text("Strategic Intelligence Report", 20, 20);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date(strategy.createdAt).toLocaleDateString()}`, 20, 30);

        doc.setFontSize(16);
        doc.text("Executive Summary", 20, 50);
        doc.setFontSize(11);
        const splitSummary = doc.splitTextToSize(strategy.executiveSummary, 170);
        doc.text(splitSummary, 20, 60);

        doc.save(`Strategy_Report_${strategy.id.substring(0, 8)}.pdf`);
    }

    static exportToMarkdown(strategy: StrategyInsight): string {
        return `
# AI Strategic Planning Report
> Generated on: ${new Date(strategy.createdAt).toLocaleDateString()}

## 1. Executive Summary
${strategy.executiveSummary}

## 2. Content Pillars
${strategy.recommendedPillars.map(p => `### ${p.pillarName}\n${p.reason}`).join('\n\n')}

## 3. Characters
${strategy.characters?.map(c => `### ${c.name} (${c.role})\n- Personality: ${c.personality}\n- Visual: ${c.visualGuide}`).join('\n\n')}

## 4. AI Tech Stack
${strategy.techStack?.map(s => `- **${s.phase}**: ${s.tool} (${s.usage})`).join('\n')}

## 5. Marketing Strategy
- **KPIs**: ${strategy.marketingStrategy?.kpis.join(', ')}
- **Viral Elements**: ${strategy.marketingStrategy?.viralElements.join(', ')}

## 6. Brand Identity
- **Name**: ${strategy.channelIdentity?.channelName}
- **Slogan**: ${(strategy.channelIdentity as any)?.slogan}
- **Core Values**: ${(strategy.channelIdentity as any)?.coreValues?.join(', ')}
- **Bio**: ${strategy.channelIdentity?.bio}
- **Keywords**: ${strategy.channelIdentity?.seoTags?.join(', ')}
        `.trim();
    }
}
