const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const d3=require('../vendor/d3.v7.min.js');
const topojson=require('../vendor/topojson-client.v3.min.js');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const context=vm.createContext({d3,topojson,console,window:{},Set,Map,world:JSON.parse(fs.readFileSync(require.resolve('../data/countries-10m.json'))),marine:JSON.parse(fs.readFileSync(require.resolve('../data/marine-50m.geojson')))});
for(const file of ['europe-data.js','asia-data.js','europe-extra-data.js'])vm.runInContext(fs.readFileSync(require.resolve('../'+file),'utf8'),context);
// Exercise the actual production geometry functions, independently of rendering.
vm.runInContext(`
const R=Math.PI/180;
const TARGET_REGIONS=window.MAP_TARGET_REGIONS;
const SMALL_ISLAND_TOLERANCE=window.MAP_SMALL_ISLAND_TOLERANCE;
const targetGeometryCache=new Map(),targetSampleCache=new Map();
let countriesFeature=null,countries=[],byIso=new Map(),marineFeatures=marine.features,landComponents=[];
${source.slice(source.indexOf('const MARINE_ALIASES ='),source.indexOf('const CUSTOM_KEY'))}
${source.slice(source.indexOf('function haversine('),source.indexOf('function setFeedback('))}
${source.slice(source.indexOf('function findCountry('),source.indexOf('/* ---------- drawing answers'))}
countries=topojson.feature(world,world.objects.countries).features.filter(f=>Number(f.id)!==10).map(orientGeoForD3);
countriesFeature={type:'FeatureCollection',features:countries};
byIso=new Map(countries.map(f=>[Number(f.id),f]));
buildLandComponents();
`,context);
const run=code=>vm.runInContext(code,context);
assert.equal(run('isLandPoint(0,55)'),false,'North Sea must not be classified as land');
assert.equal(run('isLandPoint(-10,40)'),false,'Atlantic must not be classified as land');
assert.equal(run('isLandPoint(15.5,49.8)'),true,'Czechia must be classified as land');
assert.equal(run('isLandPoint(73.5,4.18)'),true,'Corrected Maldives must retain their land');
assert.equal(run('countries.every(f=>d3.geoArea(f)<2*Math.PI)'),true,'No country may cover the complement of the world');
for(const [name,lon,lat] of [['Severní moře',3,56],['Černé moře',34,43.2],['Jaderské moře',15,43],['Arabské moře',64,16]]){
  const term=run(`window.MAP_TERMS.find(t=>t.n===${JSON.stringify(name)}&&t.c==='sea')`);
  assert.ok(term,name+' is available');
  context.term=term;
  assert.equal(run(`evaluateTerm(term,${lon},${lat}).ok`),true,name+' accepts water inside its area');
  assert.equal(run('evaluateTerm(term,15.5,49.8).ok'),false,name+' rejects Czech land');
}
context.term=run("window.MAP_TERMS.find(t=>t.n==='Česko'&&t.c==='country')");
assert.equal(run('evaluateTerm(term,15.5,49.8).ok'),true);
assert.equal(run('evaluateTerm(term,3,56).ok'),false);
context.term=run("window.MAP_TERMS.find(t=>t.c==='river'&&t.line)");
assert.equal(run('evaluateTerm(term,...term.line[1]).ok'),true,'River course is accepted');
assert.equal(run('evaluateTerm(term,-25,30).ok'),false,'Remote point is rejected for a river');
console.log('Geometry regression checks passed: land/water, polygon winding, four seas, country, river.');
