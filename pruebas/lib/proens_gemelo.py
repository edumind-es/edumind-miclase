#!/usr/bin/env python3
"""
Genera un PDF gemelo de una programación didáctica de PROENS (Xunta de
Galicia) para probar el parser de MiClase sin depender del PDF real.

Reproduce lo que importa del original: las mismas tablas, con las mismas
columnas, celdas combinadas (el instrumento y su % abarcan varios criterios)
y textos partidos en varias líneas. El contenido es el de la programación de
Ciencias Sociais de 6º del CEP Campolongo (curso 2026/2027).

Uso:  python3 pruebas/lib/proens_gemelo.py salida.pdf
      pdftotext -layout salida.pdf pruebas/fixtures/proens_ccss6.txt
"""
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle, PageBreak)

P = ParagraphStyle('p', fontName='Helvetica', fontSize=8.5, leading=10.5)
PB = ParagraphStyle('pb', parent=P, fontName='Helvetica-Bold')
H = ParagraphStyle('h', fontName='Helvetica-Bold', fontSize=10.5, leading=13, spaceBefore=8, spaceAfter=4)
T = ParagraphStyle('t', fontName='Helvetica-Bold', fontSize=16, leading=20, spaceAfter=10)

GRIS = colors.HexColor('#e6e6e6')
BASE = TableStyle([
    ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('BACKGROUND', (0, 0), (-1, 0), GRIS),
])

def par(t, st=P):
    return Paragraph(t, st)

def tabla(filas, anchos, estilo_extra=()):
    t = Table(filas, colWidths=anchos, repeatRows=1)
    st = TableStyle(BASE.getCommands() + list(estilo_extra))
    t.setStyle(st)
    return t

# ── Datos ────────────────────────────────────────────────────────────────

CRITERIOS = {
    'CA1.1': 'Utilizar recursos dixitais de acordo coas necesidades do contexto educativo de forma segura e eficiente, buscando información, comunicándose e traballando de forma individual, en equipo e en rede.',
    'CA1.2': 'Formular preguntas e realizar predicións razoadas sobre o medio natural, social ou cultural, mostrando e mantendo a curiosidade.',
    'CA1.3': 'Buscar, seleccionar e contrastar información, de diferentes fontes seguras e fiables, usando os criterios de fiabilidade de fontes, adquirindo léxico científico básico, utilizándoa en investigacións relacionadas co medio natural, social e cultural.',
    'CA1.4': 'Realizar experimentos guiados, utilizando diferentes técnicas de indagación e modelos, empregando de forma segura os instrumentos e dispositivos apropiados, realizando observacións e medicións precisas e rexistrándoas correctamente.',
    'CA2.1': 'Identificar as características, a organización e as propiedades dos elementos do medio natural, social e cultural a través de metodoloxías de indagación e utilizando as ferramentas e os procesos adecuados.',
    'CA2.2': 'Establecer conexións sinxelas entre diferentes elementos do medio natural, social e cultural, mostrando comprensión das relacións que se establecen.',
    'CA2.3': 'Promover estilos de vida sustentable e consecuentes co respecto, cos coidados, coa corresponsabilidade e coa protección das persoas e do planeta, a partir da análise crítica da intervención humana na contorna.',
    'CA2.4': 'Participar con actitude emprendedora na procura, no contraste e na avaliación de propostas para afrontar problemas ecosociais, buscar solucións e actuar para a súa resolución, a partir da análise crítica das causas e consecuencias da intervención humana na contorna.',
    'CA3.1': 'Analizar os procesos xeográficos, históricos e culturais que conformaron a sociedade actual, valorando a diversidade etnocultural ou afectivo-sexual e a cohesión social, e mostrando empatía e respecto por outras culturas e a igualdade de xénero.',
    'CA3.2': 'Promover actitudes de igualdade de xénero e condutas non sexistas, analizando e contrastando diferentes modelos na nosa sociedade.',
    'CA3.3': 'Resolver de forma pacífica e dialogada os conflitos, promovendo unha interacción respectuosa e equitativa a partir da linguaxe inclusiva e non violenta e explicando e exercitando as principais normas, dereitos, deberes e liberdades que forman parte da Constitución española e da Unión Europea, e coñecendo a función que o Estado e as súas institucións desempeñan no mantemento da paz, da seguridade integral cidadá e no recoñecemento das vítimas da violencia',
    'CA3.4': 'Explicar o funcionamento xeral dos órganos de goberno do concello, das comunidades autónomas, do Estado español e da Unión Europea, valorando as súas funcións e a xestión dos servizos públicos para a cidadanía.',
    'CA4.1': 'Valorar, protexer e mostrar actitudes de conservación e mellora do patrimonio natural e cultural a través de propostas e accións que reflictan compromisos e condutas en favor da sustentabilidade.',
    'CA4.2': 'Analizar relacións de causalidade, simultaneidade e sucesión entre diferentes elementos do medio social e cultural desde a Idade Media ata a actualidade, situando cronoloxicamente os feitos.',
    'CA4.3': 'Coñecer persoas, grupos sociais relevantes e formas de vida das sociedades desde a Idade Media ata a actualidade, incorporando a perspectiva de xénero, situándoas cronoloxicamente e identificando trazos significativos sociais en distintas épocas da historia.',
    'CA4.4': 'Promover actitudes de igualdade de xénero e condutas non sexistas, analizando e contrastando diferentes modelos na nosa sociedade.',
}

MIN = {
    'CA1.1': 'Utilizar determinados dispositivos e recursos dixitais de acordo co contexto.',
    'CA1.2': 'Amosar curiosidade polo medio natural, social e cultural máis próximo.',
    'CA1.3a': 'Realizar actividades no contexto da comunidade escolar de forma cooperativa.',
    'CA1.3b': 'Utilizar algunha fonte de información para as súas investigacións.',
    'CA1.4': 'Participar en experimentos guiados e no rexistro dos datos correspondentes.',
    'CA2.1': 'Identificar certas características e elementos do medio natural, social e cultural.',
    'CA2.2': 'Relacionar, de xeito sinxelo, os elementos do medio natural, social e cultural.',
    'CA2.3': 'Coñecer diferentes problemáticas ecosociais e participar na conservación e mellora da contorna favorecendo o desenvolvemento sustentable',
    'CA2.4': 'Participar con actitude emprendedora ante problemas ecosociais.',
    'CA3.1': 'Coñecer como está conformada a sociedade actual.',
    'CA3.2': 'Adoptar unha actitude tolerante có resto.',
    'CA3.3': 'Coñecer algunhas institucións autonómicas, estatais e europeas e as súas funcións básicas para manter a paz.',
    'CA3.4': 'Coñecer algúns dos órganos de goberno e servizos públicos básicos.',
    'CA4.2': 'Identificar feitos da contorna social e cultural desde a Idade Media ata a actualidade.',
    'CA4.3': 'Coñecer persoas, grupos sociais relevantes e formas de vida das sociedades desde a Idade Media ata a actualidade, incorporando a identidade de xénero.',
    'CA4.4': 'Promove actitudes de igualdade de xénero e condutas non sexistas',
}

CONTIDOS_COMUNS = [
    'Fases da investigación científica (observación, formulación de preguntas e predicións, planificación e realización de experimentos, recollida e análises de información e datos, comunicación de resultados...). Iniciativa emprendedora.',
    'Técnicas para unha adecuada exposición oral dos resultados dunha investigación, con claridade e orde. Presentación de resultados en formatos diversos.',
    'Vocabulario científico básico relacionado coas diferentes investigacións. Realización dun glosario.',
]

# (nº, título, descrición 3.1, peso, sesións, trimestre, grupos de criterios [(IA, %, [(CA, mínimo)])], contidos)
UDS = [
    (1, 'O MUNDO QUE NOS RODEA',
     ['Comprender a relación entre a cartografía e a realidade.',
      'Describir correctamente planos e mapas, incluíndo os planisferios, interpretando a súa escala e signos convencionais.',
      'Coñecer os principais tipos de mapas (físicos, políticos e temáticos) e as partes que os compoñen.',
      'Aprender a localizar nun mapa países, cidades ou accidentes xeográficos.'],
     15, 10, 1,
     [('PE', 80, [('CA2.1', MIN['CA2.1']), ('CA2.2', 'Relacionar, de xeito sinxelo, elementos do medio natural, social e cultural.')]),
      ('TI', 20, [('CA1.1', MIN['CA1.1']), ('CA1.2', MIN['CA1.2']), ('CA1.3', MIN['CA1.3a']), ('CA1.4', MIN['CA1.4']), ('CA3.1', MIN['CA3.1'])])],
     CONTIDOS_COMUNS + ['O clima e o planeta. Introdución á dinámica atmosférica e ás grandes áreas climáticas do mundo. Os principais ecosistemas e as súas paisaxes.']),
    (2, 'ºO CLIMA E A PAISAXE',
     ['Diferenciar entre clima e tempo atmosférico.', 'Recoñecer os principais elementos do clima (temperatura e precipitacións).',
      'Valorar a influencia do clima na nosa vida.'],
     14, 10, 1,
     [('PE', 80, [('CA2.1', MIN['CA2.1']), ('CA2.2', MIN['CA2.2']), ('CA2.3', MIN['CA2.3'])]),
      ('TI', 20, [('CA1.1', MIN['CA1.1']), ('CA1.2', MIN['CA1.2']), ('CA1.3', MIN['CA1.3b']), ('CA1.4', MIN['CA1.4']),
                  ('CA2.4', 'articipa con actitude emprendedora na procura, contraste e avaliación de propostas para afrontar problemas ecosociais, buscar solucións')])],
     CONTIDOS_COMUNS + ['O cambio climático. Responsabilidade ecosocial. Ecodependencia, interdependencia e interrelación entre persoas, sociedades e medio natural.']),
    (3, 'O HOME E A TERRA',
     ['Coñecer a influencia do comportamento humano no medio natural.', 'Identificar o emprego sostible dos recursos naturais.'],
     15, 8, 1,
     [('PE', 80, [('CA2.1', 'Identificar certas características de elementos de medio natural, social e cultural.'), ('CA2.2', 'Relacionar de xeito sinxelo os elementos do medio natural, social e cultural.'), ('CA3.1', MIN['CA3.1'])]),
      ('TI', 20, [('CA1.1', MIN['CA1.1']), ('CA1.2', MIN['CA1.2']), ('CA1.3', MIN['CA1.3a']), ('CA1.4', MIN['CA1.4']), ('CA3.2', MIN['CA3.2'])])],
     CONTIDOS_COMUNS + ['Estilos de vida sustentable: a pegada ecolóxica.']),
    (4, 'A ORGANIZACIÓN POLÍTICO-TERRITORIAL DA NOSA CONTORNA',
     ['Explicar que é a Unión Europea e cales son os seus obxectivos políticos e económicos.',
      'Identificar as formas de organización política e territorial de Galicia.'],
     15, 8, 2,
     [('PE', 80, [('CA2.1', MIN['CA2.1']), ('CA2.2', MIN['CA2.2'])]),
      ('TI', 20, [('CA1.1', MIN['CA1.1']), ('CA1.2', MIN['CA1.2']), ('CA1.3', MIN['CA1.3b']), ('CA1.4', MIN['CA1.4']),
                  ('CA2.4', MIN['CA2.4']), ('CA3.3', MIN['CA3.3']), ('CA3.4', MIN['CA3.4'])])],
     CONTIDOS_COMUNS + ['España e a Unión Europea. Formas de goberno. Fórmulas para a participación da cidadanía na vida pública.']),
    (5, 'A XENTE DO PLANETA TERRA',
     ['Definir a poboación dun territorio e identificar os factores que inciden nela.',
      'Identificar os problemas actuais da poboación: envellecemento, inmigración, superpoboación etc.'],
     15, 8, 2,
     [('PE', 80, [('CA3.1', MIN['CA3.1']), ('CA3.4', MIN['CA3.4'])]),
      ('TI', 20, [('CA1.1', MIN['CA1.1']), ('CA1.2', MIN['CA1.2']), ('CA1.3', MIN['CA1.3b']), ('CA1.4', MIN['CA1.4']), ('CA4.4', MIN['CA4.4'])])],
     CONTIDOS_COMUNS + ['Seguridade viaria. Normas básicas de circulación, sinais de tráfico e marcas viarias.']),
    (6, 'A ECONOMÍA E O SEU FUNCIONAMENTO',
     ['Identificar e caracterizar os sectores económicos.', 'Tomar conciencia do valor do diñeiro e dos seus usos responsables.'],
     11, 6, 3,
     [('PE', 80, [('CA2.1', MIN['CA2.1']), ('CA2.3', MIN['CA2.3'] + '.'), ('CA2.4', 'Propor solucións básicas para distintos problemas sociais.')]),
      ('TI', 20, [('CA1.1', MIN['CA1.1']), ('CA1.2', MIN['CA1.2']), ('CA1.3', MIN['CA1.3b']), ('CA1.4', MIN['CA1.4'])])],
     CONTIDOS_COMUNS + ['Economía verde. A influencia dos mercados (de bens, financeiro e laboral) na vida da cidadanía.']),
    (7, 'DESCUBRINDO A HISTORIA',
     ['Comprender e empregar de maneira elemental as técnicas e métodos de traballo do historiador.',
      'Coñecer os grandes períodos da Historia, os diferentes criterios para establecelos e os feitos máis significativos dentro dos mesmos.'],
     15, 20, 3,
     [('PE', 80, [('CA2.1', MIN['CA2.1']), ('CA2.2', MIN['CA2.2']), ('CA3.1', 'Coñecer as características básicas da sociedade na actualidade aceptando a diversidade cultural.'),
                  ('CA4.2', MIN['CA4.2']), ('CA4.3', MIN['CA4.3'])]),
      ('TI', 20, [('CA1.1', MIN['CA1.1']), ('CA1.2', MIN['CA1.2']), ('CA1.3', 'Utilizar algunha fonte de información nas súas investigacións.'), ('CA1.4', MIN['CA1.4'])]),
      ('Baleiro', 0, [('CA4.1', '')])],
     CONTIDOS_COMUNS + ['As fontes históricas: clasificación e utilización das distintas fontes (orais, escritas, patrimoniais). As pegadas da historia na contorna.',
                        'O papel da muller na historia e os principais movementos en defensa dos seus dereitos. Situación actual e retos de futuro na igualdade de xénero.']),
]

LENDA = 'Lenda: IA: Instrumento de Avaliación, %: Peso orientativo; PE: Proba escrita, TI: Táboa de indicadores'

# ── Documento ────────────────────────────────────────────────────────────

def pie(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.drawString(20 * mm, 12 * mm, '22/09/2026 20:22:24')
    canvas.drawRightString(190 * mm, 12 * mm, 'Páxina %d de 22' % doc.page)
    canvas.setFont('Helvetica-Bold', 9)
    canvas.setFillColor(colors.HexColor('#0066cc'))
    canvas.drawString(20 * mm, 282 * mm, 'XUNTA DE GALICIA | CONSELLERÍA DE EDUCACIÓN, CIENCIA, UNIVERSIDADES E FORMACIÓN PROFESIONAL')
    canvas.setFont('Helvetica', 40)
    canvas.setFillColor(colors.HexColor('#cccccc'))
    canvas.translate(70 * mm, 120 * mm)
    canvas.rotate(45)
    canvas.drawString(0, 0, 'Borrador')
    canvas.restoreState()

def main(salida):
    doc = SimpleDocTemplate(salida, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=28 * mm, bottomMargin=22 * mm)
    F = []
    F.append(par('PROGRAMACIÓN DIDÁCTICA LOMLOE', T))
    F.append(par('Centro educativo', H))
    F.append(tabla([[par('Código', PB), par('Centro', PB), par('Concello', PB), par('Ano académico', PB)],
                    [par('36006420'), par('CEP Campolongo'), par('Pontevedra'), par('2026/2027')]],
                   [30 * mm, 60 * mm, 45 * mm, 39 * mm]))
    F.append(par('Área/materia/ámbito', H))
    F.append(tabla([[par('Ensinanza', PB), par('Nome da área/materia/ámbito', PB), par('Curso', PB), par('Sesións semanais', PB), par('Sesións anuais', PB)],
                    [par('Educación primaria'), par('Ciencias Sociais'), par('6º Pri.'), par('2'), par('70')]],
                   [40 * mm, 70 * mm, 22 * mm, 21 * mm, 21 * mm]))
    F.append(par('Tipo de oferta', H))
    F.append(tabla([[par('Tipo de oferta', PB)], [par('Réxime xeral-ordinario')]], [110 * mm]))
    F.append(PageBreak())

    F.append(par('1. Introdución', H))
    F.append(par('Programación didáctica para a Área de Ciencias Sociais de Sexto de Primaria. Todo isto levarase a cabo nas 9 unidades didácticas, quedando tres unidades en cada trimestre.'))
    F.append(par('2. Obxectivos e súa contribución ao desenvolvemento das competencias', H))
    F.append(tabla([[par('Obxectivos', PB), par('CCL', PB), par('CP', PB), par('STEM', PB), par('CD', PB)],
                    [par('OBX1 - Utilizar dispositivos e recursos dixitais de forma segura, responsable e eficiente.'), par('3'), par('2'), par('4'), par('1-2-3-4-5')]],
                   [100 * mm, 18 * mm, 18 * mm, 18 * mm, 20 * mm]))

    # 3.1
    F.append(par('3.1. Relación de unidades didácticas', H))
    filas = [[par('UD', PB), par('Título', PB), par('Descrición', PB), par('% Peso materia', PB), par('Nº sesións', PB), par('1º trim.', PB), par('2º trim.', PB), par('3º trim.', PB)]]
    for n, tit, desc, peso, ses, trim, _, _ in UDS:
        x = ['', '', '']
        x[trim - 1] = 'X'
        filas.append([par(str(n)), par(tit), par('<br/>'.join(desc)), par(str(peso)), par(str(ses)), par(x[0]), par(x[1]), par(x[2])])
    F.append(tabla(filas, [9 * mm, 42 * mm, 74 * mm, 14 * mm, 14 * mm, 7 * mm, 7 * mm, 7 * mm]))

    # 3.2
    F.append(par('3.2. Distribución currículo nas unidades didácticas', H))
    for n, tit, desc, peso, ses, trim, grupos, contidos in UDS:
        F.append(tabla([[par('UD', PB), par('Título da UD', PB), par('Duración', PB)], [par(str(n)), par(tit), par(str(ses))]],
                       [14 * mm, 146 * mm, 14 * mm]))
        F.append(Spacer(0, 4 * mm))
        filas = [[par('Criterios de avaliación', PB), par('Mínimos de consecución', PB), par('IA', PB), par('%', PB)]]
        spans = []
        for ia, pct, crits in grupos:
            ini = len(filas)
            for ca, minimo in crits:
                filas.append([par(f'{ca} - {CRITERIOS[ca]}'), par(minimo), par(ia), par(str(pct))])
            fin = len(filas) - 1
            spans += [('SPAN', (2, ini), (2, fin)), ('SPAN', (3, ini), (3, fin)),
                      ('VALIGN', (2, ini), (3, fin), 'MIDDLE')]
        F.append(tabla(filas, [74 * mm, 62 * mm, 20 * mm, 18 * mm], spans))
        F.append(par(LENDA))
        F.append(Spacer(0, 3 * mm))
        F.append(tabla([[par('Contidos', PB)]] + [[par('- ' + c)] for c in contidos], [174 * mm]))
        F.append(Spacer(0, 6 * mm))

    # 4 y 5
    F.append(par('4.1. Concrecións metodolóxicas', H))
    F.append(par('A metodoloxía será activa, participativa e comunicativa.'))
    F.append(par('4.2. Materiais e recursos didácticos', H))
    F.append(tabla([[par('Denominación', PB)], [par('Libro de texto dixital (Netex)')], [par('Google Earth')]], [174 * mm]))
    F.append(par('5.1. Procedemento para a avaliación inicial', H))
    F.append(par('O proceso de avaliación inicial durará as dúas primeiras semanas lectivas do curso.'))
    F.append(par('5.2. Criterios de cualificación e recuperación', H))
    F.append(par('Pesos dos instrumentos de avaliación por UD:', PB))
    cab = [par('Unidade didáctica', PB)] + [par(f'UD {n}', PB) for n, *_ in UDS]
    f1 = [par('Peso UD/ Tipo Ins.', PB)] + [par(str(u[3])) for u in UDS]
    f2 = [par('Proba escrita', PB)] + [par('80') for _ in UDS]
    f3 = [par('Táboa de indicadores', PB)] + [par('20') for _ in UDS]
    F.append(tabla([cab, f1, f2, f3], [30 * mm] + [20 * mm] * 7))
    F.append(Spacer(0, 3 * mm))
    F.append(tabla([[par('Unidade didáctica', PB), par('Total', PB)], [par('Peso UD/ Tipo Ins.', PB), par('100')],
                    [par('Proba escrita', PB), par('80')], [par('Táboa de indicadores', PB), par('20')]], [30 * mm, 20 * mm]))
    F.append(par('Criterios de cualificación:', PB))
    F.append(par('PRIMEIRA PARTE: PROBAS ESCRITAS - PESO 80%. SEGUNDA PARTE: INDICADORES DE LOGRO - PESO 20%.'))
    F.append(par('6. Medidas de atención á diversidade', H))
    F.append(par('Na etapa da educación primaria poñerase especial énfase na atención á diversidade do alumnado.'))
    doc.build(F, onFirstPage=pie, onLaterPages=pie)

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'proens_gemelo.pdf')
