import{ai as y,aa as R,bt as Y,a1 as tt,K as et,M as at,u as rt,v as nt,x as it,w as st,_ as g,G as W,T as ot,y as lt,a2 as ct,a6 as ut,ar as pt,H as gt}from"./index-f9acd36f.js";import{p as dt}from"./chunk-4BX2VUAB-e395cde0.js";import{p as ft}from"./mermaid-parser.core-41f8d42c.js";import{d as _}from"./arc-03043b03.js";import{o as ht}from"./ordinal-ba9b4969.js";import"./init-77b53fdd.js";function mt(t,a){return a<t?-1:a>t?1:a>=t?0:NaN}function vt(t){return t}function xt(){var t=vt,a=mt,f=null,S=y(0),s=y(R),d=y(0);function o(e){var n,l=(e=Y(e)).length,c,h,v=0,u=new Array(l),i=new Array(l),x=+S.apply(this,arguments),w=Math.min(R,Math.max(-R,s.apply(this,arguments)-x)),m,D=Math.min(Math.abs(w)/l,d.apply(this,arguments)),$=D*(w<0?-1:1),p;for(n=0;n<l;++n)(p=i[u[n]=n]=+t(e[n],n,e))>0&&(v+=p);for(a!=null?u.sort(function(A,C){return a(i[A],i[C])}):f!=null&&u.sort(function(A,C){return f(e[A],e[C])}),n=0,h=v?(w-l*$)/v:0;n<l;++n,x=m)c=u[n],p=i[c],m=x+(p>0?p*h:0)+$,i[c]={data:e[c],index:n,value:p,startAngle:x,endAngle:m,padAngle:D};return i}return o.value=function(e){return arguments.length?(t=typeof e=="function"?e:y(+e),o):t},o.sortValues=function(e){return arguments.length?(a=e,f=null,o):a},o.sort=function(e){return arguments.length?(f=e,a=null,o):f},o.startAngle=function(e){return arguments.length?(S=typeof e=="function"?e:y(+e),o):S},o.endAngle=function(e){return arguments.length?(s=typeof e=="function"?e:y(+e),o):s},o.padAngle=function(e){return arguments.length?(d=typeof e=="function"?e:y(+e),o):d},o}var V=tt.pie,z={sections:new Map,showData:!1,config:V},T=z.sections,F=z.showData,yt=structuredClone(V),St=g(()=>structuredClone(yt),"getConfig"),wt=g(()=>{T=new Map,F=z.showData,ot()},"clear"),At=g(({label:t,value:a})=>{if(a<0)throw new Error(`"${t}" has invalid value: ${a}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);T.has(t)||(T.set(t,a),W.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),Ct=g(()=>T,"getSections"),Dt=g(t=>{F=t},"setShowData"),$t=g(()=>F,"getShowData"),U={getConfig:St,clear:wt,setDiagramTitle:et,getDiagramTitle:at,setAccTitle:rt,getAccTitle:nt,setAccDescription:it,getAccDescription:st,addSection:At,getSections:Ct,setShowData:Dt,getShowData:$t},Tt=g((t,a)=>{dt(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),Mt={parse:g(async t=>{const a=await ft("pie",t);W.debug(a),Tt(a,U)},"parse")},bt=g(t=>`
  .pieCircle{
    stroke: ${t.pieStrokeColor};
    stroke-width : ${t.pieStrokeWidth};
    opacity : ${t.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${t.pieOuterStrokeColor};
    stroke-width: ${t.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${t.pieTitleTextSize};
    fill: ${t.pieTitleTextColor};
    font-family: ${t.fontFamily};
  }
  .slice {
    font-family: ${t.fontFamily};
    fill: ${t.pieSectionTextColor};
    font-size:${t.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${t.pieLegendTextColor};
    font-family: ${t.fontFamily};
    font-size: ${t.pieLegendTextSize};
  }
`,"getStyles"),kt=bt,Et=g(t=>{const a=[...t.values()].reduce((s,d)=>s+d,0),f=[...t.entries()].map(([s,d])=>({label:s,value:d})).filter(s=>s.value/a*100>=1);return xt().value(s=>s.value).sort(null)(f)},"createPieArcs"),Rt=g((t,a,f,S)=>{var P;W.debug(`rendering pie chart
`+t);const s=S.db,d=lt(),o=ct(s.getConfig(),d.pie),e=40,n=18,l=4,c=450,h=c,v=ut(a),u=v.append("g");u.attr("transform","translate("+h/2+","+c/2+")");const{themeVariables:i}=d;let[x]=pt(i.pieOuterStrokeWidth);x??(x=2);const w=o.textPosition,m=Math.min(h,c)/2-e,D=_().innerRadius(0).outerRadius(m),$=_().innerRadius(m*w).outerRadius(m*w);u.append("circle").attr("cx",0).attr("cy",0).attr("r",m+x/2).attr("class","pieOuterCircle");const p=s.getSections(),A=Et(p),C=[i.pie1,i.pie2,i.pie3,i.pie4,i.pie5,i.pie6,i.pie7,i.pie8,i.pie9,i.pie10,i.pie11,i.pie12];let M=0;p.forEach(r=>{M+=r});const G=A.filter(r=>(r.data.value/M*100).toFixed(0)!=="0"),b=ht(C).domain([...p.keys()]);u.selectAll("mySlices").data(G).enter().append("path").attr("d",D).attr("fill",r=>b(r.data.label)).attr("class","pieCircle"),u.selectAll("mySlices").data(G).enter().append("text").text(r=>(r.data.value/M*100).toFixed(0)+"%").attr("transform",r=>"translate("+$.centroid(r)+")").style("text-anchor","middle").attr("class","slice");const j=u.append("text").text(s.getDiagramTitle()).attr("x",0).attr("y",-(c-50)/2).attr("class","pieTitleText"),L=[...p.entries()].map(([r,E])=>({label:r,value:E})),k=u.selectAll(".legend").data(L).enter().append("g").attr("class","legend").attr("transform",(r,E)=>{const I=n+l,q=I*L.length/2,J=12*n,Q=E*I-q;return"translate("+J+","+Q+")"});k.append("rect").attr("width",n).attr("height",n).style("fill",r=>b(r.label)).style("stroke",r=>b(r.label)),k.append("text").attr("x",n+l).attr("y",n-l).text(r=>s.getShowData()?`${r.label} [${r.value}]`:r.label);const H=Math.max(...k.selectAll("text").nodes().map(r=>(r==null?void 0:r.getBoundingClientRect().width)??0)),K=h+e+n+l+H,N=((P=j.node())==null?void 0:P.getBoundingClientRect().width)??0,X=h/2-N/2,Z=h/2+N/2,B=Math.min(0,X),O=Math.max(K,Z)-B;v.attr("viewBox",`${B} 0 ${O} ${c}`),gt(v,c,O,o.useMaxWidth)},"draw"),Wt={draw:Rt},Pt={parser:Mt,db:U,renderer:Wt,styles:kt};export{Pt as diagram};
