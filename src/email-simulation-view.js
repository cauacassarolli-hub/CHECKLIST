// Text only: this module never schedules, reserves or sends anything.
const explanations=Object.freeze({
  preparacao_possivel_em_simulacao:'Condições atuais de preparação atendidas.',
  email_nao_confirmado:'O e-mail da conta ainda não está confirmado.',
  identidade_nao_confirmada:'Não foi possível confirmar a identidade no Auth.',
  sem_acesso:'Sua conta não participa mais desta obra.',
  sem_preferencia:'Não existem preferências de resumo para esta obra.',
  desativado:'A preferência de resumo diário está desativada.',
  resumo_desabilitado:'O resumo de pendências está desabilitado nas preferências.',
  antes_do_horario:'O horário configurado ainda não chegou.',
  ja_preparado:'Já existe uma reserva de resumo para hoje.',
  canal_nao_autorizado:'O recebimento de resumos por e-mail não está autorizado.',
  ledger_nao_verificado:'Não foi possível confirmar o controle de duplicidade.',
  dados_incompletos:'A verificação encontrou informações incompletas.',
  auth_indisponivel:'A consulta ao Auth está indisponível.',
  consulta_indisponivel:'A consulta segura ao banco está indisponível.',
  preferencias_invalidas:'As preferências cadastradas precisam ser revisadas.'
});
export function describeEmailSimulation(result){
  if(!result||typeof result!=='object'||Array.isArray(result)||
    typeof result.apto_para_preparar!=='boolean'||
    result.envio_executado!==false||result.reserva_criada!==false)
    throw new Error('Resposta inválida da simulação de e-mail.');
  const reason=String(result.motivo||'');
  if(result.apto_para_preparar && reason!=='preparacao_possivel_em_simulacao')
    throw new Error('A simulação apresentou um resultado inconsistente.');
  const explanation=explanations[reason]||'Não foi possível concluir a simulação.';
  return {
    apto:result.apto_para_preparar,
    titulo:result.apto_para_preparar?'Prévia apta para preparação':'Prévia ainda não apta',
    explicacao:explanation,
    aviso:'Simulação somente leitura. Nenhum e-mail foi enviado e nenhuma entrega foi reservada.'
  };
}
