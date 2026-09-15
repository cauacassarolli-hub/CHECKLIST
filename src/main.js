import './style.css';
import { createRepository } from './repository.js';
import { validatePublicConfig } from './domain.js';
import { mountApp } from './app.js';

const root=document.querySelector('#app');
try {
  const response=await fetch('./config.json',{cache:'no-store'});
  const config=await response.json();
  if(!validatePublicConfig(config))throw new Error('A conexão desta obra ainda não foi configurada na publicação.');
  await mountApp(createRepository(config),root);
} catch(error) {
  root.innerHTML='<main class="welcome"><h1>Pente Fino</h1><p role="alert"></p><p class="small">Aguarde a configuração da obra para entrar.</p></main>';
  root.querySelector('[role="alert"]').textContent=error.message;
}
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});
