(() => {
  const API = (window.APP_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
  const $ = (id) => document.getElementById(id);
  let me = null, csrf = "", groups = [], documents = [], currentView = "overview";
  const roleRank = {viewer: 1, editor: 2, admin: 3};
  const isAdmin = () => me?.role === "admin";
  const canEdit = () => roleRank[me?.role] >= 2;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const date = (s) => s ? new Date(s + (String(s).length === 10 ? "T00:00:00Z" : "")).toLocaleDateString() : "—";
  function toast(msg, bad=false) { const el=$("toast"); el.textContent=msg; el.style.background=bad?"#8d1721":"#242121"; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3200); }
  async function api(path, options={}) {
    const headers = {"Content-Type":"application/json", ...(options.headers||{})};
    if (csrf && !["GET","HEAD"].includes((options.method||"GET").toUpperCase())) headers["X-CSRF-Token"]=csrf;
    const res = await fetch(API + path, {...options, headers, credentials:"include"});
    const data = await res.json().catch(()=>({error:"Unexpected server response"}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  function showLogin() { $("login-screen").classList.remove("hidden"); $("app").classList.add("hidden"); }
  function showApp() { $("login-screen").classList.add("hidden"); $("app").classList.remove("hidden"); }
  function setRoleUI() {
    document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",!isAdmin()));
    document.querySelectorAll(".editor-only").forEach(el=>el.classList.toggle("hidden",!canEdit()));
    $("sidebar-user").textContent=me.name || me.email;
    $("sidebar-role").textContent=me.role;
    $("user-avatar").textContent=(me.name||me.email).slice(0,1).toUpperCase();
    $("account-button").textContent=(me.name||me.email).slice(0,1).toUpperCase();
  }
  async function init() {
    try { await api("/api/setup"); } catch(e) { toast(e.message,true); }
    $("okta-login").href=API+"/auth/okta";
    try {
      const data=await api("/api/me"); me=data.user; csrf=data.csrfToken;
      showApp(); setRoleUI(); await loadAll(); navigate("overview");
    } catch { showLogin(); }
  }
  async function loadAll() {
    const [g,d]=await Promise.all([api("/api/groups"),api("/api/documents?status=all")]);
    groups=g.groups; documents=d.documents;
    renderOverview();
    renderGroupOptions();
    renderDocuments();
    renderGroups();
    if(isAdmin()) { await renderUsers(); await renderAudit(); }
  }
  function navigate(view) {
    if((view==="users"||view==="audit")&&!isAdmin()) view="overview";
    currentView=view;
    document.querySelectorAll(".view").forEach(el=>el.classList.add("hidden"));
    $("view-"+view).classList.remove("hidden");
    document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
    $("page-title").textContent=({overview:"Overview",documents:"Documents",groups:"Groups",users:"Users",audit:"Audit log"})[view];
  }
  function groupName(id){return groups.find(g=>g.id===id)?.name||"Unassigned";}
  function renderOverview(){
    const active=documents.filter(d=>!d.archived_at), archived=documents.length-active.length;
    $("stat-documents").textContent=active.length;
    $("stat-groups").textContent=groups.filter(g=>!g.archived_at).length;
    $("stat-archived").textContent=archived;
    if(isAdmin()) $("stat-users").textContent="…";
    const recent=[...documents].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,6);
    $("recent-documents").innerHTML=tableHTML(recent,false);
  }
  function tableHTML(rows,actions=true){
    if(!rows.length)return '<div class="empty">No records found.</div>';
    return `<table><thead><tr><th>Document ID</th><th>Document name</th><th>Author</th><th>Group</th><th>Registered</th><th>Status</th>${actions?'<th></th>':''}</tr></thead><tbody>${rows.map(d=>`<tr>
      <td><span class="doc-id">${esc(d.document_id)}</span></td><td><span class="doc-title">${esc(d.name)}</span></td><td>${esc(d.author)}</td><td>${esc(groupName(d.group_id))}</td><td>${date(d.created_at)}</td><td><span class="pill ${d.archived_at?'':'green'}">${d.archived_at?'Archived':'Active'}</span></td>
      ${actions?`<td><div class="row-actions"><button class="small-action" data-detail="${d.id}">View</button>${canEdit()&&!d.archived_at?`<button class="small-action" data-edit="${d.id}">Edit</button>`:''}${isAdmin()?`<button class="small-action" data-archive="${d.id}" data-archived="${!!d.archived_at}">${d.archived_at?'Restore':'Archive'}</button>`:''}</div></td>`:''}
    </tr>`).join("")}</tbody></table>`;
  }
  function renderDocuments(){
    const q=$("document-search").value.toLowerCase(), group=$("document-group-filter").value, status=$("document-status-filter").value;
    const rows=documents.filter(d=>{
      const hay=[d.document_id,d.name,d.author,d.notes,groupName(d.group_id)].join(" ").toLowerCase();
      return (!q||hay.includes(q))&&(!group||d.group_id===group)&&(status==="all"||(status==="archived"?!!d.archived_at:!d.archived_at));
    });
    $("documents-table").innerHTML=tableHTML(rows,true);
  }
  function renderGroupOptions(){
    const opts=groups.filter(g=>!g.archived_at).map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join("");
    $("document-group").innerHTML='<option value="">Select a group</option>'+opts;
    $("document-group-filter").innerHTML='<option value="">All groups</option>'+opts;
  }
  function renderGroups(){
    $("groups-grid").innerHTML=groups.length?groups.map(g=>`<article class="group-card"><div class="group-icon">▣</div><h3>${esc(g.name)}</h3><p>${esc(g.description||"No description provided.")}</p><div class="group-card-footer"><span class="muted tiny">${documents.filter(d=>d.group_id===g.id&&!d.archived_at).length} active documents ${g.archived_at?" · Archived":""}</span>${isAdmin()?`<div><button class="small-action" data-group-edit="${g.id}">Edit</button>${!g.archived_at?`<button class="small-action" data-group-archive="${g.id}">Archive</button>`:""}</div>`:""}</div></article>`).join(""):'<div class="empty">No groups have been created yet.</div>';
  }
  async function renderUsers(){
    const data=await api("/api/users");
    $("stat-users").textContent=data.users.filter(u=>u.active).length;
    $("users-table").innerHTML=`<table><thead><tr><th>User</th><th>Role</th><th>Login</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${data.users.map(u=>`<tr><td><strong>${esc(u.name)}</strong><br><span class="muted">${esc(u.email)}</span></td><td><span class="pill">${esc(u.role)}</span></td><td>${u.has_okta?"Native + Okta":"Native"}</td><td><span class="pill ${u.active?'green':'red'}">${u.active?'Active':'Disabled'}</span></td><td>${date(u.created_at)}</td><td><button class="small-action" data-user-toggle="${u.id}" data-active="${u.active}">${u.active?'Disable':'Enable'}</button></td></tr>`).join("")}</tbody></table>`;
  }
  async function renderAudit(){
    const data=await api("/api/audit");
    $("audit-table").innerHTML=data.logs.length?`<table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Object</th><th>Details</th></tr></thead><tbody>${data.logs.map(l=>`<tr><td>${new Date(l.created_at).toLocaleString()}</td><td>${esc(l.actor_email||"System")}</td><td>${esc(l.action)}</td><td>${esc(l.object_type)} ${esc(l.object_id||"")}</td><td>${esc(l.details||"")}</td></tr>`).join("")}</tbody></table>`:'<div class="empty">No audit entries yet.</div>';
  }
  function openDocument(id){
    const d=documents.find(x=>x.id===id); if(!d)return;
    $("document-id").value=d.id;$("document-name").value=d.name;$("document-author").value=d.author;$("document-group").value=d.group_id;$("document-notes").value=d.notes||"";
    $("document-modal-title").textContent="Edit document";$("document-dialog").showModal();
  }
  function newDocument(){
    $("document-form").reset();$("document-id").value="";$("document-modal-title").textContent="Register document";$("document-dialog").showModal();
  }
  function detail(id){
    const d=documents.find(x=>x.id===id);if(!d)return;
    $("detail-content").innerHTML=`<div class="modal-heading"><div><span class="eyebrow">DOCUMENT RECORD</span><h3>${esc(d.name)}</h3><span class="doc-id">${esc(d.document_id)}</span></div><button class="icon-button" data-close="detail-dialog">×</button></div>
    <div class="detail-grid"><div class="detail-item"><small>Author</small><strong>${esc(d.author)}</strong></div><div class="detail-item"><small>Group</small><strong>${esc(groupName(d.group_id))}</strong></div><div class="detail-item"><small>Registered</small><strong>${date(d.created_at)}</strong></div><div class="detail-item"><small>Registered by</small><strong>${esc(d.created_by_email||"—")}</strong></div><div class="detail-item"><small>Last modified</small><strong>${date(d.updated_at)}</strong></div><div class="detail-item"><small>Status</small><strong>${d.archived_at?"Archived":"Active"}</strong></div></div><h4>Notes</h4><div class="detail-notes">${esc(d.notes||"No notes recorded.")}</div>`;
    $("detail-dialog").showModal();
  }
  async function refresh(){await loadAll();}
  $("login-form").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/api/login",{method:"POST",body:JSON.stringify({email:$("login-email").value,password:$("login-password").value})});me=d.user;csrf=d.csrfToken;showApp();setRoleUI();await loadAll();navigate("overview");toast("Signed in successfully.");}catch(err){toast(err.message,true);}});
  $("logout-button").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST",body:"{}"});}catch{}me=null;csrf="";showLogin();});
  $("account-button").addEventListener("click",()=>$("password-dialog").showModal());
  $("password-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/password",{method:"POST",body:JSON.stringify({currentPassword:$("current-password").value,newPassword:$("next-password").value})});$("password-dialog").close();$("password-form").reset();toast("Password updated.");}catch(err){toast(err.message,true);}});
  document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.goto)));
  $("new-document").addEventListener("click",newDocument);$("quick-register").addEventListener("click",()=>{navigate("documents");newDocument();});
  $("document-form").addEventListener("submit",async e=>{e.preventDefault();const id=$("document-id").value;const body={name:$("document-name").value,author:$("document-author").value,group_id:$("document-group").value,notes:$("document-notes").value};try{if(id)await api("/api/documents/"+id,{method:"PUT",body:JSON.stringify(body)});else await api("/api/documents",{method:"POST",body:JSON.stringify(body)});$("document-dialog").close();await refresh();toast(id?"Document updated.":"Document registered.");}catch(err){toast(err.message,true);}});
  $("document-search").addEventListener("input",renderDocuments);$("document-group-filter").addEventListener("change",renderDocuments);$("document-status-filter").addEventListener("change",renderDocuments);
  $("new-group").addEventListener("click",()=>{$("group-form").reset();$("group-id").value="";$("group-modal-title").textContent="Create group";$("group-dialog").showModal();});
  $("group-form").addEventListener("submit",async e=>{e.preventDefault();const id=$("group-id").value,body={name:$("group-name").value,description:$("group-description").value};try{if(id)await api("/api/groups/"+id,{method:"PUT",body:JSON.stringify(body)});else await api("/api/groups",{method:"POST",body:JSON.stringify(body)});$("group-dialog").close();await refresh();toast("Group saved.");}catch(err){toast(err.message,true);}});
  $("new-user").addEventListener("click",()=>$("user-dialog").showModal());
  $("user-form").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/users",{method:"POST",body:JSON.stringify({email:$("new-user-email").value,name:$("new-user-name").value,password:$("new-user-password").value,role:$("new-user-role").value})});$("user-dialog").close();$("user-form").reset();await renderUsers();toast("User created.");}catch(err){toast(err.message,true);}});
  document.addEventListener("click",async e=>{
    const t=e.target;
    if(t.dataset.close){$(t.dataset.close).close();return;}
    if(t.dataset.detail)detail(t.dataset.detail);
    if(t.dataset.edit)openDocument(t.dataset.edit);
    if(t.dataset.archive){const restore=t.dataset.archived==="true";if(confirm(`${restore?"Restore":"Archive"} this document?`)){try{await api(`/api/documents/${t.dataset.archive}/${restore?"restore":"archive"}`,{method:"POST",body:"{}"});await refresh();toast(restore?"Document restored.":"Document archived.");}catch(err){toast(err.message,true);}}}
    if(t.dataset.groupEdit){const g=groups.find(x=>x.id===t.dataset.groupEdit);if(g){$("group-id").value=g.id;$("group-name").value=g.name;$("group-description").value=g.description||"";$("group-modal-title").textContent="Edit group";$("group-dialog").showModal();}}
    if(t.dataset.groupArchive&&confirm("Archive this group? Documents will remain in the registry.")){try{await api(`/api/groups/${t.dataset.groupArchive}/archive`,{method:"POST",body:"{}"});await refresh();toast("Group archived.");}catch(err){toast(err.message,true);}}
    if(t.dataset.userToggle){try{await api(`/api/users/${t.dataset.userToggle}`,{method:"PUT",body:JSON.stringify({active:t.dataset.active!=="true"})});await renderUsers();toast("User updated.");}catch(err){toast(err.message,true);}}
  });
  document.addEventListener("click",e=>{if(e.target.matches("dialog"))e.target.close();});
  init();
})();
