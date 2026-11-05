import {loadHadithCatalog,queryHadiths,describeHadith,hadithFilters} from '../../server/hadithCatalog.mjs';
export async function handler(event){
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
 const respond=(statusCode,data)=>({statusCode,headers,body:JSON.stringify(data)});
 if(event.httpMethod!=='GET')return respond(405,{error:'استخدم طلب قراءة للمكتبة.'});
 const p=event.queryStringParameters||{};const action=p.action||'search';
 if(!['search','read','status'].includes(action))return respond(400,{error:'الطلب غير معروف.'});
 const q=p.q||'';const filter=p.filter||'all';const page=Number(p.page||1);
 if(q.length>200||!hadithFilters.includes(filter)||!Number.isInteger(page)||page<1||page>10000)return respond(400,{error:'تحقق من عبارة البحث والفلاتر ورقم الصفحة.'});
 try{
  const catalog=await loadHadithCatalog();
  if(p.book&&!catalog.collections.some(c=>c.id===p.book))return respond(400,{error:'مصدر الحديث غير معروف.'});
  if(action==='read'){
   const record=catalog.records.find(r=>r.id===p.id);
   return record?respond(200,{hadith:describeHadith(catalog,record,{full:true})}):respond(404,{error:'هذا السجل غير موجود في المكتبة المحلية.'});
  }
  const metadata={stats:catalog.stats,collections:catalog.collections,retrievedAt:catalog.retrievedAt,sources:catalog.sources};
  if(action==='status')return respond(200,metadata);
  const results=queryHadiths(catalog,{q,filter,book:p.book||'',page});
  return respond(200,{...metadata,...results,items:results.items.map(r=>describeHadith(catalog,r,{q}))});
 }catch{return respond(503,{error:'تعذّر تجهيز مكتبة الأحاديث المحلية. أعد المحاولة بعد لحظات.'});}
}
