// Exact, conservative acceptance rules. An authentic chain is not automatically an authentic marfu' text.
export const albaniGrades = new Map([
  ['Sahih','صحيح'],['Sahih Hadith','حديث صحيح'],['Sahih Mutawatir','صحيح متواتر'],
  ['Sahih Lighairihi','صحيح لغيره'],['Hasan Sahih','حسن صحيح'],
]);
export const encGrades = new Set(['صحيح','صحيح لغيره','صحيح بشواهده','صحيح بمجموع طرقه','صحيح بطرقه وشواهده','صحيح على شرط البخاري','صحيح بروايتيه','صحيح بكل رواياته','قال النووي: حديث صحيح']);
export function qualifyingAlbani(grades) {
  return grades.find(grade => grade.name === 'Al-Albani' && albaniGrades.has(grade.grade)) || null;
}
export const collectionTitles = {bukhari:'صحيح البخاري',muslim:'صحيح مسلم',abudawud:'سنن أبي داود',tirmidhi:'جامع الترمذي',nasai:'سنن النسائي',ibnmajah:'سنن ابن ماجه',hadeethenc:'موسوعة الأحاديث النبوية'};
export function parseHadithCsv(text) {
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){if(char==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=char;}
    else if(char==='"' && !field)quoted=true;
    else if(char===','){row.push(field);field='';}
    else if(char==='\n'||char==='\r'){if(char==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}
    else field+=char;
  }
  if(quoted)throw Error('Unterminated CSV field');
  if(field||row.length){row.push(field);rows.push(row);}
  return rows;
}
