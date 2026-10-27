(()=>{"use strict";
const input=document.getElementById("faultSearch");
const cards=[...document.querySelectorAll("#faultCards .ff-card")];
const chips=[...document.querySelectorAll(".ff-chip")];
const families=document.getElementById("familyFilter");
const count=document.getElementById("count"),empty=document.getElementById("noResults");
const missingAdvice=document.getElementById("missingAdvice"),missingSources=document.getElementById("missingSources");
if(!input||!families)return;
let category="All";
function normalise(s){
 return String(s||"").toLowerCase()
 .replace(/power[\s-]*flex/g,"powerflex")
 .replace(/\bf[\s-]*0*(\d{1,3})\b/g,(_,v)=>"f"+Number(v))
 .replace(/[^a-z0-9]+/g," ").trim();
}
function cardFamily(card){
 if(card.dataset.family)return card.dataset.family;
 const str=normalise(card.dataset.keywords+" "+card.textContent);
 if(str.includes("powerflex 40"))return "PowerFlex 40";
 if(str.includes("powerflex 525"))return "PowerFlex 525";
 if(str.includes("s7 300"))return "S7-300";
 if(str.includes("panelview plus"))return "PanelView Plus";
 if(str.includes("slc 500"))return "SLC 500";
 return "";
}
function update(){
 const q=normalise(input.value),terms=q?q.split(/\s+/):[];
 let shown=0;
 for(const card of cards){
  const words=normalise(card.dataset.keywords+" "+card.textContent).split(/\s+/);
  const matches=terms.every(term=>words.some(word=>word.includes(term)));
  const visible=matches&&(category==="All"||card.dataset.category===category)&&(families.value==="All"||cardFamily(card)===families.value||(cardFamily(card)==="Cross-family"&&families.value.startsWith("PowerFlex")));
  card.classList.toggle("ff-hide",!visible);
  if(visible)shown++;
 }
 count.textContent="("+shown+")";
 empty.classList.toggle("ff-hide",shown>0);
 if(shown===0){
  const powerflex=q.includes("powerflex")||q.includes("22b")||q.includes("25b")||families.value.startsWith("PowerFlex");
  missingAdvice.textContent=powerflex?
    "No verified guide for this exact query. Check the full 22B (PowerFlex 40) or 25B (PowerFlex 525) order number first: fault numbering can differ between series. Use the appropriate manufacturer fault table rather than guessing.":
    "We cannot safely identify this error without the manufacturer and exact equipment model. Try a more specific search or check its official manual.";
  missingSources.hidden=!powerflex;
 }
}
chips.forEach(chip=>chip.addEventListener("click",()=>{category=chip.dataset.filter;chips.forEach(x=>x.setAttribute("aria-pressed",String(x===chip)));update()}));
families.addEventListener("change",update);
input.addEventListener("input",update);
document.getElementById("searchForm").addEventListener("submit",e=>{e.preventDefault();const u=new URL(location.href);input.value.trim()?u.searchParams.set("q",input.value.trim()):u.searchParams.delete("q");history.replaceState(null,"",u);update();document.getElementById("faultCards").scrollIntoView({behavior:"smooth",block:"start"})});
input.value=new URL(location.href).searchParams.get("q")||"";
update();
})();