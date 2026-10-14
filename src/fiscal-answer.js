// Respostas derivadas dos resultados autorizados da RPC, nunca de estimativas.
const numeric=(value,key)=>{
  const number=Number(value);
  if(value===null||value===undefined||value===''||!Number.isSafeInteger(number)||number<0)
    throw new Error('Dados incompletos ou inválidos na resposta do Fiscal: '+key+'.');
  return number;
};
const unit=(n,singular,plural)=>n+' '+(n===1?singular:plural);
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
export function formatFiscalAnswer(question,result){
  if(!result||typeof result!=='object'||!result.resumo||typeof result.resumo!=='object')
    throw new Error('Resultado de consulta inválido.');
  const text=normalize(question);
  const summary=result.resumo;
  if(result.acao==='CONSULTAR_RESUMO'){
    const total=numeric(summary.total,'total');
    const abertas=numeric(summary.abertas,'abertas');
    const pendentes=numeric(summary.pendentes,'pendentes');
    const emCorrecao=numeric(summary.em_correcao,'em_correcao');
    const corrigidas=numeric(summary.corrigidas,'corrigidas');
    const conformes=numeric(summary.conformes,'conformes');
    const status=String(result.filtros?.status||'');
    if(/\b(qual|quais)\b.*\bservic\w*\b.*\bmais\b|\bservic\w*\b.*\bmais\b/.test(text)){
      if(!Array.isArray(summary.servicos))throw new Error('Ranking de serviços indisponível na consulta.');
      const ordered=summary.servicos.map(s=>({
        servico:String(s.servico??'Sem serviço'),abertas:numeric(s.abertas,'servicos.abertas')
      })).filter(s=>s.abertas>0).sort((a,b)=>b.abertas-a.abertas);
      if(!ordered.length)return 'Não há ocorrências abertas nos filtros consultados.';
      const top=ordered.filter(s=>s.abertas===ordered[0].abertas);
      const amount=unit(top[0].abertas,'ocorrência aberta','ocorrências abertas');
      return top.length===1
        ?'O serviço com mais ocorrências abertas é '+top[0].servico+', com '+amount+'.'
        :'Há empate entre '+top.map(s=>s.servico).join(', ')+': '+amount+' em cada serviço.';
    }
    if(status==='corrigido')return 'Foram encontradas '+unit(corrigidas,'ocorrência corrigida','ocorrências corrigidas')+' nos filtros informados.';
    if(status==='conforme')return 'Foram encontradas '+unit(conformes,'ocorrência conforme','ocorrências conformes')+' nos filtros informados.';
    if(status==='pendente')return 'Foram encontradas '+unit(pendentes,'ocorrência pendente','ocorrências pendentes')+' nos filtros informados.';
    if(status==='correcao'||status==='em_correcao')return 'Foram encontradas '+unit(emCorrecao,'ocorrência em correção','ocorrências em correção')+' nos filtros informados.';
    if(/\bpendenc\w*\b|\babert\w*\b/.test(text))
      return 'Há '+unit(abertas,'ocorrência aberta','ocorrências abertas')+': '+unit(pendentes,'pendente','pendentes')+' e '+emCorrecao+' em correção.';
    return 'Foram encontradas '+unit(total,'ocorrência','ocorrências')+', das quais '+abertas+' abertas e '+corrigidas+' corrigidas.';
  }
  if(result.acao==='CONSULTAR_OCORRENCIAS'){
    if(!Array.isArray(result.ocorrencias))throw new Error('Lista de ocorrências indisponível na consulta.');
    return 'A consulta retornou '+unit(result.ocorrencias.length,'ocorrência','ocorrências')+' para os filtros informados.';
  }
  throw new Error('Ação não permitida para resposta do Fiscal.');
}
