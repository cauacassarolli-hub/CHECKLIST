import { ITEM_STATUS } from './domain.js';

export const EXCEL_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const EXCEL_COLUMNS=Object.freeze([
  ['id','ID',37],['obra','Obra',28],['torre','Torre',15],['pavimento','Pavimento',16],
  ['apartamento','Apartamento',18],['ambiente','Ambiente',22],['servico','Serviço',25],
  ['titulo','Título',36],['descricao','Descrição',55],['status','Status',19],
  ['created_at','Data de abertura',22],['criado_por_nome','Registrado por',26],
  ['data_correcao','Data de resolução',22],['resolvido_por_nome','Resolvido por',26],
  ['responsavel','Responsável',26],['prioridade','Prioridade',18],
  ['prazo','Prazo',17],['data_vistoria','Data da vistoria',20]
]);
const encoder=new TextEncoder();
const xmlText=value=>String(value??'')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const tag=(name,body,attrs='')=>'<'+name+(attrs?' '+attrs:'')+'>'+body+'</'+name+'>';
const cellRef=(col,row)=>{
  let label='',n=col+1;
  while(n){n--;label=String.fromCharCode(65+n%26)+label;n=Math.floor(n/26);}
  return label+row;
};
const textCell=(value,col,row,header=false)=>{
  // Always inlineStr: an observation beginning with "=" is never evaluated as a formula.
  return '<c r="'+cellRef(col,row)+'" s="'+(header?1:0)+'" t="inlineStr"><is><t xml:space="preserve">'+xmlText(value)+'</t></is></c>';
};
const numberCell=(value,col,row)=>'<c r="'+cellRef(col,row)+'" t="n"><v>'+value+'</v></c>';
const nonnegativeInteger=(value,label)=>{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)
    throw new Error('Contagem inválida no resumo do Fiscal: '+label+'.');
  return value;
};
const dateDisplay=value=>{
  if(!value)return '';
  const raw=String(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw.slice(8,10)+'/'+raw.slice(5,7)+'/'+raw.slice(0,4);
  const d=new Date(raw);
  if(!Number.isFinite(d.getTime()))return raw;
  return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
};
const itemValue=(row,key,obra)=>{
  if(key==='obra')return obra?.nome||'';
  if(key==='torre')return row.torre||'';
  if(key==='status')return ITEM_STATUS[row.status]||row.status||'';
  if(['created_at','data_correcao','prazo','data_vistoria'].includes(key))return dateDisplay(row[key]);
  if(key==='descricao')return row.descricao??row.observacao??'';
  return row[key]??'';
};
const sheet=(rows,widths,filter=false,freeze=false)=>{
  const maxCol=cellRef(widths.length-1,1).replace(/\d+$/,'');
  const cols='<cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols>';
  const data='<sheetData>'+rows.map((row,index)=>{
    const r=index+1;
    return '<row r="'+r+'">'+row.map((value,col)=>
      typeof value==='number'?numberCell(value,col,r):textCell(value,col,r,freeze&&index===0)
    ).join('')+'</row>';
  }).join('')+'</sheetData>';
  const views=freeze?'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>':'<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const autoFilter=filter?'<autoFilter ref="A1:'+maxCol+rows.length+'"/>':'';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+tag('worksheet',
    '<dimension ref="A1:'+maxCol+rows.length+'"/>'+views+'<sheetFormatPr defaultRowHeight="16"/>'+cols+data+autoFilter,
    'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
};
// ZIP (store, no compression); no dependency, network request or external service.
const crcTable=Array.from({length:256},(_,n)=>{
  let c=n;for(let i=0;i<8;i++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0;
});
const crc32=bytes=>{
  let crc=0xffffffff;
  for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
};
const zipEntries=entries=>{
  const local=[],central=[];let offset=0,centralSize=0;
  const uint16=(a,p,v)=>{a[p]=v&255;a[p+1]=(v>>>8)&255;};
  const uint32=(a,p,v)=>{uint16(a,p,v);uint16(a,p+2,v>>>16);};
  for(const [path,xml] of entries){
    const name=encoder.encode(path),bytes=encoder.encode(xml),crc=crc32(bytes);
    if(bytes.length>0xffffffff||name.length>0xffff)throw new Error('Arquivo Excel excedeu o limite permitido.');
    const lh=new Uint8Array(30+name.length);
    uint32(lh,0,0x04034b50);uint16(lh,4,20);uint16(lh,6,0x0800);
    uint32(lh,14,crc);uint32(lh,18,bytes.length);uint32(lh,22,bytes.length);
    uint16(lh,26,name.length);lh.set(name,30);
    local.push(lh,bytes);
    const cd=new Uint8Array(46+name.length);
    uint32(cd,0,0x02014b50);uint16(cd,4,20);uint16(cd,6,20);uint16(cd,8,0x0800);
    uint32(cd,16,crc);uint32(cd,20,bytes.length);uint32(cd,24,bytes.length);
    uint16(cd,28,name.length);uint32(cd,42,offset);cd.set(name,46);
    central.push(cd);centralSize+=cd.length;offset+=lh.length+bytes.length;
  }
  if(entries.length>0xffff||offset+centralSize>0xffffffff)throw new Error('Arquivo Excel excedeu o limite ZIP.');
  const end=new Uint8Array(22);
  uint32(end,0,0x06054b50);uint16(end,8,entries.length);uint16(end,10,entries.length);
  uint32(end,12,centralSize);uint32(end,16,offset);
  const result=new Uint8Array(offset+centralSize+end.length);
  let pos=0;for(const chunk of [...local,...central,end]){result.set(chunk,pos);pos+=chunk.length;}
  return result;
};
const baseTypes='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  +'<Default Extension="xml" ContentType="application/xml"/>'
  +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
  +'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
  +'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  +'<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  +'</Types>';
const topRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
  +'</Relationships>';
const workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
  +'<sheets><sheet name="Ocorrências" sheetId="1" r:id="rId1"/><sheet name="Resumo" sheetId="2" r:id="rId2"/></sheets></workbook>';
const workbookRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
  +'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
  +'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  +'</Relationships>';
const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  +'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  +'<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>'
  +'<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF22486A"/><bgColor indexed="64"/></patternFill></fill></fills>'
  +'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  +'<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
  +'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
export function buildFiscalExcel(obra,result){
  if(!obra?.id||!result||result.acao!=='CONSULTAR_OCORRENCIAS'||!Array.isArray(result.ocorrencias)||!result.resumo)
    throw new Error('Consulte as ocorrências antes de exportar o Excel.');
  const occurrences=result.ocorrencias;
  if(occurrences.length>25000)throw new Error('Consulta muito grande. Refine os filtros antes de exportar.');
  const summary=result.resumo;
  const metrics=[
    ['Total de ocorrências','total'],['Abertas','abertas'],['Pendentes','pendentes'],
    ['Em correção','em_correcao'],['Corrigidas','corrigidas'],['Conformes','conformes']
  ];
  const counts=metrics.map(([label,key])=>[label,nonnegativeInteger(summary[key],key)]);
  if(counts[0][1]!==occurrences.length)
    throw new Error('Contagem da consulta não confere com a lista recebida. Consulte novamente.');
  const rows=[EXCEL_COLUMNS.map(col=>col[1]),
    ...occurrences.map(row=>EXCEL_COLUMNS.map(col=>itemValue(row,col[0],obra)))];
  const filters=result.filtros||{};
  const summaryRows=[
    ['FISCAL DE QUALIDADE — RESUMO',''],
    ['Obra',obra.nome||''],
    ['Gerado em',dateDisplay(new Date().toISOString())],
    ['Pavimento',filters.pavimento||'Todos'],
    ['Apartamento',filters.apartamento||'Todos'],
    ['Serviço',filters.servico||'Todos'],
    ['Ambiente',filters.ambiente||'Todos'],
    ['Status',filters.status==='abertas'?'Abertas (pendentes e em correção)':ITEM_STATUS[filters.status]||filters.status||'Todos'],
    ['',''],...counts,['',''],['SERVIÇOS','Ocorrências abertas']
  ];
  if(!Array.isArray(summary.servicos))throw new Error('Ranking de serviços não informado pela consulta.');
  for(const service of summary.servicos){
    summaryRows.push([service.servico||'Sem serviço',nonnegativeInteger(service.abertas,'servicos.abertas')]);
  }
  return zipEntries([
    ['[Content_Types].xml',baseTypes],['_rels/.rels',topRels],
    ['xl/workbook.xml',workbook],['xl/_rels/workbook.xml.rels',workbookRels],
    ['xl/styles.xml',styles],
    ['xl/worksheets/sheet1.xml',sheet(rows,EXCEL_COLUMNS.map(x=>x[2]),true,true)],
    ['xl/worksheets/sheet2.xml',sheet(summaryRows,[42,38])]
  ]);
}
export const fiscalExcelFilename=(obra,now=new Date())=>{
  const name=String(obra?.nome||'obra').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,38)||'obra';
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  return 'fiscal-ocorrencias-'+name+'-'+day+'.xlsx';
};
export function downloadFiscalExcel(obra,result){
  const bytes=buildFiscalExcel(obra,result);
  const url=URL.createObjectURL(new Blob([bytes],{type:EXCEL_MIME}));
  const link=document.createElement('a');
  link.href=url;link.download=fiscalExcelFilename(obra);link.hidden=true;
  document.body.append(link);
  try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);}
}
