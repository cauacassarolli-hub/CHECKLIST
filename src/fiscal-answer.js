// Texto gerado exclusivamente com os números retornados pelo backend autorizado.
const count=value=>Number.isFinite(Number(value))&&Number(value)>=0?Number(value):0;
export function formatFiscalAnswer(question,result){
  if(!result||!result.resumo)throw new Error('Resultado de consulta inválido.');
  const text=String(question??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const summary=result.resumo;
  if(result.acao==='CONSULTAR_RESUMO'){
    if(/\b(qual|quais)\b.*\bservic\w*\b.*\bmais\b|\bservic\w*\b.*\bmais\b/.test(text)){
      const ordered=(summary.servicos||[]).filter(s=>count(s.abertas)>0).sort((a,b)=>count(b.abertas)-count(a.abertas));
      if(!ordered.length)return 'Não há ocorrências abertas nos filtros consultados.';
      const top=ordered[0];
      return `O serviço com mais ocorrências abertas é ${top.servico}, com ${count(top.abertas)} ocorrência(s) aberta(s).`;
    }
    if(/\bpendenc\w*\b|\babert\w*\b/.test(text))
      return `Há ${count(summary.abertas)} ocorrência(s) aberta(s): ${count(summary.pendentes)} pendente(s) e ${count(summary.em_correcao)} em correção.`;
    return `Foram encontradas ${count(summary.total)} ocorrência(s), das quais ${count(summary.abertas)} estão abertas e ${count(summary.corrigidas)} estão corrigidas.`;
  }
  if(result.acao==='CONSULTAR_OCORRENCIAS'){
    const length=Array.isArray(result.ocorrencias)?result.ocorrencias.length:0;
    return `A consulta retornou ${length} ocorrência(s) para os filtros informados.`;
  }
  throw new Error('Ação não permitida para resposta do Fiscal.');
}
