import {
    Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun,
    Table, TableRow, TableCell, WidthType, Header, Footer, PageNumber,
    TableOfContents
} from 'docx';
import pptxgen from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { resolveUrl } from '../utils/imageStorage';
import type { StrategyInsight } from '../store/types';

/**
 * Generate a safe filename for various exports across the app.
 * Handles Korean characters and removing unsafe filename characters.
 */
export function getSafeFilename(baseName: string, extension: string, id?: string) {
    const safeBase = baseName.replace(/[^a-z0-9가-힣\s-_]/gi, '_').trim();
    const suffix = id ? `_${id.slice(0, 8)}` : '';
    return `${safeBase}${suffix}.${extension}`;
}

export class ResearchReporter {
    /**
     * Export Strategy as Microsoft Word (.docx)
     * UPGRADED: TOC, Tables, Header/Footer, Styling
     */
    static async exportToDocx(strategy: StrategyInsight) {
        try {
            console.log('[ResearchReporter] Exporting DOCX for strategy:', strategy.id);
            if (!strategy) throw new Error('Strategy data is missing.');

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
                    headers: {
                        default: new Header({
                            children: [
                                new Paragraph({
                                    children: [
                                        new TextRun({ text: "Strategic Intelligence Report", italics: true, color: "888888" })
                                    ],
                                    alignment: AlignmentType.RIGHT
                                })
                            ]
                        })
                    },
                    footers: {
                        default: new Footer({
                            children: [
                                new Paragraph({
                                    children: [
                                        new TextRun({ text: "Page " }),
                                        PageNumber.CURRENT,
                                        new TextRun({ text: " of " }),
                                        PageNumber.TOTAL_PAGES
                                    ],
                                    alignment: AlignmentType.CENTER
                                })
                            ]
                        })
                    },
                    children: [
                        // --- Title Section ---
                        new Paragraph({
                            children: [new TextRun({ text: strategy.channelIdentity?.channelName || 'YouTube Strategy', bold: true, size: 56 })],
                            alignment: AlignmentType.CENTER,
                        }),
                        new Paragraph({
                            children: [new TextRun({ text: `Generated on: ${new Date(strategy.createdAt).toLocaleDateString()}` })],
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 400 },
                        }),

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

                        // --- TOC ---
                        new Paragraph({
                            children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, color: "2E74B5" })],
                            spacing: { before: 200, after: 100 }
                        }),
                        new TableOfContents("Outline", {
                            hyperlink: true,
                            headingStyleRange: "1-5",
                        }),
                        new Paragraph({ children: [new TextRun({ text: "" })], pageBreakBefore: true }),

                        // --- Execution Summary ---
                        new Paragraph({
                            children: [new TextRun({ text: "1. Executive Summary", bold: true, size: 32, color: "2E74B5" })],
                            spacing: { before: 400, after: 200 }
                        }),
                        new Paragraph({
                            children: [new TextRun({ text: strategy.executiveSummary || 'No summary available.', italics: true })],
                            spacing: { after: 200 }
                        }),

                        // --- Strategic Factors (SWOT) ---
                        new Paragraph({
                            children: [new TextRun({ text: "2. Strategic SWOT Analysis", bold: true, size: 32, color: "2E74B5" })],
                            spacing: { before: 400, after: 200 }
                        }),
                        new Paragraph({
                            children: [new TextRun({ text: "Key Opportunities", bold: true, color: "22C55E" })],
                        }),
                        ...(strategy.keyOpportunities || []).map(o => new Paragraph({ children: [new TextRun({ text: `• ${o}` })], spacing: { after: 100 } })),
                        new Paragraph({
                            children: [new TextRun({ text: "Strategic Risks", bold: true, color: "EF4444" })],
                            spacing: { before: 200 }
                        }),
                        ...(strategy.keyRisks || []).map(r => new Paragraph({ children: [new TextRun({ text: `• ${r}` })], spacing: { after: 100 } })),

                        // --- Strategic Pillars ---
                        new Paragraph({
                            children: [new TextRun({ text: "3. Strategic Pillars", bold: true, size: 32, color: "2E74B5" })],
                            spacing: { before: 400, after: 200 }
                        }),
                        new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            rows: [
                                new TableRow({
                                    children: [
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Pillar Name", bold: true })] })], shading: { fill: "F2F2F2" } }),
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Strategic Reasoning", bold: true })] })], shading: { fill: "F2F2F2" } })
                                    ]
                                }),
                                ...(strategy.recommendedPillars || []).map(p =>
                                    new TableRow({
                                        children: [
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: p.pillarName, bold: true })] })] }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: p.reason })] })] })
                                        ]
                                    })
                                )
                            ]
                        }),

                        // --- Brand Ident ---
                        new Paragraph({
                            children: [new TextRun({ text: "4. Brand Identity & Audience", bold: true, size: 32, color: "2E74B5" })],
                            spacing: { before: 400, after: 200 }
                        }),
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
                        new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            rows: [
                                new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Attribute", bold: true })] })], shading: { fill: "EEEEEE" } }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Value", bold: true })] })], shading: { fill: "EEEEEE" } })] }),
                                new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Slogan" })] })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: strategy.channelIdentity?.slogan || '-' })] })] })] }),
                                new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Mission" })] })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: strategy.channelIdentity?.mission || '-' })] })] })] }),
                                new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Tone" })] })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: strategy.channelIdentity?.toneOfVoice || '-' })] })] })] }),
                                new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Target Audience" })] })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: strategy.channelIdentity?.targetAudience || '-' })] })] })] }),
                            ]
                        }),

                        // --- Tech Stack ---
                        new Paragraph({
                            children: [new TextRun({ text: "5. Tech Stack Strategy", bold: true, size: 32, color: "2E74B5" })],
                            spacing: { before: 400, after: 200 }
                        }),
                        new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            rows: [
                                new TableRow({
                                    children: [
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Phase", bold: true, color: "FFFFFF" })] })], shading: { fill: "2E74B5" } }),
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Tool", bold: true, color: "FFFFFF" })] })], shading: { fill: "2E74B5" } }),
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Usage", bold: true, color: "FFFFFF" })] })], shading: { fill: "2E74B5" } })
                                    ]
                                }),
                                ...(strategy.techStack || []).map(t =>
                                    new TableRow({
                                        children: [
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t.phase })] })] }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t.tool, bold: true })] })] }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t.usage })] })] })
                                        ]
                                    })
                                )
                            ]
                        }),

                        // --- Personas ---
                        new Paragraph({
                            children: [new TextRun({ text: "6. Character Personas", bold: true, size: 32, color: "2E74B5" })],
                            spacing: { before: 400, after: 200 }
                        }),
                        ...(strategy.characters || []).flatMap(char => [
                            new Paragraph({ children: [new TextRun({ text: char.name, bold: true, size: 24 })] }),
                            new Paragraph({ children: [new TextRun({ text: `Role: ${char.role}`, italics: true })] }),
                            new Paragraph({ children: [new TextRun({ text: char.personality })], spacing: { after: 100 } }),
                            new Paragraph({ children: [new TextRun({ text: `Visual: ${char.visualGuide}`, italics: true, color: "666666" })], spacing: { after: 200 } })
                        ]),

                        // --- Series Roadmap ---
                        new Paragraph({
                            children: [new TextRun({ text: "7. Series Roadmap", bold: true, size: 32, color: "2E74B5" })],
                            spacing: { before: 400, after: 200 }
                        }),
                        ...(strategy.recommendedSeries || []).flatMap(series => [
                            new Paragraph({
                                children: [new TextRun({ text: series.title, bold: true, size: 28, color: "2E74B5" })],
                                spacing: { before: 200 }
                            }),
                            new Paragraph({ children: [new TextRun({ text: series.description })] }),
                            new Paragraph({ children: [new TextRun({ text: `Target Pillar: ${series.targetPillar} | Expected Audience: ${series.expectedAudience}`, italics: true, color: "888888" })], spacing: { after: 100 } }),
                            new Table({
                                width: { size: 100, type: WidthType.PERCENTAGE },
                                rows: [
                                    new TableRow({
                                        children: [
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Episode", bold: true })] })], shading: { fill: "F2F2F2" } }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Format", bold: true })] })], shading: { fill: "F2F2F2" } }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Angle/Hook", bold: true })] })], shading: { fill: "F2F2F2" } })
                                        ]
                                    }),
                                    ...(series.episodes || []).map(ep => new TableRow({
                                        children: [
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ep.ideaTitle, bold: true })], spacing: { after: 50 } }), new Paragraph({ children: [new TextRun({ text: ep.oneLiner, size: 18, italics: true })] })] }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ep.format })] })] }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ep.angle })] })] })
                                        ]
                                    }))
                                ]
                            }),
                            new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 200 } })
                        ]),

                        // --- Marketing Strategy ---
                        new Paragraph({
                            children: [new TextRun({ text: "8. Marketing & Growth Strategy", bold: true, size: 32, color: "2E74B5" })],
                            spacing: { before: 400, after: 200 }
                        }),
                        new Paragraph({ children: [new TextRun({ text: "Target KPIs", bold: true })] }),
                        ...(strategy.marketingStrategy?.kpis || []).map(k => new Paragraph({ children: [new TextRun({ text: `• ${k}` })] })),
                        new Paragraph({ children: [new TextRun({ text: "Viral Elements", bold: true })], spacing: { before: 200 } }),
                        new Paragraph({ children: [new TextRun({ text: (strategy.marketingStrategy?.viralElements || []).join(", ") })] }),
                        new Paragraph({ children: [new TextRun({ text: "Interactive Ideas", bold: true })], spacing: { before: 200 } }),
                        ...(strategy.marketingStrategy?.interactiveIdeas || []).map(i => new Paragraph({ children: [new TextRun({ text: `• ${i}` })] })),
                    ],
                }],
            });

            const blob = await Packer.toBlob(doc);
            saveAs(blob, getSafeFilename('Strategy_Report', 'docx', strategy.id));
        } catch (error) {
            console.error('[ResearchReporter] DOCX Export failed:', error);
            alert('Word 파일 내보내기 중 오류가 발생했습니다.');
        }
    }

    /**
     * Export Strategy as PowerPoint (.pptx)
     * UPGRADED: Professional Widescreen Layouts, Master Slides, and Color Palette
     */
    static async exportToPptx(strategy: StrategyInsight) {
        try {
            if (!strategy) throw new Error('Strategy data is missing.');
            const pptx = new pptxgen();

            // 1. Define Layout (13.33" x 7.5" - Standard Widescreen)
            pptx.defineLayout({ name: 'CUSTOM_WIDE', width: 13.333, height: 7.5 });
            pptx.layout = 'CUSTOM_WIDE';

            const COLORS = {
                BACKGROUND: '121417',
                ACCENT: 'E7A170',
                TEXT_MAIN: 'FFFFFF',
                TEXT_SECONDARY: 'FFFFFF'
            };

            const slideNumberStyle: pptxgen.SlideNumberProps = {
                x: 10.5, y: 6.92, w: 1.5, h: 0.3,
                align: 'right', fontFace: 'Noto Sans KR', fontSize: 13.5, color: COLORS.ACCENT, bold: true
            };

            // 2. Define Master Slides
            // TITLE MASTER
            pptx.defineSlideMaster({
                title: 'TITLE_SLIDE',
                background: { color: COLORS.BACKGROUND },
                objects: [
                    { rect: { x: 1.04, y: 4.54, w: 7.38, h: 0.01, fill: { color: COLORS.ACCENT } } },
                    { rect: { x: 12.27, y: 6.92, w: 0.02, h: 0.27, fill: { color: COLORS.ACCENT } } }
                ],
                slideNumber: slideNumberStyle
            });

            // CHAPTER MASTER
            pptx.defineSlideMaster({
                title: 'CHAPTER_SLIDE',
                background: { color: COLORS.BACKGROUND },
                objects: [
                    { rect: { x: 6.04, y: 4.40, w: 1.25, h: 0.08, fill: { color: COLORS.ACCENT } } },
                    { rect: { x: 12.27, y: 6.92, w: 0.02, h: 0.27, fill: { color: COLORS.ACCENT } } }
                ],
                slideNumber: slideNumberStyle
            });

            // CONTENT MASTER
            pptx.defineSlideMaster({
                title: 'CONTENT_SLIDE',
                background: { color: COLORS.BACKGROUND },
                objects: [
                    { rect: { x: 1.04, y: 0.83, w: 0.08, h: 0.60, fill: { color: COLORS.ACCENT } } },
                    { rect: { x: 12.27, y: 6.92, w: 0.02, h: 0.27, fill: { color: COLORS.ACCENT } } }
                ],
                slideNumber: slideNumberStyle
            });

            // --- 3. Generate Slides ---

            // PAGE 1: COVER
            const slide1 = pptx.addSlide({ masterName: 'TITLE_SLIDE' });
            slide1.addText(strategy.channelIdentity?.channelName || 'YouTube Strategic Report', {
                x: 1.04, y: 1.82, w: 7.75, h: 2.33,
                fontFace: 'Noto Sans KR', fontSize: 60, color: COLORS.TEXT_MAIN, bold: true, align: 'left', valign: 'top'
            });
            slide1.addText(strategy.channelIdentity?.slogan || 'Generated by IdeaToLife AI', {
                x: 0.99, y: 4.80, w: 8.26, h: 0.40,
                fontFace: 'Noto Sans KR', fontSize: 24, color: COLORS.TEXT_MAIN, align: 'left'
            });

            // PAGE 2: EXECUTIVE SUMMARY
            const summarySlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' });
            summarySlide.addText('Executive Summary', {
                x: 1.33, y: 0.83, w: 11.51, h: 0.66,
                fontFace: 'Noto Sans KR', fontSize: 39, color: COLORS.TEXT_MAIN, bold: true, align: 'left'
            });
            summarySlide.addText(strategy.executiveSummary || 'No summary provided.', {
                x: 1.33, y: 1.8, w: 11.0, h: 2.0,
                fontFace: 'Noto Sans KR', fontSize: 18, color: COLORS.TEXT_SECONDARY, align: 'left', valign: 'top',
                lineSpacing: 28
            });

            // PAGE 2.1: STRATEGIC FACTORS (Opportunities & Risks)
            const factorSlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' });
            factorSlide.addText('Strategic SWOT Analysis', { x: 1.33, y: 0.83, w: 11.51, h: 0.66, fontFace: 'Noto Sans KR', fontSize: 39, color: COLORS.TEXT_MAIN, bold: true });

            // Opportunities Box
            factorSlide.addShape(pptx.ShapeType.rect, { x: 1.33, y: 1.8, w: 5.2, h: 4.5, fill: { color: '1A1D21' }, line: { color: '22C55E' } });
            factorSlide.addText('✨ KEY OPPORTUNITIES', { x: 1.5, y: 1.9, w: 4.8, h: 0.4, fontFace: 'Noto Sans KR', fontSize: 16, color: '22C55E', bold: true });
            factorSlide.addText(strategy.keyOpportunities.map(o => `• ${o}`).join('\n\n'), {
                x: 1.5, y: 2.4, w: 4.8, h: 3.5, fontFace: 'Noto Sans KR', fontSize: 13, color: COLORS.TEXT_MAIN, valign: 'top'
            });

            // Risks Box
            factorSlide.addShape(pptx.ShapeType.rect, { x: 6.7, y: 1.8, w: 5.2, h: 4.5, fill: { color: '1A1D21' }, line: { color: 'EF4444' } });
            factorSlide.addText('⚠️ STRATEGIC RISKS', { x: 6.9, y: 1.9, w: 4.8, h: 0.4, fontFace: 'Noto Sans KR', fontSize: 16, color: 'EF4444', bold: true });
            factorSlide.addText(strategy.keyRisks.map(r => `• ${r}`).join('\n\n'), {
                x: 6.9, y: 2.4, w: 4.8, h: 3.5, fontFace: 'Noto Sans KR', fontSize: 13, color: COLORS.TEXT_MAIN, valign: 'top'
            });

            // PAGE 3: BRAND IDENTITY (CHAPTER)
            const brandChapter = pptx.addSlide({ masterName: 'CHAPTER_SLIDE' });
            brandChapter.addText('CHAPTER 01', {
                x: 5.71, y: 2.11, w: 1.92, h: 0.28,
                fontFace: 'Noto Sans KR', fontSize: 16.5, color: COLORS.ACCENT, bold: true, align: 'center'
            });
            brandChapter.addText('Brand Identity & Vision', {
                x: 2.49, y: 2.69, w: 8.19, h: 1.03,
                fontFace: 'Noto Sans KR', fontSize: 48, color: COLORS.TEXT_MAIN, bold: true, align: 'center'
            });

            // PAGE 4: IDENTITY DETAILS (Card Layout)
            const identitySlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' });
            identitySlide.addText('Identity & Voice', { x: 1.33, y: 0.83, w: 11.51, h: 0.66, fontFace: 'Noto Sans KR', fontSize: 39, color: COLORS.TEXT_MAIN, bold: true });

            const cardConfigs = [
                { label: 'MISSION', value: strategy.channelIdentity?.mission || 'N/A', icon: '🎯' },
                { label: 'SLOGAN', value: strategy.channelIdentity?.slogan || 'N/A', icon: '📢' },
                { label: 'TONE OF VOICE', value: strategy.channelIdentity?.toneOfVoice || 'N/A', icon: '🎭' }
            ];

            cardConfigs.forEach((card, idx) => {
                const yPos = 1.8 + (idx * 1.6);
                identitySlide.addShape(pptx.ShapeType.rect, {
                    x: 1.33, y: yPos, w: 10.6, h: 1.4,
                    fill: { color: '1A1D21' }, line: { color: COLORS.ACCENT, width: 1 }
                });
                identitySlide.addText(`${card.icon} ${card.label}`, {
                    x: 1.5, y: yPos + 0.15, w: 3.0, h: 0.4,
                    fontFace: 'Noto Sans KR', fontSize: 14, color: COLORS.ACCENT, bold: true
                });
                identitySlide.addText(card.value, {
                    x: 1.5, y: yPos + 0.5, w: 10.0, h: 0.8,
                    fontFace: 'Noto Sans KR', fontSize: 17, color: COLORS.TEXT_MAIN, valign: 'top'
                });
            });

            // PAGE 5: PERSONAS
            (strategy.characters || []).forEach((char) => {
                const charSlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' });
                charSlide.addText(`${char.name} (${char.role})`, { x: 1.33, y: 0.83, w: 11.51, h: 0.66, fontFace: 'Noto Sans KR', fontSize: 39, color: COLORS.TEXT_MAIN, bold: true });
                charSlide.addShape(pptx.ShapeType.rect, {
                    x: 1.33, y: 1.8, w: 10.6, h: 1.2, fill: { color: '1A1D21' }, line: { color: COLORS.ACCENT, width: 1 }
                });
                charSlide.addText(`PERSONALITY: ${char.personality}`, {
                    x: 1.5, y: 1.9, w: 10.0, h: 1.0,
                    fontFace: 'Noto Sans KR', fontSize: 18, color: COLORS.ACCENT, bold: true, valign: 'middle'
                });
                charSlide.addText('VISUAL GUIDE', {
                    x: 1.33, y: 3.4, w: 3.0, h: 0.4, fontFace: 'Noto Sans KR', fontSize: 16, color: COLORS.TEXT_MAIN, bold: true
                });
                charSlide.addText(char.visualGuide, {
                    x: 1.33, y: 3.9, w: 10.6, h: 2.5, fontFace: 'Noto Sans KR', fontSize: 17, color: COLORS.TEXT_SECONDARY, valign: 'top', lineSpacing: 26
                });
            });

            // PAGE 6: STRATEGIC PILLARS (CHAPTER)
            const pillarChapter = pptx.addSlide({ masterName: 'CHAPTER_SLIDE' });
            pillarChapter.addText('CHAPTER 02', {
                x: 5.71, y: 2.11, w: 1.92, h: 0.28,
                fontFace: 'Noto Sans KR', fontSize: 16.5, color: COLORS.ACCENT, bold: true, align: 'center'
            });
            pillarChapter.addText('Strategic Content Pillars', {
                x: 2.49, y: 2.69, w: 8.19, h: 1.03,
                fontFace: 'Noto Sans KR', fontSize: 48, color: COLORS.TEXT_MAIN, bold: true, align: 'center'
            });

            (strategy.recommendedPillars || []).forEach((pillar) => {
                const pillarSlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' });
                pillarSlide.addText(pillar.pillarName, { x: 1.33, y: 0.83, w: 11.51, h: 0.66, fontFace: 'Noto Sans KR', fontSize: 39, color: COLORS.TEXT_MAIN, bold: true });
                pillarSlide.addShape(pptx.ShapeType.rect, { x: 1.33, y: 1.6, w: 10.6, h: 0.05, fill: { color: COLORS.ACCENT } });
                pillarSlide.addText(pillar.reason, {
                    x: 1.33, y: 2.2, w: 11.0, h: 4.5, fontFace: 'Noto Sans KR', fontSize: 20, color: COLORS.TEXT_SECONDARY, valign: 'top', lineSpacing: 30
                });
            });

            // PAGE: RECOMMENDED SERIES (CHAPTER 03)
            const seriesChapter = pptx.addSlide({ masterName: 'CHAPTER_SLIDE' });
            seriesChapter.addText('CHAPTER 03', { x: 5.71, y: 2.11, w: 1.92, h: 0.28, fontFace: 'Noto Sans KR', fontSize: 16.5, color: COLORS.ACCENT, bold: true, align: 'center' });
            seriesChapter.addText('Series Roadmap & Production', { x: 2.49, y: 2.69, w: 8.19, h: 1.03, fontFace: 'Noto Sans KR', fontSize: 48, color: COLORS.TEXT_MAIN, bold: true, align: 'center' });

            (strategy.recommendedSeries || []).forEach((series) => {
                const seriesSlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' });
                seriesSlide.addText(series.title, { x: 1.33, y: 0.83, w: 11.51, h: 0.66, fontFace: 'Noto Sans KR', fontSize: 39, color: COLORS.TEXT_MAIN, bold: true });

                seriesSlide.addShape(pptx.ShapeType.rect, { x: 1.33, y: 1.8, w: 10.6, h: 1.4, fill: { color: '1A1D21' } });
                seriesSlide.addText(series.description, { x: 1.5, y: 1.8, w: 10.0, h: 1.4, fontFace: 'Noto Sans KR', fontSize: 18, color: COLORS.TEXT_MAIN, valign: 'middle' });

                seriesSlide.addText(`PILLAR: ${series.targetPillar}  |  TARGET: ${series.expectedAudience}`, {
                    x: 1.33, y: 3.3, w: 10.6, h: 0.4, fontFace: 'Noto Sans KR', fontSize: 14, color: COLORS.ACCENT, bold: true
                });

                // Top 3 Episodes for this series
                const episodes = series.episodes?.slice(0, 3) || [];
                episodes.forEach((ep, eidx) => {
                    const eY = 3.9 + (eidx * 1.0);
                    seriesSlide.addShape(pptx.ShapeType.rect, { x: 1.33, y: eY, w: 10.6, h: 0.8, fill: { color: 'FFFFFF', alpha: 5 } });
                    seriesSlide.addText(`Ep.${eidx + 1} ${ep.ideaTitle}`, { x: 1.5, y: eY + 0.1, w: 4.0, h: 0.3, fontFace: 'Noto Sans KR', fontSize: 14, color: COLORS.ACCENT, bold: true });
                    seriesSlide.addText(ep.oneLiner, { x: 1.5, y: eY + 0.4, w: 10.0, h: 0.3, fontFace: 'Noto Sans KR', fontSize: 12, color: COLORS.TEXT_MAIN });
                });
            });

            // TECH STACK (CHAPTER 04)
            if (strategy.techStack && strategy.techStack.length > 0) {
                const techChapter = pptx.addSlide({ masterName: 'CHAPTER_SLIDE' });
                techChapter.addText('CHAPTER 04', { x: 5.71, y: 2.11, w: 1.92, h: 0.28, fontFace: 'Noto Sans KR', fontSize: 16.5, color: COLORS.ACCENT, bold: true, align: 'center' });
                techChapter.addText('Recommended AI Tech Stack', { x: 2.49, y: 2.69, w: 8.19, h: 1.03, fontFace: 'Noto Sans KR', fontSize: 48, color: COLORS.TEXT_MAIN, bold: true, align: 'center' });

                const techSlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' });
                techSlide.addText('Production AI Toolkit', { x: 1.33, y: 0.83, w: 11.51, h: 0.66, fontFace: 'Noto Sans KR', fontSize: 39, color: COLORS.TEXT_MAIN, bold: true });

                // Tech Table Rows
                const rows = [['PHASE', 'TOOL', 'USAGE']];
                strategy.techStack.forEach(item => rows.push([item.phase, item.tool, item.usage]));
                techSlide.addTable(rows, {
                    x: 1.33, y: 1.8, w: 10.6,
                    fontFace: 'Noto Sans KR', fontSize: 12, color: COLORS.TEXT_MAIN,
                    border: { color: 'FFFFFF', alpha: 10, pt: 1 },
                    fill: { color: '1A1D21' },
                    headerRow: true,
                    headerRowProps: { fill: { color: '1A1D21' }, color: COLORS.ACCENT, bold: true },
                    valign: 'middle',
                    align: 'left',
                    colW: [2.0, 3.0, 5.6]
                });
            }

            // MARKETING & KPI (CHAPTER 05)
            if (strategy.marketingStrategy) {
                const marketingChapter = pptx.addSlide({ masterName: 'CHAPTER_SLIDE' });
                marketingChapter.addText('CHAPTER 05', { x: 5.71, y: 2.11, w: 1.92, h: 0.28, fontFace: 'Noto Sans KR', fontSize: 16.5, color: COLORS.ACCENT, bold: true, align: 'center' });
                marketingChapter.addText('Growth & KPI Strategy', { x: 2.49, y: 2.69, w: 8.19, h: 1.03, fontFace: 'Noto Sans KR', fontSize: 48, color: COLORS.TEXT_MAIN, bold: true, align: 'center' });

                const marketingSlide = pptx.addSlide({ masterName: 'CONTENT_SLIDE' });
                marketingSlide.addText('Marketing & KPIs', { x: 1.33, y: 0.83, w: 11.51, h: 0.66, fontFace: 'Noto Sans KR', fontSize: 39, color: COLORS.TEXT_MAIN, bold: true });

                // KPIs
                marketingSlide.addText('📊 TARGET KPIs', { x: 1.33, y: 1.8, w: 5.2, h: 0.4, fontFace: 'Noto Sans KR', fontSize: 20, color: COLORS.ACCENT, bold: true });
                marketingSlide.addText(strategy.marketingStrategy.kpis.map(k => `• ${k}`).join('\n'), {
                    x: 1.33, y: 2.4, w: 5.2, h: 3.5, fontFace: 'Noto Sans KR', fontSize: 16, color: COLORS.TEXT_MAIN, valign: 'top'
                });

                // Viral Elements
                marketingSlide.addText('🚀 VIRAL ELEMENTS', { x: 6.7, y: 1.8, w: 5.2, h: 0.4, fontFace: 'Noto Sans KR', fontSize: 20, color: COLORS.ACCENT, bold: true });
                marketingSlide.addText((strategy.marketingStrategy.viralElements || []).map(v => `#${v}`).join('  '), {
                    x: 6.7, y: 2.4, w: 5.2, h: 1.0, fontFace: 'Noto Sans KR', fontSize: 16, color: COLORS.TEXT_MAIN, valign: 'top'
                });

                // Interactive Ideas
                marketingSlide.addText('💬 INTERACTIVE IDEAS', { x: 6.7, y: 3.6, w: 5.2, h: 0.4, fontFace: 'Noto Sans KR', fontSize: 20, color: COLORS.ACCENT, bold: true });
                marketingSlide.addText((strategy.marketingStrategy.interactiveIdeas || []).map(i => `• ${i}`).join('\n'), {
                    x: 6.7, y: 4.2, w: 5.2, h: 2.0, fontFace: 'Noto Sans KR', fontSize: 15, color: COLORS.TEXT_MAIN, valign: 'top'
                });
            }

            const output = await pptx.write({ outputType: 'blob' });
            saveAs(output as Blob, getSafeFilename('Strategic_Intelligence_Report', 'pptx', strategy.id));
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

            doc.setFillColor(10, 10, 10);
            doc.rect(0, 0, 210, 297, 'F');

            doc.setTextColor(255, 215, 0); // Gold
            doc.setFontSize(28);
            doc.text("STRATEGIC REPORT", 20, 40);

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18);
            doc.text(strategy.channelIdentity?.channelName || 'YouTube Strategy', 20, 55);

            let currentY = 70;

            const banner = await getBase64(strategy.channelIdentity?.bannerUrl);
            if (banner) {
                doc.addImage(banner, 'JPEG', 20, currentY, 170, 60);
                currentY += 70;
            }

            // Executive Summary
            doc.setFontSize(16);
            doc.setTextColor(255, 215, 0); // Gold
            doc.text("1. EXECUTIVE SUMMARY", 20, currentY);
            currentY += 10;

            doc.setTextColor(200, 200, 200);
            doc.setFontSize(10);
            const summaryLines = doc.splitTextToSize(strategy.executiveSummary || 'N/A', 170);
            doc.text(summaryLines, 20, currentY);
            currentY += (summaryLines.length * 6) + 10;

            // SWOT Analysis
            doc.setFontSize(16);
            doc.setTextColor(255, 215, 0);
            doc.text("2. STRATEGIC SWOT", 20, currentY);
            currentY += 10;

            doc.setFontSize(10);
            doc.setTextColor(34, 197, 94); // Green
            doc.text("OPPORTUNITIES", 20, currentY);
            currentY += 7;
            doc.setTextColor(200, 200, 200);
            (strategy.keyOpportunities || []).slice(0, 3).forEach(o => {
                const oLines = doc.splitTextToSize(`• ${o}`, 170);
                doc.text(oLines, 20, currentY);
                currentY += (oLines.length * 6);
            });
            currentY += 5;

            doc.setTextColor(239, 68, 68); // Red
            doc.text("RISKS", 20, currentY);
            currentY += 7;
            doc.setTextColor(200, 200, 200);
            (strategy.keyRisks || []).slice(0, 3).forEach(r => {
                const rLines = doc.splitTextToSize(`• ${r}`, 170);
                doc.text(rLines, 20, currentY);
                currentY += (rLines.length * 6);
            });
            currentY += 15;

            // Content Pillars
            if (currentY > 250) { doc.addPage(); doc.setFillColor(10, 10, 10); doc.rect(0, 0, 210, 297, 'F'); currentY = 20; }
            doc.setFontSize(16);
            doc.setTextColor(255, 215, 0);
            doc.text("3. CONTENT PILLARS", 20, currentY);
            currentY += 10;

            (strategy.recommendedPillars || []).forEach((p) => {
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(11);
                doc.text(p.pillarName, 20, currentY);
                currentY += 6;
                doc.setTextColor(150, 150, 150);
                doc.setFontSize(9);
                const pLines = doc.splitTextToSize(p.reason, 170);
                doc.text(pLines, 20, currentY);
                currentY += (pLines.length * 5) + 6;
            });
            currentY += 10;

            // Series & Episodes
            if (currentY > 230) { doc.addPage(); doc.setFillColor(10, 10, 10); doc.rect(0, 0, 210, 297, 'F'); currentY = 20; }
            doc.setFontSize(16);
            doc.setTextColor(255, 215, 0);
            doc.text("4. SERIES ROADMAP", 20, currentY);
            currentY += 10;

            (strategy.recommendedSeries || []).slice(0, 3).forEach((s) => {
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(12);
                doc.text(s.title, 20, currentY);
                currentY += 6;
                doc.setTextColor(150, 150, 150);
                doc.setFontSize(9);
                const descLines = doc.splitTextToSize(s.description, 170);
                doc.text(descLines, 20, currentY);
                currentY += (descLines.length * 5) + 4;

                (s.episodes || []).slice(0, 2).forEach(ep => {
                    doc.setTextColor(231, 161, 112); // Accent
                    doc.text(`- Ep: ${ep.ideaTitle}`, 25, currentY);
                    currentY += 5;
                });
                currentY += 10;
            });

            // Personas, Tech, Marketing (Quick summaries to fit)
            if (currentY > 250) { doc.addPage(); doc.setFillColor(10, 10, 10); doc.rect(0, 0, 210, 297, 'F'); currentY = 20; }
            doc.setFontSize(16);
            doc.setTextColor(255, 215, 0);
            doc.text("5. BRAND & PRODUCTION", 20, currentY);
            currentY += 10;

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.text(`TONE: ${strategy.channelIdentity?.toneOfVoice || 'N/A'}`, 20, currentY);
            currentY += 7;
            doc.text(`KPIs: ${(strategy.marketingStrategy?.kpis || []).join(", ").slice(0, 100)}...`, 20, currentY);
            currentY += 7;
            doc.text(`TECH: ${(strategy.techStack || []).map(t => t.tool).join(", ")}`, 20, currentY);

            doc.save(getSafeFilename('Strategy_Report', 'pdf', strategy.id));
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
        `.trim();
    }
}
