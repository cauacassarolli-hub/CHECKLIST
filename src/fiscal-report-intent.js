import { interpretAgentQuestion } from './domain.js';

const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const REPORT_START=/^(?:(?:gere|gerar|quero|preciso de|faca|prepare|monte|montar|crie|criar)\s+)?(?:um\s+)?relatorio\b/;

/** Apenas reconhece a intenção; nunca produz ou salva um arquivo. */
export function isFiscalReportRequest(question=''){
  return REPORT_START.test(normalized(question));
}

/**
 * Preenche somente filtros já suportados pelo gerador PDF existente.
 * A geração exige a confirmação explícita no formulário Relatórios.
 */
export function interpretFiscalReportRequest(data,question=''){
  const text=normalized(question);
  const prefix=text.match(REPORT_START);
  if(!prefix)throw new Error('Peça um relatório para preparar os filtros de PDF.');
  const details=text.slice(prefix[0].length).trim();
  if(!details)throw new Error('Informe o pavimento, o serviço ou as pendências do relatório.');
  if(/\b(?:excel|xlsx|csv|planilha|email|e-mail|whatsapp|envi\w*|compartilh\w*|export\w*|baix\w*|imprim\w*|salv\w*)\b/.test(details))
    throw new Error('O Fiscal ainda não envia nem exporta relatórios por mensagem ou planilha.');
  if(/\b(?:ambient\w*|responsavel\w*|corrigid\w*|conform\w*|status)\b/.test(details))
    throw new Error('Este filtro de relatório ainda não é suportado pelo Fiscal.');

  // Reutiliza as regras de reconhecimento e validação do leitor já testado.
  const {filtros}=interpretAgentQuestion(data,'Mostre ocorrências '+details);
  const matches=(data.apartamentos||[]).filter(a=>a.apartamento===filtros.apartamento && (!filtros.pavimento||a.pavimento===filtros.pavimento));
  const apt=filtros.apartamento?(matches.length===1?matches[0]:null):null;
  if(filtros.apartamento && !apt?.id)
    throw new Error('Apartamento não identificado de forma única nesta obra.');
  const apartamento_id=apt?.id||'';
  const pavimento=filtros.pavimento||apt?.pavimento||'';
  const finalizacao=/\b(?:finaliz\w*|liberac\w*)\b/.test(details);
  const pendencias=/\b(?:pendenc\w*|pendente\w*)\b/.test(details);

  if(finalizacao){
    if(!pavimento||filtros.servico||apartamento_id)
      throw new Error('O relatório de finalização exige um pavimento, sem filtro de serviço.');
    return {tipo:'finalizacao',pavimento,apartamento_id:'',servico:'',status:'',responsavel:''};
  }
  if(pendencias){
    return {tipo:'pendencias',pavimento,apartamento_id,servico:filtros.servico,status:'',responsavel:''};
  }
  if(apartamento_id){
    return {tipo:'apartamento',pavimento,apartamento_id,servico:filtros.servico,status:'',responsavel:''};
  }
  if(filtros.servico){
    return {tipo:'servico',pavimento,apartamento_id:'',servico:filtros.servico,status:'',responsavel:''};
  }
  if(pavimento){
    return {tipo:'pavimento',pavimento,apartamento_id:'',servico:'',status:'',responsavel:''};
  }
  throw new Error('Não identifiquei um pavimento, serviço ou conjunto de pendências para o relatório.');
}
