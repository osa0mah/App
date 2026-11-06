import curriculum from '../data/tajweed/lessons.json' with {type:'json'};
import quran from '../data/chapters.json' with {type:'json'};
import {normalizeSearch} from './searchText.mjs';
const aliases={intro:['تعريف التجويد','علم التجويد'],makharij:['مخارج الحروف','المخارج'],sifat:['صفات الحروف'],izhar:['الاظهار الحلقي'],'idgham-ghunnah':['الادغام بغنه'],'idgham-no-ghunnah':['الادغام بغير غنه'],iqlab:['الاقلاب'],ikhfa:['الاخفاء الحقيقي'],'meem-ikhfa':['الاخفاء الشفوي'],'meem-idgham':['ادغام الميم','ادغام المثلين الصغير'],'meem-izhar':['الاظهار الشفوي'],ghunnah:['الغنه','الميم والنون المشددتين'], 'lam-qamari':['اللام القمريه'],'lam-shamsi':['اللام الشمسيه'],'madd-natural':['المد الطبيعي'],'madd-badal':['مد البدل'],'madd-iwad':['مد العوض'],'madd-connected':['المد المتصل'],'madd-separated':['المد المنفصل'],'madd-silah-small':['الصله الصغري'],'madd-silah-big':['الصله الكبري'],'madd-arid':['المد العارض','العارض للسكون'],'madd-lazim':['المد اللازم'],'madd-leen':['مد اللين'],tafkheem:['التفخيم والترقيق','التفخيم'], 'allah-lam':['لفظ الجلاله','لام الله'],raa:['حكم الراء','ترقيق الراء','تفخيم الراء'],qalqalah:['القلقله'],waqf:['الوقف والابتداء'],'hamzat-wasl':['همزه الوصل']};
const candidates=Object.entries(aliases).flatMap(([id,terms])=>terms.map(term=>({id,term:normalizeSearch(term)}))).sort((a,b)=>b.term.length-a.term.length);
const matches=(normal,term)=>new RegExp(`(?:^|\\s)${term}(?:\\s|$)`).test(normal);
export function answerTajweed(message){
 const normal=normalizeSearch(message);
 if(/ابن باز|عثيمين|فوزان|فتوي|فتاوي/.test(normal))return null;
 if(/يجوز|حرام|حلال|بدون تجويد|بغير تجويد/.test(normal))return null;
 const matched=candidates.find(item=>matches(normal,item.term));
 const broad=/تجويد|(?:^|\s)(?:الاظهار|الادغام|الاخفاء|المدود|التنوين)(?:\s|$)|النون الساكنه|الميم الساكنه|مد الصله/.test(normal);
 if(!matched&&!broad)return null;
 if(matched){
  const lesson=curriculum.lessons.find(item=>item.id===matched.id);
  const example=lesson.examples[0];
  return {mode:'source',text:`${lesson.title}\n${lesson.summary}\n\nكيفية التطبيق:\n${lesson.steps.map(step=>'• '+step).join('\n')}\n\nمثال — سورة ${quran.chapters[example.chapter-1].name}، الآية ${example.verse} (${example.context}):\n﴿${example.focus}﴾\n${example.explanation}\n\nانتبه: ${lesson.commonMistake}\n\nهذا تلخيص تعليمي من إعداد أثر القرآن، وليس نصًا منسوبًا إلى المعلّمين. التطبيق الصوتي متاح في الدرس بحسب المقاطع المرتبطة.`,source:{title:'مرجع أبواب التجويد: تحفة الأطفال والجزرية؛ الصياغة التعليمية لأثر القرآن',url:curriculum.references[0].url},suggestion:{section:'التجويد',lessonId:lesson.id}};
 }
 let ids;
 if(/الادغام/.test(normal))ids=['idgham-ghunnah','idgham-no-ghunnah','meem-idgham'];
 else if(/الاظهار/.test(normal))ids=['izhar','meem-izhar'];
 else if(/الاخفاء/.test(normal))ids=['ikhfa','meem-ikhfa'];
 else if(/مد الصله/.test(normal))ids=['madd-silah-small','madd-silah-big'];
 else if(/النون الساكنه|التنوين/.test(normal))ids=['izhar','idgham-ghunnah','idgham-no-ghunnah','iqlab','ikhfa'];
 else if(/الميم الساكنه/.test(normal))ids=['meem-ikhfa','meem-idgham','meem-izhar'];
 else if(/المدود/.test(normal))ids=curriculum.lessons.filter(lesson=>lesson.group==='madd').map(lesson=>lesson.id);
 else ids=['intro','makharij','izhar'];
 return {mode:'source',text:'أي باب أو حكم تريد تعلّمه؟ قسم التجويد يضم شرحًا مكتوبًا وأمثلة ومقاطع، وفق دروس أساسية لحفص عن عاصم. اختر الدرس لتحديد القاعدة دون الخلط بين الأحكام.',suggestion:{section:'التجويد'},choices:ids.map(id=>{const lesson=curriculum.lessons.find(item=>item.id===id);return{label:lesson.title,message:`اشرح في التجويد ${lesson.title}`};})};
}
