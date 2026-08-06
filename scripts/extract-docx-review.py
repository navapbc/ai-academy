"""Extract Sarah's comments + tracked changes from the docx, with heading context."""
import json
import re
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
BASE = "/private/tmp/claude-502/-Users-btabaska-GitHub-local-first-ai-academy/8f52b4f9-f1ee-47e4-983d-bc9b841a138d/scratchpad/docx"


def tag(e):
    return e.tag.replace(W, "")


# ---------- comment bodies ----------
ctree = ET.parse(f"{BASE}/word/comments.xml")
comments = {}
for c in ctree.getroot().iter(f"{W}comment"):
    cid = c.get(f"{W}id")
    text = "".join(t.text or "" for t in c.iter(f"{W}t"))
    comments[cid] = {
        "id": cid,
        "author": c.get(f"{W}author"),
        "date": c.get(f"{W}date"),
        "text": re.sub(r"[ \t]+", " ", text).strip(),
    }

# ---------- walk document in order ----------
dtree = ET.parse(f"{BASE}/word/document.xml")
body = dtree.getroot().find(f"{W}body")

paras = []          # {style, text, open_comments, anchors:{cid:text}, ins:[], dels:[]}
open_comments = set()
anchor_buf = {}     # cid -> accumulated text while open


def walk(node, para, in_ins, in_del):
    global open_comments
    for ch in node:
        t = tag(ch)
        if t == "commentRangeStart":
            cid = ch.get(f"{W}id")
            open_comments.add(cid)
            anchor_buf.setdefault(cid, "")
            para["opens"].append(cid)
        elif t == "commentRangeEnd":
            cid = ch.get(f"{W}id")
            open_comments.discard(cid)
            para["closes"].append(cid)
        elif t == "commentReference":
            pass
        elif t == "t":
            txt = ch.text or ""
            para["text"] += txt
            for cid in open_comments:
                anchor_buf[cid] += txt
            if in_ins:
                para["ins"][-1] += txt
        elif t == "delText":
            txt = ch.text or ""
            for cid in open_comments:
                anchor_buf[cid] += txt
            if in_del:
                para["dels"][-1] += txt
        elif t == "ins":
            para["ins"].append("")
            walk(ch, para, True, in_del)
        elif t == "del":
            para["dels"].append("")
            walk(ch, para, in_ins, True)
        elif t == "tab":
            para["text"] += " "
            if in_ins:
                para["ins"][-1] += " "
        else:
            walk(ch, para, in_ins, in_del)


def walk_block(node):
    for ch in node:
        t = tag(ch)
        if t == "p":
            style_el = ch.find(f"{W}pPr/{W}pStyle")
            style = style_el.get(f"{W}val") if style_el is not None else "Normal"
            para = {"style": style, "text": "", "ins": [], "dels": [],
                    "opens": [], "closes": []}
            walk(ch, para, False, False)
            para["text"] = re.sub(r"[ \t]+", " ", para["text"]).strip()
            para["ins"] = [i for i in (re.sub(r"[ \t]+", " ", x) for x in para["ins"]) if i.strip()]
            para["dels"] = [d for d in (re.sub(r"[ \t]+", " ", x) for x in para["dels"]) if d.strip()]
            paras.append(para)
        elif t in ("tbl", "tr", "tc", "sdt", "sdtContent"):
            walk_block(ch)


walk_block(body)

# ---------- heading context per paragraph ----------
HEAD = {"Heading1": 1, "Heading2": 2, "Heading3": 3, "Heading4": 4,
        "Title": 1, "Subtitle": 2}
ctx = []
stack = {}
for i, p in enumerate(paras):
    lvl = HEAD.get(p["style"])
    if lvl and p["text"]:
        stack = {k: v for k, v in stack.items() if k < lvl}
        stack[lvl] = p["text"]
    ctx.append(dict(stack))

# ---------- assemble comment records ----------
out = []
for i, p in enumerate(paras):
    for cid in p["opens"]:
        c = comments.get(cid, {})
        before = " ".join(x["text"] for x in paras[max(0, i - 2):i] if x["text"])[-300:]
        after = " ".join(x["text"] for x in paras[i + 1:i + 3] if x["text"])[:300]
        out.append({
            **c,
            "para_index": i,
            "headings": ctx[i],
            "anchor_text": re.sub(r"\s+", " ", anchor_buf.get(cid, "")).strip(),
            "para_text": p["text"],
            "context_before": before,
            "context_after": after,
        })

out.sort(key=lambda r: r["para_index"])

# ---------- tracked changes grouped by heading ----------
changes = []
for i, p in enumerate(paras):
    if p["ins"] or p["dels"]:
        changes.append({
            "para_index": i,
            "headings": ctx[i],
            "final_text": p["text"],
            "inserted": p["ins"],
            "deleted": p["dels"],
        })

with open(f"{BASE}/../review.json", "w", encoding="utf-8") as f:
    json.dump({"comments": out, "tracked_changes": changes}, f, indent=2, ensure_ascii=False)

print(f"comments: {len(out)}  paragraphs: {len(paras)}  changed paragraphs: {len(changes)}")
missing = [c["id"] for c in out if not c["anchor_text"]]
print("comments with empty anchor:", missing)
