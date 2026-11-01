import sys
from docx import Document

path = "/home/z/my-project/upload/SunPower Solar Installation Management System Product & Engineering Spec v1.1.docx"
doc = Document(path)

out = []
for i, p in enumerate(doc.paragraphs):
    t = p.text.strip()
    if t:
        out.append(f"[P{i}] {t}")
for ti, table in enumerate(doc.tables):
    out.append(f"=== TABLE {ti} ===")
    for ri, row in enumerate(table.rows):
        cells = [c.text.strip().replace("\n", " / ") for c in row.cells]
        out.append(f"[T{ti}R{ri}] " + " | ".join(cells))

with open("/tmp/spec.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print(f"wrote {len(out)} lines")
