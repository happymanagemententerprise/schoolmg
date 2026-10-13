import sys

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

NAVY     = RGBColor(0x25, 0x2b, 0x38)
NAVY2    = RGBColor(0x1c, 0x21, 0x2b)
CORAL    = RGBColor(0xee, 0x71, 0x5e)
BLUE     = RGBColor(0x52, 0x6e, 0xdb)
GREEN    = RGBColor(0x48, 0xa8, 0x79)
YELLOW   = RGBColor(0xf4, 0xc8, 0x4e)
WHITE    = RGBColor(0xff, 0xff, 0xff)
BODY     = RGBColor(0xc9, 0xce, 0xd7)
MUTED    = RGBColor(0x8a, 0x91, 0x9c)
CARD_BG  = RGBColor(0x2b, 0x32, 0x42)
CARD_LN  = RGBColor(0x4a, 0x52, 0x66)

FONT = "Segoe UI"

W, H = 13.333, 7.5
ML, MR = 0.7, 0.7
CW = W - ML - MR
GAP2 = 0.4
GAP3 = 0.35

prs = Presentation()
prs.slide_width = Inches(W)
prs.slide_height = Inches(H)
BLANK = prs.slide_layouts[6]


def bg(slide, color=NAVY):
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = color


def textbox(slide, x, y, w, h, anchor=MSO_ANCHOR.TOP):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Emu(0)
    tf.margin_top = tf.margin_bottom = Emu(0)
    return tf


def para(tf, runs, size=15, color=BODY, bold=False, first=False, space_before=0, space_after=0, align=PP_ALIGN.LEFT, line=1.15):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.alignment = align
    p.line_spacing = line
    if space_before:
        p.space_before = Pt(space_before)
    if space_after:
        p.space_after = Pt(space_after)
    if isinstance(runs, str):
        runs = [(runs, color, bold)]
    for text, c, b in runs:
        r = p.add_run()
        r.text = text
        r.font.size = Pt(size)
        r.font.bold = b
        r.font.color.rgb = c
        r.font.name = FONT
    return p


def eyebrow(slide, text, y=0.55):
    tf = textbox(slide, ML, y, CW, 0.4)
    para(tf, text, size=13, color=CORAL, bold=True, first=True)
    return tf


def heading(slide, lines, y=1.15, size=33):
    tf = textbox(slide, ML, y, CW, 1.25)
    for i, line in enumerate(lines):
        para(tf, line, size=size, color=WHITE, bold=True, first=(i == 0), line=1.02)
    return tf


def rule(slide, x, y, w=1.6, h=0.045):
    shp = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shp.fill.solid()
    shp.fill.fore_color.rgb = CORAL
    shp.line.fill.background()
    shp.shadow.inherit = False
    return shp


def _shape(slide, shape, x, y, w, h, fill=None, line=None, line_w=1.0):
    shp = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(line_w)
    shp.shadow.inherit = False
    return shp


def footer(slide, text="HMA School Management System — Pitch Deck", y=6.95):
    tf = textbox(slide, ML, y, CW - 2, 0.3)
    para(tf, text, size=9, color=MUTED, first=True)


def new_slide():
    s = prs.slides.add_slide(BLANK)
    bg(s)
    return s


def card(slide, x, y, w, h, title, text, accent=CORAL, title_size=14, body_size=12, pad=0.22):
    shp = _shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h,
                 fill=CARD_BG, line=CARD_LN, line_w=1.2)
    try:
        shp.adjustments[0] = 0.055
    except Exception:
        pass
    tf = shp.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.TOP
    tf.margin_left = tf.margin_right = Inches(pad)
    tf.margin_top = Inches(pad)
    tf.margin_bottom = Inches(pad)
    para(tf, title, size=title_size, color=accent, bold=True, first=True, space_after=4)
    for i, line in enumerate(text.split("\n")):
        para(tf, line, size=body_size, color=BODY, space_after=2, line=1.15)
    return shp


def points(slide, items, y=2.65, title_size=16, small_size=11.5, max_rows=5):
    row_h = 0.72
    start_y = y
    for idx, (title, small) in enumerate(items[:max_rows]):
        cy = start_y + idx * row_h
        n = _shape(slide, MSO_SHAPE.OVAL, ML + 0.02, cy + 0.12, 0.46, 0.46,
                   fill=CORAL, line=None)
        ntf = n.text_frame
        ntf.word_wrap = False
        ntf.vertical_anchor = MSO_ANCHOR.MIDDLE
        para(ntf, str(idx + 1), size=15, color=WHITE, bold=True,
             first=True, align=PP_ALIGN.CENTER)
        ttf = textbox(slide, ML + 0.68, cy, CW - 0.7, row_h)
        para(ttf, title, size=title_size, color=WHITE, bold=True, first=True)
        if small:
            para(ttf, small, size=small_size, color=MUTED, space_after=0)
    return start_y + len(items) * row_h


def card_grid(slide, cards, cols=3, y=2.7, title_size=15, body_size=12.5, h=1.5):
    gap = GAP3 if cols == 3 else GAP2
    cw = (CW - (cols - 1) * gap) / cols
    n = len(cards)
    rows = (n + cols - 1) // cols
    for i, (title, text, accent) in enumerate(cards):
        r, c = divmod(i, cols)
        x = ML + c * (cw + gap)
        yy = y + r * (h + 0.25)
        card(slide, x, yy, cw, h, title, text, accent=accent,
             title_size=title_size, body_size=body_size)


def pills(slide, items, y, x=ML, w=11.0, h=0.5, gap=0.25):
    cx = x
    for label in items:
        tw = 0.16 * len(label) + 0.55
        shp = _shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, cx, y, tw, h,
                     fill=None, line=CARD_LN, line_w=1.2)
        try:
            shp.adjustments[0] = 0.5
        except Exception:
            pass
        tf = shp.text_frame
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf.margin_left = tf.margin_right = Inches(0.1)
        tf.margin_top = tf.margin_bottom = Emu(0)
        para(tf, label, size=12, color=BODY, first=True, align=PP_ALIGN.CENTER)
        cx += tw + gap


def stats(slide, items, y=3.0):
    n = len(items)
    gap = 0.25
    sw = (CW - (n - 1) * gap) / n
    for i, (num, label) in enumerate(items):
        x = ML + i * (sw + gap)
        shp = _shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, sw, 1.7,
                     fill=CARD_BG, line=CARD_LN, line_w=1.2)
        try:
            shp.adjustments[0] = 0.07
        except Exception:
            pass
        tf = shp.text_frame
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        para(tf, num, size=32, color=WHITE, bold=True, first=True, align=PP_ALIGN.CENTER)
        para(tf, label, size=12, color=BODY, align=PP_ALIGN.CENTER)


# --------------------------------------------------------------------------
# Slide 1 · Title
s = new_slide()
eyebrow(s, "School Management Platform", y=2.0)
tf = textbox(s, ML, 2.55, CW, 1.9, anchor=MSO_ANCHOR.TOP)
para(tf, "HMA School", size=54, color=WHITE, bold=True, first=True, line=1.0)
para(tf, "Management System", size=54, color=WHITE, bold=True, line=1.0)
rule(s, ML, 4.85, 1.6)
tf = textbox(s, ML, 5.05, CW, 0.5)
para(tf, "Run your whole school from one screen.", size=19, color=BODY, first=True)
pills(s, ["Admissions \u2192 Reports", "Six connected portals", "Works online & offline", "Cloud-secured"], y=5.85)
footer(s)

# --------------------------------------------------------------------------
# Slide 2 · Problem
s = new_slide()
eyebrow(s, "The problem")
heading(s, ["Running a school shouldn't", "run you ragged."], size=36)
card_grid(s, [
    ("Fragmented records", "Registers, spreadsheets and WhatsApp groups that never match.", CORAL),
    ("Slow report cards", "Compiled by hand \u2014 error-prone and always late.", CORAL),
    ("Guesswork promotions", "Decisions made on gut feel, not your own stated rule.", CORAL),
    ("Parents in the dark", "Endless phone calls and eroding trust.", CORAL),
], cols=2, y=2.75, h=2.1, title_size=16, body_size=14)
footer(s)

# --------------------------------------------------------------------------
# Slide 3 · Solution
s = new_slide()
eyebrow(s, "The solution")
heading(s, ["One connected platform.", "Six roles. Zero double-entry."], size=36)
points(s, [
    ("Enter a mark once", "It flows to reports, rankings and parent view."),
    ("Every role gets a dashboard", "Built for their job \u2014 admin to parent."),
    ("Works online, keeps working offline", "Graceful if the database is unreachable."),
    ("Cloud-secured, leadership in control", "Approvals, publishing and audit."),
], y=3.0)
footer(s)

# --------------------------------------------------------------------------
# Slide 4 · Headline features
s = new_slide()
eyebrow(s, "Why it wins")
heading(s, ["Headline features"], size=36)
points(s, [
    ("Every role, one system", "Admin, teachers, HOD, students and parents."),
    ("Report cards that write themselves", "CA + exams \u2192 averages, grades, positions."),
    ("A real promotion engine", "Your exact rule, applied automatically."),
    ("Parents in the loop", "Results, attendance, timetable and mentor contact."),
    ("Secure and reliable", "Cloud-hosted, row-level security, offline-ready."),
], y=2.75)
footer(s)

# --------------------------------------------------------------------------
# Slide 5 · Administrative & Financial Control
s = new_slide()
eyebrow(s, "Administrative & Financial Control")
heading(s, ["Save staff hours. Protect your records."], size=33)
card_grid(s, [
    ("Session & term control", "Open, close, reopen; archived safely.", BLUE),
    ("Results release gate", "Nothing publishes until every score is in.", BLUE),
    ("Approval workflow", "Sensitive actions need admin sign-off + password.", BLUE),
    ("Account control", "Admissions, transfers, repeats; archived accounts blocked.", GREEN),
    ("Attendance oversight", "Daily registers + monthly analytics.", GREEN),
    ("Leadership visibility", "Coverage tracking, analytics, leaderboard.", GREEN),
], cols=3, y=2.75, title_size=15, body_size=12.5, h=1.8)
footer(s)

# --------------------------------------------------------------------------
# Slide 6 · Academic & Report Generation
s = new_slide()
eyebrow(s, "Academic & Report Generation")
heading(s, ["From first CA entry to end-of-session promotion."], size=33)
points(s, [
    ("Continuous Assessment (40) + Exams (60) \u2192 instant totals", ""),
    ("Class register, class reports, mid-term reports with Excel export", ""),
    ("Automatic class and year positions + schoolwide leaderboard", ""),
    ("Term remarks with approval \u2014 only approved remarks reach the report card", ""),
    ("Printable report cards and Student Achievement Passports", ""),
], y=2.8, title_size=16.5)
footer(s)

# --------------------------------------------------------------------------
# Slide 7 · Staff portals
s = new_slide()
eyebrow(s, "User Portals \u00b7 Staff")
heading(s, ["Tools that match the job."], size=36)
card_grid(s, [
    ("Administrator", "People, classes, subjects, timetable, analytics, progression & setup.", CORAL),
    ("Teachers", "Score entry, registers, attendance, feedback, lessons, auto-graded quizzes, discussions, mentees.", BLUE),
    ("HOD", "Department dashboard, reports and teacher-subject assignment.", GREEN),
], cols=3, y=2.9, h=2.2, title_size=16, body_size=13)
tf = textbox(s, ML, 5.4, CW, 0.4)
para(tf, "Less admin for teachers means more teaching.", size=13, color=MUTED, first=True)
footer(s)

# --------------------------------------------------------------------------
# Slide 8 · Student & Parent portals
s = new_slide()
eyebrow(s, "User Portals \u00b7 Families")
heading(s, ["Engagement that builds trust."], size=36)
card_grid(s, [
    ("Students", "Results, pathway choices, lessons, quizzes, discussions, attendance, assignments, timetable and progress badges.", CORAL),
    ("Parents", "Each child's published results, attendance (weekly & monthly), assignments, timetable and mentor contact.", YELLOW),
], cols=2, y=2.9, h=2.0, title_size=16, body_size=13.5)
tf = textbox(s, ML, 5.2, CW, 0.4)
para(tf, [("Controlled by design \u2014 families only ever see ", MUTED, False),
          ("published", WHITE, True),
          (" results.", MUTED, False)], size=13, first=True)
footer(s)

# --------------------------------------------------------------------------
# Slide 9 · Technical strengths
s = new_slide()
eyebrow(s, "Technical Strengths")
heading(s, ["Modern, secure, easy to run."], size=36)
card_grid(s, [
    ("Works offline", "Bundled demo school and local mirror; degrades gracefully.", CORAL),
    ("Enterprise-grade security", "Supabase Auth + Row-Level Security; no password hashes in the browser.", BLUE),
    ("Ease of use", "One-click role logins, responsive, role-tailored navigation.", GREEN),
    ("Fast, maintainable stack", "Vite + React + Supabase (PostgreSQL); print-friendly.", YELLOW),
], cols=2, y=2.9, h=1.55, title_size=16, body_size=13)
tf = textbox(s, ML, 5.55, CW, 0.4)
para(tf, "Server-side verification for every sensitive action.", size=13, color=MUTED, first=True)
footer(s)

# --------------------------------------------------------------------------
# Slide 10 · By the numbers
s = new_slide()
eyebrow(s, "By the numbers")
heading(s, ["A complete, working system \u2014 not a mock-up."], size=33)
stats(s, [
    ("6", "user roles"),
    ("54+", "purpose-built screens"),
    ("3", "automated reports"),
    ("1", "promotion rule engine"),
    ("0", "double-entry"),
], y=3.1)
tf = textbox(s, ML, 5.2, CW, 0.4)
para(tf, "Enter once, use everywhere.", size=13, color=MUTED, first=True)
footer(s)

# --------------------------------------------------------------------------
# Slide 11 · Outcome
s = new_slide()
eyebrow(s, "The outcome")
heading(s, ["What your school gains."], size=36)
points(s, [
    ("Time back", "Hours saved every term on reports and admin."),
    ("Accuracy", "One source of truth \u2014 no mismatched records."),
    ("Control", "Approve, publish and close with confidence."),
    ("Trust", "Parents engaged and informed."),
    ("Insight", "Spot gaps early; celebrate wins with rankings and recognition."),
], y=2.75)
footer(s)

# --------------------------------------------------------------------------
# Slide 12 · Call to action
s = new_slide()
eyebrow(s, "Next step", y=2.0)
tf = textbox(s, ML, 2.55, CW, 1.7, anchor=MSO_ANCHOR.TOP)
para(tf, "See it live with", size=48, color=WHITE, bold=True, first=True, line=1.0)
para(tf, "your own school data.", size=48, color=WHITE, bold=True, line=1.0)
pills(s, ["Book a walkthrough", "Pilot one class for a term", "Full rollout with training"], y=5.85)
footer(s)

out = "HMA_Pitch_Deck.pptx"
prs.core_properties.title = "HMA School Management System"
prs.core_properties.author = "HMA"
prs.save(out)
print("Saved", out, "with", len(prs.slides.__iter__.__self__._sldIdLst), "slides")