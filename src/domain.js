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
  if (!ITEM_STATUS[draft.status]) throw new Error('Escolha um status válido.');
  return {id:draft.id,user_id:userId,obra_id:draft.obra_id,apartamento_id:draft.apartamento_id,ambiente:draft.ambiente,servico:draft.servico,status:draft.status,responsavel:draft.responsavel?.trim()||null,prioridade:draft.prioridade?.trim()||null,observacao:draft.observacao?.trim()||null,prazo:draft.prazo||null,foto_antes_path:draft.foto_antes_path||null,foto_depois_path:draft.foto_depois_path||null,data_correcao:['corrigido','conforme'].includes(draft.status) ? draft.data_correcao||new Date().toISOString() : null,updated_at:new Date().toISOString()};
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
