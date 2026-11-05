import {normalizeHadithQuery,loadHadithCatalog,queryHadiths,describeHadith} from './hadithCatalog.mjs';
const intent=text=>/(?:^|\s)(?:حديث|الحديث|احاديث|الاحاديث|الالباني|الباني)(?:\s|$)/.test(normalizeHadithQuery(text));
const stop=new Set('ابغي ابغى ابي اريد احتاج اعرف عطيني اعطني هات ابحث اذكر اذكرلي لي عن في من ما هو هل فضل نص حديث الحديث احاديث الاحاديث صحه صحيح صححه صححها صححهم صحح الالباني الباني البخاري بخاري مسلم متفق عليه رواه ورواه عند اريدك ممكن'.split(' '));
function subject(text){return normalizeHadithQuery(text).split(' ').filter(word=>!stop.has(word)).join(' ');}
export async function answerHadithQuestion(message,history=[]){
 if(!intent(message))return null;
 const normal=normalizeHadithQuery(message);let query=subject(message);
 if(!query){const prior=[...history].reverse().find(item=>item.role==='user'&&intent(item.content)&&subject(item.content));if(prior&&/الالباني|البخاري|مسلم|متفق/.test(normal))query=subject(prior.content);}
 const target={section:'الأحاديث',query};
 if(!query)return {mode:'source',text:'اكتب كلمات من الحديث أو موضوعه لأبحث في المكتبة وأعرض النص والتخريج والحكم هنا. يمكنك تحديد «صححه الألباني» أو «متفق عليه».',suggestion:target};
 const filter=/الباني/.test(normal)?'albani':/متفق عليه/.test(normal)?'muttafaq':'all';
 const book=/البخاري|بخاري/.test(normal)?'bukhari':/(?:^|\s)مسلم(?:\s|$)/.test(normal)?'muslim':'';
 const catalog=await loadHadithCatalog();const result=queryHadiths(catalog,{q:query,filter,book,limit:2});
 if(!result.items.length)return {mode:'source',text:'لم أجد رواية مطابقة لهذه الكلمات في المكتبة والفلاتر المتاحة. هذا لا يعني أن الحديث ضعيف أو غير موجود؛ جرّب كتابة جزء أدق من نصه.',suggestion:target};
 const rows=result.items.map(record=>describeHadith(catalog,record,{full:true}));
 const text=rows.map(row=>{const quote=row.text.length>3500?row.text.slice(0,3500)+'\n(مقتطف؛ النص الكامل داخل قسم الأحاديث)':row.text;return `وجدت هذه الرواية المرتبطة بسؤالك في ${row.collectionTitle}:\n\n${quote}\n\nالتخريج: ${row.attribution}\nالحكم كما ورد في المصدر: ${row.gradedBy} — ${row.grade}${row.muttafaq?'\nالتخريج في الموسوعة: متفق عليه':''}`;}).join('\n\n────────\n\n');
 return {mode:'source',text,sources:rows.map(row=>({kind:'hadith',title:`${row.sourceName} · ${row.collectionTitle} · ${row.numberLabel} ${row.number}`,url:row.sourceUrl,actionLabel:'فتح الحديث والتخريج',suggestion:{...target,hadithId:row.id}}))};
}
