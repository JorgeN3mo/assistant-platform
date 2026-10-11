#!/usr/bin/env python3
"""Render a frozen collection report from JSON stdin to PDF stdout. No network."""
import io
import json
import sys
from datetime import datetime
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Table, TableStyle


def amount(cents):
    whole, fraction = divmod(cents, 100)
    return f'{whole:,}'.replace(',', '.') + f',{fraction:02d}'


def date(value):
    return datetime.fromisoformat(value).strftime('%d/%m/%Y') if value else ''


def render(report):
    buffer = io.BytesIO()
    width, height = landscape(A4)
    color = colors.HexColor(report['color'])
    ink = colors.HexColor('#14336C')
    styles = {align: ParagraphStyle(str(align), fontName='Helvetica', fontSize=8,
                                   leading=10, alignment=align, textColor=ink)
              for align in (TA_LEFT, TA_RIGHT, TA_CENTER)}

    def cell(value, align=TA_LEFT, header=False):
        style = styles[align]
        if header:
            style = ParagraphStyle('header', parent=style, fontName='Helvetica-Bold',
                                   fontSize=7.5, leading=9, textColor=colors.white)
        return Paragraph(escape(str(value)), style)

    def header(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(color)
        canvas.setFont('Helvetica-Bold', 21)
        canvas.drawString(24, height - 42, report['company_label'])
        canvas.setFillColor(ink)
        canvas.setFont('Helvetica-Bold', 11)
        closed = datetime.fromisoformat(report['closed_at'].replace('Z', '+00:00')).astimezone(ZoneInfo('Europe/Madrid'))
        canvas.drawRightString(width - 24, height - 39, closed.strftime('%d/%m/%Y'))
        canvas.setFont('Helvetica-Bold', 11)
        canvas.drawString(24, height - 63, 'PARTE DE COBROS')
        name = Paragraph(escape(report['commercial_name'].upper()), ParagraphStyle(
            'name', fontName='Helvetica-Bold', fontSize=10, leading=12, textColor=ink))
        _, name_height = name.wrap(width - 48, 40)
        name.drawOn(canvas, 24, height - 71 - name_height)
        canvas.setStrokeColor(color)
        canvas.line(24, 30, width - 24, 30)
        canvas.setFont('Helvetica', 8)
        canvas.drawString(24, 18, f"Liquidación {report['company_code']}-{report['batch_id']} · v{report['version']} · Comisión: 3 % sobre base · EUR")
        canvas.drawRightString(width - 24, 18, f'Página {doc.page}')
        canvas.restoreState()

    groups = ['CÓDIGO', 'CLIENTE', 'Nº FRA / ABONO', '', 'COBROS', '', '', '', '', 'DOCUMENTO', '', 'COMISIÓN', '']
    columns = ['', '', 'Documento', 'Importe', 'Efectivo', 'Pagaré', 'Transf.', 'Tarjeta', 'Dtos.', 'Banco', 'Vto. / fecha', 'Base', 'Comisión']
    data = [[cell(v, TA_CENTER, True) for v in groups], [cell(v, TA_CENTER, True) for v in columns]]
    for row in report['rows']:
        vals = [row['client_code'], row['client'], row['number_short'], amount(row['amount_cents'])]
        vals += [amount(row['amount_cents']) if row['payment'] == method else ''
                 for method in ('efectivo', 'pagare', 'transferencia', 'tarjeta')]
        vals += ['', row['bank'], date(row['date']), amount(row['base_cents']), amount(row['commission_cents'])]
        data.append([cell(v, TA_RIGHT if i in (3, 4, 5, 6, 7, 11, 12) else TA_LEFT) for i, v in enumerate(vals)])
    # A short report retains the familiar writing-grid appearance of the template.
    for _ in range(max(0, 18 - len(report['rows']))):
        data.append([''] * 13)
    totals = report['totals']
    values = ['SUMAS TOTALES', '', '', amount(totals['amount_cents'])]
    values += [amount(totals[method]) for method in ('efectivo', 'pagare', 'transferencia', 'tarjeta')]
    values += ['', '', '', amount(totals['base_cents']), amount(totals['commission_cents'])]
    data.append([cell(v, TA_RIGHT if i >= 3 else TA_CENTER, True) for i, v in enumerate(values)])
    widths = [42, 184, 48, 55, 52, 48, 52, 47, 32, 60, 56, 60, 58]
    scale = (width - 48) / sum(widths)
    table = Table(data, colWidths=[w * scale for w in widths], repeatRows=2,
                  minRowHeights=[20, 20] + [17] * (len(data) - 3) + [25])
    commands = [('BACKGROUND', (0, 0), (-1, 1), color),
                ('SPAN', (0, 0), (0, 1)), ('SPAN', (1, 0), (1, 1)),
                ('SPAN', (2, 0), (3, 0)), ('SPAN', (4, 0), (8, 0)),
                ('SPAN', (9, 0), (10, 0)), ('SPAN', (11, 0), (12, 0)),
                ('ROWBACKGROUNDS', (0, 2), (-1, -2), [colors.white, colors.HexColor('#F0F2F5')]),
                ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#C8CED6')),
                ('BACKGROUND', (0, -1), (-1, -1), color), ('SPAN', (0, -1), (2, -1)),
                ('NOSPLIT', (0, -2), (-1, -1)), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 3), ('RIGHTPADDING', (0, 0), (-1, -1), 3),
                ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]
    table.setStyle(TableStyle(commands))
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=24, rightMargin=24,
                            topMargin=110, bottomMargin=42, title='Parte de cobros',
                            author='Liquidator', pageCompression=1)
    doc.build([table], onFirstPage=header, onLaterPages=header)
    return buffer.getvalue()


if __name__ == '__main__':
    report = json.load(sys.stdin)
    if not 1 <= len(report['rows']) <= 2000:
        raise ValueError('Invalid report size')
    sys.stdout.buffer.write(render(report))
