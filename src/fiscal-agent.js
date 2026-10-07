import { AGENT_READ_ACTIONS } from './domain.js';

export class FiscalAgentGateway {
  constructor(repository) { this.repository=repository; }

  async execute(obraId,request={}) {
    if(!request || typeof request!=='object' || Array.isArray(request)) throw new Error('Solicitação do agente inválida.');
    const acao=String(request.acao||'').trim().toUpperCase();
    if(!AGENT_READ_ACTIONS.includes(acao)) throw new Error('Ação não permitida para consulta do agente.');
    if(!obraId) throw new Error('Selecione uma obra para consultar.');

    const result=await this.repository.queryOccurrences(obraId,request.filtros||{});
    const response={acao,filtros:result.filtros||{},resumo:result.resumo||{}};
    if(acao==='CONSULTAR_OCORRENCIAS') response.ocorrencias=result.ocorrencias||[];
    return response;
  }
}
