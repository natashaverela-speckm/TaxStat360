#!/usr/bin/env python3
"""Regenerate synthetic TaxStat360 text-PDF gate fixtures.

INTERNAL / test-only. Never use real tax returns or real SSNs.
Requires: reportlab, Pillow, pypdf

  python3 generate_fixtures.py
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parent

# Synthetic identifiers for fixtures only — not real people / entities.
FAKE_SSN_DASHED = "219-09-9999"
FAKE_SSN_UNDASHED = "219099999"
FAKE_EIN = "12-3456789"

CLEAN_BODY = f"""SYNTHETIC FIXTURE — NOT A REAL TAX RETURN
Form 1040 U.S. Individual Income Tax Return (test)
Name: Test Taxpayer
EIN for Schedule C example: {FAKE_EIN}
Prior-year AGI (line 11): 142000
Prior-year federal tax (line 24): 18750
Form 8582 unallowed loss: 12500
Schedule D short-term capital loss carryover: 1500
Schedule D long-term capital loss carryover: 8000
Form 8995 QBI loss carryforward: 4500
NOL carryforward: none
"""

SSN_BODY = f"""SYNTHETIC FIXTURE — NOT A REAL TAX RETURN
Form 1040 U.S. Individual Income Tax Return (test)
Name: Test Taxpayer
Social security number: {FAKE_SSN_DASHED}
SSN (no dashes): {FAKE_SSN_UNDASHED}
EIN for Schedule C example: {FAKE_EIN}
Prior-year AGI (line 11): 142000
Prior-year federal tax (line 24): 18750
Form 8582 unallowed loss: 12500
"""

MIXED_TEXT = """SYNTHETIC FIXTURE — NOT A REAL TAX RETURN
Form 1040 header text only (short page).
Prior-year AGI: 99000
"""


def write_text_pdf(path: Path, text: str, title: str) -> None:
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle(title)
    c.setAuthor("TaxStat360 synthetic fixture")
    _width, height = letter
    y = height - 72
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, y, title)
    y -= 24
    c.setFont("Helvetica", 10)
    for line in text.splitlines():
        if y < 72:
            c.showPage()
            c.setFont("Helvetica", 10)
            y = height - 72
        c.drawString(72, y, line[:95])
        y -= 14
    c.save()


def write_image_only_pdf(path: Path) -> None:
    """Scanned-style page: pixels may show digits, but PDF text layer is empty."""
    img = Image.new("RGB", (612, 792), color=(245, 245, 245))
    draw = ImageDraw.Draw(img)
    draw.rectangle([40, 40, 572, 120], outline=(80, 80, 80), width=2)
    draw.text((60, 60), "SCANNED PAGE — IMAGE ONLY FIXTURE", fill=(20, 20, 20))
    draw.text((60, 90), f"SSN {FAKE_SSN_DASHED} (pixels only, not text layer)", fill=(20, 20, 20))
    draw.rectangle([40, 160, 572, 700], fill=(230, 230, 230))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)

    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle("fixture-tax-1040-image-only")
    c.setAuthor("TaxStat360 synthetic fixture")
    c.drawImage(
        ImageReader(buf),
        0,
        0,
        width=letter[0],
        height=letter[1],
        preserveAspectRatio=False,
        anchor="c",
    )
    c.save()


def write_mixed_pdf(path: Path) -> None:
    """Page 1 text layer + page 2 image-only. Gate uses text layer only (no OCR)."""
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle("fixture-tax-1040-mixed")
    c.setAuthor("TaxStat360 synthetic fixture")
    y = letter[1] - 72
    c.setFont("Helvetica", 10)
    for line in MIXED_TEXT.splitlines():
        c.drawString(72, y, line)
        y -= 14
    c.showPage()

    img = Image.new("RGB", (612, 792), color=(220, 220, 220))
    draw = ImageDraw.Draw(img)
    draw.text((60, 60), "Page 2 scanned attachment (no text layer)", fill=(0, 0, 0))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=80)
    buf.seek(0)
    c.drawImage(ImageReader(buf), 0, 0, width=letter[0], height=letter[1])
    c.save()


def summarize(path: Path) -> str:
    reader = PdfReader(str(path))
    joined = "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    alnum = sum(ch.isalnum() for ch in joined)
    ssn = FAKE_SSN_DASHED in joined or FAKE_SSN_UNDASHED in joined
    return f"{path.name}: pages={len(reader.pages)} alnum={alnum} ssn_in_text={ssn}"


def main() -> None:
    write_text_pdf(OUT / "fixture-tax-1040-text-clean.pdf", CLEAN_BODY, "fixture-tax-1040-text-clean")
    write_text_pdf(
        OUT / "fixture-tax-1040-text-with-ssn.pdf", SSN_BODY, "fixture-tax-1040-text-with-ssn"
    )
    write_image_only_pdf(OUT / "fixture-tax-1040-image-only.pdf")
    write_mixed_pdf(OUT / "fixture-tax-1040-mixed.pdf")
    # Local API stub token filename (clean text, no SSN).
    write_text_pdf(OUT / "fixture-tax-1040-smoke.pdf", CLEAN_BODY, "fixture-tax-1040-smoke")

    print("Wrote fixtures to", OUT)
    for p in sorted(OUT.glob("*.pdf")):
        print(" ", summarize(p))


if __name__ == "__main__":
    main()
