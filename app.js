(() => {
"use strict";

const TERMS = window.MAP_TERMS || [];
const TARGET_REGIONS = window.MAP_TARGET_REGIONS || {};
const SMALL_ISLAND_TOLERANCE = window.MAP_SMALL_ISLAND_TOLERANCE || new Set();

const $ = id => document.getElementById(id);
const R = Math.PI / 180;

const CAT_NAMES = {
  country:"Státy",
  capital:"Hlavní města",
  river:"Řeky",
  mountain:"Pohoří a vysočiny",
  sea:"Moře, zálivy a průlivy",
  pen:"Poloostrovy",
  isl:"Ostrovy a souostroví",
  lake:"Jezera",
  des:"Pouště",
  low:"Nížiny"
};
const CAT_ORDER = ["country","capital","river","mountain","sea","pen","isl","lake","des","low"];
const categoryKey = t => t.c === "mnt" ? "mountain" : t.c;
const termLevel = t => Number(t.level || 1);

const MARINE_ALIASES = {
  "Středozemní moře":["Mediterranean Sea"],
  "Barentsovo moře":["Barents Sea"],
  "Norské moře":["Norwegian Sea"],
  "Bílé moře":["White Sea"],
  "Irské moře":["Irish Sea"],
  "Severní moře":["North Sea"],
  "Azovské moře":["Sea of Azov","Azov Sea"],
  "Černé moře":["Black Sea"],
  "Marmarské moře":["Sea of Marmara","Marmara Sea"],
  "Egejské moře":["Aegean Sea"],
  "Jónské moře":["Ionian Sea"],
  "Jaderské moře":["Adriatic Sea"],
  "Tyrhénské moře":["Tyrrhenian Sea"],
  "Ligurské moře":["Ligurian Sea"],
  "Baltské moře":["Baltic Sea"],
  "Botnický záliv":["Gulf of Bothnia"],
  "Finský záliv":["Gulf of Finland"],
  "Biskajský záliv":["Bay of Biscay"],
  "Lví záliv":["Gulf of Lion","Gulf of Lyons"],
  "Gibraltarský průliv":["Strait of Gibraltar"],
  "Bospor":["Bosporus","Bosphorus"],
  "Dardanely":["Dardanelles"],
  "Lamanšský průliv":["English Channel"],
  "Kattegat":["Kattegat"],
  "Øresund":["Oresund","Øresund","The Sound"],
  "Aralské moře":["Aral Sea"],
  "Kaspické moře":["Caspian Sea"],
  "Východočínské moře":["East China Sea"],
  "Celebeské moře":["Celebes Sea"],
  "Beringovo moře":["Bering Sea"],
  "Ochotské moře":["Sea of Okhotsk","Okhotsk Sea"],
  "Japonské moře":["Sea of Japan","Japan Sea"],
  "Žluté moře":["Yellow Sea"],
  "Východosibiřské moře":["East Siberian Sea"],
  "Filipínské moře":["Philippine Sea"],
  "Jihočínské moře":["South China Sea"],
  "Andamanské moře":["Andaman Sea"],
  "Arabské moře":["Arabian Sea"],
  "Rudé moře":["Red Sea"],
  "Beringův průliv":["Bering Strait"],
  "Malacký průliv":["Strait of Malacca","Malacca Strait"],
  "Bab-al-Mandab":["Bab el Mandeb","Bab-el-Mandeb","Bab al Mandab"],
  "Kerčský průliv":["Kerch Strait"],
  "Hormuzský průliv":["Strait of Hormuz","Hormuz Strait"],
  "Obský záliv":["Gulf of Ob","Ob Bay"],
  "Bengálský záliv":["Bay of Bengal"],
  "Ománský záliv":["Gulf of Oman"],
  "Perský záliv":["Persian Gulf"],
  "Adenský záliv":["Gulf of Aden"]
};

const CUSTOM_KEY = "slepeMapyCustomTermsV3";
function normalizeCustomTerms(arr){
  if(!Array.isArray(arr)) return [];
  return arr.filter(t =>
    t && typeof t.n === "string" &&
    ["pen","isl","sea","des","low","mnt"].includes(t.c) &&
    Number.isFinite(+t.lat) && Number.isFinite(+t.lon) && Number.isFinite(+t.r)
  ).map(t => ({
    id:t.id || ("custom-"+Date.now()+"-"+Math.random().toString(36).slice(2)),
    n:t.n.trim(), c:t.c, lat:+t.lat, lon:+t.lon, r:+t.r,
    ct:t.ct === "asia" ? "asia" : "eu", level:1, custom:true
  }));
}
let embeddedTerms = [];
try { embeddedTerms = normalizeCustomTerms(JSON.parse($("embeddedCustomTerms")?.textContent || "[]")); } catch(e){}
let storedTerms = [];
try { storedTerms = normalizeCustomTerms(JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]")); } catch(e){}
const customById = new Map();
for(const t of embeddedTerms) customById.set(t.id,t);
for(const t of storedTerms) customById.set(t.id,t);
let customTerms = [...customById.values()];
const saveCustomTerms = () => localStorage.setItem(CUSTOM_KEY,JSON.stringify(customTerms));
const allTerms = () => TERMS.concat(customTerms);

let currentContinent = "eu";
let settingMode = "quiz";
let currentLevel = 1;
let activeMode = "settings";
let ready = false;
let addMode = false;
let pendingPosition = null;
let quizSession = null;
let selectedLearn = null;
let lastDisplay = null;
let showRivers = false;
const selectionState = {eu:null, asia:null};

let countriesFeature = null;
let countries = [];
let byIso = new Map();
let marineFeatures = [];
let landComponents = [];

const targetGeometryCache = new Map();
const targetSampleCache = new Map();
const mapCache = new Map();

const svg = d3.select("#mapSvg");
const defs = svg.append("defs");
const landClip = defs.append("clipPath").attr("id","landClip").attr("clipPathUnits","userSpaceOnUse");
const mapLayer = svg.append("g");
const answerWaterLayer = mapLayer.append("g");
const baseLayer = mapLayer.append("g");
const riverGuideLayer = mapLayer.append("g");
const answerLandLayer = mapLayer.append("g");
const answerLineLayer = mapLayer.append("g");
const screenLayer = svg.append("g");

let projection = d3.geoMercator();
let path = d3.geoPath(projection);
let currentTransform = d3.zoomIdentity;
let currentMapCache = null;

/* ---------- utility ---------- */
function haversine(lat1,lon1,lat2,lon2){
  const p1=lat1*R,p2=lat2*R,dp=(lat2-lat1)*R,dl=(lon2-lon1)*R;
  const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 12742.0176*Math.asin(Math.min(1,Math.sqrt(a)));
}
function fmtKm(k){
  if(!Number.isFinite(k)) return "";
  return k < 10 ? k.toFixed(1).replace(".",",")+" km" : Math.round(k).toLocaleString("cs-CZ")+" km";
}
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
function ringSignedArea(coords){
  let a=0;
  for(let i=0;i<coords.length-1;i++){
    const [x1,y1]=coords[i],[x2,y2]=coords[i+1];
    a += x1*y2-x2*y1;
  }
  return a/2;
}
function normalizedRing(coords){
  const ring=coords.map(p=>[+p[0],+p[1]]);
  if(ring.length && (ring[0][0]!==ring[ring.length-1][0] || ring[0][1]!==ring[ring.length-1][1])) ring.push([...ring[0]]);
  if(ringSignedArea(ring)>0) ring.reverse();
  return ring;
}
function pointInRing(lon,lat,coords){
  let inside=false;
  for(let i=0,j=coords.length-1;i<coords.length;j=i++){
    const xi=coords[i][0],yi=coords[i][1],xj=coords[j][0],yj=coords[j][1];
    const hit=((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi);
    if(hit) inside=!inside;
  }
  return inside;
}
const geoPolygon = coords => ({type:"Polygon",coordinates:[normalizedRing(coords)]});
const geoCircleKm = (lon,lat,rKm) => d3.geoCircle().center([lon,lat]).radius(rKm/111.195).precision(3)();

function distanceToLine(lat,lon,coords){
  return nearestPointOnLine(lat,lon,coords).km;
}
function nearestPointOnLine(lat,lon,coords){
  const cos=Math.cos(lat*R);
  let best=Infinity,bestPoint=[lon,lat];
  for(let i=0;i<coords.length-1;i++){
    const [x1,y1]=coords[i],[x2,y2]=coords[i+1];
    const ax=x1*cos,ay=y1,bx=x2*cos,by=y2,px=lon*cos,py=lat;
    const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
    const f=den?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/den)):0;
    const qx=ax+f*dx,qy=ay+f*dy;
    const d=Math.hypot(px-qx,py-qy)*111.195;
    if(d<best){
      best=d;
      bestPoint=[cos?qx/cos:x1,qy];
    }
  }
  return {lon:bestPoint[0],lat:bestPoint[1],km:best};
}
function setFeedback(kind,text){
  const el=$("feedback");
  el.className="feedback"+(kind?" "+kind:"");
  el.textContent=text||"";
}
function clearFeedback(){ setFeedback("",""); }

/* ---------- projection / base map ---------- */
function boundsFor(ct){
  return ct==="asia"
    ? {minLon:20,maxLon:179.2,minLat:-12,maxLat:82}
    : {minLon:-32,maxLon:65,minLat:29,maxLat:75};
}
function projectionFor(ct,w,h){
  const b=boundsFor(ct),rad=Math.PI/180;
  const my=lat=>Math.log(Math.tan(Math.PI/4+(lat*rad)/2));
  const imy=y=>(2*Math.atan(Math.exp(y))-Math.PI/2)/rad;
  const y1=my(b.minLat),y2=my(b.maxLat),pad=10;
  const scale=Math.min((w-2*pad)/((b.maxLon-b.minLon)*rad),(h-2*pad)/Math.abs(y2-y1));
  return d3.geoMercator()
    .center([(b.minLon+b.maxLon)/2,imy((y1+y2)/2)])
    .translate([w/2,h/2]).scale(scale).clipExtent([[0,0],[w,h]]);
}
function cacheKey(ct,w,h){ return `${ct}:${w}x${h}`; }
function buildMapCache(ct,w,h){
  const key=cacheKey(ct,w,h);
  if(mapCache.has(key)) return mapCache.get(key);
  const proj=projectionFor(ct,w,h),gp=d3.geoPath(proj);
  const items=[];
  for(const f of countries){
    const d=gp(f);
    if(d) items.push({f,d});
  }
  const value={projection:proj,path:gp,countryItems:items,landPath:gp(countriesFeature)};
  mapCache.set(key,value);
  return value;
}
function prepareMapCaches(){
  if(!countriesFeature) return;
  const box=$("mapWrap"),w=Math.max(320,box.clientWidth),h=Math.max(320,box.clientHeight);
  buildMapCache("eu",w,h);
  setLoadingTarget(89);
  buildMapCache("asia",w,h);
  setLoadingTarget(96);
}
function sizeMap(){
  if(!countriesFeature) return;
  const box=$("mapWrap"),w=Math.max(320,box.clientWidth),h=Math.max(320,box.clientHeight);
  svg.attr("viewBox",`0 0 ${w} ${h}`);
  currentMapCache=buildMapCache(currentContinent,w,h);
  projection=currentMapCache.projection;
  path=currentMapCache.path;
  drawBase();
  drawRiverGuide();
  if(lastDisplay) renderDisplay(lastDisplay.t,lastDisplay.answer,lastDisplay.learn,true);
}
function drawBase(){
  baseLayer.selectAll("*").remove();
  const g=baseLayer.append("g");
  g.selectAll("path.country")
    .data(currentMapCache.countryItems,d=>d.f.id)
    .join("path").attr("class","country").attr("d",d=>d.d);
  g.append("path").attr("class","coast").attr("d",currentMapCache.landPath||"");
  landClip.selectAll("*").remove();
  landClip.append("path").attr("d",currentMapCache.landPath||"");
}
function findCountry(t){ return byIso.get(Number(t.iso)); }
function countryAt(lon,lat){
  const items=currentMapCache?.countryItems||[];
  for(const item of items) if(d3.geoContains(item.f,[lon,lat])) return item.f;
  return null;
}
function isLandPoint(lon,lat){ return !!countriesFeature && d3.geoContains(countriesFeature,[lon,lat]); }

/* ---------- target geometry ---------- */
function buildLandComponents(){
  landComponents=[];
  for(const f of countries){
    const g=f.geometry;if(!g)continue;
    if(g.type==="Polygon"){
      const part={type:"Feature",properties:{id:f.id},geometry:g};
      landComponents.push({feature:part,centroid:d3.geoCentroid(part)});
    }else if(g.type==="MultiPolygon"){
      for(const poly of g.coordinates||[]){
        const part={type:"Feature",properties:{id:f.id},geometry:{type:"Polygon",coordinates:poly}};
        landComponents.push({feature:part,centroid:d3.geoCentroid(part)});
      }
    }
  }
}
function islandGeometryInsideRegion(region){
  const hits=[];
  for(const item of landComponents){
    const c=item.centroid;
    if(Number.isFinite(c?.[0])&&Number.isFinite(c?.[1])&&d3.geoContains(region,c)) hits.push(item.feature);
  }
  return hits.length?{type:"FeatureCollection",features:hits}:null;
}
function normName(v){
  return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function marineNames(f){
  const p=f?.properties||{};
  return [p.name,p.NAME,p.name_en,p.NAME_EN,p.namealt,p.NAMEALT,p.note,p.NOTE].filter(Boolean).map(normName);
}
function orientGeoForD3(feature){
  if(!feature?.geometry) return feature;
  const f=JSON.parse(JSON.stringify(feature));
  const fix=coords=>{
    const probe={type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:coords}};
    return d3.geoArea(probe)>2*Math.PI ? coords.map(r=>[...r].reverse()) : coords;
  };
  if(f.geometry.type==="Polygon") f.geometry.coordinates=fix(f.geometry.coordinates);
  else if(f.geometry.type==="MultiPolygon") f.geometry.coordinates=f.geometry.coordinates.map(fix);
  return f;
}
function naturalMarineGeometry(t){
  const aliases=(MARINE_ALIASES[t.n]||[]).map(normName);
  if(!aliases.length||!marineFeatures.length) return null;
  const hits=marineFeatures.filter(f=>{
    const names=marineNames(f);
    return aliases.some(a=>names.includes(a));
  });
  if(!hits.length) return null;
  const oriented=hits.map(orientGeoForD3);
  return oriented.length===1?oriented[0]:{type:"FeatureCollection",features:oriented};
}
function targetInfo(t){
  const key=t.id||t.n;
  if(targetGeometryCache.has(key)) return targetGeometryCache.get(key);
  let info;
  if(t.custom){
    info={geometry:geoCircleKm(t.lon,t.lat,t.r),source:"custom",mode:t.c};
  }else if(t.c==="sea"){
    const marine=naturalMarineGeometry(t);
    if(marine) info={geometry:marine,region:marine,source:"marine",mode:"marine"};
  }
  if(!info){
    const spec=TARGET_REGIONS[t.n];
    if(spec){
      const region=geoPolygon(spec.coords);
      if(t.c==="isl"){
        const islands=islandGeometryInsideRegion(region);
        info=islands
          ? {geometry:islands,region,source:"island-components",mode:spec.mode||t.c}
          : {geometry:region,region,source:"manual",mode:spec.mode||t.c};
      }else{
        info={geometry:region,region,source:"manual",mode:spec.mode||t.c};
      }
    }else{
      const region=geoCircleKm(t.lon,t.lat,Math.max(10,t.r||80));
      if(t.c==="isl"){
        const islands=islandGeometryInsideRegion(region);
        info=islands
          ? {geometry:islands,region,source:"island-components",mode:t.c}
          : {geometry:region,region,source:"fallback",mode:t.c};
      }else{
        info={geometry:region,region,source:"fallback",mode:t.c};
      }
    }
  }
  targetGeometryCache.set(key,info);
  return info;
}
function insideCoreTarget(t,lon,lat){
  const info=targetInfo(t);
  if(t.custom) return d3.geoContains(info.geometry,[lon,lat]);
  if(t.c==="pen"){
    const spec=TARGET_REGIONS[t.n];
    const inside=spec?pointInRing(lon,lat,spec.coords):d3.geoContains(info.geometry,[lon,lat]);
    return inside&&isLandPoint(lon,lat);
  }
  if(t.c==="isl"){
    if(info.source==="island-components") return d3.geoContains(info.geometry,[lon,lat]);
    return d3.geoContains(info.geometry,[lon,lat])&&isLandPoint(lon,lat);
  }
  if(t.c==="sea"){
    if(info.source==="marine") return d3.geoContains(info.geometry,[lon,lat])&&!isLandPoint(lon,lat);
    const spec=TARGET_REGIONS[t.n];
    const inside=spec?pointInRing(lon,lat,spec.coords):d3.geoContains(info.geometry,[lon,lat]);
    if(!inside) return false;
    if(info.mode==="narrow") return true;
    return !isLandPoint(lon,lat);
  }
  return d3.geoContains(info.geometry,[lon,lat]);
}
function acceptedArea(t,lon,lat){
  const core=insideCoreTarget(t,lon,lat);
  if(core) return {ok:true,insideCore:true};
  if(t.c==="isl"&&SMALL_ISLAND_TOLERANCE.has(t.n)){
    return {ok:haversine(lat,lon,t.lat,t.lon)<=t.r,insideCore:false};
  }
  return {ok:false,insideCore:false};
}
function collectOuterRings(obj,out=[]){
  if(!obj)return out;
  if(obj.type==="FeatureCollection") for(const f of obj.features||[]) collectOuterRings(f,out);
  else if(obj.type==="Feature") collectOuterRings(obj.geometry,out);
  else if(obj.type==="GeometryCollection") for(const g of obj.geometries||[]) collectOuterRings(g,out);
  else if(obj.type==="Polygon"){if(obj.coordinates?.[0])out.push(obj.coordinates[0])}
  else if(obj.type==="MultiPolygon") for(const poly of obj.coordinates||[]) if(poly?.[0]) out.push(poly[0]);
  return out;
}
function densifyRing(ring){
  const out=[];
  for(let i=0;i<ring.length-1;i++){
    const a=ring[i],b=ring[i+1],span=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));
    const n=Math.max(1,Math.min(8,Math.ceil(span/.25)));
    for(let k=0;k<n;k++){const f=k/n;out.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f])}
  }
  if(ring.length)out.push(ring[ring.length-1]);
  return out;
}
function targetBoundarySamples(t){
  const key=t.id||t.n;
  if(targetSampleCache.has(key)) return targetSampleCache.get(key);
  const info=targetInfo(t);
  let rings=[];
  if(info.source==="marine"||info.source==="island-components") rings=collectOuterRings(info.geometry,[]);
  else if(TARGET_REGIONS[t.n]) rings=[normalizedRing(TARGET_REGIONS[t.n].coords)];
  else rings=collectOuterRings(info.geometry,[]);
  let pts=[];for(const r of rings)pts.push(...densifyRing(r));
  if(pts.length>1000){const step=Math.ceil(pts.length/1000);pts=pts.filter((_,i)=>i%step===0)}
  if(!pts.length)pts=[[t.lon,t.lat]];
  targetSampleCache.set(key,pts);
  return pts;
}
function nearestTargetPoint(t,lon,lat){
  if(insideCoreTarget(t,lon,lat)) return {lon,lat,km:0};
  let best=Infinity,bp=[t.lon,t.lat];
  for(const p of targetBoundarySamples(t)){
    const d=haversine(lat,lon,p[1],p[0]);
    if(d<best){best=d;bp=p}
  }
  return {lon:bp[0],lat:bp[1],km:best};
}

/* ---------- evaluation ---------- */
function evaluateTerm(t,lon,lat){
  if(t.c==="country"){
    const f=findCountry(t);
    if(f&&!t.pointCountry) return {ok:d3.geoContains(f,[lon,lat]),dist:haversine(lat,lon,t.lat,t.lon),nearest:{lon:t.lon,lat:t.lat}};
    const d=haversine(lat,lon,t.lat,t.lon);
    return {ok:d<=t.r,dist:d,nearest:{lon:t.lon,lat:t.lat}};
  }
  if(t.line){
    const nearest=nearestPointOnLine(lat,lon,t.line);
    return {ok:nearest.km<=t.r,dist:nearest.km,nearest};
  }
  if(t.c==="capital"||t.c==="lake"){
    const d=haversine(lat,lon,t.lat,t.lon);
    return {ok:d<=t.r,dist:d,nearest:{lon:t.lon,lat:t.lat}};
  }
  const a=acceptedArea(t,lon,lat);
  const nearest=a.insideCore?{lon,lat,km:0}:nearestTargetPoint(t,lon,lat);
  return {ok:a.ok,insideCore:a.insideCore,dist:nearest.km,nearest};
}

/* ---------- drawing answers ---------- */
function clearGeometry(){
  answerWaterLayer.selectAll("*").remove();
  answerLandLayer.selectAll("*").remove();
  answerLineLayer.selectAll("*").remove();
  screenLayer.selectAll("*").remove();
  baseLayer.selectAll(".country").classed("correct-country",false);
}
function clearDisplay(){
  lastDisplay=null;
  clearGeometry();
  clearFeedback();
}
function drawTargetGeometry(t){
  if(t.c==="country"){
    const f=findCountry(t);
    if(f&&!t.pointCountry) baseLayer.selectAll(".country").filter(d=>Number(d.f.id)===Number(t.iso)).classed("correct-country",true);
    else answerLandLayer.append("path").datum(geoCircleKm(t.lon,t.lat,t.r)).attr("class","answer-area").attr("d",path);
    return;
  }
  if(t.line){
    answerLineLayer.append("path").datum({type:"LineString",coordinates:t.line}).attr("class","answer-line-geo").attr("d",path);
    return;
  }
  if(t.c==="capital"||t.c==="lake"){
    answerLandLayer.append("path").datum(geoCircleKm(t.lon,t.lat,t.r)).attr("class","answer-area").attr("d",path);
    return;
  }
  const info=targetInfo(t);
  if(t.c==="isl"&&SMALL_ISLAND_TOLERANCE.has(t.n)){
    answerLandLayer.append("path").datum(geoCircleKm(t.lon,t.lat,t.r)).attr("class","tolerance-area").attr("d",path);
  }
  if(t.c==="sea"){
    answerWaterLayer.append("path").datum(info.geometry).attr("class","answer-area").attr("d",path);
  }else if(t.c==="pen"){
    answerLandLayer.append("path").datum(info.geometry).attr("class","answer-area").attr("clip-path","url(#landClip)").attr("d",path);
  }else{
    answerLandLayer.append("path").datum(info.geometry).attr("class","answer-area").attr("d",path);
  }
}
function screenPoint(lon,lat){
  const p=projection([lon,lat]);
  return p?currentTransform.apply(p):null;
}
function targetPointForAnswer(t,answer){
  if(t.line&&answer?.guess) return nearestPointOnLine(answer.guess.lat,answer.guess.lon,t.line);
  if((t.c==="pen"||t.c==="isl"||t.c==="sea"||t.c==="des"||t.c==="low"||t.c==="mnt"||t.custom)&&answer?.guess){
    return answer.ok&&answer.insideCore?{lon:t.lon,lat:t.lat}:nearestTargetPoint(t,answer.guess.lon,answer.guess.lat);
  }
  return {lon:t.lon,lat:t.lat};
}
function drawScreen(t,answer,learn=false){
  screenLayer.selectAll("*").remove();
  const tp=targetPointForAnswer(t,answer);
  const target=screenPoint(tp.lon,tp.lat);
  const labelP=screenPoint(t.lon,t.lat);
  if(answer?.guess){
    const gp=screenPoint(answer.guess.lon,answer.guess.lat);
    if(gp&&target){
      screenLayer.append("line").attr("class","pointer-line"+(answer.ok?" ok":""))
        .attr("x1",gp[0]).attr("y1",gp[1]).attr("x2",target[0]).attr("y2",target[1]);
      screenLayer.append("circle").attr("class","guess-dot").attr("cx",gp[0]).attr("cy",gp[1]).attr("r",4.5);
    }
  }
  if(target&&(t.c==="capital"||t.c==="lake"||t.line||t.pointCountry)){
    screenLayer.append("circle").attr("class","answer-dot").attr("cx",target[0]).attr("cy",target[1]).attr("r",4);
  }
  if(labelP){
    screenLayer.append("text").attr("class","answer-label").attr("x",labelP[0]+7).attr("y",labelP[1]-7).text(t.n);
  }
}
function renderDisplay(t,answer=null,learn=false,fromResize=false){
  if(!fromResize) lastDisplay={t,answer,learn};
  clearGeometry();
  drawTargetGeometry(t);
  drawScreen(t,answer,learn);
}
function feedbackFor(t,a){
  if(a.ok){
    if(t.c==="country") return `Správně – ${t.n}.`;
    if(a.insideCore===false) return `Správně – u malého ostrova se počítá i blízké okolí.`;
    return "Správně.";
  }
  if(t.c==="country") return `Nesprávně – správný stát je zvýrazněný zeleně.`;
  return `Mimo správnou oblast přibližně o ${fmtKm(a.dist)}.`;
}

/* ---------- river guide ---------- */
function drawRiverGuide(){
  riverGuideLayer.selectAll("*").remove();
  const btn=$("riverToggle");
  const hasRivers=allTerms().some(t=>(t.ct||"eu")===currentContinent&&t.c==="river");
  btn.classList.toggle("hidden",!hasRivers);
  btn.classList.toggle("active",showRivers);
  if(!showRivers||!hasRivers)return;
  const rivers=allTerms().filter(t=>(t.ct||"eu")===currentContinent&&t.c==="river"&&t.line&&termLevel(t)<=currentLevel);
  riverGuideLayer.selectAll("path").data(rivers).join("path")
    .datum(d=>({type:"LineString",coordinates:d.line}))
    .attr("class","river-line").attr("d",path);
}

/* ---------- zoom ---------- */
const zoom=d3.zoom().scaleExtent([1,32]).on("zoom",e=>{
  currentTransform=e.transform;
  mapLayer.attr("transform",currentTransform);
  $("zoomLevel").textContent=(currentTransform.k<10?currentTransform.k.toFixed(1):Math.round(currentTransform.k))+"×";
  if(lastDisplay) drawScreen(lastDisplay.t,lastDisplay.answer,lastDisplay.learn);
});
svg.call(zoom).on("dblclick.zoom",null);
function resetView(animated=true){
  svg.interrupt();
  if(animated)svg.transition().duration(180).call(zoom.transform,d3.zoomIdentity);
  else svg.call(zoom.transform,d3.zoomIdentity);
}
$("zoomIn").onclick=()=>svg.transition().duration(120).call(zoom.scaleBy,1.7);
$("zoomOut").onclick=()=>svg.transition().duration(120).call(zoom.scaleBy,1/1.7);
$("resetView").onclick=()=>resetView();
$("riverToggle").onclick=()=>{showRivers=!showRivers;drawRiverGuide()};

/* ---------- selectors ---------- */
function visibleTerms(){
  return allTerms().filter(t=>(t.ct||"eu")===currentContinent&&termLevel(t)<=currentLevel);
}
function saveCurrentSelection(){
  const root=$("categorySelectors");
  const boxes=[...root.querySelectorAll(".term-check")];
  if(boxes.length) selectionState[currentContinent]=new Set(boxes.filter(x=>x.checked).map(x=>x.dataset.id));
}
function renderTermSelectors(){
  const root=$("categorySelectors");
  const previous=selectionState[currentContinent];
  const terms=visibleTerms();
  const groups=[...new Set(terms.map(categoryKey))].sort((a,b)=>CAT_ORDER.indexOf(a)-CAT_ORDER.indexOf(b));
  root.innerHTML="";
  for(const group of groups){
    const items=terms.filter(t=>categoryKey(t)===group);
    const details=document.createElement("details");details.className="term-group";
    const summary=document.createElement("summary");
    const master=document.createElement("input");master.type="checkbox";master.className="master-check";
    const title=document.createElement("span");title.textContent=CAT_NAMES[group]||group;
    const count=document.createElement("span");count.className="term-count";count.textContent=items.length;
    summary.append(master,title,count);details.appendChild(summary);
    const list=document.createElement("div");list.className="term-list";
    for(const t of items){
      const row=document.createElement("label");row.className="term-item";
      const cb=document.createElement("input");cb.type="checkbox";cb.className="term-check";cb.dataset.id=t.id;
      cb.checked=previous?previous.has(t.id):true;
      const name=document.createElement("span");name.textContent=t.n;
      row.append(cb,name);
      if(t.custom){
        const del=document.createElement("button");del.type="button";del.className="delete-term";del.textContent="×";
        del.onclick=e=>{e.preventDefault();e.stopPropagation();customTerms=customTerms.filter(x=>x.id!==t.id);saveCustomTerms();selectionState[currentContinent]=null;renderTermSelectors()};
        row.appendChild(del);
      }else row.appendChild(document.createElement("span"));
      list.appendChild(row);
    }
    details.appendChild(list);root.appendChild(details);
    const sync=()=>{
      const b=[...list.querySelectorAll(".term-check")],n=b.filter(x=>x.checked).length;
      master.checked=n===b.length&&b.length>0;master.indeterminate=n>0&&n<b.length;
    };
    sync();
    master.onclick=e=>e.stopPropagation();
    master.onchange=()=>{list.querySelectorAll(".term-check").forEach(x=>x.checked=master.checked);master.indeterminate=false;saveCurrentSelection()};
    list.onchange=()=>{sync();saveCurrentSelection()};
    summary.onclick=e=>{if(e.target===master)e.preventDefault()};
  }
  updateStartButton();
}
function selectedTerms(){
  const ids=new Set([...$("categorySelectors").querySelectorAll(".term-check:checked")].map(x=>x.dataset.id));
  return visibleTerms().filter(t=>ids.has(t.id));
}
function updateChoiceButtons(){
  document.querySelectorAll("[data-continent]").forEach(b=>b.classList.toggle("active",b.dataset.continent===currentContinent));
  document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===settingMode));
  document.querySelectorAll("[data-level]").forEach(b=>b.classList.toggle("active",Number(b.dataset.level)===currentLevel));
  $("quizCountRow").classList.toggle("hidden",settingMode!=="quiz");
  $("startBtn").textContent=settingMode==="quiz"?"Spustit":"Otevřít mapu";
}
function updateStartButton(){ $("startBtn").disabled=!ready||selectedTerms().length===0; }
document.querySelectorAll("[data-continent]").forEach(btn=>btn.onclick=()=>{
  if(btn.dataset.continent===currentContinent)return;
  saveCurrentSelection();
  currentContinent=btn.dataset.continent;
  targetGeometryCache.clear();targetSampleCache.clear();
  updateChoiceButtons();renderTermSelectors();resetView(false);sizeMap();
});
document.querySelectorAll("[data-mode]").forEach(btn=>btn.onclick=()=>{
  settingMode=btn.dataset.mode;
  updateChoiceButtons();
});
document.querySelectorAll("[data-level]").forEach(btn=>btn.onclick=()=>{
  saveCurrentSelection();
  currentLevel=Number(btn.dataset.level);
  selectionState[currentContinent]=null;
  updateChoiceButtons();renderTermSelectors();drawRiverGuide();
});
$("allCats").onclick=()=>{$("categorySelectors").querySelectorAll(".term-check,.master-check").forEach(x=>{x.checked=true;x.indeterminate=false});saveCurrentSelection();updateStartButton()};
$("noCats").onclick=()=>{$("categorySelectors").querySelectorAll(".term-check,.master-check").forEach(x=>{x.checked=false;x.indeterminate=false});saveCurrentSelection();updateStartButton()};

/* ---------- drawer ---------- */
function closeDrawer(){
  $("sideDrawer").classList.add("hidden");$("drawerScrim").classList.add("hidden");
}
function openDrawer(kind){
  $("drawerTitle").textContent=kind==="learn"?"Pojmy":"Historie";
  $("learnPanel").classList.toggle("hidden",kind!=="learn");
  $("historyPanel").classList.toggle("hidden",kind!=="history");
  $("sideDrawer").classList.remove("hidden");$("drawerScrim").classList.remove("hidden");
}
$("drawerClose").onclick=closeDrawer;$("drawerScrim").onclick=closeDrawer;
$("drawerBtn").onclick=()=>openDrawer(activeMode==="learn"?"learn":"history");

/* ---------- quiz ---------- */
function balancedQuiz(pool,n){
  const groups=[...new Set(pool.map(categoryKey))].map(g=>shuffle(pool.filter(t=>categoryKey(t)===g)));
  const out=[];
  while(out.length<n&&groups.some(g=>g.length)){
    for(const g of shuffle(groups.filter(g=>g.length))){
      if(out.length>=n)break;
      out.push(g.shift());
    }
  }
  return out;
}
function startQuiz(){
  const pool=selectedTerms();if(!pool.length)return;
  const raw=$("count").value,n=raw==="all"?pool.length:Math.min(+raw,pool.length);
  quizSession={list:balancedQuiz(pool,n),idx:0,answers:Array(n).fill(null)};
  activeMode="quiz";selectedLearn=null;closeDrawer();$("startScreen").classList.add("hidden");$("endScreen").classList.add("hidden");
  $("drawerBtn").classList.remove("hidden");resetView(false);renderQuestion();
}
function currentScore(){return quizSession?quizSession.answers.filter(a=>a?.ok).length:0}
function answeredCount(){return quizSession?quizSession.answers.filter(Boolean).length:0}
function renderQuestion(){
  if(!quizSession)return;
  if(quizSession.idx>=quizSession.list.length){finishQuiz();return}
  const t=quizSession.list[quizSession.idx],a=quizSession.answers[quizSession.idx];
  clearDisplay();
  $("appTitle").textContent=(currentContinent==="asia"?"Asie":"Evropa")+" – klikni do mapy";
  $("subTitle").textContent=t.n+" · "+(CAT_NAMES[categoryKey(t)]||"");
  $("progress").textContent=`${quizSession.idx+1} / ${quizSession.list.length}`;
  $("score").textContent=`Správně: ${currentScore()}`;
  $("prevBtn").disabled=quizSession.idx===0;
  $("nextBtn").disabled=!a;
  if(a){
    renderDisplay(t,a,false);
    setFeedback(a.ok?"good":"bad",feedbackFor(t,a));
  }
  renderHistory();
}
function renderHistory(){
  const box=$("historyList");box.innerHTML="";
  if(!quizSession)return;
  quizSession.answers.forEach((a,i)=>{
    if(!a)return;
    const b=document.createElement("button");
    const name=document.createElement("span");name.textContent=quizSession.list[i].n;
    const mark=document.createElement("span");mark.className=a.ok?"ok":"bad";mark.textContent=a.ok?"✓":"×";
    b.append(name,mark);b.onclick=()=>{quizSession.idx=i;renderQuestion();closeDrawer()};
    box.appendChild(b);
  });
}
$("prevBtn").onclick=()=>{
  if(activeMode==="quiz"&&quizSession&&quizSession.idx>0){quizSession.idx--;renderQuestion()}
};
$("nextBtn").onclick=()=>{
  if(activeMode==="quiz"&&quizSession&&quizSession.answers[quizSession.idx]){quizSession.idx++;renderQuestion()}
};
function finishQuiz(){
  clearDisplay();activeMode="end";$("drawerBtn").classList.add("hidden");
  const total=quizSession.list.length,got=currentScore(),pct=Math.round(got/Math.max(1,total)*100);
  $("finalScore").textContent=`${got} / ${total}`;
  $("finalText").textContent=`${pct} %`;
  $("endScreen").classList.remove("hidden");
}
$("againBtn").onclick=startQuiz;

/* ---------- learn ---------- */
function startLearn(){
  activeMode="learn";quizSession=null;selectedLearn=null;clearDisplay();closeDrawer();
  $("startScreen").classList.add("hidden");$("endScreen").classList.add("hidden");
  $("drawerBtn").classList.remove("hidden");$("prevBtn").disabled=true;$("nextBtn").disabled=true;
  $("appTitle").textContent=(currentContinent==="asia"?"Asie":"Evropa")+" – prohlížení";
  $("subTitle").textContent="";
  $("progress").textContent=selectedTerms().length+" pojmů";$("score").textContent="Učení";
  resetView(false);updateLearnList();openDrawer("learn");
}
function updateLearnList(){
  const q=$("learnSearch").value.trim().toLocaleLowerCase("cs");
  const arr=selectedTerms().filter(t=>t.n.toLocaleLowerCase("cs").includes(q)).sort((a,b)=>a.n.localeCompare(b.n,"cs"));
  $("learnCount").textContent=arr.length+" pojmů";
  const box=$("learnList");box.innerHTML="";
  for(const t of arr){
    const b=document.createElement("button");b.type="button";
    const n=document.createElement("span");n.textContent=t.n;
    const c=document.createElement("span");c.textContent=CAT_NAMES[categoryKey(t)]||"";
    b.append(n,c);b.onclick=()=>{showLearnTerm(t);closeDrawer()};
    box.appendChild(b);
  }
}
$("learnSearch").oninput=updateLearnList;
function showLearnTerm(t){
  selectedLearn=t;clearDisplay();renderDisplay(t,null,true);
  $("subTitle").textContent=t.n+" · "+(CAT_NAMES[categoryKey(t)]||"");
  setFeedback("info","Zvýrazněná je správná poloha.");
}
function nearestLearnTerm(lon,lat){
  let best=null,bestD=Infinity;
  const pool=selectedTerms();
  for(const t of pool){
    if(t.c==="country"){
      const f=findCountry(t);if(f&&!t.pointCountry&&d3.geoContains(f,[lon,lat]))return t;
    }else if(t.line){
      const d=distanceToLine(lat,lon,t.line);if(d<bestD){bestD=d;best=t}
    }else if(["pen","isl","sea","des","low","mnt"].includes(t.c)||t.custom){
      if(insideCoreTarget(t,lon,lat))return t;
      const d=haversine(lat,lon,t.lat,t.lon);if(d<bestD){bestD=d;best=t}
    }else{
      const d=haversine(lat,lon,t.lat,t.lon);if(d<bestD){bestD=d;best=t}
    }
  }
  return best&&bestD<=Math.max(120,best.r||80)?best:null;
}

/* ---------- settings ---------- */
function openSettings(){
  activeMode="settings";quizSession=null;selectedLearn=null;addMode=false;pendingPosition=null;
  closeDrawer();clearDisplay();clearFeedback();
  $("endScreen").classList.add("hidden");$("addTermScreen").classList.add("hidden");$("startScreen").classList.remove("hidden");
  $("drawerBtn").classList.add("hidden");$("prevBtn").disabled=true;$("nextBtn").disabled=true;
  $("appTitle").textContent="Slepé mapy";$("subTitle").textContent="";
  $("progress").textContent="0 / 0";$("score").textContent="Správně: 0";
  updateChoiceButtons();renderTermSelectors();sizeMap();
}
$("settingsBtn").onclick=openSettings;$("endSettingsBtn").onclick=openSettings;
$("startBtn").onclick=()=>settingMode==="quiz"?startQuiz():startLearn();

/* ---------- map click ---------- */
svg.on("click",event=>{
  if(!ready||event.defaultPrevented)return;
  const p=currentTransform.invert(d3.pointer(event,svg.node()));
  const ll=projection.invert(p);if(!ll)return;
  const [lon,lat]=ll;if(!Number.isFinite(lon)||!Number.isFinite(lat)||lat<-85||lat>85)return;

  if(addMode){
    pendingPosition={lon,lat};addMode=false;
    $("pickedPositionText").textContent=`${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
    $("addTermScreen").classList.remove("hidden");setTimeout(()=>$("newTermName").focus(),30);return;
  }
  if(activeMode==="learn"){
    const t=nearestLearnTerm(lon,lat);if(t)showLearnTerm(t);return;
  }
  if(activeMode!=="quiz"||!quizSession)return;
  const idx=quizSession.idx;
  if(idx<0||idx>=quizSession.list.length||quizSession.answers[idx])return;
  const t=quizSession.list[idx],result=evaluateTerm(t,lon,lat);
  quizSession.answers[idx]={...result,guess:{lon,lat}};
  renderQuestion();
});

/* ---------- custom terms ---------- */
$("addTermBtn").onclick=()=>{
  addMode=true;pendingPosition=null;activeMode="add";
  $("startScreen").classList.add("hidden");clearDisplay();clearFeedback();resetView(false);
  $("appTitle").textContent="Přidat pojem";$("subTitle").textContent="Klikni do mapy na správnou polohu";
};
$("cancelTermBtn").onclick=()=>{addMode=false;pendingPosition=null;$("addTermScreen").classList.add("hidden");openSettings()};
$("saveTermBtn").onclick=()=>{
  const name=$("newTermName").value.trim(),c=$("newTermCategory").value,r=+$("newTermRadius").value;
  if(!pendingPosition||!name||!Number.isFinite(r)||r<10||r>1000)return;
  customTerms.push({id:"custom-"+Date.now()+"-"+Math.random().toString(36).slice(2),n:name,c,lat:pendingPosition.lat,lon:pendingPosition.lon,r,ct:currentContinent,level:1,custom:true});
  saveCustomTerms();selectionState[currentContinent]=null;targetGeometryCache.clear();targetSampleCache.clear();
  $("newTermName").value="";$("newTermRadius").value="100";pendingPosition=null;$("addTermScreen").classList.add("hidden");openSettings();
};
$("exportTermsBtn").onclick=()=>{
  const blob=new Blob([JSON.stringify(customTerms,null,2)],{type:"application/json"}),a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download="slepe-mapy-vlastni-pojmy.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),500);
};
$("importTermsInput").onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const imported=normalizeCustomTerms(JSON.parse(await file.text()));
    customTerms=customTerms.concat(imported.map(t=>({...t,id:"custom-"+Date.now()+"-"+Math.random().toString(36).slice(2)})));
    saveCustomTerms();selectionState[currentContinent]=null;renderTermSelectors();
  }catch(err){alert("Soubor se nepodařilo načíst.")}
  e.target.value="";
};

/* ---------- loading ---------- */
let loadingValue=0,loadingTarget=0;
const loadingTimer=setInterval(()=>{
  if(loadingValue<loadingTarget){
    loadingValue=Math.min(loadingTarget,loadingValue+1);
    $("loadingBar").style.width=loadingValue+"%";$("loadingPercent").textContent=loadingValue+" %";
  }
},18);
function setLoadingTarget(v){loadingTarget=Math.max(loadingTarget,Math.min(100,v))}
function finishLoading(){
  setLoadingTarget(100);
  const t=setInterval(()=>{
    if(loadingValue>=100){
      clearInterval(t);clearInterval(loadingTimer);
      setTimeout(()=>{$("loading").classList.add("hidden");$("startScreen").classList.remove("hidden")},80);
    }
  },20);
}
async function getWorld(){
  const urls=[
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json",
    "https://unpkg.com/world-atlas@2/countries-10m.json",
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"
  ];
  let last;
  for(const url of urls){
    try{const r=await fetch(url);if(!r.ok)throw Error("HTTP "+r.status);return await r.json()}catch(e){last=e}
  }
  throw last||Error("Mapový podklad není dostupný.");
}
async function getMarine(){
  const urls=[
    "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_geography_marine_polys.geojson",
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_geography_marine_polys.geojson"
  ];
  for(const url of urls){
    try{const r=await fetch(url);if(!r.ok)throw Error("HTTP "+r.status);const j=await r.json();if(j?.features?.length)return j.features}catch(e){}
  }
  return [];
}
async function init(){
  try{
    setLoadingTarget(10);
    if(!window.d3||!window.topojson)throw Error("Chybí knihovna mapy.");
    setLoadingTarget(24);
    const [world,marine]=await Promise.all([getWorld(),getMarine()]);
    setLoadingTarget(66);
    countriesFeature=topojson.feature(world,world.objects.countries);
    countries=countriesFeature.features.filter(f=>Number(f.id)!==10);
    byIso=new Map(countries.map(f=>[Number(f.id),f]));
    marineFeatures=marine;
    buildLandComponents();
    setLoadingTarget(80);
    prepareMapCaches();
    currentContinent="eu";currentLevel=1;settingMode="quiz";
    sizeMap();updateChoiceButtons();renderTermSelectors();
    ready=true;updateStartButton();finishLoading();
  }catch(e){
    console.error(e);clearInterval(loadingTimer);
    $("loading").innerHTML='<div class="loading-box"><div class="loading-title">Mapy se nepodařilo načíst</div><button onclick="location.reload()">Zkusit znovu</button></div>';
  }
}
window.addEventListener("resize",()=>{
  clearTimeout(window.__mapResize);
  window.__mapResize=setTimeout(()=>{mapCache.clear();sizeMap();prepareMapCaches()},120);
});

init();
})();