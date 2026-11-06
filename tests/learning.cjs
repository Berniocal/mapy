const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const d3=require('../vendor/d3.v7.min.js');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const ctx=vm.createContext({d3,window:{},Set,Map});
for(const file of ['europe-data.js','asia-data.js','europe-extra-data.js'])vm.runInContext(fs.readFileSync(require.resolve('../'+file),'utf8'),ctx);
vm.runInContext(`
const R=Math.PI/180;
${source.slice(source.indexOf('function haversine('),source.indexOf('function setFeedback('))}
let selection=[];
const selectedTerms=()=>selection;
const projection=d3.geoMercator().scale(500).translate([500,400]);
const screenPoint=(lon,lat)=>projection([lon,lat]);
const findCountry=()=>({type:'Feature',geometry:{type:'Polygon',coordinates:[[[10,45],[10,55],[20,55],[20,45],[10,45]]]}});
const insideCoreTarget=()=>false;
${source.slice(source.indexOf('function nearestLearnTerm('),source.indexOf('/* ---------- settings'))}
const city=window.MAP_TERMS.find(t=>t.n==='Vídeň'&&t.c==='capital');
const river=window.MAP_TERMS.find(t=>t.n==='Dunaj'&&t.c==='river');
const country=window.MAP_TERMS.find(t=>t.n==='Rakousko'&&t.c==='country');
selection=[country,river,city];
`,ctx);
const run=code=>vm.runInContext(code,ctx);
assert.equal(run('nearestLearnTerm(city.lon,city.lat).id===city.id'),true,'Capital marker must win over the river and country below it');
assert.equal(run('nearestLearnTerm(city.lon+.03,city.lat-.02).id===city.id'),true,'Capital remains clickable near its marker');
run('selection=[river]');
assert.equal(run('nearestLearnTerm(...river.line[1]).id===river.id'),true,'Selected river is clickable along its course');
run('selection=[]');
assert.equal(run('nearestLearnTerm(city.lon,city.lat)'),null,'Unchecked terms must not be clickable');
assert.equal(run('nearestLearnTerm(0,0)'),null,'Empty map does not select a remote term');
console.log('Learning checks passed: capital/river priority, selected river, unchecked terms.');
