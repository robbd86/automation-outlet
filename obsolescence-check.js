// AO free quick check: client-side validation, accessible status and same-origin intake.
(() => {
  const form=document.getElementById("quickCheckForm");
  if(!form)return;
  const list=document.getElementById("qc-parts");
  const add=document.getElementById("qc-add");
  const urgent=document.getElementById("qc-urgent");
  const message=document.getElementById("qc-message");
  const submit=document.getElementById("qc-submit");
  let nextId=0;

  function renderRow() {
    if(list.children.length>=5)return;
    const id=++nextId;
    const row=document.createElement("div");
    row.className="qc-part";
    row.innerHTML=
      '<div class="qc-field"><label for="part-'+id+'">Part number *</label><input id="part-'+id+'" name="part" type="text" maxlength="40" required placeholder="e.g. 6ES7315-2AG10-0AB0" autocapitalize="characters" spellcheck="false"></div>'+
      '<div class="qc-field"><label for="maker-'+id+'">Make</label><select id="maker-'+id+'" name="manufacturer"><option>Not sure</option><option>Siemens</option><option>Allen-Bradley</option><option>Omron</option><option>Mitsubishi</option><option>Other</option></select></div>'+
      '<div class="qc-field"><label for="qty-'+id+'">Qty installed</label><input id="qty-'+id+'" name="quantity" type="number" min="1" max="999" step="1" placeholder="–"></div>'+
      '<button class="qc-remove" type="button" aria-label="Remove part number '+id+'">×</button>';
    row.querySelector("button").addEventListener("click",()=>{
      row.remove();
      if(!list.children.length)renderRow();
      updateAdd();
    });
    list.append(row);
    updateAdd();
    if(list.children.length>1)row.querySelector("input[name=part]").focus();
  }
  function updateAdd(){
    add.disabled=list.children.length>=5;
    add.textContent=add.disabled?"Maximum 5 part numbers":"+ Add another part number";
  }
  function alert(text,status){
    message.textContent=text;
    message.dataset.status=status;
    message.scrollIntoView({block:"nearest",behavior:"smooth"});
  }
  function collect(){
    const parts=[...list.querySelectorAll(".qc-part")].map(row=>({
      code:row.querySelector("[name=part]").value.trim().toUpperCase().replace(/\s+/g," "),
      manufacturer:row.querySelector("[name=manufacturer]").value,
      quantity:row.querySelector("[name=quantity]").value
    }));
    const codes=parts.map(p=>p.code.replace(/\s+/g,""));
    if(codes.some(code=>!/^[A-Z0-9.+/-]{4,40}$/.test(code)))throw Error("Please check each full order code (4–40 characters, letters/numbers and - / . +).");
    if(new Set(codes).size!==codes.length)throw Error("Please remove duplicate part numbers.");
    return {
      parts,name:document.getElementById("qc-name").value,
      company:document.getElementById("qc-company").value,
      email:document.getElementById("qc-email").value,
      phone:document.getElementById("qc-phone").value,
      machine:document.getElementById("qc-machine").value,
      urgency:form.querySelector('input[name="urgency"]:checked')?.value,
      intent:form.querySelector('input[name="intent"]:checked')?.value,
      processingConsent:document.getElementById("qc-consent").checked,
      marketingConsent:document.getElementById("qc-marketing").checked,
      website:document.getElementById("qc-website").value,
      sourcePage:location.pathname,
      utmCampaign:new URLSearchParams(location.search).get("utm_campaign")||""
    };
  }
  add.addEventListener("click",renderRow);
  form.querySelectorAll('input[name="urgency"]').forEach(el=>el.addEventListener("change",()=>{
    urgent.hidden=form.querySelector('input[name="urgency"]:checked')?.value!=="Machine is down now";
  }));
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    message.removeAttribute("data-status");
    if(!form.reportValidity())return;
    let data;
    try{data=collect();}catch(error){alert(error.message,"error");return;}
    submit.disabled=true;submit.textContent="Sending secure request…";
    try{
      const response=await fetch("/api/obsolescence-check",{
        method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(data)
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.ok)throw Error(payload.error||"Could not send your request. Please email us instead.");
      const n=payload.count||data.parts.length;
      alert("Thanks — we've received "+n+" part number"+(n===1?"":"s")+". Reference: "+(payload.reference||"submitted")+". We aim to respond within two working days. Machine down? WhatsApp 07849 506371.","success");
      form.reset();list.replaceChildren();renderRow();urgent.hidden=true;
    }catch(error){alert(error.message||"Could not send the request.","error");}
    finally{submit.disabled=false;submit.textContent="Send my free check →";}
  });
  renderRow();
  const toggle=document.getElementById("navToggle"),menu=document.getElementById("mobileMenu");
  toggle?.addEventListener("click",()=>{const open=menu.classList.toggle("open");toggle.setAttribute("aria-expanded",String(open));});
})();