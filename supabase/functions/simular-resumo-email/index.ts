import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {createEmailDigestDryRun} from './email-dry-run.js';
import {createEmailDryRunHandler} from './handler.js';

const url=Deno.env.get('SUPABASE_URL')||'';
const serverKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
if(!url||!serverKey)throw new Error('Supabase indisponível.');
const client=createClient(url,serverKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});

// Uses Auth Admin on the server; no service key is exposed to the PWA.
// Gateway JWT verification can be disabled for modern signing keys ONLY
// because the handler calls auth.getUser(bearer) for EVERY POST request.
const simulate=createEmailDigestDryRun({
  getAuthUser:async id=>{
    const {data,error}=await client.auth.admin.getUserById(id);
    if(error)throw new Error('Auth Admin indisponível.');
    return data?.user||null;
  },
  getWorkState:async({userId,obraId,evaluatedAt})=>{
    const {data,error}=await client.rpc('chk_estado_simulacao_resumo_email',{
      p_user_id:userId,p_obra_id:obraId,p_agora:evaluatedAt
    });
    if(error)throw new Error('Consulta de estado indisponível.');
    return data;
  }
});

Deno.serve(createEmailDryRunHandler({
  authenticate:async token=>{
    const {data,error}=await client.auth.getUser(token);
    if(error||!data?.user)return null;
    return data.user.id;
  },
  simulate
}));
