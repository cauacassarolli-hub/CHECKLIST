const APP_ORIGIN='https://cauacassarolli-hub.github.io';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Read-only endpoint. The caller supplies ONLY the work ID; user ID is
// derived from an Auth-verified bearer. No email, reservation or sending.
export function createEmailDryRunHandler({authenticate,simulate}){
  if(typeof authenticate!=='function'||typeof simulate!=='function')
    throw new Error('Simulação de e-mail não configurada.');
  return async req=>{
    const headers={
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'Access-Control-Allow-Origin':APP_ORIGIN,
      'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Vary':'Origin'
    };
    const response=(status,data)=>new Response(JSON.stringify(data),{status,headers});
    const origin=req.headers.get('origin');
    if(origin&&origin!==APP_ORIGIN)return response(403,{error:'Origem não permitida.'});
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(req.method!=='POST')return response(405,{error:'Método não permitido.'});
    const authorization=req.headers.get('authorization')||'';
    if(!/^Bearer [^\s]+$/i.test(authorization))
      return response(401,{error:'Faça login para simular o resumo.'});

    try{
      const userId=await authenticate(authorization.slice(7));
      if(typeof userId!=='string'||!uuid.test(userId))
        return response(401,{error:'Sessão inválida. Entre novamente.'});
      const raw=await req.text();
      if(raw.length>512)return response(400,{error:'Solicitação de simulação inválida.'});
      let input;
      try{input=JSON.parse(raw);}catch{return response(400,{error:'Solicitação de simulação inválida.'});}
      if(!input||typeof input!=='object'||Array.isArray(input)||
         Object.keys(input).length!==1||!uuid.test(input.work_id||''))
        return response(400,{error:'Informe apenas uma obra válida.'});
      const result=await simulate({userId,obraId:input.work_id});
      if(!result||typeof result!=='object'||
        typeof result.apto_para_preparar!=='boolean'||
        result.envio_executado!==false||result.reserva_criada!==false)
        return response(503,{error:'Não foi possível validar a simulação.'});
      // Fixed allowlist; omit all email, internal IDs, and unrelated data.
      return response(200,{
        apto_para_preparar:result.apto_para_preparar,
        motivo:String(result.motivo||'verificacao_indisponivel'),
        data_local:result.data_local||null,
        horario:result.horario||null,
        fuso:result.fuso||null,
        envio_executado:false,
        reserva_criada:false
      });
    }catch{
      return response(503,{error:'Simulação indisponível. Nenhum envio foi realizado.'});
    }
  };
}
