import json, re, sys
from datetime import date
import requests
from bs4 import BeautifulSoup

TODAY = date.today().isoformat()

KEYWORDS = [
    "professor", "docente", "magistério", "magisterio",
    "ebtt", "instituto federal",
    "biologia", "ciências biológicas", "ciencias biologicas",
    "ecologia", "conservação", "conservacao", "biodiversidade",
    "ambiental", "ciências ambientais", "ciencias ambientais"
]

SOURCES = [
    # UFMT: página do sistema de concursos (pode exigir interação, mas dá pra achar edital e links úteis)
    {"name":"UFMT concursos", "url":"https://www.concursos.ufmt.br/AreaRestrita/Inscricao/Concursos.aspx", "inst":"UFMT", "uf":"MT", "tipo":"magisterio_superior", "tipo_label":"Magistério Superior (UF)"},
    # UNEMAT: portal de editais (é amplo, mas filtramos por palavras-chave)
    {"name":"UNEMAT editais", "url":"https://unemat.br/editais", "inst":"UNEMAT", "uf":"MT", "tipo":"magisterio_superior", "tipo_label":"Magistério Superior (Univ. Estadual)"},
    # UNEMAT: recrutamento de professores (muitas vezes é seletivo; você pode manter por “radar”, mas marcar depois)
    {"name":"UNEMAT recrutamento", "url":"https://unemat.br/site/recrutamento/professores-modalidades-presenciais", "inst":"UNEMAT", "uf":"MT", "tipo":"magisterio_superior", "tipo_label":"Docência UNEMAT (recrutamento)"},
    # IFMT: blog com editais (EBTT)
    {"name":"IFMT concursos", "url":"https://ifmt.edu.br/blog/ifmt-abre-concurso-publico-com-20-vagas-para-professores-em-diversas-areas/", "inst":"IFMT", "uf":"MT", "tipo":"ebtt", "tipo_label":"EBTT (IF)"}
]

def norm(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"\s+", " ", s)
    return s

def looks_relevant(text: str) -> bool:
    t = norm(text)
    hits = sum(1 for k in KEYWORDS if norm(k) in t)
    return hits >= 2

def fetch(url: str) -> str:
    headers = {"User-Agent":"Mozilla/5.0 (RadarConcursos/1.0)"}
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    return r.text

def scrape_links(html: str, base_url: str):
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for a in soup.select("a[href]"):
        href = a.get("href","").strip()
        txt = (a.get_text(" ", strip=True) or "").strip()
        if not href:
            continue
        # resolve relative
        if href.startswith("//"):
            href = "https:" + href
        elif href.startswith("/"):
            # build absolute
            from urllib.parse import urljoin
            href = urljoin(base_url, href)
        elif href.startswith("#"):
            continue

        blob = f"{txt} {href}"
        if looks_relevant(blob):
            out.append((txt[:140], href))
    # dedup
    seen=set()
    uniq=[]
    for t,u in out:
        key=(t,u)
        if key in seen: continue
        seen.add(key)
        uniq.append((t,u))
    return uniq[:50]

def load_db(path="data/concursos.json"):
    with open(path,"r",encoding="utf-8") as f:
        return json.load(f)

def save_db(db, path="data/concursos.json"):
    db["last_update"] = TODAY
    with open(path,"w",encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

def upsert_item(db, item):
    items = db.get("items", [])
    idx = next((i for i,x in enumerate(items) if x.get("id")==item.get("id")), None)
    if idx is None:
        items.append(item)
    else:
        items[idx] = {**items[idx], **item}
    db["items"] = items

def make_generic_item(src, title, url):
    base_id = re.sub(r"[^a-z0-9]+","-", norm(src["inst"] + "-" + title))[:80].strip("-")
    return {
        "id": base_id,
        "instituicao": src["inst"],
        "uf": src["uf"],
        "tipo": src["tipo"],
        "tipo_label": src["tipo_label"],
        "cargo": "Professor (ver edital/link)",
        "regime": "—",
        "vagas": None,
        "area_macro": "amb",
        "area_texto": title,
        "inscricao_inicio": None,
        "inscricao_fim": None,
        "prova_prevista": None,
        "url_inscricao": url,
        "url_edital": url,
        "url_cronograma": url,
        "url_barema": url,
        "tags": [src["inst"], "docente", "professor", "ambiental", "biologia", "ecologia"]
    }

def main():
    db = load_db()
    added = 0
    for src in SOURCES:
        try:
            html = fetch(src["url"])
            links = scrape_links(html, src["url"])
            for title, url in links:
                item = make_generic_item(src, title, url)
                # não duplica demais: se já existe id, não conta como novo
                before = len(db.get("items",[]))
                upsert_item(db, item)
                after = len(db.get("items",[]))
                if after > before:
                    added += 1
        except Exception as e:
            print(f"[WARN] Falhou {src['name']}: {e}", file=sys.stderr)

    save_db(db)
    print(f"OK. Atualizado em {TODAY}. Novos itens: {added}")

if __name__ == "__main__":
    main()
