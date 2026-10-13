export const ITEM_STATUS = { pendente: 'Pendente', correcao: 'Em correção', corrigido: 'Corrigido', conforme: 'Conforme' };
export const APT_STATUS = { nao_iniciado: 'Não vistoriado', nao_vistoriado: 'Não vistoriado', em_vistoria: 'Em vistoria', com_pendencias: 'Com pendências', em_correcao: 'Em correção', conforme: 'Conforme', finalizado: 'Finalizado' };
export const REPORT_TYPES = { pavimento: 'Fotográfico por pavimento', servico: 'Por serviço', pendencias: 'Pendências', finalizacao: 'Finalização do pavimento' };
export const isOpen = i => ['pendente', 'correcao', 'em_correcao'].includes(i.status);
export const isApproved = a => ['conforme', 'finalizado'].includes(a.status);
export const natural = (a,b) => String(a).localeCompare(String(b), 'pt-BR', {numeric:true});
export const sortApts = (a,b) => natural(a.pavimento,b.pavimento) || natural(a.apartamento,b.apartamento);
export const dateTime = value => value ? new Date(value).toLocaleString('pt-BR', {dateStyle:'short',timeStyle:'short'}) : '—';
export const canManageWork = (user,obra) => !!user?.id && user.id===obra?.user_id;
export const canDeleteRecord = (user,obra,row) => canManageWork(user,obra) || (!!user?.id && row?.user_id===user.id);
export const authorName = row => row?.criado_por_nome || 'Autor do registro anterior';
// Inactive catalog entries remain selectable for reporting and for the record
// that already references them, but are not offered to new records.
export function catalogOptions(rows, selected='', includeInactive=false) {
  const result=rows.filter(r=>includeInactive || r.ativo!==false).sort((a,b)=>natural(a.nome,b.nome))
    .map(r=>[r.nome,r.nome+(r.ativo===false?' (inativo)':'')]);
  if(selected && !result.some(([name])=>name===selected)) result.push([selected,selected+' (histórico)']);
  return result;
}
export function recordOptions(data, record={}) {
  const priorities=data.prioridades?.length ? data.prioridades : [{nome:'normal'},{nome:'alta'}];
  return {
    ambientes:catalogOptions(data.ambientes,record.ambiente),
    servicos:catalogOptions(data.servicos,record.servico),
    prioridades:catalogOptions(priorities,record.prioridade)
  };
}
export function apartmentStatus(apt, items) {
  const rows = items.filter(i => i.apartamento_id === apt.id);
  if (rows.some(i => i.status === 'pendente')) return 'com_pendencias';
  if (rows.some(isOpen)) return 'em_correcao';
  if (isApproved(apt)) return apt.status;
  return rows.length ? 'em_vistoria' : apt.status || 'nao_iniciado';
}
export function filterOccurrences(data, filters={}) {
  const norm=value=>String(value??'').trim().toLocaleLowerCase('pt-BR');
  const apartment=norm(filters.apartamento), floor=norm(filters.pavimento), service=norm(filters.servico), room=norm(filters.ambiente), status=norm(filters.status);
  const aptById=new Map((data.apartamentos||[]).map(a=>[a.id,a]));
  return (data.itens||[]).filter(item=>{
    const apt=aptById.get(item.apartamento_id);
    if (!apt) return false;
    if (floor && norm(apt.pavimento)!==floor) return false;
    if (apartment && norm(apt.apartamento)!==apartment) return false;
    if (service && norm(item.servico)!==service) return false;
    if (room && norm(item.ambiente)!==room) return false;
    if (status && norm(item.status)!==status) return false;
    return true;
  });
}

export function validateOccurrenceQuery(data, input={}) {
  const clean=value=>String(value??'').trim();
  const filters={pavimento:clean(input.pavimento),apartamento:clean(input.apartamento),servico:clean(input.servico),ambiente:clean(input.ambiente),status:clean(input.status)};
  if(filters.pavimento && !(data.apartamentos||[]).some(a=>a.pavimento===filters.pavimento)) throw new Error('Pavimento não encontrado nesta obra.');
  if(filters.apartamento && !(data.apartamentos||[]).some(a=>a.apartamento===filters.apartamento && (!filters.pavimento||a.pavimento===filters.pavimento))) throw new Error('Apartamento não encontrado no filtro informado.');
  if(filters.servico && !(data.servicos||[]).some(s=>s.nome===filters.servico)) throw new Error('Serviço não cadastrado nesta obra.');
  if(filters.ambiente && !(data.ambientes||[]).some(a=>a.nome===filters.ambiente)) throw new Error('Ambiente não cadastrado nesta obra.');
  if(filters.status && !ITEM_STATUS[filters.status]) throw new Error('Status de ocorrência inválido.');
  return filters;
}

export function queryOccurrences(data, input={}) {
  const filters=validateOccurrenceQuery(data,input);
  return {filters,items:filterOccurrences(data,filters),summary:occurrenceSummary(data,filters)};
}

export const AGENT_READ_ACTIONS = Object.freeze(['CONSULTAR_OCORRENCIAS','CONSULTAR_RESUMO']);

export function executeAgentReadAction(data, request={}) {
  if(!request || typeof request!=='object' || Array.isArray(request)) throw new Error('Solicitação do agente inválida.');
  const action=String(request.acao||'').trim().toUpperCase();
  if(!AGENT_READ_ACTIONS.includes(action)) throw new Error('Ação não permitida para consulta do agente.');
  const query=queryOccurrences(data,request.filtros||{});
  if(action==='CONSULTAR_RESUMO') return {acao:action,filtros:query.filters,resumo:query.summary};
  return {acao:action,filtros:query.filters,resumo:query.summary,ocorrencias:query.items};
}

export function occurrenceSummary(data, filters={}) {
  const items=filterOccurrences(data,filters);
  const counts={total:items.length,abertas:0,pendentes:0,em_correcao:0,corrigidas:0,conformes:0};
  const byService=new Map();
  for(const item of items){
    if(isOpen(item)) counts.abertas++;
    if(item.status==='pendente') counts.pendentes++;
    if(['correcao','em_correcao'].includes(item.status)) counts.em_correcao++;
    if(item.status==='corrigido') counts.corrigidas++;
    if(item.status==='conforme') counts.conformes++;
    const service=item.servico||'Sem serviço';
    const current=byService.get(service)||{servico:service,total:0,abertas:0};
    current.total++;if(isOpen(item))current.abertas++;byService.set(service,current);
  }
  const servicos=[...byService.values()].sort((a,b)=>b.abertas-a.abertas||b.total-a.total||natural(a.servico,b.servico));
  return {...counts,servicos};
}

export function buildReportModel(data, filters) {
  const {tipo, pavimento='', servico='', status='', responsavel=''} = filters;
  if (!REPORT_TYPES[tipo]) throw new Error('Selecione o tipo de relatório.');
  if (['pavimento','finalizacao'].includes(tipo) && !pavimento) throw new Error('Selecione um pavimento.');
  if (tipo === 'servico' && (!servico || !data.servicos.some(s => s.nome===servico))) throw new Error('Selecione um serviço cadastrado.');
  const apartments=data.apartamentos.filter(a=>!pavimento || a.pavimento===pavimento).map(a=>({...a,status:apartmentStatus(a,data.itens)})).sort(sortApts);
  if (!apartments.length) throw new Error('Nenhum apartamento no pavimento selecionado.');
  const ids=new Set(apartments.map(a=>a.id));
  const floorItems=data.itens.filter(i=>ids.has(i.apartamento_id));
  // Completion always evaluates the whole floor, regardless of hidden form filters.
  let items=floorItems;
  if (tipo!=='finalizacao' && tipo!=='pavimento') {
    if (servico) items=items.filter(i=>i.servico===servico);
    if (tipo==='pendencias' && !status) items=items.filter(isOpen);
    if (status) items=items.filter(i=>i.status===status);
    if (responsavel.trim()) items=items.filter(i=>(i.responsavel||'').toLocaleLowerCase('pt-BR').includes(responsavel.trim().toLocaleLowerCase('pt-BR')));
  }
  const pendingApts=apartments.filter(a=>floorItems.some(i=>i.apartamento_id===a.id && isOpen(i)));
  const approved=apartments.filter(a=>isApproved(a) && !pendingApts.some(p=>p.id===a.id));
  const notApproved=apartments.length-approved.length;
  const conclusion=pendingApts.length ? `Atenção: ${pendingApts.length} apartamento(s) com pendências. Pavimento não liberado.` : notApproved ? `Vistoria a concluir: ${notApproved} apartamento(s) ainda sem classificação Conforme/Finalizado. Pavimento não liberado.` : 'Pavimento conforme: todos os apartamentos classificados como Conforme ou Finalizado, sem pendências abertas.';
  return { obra:data.obra, tipo, filters:{tipo,pavimento,servico,status,responsavel}, titulo:`${REPORT_TYPES[tipo]}${pavimento?' · '+pavimento:''}${tipo==='servico'?' · '+servico:''}`, created_at:new Date().toISOString(), apartments, items, summary:{total:apartments.length, approved:approved.length, pending:pendingApts.length, pendingItems:floorItems.filter(isOpen).length, notApproved, correctionTotal:floorItems.length, correctionPercent:progressOf(floorItems).percent, conclusion} };
}
export function validatePublicConfig(config) {
  if (!config?.url || !config?.key) return false;
  let u; try { u=new URL(config.url); } catch { return false; }
  return u.protocol==='https:' && /^[a-z0-9-]+\.supabase\.co$/.test(u.hostname) && /^sb_publishable_[A-Za-z0-9_-]+$/.test(config.key);
}
export function draftRow(draft, userId) {
  if (!draft.ambiente || !draft.servico) throw new Error('Escolha o ambiente e o serviço.');
  if (!draft.existing && !draft.titulo?.trim()) throw new Error('Informe o título da ocorrência.');
  if (!ITEM_STATUS[draft.status]) throw new Error('Escolha um status válido.');
  return {id:draft.id,user_id:userId,obra_id:draft.obra_id,apartamento_id:draft.apartamento_id,ambiente:draft.ambiente,servico:draft.servico,titulo:draft.titulo?.trim()||null,origem:draft.origem||'manual',status:draft.status,responsavel:draft.responsavel?.trim()||null,prioridade:draft.prioridade?.trim()||null,observacao:draft.observacao?.trim()||null,prazo:draft.prazo||null,foto_antes_path:draft.foto_antes_path||null,foto_depois_path:draft.foto_depois_path||null,data_correcao:['corrigido','conforme'].includes(draft.status) ? draft.data_correcao||new Date().toISOString() : null,updated_at:new Date().toISOString()};
}
// Progress is measured by corrected/conforme records, not by apartment count:
// an apartment with 3 problems and 1 fixed is not "33% approved", it is "33% corrected".
export function progressOf(items) {
  const total=items.length;
  if (!total) return {total:0,done:0,percent:100};
  const done=items.filter(i=>['corrigido','conforme'].includes(i.status)).length;
  return {total,done,percent:Math.round(done/total*100)};
}
// Only an item that is still open can be overdue; a corrected/conforme item never is,
// even if it was fixed after its own deadline.
export const isOverdue=(item,today=new Date())=>!!item.prazo && isOpen(item) && new Date(item.prazo+'T23:59:59')<today;


const normalizeAgentText=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const findCatalogMention=(text,rows=[])=>{
  const normalized=normalizeAgentText(text);
  return rows.find(row=>normalized.includes(normalizeAgentText(row.nome)))?.nome||'';
};

/**
 * Interpreta apenas consultas de leitura previsíveis.
 * Não executa nada e nunca converte verbos de escrita em ações permitidas.
 */
export function interpretAgentQuestion(data,question=''){
  const raw=String(question??'').trim();
  if(!raw)throw new Error('Digite uma pergunta para o Fiscal.');
  const text=normalizeAgentText(raw);
  if(/\b(cri(?:ar|e|a)|cadastr\w*|registr\w*|alter\w*|edit\w*|exclu\w*|apag\w*|delet\w*|remov\w*|envi\w*|mand\w*|aprov\w*|resolv\w*|corrij\w*|corrig\w*|finaliz\w*)\b/.test(text))
    throw new Error('O Fiscal está em modo somente leitura. Esta solicitação tenta alterar dados.');

  const filtros={pavimento:'',apartamento:'',servico:'',ambiente:'',status:''};
  const floorMatch=text.match(/(?:pavimento|andar)\s+(?:do\s+|da\s+)?([\wºª-]+)/i);
  if(floorMatch){
    const wanted=normalizeAgentText(floorMatch[1]).replace(/(?:o|a)$/,'');
    const floor=(data.apartamentos||[]).map(a=>a.pavimento).find(v=>normalizeAgentText(v).replace(/(?:o|a)$/,'')===wanted);
    if(!floor)throw new Error('Pavimento não encontrado nesta obra.');
    filtros.pavimento=floor;
  }
  const aptMatch=text.match(/(?:apto|apartamento)\s*([\w-]+)/i);
  if(aptMatch){
    const wanted=normalizeAgentText(aptMatch[1]);
    const apt=(data.apartamentos||[]).find(a=>normalizeAgentText(a.apartamento)===wanted && (!filtros.pavimento||a.pavimento===filtros.pavimento));
    if(!apt)throw new Error('Apartamento não encontrado nesta obra ou no pavimento informado.');
    filtros.apartamento=apt.apartamento;
  }
  filtros.servico=findCatalogMention(text,data.servicos);
  filtros.ambiente=findCatalogMention(text,data.ambientes);
  if(/\bpendencias?\b|\bpendentes?\b/.test(text) && !/\b(quant[oa]s?|total|resumo|quantidade)\b/.test(text))filtros.status='pendente';
  else if(/\bem correcao\b/.test(text))filtros.status='correcao';
  else if(/\bcorrigid[ao]s?\b/.test(text))filtros.status='corrigido';
  else if(/\bconformes?\b/.test(text))filtros.status='conforme';

  const asksSummary=/\b(quant[oa]s?|total|resumo|quantidade)\b/.test(text);
  return {acao:asksSummary?'CONSULTAR_RESUMO':'CONSULTAR_OCORRENCIAS',filtros};
}
