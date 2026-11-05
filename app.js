
(() => {
"use strict";

const TERMS=window.MAP_TERMS||[];

const CUSTOM_STORAGE_KEY="evropaKlikaciMapaCustomTermsV1";

function normalizeCustomTerms(arr){
  if(!Array.isArray(arr))return [];
  return arr.filter(t =>
    t && typeof t.n==="string" &&
    ["pen","isl","sea","des","low","mnt"].includes(t.c) &&
    Number.isFinite(+t.lat) && Number.isFinite(+t.lon) && Number.isFinite(+t.r)
  ).map(t=>({
    id:t.id||("custom-"+Date.now()+"-"+Math.random().toString(36).slice(2)),
    n:t.n.trim(),c:t.c,lat:+t.lat,lon:+t.lon,r:+t.r,ct:(t.ct==="asia"?"asia":"eu"),custom:true
  }));
}

let embeddedTerms=[];
try{
  embeddedTerms=normalizeCustomTerms(
    JSON.parse(document.getElementById("embeddedCustomTerms")?.textContent||"[]")
  );
}catch(e){ embeddedTerms=[]; }

let storedTerms=[];
try{
  storedTerms=normalizeCustomTerms(
    JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY)||"[]")
  );
}catch(e){ storedTerms=[]; }

const byId=new Map();
for(const t of embeddedTerms)byId.set(t.id,t);
for(const t of storedTerms)byId.set(t.id,t);
let customTerms=[...byId.values()];

function allTerms(){ return TERMS.concat(customTerms); }
function saveCustomTerms(){
  localStorage.setItem(CUSTOM_STORAGE_KEY,JSON.stringify(customTerms));
}

function jsonForHtmlScript(data){
  return JSON.stringify(data)
    .replace(/</g,"\\u003c")
    .replace(/>/g,"\\u003e")
    .replace(/&/g,"\\u0026")
    .replace(/\u2028/g,"\\u2028")
    .replace(/\u2029/g,"\\u2029");
}

const CAT_NAMES={pen:"Poloostrovy",isl:"Ostrovy a souostroví",sea:"Moře, zálivy, průlivy a průplavy",des:"Pouště",low:"Nížiny",mnt:"Pohoří a vysočiny"};
const CATEGORY_ORDER=["pen","isl","sea","des","low","mnt"];

const TARGET_REGIONS=window.MAP_TARGET_REGIONS||{};
const SMALL_ISLAND_TOLERANCE=window.MAP_SMALL_ISLAND_TOLERANCE||new Set();

const MARINE_ALIASES={
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

let marineFeatures=[];

const targetGeometryCache=new Map();
const targetSampleCache=new Map();

function normMarineName(v){
  return String(v??"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function marineFeatureNames(f){
  const p=f?.properties||{};
  return [p.name,p.NAME,p.name_en,p.NAME_EN,p.namealt,p.NAMEALT,p.note,p.NOTE]
    .filter(Boolean).map(normMarineName);
}
function orientGeoForD3(feature){
  if(!feature?.geometry)return feature;
  const f=JSON.parse(JSON.stringify(feature));
  const fixPoly=coords=>{
    if(!Array.isArray(coords)||!coords.length)return coords;
    const probe={type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:coords}};
    return d3.geoArea(probe)>2*Math.PI ? coords.map(r=>[...r].reverse()) : coords;
  };
  if(f.geometry.type==="Polygon")f.geometry.coordinates=fixPoly(f.geometry.coordinates);
  else if(f.geometry.type==="MultiPolygon")f.geometry.coordinates=f.geometry.coordinates.map(fixPoly);
  return f;
}
function naturalMarineGeometry(t){
  const aliases=(MARINE_ALIASES[t.n]||[]).map(normMarineName);
  if(!aliases.length||!marineFeatures.length)return null;
  const hits=marineFeatures.filter(f=>{
    const names=marineFeatureNames(f);
    return aliases.some(a=>names.includes(a));
  });
  if(!hits.length)return null;
  const oriented=hits.map(orientGeoForD3);
  return oriented.length===1?oriented[0]:{type:"FeatureCollection",features:oriented};
}

function ringSignedArea(coords){
  let a=0;
  for(let i=0;i<coords.length-1;i++){
    const [x1,y1]=coords[i], [x2,y2]=coords[i+1];
    a+=x1*y2-x2*y1;
  }
  return a/2;
}

function normalizedRing(coords){
  const ring=coords.map(p=>[+p[0],+p[1]]);
  if(ring.length && (ring[0][0]!==ring[ring.length-1][0] || ring[0][1]!==ring[ring.length-1][1])) ring.push([...ring[0]]);
  if(ringSignedArea(ring)>0)ring.reverse();
  return ring;
}

function pointInRing(lon,lat,coords){
  let inside=false;
  for(let i=0,j=coords.length-1;i<coords.length;j=i++){
    const xi=coords[i][0], yi=coords[i][1], xj=coords[j][0], yj=coords[j][1];
    const crosses=((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi);
    if(crosses)inside=!inside;
  }
  return inside;
}

function geoPolygon(coords){return {type:"Polygon",coordinates:[normalizedRing(coords)]}}
function geoCircleKm(lon,lat,rKm){return d3.geoCircle().center([lon,lat]).radius(rKm/111.195).precision(4)()}

let landComponents=[];
function buildLandComponents(){
  landComponents=[];
  if(!countriesFeature?.features)return;
  for(const f of countriesFeature.features){
    const g=f.geometry;if(!g)continue;
    if(g.type==="Polygon"){
      const part={type:"Feature",properties:{country:f.properties?.name||""},geometry:g};
      landComponents.push({feature:part,centroid:d3.geoCentroid(part)});
    }else if(g.type==="MultiPolygon"){
      for(const poly of g.coordinates||[]){
        const part={type:"Feature",properties:{country:f.properties?.name||""},geometry:{type:"Polygon",coordinates:poly}};
        landComponents.push({feature:part,centroid:d3.geoCentroid(part)});
      }
    }
  }
}
function islandGeometryInsideRegion(region){
  const hits=[];
  for(const item of landComponents){
    const c=item.centroid;
    if(Number.isFinite(c?.[0]) && Number.isFinite(c?.[1]) && d3.geoContains(region,c))hits.push(item.feature);
  }
  return hits.length?{type:"FeatureCollection",features:hits}:null;
}
function targetInfo(t){
  const key=t.id||t.n;if(targetGeometryCache.has(key))return targetGeometryCache.get(key);
  let info;
  if(t.custom)info={geometry:geoCircleKm(t.lon,t.lat,t.r),mode:"custom",source:"custom"};
  else{
    if(t.c==="sea"){
      const marine=naturalMarineGeometry(t);
      if(marine){
        info={geometry:marine,region:marine,mode:"marine",source:"natural-earth-marine"};
        targetGeometryCache.set(key,info);
        return info;
      }
    }
    const spec=TARGET_REGIONS[t.n];
    if(!spec){
      const region=geoCircleKm(t.lon,t.lat,Math.max(20,t.r));
      if(t.c==="isl"){
        const islands=islandGeometryInsideRegion(region);
        info=islands?{geometry:islands,region,mode:t.c,source:"island-components"}:{geometry:region,region,mode:t.c,source:"fallback"};
      }else info={geometry:region,region,mode:t.c,source:"fallback"};
    }else{
      const region=geoPolygon(spec.coords);
      if(t.c==="isl"){
        const islands=islandGeometryInsideRegion(region);
        info=islands?{geometry:islands,region,mode:spec.mode||t.c,source:"island-components"}:{geometry:region,region,mode:spec.mode||t.c,source:"island-fallback"};
      }else info={geometry:region,region,mode:spec.mode||t.c,source:"manual"};
    }
  }
  targetGeometryCache.set(key,info);return info;
}
function isLandPoint(lon,lat){return !!activeCountriesFeature&&d3.geoContains(activeCountriesFeature,[lon,lat])}
function insideCoreTarget(t,lon,lat){
  const info=targetInfo(t);
  if(t.custom)return d3.geoContains(info.geometry,[lon,lat]);
  const spec=TARGET_REGIONS[t.n];
  const inManualRegion=spec?pointInRing(lon,lat,spec.coords):d3.geoContains(info.geometry,[lon,lat]);
  if(t.c==="pen")return inManualRegion&&isLandPoint(lon,lat);
  if(t.c==="isl"){
    if(info.source==="island-components")return d3.geoContains(info.geometry,[lon,lat]);
    return inManualRegion&&isLandPoint(lon,lat);
  }
  if(t.c==="sea"){
    if(info.source==="natural-earth-marine"){
      return d3.geoContains(info.geometry,[lon,lat]) && !isLandPoint(lon,lat);
    }
    if(!inManualRegion)return false;
    if(info.mode==="narrow")return true;
    return !isLandPoint(lon,lat);
  }
  return d3.geoContains(info.geometry,[lon,lat]);
}
function acceptedClick(t,lon,lat){
  const core=insideCoreTarget(t,lon,lat);if(core)return {ok:true,insideCore:true};
  if(t.custom)return {ok:haversine(lat,lon,t.lat,t.lon)<=t.r,insideCore:false};
  if(t.c==="isl"&&SMALL_ISLAND_TOLERANCE.has(t.n))return {ok:haversine(lat,lon,t.lat,t.lon)<=t.r,insideCore:false};
  return {ok:false,insideCore:false};
}
function collectOuterRings(obj,out=[]){
  if(!obj)return out;
  if(obj.type==="FeatureCollection")for(const f of obj.features||[])collectOuterRings(f,out);
  else if(obj.type==="Feature")collectOuterRings(obj.geometry,out);
  else if(obj.type==="GeometryCollection")for(const g of obj.geometries||[])collectOuterRings(g,out);
  else if(obj.type==="Polygon"){if(obj.coordinates?.[0])out.push(obj.coordinates[0])}
  else if(obj.type==="MultiPolygon")for(const poly of obj.coordinates||[])if(poly?.[0])out.push(poly[0]);
  return out;
}
function densifyRing(ring,maxPerEdge=8){
  const out=[];if(!ring?.length)return out;
  for(let i=0;i<ring.length-1;i++){
    const a=ring[i],b=ring[i+1],span=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));
    const n=Math.max(1,Math.min(maxPerEdge,Math.ceil(span/0.22)));
    for(let k=0;k<n;k++){const f=k/n;out.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f])}
  }
  out.push(ring[ring.length-1]);return out;
}
function targetBoundarySamples(t){
  const key=t.id||t.n;if(targetSampleCache.has(key))return targetSampleCache.get(key);
  const info=targetInfo(t);let rings=[];
  if(info.source==="natural-earth-marine")rings=collectOuterRings(info.geometry,[]);else if(!t.custom&&TARGET_REGIONS[t.n]&&t.c!=="isl")rings=[normalizedRing(TARGET_REGIONS[t.n].coords)];else rings=collectOuterRings(info.geometry,[]);
  let pts=[];for(const ring of rings)pts.push(...densifyRing(ring,8));
  const MAX=900;if(pts.length>MAX){const step=Math.ceil(pts.length/MAX);pts=pts.filter((_,i)=>i%step===0)}
  if(!pts.length)pts=[[t.lon,t.lat]];targetSampleCache.set(key,pts);return pts;
}
function nearestTargetPoint(t,lon,lat){
  if(insideCoreTarget(t,lon,lat))return {lon,lat,km:0};
  const pts=targetBoundarySamples(t);let best=Infinity,bestPoint=[t.lon,t.lat];
  for(const p of pts){const d=haversine(lat,lon,p[1],p[0]);if(d<best){best=d;bestPoint=p}}
  if(!Number.isFinite(best)){best=haversine(lat,lon,t.lat,t.lon);bestPoint=[t.lon,t.lat]}
  return {lon:bestPoint[0],lat:bestPoint[1],km:best};
}
function distanceToTargetKm(t,lon,lat){return nearestTargetPoint(t,lon,lat).km}
const VIEW_BOXES=window.MAP_VIEW_BOXES||{};
function currentViewBox(){return VIEW_BOXES[currentContinent]||VIEW_BOXES.eu}
const svg=d3.select("#mapSvg");
const defs=svg.append("defs");
const landClip=defs.append("clipPath").attr("id","landClip").attr("clipPathUnits","userSpaceOnUse");
const mapLayer=svg.append("g");
const answerWaterLayer=mapLayer.append("g"),base=mapLayer.append("g"),answerLandLayer=mapLayer.append("g"),answerLayer=svg.append("g");
let countriesFeature=null,activeCountriesFeature=null;
const renderCache=new Map();
let projection=d3.geoMercator(),path=d3.geoPath(projection),currentTransform=d3.zoomIdentity,lastAnswer=null;
let ready=false,queue=[],index=-1,correct=0,locked=true,addMode=false,pendingPosition=null,currentContinent="eu";
const qEl=document.getElementById("question"),catEl=document.getElementById("category"),progEl=document.getElementById("progress"),scoreEl=document.getElementById("score"),feedbackEl=document.getElementById("feedback"),nextBtn=document.getElementById("nextBtn"),loading=document.getElementById("loading"),loadingBar=document.getElementById("loadingBar"),loadingPercent=document.getElementById("loadingPercent");
let loadingValue=0,loadingTarget=0;
const loadingTimer=setInterval(()=>{if(loadingValue<loadingTarget){loadingValue=Math.min(loadingTarget,loadingValue+1);if(loadingBar)loadingBar.style.width=loadingValue+"%";if(loadingPercent)loadingPercent.textContent=loadingValue+" %"}},20);
function setLoadingTarget(v){loadingTarget=Math.max(loadingTarget,Math.min(100,v))}
function finishLoading(){setLoadingTarget(100);const done=setInterval(()=>{if(loadingValue>=100){clearInterval(done);clearInterval(loadingTimer);setTimeout(()=>{loading.style.display="none";document.getElementById("startScreen").classList.remove("hidden")},120)}},20)}
function haversine(lat1,lon1,lat2,lon2){const R=6371.0088,rad=Math.PI/180,p1=lat1*rad,p2=lat2*rad,dp=(lat2-lat1)*rad,dl=(lon2-lon1)*rad,a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(a))}
function updateContinentTexts(){const titleName=currentContinent==="asia"?"Asie":"Evropa",appTitle=document.getElementById("appTitle"),startTitle=document.getElementById("startTitle"),mapSvg=document.getElementById("mapSvg");if(appTitle)appTitle.textContent=`${titleName} – klikni do mapy`;if(startTitle)startTitle.textContent="Vyber mapu";if(mapSvg)mapSvg.setAttribute("aria-label",`Slepá mapa ${titleName.toLowerCase()}`);updateContinentButtons()}
function updateContinentButtons(){document.querySelectorAll(".continent-btn").forEach(btn=>btn.classList.toggle("active",btn.dataset.continent===currentContinent))}
function fmtKm(k){return k<10?k.toFixed(1).replace(".",",")+" km":Math.round(k).toLocaleString("cs-CZ")+" km"}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function setFeedback(kind,text){feedbackEl.className="feedback "+kind;feedbackEl.textContent=text}
function clearFeedback(){feedbackEl.className="feedback";feedbackEl.textContent=""}
function clearAnswer(){answerWaterLayer.selectAll("*").remove();answerLandLayer.selectAll("*").remove();answerLayer.selectAll("*").remove();lastAnswer=null}
function projectionFor(continent,w,h){
  const key=`proj:${continent}:${w}x${h}`;
  if(renderCache.has(key))return renderCache.get(key);

  const b=continent==="asia"
    ? {minLon:20,maxLon:178,minLat:-12,maxLat:82}
    : {minLon:-32,maxLon:65,minLat:29,maxLat:75};

  const rad=Math.PI/180;
  const mercY=lat=>Math.log(Math.tan(Math.PI/4+(lat*rad)/2));
  const invMercY=y=>(2*Math.atan(Math.exp(y))-Math.PI/2)/rad;

  const lonSpan=(b.maxLon-b.minLon)*rad;
  const yMin=mercY(b.minLat), yMax=mercY(b.maxLat);
  const ySpan=Math.abs(yMax-yMin);
  const pad=12;
  const scale=Math.min((w-2*pad)/lonSpan,(h-2*pad)/ySpan);
  const centerLon=(b.minLon+b.maxLon)/2;
  const centerLat=invMercY((yMin+yMax)/2);

  const proj=d3.geoMercator()
    .center([centerLon,centerLat])
    .translate([w/2,h/2])
    .scale(scale)
    .clipExtent([[0,0],[w,h]]);

  renderCache.set(key,proj);
  return proj;
}

function sizeMap(){
  if(!countriesFeature)return;
  const el=document.getElementById("mapWrap");
  const w=Math.max(320,el.clientWidth),h=Math.max(320,el.clientHeight);
  svg.attr("viewBox",`0 0 ${w} ${h}`);
  projection=projectionFor(currentContinent,w,h);
  path=d3.geoPath(projection);
  activeCountriesFeature=countriesFeature;
  drawBase();
  if(lastAnswer)renderAnswer();else clearAnswer();
}

function drawBase(){
  base.selectAll(".map-base").remove();
  const mapBase=base.append("g").attr("class","map-base");
  mapBase.selectAll("path.country")
    .data(countriesFeature.features)
    .join("path")
    .attr("class","country")
    .attr("d",path);
  mapBase.append("path")
    .datum(countriesFeature)
    .attr("class","coast")
    .attr("d",path);

  landClip.selectAll("*").remove();
  landClip.append("path").datum(countriesFeature).attr("d",path);
}

function prepareRenderCaches(){
  if(!countriesFeature)return;
  const el=document.getElementById("mapWrap");
  const w=Math.max(320,el.clientWidth),h=Math.max(320,el.clientHeight);
  projectionFor("eu",w,h);
  setLoadingTarget(88);
  projectionFor("asia",w,h);
  setLoadingTarget(95);
}

const zoom=d3.zoom().scaleExtent([1,32]).filter(e=>!locked||e.type==="wheel"||e.type==="mousedown"||e.type==="touchstart").on("zoom",e=>{currentTransform=e.transform;mapLayer.attr("transform",currentTransform);const zl=document.getElementById("zoomLevel");if(zl)zl.textContent=(currentTransform.k<10?currentTransform.k.toFixed(1):Math.round(currentTransform.k))+"×";if(lastAnswer)renderAnswerOverlay()});svg.call(zoom);
function resetView(animated=true){svg.interrupt();if(animated)svg.transition().duration(180).call(zoom.transform,d3.zoomIdentity);else svg.call(zoom.transform,d3.zoomIdentity)}
document.getElementById("zoomIn").onclick=()=>{svg.interrupt();svg.transition().duration(120).call(zoom.scaleBy,1.7)};document.getElementById("zoomOut").onclick=()=>{svg.interrupt();svg.transition().duration(120).call(zoom.scaleBy,1/1.7)};document.getElementById("resetView").onclick=()=>resetView();
function visibleTerms(){return allTerms().filter(t=>(t.ct||"eu")===currentContinent)}
function renderTermSelectors(){const root=document.getElementById("categorySelectors");if(!root)return;const previous=new Set([...root.querySelectorAll('input.term-check:checked')].map(x=>x.dataset.id)),hadAny=root.querySelectorAll('input.term-check').length>0,visible=visibleTerms(),cats=[...new Set(visible.map(t=>t.c))].sort((a,b)=>CATEGORY_ORDER.indexOf(a)-CATEGORY_ORDER.indexOf(b));root.innerHTML="";for(const cat of cats){const items=visible.filter(t=>t.c===cat),details=document.createElement("details");details.className="term-group";details.open=false;const summary=document.createElement("summary"),master=document.createElement("input");master.type="checkbox";master.className="master-check";master.dataset.cat=cat;master.checked=true;const title=document.createElement("span");title.textContent=CAT_NAMES[cat];const count=document.createElement("span");count.className="term-count";count.textContent=`${items.length}`;summary.append(master,title,count);details.appendChild(summary);const list=document.createElement("div");list.className="term-list";for(const t of items){const row=document.createElement("label");row.className="term-item";const cb=document.createElement("input");cb.type="checkbox";cb.className="term-check";cb.dataset.id=t.id;cb.dataset.cat=cat;cb.checked=hadAny?previous.has(t.id):true;const name=document.createElement("span");name.textContent=t.n;row.append(cb,name);if(t.custom){const del=document.createElement("button");del.type="button";del.className="delete-term";del.textContent="×";del.title="Smazat vlastní pojem";del.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();if(confirm(`Smazat vlastní pojem „${t.n}“?`)){customTerms=customTerms.filter(x=>x.id!==t.id);saveCustomTerms();renderTermSelectors()}});row.appendChild(del)}else row.appendChild(document.createElement("span"));list.appendChild(row)}details.appendChild(list);root.appendChild(details);const syncMaster=()=>{const cbs=[...list.querySelectorAll(".term-check")],checked=cbs.filter(x=>x.checked).length;master.checked=checked===cbs.length&&cbs.length>0;master.indeterminate=checked>0&&checked<cbs.length};syncMaster();master.addEventListener("click",e=>e.stopPropagation());master.addEventListener("change",()=>{list.querySelectorAll(".term-check").forEach(cb=>cb.checked=master.checked);master.indeterminate=false});list.addEventListener("change",syncMaster);summary.addEventListener("click",e=>{if(e.target===master)e.preventDefault()})}}
function selectedTerms(){const ids=new Set([...document.querySelectorAll("#categorySelectors .term-check:checked")].map(x=>x.dataset.id));return visibleTerms().filter(t=>ids.has(t.id))}
function startGame(){if(!ready)return;updateContinentTexts();svg.interrupt();addMode=false;pendingPosition=null;const pool=selectedTerms();if(!pool.length){alert("Vyber alespoň jeden pojem.");return}const raw=document.getElementById("count").value,amount=raw==="all"?pool.length:Math.min(+raw,pool.length);queue=shuffle(pool).slice(0,amount);index=-1;correct=0;locked=true;scoreEl.textContent="Správně: 0";document.getElementById("startScreen").classList.add("hidden");document.getElementById("endScreen").classList.add("hidden");resetView(false);showQuestion()}
function showQuestion(){clearAnswer();clearFeedback();resetView(false);index++;if(index>=queue.length){finish();return}locked=false;nextBtn.disabled=true;const t=queue[index];qEl.textContent=t.n;catEl.textContent=CAT_NAMES[t.c];progEl.textContent=`${index+1} / ${queue.length}`;scoreEl.textContent=`Správně: ${correct}`}
function renderAnswerOverlay(){if(!lastAnswer)return;const {t,guess,ok,insideCore}=lastAnswer;answerLayer.selectAll("*").remove();const g0=projection([guess.lon,guess.lat]),[gx,gy]=currentTransform.apply(g0),targetLinePoint=(ok&&insideCore)?{lon:t.lon,lat:t.lat}:nearestTargetPoint(t,guess.lon,guess.lat),lp0=projection([targetLinePoint.lon,targetLinePoint.lat]),[lx,ly]=currentTransform.apply(lp0);answerLayer.append("line").attr("class","answer-line"+(ok?" ok":"")).attr("x1",gx).attr("y1",gy).attr("x2",lx).attr("y2",ly);answerLayer.append("circle").attr("class","guess-dot").attr("cx",gx).attr("cy",gy).attr("r",4);const a0=projection([t.lon,t.lat]),[ax,ay]=currentTransform.apply(a0);answerLayer.append("text").attr("class","answer-label").attr("x",ax+7).attr("y",ay-7).text(t.n)}
function renderAnswer(){if(!lastAnswer)return;const {t}=lastAnswer;answerWaterLayer.selectAll("*").remove();answerLandLayer.selectAll("*").remove();const info=targetInfo(t);if(!t.custom&&t.c==="isl"&&SMALL_ISLAND_TOLERANCE.has(t.n))answerLandLayer.append("path").datum(geoCircleKm(t.lon,t.lat,t.r)).attr("class","tolerance-area").attr("d",path);if(t.custom)answerLandLayer.append("path").datum(info.geometry).attr("class","answer-area").attr("d",path);else if(t.c==="sea")answerWaterLayer.append("path").datum(info.geometry).attr("class","answer-area").attr("d",path);else if(t.c==="isl"&&info.source==="island-components")answerLandLayer.append("path").datum(info.geometry).attr("class","answer-area").attr("d",path);else if(t.c==="pen")answerLandLayer.append("path").datum(info.geometry).attr("class","answer-area").attr("clip-path","url(#landClip)").attr("d",path);else answerLandLayer.append("path").datum(info.geometry).attr("class","answer-area").attr("d",path);renderAnswerOverlay()}
function reveal(t,guess,ok,insideCore,missKm){lastAnswer={t,guess,ok,insideCore,missKm};renderAnswer();if(ok&&insideCore)setFeedback("good","Správně – klikl(a) jsi přímo do správné oblasti.");else if(ok)setFeedback("good",`Správně – u malého ostrova se počítá i blízké okolí. Od ostrova jsi byl(a) přibližně ${fmtKm(missKm)}.`);else setFeedback("bad",`Mimo správnou oblast přibližně o ${fmtKm(missKm)}. Zeleně je označená celá správná oblast.`)}
svg.on("click",event=>{if(!ready||event.defaultPrevented)return;const pointer=d3.pointer(event,svg.node()),p=currentTransform.invert(pointer),ll=projection.invert(p);if(!ll)return;const [lon,lat]=ll;if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-85||lat>85)return;if(addMode){pendingPosition={lat,lon};addMode=false;locked=true;document.getElementById("pickedPositionText").textContent=`Vybraná poloha: ${lat.toFixed(2)}°, ${lon.toFixed(2)}°.`;document.getElementById("addTermScreen").classList.remove("hidden");qEl.textContent="Přidat vlastní pojem";catEl.textContent="Vyplň název, skupinu a toleranci.";setTimeout(()=>document.getElementById("newTermName").focus(),50);return}if(locked||index<0||index>=queue.length)return;const t=queue[index];svg.style("cursor","wait");locked=true;try{const result=acceptedClick(t,lon,lat),missKm=result.insideCore?0:distanceToTargetKm(t,lon,lat);if(result.ok)correct++;scoreEl.textContent=`Správně: ${correct}`;reveal(t,{lat,lon},result.ok,result.insideCore,missKm)}catch(err){console.error("Chyba při vyhodnocení odpovědi:",err);setFeedback("bad","Při vyhodnocení této položky nastala chyba. Můžeš pokračovat tlačítkem Další.");answerLayer.selectAll("*").remove();const g0=projection([lon,lat]),[gx,gy]=currentTransform.apply(g0);answerLayer.append("circle").attr("class","guess-dot").attr("cx",gx).attr("cy",gy).attr("r",4)}finally{svg.style("cursor","crosshair");nextBtn.disabled=false}});
nextBtn.onclick=showQuestion;
document.getElementById("backBtn").onclick=()=>{addMode=false;pendingPosition=null;locked=true;clearAnswer();clearFeedback();sizeMap();resetView(false);document.getElementById("endScreen").classList.add("hidden");document.getElementById("addTermScreen").classList.add("hidden");document.getElementById("startScreen").classList.remove("hidden");qEl.textContent="Vyber nastavení a spusť hru";catEl.textContent="";progEl.textContent="0 / 0";updateContinentButtons();updateContinentTexts();scoreEl.textContent="Správně: 0";nextBtn.disabled=true};
document.getElementById("startBtn").onclick=startGame;document.getElementById("againBtn").onclick=()=>{document.getElementById("endScreen").classList.add("hidden");startGame()};document.getElementById("settingsBtn").onclick=()=>{document.getElementById("endScreen").classList.add("hidden");document.getElementById("startScreen").classList.remove("hidden");qEl.textContent="Vyber nastavení a spusť hru";catEl.textContent="";progEl.textContent="0 / 0";scoreEl.textContent="Správně: 0";clearFeedback();clearAnswer();updateContinentTexts();sizeMap();resetView(false)};
function finish(){locked=true;nextBtn.disabled=true;clearAnswer();const pct=queue.length?Math.round(correct/queue.length*100):0;document.getElementById("finalScore").textContent=`${correct} / ${queue.length}`;document.getElementById("finalText").textContent=`Úspěšnost ${pct} %.`;document.getElementById("endScreen").classList.remove("hidden")}
window.addEventListener("resize",()=>{clearTimeout(window.__rt);window.__rt=setTimeout(()=>{renderCache.clear();sizeMap();prepareRenderCaches()},120)});
async function getWorld(){const urls=["https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json","https://unpkg.com/world-atlas@2/countries-10m.json","https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json","https://unpkg.com/world-atlas@2/countries-50m.json"];let lastErr;for(const url of urls){try{const r=await fetch(url,{mode:"cors"});if(!r.ok)throw new Error("HTTP "+r.status);return await r.json()}catch(e){lastErr=e}}throw lastErr||new Error("Mapová data se nepodařilo stáhnout.")}

async function getMarine(){
  const urls=[
    "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_geography_marine_polys.geojson",
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_geography_marine_polys.geojson"
  ];
  for(const url of urls){
    try{
      const r=await fetch(url,{mode:"cors"});
      if(!r.ok)throw new Error("HTTP "+r.status);
      const j=await r.json();
      if(j?.features?.length)return j.features;
    }catch(e){console.warn("Marine vrstva se nenačetla z",url,e)}
  }
  return [];
}
document.querySelectorAll(".continent-btn").forEach(btn=>{btn.addEventListener("click",()=>{const next=btn.dataset.continent==="asia"?"asia":"eu";if(next===currentContinent){updateContinentButtons();return}currentContinent=next;updateContinentTexts();const root=document.getElementById("categorySelectors");if(root)root.innerHTML="";renderTermSelectors();clearAnswer();clearFeedback();queue=[];index=-1;locked=true;progEl.textContent="0 / 0";scoreEl.textContent="Správně: 0";nextBtn.disabled=true;if(ready){resetView(false);sizeMap()}})});
document.getElementById("addTermBtn").addEventListener("click",()=>{if(!ready)return;pendingPosition=null;addMode=true;locked=true;document.getElementById("startScreen").classList.add("hidden");document.getElementById("endScreen").classList.add("hidden");clearAnswer();clearFeedback();resetView();qEl.textContent="Klikni do mapy na správnou polohu";catEl.textContent="Přidávání vlastního pojmu";progEl.textContent="";nextBtn.disabled=true});
document.getElementById("cancelTermBtn").addEventListener("click",()=>{addMode=false;pendingPosition=null;document.getElementById("addTermScreen").classList.add("hidden");document.getElementById("startScreen").classList.remove("hidden");qEl.textContent="Vyber nastavení a spusť hru";catEl.textContent="";progEl.textContent="0 / 0";updateContinentButtons();updateContinentTexts()});
document.getElementById("saveTermBtn").addEventListener("click",()=>{const name=document.getElementById("newTermName").value.trim(),cat=document.getElementById("newTermCategory").value,radius=+document.getElementById("newTermRadius").value;if(!pendingPosition){alert("Nejdřív vyber polohu v mapě.");return}if(!name){alert("Zadej název pojmu.");return}if(!["pen","isl","sea","des","low","mnt"].includes(cat)){alert("Vyber skupinu.");return}if(!Number.isFinite(radius)||radius<10||radius>1000){alert("Tolerance musí být mezi 10 a 1000 km.");return}const term={id:"custom-"+Date.now()+"-"+Math.random().toString(36).slice(2),n:name,c:cat,lat:pendingPosition.lat,lon:pendingPosition.lon,r:radius,ct:currentContinent,custom:true};customTerms.push(term);saveCustomTerms();renderTermSelectors();document.getElementById("newTermName").value="";document.getElementById("newTermRadius").value="100";pendingPosition=null;document.getElementById("addTermScreen").classList.add("hidden");document.getElementById("startScreen").classList.remove("hidden");qEl.textContent="Vyber nastavení a spusť hru";catEl.textContent="";progEl.textContent="0 / 0"});
document.getElementById("downloadHtmlBtn").addEventListener("click",()=>{const clone=document.documentElement.cloneNode(true),embedded=clone.querySelector("#embeddedCustomTerms");if(embedded)embedded.textContent=jsonForHtmlScript(customTerms);clone.querySelector("#startScreen")?.classList.remove("hidden");clone.querySelector("#endScreen")?.classList.add("hidden");clone.querySelector("#addTermScreen")?.classList.add("hidden");const cloneQuestion=clone.querySelector("#question"),cloneCategory=clone.querySelector("#category"),cloneProgress=clone.querySelector("#progress"),cloneScore=clone.querySelector("#score"),cloneFeedback=clone.querySelector("#feedback"),cloneNext=clone.querySelector("#nextBtn");if(cloneQuestion)cloneQuestion.textContent="Vyber nastavení a spusť hru";if(cloneCategory)cloneCategory.textContent="";if(cloneProgress)cloneProgress.textContent="0 / 0";if(cloneScore)cloneScore.textContent="Správně: 0";if(cloneFeedback){cloneFeedback.className="feedback";cloneFeedback.textContent=""}if(cloneNext)cloneNext.setAttribute("disabled","");const svgClone=clone.querySelector("#mapSvg");if(svgClone)svgClone.innerHTML="";clone.querySelectorAll('link[href],script[src]').forEach(el=>{const attr=el.tagName==="LINK"?"href":"src",value=el.getAttribute(attr)||"";if(value&&!/^https?:/i.test(value))el.setAttribute(attr,"https://bernio.cz/mapy/"+value.replace(/^\.\//,""))});const html="<!doctype html>\n"+clone.outerHTML,blob=new Blob([html],{type:"text/html;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="evropa_klikaci_mapa_s_vlastnimi_pojmy.html";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
document.getElementById("exportTermsBtn").addEventListener("click",()=>{const blob=new Blob([JSON.stringify(customTerms,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="evropa-vlastni-pojmy.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),500)});
document.getElementById("importTermsInput").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;try{const arr=JSON.parse(await file.text());if(!Array.isArray(arr))throw new Error();const imported=arr.filter(t=>t&&typeof t.n==="string"&&["pen","isl","sea","des","low","mnt"].includes(t.c)&&Number.isFinite(+t.lat)&&Number.isFinite(+t.lon)&&Number.isFinite(+t.r)).map(t=>({id:"custom-"+Date.now()+"-"+Math.random().toString(36).slice(2),n:t.n.trim(),c:t.c,lat:+t.lat,lon:+t.lon,r:+t.r,ct:(t.ct==="asia"?"asia":currentContinent),custom:true}));customTerms=customTerms.concat(imported);saveCustomTerms();renderTermSelectors();alert(`Importováno: ${imported.length} pojmů.`)}catch(err){alert("Soubor se nepodařilo načíst jako platný export vlastních pojmů.")}finally{e.target.value=""}});
async function init(){try{setLoadingTarget(12);if(!window.d3||!window.topojson)throw new Error("Nepodařilo se načíst knihovnu mapy.");setLoadingTarget(28);const [world,marine]=await Promise.all([getWorld(),getMarine()]);setLoadingTarget(70);countriesFeature=topojson.feature(world,world.objects.countries);marineFeatures=marine||[];setLoadingTarget(80);buildLandComponents();targetGeometryCache.clear();targetSampleCache.clear();currentContinent="eu";updateContinentTexts();prepareRenderCaches();sizeMap();setLoadingTarget(98);ready=true;locked=true;renderTermSelectors();document.getElementById("startBtn").disabled=false;qEl.textContent="Vyber nastavení a spusť hru";finishLoading()}catch(e){console.error(e);clearInterval(loadingTimer);loading.className="loading error";loading.innerHTML="<div class=\"loading-box\"><div class=\"loading-title\">Mapy se nepodařilo načíst</div><button onclick=\"location.reload()\">Zkusit znovu</button></div>";qEl.textContent="Mapa se nenačetla"}}
init();
})();
