L=s=>"$lib:"+s;
SEC=L("color-text-secondary");
T=(c,o)=>({type:"text",content:c,fontFamily:L("font-family-base"),lineHeight:L("line-height-normal"),fontSize:L("font-size-sm"),fontWeight:L("font-weight-normal"),fill:L("color-text-primary"),...o});
P=n=>Get(x=>x.reusable&&x.name===n&&!String(x.id).includes(":")?x.id:undefined)[0];
SALINK=()=>Get(P("Group Footer / Show All"),{depth:1}).children.find(x=>x.name==="Link").id+"/lib:KvG5F";
FR=(p,d)=>{
  const ds={Swatch:{fill:L("track-"+d.c)},Route:{width:"fill_container",clip:true},Takeoff:{content:d.t},Landing:{content:d.l},Meta:{content:d.m},"Primary Value":{content:d.a},"Secondary Value":{content:d.k}};
  let ref;
  if(d.s){ref=P("List Item / Flight Standout")}
  else{ref=d.cur?"lib:PbvOJ":"lib:XUJMf";ds.Date={enabled:false};ds.Meta.fill=SEC;ds["Secondary Value"].fill=SEC}
  let ex={};
  if(d.cur&&d.s)ex={fill:L("color-secondary-a14"),stroke:L("color-secondary"),strokeWidth:{left:2}};
  if(d.focus)ex={fill:L("color-secondary-a14"),stroke:L("color-secondary-hover"),strokeWidth:2};
  return Insert(p,{type:"ref",ref,name:(d.s?"Flight (standout) · ":"Flight · ")+d.t+" → "+d.l,width:"fill_container",...ex,descendants:ds});
};
GH=(p,m,s)=>Insert(p,{type:"ref",ref:P("Group Heading / Month"),name:"Heading · "+m,width:"fill_container",descendants:{Month:{content:m},Summary:{content:s}}});
SA=(p,f)=>{
  const ds={[SALINK()]:{content:f.txt},Chevron:{icon:f.icon||"chevron-down"}};
  let ex={};
  if(f.hl){ex={fill:L("color-secondary-a14"),stroke:L("color-secondary"),strokeWidth:{left:2}};ds.Swatch={opacity:1,fill:L("track-"+f.hl)}}
  return Insert(p,{type:"ref",ref:P("Group Footer / Show All"),name:"Show all · "+f.txt,width:"fill_container",...ex,descendants:ds});
};
NOTE=(x,y,txt)=>Insert(document,{type:"note",name:"Annotation",x,y,width:340,height:420,content:txt,fontSize:14});
LIST=(c,groups)=>{
  const l=Insert(c,{type:"frame",name:"List",width:"fill_container",layout:"vertical"});
  for(const g of groups){
    const gf=Insert(l,{type:"frame",name:"Group · "+g.m,width:"fill_container",layout:"vertical"});
    GH(gf,g.m,g.s);
    for(const r of g.rows)FR(gf,r);
    if(g.foot)SA(gf,g.foot);
  }
  return l;
};
EMPTY=(c,q)=>{
  const e=Insert(c,{type:"frame",name:"No results",width:"fill_container",layout:"vertical",alignItems:"center",gap:L("space-2")});
  Insert(e,{type:"ref",ref:"lib:h3WFqR",name:"Empty State",width:"fill_container",padding:[L("space-8"),0,L("space-3"),0],descendants:{"lib:o2TMp":{content:"No flights match “"+q+"”"},"lib:c9hQz":{content:"Try the name of a site, pilot or wing."}}});
  Insert(e,{type:"ref",ref:"lib:Rwtga",name:"Clear search",descendants:{"lib:RNHy3":{content:"Clear search"}}});
};
SIGNUP_M=f=>Insert(f,{type:"ref",ref:"lib:U3xfi",name:"Signup Card",x:12,y:229,width:366,descendants:{"lib:fCkrA":{layout:"vertical",alignItems:"start"},"lib:rYq8G":{x:331,y:4}}});
MSHELL=(name,x,y,o)=>{
  const f=Insert(document,{type:"frame",name,x,y,width:390,height:844,clip:true,fill:L("color-background"),layout:"none"});
  Insert(f,{type:"ref",ref:o.close?"lib:aFpBc":"lib:Qh7A9",name:"Map",x:0,y:0,width:390,height:844});
  if(o.signup!==false)SIGNUP_M(f);
  return f;
};
MTOP=(f,signedIn)=>Insert(f,{type:"ref",ref:"lib:P3P4V",name:"Top Bar",x:12,y:12,descendants:signedIn?{"lib:c5b7t":{enabled:true},"lib:eiMMW":{enabled:true},"lib:IJxAo":{enabled:false}}:{}});
DSHELL=(name,x,y,o)=>{
  const f=Insert(document,{type:"frame",name,x,y,width:1440,height:900,clip:true,fill:L("color-background"),layout:"none"});
  Insert(f,{type:"ref",ref:o.close?"lib:aFpBc":"lib:Qh7A9",name:"Map",x:0,y:0,width:1440,height:900});
  return f;
};
DTOP=(f,signedIn)=>Insert(f,{type:"ref",ref:"lib:KBFdz",name:"Top Bar",x:12,y:12,descendants:signedIn?{"lib:Qzwiv":{enabled:true},"lib:XTMHX":{enabled:true},"lib:OCD2m":{enabled:true},"lib:Q2Lrxy":{enabled:false}}:{}});
DCHROME=f=>{
  Insert(f,{type:"ref",ref:"lib:U3xfi",name:"Signup Card",x:510,y:718});
  Insert(f,{type:"ref",ref:"lib:Za3H9",name:"Map Controls",x:1387,y:739});
};
HEADER=(c,sub)=>Insert(c,{type:"ref",ref:"lib:ujnbz",name:"Panel Header",width:"fill_container",descendants:{"lib:U2SULY":{content:"Flights"},"lib:Uql1b":{content:sub}}});
SEARCH=(c,s)=>s.q?Insert(c,{type:"ref",ref:"lib:KfWtd",name:"Search Field",width:"fill_container",descendants:{"lib:i4z0Bv":{content:s.q},"lib:c5OlPy":{content:s.cnt}}}):Insert(c,{type:"ref",ref:"lib:I7TSSb",name:"Search Field",width:"fill_container",descendants:{"lib:tAgdN":{content:"Search site, pilot or wing"},"lib:Is4Yr":{content:"165"}}});
TRACK=f=>{
  const g=Insert(f,{type:"frame",name:"Hovered track (illustrative)",x:560,y:300,width:140,height:110,layout:"none"});
  Insert(g,{type:"path",name:"Track halo",x:0,y:0,width:120,height:90,viewBox:[0,0,120,90],geometry:"M6 80 C 20 40, 34 70, 44 46 S 60 10, 72 28 S 92 60, 104 30 S 112 8, 116 6",stroke:"#FFFFFFCC",strokeWidth:9,strokeLinecap:"round",strokeLinejoin:"round"});
  Insert(g,{type:"path",name:"Track",x:0,y:0,width:120,height:90,viewBox:[0,0,120,90],geometry:"M6 80 C 20 40, 34 70, 44 46 S 60 10, 72 28 S 92 60, 104 30 S 112 8, 116 6",stroke:L("track-orange"),strokeWidth:5,strokeLinecap:"round",strokeLinejoin:"round"});
  Insert(g,{type:"icon",name:"Pointer",library:"lucide",icon:"mouse-pointer-2",x:66,y:24,width:26,height:26,fill:L("color-text-primary")});
};
BUILD=(sp,sub)=>{
  let f,c;
  if(sp.bp==="m"){
    f=MSHELL(sp.name,sp.x,sp.y,sp);
    const s=Insert(f,{type:"ref",ref:"lib:H3AEr",name:"Sheet",x:12,y:sp.sy,height:sp.sh});
    c=s+"/lib:iLH69";
    MTOP(f,false);
  }else{
    f=DSHELL(sp.name,sp.x,sp.y,sp);
    if(sp.hover)TRACK(f);
    const s=Insert(f,{type:"ref",ref:"lib:f9nhC",name:"Sheet",x:12,y:76,height:812});
    c=s+"/lib:K7AGVX";
    DCHROME(f);
    DTOP(f,false);
  }
  if(sp.header)HEADER(c,sub);
  if(sp.search)SEARCH(c,sp.search);
  if(sp.groups)LIST(c,sp.groups);
  if(sp.empty)EMPTY(c,sp.empty);
  return f;
};
SECTION=(c,label,right)=>{
  const h=Insert(c,{type:"frame",name:"Section · "+label,width:"fill_container",justifyContent:"space_between",alignItems:"center"});
  Insert(h,{type:"ref",ref:"lib:ONU82",name:"Section Title",descendants:{"lib:hlbdZ":{content:label}}});
  if(right)Insert(h,{type:"ref",ref:"lib:CfEDF",name:"See all",descendants:{"lib:KvG5F":{content:right}}});
  return h;
};
WING=(c,name,n,colour)=>Insert(c,{type:"ref",ref:"lib:WQVhX",name:"Item · "+name,width:"fill_container",descendants:{"lib:lTQaV":colour?{fill:L("track-"+colour)}:{enabled:false},"lib:v5x9U":{content:name},"lib:g4xSS":{content:n},"lib:F28nG":{enabled:false}}});
ROWS=(o)=>{
  const w=o.bp==="m"?390:1440;
  const f=Insert(document,{type:"frame",name:o.name,x:o.x,y:o.y,width:w,height:"fit_content",fill:L("color-background"),layout:o.bp==="m"?"vertical":"horizontal",gap:o.bp==="m"?L("space-8"):L("space-16"),padding:o.bp==="m"?[L("space-8"),L("space-6")]:[L("space-16"),L("space-20")]});
  let cols=[f];
  if(o.bp==="d"){cols=[0,1,2].map(i=>Insert(f,{type:"frame",name:"Column "+(i+1),width:"fill_container",layout:"vertical",gap:L("space-10")}))}
  const split=[0,4,7,o.items.length];
  o.items.forEach((it,i)=>{
    const col=o.bp==="d"?cols[split.findIndex(s=>i<s)-1]:f;
    const s=Insert(col,{type:"frame",name:"Specimen · "+it.label,width:o.bp==="m"?"fill_container":356,layout:"vertical",gap:L("space-3")});
    Insert(s,{type:"ref",ref:"lib:ONU82",name:"Caption",descendants:{"lib:hlbdZ":{content:it.label.toUpperCase(),fill:SEC}}});
    const b=Insert(s,{type:"frame",name:"Rows",width:"fill_container",layout:"vertical"});
    for(const p of it.parts){
      if(p.r)FR(b,p.r);
      if(p.h)GH(b,p.h[0],p.h[1]);
      if(p.f)SA(b,p.f);
    }
  });
  return f;
};
DASH=(o)=>{
  const m=o.bp==="m";
  const f=m?MSHELL(o.name,o.x,o.y,{close:true,signup:false}):DSHELL(o.name,o.x,o.y,{close:true});
  const g=Insert(f,{type:"ref",ref:"lib:qR1XQ",name:"Glass",x:m?12:120,y:76,width:m?366:1200,height:m?756:812,padding:m?L("space-6"):L("space-8"),descendants:{"lib:NdtqE":{height:"fill_container",justifyContent:"end"}}});const wg=Insert(g+"/lib:NdtqE",{type:"frame",name:"Wings",width:"fill_container",layout:"vertical",gap:L("space-4")});SECTION(wg,"YOUR WINGS");const wgl=Insert(wg,{type:"frame",name:"Wing List",width:"fill_container",layout:"vertical",gap:L("space-1")});WING(wgl,"Gin Bonanza 3","12","green");WING(wgl,"Ozone Rush 6","16","red");Insert(wg,{type:"ref",ref:"lib:Rwtga",name:"Add a wing"});
  const c=g+"/lib:NdtqE";
  const tk=Insert(c,{type:"frame",name:"Takeoffs",width:"fill_container",layout:"vertical",gap:L("space-4")});
  SECTION(tk,"YOUR TAKEOFFS");
  const tl=Insert(tk,{type:"frame",name:"Takeoff List",width:"fill_container",layout:"vertical",gap:L("space-1")});
  for(const [n,k] of o.takeoffs)WING(tl,n,k);
  const rc=Insert(c,{type:"frame",name:"Recent flights",width:"fill_container",layout:"vertical",gap:L("space-4")});
  SECTION(rc,"RECENT FLIGHTS","See all");
  const rl=Insert(rc,{type:"frame",name:"List",width:"fill_container",layout:"vertical"});
  for(const r of o.rows)FR(rl,r);
  Insert(c,{type:"ref",ref:"lib:orvD4",name:"Panel Footer",width:"fill_container"});
  if(m)MTOP(f,true);else DTOP(f,true);
  return f;
};
PILOT=(o)=>{
  const m=o.bp==="m";
  let f,c;
  if(m){
    f=MSHELL(o.name,o.x,o.y,{});
    const s=Insert(f,{type:"ref",ref:"lib:H3AEr",name:"Sheet",x:12,y:89,height:743});
    c=s+"/lib:iLH69";
  }else{
    f=DSHELL(o.name,o.x,o.y,{});
    const s=Insert(f,{type:"ref",ref:"lib:f9nhC",name:"Sheet",x:12,y:76,height:812});
    c=s+"/lib:K7AGVX";
  }
  {
    Insert(c,{type:"ref",ref:"lib:y8LGM",name:"Back Link",descendants:{"lib:H40LY":{content:"← All pilots"}}});
    Insert(c,{type:"ref",ref:"lib:ujnbz",name:"Panel Header",width:"fill_container",descendants:{"lib:U2SULY":{content:"Camille"},"lib:Uql1b":{content:"23 flights"}}});
    const facts=Insert(c,{type:"frame",name:"Facts",width:"fill_container",layout:"vertical",gap:L("space-4")});
    for(const pair of [[["Flights","23"],["Wings","2"]],[["Takeoffs","6"],["Landings","4"]]]){
      const r=Insert(facts,{type:"frame",name:"Facts Row",width:"fill_container",gap:L("space-5")});
      for(const [a,b] of pair)Insert(r,{type:"ref",ref:"lib:EHu4A",name:"Fact",width:"fill_container",descendants:{"lib:XGDEw":{content:a},"lib:Y9lo8L":{content:b}}});
    }
  }
  const w=Insert(c,{type:"frame",name:"Wings",width:"fill_container",layout:"vertical",gap:L("space-4")});
  SECTION(w,"WINGS");
  const wl=Insert(w,{type:"frame",name:"Wing List",width:"fill_container",layout:"vertical",gap:L("space-1")});
  WING(wl,"Advance Alpha 7","12");WING(wl,"Niviuk Artik 6","11");
  const fl=Insert(c,{type:"frame",name:"Flights",width:"fill_container",layout:"vertical",gap:L("space-4")});
  SECTION(fl,"FLIGHTS");
  const l=Insert(fl,{type:"frame",name:"List",width:"fill_container",layout:"vertical"});
  for(const r of o.rows)FR(l,r);
  if(m)MTOP(f,false);else{DCHROME(f);DTOP(f,false)}
  return f;
};
