import {formatDailyDigestMessage,DAILY_DIGEST_TIMEZONE} from './daily-digest.js';

// Plain-text-only draft. No recipient, transport, attachment, reservation or sending.
const oneLine=value=>String(value??'')
  .replace(/[\u0000-\u001f\u007f-\u009f]+/g,' ')
  .replace(/\s+/g,' ').trim();
export function buildEmailContentPreview(digest){
  if(!digest||typeof digest!=='object'||Array.isArray(digest)||
    !digest.obra_id||typeof digest.obra_nome!=='string'||
    !digest.obra_nome.trim()||digest.enviado!==false||
    digest.timezone!==DAILY_DIGEST_TIMEZONE)
    throw new Error('Consulte um resumo válido antes de preparar o texto do e-mail.');
  if(!/^\d{4}-\d{2}-\d{2}T/.test(String(digest.gerado_em_iso||''))||
     !Number.isFinite(new Date(digest.gerado_em_iso).getTime()))
    throw new Error('Data do resumo inválida. Consulte novamente.');
  const subject='Fiscal de Qualidade | '+oneLine(digest.obra_nome).slice(0,72)
    +' | '+digest.gerado_em_iso.slice(0,10);
  const text=formatDailyDigestMessage(digest);
  if(text.length>20000||subject.length>160)
    throw new Error('O resumo ultrapassou o tamanho permitido para a prévia.');
  return Object.freeze({
    assunto:subject,
    corpo:text,
    formato:'text/plain; charset=utf-8',
    destinatario_definido:false,
    reserva_criada:false,
    envio_executado:false
  });
}
