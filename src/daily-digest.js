// Prévia do resumo diário, derivada exclusivamente da consulta autenticada.
// Não agenda, envia e-mails, gera links públicos nem altera ocorrências.
export const DAILY_DIGEST_TIMEZONE='America/Sao_Paulo';
const nonnegativeInteger=(value,label)=>{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)
    throw new Error('Resumo diário incompleto ou inválido: '+label+'.');
  return value;
};
const summarize=(value)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw new Error('Consulta de resumo indisponível.');
  const fields=['total','abertas','pendentes','em_correcao','corrigidas','conformes'];
  const result=Object.fromEntries(fields.map(name=>[name,nonnegativeInteger(value[name],name)]));
  if(result.abertas!==result.pendentes+result.em_correcao)
    throw new Error('As contagens de pendências não conferem. Consulte novamente.');
  if(result.abertas+result.corrigidas+result.conformes>result.total)
    throw new Error('O total de ocorrências não confere. Consulte novamente.');
  return result;
};
export function buildDailyDigest(obra,response,at=new Date()){
  if(!obra?.id||typeof obra.nome!=='string'||!obra.nome.trim())
    throw new Error('Selecione uma obra válida para o resumo.');
  if(response?.acao!=='CONSULTAR_RESUMO'||response.ocorrencias!==undefined)
    throw new Error('A prévia exige uma consulta de resumo somente leitura.');
  if(!response.filtros||Object.values(response.filtros).some(v=>v!==''&&v!==null))
    throw new Error('A prévia diária deve considerar a obra inteira, sem filtros.');
  const counts=summarize(response.resumo);
  if(!Array.isArray(response.resumo.servicos))
    throw new Error('Ranking de serviços indisponível para o resumo diário.');
  const allServices=response.resumo.servicos.map((row,index)=>{
    if(!row||typeof row!=='object')throw new Error('Serviço inválido no resumo: '+index+'.');
    const abertas=nonnegativeInteger(row.abertas,'servicos.abertas');
    const total=nonnegativeInteger(row.total,'servicos.total');
    if(abertas>total)throw new Error('Total inválido para o serviço '+index+'.');
    return {servico:String(row.servico??'Sem serviço').trim()||'Sem serviço',abertas,total};
  });
  const sum=allServices.reduce((n,s)=>n+s.abertas,0);
  if(sum!==counts.abertas)
    throw new Error('As pendências por serviço não conferem com o total da obra.');
  const now=at instanceof Date?at:new Date(at);
  if(!Number.isFinite(now.getTime()))throw new Error('Data de geração do resumo inválida.');
  const generatedAt=new Intl.DateTimeFormat('pt-BR',{
    timeZone:DAILY_DIGEST_TIMEZONE,dateStyle:'short',timeStyle:'short'
  }).format(now);
  const ranked=allServices.filter(s=>s.abertas>0)
    .sort((a,b)=>b.abertas-a.abertas||a.servico.localeCompare(b.servico,'pt-BR'));
  return {
    obra_id:obra.id,
    obra_nome:obra.nome.trim(),
    gerado_em:generatedAt,
    gerado_em_iso:now.toISOString(),
    timezone:DAILY_DIGEST_TIMEZONE,
    resumo:counts,
    principais_servicos:ranked.slice(0,5),
    outros_servicos:Math.max(0,ranked.length-5),
    informativo:'Retrato das ocorrências cadastradas no momento da consulta. Não representa alterações nas últimas 24 horas.',
    enviado:false
  };
}


// Mensagem para cópia manual; nenhum destinatário, link ou envio é criado aqui.
const oneLine=value=>String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
export function formatDailyDigestMessage(digest){
  if(!digest||!digest.obra_id||digest.enviado!==false||digest.timezone!==DAILY_DIGEST_TIMEZONE)
    throw new Error('Gere uma prévia válida antes de preparar a mensagem.');
  const counts=summarize(digest.resumo);
  if(!Array.isArray(digest.principais_servicos))
    throw new Error('Ranking inválido na mensagem do resumo.');
  const extra=nonnegativeInteger(digest.outros_servicos,'outros_servicos');
  const lines=[
    'FISCAL DE QUALIDADE — RESUMO DAS PENDÊNCIAS',
    'Obra: '+oneLine(digest.obra_nome),
    'Consulta: '+oneLine(digest.gerado_em)+' (horário de Brasília)',
    '',
    'SITUAÇÃO ATUAL',
    'Ocorrências registradas: '+counts.total,
    'Pendências abertas: '+counts.abertas,
    '• Pendentes: '+counts.pendentes,
    '• Em correção: '+counts.em_correcao,
    'Corrigidas: '+counts.corrigidas,
    'Conformes: '+counts.conformes,
    '',
    'SERVIÇOS COM MAIS PENDÊNCIAS'
  ];
  if(!digest.principais_servicos.length)lines.push('Nenhuma pendência aberta.');
  for(const service of digest.principais_servicos){
    const count=nonnegativeInteger(service?.abertas,'servicos.abertas');
    if(count===0)throw new Error('Serviço inválido no resumo diário.');
    lines.push('• '+oneLine(service.servico)+': '+count+' aberta(s)');
  }
  if(extra)lines.push('Outros serviços com pendências: '+extra);
  lines.push('','Observação: posição atual das ocorrências cadastradas. Não representa necessariamente alterações nas últimas 24 horas.');
  return lines.join('\n');
}
