// Local QA entry only. Never included by the production build.
import '../src/style.css';
import {createRepository} from '../src/repository.js';
import {mountApp} from '../src/app.js';
const root=document.querySelector('#app');
const repo=createRepository({url:location.origin+'/mock',key:'local-test-public-key'});
const controls=document.createElement('aside');controls.className='qa-controls';
controls.innerHTML='<strong>AMBIENTE LOCAL DE TESTE</strong> <button id="qa-network">Simular falha no próximo upload</button> <button id="qa-login">Iniciar sessão local de teste</button><span id="qa-result"></span>';
document.body.prepend(controls);
controls.querySelector('#qa-network').onclick=async()=>{await fetch('/mock/qa/fail-upload',{method:'POST'});controls.querySelector('#qa-result').textContent='Próximo upload falhará.';};
controls.querySelector('#qa-login').onclick=async()=>{await repo.login('qa@example.invalid','local-fixture-only');await mountApp(repo,root);controls.querySelector('#qa-login').hidden=true;};
if(await repo.session()){await mountApp(repo,root);controls.querySelector('#qa-login').hidden=true;}
