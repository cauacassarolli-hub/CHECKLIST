import { interpretAgentQuestion,isOpen } from './domain.js';
const normalize=text=>String(text??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const prefix=/^(?:(?:gere|gerar|prepare|faca|monte|quero|preciso de|exporte|exportar)\s+)?(?:(?:um|uma)\s+)?(?:relatorio|planilha|excel|xlsx)\b/;
export const isFiscalExcelRequest=question=>{
  const text=normalize(question);
  return prefix.test(text)&&/\b(?:excel|xlsx|planilha)\b/.test(text);
};
export function interpretFiscalExcelRequest(data,question){
  const text=normalize(question);
  if(!isFiscalExcelRequest(text))throw new Error('Peça uma planilha Excel para preparar a exportação.');
  if(/\b(?:envi\w*|mand\w*|whatsapp|email|e-mail|compartilh\w*|public\w*|anex\w*|salv\w*)\b/.test(text))
    throw new Error('O Fiscal prepara o Excel, mas não envia, compartilha ou salva automaticamente.');
  const details=text.replace(prefix,'').replace(/\b(?:em\s+)?(?:excel|xlsx)\b/g,'').trim();
  const catalog=Array.isArray(data?.servicos)?data.servicos:[];
  const normalizedServices=catalog.some(s=>s?.nome&&details.includes(normalize(s.nome)));
  if(!/\b(?:ocorrenc\w*|pendenc\w*|paviment\w*|andar|apartament\w*|apto|servic\w*|ambient\w*|status|corrigid\w*|conform\w*)\b/.test(details)&&!normalizedServices)
    throw new Error('Informe quais ocorrências, serviço, apartamento ou pavimento deseja exportar.');
  const parsed=interpretAgentQuestion(data,'Mostre ocorrências '+details);
  const explicitStatus=/\b(?:pendentes?|corrigid\w*|conform\w*|em correcao)\b/.test(details);
  const somenteAbertas=/\bpendenc\w*\b/.test(details)&&!explicitStatus;
  return {
    acao:'CONSULTAR_OCORRENCIAS',
    filtros:{...parsed.filtros,status:somenteAbertas?'':parsed.filtros.status},
    somenteAbertas
  };
}
export function prepareFiscalExcelResult(result,somenteAbertas=false){
  if(!result||result.acao!=='CONSULTAR_OCORRENCIAS'||!Array.isArray(result.ocorrencias)||!result.resumo)
    throw new Error('Consulta detalhada inválida para preparar Excel.');
  if(!somenteAbertas)return result;
  const rows=result.ocorrencias.filter(isOpen);
  const services=new Map();
  let pendentes=0,em_correcao=0;
  for(const row of rows){
    if(row.status==='pendente')pendentes++;
    else if(row.status==='correcao'||row.status==='em_correcao')em_correcao++;
    const key=row.servico||'Sem serviço';
    const count=services.get(key)||0;services.set(key,count+1);
  }
  const servicos=[...services].map(([servico,abertas])=>({servico,total:abertas,abertas}))
    .sort((a,b)=>b.abertas-a.abertas||a.servico.localeCompare(b.servico,'pt-BR'));
  return {
    ...result,
    filtros:{...(result.filtros||{}),status:'abertas'},
    resumo:{total:rows.length,abertas:rows.length,pendentes,em_correcao,corrigidas:0,conformes:0,servicos},
    ocorrencias:rows
  };
}
