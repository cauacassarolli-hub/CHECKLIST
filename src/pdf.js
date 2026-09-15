import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { APT_STATUS, ITEM_STATUS, dateTime, apartmentStatus } from './domain.js';

// Standard PDF fonts include Portuguese accents. Normalize unsupported symbols
// without dropping the rest of the user's note or preventing PDF generation.
const printable = text => String(text??'').normalize('NFC').replace(/[\u2010-\u2015]/g,'-').replace(/\u2026/g,'...').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff\u20ac\u2018\u2019\u201c\u201d\u2022]/gu,'?');
export async function generatePdf(model,loadPhoto,progress=()=>{}) {
  const doc=await PDFDocument.create();
  const normal=await doc.embedFont(StandardFonts.Helvetica), bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const red=rgb(.55,.09,.12), ink=rgb(.12,.14,.17), muted=rgb(.38,.41,.45), pale=rgb(.96,.96,.97);
  const W=595.28,H=841.89,M=40,C=W-M*2;
  let page,y;
  function addPage(subtitle='') {
    page=doc.addPage([W,H]);y=H-43;
    page.drawRectangle({x:0,y:H-9,width:W,height:9,color:red});
    page.drawText('PENTE FINO / RELATÓRIO FOTOGRÁFICO',{x:M,y,font:bold,size:11,color:red});
    y-=23;text(model.obra.nome,14,bold);text(`${model.obra.empresa||''}${model.obra.empresa?'  |  ':''}${dateTime(model.created_at)}`,9,normal,muted);
    page.drawLine({start:{x:M,y:y-4},end:{x:W-M,y:y-4},color:rgb(.84,.85,.87),thickness:.7});y-=23;
    if(subtitle)text(subtitle,12,bold);
  }
  function lines(value,font,size,width) {
    const out=[];
    for(const paragraph of printable(value).split('\n')) {
      let line='';
      for(const word of paragraph.split(/\s+/)) {
        if(font.widthOfTextAtSize(word,size)>width) {
          if(line)out.push(line);line='';
          for(const char of word) {if(font.widthOfTextAtSize(line+char,size)>width){out.push(line);line='';}line+=char;}
        } else {const next=line?line+' '+word:word;if(font.widthOfTextAtSize(next,size)>width && line){out.push(line);line=word;}else line=next;}
      }
      out.push(line);
    }
    return out;
  }
  function text(value,size=10,font=normal,color=ink) {
    for(const line of lines(value,font,size,C)) {if(y<size+55)addPage('Continuação');page.drawText(line,{x:M,y,font,size,color});y-=size*1.45;}
    y-=5;
  }
  doc.setTitle(model.titulo);doc.setAuthor(model.obra.empresa||'Pente Fino');doc.setSubject(model.obra.nome);
  addPage();text(model.titulo,18,bold,red);y-=10;
  text(`${model.summary.total} apartamentos  |  ${model.summary.approved} conformes/finalizados`,11,bold);
  text(`${model.items.length} registros neste relatório  |  ${model.summary.pendingItems} pendências no pavimento/filtro de apartamentos`);
  if(model.tipo==='finalizacao') {y-=8;text(model.summary.conclusion,12,bold,model.summary.notApproved?red:ink);}
  if(model.filters.status)text('Status filtrado: '+(ITEM_STATUS[model.filters.status]||model.filters.status));
  if(model.filters.responsavel)text('Responsável filtrado: '+model.filters.responsavel);
  y-=8;text('Situação dos apartamentos',12,bold);
  for(const apt of model.apartments) {
    const status=apt.status;
    const rows=model.items.filter(i=>i.apartamento_id===apt.id);
    text(`${apt.pavimento} · Apto ${apt.apartamento} — ${APT_STATUS[status]||status}${!rows.length?' · Sem registros neste relatório':''}`,10);
  }
  if(!model.items.length)text('Não há registros fotográficos para os filtros selecionados.',11);
  let count=0;
  for(const apt of model.apartments) {
    for(const item of model.items.filter(i=>i.apartamento_id===apt.id)) {
      progress(`Preparando registro ${++count} de ${model.items.length}…`);
      addPage(`${apt.pavimento} · Apartamento ${apt.apartamento}`);
      text(`${item.ambiente} / ${item.servico}`,15,bold);
      text(`Status: ${ITEM_STATUS[item.status]||item.status} · Prioridade: ${item.prioridade||'normal'}`,11,bold);
      text(`Responsável: ${item.responsavel||'Não informado'}`);
      text(`Vistoria: ${dateTime(item.data_vistoria||item.created_at)} · Atualização: ${dateTime(item.updated_at)}`,9,normal,muted);
      if(item.data_correcao)text('Correção: '+dateTime(item.data_correcao),9,normal,muted);
      text(item.observacao||'Sem observação.');y-=12;
      if(y<350)addPage(`${apt.pavimento} · Apto ${apt.apartamento} · Fotos`);
      const boxW=(C-14)/2,boxH=Math.min(310,y-75),top=y;
      for(const [index,kind] of ['antes','depois'].entries()) {
        const x=M+index*(boxW+14);
        page.drawText(kind==='antes'?'ANTES / SITUAÇÃO ENCONTRADA':'DEPOIS / CORREÇÃO',{x,y:top,font:bold,size:9,color:muted});
        const path=item[`foto_${kind}_path`],legacy=item[`foto_${kind}_data`];
        page.drawRectangle({x,y:top-16-boxH,width:boxW,height:boxH,color:pale});
        if(path||legacy) {
          let blob;
          try {blob=await loadPhoto(item,kind);} catch {throw new Error(`Não foi possível carregar a foto ${kind} do apto ${apt.apartamento}. O PDF não foi gerado; tente novamente.`);}
          if(!blob?.size)throw new Error(`Foto ${kind} do apto ${apt.apartamento} indisponível. Tente novamente.`);
          const bytes=new Uint8Array(await blob.arrayBuffer());
          let img;
          try {img=bytes[0]===137?await doc.embedPng(bytes):await doc.embedJpg(bytes);}catch{throw new Error(`A foto ${kind} do apto ${apt.apartamento} precisa ser substituída por JPEG/PNG.`);}
          const scale=Math.min(boxW/img.width,boxH/img.height);const w=img.width*scale,h=img.height*scale;
          page.drawImage(img,{x:x+(boxW-w)/2,y:top-16-boxH+(boxH-h)/2,width:w,height:h});
        } else page.drawText(kind==='antes'?'Sem foto antes':'Ainda sem foto depois',{x:x+13,y:top-45,font:normal,size:10,color:muted});
      }
    }
  }
  const pages=doc.getPages();pages.forEach((p,i)=>{p.drawText(`Página ${i+1} de ${pages.length}`,{x:W-M-80,y:25,font:normal,size:9,color:muted});p.drawText('Pente Fino · Uso privado',{x:M,y:25,font:normal,size:9,color:muted});});
  const bytes=await doc.save();return new Blob([bytes],{type:'application/pdf'});
}
export const pdfFilename = title => title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100)+'.pdf';
export function downloadPdf(blob,name) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);
}
export function sharePdf(blob,name) {
  const file=new File([blob],name,{type:'application/pdf'});
  // Call from the user's tap, with the already prepared Blob: no fetch/await
  // before invoking share, because Safari's user activation would expire.
  if(navigator.share && navigator.canShare?.({files:[file]}))return navigator.share({files:[file],title:name});
  downloadPdf(blob,name);return Promise.resolve();
}
