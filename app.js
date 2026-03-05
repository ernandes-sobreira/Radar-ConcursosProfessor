async function loadData() {
  const res = await fetch('./data/concursos.json', { cache: "no-store" });
  if (!res.ok) throw new Error('Não consegui carregar data/concursos.json');
  return await res.json();
}

function norm(s){ return (s||"").toString().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,""); }

function daysFromToday(dateStr){
  if(!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date();
  t.setHours(0,0,0,0);
  const diff = (d - t) / (1000*60*60*24);
  return Math.round(diff);
}

function statusTag(item){
  // aberto se hoje entre inicio e fim
  const now = new Date(); now.setHours(0,0,0,0);
  const ini = item.inscricao_inicio ? new Date(item.inscricao_inicio+"T00:00:00") : null;
  const fim = item.inscricao_fim ? new Date(item.inscricao_fim+"T00:00:00") : null;

  if(ini && fim && now >= ini && now <= fim){
    const left = daysFromToday(item.inscricao_fim);
    return {cls:"hot", text:`INSCRIÇÕES ABERTAS (${left}d)`};
  }
  if(ini && now < ini){
    const left = daysFromToday(item.inscricao_inicio);
    return {cls:"soon", text:`ABRE EM ${left}d`};
  }
  if(fim && now > fim){
    return {cls:"late", text:`INSCRIÇÕES ENCERRADAS`};
  }
  return {cls:"tag", text:`STATUS INDEFINIDO`};
}

function matchesProfile(item){
  // filtro “ambiental para você”: usa tags e área macro
  const tags = (item.tags||[]).map(norm);
  const a = norm(item.area_macro||"");
  const okArea = ["bio","eco","amb"].includes(item.area_macro) || tags.some(t=>["biologia","ecologia","conservacao","ambiental","biodiversidade","ciencias ambientais","limnologia"].some(k=>t.includes(k)));
  const okTipo = ["magisterio_superior","ebtt","fund_med"].includes(item.tipo);
  return okArea && okTipo;
}

function renderKPIs(items){
  const total = items.length;
  const abertos = items.filter(i => statusTag(i).cls==="hot").length;
  const ufmt = items.filter(i => i.instituicao==="UFMT").length;
  const unemat = items.filter(i => i.instituicao==="UNEMAT").length;
  const el = document.getElementById("kpis");
  el.innerHTML = `
    <div class="box">Itens no radar: <b>${total}</b></div>
    <div class="box">Inscrições abertas: <b>${abertos}</b></div>
    <div class="box">UFMT: <b>${ufmt}</b></div>
    <div class="box">UNEMAT: <b>${unemat}</b></div>
  `;
}

function card(item){
  const tag = statusTag(item);
  const prova = item.prova_prevista || "—";
  const insc = (item.inscricao_inicio && item.inscricao_fim) ? `${item.inscricao_inicio.split("-").reverse().join("/") } → ${item.inscricao_fim.split("-").reverse().join("/")}` : "—";
  const uf = item.uf || "—";
  const vaga = item.vagas ? `${item.vagas} vaga(s)` : "—";
  const area = item.area_texto || "—";

  const links = [];
  if(item.url_edital) links.push(`<a class="btn" target="_blank" rel="noreferrer" href="${item.url_edital}">📄 Edital</a>`);
  if(item.url_inscricao) links.push(`<a class="btn" target="_blank" rel="noreferrer" href="${item.url_inscricao}">📝 Inscrição</a>`);
  if(item.url_barema) links.push(`<a class="btn" target="_blank" rel="noreferrer" href="${item.url_barema}">🏅 Barema</a>`);
  if(item.url_cronograma) links.push(`<a class="btn" target="_blank" rel="noreferrer" href="${item.url_cronograma}">🗓️ Cronograma</a>`);

  const prio = (item.instituicao==="UFMT" || item.instituicao==="UNEMAT") ? " • PRIORIDADE" : "";
  return `
  <div class="card">
    <div class="top">
      <div>
        <div class="title">${item.instituicao} — ${item.cargo}${prio}</div>
        <div class="small">${item.tipo_label} • ${uf}</div>
      </div>
      <div class="tag ${tag.cls}">${tag.text}</div>
    </div>
    <div class="meta">
      <div>Área: <b>${area}</b></div>
      <div>Vagas: <b>${vaga}</b> • Regime: <b>${item.regime||"—"}</b></div>
      <div>Inscrições: <b>${insc}</b></div>
      <div>Prova provável/prevista: <b>${prova}</b></div>
    </div>
    <div class="links">${links.join("")}</div>
  </div>`;
}

function applyFilters(all){
  const q = norm(document.getElementById("q").value.trim());
  const inst = document.getElementById("inst").value.trim();
  const tipo = document.getElementById("tipo").value.trim();
  const area = document.getElementById("area").value.trim();
  const uf = norm(document.getElementById("uf").value.trim());
  const aberto = document.getElementById("aberto").value.trim();

  let items = all.filter(matchesProfile);

  if(inst) items = items.filter(i => i.instituicao === inst);
  if(tipo) items = items.filter(i => i.tipo === tipo);
  if(area) items = items.filter(i => i.area_macro === area);
  if(uf) items = items.filter(i => norm(i.uf||"").includes(uf));

  if(aberto==="sim"){
    items = items.filter(i => statusTag(i).cls==="hot");
  }

  if(q){
    items = items.filter(i => {
      const hay = norm([
        i.instituicao, i.cargo, i.area_texto, i.uf, i.tipo_label,
        ...(i.tags||[])
      ].join(" | "));
      return hay.includes(q);
    });
  }

  // ordena: UFMT/UNEMAT primeiro, depois inscrições abertas, depois data de fim
  items.sort((a,b)=>{
    const pa = (a.instituicao==="UFMT"||a.instituicao==="UNEMAT") ? 0 : 1;
    const pb = (b.instituicao==="UFMT"||b.instituicao==="UNEMAT") ? 0 : 1;
    if(pa!==pb) return pa-pb;
    const sa = statusTag(a).cls==="hot" ? 0 : 1;
    const sb = statusTag(b).cls==="hot" ? 0 : 1;
    if(sa!==sb) return sa-sb;
    const fa = a.inscricao_fim || "9999-12-31";
    const fb = b.inscricao_fim || "9999-12-31";
    return fa.localeCompare(fb);
  });

  renderKPIs(items);
  document.getElementById("cards").innerHTML = items.map(card).join("") || `<div class="small">Nada encontrado com esses filtros.</div>`;
}

(async ()=>{
  const data = await loadData();
  document.getElementById("lastUpdate").textContent = `Atualização: ${data.last_update || "—"}`;
  const all = data.items || [];

  document.getElementById("apply").onclick = ()=>applyFilters(all);
  document.getElementById("reset").onclick = ()=>{
    ["q","uf"].forEach(id=>document.getElementById(id).value="");
    ["inst","tipo","area","aberto"].forEach(id=>document.getElementById(id).value="");
    applyFilters(all);
  };
  document.getElementById("prio").onclick = ()=>{
    document.getElementById("inst").value = ""; // deixa “todas”
    document.getElementById("q").value = "UFMT UNEMAT";
    applyFilters(all);
  };

  applyFilters(all);
})();
