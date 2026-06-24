import { NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, ShadingType, WidthType,
  Header, Footer, PageNumber, TabStopType, TabStopPosition,
} from 'docx'

// ─── Constants ────────────────────────────────────────────────────────────────

const NAVY = '1a2744'
const WHITE = 'FFFFFF'
const RED = 'dc2626'
const AMBER = 'b45309'
const GREEN = '166534'
const BLUE = '1d4ed8'
const LIGHT_GRAY = 'f8f9fa'
const MID_GRAY = 'e5e7eb'
const DARK_GRAY = '6b7280'
const BLACK = '111827'

const CONTENT_WIDTH = 9360 // 8.5" page, 1" margins each side = 6.5" = 9360 DXA

// Column widths — must sum to CONTENT_WIDTH (9360)
const COL_WIDTHS = [400, 900, 700, 1300, 1300, 700, 1530, 1530]

// ─── Text helpers ─────────────────────────────────────────────────────────────

const run = (text, opts = {}) =>
  new TextRun({ text: String(text ?? '').substring(0, 800), font: 'Times New Roman', size: 20, ...opts })

const boldRun = (text, opts = {}) => run(text, { bold: true, ...opts })

const para = (children, opts = {}) =>
  new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: 160 }, ...opts })

const headingPara = (text, level = 1) =>
  new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, font: 'Times New Roman', size: level === 1 ? 28 : 24, color: BLACK })],
    spacing: { before: 400, after: 200 },
    border: level === 1 ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: MID_GRAY, space: 4 } } : undefined,
  })

const cell = (text, opts = {}) => {
  const { color, bold, bg, width, center } = opts
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: bg ? { type: ShadingType.CLEAR, fill: bg } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: String(text ?? '').substring(0, 600),
            font: 'Times New Roman',
            size: 18,
            bold: bold || false,
            color: color || (bg === NAVY ? WHITE : BLACK),
          }),
        ],
      }),
    ],
  })
}

const borderConfig = {
  top: { style: BorderStyle.SINGLE, size: 1, color: MID_GRAY },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: MID_GRAY },
  left: { style: BorderStyle.SINGLE, size: 1, color: MID_GRAY },
  right: { style: BorderStyle.SINGLE, size: 1, color: MID_GRAY },
}

// ─── Build report sections ────────────────────────────────────────────────────

function buildReport({ deviations, doc1Name, doc2Name, analysisDate, pairLabel }) {
  const title = pairLabel || `${doc2Name || 'Received Draft'} vs ${doc1Name || 'Term Sheet'}`
  const dateStr = analysisDate
    ? new Date(analysisDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  const summary = {
    total: deviations.length,
    high: deviations.filter((d) => d.riskLevel === 'High').length,
    medium: deviations.filter((d) => d.riskLevel === 'Medium').length,
    low: deviations.filter((d) => d.riskLevel === 'Low').length,
    added: deviations.filter((d) => d.deviationType === 'Added').length,
    omitted: deviations.filter((d) => d.deviationType === 'Omitted').length,
    modified: deviations.filter((d) => d.deviationType === 'Modified').length,
  }

  const topHighRisk = deviations
    .filter((d) => d.riskLevel === 'High')
    .slice(0, 3)
    .map((d) => d.clauseName)

  const children = []

  // ── Cover page ──────────────────────────────────────────────────────────────

  children.push(
    new Paragraph({ spacing: { before: 2880 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: 'CONTRACT REVIEW REPORT', bold: true, font: 'Times New Roman', size: 56, color: BLACK })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [new TextRun({ text: 'Confidential \u2014 Attorney Work Product', font: 'Times New Roman', size: 24, color: RED, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: MID_GRAY, space: 4 } },
    }),
    new Paragraph({ spacing: { after: 480 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: 'Matter:  ', bold: true, font: 'Times New Roman', size: 24, color: BLACK }),
        new TextRun({ text: title, font: 'Times New Roman', size: 24, color: BLACK }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: 'Date:  ', bold: true, font: 'Times New Roman', size: 24, color: BLACK }),
        new TextRun({ text: dateStr, font: 'Times New Roman', size: 24, color: BLACK }),
      ],
    }),
    new Paragraph({ spacing: { after: 960 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: 'Generated by Deviate AI', font: 'Times New Roman', size: 18, color: DARK_GRAY, italics: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: 'Reviewed by:  ___________________________', font: 'Times New Roman', size: 20, color: BLACK })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: 'Date:  ___________________________', font: 'Times New Roman', size: 20, color: BLACK })],
    }),
  )

  // ── Executive summary ───────────────────────────────────────────────────────

  children.push(new Paragraph({ children: [], pageBreakBefore: true }))
  children.push(headingPara('EXECUTIVE SUMMARY'))

  children.push(
    para([
      run(`This report sets out the findings of an AI-assisted review of the received draft against the agreed term sheet for the matter: `),
      boldRun(title),
      run(`. We identified `),
      boldRun(String(summary.total)),
      run(` deviation${summary.total !== 1 ? 's' : ''} from the agreed position, of which `),
      boldRun(String(summary.high)),
      run(` are High risk, `),
      boldRun(String(summary.medium)),
      run(` Medium risk, and `),
      boldRun(String(summary.low)),
      run(` Low risk. All findings require review by instructed counsel before any response is sent.`),
    ])
  )

  // Metrics bullets using a simple table for alignment
  children.push(
    new Table({
      width: { size: 5400, type: WidthType.DXA },
      columnWidths: [2700, 2700],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              margins: { top: 60, bottom: 60, left: 0, right: 120 },
              children: [para([boldRun('Total Deviations'), run(':  ' + summary.total)])],
            }),
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              margins: { top: 60, bottom: 60, left: 120, right: 0 },
              children: [para([boldRun('Risk Breakdown'), run(`:  ${summary.high} High | ${summary.medium} Medium | ${summary.low} Low`)])],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              margins: { top: 60, bottom: 60, left: 0, right: 120 },
              children: [para([boldRun('Type Breakdown'), run(`:  ${summary.added} Added | ${summary.omitted} Omitted | ${summary.modified} Modified`)])],
            }),
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              margins: { top: 60, bottom: 60, left: 120, right: 0 },
              children: [new Paragraph({})],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 240 } })
  )

  if (topHighRisk.length > 0) {
    children.push(
      para([boldRun('Critical Issues Requiring Immediate Attention:')]),
      ...topHighRisk.map((name) =>
        new Paragraph({
          children: [run('\u2022  ' + name, { color: RED })],
          spacing: { after: 100 },
          indent: { left: 360 },
        })
      ),
      new Paragraph({ spacing: { after: 240 } })
    )
  }

  // ── Detailed findings ───────────────────────────────────────────────────────

  children.push(headingPara('DETAILED FINDINGS'))

  if (deviations.length === 0) {
    children.push(
      para([run('No material deviations identified. The received draft is consistent with the agreed term sheet.')])
    )
  } else {
    const HEADERS = ['#', 'Clause', 'Type', 'Term Sheet Position', 'Received Draft', 'Risk', 'Our Position', 'Suggested Response']

    const headerRow = new TableRow({
      tableHeader: true,
      children: HEADERS.map((h, idx) =>
        new TableCell({
          width: { size: COL_WIDTHS[idx], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: NAVY },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          borders: borderConfig,
          children: [
            new Paragraph({
              children: [new TextRun({ text: h, bold: true, font: 'Times New Roman', size: 18, color: WHITE })],
            }),
          ],
        })
      ),
    })

    const dataRows = deviations.map((dev, i) => {
      const isEven = i % 2 === 0
      const rowBg = isEven ? WHITE : LIGHT_GRAY

      const riskColor = dev.riskLevel === 'High' ? RED : dev.riskLevel === 'Medium' ? AMBER : GREEN
      const typeColor = dev.deviationType === 'Added' ? RED : dev.deviationType === 'Omitted' ? AMBER : BLUE

      const makeCell = (text, colorOverride) =>
        new TableCell({
          borders: borderConfig,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { type: ShadingType.CLEAR, fill: rowBg },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: String(text ?? '\u2014').substring(0, 600),
                  font: 'Times New Roman',
                  size: 18,
                  color: colorOverride || BLACK,
                }),
              ],
            }),
          ],
        })

      return new TableRow({
        children: [
          makeCell(i + 1),
          makeCell(dev.clauseName || '\u2014'),
          makeCell(dev.deviationType || 'Modified', typeColor),
          makeCell(dev.termSheetPosition || '\u2014'),
          makeCell(dev.receivedDraftPosition || '\u2014'),
          makeCell(dev.riskLevel || 'Unknown', riskColor),
          makeCell(dev.playbookPosition || 'No playbook entry'),
          makeCell(dev.suggestedResponse || 'No response configured'),
        ],
      })
    })

    children.push(
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: COL_WIDTHS,
        rows: [headerRow, ...dataRows],
      }),
      new Paragraph({ spacing: { after: 480 } })
    )
  }

  // ── Disclaimer ──────────────────────────────────────────────────────────────

  children.push(
    headingPara('Disclaimer', 2),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: 'This report was generated with AI assistance and must be reviewed by a qualified legal professional before use. Deviate is an AI tool and does not constitute legal advice. The suggested responses are based on pre-configured firm positions and should be tailored to the specific transaction context.',
          font: 'Times New Roman',
          size: 18,
          italics: true,
          color: DARK_GRAY,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `\u00A9 ${new Date().getFullYear()} Deviate. All rights reserved.`,
          font: 'Times New Roman',
          size: 16,
          color: DARK_GRAY,
        }),
      ],
    })
  )

  return children
}

// ─── Footer factory ───────────────────────────────────────────────────────────

function makeFooter() {
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: MID_GRAY, space: 4 } },
        spacing: { before: 80 },
        children: [
          new TextRun({ text: 'Confidential \u2014 Deviate AI Report', font: 'Times New Roman', size: 16, color: DARK_GRAY }),
          new TextRun({ text: '\t', font: 'Times New Roman', size: 16 }),
          new TextRun({ text: 'Page ', font: 'Times New Roman', size: 16, color: DARK_GRAY }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 16, color: DARK_GRAY }),
          new TextRun({ text: ' of ', font: 'Times New Roman', size: 16, color: DARK_GRAY }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Times New Roman', size: 16, color: DARK_GRAY }),
        ],
      }),
    ],
  })
}

// ─── Route handler ────────────────────────────────────────────────────────────

function sanitizeFilename(name) {
  return (name || 'report')
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50)
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { deviations, doc1Name, doc2Name, analysisDate, pairs, batchName } = body

    const sectionBase = {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      footers: { default: makeFooter() },
    }

    let doc
    let filename

    if (pairs && Array.isArray(pairs)) {
      // Batch export
      const allChildren = []
      pairs.forEach((pair, index) => {
        if (index > 0) allChildren.push(new Paragraph({ children: [], pageBreakBefore: true }))
        allChildren.push(
          ...buildReport({
            deviations: pair.deviations || [],
            doc1Name: pair.doc1Name || 'Document A',
            doc2Name: pair.doc2Name || 'Document B',
            analysisDate,
            pairLabel: `Pair ${index + 1}: ${pair.doc2Name || 'Document B'} vs ${pair.doc1Name || 'Document A'}`,
          })
        )
      })
      doc = new Document({
        styles: {
          default: { document: { run: { font: 'Times New Roman', size: 20 } } },
        },
        sections: [{ ...sectionBase, children: allChildren }],
      })
      filename = `Contract_Review_Batch_${batchName || 'Report'}_${new Date().toISOString().split('T')[0]}.docx`
    } else {
      doc = new Document({
        styles: {
          default: { document: { run: { font: 'Times New Roman', size: 20 } } },
        },
        sections: [{
          ...sectionBase,
          children: buildReport({
            deviations: deviations || [],
            doc1Name: doc1Name || 'Term Sheet',
            doc2Name: doc2Name || 'Received Draft',
            analysisDate,
          }),
        }],
      })
      filename = `Contract_Review_${sanitizeFilename(doc2Name || 'Report')}_${new Date().toISOString().split('T')[0]}.docx`
    }

    const buffer = await Packer.toBuffer(doc)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Export failed', details: error.message }, { status: 500 })
  }
}