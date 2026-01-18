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
                        text: "AI Strategic Planning Report",
                        heading: HeadingLevel.HEADING_1,
                        alignment: AlignmentType.CENTER,
                    }),
                    new Paragraph({
                        text: `Generated on: ${new Date(strategy.createdAt).toLocaleDateString()}`,
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 400 },
                    }),
                    new Paragraph({
                        text: "Executive Summary",
                        heading: HeadingLevel.HEADING_2,
                    }),
                    new Paragraph({
                        text: strategy.executiveSummary,
                        spacing: { after: 200 },
                    }),
                    new Paragraph({
                        text: "Key Opportunities",
                        heading: HeadingLevel.HEADING_2,
                    }),
                    ...strategy.keyOpportunities.map(opp => new Paragraph({
                        text: `• ${opp}`,
                        bullet: { level: 0 }
                    })),
                    new Paragraph({
                        text: "",
                        spacing: { after: 200 },
                    }),
                    new Paragraph({
                        text: "Risk Management",
                        heading: HeadingLevel.HEADING_2,
                    }),
                    ...strategy.keyRisks.map(risk => new Paragraph({
                        text: `• ${risk}`,
                        bullet: { level: 0 }
                    })),
                    new Paragraph({
                        text: "",
                        spacing: { after: 200 },
                    }),
                    new Paragraph({
                        text: "Content Pillars",
                        heading: HeadingLevel.HEADING_2,
                    }),
                    ...strategy.recommendedPillars.map(pillar => {
                        return [
                            new Paragraph({
                                text: pillar.pillarName,
                                heading: HeadingLevel.HEADING_3,
                            }),
                            new Paragraph({
                                text: pillar.reason,
                                spacing: { after: 100 },
                            })
                        ]
                    }).flat(),
                ],
            }],
        });

        const blob = await Packer.toBlob(doc);
        saveAs(blob, `Strategy_Report_${strategy.id.substring(0, 8)}.docx`);
    }

    /**
     * Export Strategy as PowerPoint (.pptx)
     */
    static async exportToPptx(strategy: StrategyInsight) {
        const pptx = new pptxgen();
        pptx.layout = 'LAYOUT_16x9';

        // Slide 1: Title
        const slide1 = pptx.addSlide();
        slide1.background = { color: '111111' };
        slide1.addText('AI Strategic Planning Report', { x: 1, y: 2, w: '80%', fontSize: 36, color: 'FFFFFF', bold: true, align: 'center' });
        slide1.addText(`Generated on: ${new Date(strategy.createdAt).toLocaleDateString()}`, { x: 1, y: 3.5, w: '80%', fontSize: 18, color: 'AAAAAA', align: 'center' });

        // Slide 2: Executive Summary
        const slide2 = pptx.addSlide();
        slide2.background = { color: '111111' };
        slide2.addText('Executive Summary', { x: 0.5, y: 0.5, fontSize: 24, color: 'FFD700', bold: true });
        slide2.addText(strategy.executiveSummary, { x: 0.5, y: 1.5, w: '90%', fontSize: 16, color: 'FFFFFF' });

        // Slide 3: Opportunities & Risks
        const slide3 = pptx.addSlide();
        slide3.background = { color: '111111' };
        slide3.addText('SWOT Analysis', { x: 0.5, y: 0.5, fontSize: 24, color: 'FFD700', bold: true });

        slide3.addText('Opportunities', { x: 0.5, y: 1.5, fontSize: 18, color: '00FF00', bold: true });
        strategy.keyOpportunities.forEach((opp, i) => {
            slide3.addText(`• ${opp}`, { x: 0.5, y: 2.0 + (i * 0.4), w: '40%', fontSize: 14, color: 'FFFFFF' });
        });

        slide3.addText('Risks', { x: 5.5, y: 1.5, fontSize: 18, color: 'FF0000', bold: true });
        strategy.keyRisks.forEach((risk, i) => {
            slide3.addText(`• ${risk}`, { x: 5.5, y: 2.0 + (i * 0.4), w: '40%', fontSize: 14, color: 'FFFFFF' });
        });

        // Slide 4: Content Pillars
        const slide4 = pptx.addSlide();
        slide4.background = { color: '111111' };
        slide4.addText('Core Content Pillars', { x: 0.5, y: 0.5, fontSize: 24, color: 'FFD700', bold: true });

        strategy.recommendedPillars.forEach((pillar, i) => {
            const xPos = 0.5 + (i * 3.2);
            slide4.addShape(pptx.ShapeType.rect, { x: xPos, y: 1.5, w: 3, h: 4, fill: { color: '222222' } });
            slide4.addText(pillar.pillarName, { x: xPos + 0.2, y: 1.7, w: 2.6, fontSize: 16, color: 'FFFFFF', bold: true });
            slide4.addText(pillar.reason, { x: xPos + 0.2, y: 2.5, w: 2.6, fontSize: 12, color: 'CCCCCC' });
        });

        await pptx.writeFile({ fileName: `Strategy_Presentation_${strategy.id.substring(0, 8)}.pptx` });
    }

    /**
     * Export Strategy as PDF (.pdf)
     */
    static exportToPdf(strategy: StrategyInsight) {
        const doc = new jsPDF();

        doc.setFontSize(22);
        doc.text("AI Strategic Planning Report", 20, 20);

        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date(strategy.createdAt).toLocaleDateString()}`, 20, 30);

        doc.setFontSize(16);
        doc.text("Executive Summary", 20, 50);
        doc.setFontSize(12);

        const splitSummary = doc.splitTextToSize(strategy.executiveSummary, 170);
        doc.text(splitSummary, 20, 60);

        let yPos = 60 + (splitSummary.length * 7) + 10;

        doc.setFontSize(16);
        doc.text("Key Opportunities", 20, yPos);
        yPos += 10;
        doc.setFontSize(12);
        strategy.keyOpportunities.forEach(opp => {
            doc.text(`• ${opp}`, 20, yPos);
            yPos += 7;
        });

        yPos += 10;
        doc.setFontSize(16);
        doc.text("Key Risks", 20, yPos);
        yPos += 10;
        doc.setFontSize(12);
        strategy.keyRisks.forEach(risk => {
            doc.text(`• ${risk}`, 20, yPos);
            yPos += 7;
        });

        doc.save(`Strategy_Report_${strategy.id.substring(0, 8)}.pdf`);
    }

    /**
     * Export Strategy as Markdown (.md) - For quick copy
     */
    static exportToMarkdown(strategy: StrategyInsight): string {
        return `
# AI Strategic Planning Report
> Generated on: ${new Date(strategy.createdAt).toLocaleDateString()}

## Executive Summary
${strategy.executiveSummary}

## Key Opportunities
${strategy.keyOpportunities.map(o => `- ${o}`).join('\n')}

## Key Risks
${strategy.keyRisks.map(r => `- ${r}`).join('\n')}

## Content Pillars
${strategy.recommendedPillars.map(p => `### ${p.pillarName}\n${p.reason}`).join('\n\n')}
        `.trim();
    }
}
