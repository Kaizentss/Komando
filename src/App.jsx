import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, Plus, Users, Car, FileText, DollarSign, MessageSquare, 
  Settings, ChevronRight, Building2, Wrench, CheckCircle, AlertCircle, 
  X, Save, CreditCard, Home, BarChart3, Trash2, Zap, Loader2, Send,
  Edit2, UserCog, Clock, Package, Tag, Upload, Image, File, Video,
  StickyNote, Eye, EyeOff, Camera, LogOut, Lock, User, ArrowLeft, ArrowUp, ArrowDown, Archive, ArchiveRestore,
  Clipboard, ChevronDown, CircleDot, Printer, Layers, FolderPlus, ChevronUp,
  MapPin, Shield, SlidersHorizontal, Globe, Database, Download, RefreshCw,
  PowerOff, Key, AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ─── Constants ────────────────────────────────────────────────────────────────
const ITEM_TYPES = [
  { id: 'labor', name: 'Labor', icon: Clock },
  { id: 'part', name: 'Part', icon: Package },
  { id: 'fee', name: 'Fee', icon: Tag },
];

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const DEFAULT_SETTINGS = { laborRate: 125.00, taxRate: 9, shopName: '', phone: '', email: '' };

const ROLES = [
  { id: 'master_admin', label: 'Master Admin', desc: 'Full company control' },
  { id: 'admin',        label: 'Admin',        desc: 'Manage users & docs at their location' },
  { id: 'technician',   label: 'Technician',   desc: 'Create and edit work orders' },
];

function resolveSettings(globalSettings, location) {
  if (!location) return globalSettings;
  return {
    ...globalSettings,
    laborRate: location.laborRate ?? globalSettings.laborRate,
    taxRate:   location.taxRate   ?? globalSettings.taxRate,
    shopName:  location.name      || globalSettings.shopName,
    phone:     location.phone     || globalSettings.phone,
    email:     location.email     || globalSettings.email,
  };
}

function canManageUser(actor, target) {
  if (actor.role === 'master_admin') return true;
  if (actor.role === 'admin' && target.role === 'technician' && target.locationId === actor.locationId) return true;
  return false;
}

function calcItemTotal(item, laborRate) {
  if (item.type === 'labor') return (item.hours || 0) * (item.rate || laborRate);
  if (item.type === 'part') return (item.quantity || 1) * (item.cost || 0);
  if (item.type === 'fee') return item.price || 0;
  return 0;
}

// Compute total discount dollars for a set of items given a customer's discount config
// customer.discount = percentage (e.g. 25), customer.discountAppliesTo = {labor,parts,fees}
function calcDiscountAmount(items, laborRate, customer) {
  if (!customer?.discount || parseFloat(customer.discount) <= 0) return 0;
  const pct = parseFloat(customer.discount) / 100;
  const applies = customer.discountAppliesTo || { labor: true, parts: true, fees: true };
  return items.reduce((sum, item) => {
    const total = calcItemTotal(item, laborRate);
    if (item.type === 'labor' && applies.labor) return sum + total * pct;
    if (item.type === 'part'  && applies.parts) return sum + total * pct;
    if (item.type === 'fee'   && applies.fees)  return sum + total * pct;
    return sum;
  }, 0);
}

// ─── VIN Decoder ──────────────────────────────────────────────────────────────
async function decodeVIN(vin) {
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vin}?format=json`);
    const data = await res.json();
    if (data.Results?.[0]) {
      const r = data.Results[0];
      if (!r.Make && !r.Model) return { success: false, error: 'Invalid VIN' };
      let engineStr = '';
      if (r.DisplacementL) { engineStr = `${r.DisplacementL}L`; if (r.EngineCylinders) engineStr += ` ${r.EngineCylinders}-Cyl`; }
      let transType = r.TransmissionStyle || '';
      if (!transType && r.TransmissionSpeeds) transType = `${r.TransmissionSpeeds}-Speed`;
      const transLower = (transType + ' ' + (r.DriveType || '')).toLowerCase();
      if (transLower.includes('automatic') || transLower.includes('auto') || transLower.includes('cvt') || transLower.includes('dct'))
        transType = transType ? `${transType} (Automatic)` : 'Automatic';
      else if (transLower.includes('manual') || transLower.includes('mt'))
        transType = transType ? `${transType} (Manual)` : 'Manual';
      return { success: true, vin, year: r.ModelYear||'', make: r.Make||'', model: r.Model||'', trim: r.Trim||'',
        engineLiters: r.DisplacementL||'', engineCylinders: r.EngineCylinders||'', engineModel: r.EngineModel||'',
        engine: engineStr, transmission: transType, transmissionSpeeds: r.TransmissionSpeeds||'',
        bodyType: r.BodyClass||'', driveType: r.DriveType||'', fuelType: r.FuelTypePrimary||'' };
    }
    return { success: false, error: 'No results' };
  } catch (e) { return { success: false, error: e.message }; }
}

// ─── API Layer ────────────────────────────────────────────────────────────────
const API_URL = '';

// Company-scoped storage key prefix
function lsKey(companyId, key) { return `kf_${companyId}_${key}`; }

function loadData(companyId, key, def) {
  try { const s = localStorage.getItem(lsKey(companyId, key)); return s ? JSON.parse(s) : def; } catch { return def; }
}

async function saveDataToAPI(companyId, key, data) {
  try {
    const res = await fetch(`${API_URL}/api/company/${companyId}/data/${key}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: data })
    });
    if (!res.ok) console.warn(`API save failed for ${key}:`, res.status);
  } catch (e) { console.warn('API save error:', e); }
}

function saveData(companyId, key, data) {
  try {
    localStorage.setItem(lsKey(companyId, key), JSON.stringify(data));
    saveDataToAPI(companyId, key, data);
  } catch (e) { console.warn('saveData error:', e); }
}

async function loadAllFromAPI(companyId) {
  try {
    const res = await fetch(`${API_URL}/api/company/${companyId}/data`);
    if (res.ok) {
      const apiData = await res.json();
      // Merge: API is authoritative for keys it returns with data.
      // For each key, pick whichever has more data (protects against a brand-new
      // server DB overwriting a richer localStorage on first login after deploy).
      const ARRAY_KEYS = ['customers','vehicles','estimates','invoices','users','locations'];
      for (const [key, apiVal] of Object.entries(apiData)) {
        let lsVal;
        try { lsVal = JSON.parse(localStorage.getItem(lsKey(companyId, key))); } catch { lsVal = null; }
        let winner = apiVal;
        if (ARRAY_KEYS.includes(key)) {
          const apiLen = Array.isArray(apiVal) ? apiVal.length : 0;
          const lsLen  = Array.isArray(lsVal)  ? lsVal.length  : 0;
          if (lsLen > apiLen) {
            // localStorage has more data — push it up to the API then keep it
            winner = lsVal;
            saveDataToAPI(companyId, key, lsVal);
          }
        }
        localStorage.setItem(lsKey(companyId, key), JSON.stringify(winner));
      }
      return apiData;
    }
  } catch (e) { console.warn('API load failed, using localStorage:', e); }
  return null;
}

// ─── Super Admin Console ──────────────────────────────────────────────────────
function SuperAdminConsole({ onExit }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('companies');
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({ companyName:'', companyId:'', masterAdminName:'', masterAdminPin:'', masterAdminEmail:'' });
  const [restoring, setRestoring] = useState(false);
  const restoreRef = useRef();

  // Accounts state
  const [accounts, setAccounts] = useState([]);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [newAccount, setNewAccount] = useState({ username:'', password:'' });
  const [currentSaId, setCurrentSaId] = useState(() => { try { return JSON.parse(localStorage.getItem('kf_sa_session')||'null')?.id; } catch { return null; }});

  const notify = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  useEffect(() => { fetchCompanies(); fetchAccounts(); }, []);

  const fetchCompanies = async () => {
    setLoading(true);
    try { const res = await fetch(`${API_URL}/api/superadmin/companies`); if (res.ok) setCompanies(await res.json()); } catch {}
    setLoading(false);
  };

  const fetchAccounts = async () => {
    try { const res = await fetch(`${API_URL}/api/superadmin/accounts`); if (res.ok) setAccounts(await res.json()); } catch {}
  };

  const createCompany = async () => {
    if (!form.companyName || !form.companyId || !form.masterAdminName || !form.masterAdminPin) { notify('All fields required', 'error'); return; }
    try {
      const res = await fetch(`${API_URL}/api/superadmin/companies`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) });
      if (res.ok) { notify('Company created!'); setShowCreate(false); setForm({companyName:'',companyId:'',masterAdminName:'',masterAdminPin:'',masterAdminEmail:''}); fetchCompanies(); }
      else { const err = await res.json(); notify(err.detail||'Failed','error'); }
    } catch { notify('Network error','error'); }
  };

  const toggleSuspend = async (c) => {
    if (!confirm(`${c.suspended?'Unsuspend':'Suspend'} ${c.name}?`)) return;
    await fetch(`${API_URL}/api/superadmin/companies/${c.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({suspended:!c.suspended}) });
    notify(`Company ${c.suspended?'unsuspended':'suspended'}`); fetchCompanies();
  };

  const deleteCompany = async (c) => {
    if (!confirm(`PERMANENTLY DELETE ${c.name}? This cannot be undone.`)) return;
    await fetch(`${API_URL}/api/superadmin/companies/${c.id}`, { method:'DELETE' });
    notify('Company deleted'); fetchCompanies();
  };

  const [editingMaster, setEditingMaster] = useState(null); // {cid, userId, name, email, password:''}
  const [repairingMaster, setRepairingMaster] = useState(null); // {cid, name:'', password:'', email:''}

  const openEditMaster = async (c) => {
    try {
      const res = await fetch(`${API_URL}/api/superadmin/companies/${c.id}/data`);
      if (res.ok) {
        const data = await res.json();
        const master = (data.users || []).find(u => u.role === 'master_admin');
        if (master) setEditingMaster({ cid: c.id, userId: master.id, name: master.name, email: master.email || '', password: '' });
        else notify('Master admin not found', 'error');
      }
    } catch { notify('Failed to load', 'error'); }
  };

  const doRepairMaster = async () => {
    if (!repairingMaster.name || !repairingMaster.password) { notify('Name and password required', 'error'); return; }
    try {
      const res = await fetch(`${API_URL}/api/superadmin/companies/${repairingMaster.cid}/repair-master`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({name: repairingMaster.name, password: repairingMaster.password, email: repairingMaster.email})
      });
      if (res.ok) { notify('Master admin restored!'); setRepairingMaster(null); fetchCompanies(); }
      else { const e = await res.json(); notify(e.detail || 'Failed', 'error'); }
    } catch { notify('Network error', 'error'); }
  };

  const saveMaster = async () => {
    if (!editingMaster.email) { notify('Email required', 'error'); return; }
    const res = await fetch(`${API_URL}/api/superadmin/companies/${editingMaster.cid}/users/${editingMaster.userId}`, {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ userId: editingMaster.userId, email: editingMaster.email, password: editingMaster.password || undefined, name: editingMaster.name })
    });
    if (res.ok) { notify('Master admin updated'); setEditingMaster(null); }
    else notify('Update failed', 'error');
  };

  const addAccount = async () => {
    if (!newAccount.username || !newAccount.password) { notify('Username and password required','error'); return; }
    const res = await fetch(`${API_URL}/api/superadmin/accounts`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(newAccount) });
    if (res.ok) { notify('Account created'); setShowAddAccount(false); setNewAccount({username:'',password:''}); fetchAccounts(); }
    else { const err = await res.json(); notify(err.detail||'Failed','error'); }
  };

  const saveAccount = async () => {
    if (!editingAccount.username) { notify('Username required','error'); return; }
    const res = await fetch(`${API_URL}/api/superadmin/accounts/${editingAccount.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:editingAccount.username, password:editingAccount.newPassword||undefined}) });
    if (res.ok) { notify('Account updated'); setEditingAccount(null); fetchAccounts(); }
    else { const err = await res.json(); notify(err.detail||'Failed','error'); }
  };

  const deleteAccount = async (id) => {
    if (!confirm('Delete this super admin account?')) return;
    const res = await fetch(`${API_URL}/api/superadmin/accounts/${id}`, { method:'DELETE' });
    if (res.ok) { notify('Account deleted'); fetchAccounts(); }
    else { const err = await res.json(); notify(err.detail||'Cannot delete last account','error'); }
  };

  const backupCompany = (cid) => window.open(`${API_URL}/api/company/${cid}/backup`, '_blank');
  const backupAll = () => window.open(`${API_URL}/api/superadmin/backup`, '_blank');

  const handleRestoreAll = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm('This will overwrite all company data. Continue?')) return;
    setRestoring(true);
    const fd = new FormData(); fd.append('file', file);
    try { const res = await fetch(`${API_URL}/api/superadmin/restore`, {method:'POST',body:fd}); if (res.ok) notify('Restore complete! Refresh.'); else notify('Restore failed','error'); }
    catch { notify('Network error','error'); }
    setRestoring(false); e.target.value = '';
  };

  return (
    <div className="kf-sa-console">
      {toast && <div className={`kf-toast ${toast.type}`}><CheckCircle size={16}/>{toast.msg}</div>}
      <div className="kf-sa-header">
        <div className="kf-sa-brand"><Shield size={28}/><div><h1>Komando</h1><span>Super Admin Console</span></div></div>
        <div className="kf-sa-header-actions">
          <button className="kf-btn secondary sm" onClick={backupAll}><Download size={15}/>Backup All</button>
          <label className="kf-btn secondary sm" style={{cursor:'pointer'}}>
            {restoring?<Loader2 size={15} className="spin"/>:<RefreshCw size={15}/>}Restore All
            <input ref={restoreRef} type="file" accept=".zip" style={{display:'none'}} onChange={handleRestoreAll}/>
          </label>
          <button className="kf-icon-btn" onClick={onExit} title="Exit"><LogOut size={18}/></button>
        </div>
      </div>

      <div className="kf-sa-body">
        <div className="kf-settings-tabs" style={{marginBottom:24}}>
          <button className={tab==='companies'?'active':''} onClick={()=>setTab('companies')}><Building2 size={16}/>Companies</button>
          <button className={tab==='accounts'?'active':''} onClick={()=>setTab('accounts')}><Shield size={16}/>Super Admin Accounts</button>
        </div>

        {tab === 'companies' && (
          <>
            {showCreate && (
              <div className="kf-sa-card kf-sa-create">
                <div className="kf-section-header"><h3><Building2 size={18}/>Create New Company</h3><button className="kf-icon-btn" onClick={()=>setShowCreate(false)}><X size={18}/></button></div>
                <div className="kf-row">
                  <div className="kf-form-group"><label>Company Name *</label><input value={form.companyName} onChange={e=>setForm({...form,companyName:e.target.value})} placeholder="Kaizen Automotive"/></div>
                  <div className="kf-form-group"><label>Company ID * <span className="kf-sub">(slug)</span></label><input value={form.companyId} onChange={e=>setForm({...form,companyId:e.target.value.toLowerCase().replace(/\s/g,'-')})} placeholder="kaizen"/></div>
                </div>
                <div className="kf-row">
                  <div className="kf-form-group"><label>Master Admin Name *</label><input value={form.masterAdminName} onChange={e=>setForm({...form,masterAdminName:e.target.value})}/></div>
                  <div className="kf-form-group"><label>Master Admin Password *</label><input type="password" value={form.masterAdminPin} onChange={e=>setForm({...form,masterAdminPin:e.target.value})}/></div>
                </div>
                <div className="kf-form-group"><label>Master Admin Email</label><input value={form.masterAdminEmail} onChange={e=>setForm({...form,masterAdminEmail:e.target.value})}/></div>
                <div className="kf-row" style={{marginTop:8}}><button className="kf-btn secondary" onClick={()=>setShowCreate(false)}>Cancel</button><button className="kf-btn primary" onClick={createCompany}><Save size={16}/>Create Company</button></div>
              </div>
            )}
            <div className="kf-sa-companies">
              <div className="kf-section-header" style={{marginBottom:16}}>
                <h2 style={{margin:0,display:'flex',alignItems:'center',gap:8}}><Globe size={20}/> Companies <span className="kf-badge">{companies.length}</span></h2>
                <button className="kf-btn primary sm" onClick={()=>setShowCreate(true)}><Plus size={15}/>New Company</button>
              </div>
              {loading ? <div className="kf-loading"><Loader2 size={32} className="spin"/></div> : companies.length === 0 ? (
                <div className="kf-empty"><Building2 size={60}/><p>No companies yet.</p></div>
              ) : (
                <div className="kf-sa-company-list">
                  {companies.map(c => (
                    <div key={c.id} className={`kf-sa-company-row ${c.suspended?'suspended':''}`}>
                      <div className="kf-sa-co-icon"><Building2 size={22}/></div>
                      <div className="kf-sa-co-info">
                        <div className="kf-name">{c.name} {c.suspended && <span className="kf-badge danger">Suspended</span>}</div>
                        <div className="kf-sub">ID: <code>{c.id}</code> · Master: {c.masterAdmin} · Created: {c.createdAt?.split('T')[0]}</div>
                      </div>
                      <div className="kf-sa-co-actions">
                        <button className="kf-btn secondary sm" onClick={()=>openEditMaster(c)} title="Edit master admin"><Edit2 size={14}/>Master Admin</button>
                        <button className="kf-btn danger sm" onClick={()=>setRepairingMaster({cid:c.id,name:'',password:'',email:''})} title="Restore lost master admin"><UserCog size={14}/>Restore Login</button>
                        <button className="kf-btn secondary sm" onClick={()=>backupCompany(c.id)}><Download size={14}/>Backup</button>
                        <button className={`kf-btn sm ${c.suspended?'success':'secondary'}`} onClick={()=>toggleSuspend(c)}><PowerOff size={14}/>{c.suspended?'Unsuspend':'Suspend'}</button>
                        <button className="kf-btn danger sm" onClick={()=>deleteCompany(c)}><Trash2 size={14}/>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {repairingMaster && (
          <div className="kf-overlay" onClick={()=>setRepairingMaster(null)}>
            <div className="kf-modal" onClick={e=>e.stopPropagation()}>
              <div className="kf-modal-header"><h2><UserCog size={18}/> Restore Master Admin</h2><button className="kf-close" onClick={()=>setRepairingMaster(null)}><X size={20}/></button></div>
              <div className="kf-modal-body">
                <p className="kf-sub" style={{marginBottom:16}}>This will create a new master admin login for <strong>{repairingMaster.cid}</strong>. Any existing master admin will be replaced.</p>
                <div className="kf-form-group"><label>Name *</label><input value={repairingMaster.name} onChange={e=>setRepairingMaster({...repairingMaster,name:e.target.value})} placeholder="e.g. KaizenGR"/></div>
                <div className="kf-form-group"><label>Email</label><input type="email" value={repairingMaster.email} onChange={e=>setRepairingMaster({...repairingMaster,email:e.target.value})} placeholder="optional"/></div>
                <div className="kf-form-group"><label>Password *</label><input type="password" value={repairingMaster.password} onChange={e=>setRepairingMaster({...repairingMaster,password:e.target.value})} placeholder="New login password"/></div>
              </div>
              <div className="kf-modal-footer">
                <button className="kf-btn secondary" onClick={()=>setRepairingMaster(null)}>Cancel</button>
                <button className="kf-btn primary" onClick={doRepairMaster}><Save size={16}/>Restore</button>
              </div>
            </div>
          </div>
        )}
        {editingMaster && (
          <div className="kf-overlay" onClick={()=>setEditingMaster(null)}>
            <div className="kf-modal" onClick={e=>e.stopPropagation()}>
              <div className="kf-modal-header"><h2><UserCog size={18}/> Edit Master Admin</h2><button className="kf-close" onClick={()=>setEditingMaster(null)}><X size={20}/></button></div>
              <div className="kf-modal-body">
                <div className="kf-form-group"><label>Name</label><input value={editingMaster.name} onChange={e=>setEditingMaster({...editingMaster,name:e.target.value})}/></div>
                <div className="kf-form-group"><label>Email *</label><input type="email" value={editingMaster.email} onChange={e=>setEditingMaster({...editingMaster,email:e.target.value})}/></div>
                <div className="kf-form-group"><label>New Password <span className="kf-sub">(leave blank to keep current)</span></label><input type="password" value={editingMaster.password} onChange={e=>setEditingMaster({...editingMaster,password:e.target.value})} placeholder="••••••••"/></div>
              </div>
              <div className="kf-modal-footer"><button className="kf-btn secondary" onClick={()=>setEditingMaster(null)}>Cancel</button><button className="kf-btn primary" onClick={saveMaster}><Save size={16}/>Save</button></div>
            </div>
          </div>
        )}

        {tab === 'accounts' && (          <div className="kf-sa-card">
            <div className="kf-section-header">
              <h3><Shield size={18}/>Super Admin Accounts</h3>
              <button className="kf-btn primary sm" onClick={()=>setShowAddAccount(true)}><Plus size={14}/>Add Account</button>
            </div>
            <p className="kf-sub" style={{marginBottom:16}}>Each account can log in to this console independently.</p>

            {showAddAccount && (
              <div className="kf-add-user-form">
                <div className="kf-row">
                  <div className="kf-form-group"><label>Username *</label><input value={newAccount.username} onChange={e=>setNewAccount({...newAccount,username:e.target.value})} autoFocus/></div>
                  <div className="kf-form-group"><label>Password *</label><input type="password" value={newAccount.password} onChange={e=>setNewAccount({...newAccount,password:e.target.value})}/></div>
                </div>
                <div className="kf-row"><button className="kf-btn secondary" onClick={()=>setShowAddAccount(false)}>Cancel</button><button className="kf-btn primary" onClick={addAccount}><Save size={16}/>Add</button></div>
              </div>
            )}

            <div className="kf-users-list">
              {accounts.map(a => (
                <div key={a.id} className="kf-user-row">
                  {editingAccount?.id === a.id ? (
                    <div className="kf-user-edit" style={{width:'100%'}}>
                      <div className="kf-row">
                        <div className="kf-form-group"><label>Username *</label><input value={editingAccount.username} onChange={e=>setEditingAccount({...editingAccount,username:e.target.value})}/></div>
                        <div className="kf-form-group"><label>New Password <span className="kf-sub">(leave blank to keep)</span></label><input type="password" value={editingAccount.newPassword||''} onChange={e=>setEditingAccount({...editingAccount,newPassword:e.target.value})} placeholder="••••••"/></div>
                      </div>
                      <div className="kf-row"><button className="kf-btn secondary" onClick={()=>setEditingAccount(null)}>Cancel</button><button className="kf-btn primary" onClick={saveAccount}><Save size={16}/>Save</button></div>
                    </div>
                  ) : (
                    <>
                      <div className="kf-avatar sa"><Shield size={16}/></div>
                      <div className="kf-user-info">
                        <div className="kf-name">{a.username}</div>
                        <div className="kf-sub"><span className="kf-role-tag master_admin"><Shield size={12}/>super admin</span></div>
                      </div>
                      <div className="kf-user-actions">
                        <button className="kf-icon-btn" onClick={()=>setEditingAccount({...a,newPassword:''})}><Edit2 size={15}/></button>
                        {accounts.length > 1 && <button className="kf-icon-btn danger" onClick={()=>deleteAccount(a.id)}><Trash2 size={15}/></button>}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Unified Login Screen ─────────────────────────────────────────────────────
function UnifiedLogin({ onLoginUser, onLoginSuperAdmin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { setError('Email and password required'); return; }
    setLoading(true); setError('');

    // 1. Try super admin (username field accepts email too)
    try {
      const res = await fetch(`${API_URL}/api/superadmin/login`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ username: email, password })
      });
      if (res.ok) {
        const d = await res.json();
        localStorage.setItem('kf_sa_session', JSON.stringify({id: d.id, username: d.username}));
        setLoading(false); onLoginSuperAdmin(); return;
      }
    } catch {}

    // 2. Try company users
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        const d = await res.json();
        setLoading(false); onLoginUser(d.user, d.company); return;
      }
    } catch {}

    setError('Invalid email or password');
    setLoading(false);
  };

  return (
    <div className="kf-login">
      <div className="kf-login-box">
        <div className="kf-login-header"><CircleDot size={40}/><h1>Komando</h1><p>Shop Management</p></div>
        <div className="kf-form-group"><label>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyPress={e=>e.key==='Enter'&&handleLogin()} placeholder="you@company.com" autoFocus/>
        </div>
        <div className="kf-form-group"><label>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyPress={e=>e.key==='Enter'&&handleLogin()} placeholder="••••••••"/>
        </div>
        {error && <div className="kf-error"><AlertCircle size={16}/>{error}</div>}
        <button className="kf-btn primary full" onClick={handleLogin} disabled={loading} style={{marginTop:8}}>
          {loading ? <Loader2 size={16} className="spin"/> : <Lock size={16}/>}Sign In
        </button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('login');
  const [selectedCompany, setSelectedCompany] = useState(() => { try { return JSON.parse(localStorage.getItem('kf_company') || 'null'); } catch { return null; }});
  const [currentUser, setCurrentUser] = useState(() => { try { return JSON.parse(localStorage.getItem('kf_currentUser') || 'null'); } catch { return null; }});

  // App data (company-scoped)
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState('dashboard');
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [cannedItems, setCannedItems] = useState({ categories: [], items: [] });
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [editingEstimate, setEditingEstimate] = useState(null);
  const [locationFilter, setLocationFilter] = useState(null);

  const cid = selectedCompany?.id;
  const notify = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  // Restore session on mount
  useEffect(() => {
    const savedCompany = localStorage.getItem('kf_company');
    const savedUser = localStorage.getItem('kf_currentUser');
    if (savedCompany && savedUser) setScreen('app');
    else setScreen('login');
  }, []);

  // Load company data when entering app screen
  // We use a ref-based "ready" flag instead of isLoading state to avoid race conditions
  // where React fires save effects before all state setters have settled.
  const dataReadyRef = React.useRef(false);

  useEffect(() => {
    if (screen === 'app' && cid) {
      dataReadyRef.current = false;
      setIsLoading(true);
      loadAllFromAPI(cid).then(data => {
        // loadAllFromAPI already wrote non-empty API values to localStorage.
        // Now read everything from localStorage (single source of truth after sync).
        const ls = (key, def) => loadData(cid, key, def);
        setCustomers(  ls('customers', []));
        setVehicles(   ls('vehicles',  []));
        setEstimates(  ls('estimates', []));
        setInvoices(   ls('invoices',  []));
        setUsers(      ls('users',     []));
        setLocations(  ls('locations', [{id:'loc1',name:'Main Location',address:'',phone:'',email:'',laborRate:null,taxRate:null}]));
        setSettings(   ls('settings',  DEFAULT_SETTINGS));
        setCannedItems(ls('cannedItems',{categories:[],items:[]}));
        // Use setTimeout to ensure all state setters above have been batched
        // before we allow save effects to fire
        setTimeout(() => {
          dataReadyRef.current = true;
          setIsLoading(false);
        }, 0);
      });
    }
  }, [screen, cid]);

  // Persist data changes — only fires after data is fully loaded
  useEffect(() => { if (dataReadyRef.current && cid) saveData(cid,'customers',customers); }, [customers]);
  useEffect(() => { if (dataReadyRef.current && cid) saveData(cid,'vehicles',vehicles); }, [vehicles]);
  useEffect(() => { if (dataReadyRef.current && cid) saveData(cid,'estimates',estimates); }, [estimates]);
  useEffect(() => { if (dataReadyRef.current && cid) saveData(cid,'invoices',invoices); }, [invoices]);
  useEffect(() => { if (dataReadyRef.current && cid) saveData(cid,'users',users); }, [users]);
  useEffect(() => { if (dataReadyRef.current && cid) saveData(cid,'locations',locations); }, [locations]);
  useEffect(() => { if (dataReadyRef.current && cid) saveData(cid,'settings',settings); }, [settings]);
  useEffect(() => { if (dataReadyRef.current && cid) saveData(cid,'cannedItems',cannedItems); }, [cannedItems]);

  // ── Auth handlers ─────────────────────────────────────────────────────────

  const handleUserLogin = (user, company) => {
    setSelectedCompany(company);
    setCurrentUser(user);
    localStorage.setItem('kf_company', JSON.stringify(company));
    localStorage.setItem('kf_currentUser', JSON.stringify(user));
    setLocationFilter(user.role === 'technician' ? (user.locationId || null) : null);
    setScreen('app');
    notify(`Welcome, ${user.name}!`);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('kf_currentUser');
    localStorage.removeItem('kf_company');
    setSelectedCompany(null);
    setView('dashboard');
    setEditingEstimate(null);
    setLocationFilter(null);
    setScreen('login');
  };

  const handleSwitchCompany = () => {
    handleLogout();
  };

  // ── Screen routing ────────────────────────────────────────────────────────
  if (screen === 'superadmin') return <SuperAdminConsole onExit={()=>setScreen('login')}/>;
  if (screen === 'login') return <UnifiedLogin onLoginUser={handleUserLogin} onLoginSuperAdmin={()=>setScreen('superadmin')}/>;

  // ── App shell ─────────────────────────────────────────────────────────────
  const getName = c => c ? (c.type==='fleet' ? c.companyName : `${c.firstName} ${c.lastName}`) : '';
  const sorted = [...customers].sort((a,b)=>getName(a).localeCompare(getName(b)));
  const closeModal = () => { setModal(null); setSelected(null); };
  const getLocation = id => locations.find(l=>l.id===id) || null;
  const getEffectiveSettings = locationId => resolveSettings(settings, getLocation(locationId));
  const activeLocationId = locationFilter;
  const filteredEstimates = (activeLocationId ? estimates.filter(e=>e.locationId===activeLocationId) : estimates).filter(e=>!e.archived);
  const filteredInvoices  = (activeLocationId ? invoices.filter(i=>i.locationId===activeLocationId)  : invoices).filter(i=>!i.archived);

  const stats = {
    customers: customers.length,
    pending: filteredEstimates.filter(e=>e.status==='pending').length,
    unpaid: filteredInvoices.filter(i=>i.status!=='paid').length,
    revenue: filteredInvoices.filter(i=>i.status==='paid').reduce((s,i)=>s+(i.finalTotal||i.total||0),0)
  };

  const getNextDocNumber = () => {
    const allNums = [...estimates.map(e=>parseInt(e.number?.replace('EST-','')||'0')), ...invoices.map(i=>parseInt(i.number?.replace('INV-','')||'0'))];
    return Math.max(0,...allNums) + 1;
  };

  const handleNewEstimate = () => {
    const docNum = getNextDocNumber();
    const newEst = {
      id:`e${Date.now()}`, docNumber:docNum,
      number:`EST-${String(docNum).padStart(4,'0')}`,
      locationId: currentUser?.locationId || locations[0]?.id || null,
      customerId:null, vehicleId:null, title:'', customerComments:'', recommendations:'',
      items:[], inspections:[], internalNotes:[],
      createdAt:new Date().toISOString().split('T')[0], createdBy:currentUser?.id, status:'pending'
    };
    setEstimates([...estimates, newEst]);
    setEditingEstimate(newEst);
  };

  const handleDocumentSave = (doc) => {
    if (doc.docType==='invoice') setInvoices(invoices.map(i=>i.id===doc.id?doc:i));
    else setEstimates(estimates.map(e=>e.id===doc.id?doc:e));
    notify('Saved');
  };

  const handleAddCustomer = (cust) => {
    const c = {...cust,id:`c${Date.now()}`,createdAt:new Date().toISOString().split('T')[0],totalSpent:0};
    setCustomers([...customers,c]); return c;
  };
  const handleAddVehicle = (veh) => { const v={...veh,id:`v${Date.now()}`}; setVehicles([...vehicles,v]); return v; };
  const handleUpdateCustomer = (cust) => setCustomers(customers.map(c=>c.id===cust.id?cust:c));
  const handleUpdateVehicle = (veh) => setVehicles(vehicles.map(v=>v.id===veh.id?veh:v));

  const handleConvertToInvoice = (doc) => {
    const docNum = doc.docNumber || parseInt(doc.number?.replace('EST-','')||'0');
    const inv = {...doc,id:doc.id,docNumber:docNum,number:`INV-${String(docNum).padStart(4,'0')}`,
      docType:'invoice',status:'unpaid',convertedAt:new Date().toISOString().split('T')[0],
      dueAt:new Date(Date.now()+30*86400000).toISOString().split('T')[0],payments:[],balance:doc.finalTotal||doc.total||0,
      poNumber: doc.poNumber || '', paymentTerm: doc.paymentTerm || 'Net 30'};
    setEstimates(estimates.filter(e=>e.id!==doc.id));
    setInvoices([...invoices,inv]);
    setEditingEstimate(inv);
    notify(`Converted to ${inv.number}!`);
  };

  const handleRevertToEstimate = (inv) => {
    const docNum = inv.docNumber||parseInt(inv.number?.replace('INV-','')||'0');
    const est = {...inv,id:inv.id,docNumber:docNum,number:`EST-${String(docNum).padStart(4,'0')}`,
      docType:'estimate',status:'approved',payments:undefined,balance:undefined,dueAt:undefined,convertedAt:undefined};
    setInvoices(invoices.filter(i=>i.id!==inv.id));
    setEstimates([...estimates,est]);
    setEditingEstimate(est);
    notify(`Reverted to ${est.number}!`);
  };

  if (editingEstimate) {
    const docLocationId = editingEstimate.locationId || currentUser?.locationId || locations[0]?.id;
    return (
      <EstimatePage
        document={editingEstimate} customers={sorted} vehicles={vehicles} users={users} locations={locations}
        settings={getEffectiveSettings(docLocationId)} cannedItems={cannedItems} currentUser={currentUser}
        getName={getName} onSave={handleDocumentSave} onAddCustomer={handleAddCustomer}
        onAddVehicle={handleAddVehicle} onUpdateCustomer={handleUpdateCustomer} onUpdateVehicle={handleUpdateVehicle}
        onConvert={handleConvertToInvoice} onRevert={handleRevertToEstimate}
        onClose={()=>setEditingEstimate(null)} notify={notify}
      />
    );
  }

  const isMaster = currentUser?.role === 'master_admin';
  const isAdmin  = currentUser?.role === 'admin' || isMaster;

  const navItems = [
    {id:'dashboard',icon:Home,label:'Dashboard'},{id:'customers',icon:Users,label:'Customers'},
    {id:'vehicles',icon:Car,label:'Vehicles'},{id:'estimates',icon:FileText,label:'Estimates'},
    {id:'invoices',icon:DollarSign,label:'Invoices'},{id:'canned',icon:Layers,label:'Canned Items'},
    {id:'messages',icon:MessageSquare,label:'Messages'},{id:'settings',icon:Settings,label:'Settings'},
  ];

  return (
    <div className="kf-app">
      {toast && <div className={`kf-toast ${toast.type}`}><CheckCircle size={16}/>{toast.msg}</div>}
      {isLoading && <div className="kf-loading-overlay"><Loader2 size={40} className="spin"/></div>}
      <aside className="kf-sidebar">
        <div className="kf-logo"><CircleDot size={26}/><span>Komando</span></div>
        <div className="kf-company-badge" onClick={handleSwitchCompany} title="Switch company">
          <Building2 size={14}/><span>{selectedCompany?.name}</span>
        </div>
        <button className="kf-new-btn" onClick={handleNewEstimate}><Zap size={20}/>New Estimate</button>
        <nav className="kf-nav">
          {navItems.map(n=><button key={n.id} className={`kf-nav-item ${view===n.id?'active':''}`} onClick={()=>setView(n.id)}><n.icon size={20}/>{n.label}</button>)}
        </nav>
        <div className="kf-user-info">
          <div className="kf-avatar">{currentUser?.name?.charAt(0)}</div>
          <div className="kf-user-details">
            <span className="kf-user-name">{currentUser?.name}</span>
            <span className="kf-user-role">{currentUser?.role?.replace('_',' ')}{currentUser?.locationId&&getLocation(currentUser.locationId)?` · ${getLocation(currentUser.locationId).name}`:''}</span>
          </div>
          <button className="kf-icon-btn" onClick={handleLogout} title="Logout"><LogOut size={18}/></button>
        </div>
      </aside>

      <main className="kf-main">
        <header className="kf-header">
          <h1>{navItems.find(n=>n.id===view)?.label||'Dashboard'}</h1>
          <div className="kf-header-right">
            {(view==='estimates'||view==='invoices'||view==='dashboard') && locations.length>1 && currentUser?.role!=='technician' && (
              <div className="kf-loc-filter">
                <MapPin size={15}/>
                <select value={locationFilter||''} onChange={e=>setLocationFilter(e.target.value||null)}>
                  <option value="">All Locations</option>
                  {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
            <button className="kf-header-btn" onClick={handleNewEstimate}><Zap size={18}/>New Estimate</button>
            <div className="kf-search"><Search size={18}/><input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
          </div>
        </header>
        <div className="kf-content">
          {view==='dashboard'  && <Dashboard stats={stats} estimates={filteredEstimates} invoices={filteredInvoices} customers={sorted} getName={getName} onSelectEstimate={e=>setEditingEstimate(e)}/>}
          {view==='customers'  && <CustomersList customers={sorted} vehicles={vehicles} getName={getName} search={search} onSelect={c=>{setSelected(c);setModal('custDetail');}} onAdd={()=>setModal('custAdd')}/>}
          {view==='vehicles'   && <VehiclesList vehicles={vehicles} customers={sorted} getName={getName} search={search} onAdd={()=>setModal('vehAdd')}/>}
          {view==='estimates'  && <EstimatesList estimates={filteredEstimates} customers={sorted} vehicles={vehicles} locations={locations} getName={getName} onSelect={e=>setEditingEstimate(e)} onCreate={handleNewEstimate} onDelete={e=>{if(confirm(`Delete ${e.number}? This cannot be undone.`)){setEstimates(estimates.filter(x=>x.id!==e.id));notify('Estimate deleted');}}} onArchive={e=>{setEstimates(estimates.map(x=>x.id===e.id?{...x,archived:!x.archived}:x));notify(e.archived?'Estimate unarchived':'Estimate archived');}}/>}
          {view==='invoices'   && <InvoicesList invoices={filteredInvoices} customers={sorted} locations={locations} getName={getName} onSelect={i=>setEditingEstimate(i)} onDelete={i=>{if(confirm(`Delete ${i.number}? This cannot be undone.`)){setInvoices(invoices.filter(x=>x.id!==i.id));notify('Invoice deleted');}}} onBulkDelete={ids=>{setInvoices(invoices.filter(x=>!ids.includes(x.id)));notify(`${ids.length} invoices deleted`);}} onArchive={(ids,archive)=>{setInvoices(invoices.map(x=>ids.includes(x.id)?{...x,archived:archive}:x));notify(`${ids.length} invoice${ids.length>1?'s':''} ${archive?'archived':'unarchived'}`);}}/>}
          {view==='canned'     && <CannedItemsView cannedItems={cannedItems} setCannedItems={setCannedItems} settings={settings} notify={notify}/>}
          {view==='messages'   && <MessagesView/>}
          {view==='settings'   && <SettingsView settings={settings} setSettings={setSettings} users={users} setUsers={setUsers} locations={locations} setLocations={setLocations} customers={customers} setCustomers={setCustomers} invoices={invoices} setInvoices={setInvoices} estimates={estimates} setEstimates={setEstimates} vehicles={vehicles} setVehicles={setVehicles} currentUser={currentUser} company={selectedCompany} notify={notify}/>}
        </div>
      </main>

      {modal==='custAdd'    && <CustomerForm onClose={closeModal} onSave={c=>{handleAddCustomer(c);closeModal();notify('Customer added');}}/>}
      {modal==='custDetail' && selected && <CustomerDetail customer={selected} vehicles={vehicles.filter(v=>v.customerId===selected.id)} getName={getName} onClose={closeModal}/>}
      {modal==='vehAdd'     && <VehicleForm customers={sorted} getName={getName} onClose={closeModal} onSave={v=>{handleAddVehicle(v);closeModal();notify('Vehicle added');}} notify={notify}/>}
      {modal==='invDetail'  && selected && <InvoiceDetail invoice={selected} customer={customers.find(c=>c.id===selected.customerId)} vehicle={vehicles.find(v=>v.id===selected.vehicleId)} settings={settings} users={users} getName={getName} onClose={closeModal} onRevert={()=>{handleRevertToEstimate(selected);closeModal();}} onPay={p=>{const upd={...selected,payments:[...(selected.payments||[]),p],balance:selected.balance-p.amount,status:selected.balance-p.amount<=0?'paid':'partial'};setInvoices(invoices.map(i=>i.id===selected.id?upd:i));setSelected(upd);notify('Payment recorded');}}/>}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({stats,estimates,invoices,customers,getName,onSelectEstimate}) {
  const thisYear = new Date().getFullYear();
  const lastYear = thisYear - 1;
  const [period, setPeriod] = useState('thisYear'); // 'thisYear' | 'lastYear' | 'custom'
  const [customStart, setCustomStart] = useState(`${thisYear}-01-01`);
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);

  const getRange = () => {
    if (period === 'thisYear') return [`${thisYear}-01-01`, `${thisYear}-12-31`];
    if (period === 'lastYear') return [`${lastYear}-01-01`, `${lastYear}-12-31`];
    return [customStart, customEnd];
  };
  const [rangeStart, rangeEnd] = getRange();

  const inRange = dateStr => {
    if (!dateStr) return true; // undated invoices always included
    const d = dateStr.split('T')[0];
    return d >= rangeStart && d <= rangeEnd;
  };

  const rangeInvoices = invoices.filter(i => inRange(i.convertedAt || i.createdAt));

  const revenue = rangeInvoices.filter(i => i.status === 'paid').reduce((s,i) => s + (i.finalTotal||i.total||0), 0);
  const invoiceCount = rangeInvoices.length;
  const unpaidCount = rangeInvoices.filter(i => i.status !== 'paid').length;

  const periodLabel = period === 'thisYear' ? `${thisYear}` : period === 'lastYear' ? `${lastYear}` : `${rangeStart} – ${rangeEnd}`;

  return (
    <div>
      {/* Date range toolbar */}
      <div className="kf-dash-period-bar">
        <span className="kf-dash-period-label">Period:</span>
        <div className="kf-tabs">
          <button className={period==='thisYear'?'active':''} onClick={()=>setPeriod('thisYear')}>{thisYear}</button>
          <button className={period==='lastYear'?'active':''} onClick={()=>setPeriod('lastYear')}>{lastYear}</button>
          <button className={period==='custom'?'active':''} onClick={()=>setPeriod('custom')}>Custom</button>
        </div>
        {period === 'custom' && (
          <div className="kf-dash-custom-range">
            <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)}/>
            <span>–</span>
            <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)}/>
          </div>
        )}
        <span className="kf-sub" style={{marginLeft:'auto'}}>{invoiceCount} invoice{invoiceCount!==1?'s':''} in period {invoices.filter(i=>!(i.convertedAt||i.createdAt)).length > 0 && `(+${invoices.filter(i=>!(i.convertedAt||i.createdAt)).length} undated)`}</span>
      </div>

      {/* Stat cards */}
      <div className="kf-stats">
        {[
          {icon:Users,     label:'Customers',  value: stats.customers,                          color:'#E63946'},
          {icon:FileText,  label:'Pending',     value: stats.pending,                            color:'#E9C46A'},
          {icon:DollarSign,label:'Unpaid',      value: unpaidCount,                              color:'#457B9D'},
          {icon:BarChart3, label:`Revenue (${periodLabel})`, value:`$${revenue.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`, color:'#2D936C'},
        ].map((s,i)=>(
          <div key={i} className="kf-stat">
            <div className="kf-stat-icon" style={{background:`${s.color}22`,color:s.color}}><s.icon size={24}/></div>
            <div><div className="kf-stat-label">{s.label}</div><div className="kf-stat-value">{s.value}</div></div>
          </div>
        ))}
      </div>

      {/* Bottom cards */}
      <div className="kf-grid">
        <div className="kf-card">
          <h3>Recent Estimates</h3>
          {estimates.slice(-5).reverse().map(e=>(
            <div key={e.id} className="kf-card-row clickable" onClick={()=>onSelectEstimate(e)}>
              <span>{e.number}</span>
              <span>{e.title||getName(customers.find(c=>c.id===e.customerId))||'No customer'}</span>
              <span>${(e.finalTotal||e.total||0).toFixed(2)}</span>
              <span className={`kf-badge ${e.status}`}>{e.status}</span>
            </div>
          ))}
          {estimates.length===0&&<div className="kf-empty-sm">No estimates</div>}
        </div>
        <div className="kf-card">
          <h3>Unpaid Invoices</h3>
          {invoices.filter(i=>i.status!=='paid').slice(0,5).map(i=>(
            <div key={i.id} className="kf-card-row">
              <span>{i.number}</span>
              <span>{getName(customers.find(c=>c.id===i.customerId))}</span>
              <span className="red">${(i.balance||0).toFixed(2)}</span>
            </div>
          ))}
          {invoices.filter(i=>i.status!=='paid').length===0&&<div className="kf-empty-sm"><CheckCircle size={20}/>All paid!</div>}
        </div>
      </div>
    </div>
  );
}

function CustomersList({customers,vehicles,getName,search,onSelect,onAdd}) {
  const [filter,setFilter]=useState('all');
  const list=customers.filter(c=>(filter==='all'||c.type===filter)&&(!search||getName(c).toLowerCase().includes(search.toLowerCase())));
  return <div><div className="kf-actions"><button className="kf-btn primary" onClick={onAdd}><Plus size={16}/>Add</button><div style={{flex:1}}/><div className="kf-tabs">{['all','public','fleet'].map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f}</button>)}</div></div><div className="kf-card"><table><thead><tr><th>Customer</th><th>Contact</th><th>Vehicles</th><th>Type</th></tr></thead><tbody>{list.map(c=><tr key={c.id} onClick={()=>onSelect(c)}><td>{getName(c)}</td><td className="kf-sub">{c.phone}</td><td>{vehicles.filter(v=>v.customerId===c.id).length}</td><td><span className={`kf-badge ${c.type}`}>{c.type}</span></td></tr>)}</tbody></table>{list.length===0&&<div className="kf-empty"><Users size={40}/></div>}</div></div>;
}

function VehiclesList({vehicles,customers,getName,search,onAdd}) {
  const list=vehicles.filter(v=>!search||`${v.year} ${v.make} ${v.model}`.toLowerCase().includes(search.toLowerCase()));
  return <div><div className="kf-actions"><button className="kf-btn primary" onClick={onAdd}><Plus size={16}/>Add</button></div><div className="kf-card"><table><thead><tr><th>Vehicle</th><th>VIN</th><th>Plate</th><th>Owner</th></tr></thead><tbody>{list.map(v=><tr key={v.id}><td>{v.year} {v.make} {v.model}</td><td><code>{v.vin?.slice(-8)}</code></td><td>{v.plate}</td><td>{getName(customers.find(c=>c.id===v.customerId))}</td></tr>)}</tbody></table>{list.length===0&&<div className="kf-empty"><Car size={40}/></div>}</div></div>;
}

function EstimatesList({estimates,customers,vehicles,locations,getName,onSelect,onCreate,onDelete,onArchive}) {
  const [filter,setFilter]=useState('all');
  const [showArchived,setShowArchived]=useState(false);
  const active   = estimates.filter(e => !e.archived);
  const archived = estimates.filter(e =>  e.archived);
  const pool = showArchived ? archived : active;
  const list = pool.filter(e => filter==='all' || e.status===filter);
  const getLocName=id=>locations?.find(l=>l.id===id)?.name||'';
  const showLoc=locations?.length>1;
  return (
    <div>
      <div className="kf-actions">
        {!showArchived && <button className="kf-btn primary" onClick={onCreate}><Zap size={16}/>New</button>}
        <div style={{flex:1}}/>
        <button
          className={`kf-btn secondary sm${showArchived?' active':''}`}
          onClick={()=>{setShowArchived(v=>!v);setFilter('all');}}
          title={showArchived?'Back to active':'View archived'}
        >
          <Archive size={14}/>{showArchived ? 'Active' : `Archived (${archived.length})`}
        </button>
        <div className="kf-tabs">
          {(showArchived
            ? ['all','pending','approved','converted']
            : ['all','pending','approved','converted']
          ).map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f}</button>)}
        </div>
      </div>
      {showArchived && <div className="kf-archive-notice"><Archive size={14}/> Showing archived estimates — these are hidden from normal views.</div>}
      <div className="kf-card">
        <table><thead><tr><th>Estimate</th><th>Title</th><th>Customer</th><th>Vehicle</th>{showLoc&&<th>Location</th>}<th>Total</th><th>Status</th><th></th></tr></thead>
        <tbody>{list.map(e=>{
          const c=customers.find(x=>x.id===e.customerId);
          const v=vehicles.find(x=>x.id===e.vehicleId);
          return (
            <tr key={e.id} className={e.archived?'kf-row-archived':''}>
              <td onClick={()=>onSelect(e)} style={{cursor:'pointer'}}><strong>{e.number}</strong></td>
              <td onClick={()=>onSelect(e)} style={{cursor:'pointer'}}>{e.title||'-'}</td>
              <td onClick={()=>onSelect(e)} style={{cursor:'pointer'}}>{c?getName(c):'-'}</td>
              <td onClick={()=>onSelect(e)} style={{cursor:'pointer'}}>{v?`${v.year} ${v.make}`:'-'}</td>
              {showLoc&&<td onClick={()=>onSelect(e)} style={{cursor:'pointer'}}><span className="kf-loc-tag"><MapPin size={11}/>{getLocName(e.locationId)}</span></td>}
              <td onClick={()=>onSelect(e)} style={{cursor:'pointer'}}>${(e.finalTotal||0).toFixed(2)}</td>
              <td onClick={()=>onSelect(e)} style={{cursor:'pointer'}}><span className={`kf-badge ${e.status}`}>{e.status}</span></td>
              <td style={{display:'flex',gap:4}}>
                <button className="kf-icon-btn secondary" onClick={ev=>{ev.stopPropagation();onArchive(e);}} title={e.archived?'Unarchive':'Archive'}>{e.archived?<ArchiveRestore size={15}/>:<Archive size={15}/>}</button>
                <button className="kf-icon-btn danger"    onClick={ev=>{ev.stopPropagation();onDelete(e);}}  title="Delete"><Trash2 size={15}/></button>
              </td>
            </tr>
          );
        })}</tbody></table>
        {list.length===0&&<div className="kf-empty"><FileText size={40}/>{showArchived&&<p>No archived estimates</p>}</div>}
      </div>
    </div>
  );
}

function InvoicesList({invoices,customers,locations,getName,onSelect,onDelete,onBulkDelete,onArchive}) {
  const [pickedId, setPickedId] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const activeInvoices   = invoices.filter(i => !i.archived);
  const archivedInvoices = invoices.filter(i =>  i.archived);
  const pool = showArchived ? archivedInvoices : activeInvoices;

  const customerHasInvoice = new Set(pool.map(i => i.customerId).filter(Boolean));
  const withInvoices = customers.filter(c => customerHasInvoice.has(c.id));
  const unlinked = pool.filter(i => !i.customerId);

  const getLocName = id => locations?.find(l => l.id === id)?.name || '';
  const showLoc = locations?.length > 1;

  // ── Customer picker ─────────────────────────────────────────
  if (!pickedId) {
    const filtered = search
      ? withInvoices.filter(c => getName(c).toLowerCase().includes(search.toLowerCase()))
      : withInvoices;
    const sorted = [...filtered].sort((a,b) => getName(a).localeCompare(getName(b)));
    return (
      <div>
        <div className="kf-inv-pick-header">
          <h2>Invoices</h2>
          <input className="kf-search-input" placeholder="Search customers…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <button
            className={`kf-btn secondary sm${showArchived?' active':''}`}
            onClick={()=>{setShowArchived(v=>!v);setSearch('');}}
          >
            <Archive size={14}/>{showArchived ? 'Active' : `Archived (${archivedInvoices.length})`}
          </button>
        </div>
        {showArchived && <div className="kf-archive-notice"><Archive size={14}/> Showing archived invoices.</div>}
        <div className="kf-inv-customer-grid">
          {sorted.map(c => {
            const cinvs = pool.filter(i => i.customerId === c.id);
            const unpaid = cinvs.filter(i => i.status !== 'paid');
            const total  = cinvs.reduce((s,i) => s + (i.finalTotal||i.total||0), 0);
            return (
              <div key={c.id} className="kf-inv-customer-card" onClick={() => { setPickedId(c.id); setSelected(new Set()); }}>
                <div className="kf-inv-card-name">{getName(c)}</div>
                <div className="kf-inv-card-meta">
                  <span>{cinvs.length} invoice{cinvs.length!==1?'s':''}</span>
                  {unpaid.length>0&&<span className="red">{unpaid.length} unpaid</span>}
                  <span className="kf-inv-card-total">${total.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
          {unlinked.length>0&&(
            <div className="kf-inv-customer-card unlinked" onClick={()=>{setPickedId('__unlinked__');setSelected(new Set());}}>
              <div className="kf-inv-card-name">⚠ Unlinked Invoices</div>
              <div className="kf-inv-card-meta">
                <span>{unlinked.length} invoice{unlinked.length!==1?'s':''}</span>
                <span className="kf-sub">No customer assigned</span>
              </div>
            </div>
          )}
          {sorted.length===0&&unlinked.length===0&&(
            <div className="kf-empty"><DollarSign size={40}/><p>{showArchived?'No archived invoices':'No invoices yet'}</p></div>
          )}
        </div>
      </div>
    );
  }

  // ── Invoice list ─────────────────────────────────────────────
  const customer = pickedId==='__unlinked__' ? null : customers.find(c=>c.id===pickedId);
  const base = (pickedId==='__unlinked__' ? pool.filter(i=>!i.customerId) : pool.filter(i=>i.customerId===pickedId))
    .filter(i => statusFilter==='all' || i.status===statusFilter);

  const parseNum = n => parseInt((n||'').replace(/\D/g,''))||0;
  const list = [...base].sort((a,b) =>
    sortDir==='asc' ? parseNum(a.number)-parseNum(b.number) : parseNum(b.number)-parseNum(a.number)
  );

  const allChecked = list.length>0 && list.every(i=>selected.has(i.id));
  const toggleAll  = () => setSelected(allChecked ? new Set() : new Set(list.map(i=>i.id)));
  const toggle     = id => setSelected(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
  const handleBulkDelete  = () => { if(!selected.size)return; if(!confirm(`Delete ${selected.size} invoice${selected.size>1?'s':''}?`))return; onBulkDelete([...selected]); setSelected(new Set()); };
  const handleBulkArchive = () => { if(!selected.size)return; onArchive([...selected], !showArchived); setSelected(new Set()); };

  const grandTotal  = list.reduce((s,i)=>s+(i.finalTotal||i.total||0),0);
  const unpaidTotal = list.filter(i=>i.status!=='paid').reduce((s,i)=>s+(i.balance||0),0);

  return (
    <div>
      <div className="kf-inv-list-header">
        <button className="kf-btn secondary sm" onClick={()=>{setPickedId(null);setSelected(new Set());setSearch('');}}>
          <ArrowLeft size={14}/> All Customers
        </button>
        <div className="kf-inv-list-title">
          <strong>{customer?getName(customer):'Unlinked Invoices'}</strong>
          <span className="kf-sub">{list.length} invoice{list.length!==1?'s':''}</span>
          {showArchived && <span className="kf-badge" style={{background:'#b8860b22',color:'#b8860b'}}>Archived</span>}
        </div>
        <div className="kf-inv-list-stats">
          <span>Total: <strong>${grandTotal.toFixed(2)}</strong></span>
          {unpaidTotal>0&&<span className="red">Unpaid: <strong>${unpaidTotal.toFixed(2)}</strong></span>}
        </div>
      </div>

      <div className="kf-actions" style={{marginBottom:8}}>
        <div style={{flex:1}}>
          {selected.size>0 ? (
            <div className="kf-bulk-bar">
              <span>{selected.size} selected</span>
              <button className="kf-btn secondary sm" onClick={handleBulkArchive}><Archive size={14}/>{showArchived?'Unarchive':'Archive'} Selected</button>
              <button className="kf-btn danger sm"    onClick={handleBulkDelete}><Trash2 size={14}/>Delete Selected</button>
              <button className="kf-btn secondary sm" onClick={()=>setSelected(new Set())}>Clear</button>
            </div>
          ) : (
            <button className="kf-btn secondary sm kf-sort-toggle" onClick={()=>setSortDir(d=>d==='desc'?'asc':'desc')}>
              {sortDir==='desc'?<><ArrowDown size={14}/> Highest First</>:<><ArrowUp size={14}/> Lowest First</>}
            </button>
          )}
        </div>
        <div className="kf-tabs">
          {['all','unpaid','partial','paid'].map(f=><button key={f} className={statusFilter===f?'active':''} onClick={()=>setStatusFilter(f)}>{f}</button>)}
        </div>
      </div>

      <div className="kf-card">
        <table><thead><tr>
          <th style={{width:36}}><input type="checkbox" checked={allChecked} onChange={toggleAll}/></th>
          <th>Invoice #</th>{showLoc&&<th>Location</th>}<th>Date</th><th>Total</th><th>Balance</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>{list.map(i=>(
          <tr key={i.id} className={selected.has(i.id)?'kf-row-selected':i.archived?'kf-row-archived':''}>
            <td onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.has(i.id)} onChange={()=>toggle(i.id)}/></td>
            <td onClick={()=>onSelect(i)} style={{cursor:'pointer'}}><strong>{i.number}</strong></td>
            {showLoc&&<td onClick={()=>onSelect(i)} style={{cursor:'pointer'}}><span className="kf-loc-tag"><MapPin size={11}/>{getLocName(i.locationId)}</span></td>}
            <td onClick={()=>onSelect(i)} style={{cursor:'pointer'}} className="kf-sub">{i.createdAt?.split('T')[0]||i.convertedAt?.split('T')[0]||'—'}</td>
            <td onClick={()=>onSelect(i)} style={{cursor:'pointer'}}>${(i.finalTotal||i.total||0).toFixed(2)}</td>
            <td onClick={()=>onSelect(i)} style={{cursor:'pointer'}} className={(i.balance||0)>0?'red':'green'}>${(i.balance||0).toFixed(2)}</td>
            <td onClick={()=>onSelect(i)} style={{cursor:'pointer'}}><span className={`kf-badge ${i.status}`}>{i.status}</span></td>
            <td style={{display:'flex',gap:4}}>
              <button className="kf-icon-btn secondary" onClick={ev=>{ev.stopPropagation();onArchive([i.id],!i.archived);}} title={i.archived?'Unarchive':'Archive'}>{i.archived?<ArchiveRestore size={15}/>:<Archive size={15}/>}</button>
              <button className="kf-icon-btn danger"    onClick={ev=>{ev.stopPropagation();onDelete(i);}} title="Delete"><Trash2 size={15}/></button>
            </td>
          </tr>
        ))}</tbody></table>
        {list.length===0&&<div className="kf-empty"><DollarSign size={40}/></div>}
      </div>
    </div>
  );
}

function MessagesView() {
  return <div className="kf-empty" style={{height:400}}><MessageSquare size={60}/><p>Messaging coming soon</p></div>;
}

function SettingsView({settings,setSettings,users,setUsers,locations,setLocations,customers,setCustomers,invoices,setInvoices,estimates,setEstimates,vehicles,setVehicles,currentUser,company,notify}) {
  const [localSettings,setLocalSettings]=useState(settings);
  const [tab,setTab]=useState('general');
  const [newUser,setNewUser]=useState({name:'',email:'',password:'',role:'technician',locationId:locations[0]?.id||''});
  const [showAddUser,setShowAddUser]=useState(false);
  const [editingUser,setEditingUser]=useState(null);
  const [newLoc,setNewLoc]=useState({name:'',address:'',phone:'',email:'',laborRate:'',taxRate:''});
  const [showAddLoc,setShowAddLoc]=useState(false);
  const [editingLoc,setEditingLoc]=useState(null);
  const [restoring,setRestoring]=useState(false);
  const restoreRef=useRef();

  const isMaster=currentUser.role==='master_admin';
  const isAdmin=currentUser.role==='admin'||isMaster;
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null); // {type, rows, errors}
  const [importing, setImporting] = useState(false);
  const [importAssignCustomerId, setImportAssignCustomerId] = useState('');
  const importRef = useRef(null);

  const parseShopmonkeyFleet = (workbook) => {
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
    const headerRow = raw.findIndex(r => r && r[0] === 'Company Name*');
    if (headerRow === -1) return {error: 'Could not find Shopmonkey fleet headers.'};
    const headers = raw[headerRow];
    const dataRows = raw.slice(headerRow + 1).filter(r => r && r[0]);
    const idx = (name) => headers.findIndex(h => h && h.toString().startsWith(name));
    const iName=idx('Company Name'), iPhone=idx('Primary Phone'), iEmail=idx('Primary Email'),
          iAddr1=idx('Address 1'), iAddr2=idx('Address 2'), iCity=idx('City'), iState=idx('State'),
          iZip=idx('Zip'), iNote=idx('Note'), iTaxExempt=idx('Tax Exempt'), iCreated=idx('Date Created');
    const rows = dataRows.map((r, i) => ({
      companyName: r[iName]?.toString().trim() || '',
      phones: [r[iPhone]?.toString().trim()].filter(Boolean),
      phone: r[iPhone]?.toString().trim() || '',
      emails: [r[iEmail]?.toString().trim()].filter(Boolean),
      email: r[iEmail]?.toString().trim() || '',
      address: [r[iAddr1], r[iAddr2]].filter(Boolean).join(', '),
      city: r[iCity]?.toString().trim() || '',
      state: r[iState]?.toString().trim() || '',
      zip: r[iZip]?.toString().trim() || '',
      note: r[iNote]?.toString().trim() || '',
      taxExempt: r[iTaxExempt] === true || r[iTaxExempt] === 'TRUE' || r[iTaxExempt] === 'Yes',
      smCreatedAt: r[iCreated]?.toString().trim() || '',
    })).filter(r => r.companyName);
    return {type:'fleet', rows, errors:[]};
  };

  const parseShopmonkeyOrderLineItems = (workbook) => {
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
    const headerRow = raw.findIndex(r => r && r[0] === 'Order #*');
    if (headerRow === -1) return {error: 'Could not find Shopmonkey order line items headers.'};
    const headers = raw[headerRow];
    const idx = (name) => headers.findIndex(h => h && h.toString().startsWith(name));
    const iOrder=idx('Order #'), iDate=idx('Invoiced Date'), iVehicle=idx('Vehicle'),
          iType=idx('Type'), iDesc=idx('Part Description'), iTech=idx('Technician'),
          iNote=idx('Note'), iHours=idx('Hours'), iRate=idx('Rate'), iCost=idx('Cost'),
          iPrice=idx('Price'), iQty=idx('Quantity'), iSubtotal=idx('Subtotal'), iStatus=idx('Status');
    const dataRows = raw.slice(headerRow + 1).filter(r => r && r[iOrder]);

    // Group by order number
    const orderMap = new Map();
    for (const r of dataRows) {
      const orderNum = r[iOrder]?.toString().trim();
      if (!orderNum) continue;
      if (!orderMap.has(orderNum)) {
        const rawDate = r[iDate]?.toString() || '';
        const dateStr = rawDate ? rawDate.split('T')[0] : '';
        orderMap.set(orderNum, {
          orderNum,
          date: dateStr,
          vehicleStr: r[iVehicle]?.toString().trim() || '',
          items: [],
          total: 0,
        });
      }
      const order = orderMap.get(orderNum);
      const type = (r[iType]||'').toString().toLowerCase();
      const subtotal = parseFloat(r[iSubtotal]) || 0;
      order.total += subtotal;
      const item = {
        id: `i${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        description: r[iDesc]?.toString().trim() || 'Service',
        technicianName: r[iTech]?.toString().trim() || '',
        customerNote: r[iNote]?.toString().trim() || '',
      };
      if (type === 'labor') {
        item.type = 'labor';
        item.hours = Math.round((parseFloat(r[iHours]) || 0) * 10000) / 10000;
        item.rate = parseFloat(r[iRate]) || 0;
      } else if (type === 'part') {
        item.type = 'part';
        item.quantity = parseFloat(r[iQty]) || 1;
        item.cost = parseFloat(r[iCost]) || 0;
      } else {
        item.type = 'fee';
        item.price = subtotal;
      }
      order.items.push(item);
    }

    const rows = Array.from(orderMap.values());
    // Parse vehicle string "2021 Jeep Grand Cherokee L Limited" → {year, make, model}
    rows.forEach(o => {
      const parts = o.vehicleStr.split(' ');
      o.vehicleYear = parts[0] || '';
      o.vehicleMake = parts[1] || '';
      o.vehicleModel = parts.slice(2).join(' ') || '';
    });
    return {type:'orders', rows, errors:[]};
  };

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFile(file.name);
    setImportPreview(null);
    setImportAssignCustomerId('');
    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, {type:'array'});
      const ws = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
      // Detect format by scanning all rows for known header signatures
      const allText = raw.map(r => (r||[]).join('|')).join('\n').toLowerCase();
      let result;
      if (raw.some(r => r && r[0] === 'Company Name*')) {
        result = parseShopmonkeyFleet(workbook);
      } else if (raw.some(r => r && r[0] === 'Order #*')) {
        result = parseShopmonkeyOrderLineItems(workbook);
      } else if (allText.includes('company name')) {
        result = parseShopmonkeyFleet(workbook);
      } else if (allText.includes('order #')) {
        result = parseShopmonkeyOrderLineItems(workbook);
      } else {
        result = {error: 'Unrecognized format. Supported: Shopmonkey Fleet export or Order Line Items export.'};
      }
      if (result.error) { notify(result.error, 'error'); setImportFile(null); return; }
      setImportPreview(result);
    } catch(err) {
      notify('Failed to read file: ' + err.message, 'error');
      setImportFile(null);
    }
  };

  const handleDoImport = () => {
    if (!importPreview) return;
    setImporting(true);

    if (importPreview.type === 'fleet') {
      const existing = customers.map(c => (c.companyName||'').toLowerCase().trim());
      let added = 0, skipped = 0;
      const newCustomers = [...customers];
      for (const row of importPreview.rows) {
        const nameLower = row.companyName.toLowerCase().trim();
        if (existing.includes(nameLower)) { skipped++; continue; }
        newCustomers.push({
          id: `c${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
          type: 'fleet', companyName: row.companyName, contactName: '',
          phones: row.phones, phone: row.phone, emails: row.emails, email: row.email,
          address: row.address, city: row.city, state: row.state, zip: row.zip,
          note: row.note, taxExempt: row.taxExempt,
          discountAppliesTo: {labor:true,parts:true,fees:true},
          totalSpent: 0, createdAt: new Date().toISOString().split('T')[0],
        });
        existing.push(nameLower);
        added++;
      }
      setCustomers(newCustomers);
      setImporting(false);
      setImportPreview(null);
      setImportFile(null);
      notify(`Import complete: ${added} fleet customers added, ${skipped} skipped`);

    } else if (importPreview.type === 'orders') {
      const existingNums = new Set(invoices.map(i => i.number));
      let added = 0, skipped = 0;
      const newInvoices = [...invoices];
      const newVehicles = [...vehicles];

      // Vehicle dedup map: "customerId|year|make|model" → vehicleId
      const vehicleKey = (cid, year, make, model) =>
        `${cid||'none'}|${(year||'').toLowerCase()}|${(make||'').toLowerCase()}|${(model||'').toLowerCase()}`;
      const vehicleCache = new Map();
      // Pre-seed from existing vehicles
      for (const v of newVehicles) {
        vehicleCache.set(vehicleKey(v.customerId, v.year, v.make, v.model), v.id);
      }

      const getOrCreateVehicle = (order) => {
        if (!order.vehicleStr) return null;
        const year  = order.vehicleYear  || '';
        const make  = order.vehicleMake  || '';
        const model = order.vehicleModel || '';
        if (!year && !make) return null;
        const cid = importAssignCustomerId || null;
        const key = vehicleKey(cid, year, make, model);
        if (vehicleCache.has(key)) return vehicleCache.get(key);
        const vid = `v_sm_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
        newVehicles.push({
          id: vid,
          customerId: cid,
          year, make, model,
          vin: '',
          plate: '',
          color: '',
          mileageIn: '',
          mileageOut: '',
          source: 'shopmonkey',
        });
        vehicleCache.set(key, vid);
        return vid;
      };

      for (const order of importPreview.rows) {
        if (existingNums.has(order.orderNum)) { skipped++; continue; }
        const vehicleId = getOrCreateVehicle(order);
        newInvoices.push({
          id: `inv_sm_${order.orderNum.replace('#','')}`,
          number: order.orderNum,
          status: 'paid',
          source: 'shopmonkey',
          customerId: importAssignCustomerId || null,
          vehicleId,
          vehicleStr: order.vehicleStr,
          createdAt: order.date,
          convertedAt: order.date,
          items: order.items,
          subtotal: parseFloat(order.total)||0,
          tax: 0,
          finalTotal: parseFloat(order.total)||0,
          balance: 0,
          payments: [{amount: parseFloat(order.total)||0, method: 'imported', date: order.date||''}],
          notes: `Imported from Shopmonkey. Vehicle: ${order.vehicleStr}`,
        });
        existingNums.add(order.orderNum);
        added++;
      }
      const newVehicleCount = newVehicles.length - vehicles.length;
      setVehicles(newVehicles);
      setInvoices(newInvoices);
      setImporting(false);
      setImportPreview(null);
      setImportFile(null);
      notify(`Import complete: ${added} invoices + ${newVehicleCount} vehicles added, ${skipped} skipped`);
    }
  };
  const saveSettings=()=>{setSettings(localSettings);notify('Settings saved');};

  const addUser=()=>{
    if(!newUser.name||!newUser.email||!newUser.password){notify('Name, email and password required','error');return;}
    if(!isMaster&&newUser.role!=='technician'){notify('Admins can only add technicians','error');return;}
    const u={...newUser,id:`u${Date.now()}`,companyId:company?.id};
    setUsers([...users,u]);setNewUser({name:'',email:'',password:'',role:'technician',locationId:locations[0]?.id||''});
    setShowAddUser(false);notify('User added');
  };
  const saveEditUser=()=>{
    if(!editingUser.name||!editingUser.email){notify('Name and email required','error');return;}
    const updated = {...editingUser};
    if (editingUser.newPassword) updated.password = editingUser.newPassword;
    delete updated.newPassword;
    setUsers(users.map(u=>u.id===updated.id?updated:u));setEditingUser(null);notify('User updated');
  };
  const deleteUser=(id)=>{
    if(id===currentUser.id){notify('Cannot delete yourself','error');return;}
    const target=users.find(u=>u.id===id);
    if(!target)return;
    if(target.role==='master_admin'){notify('Cannot delete master admin','error');return;}
    if(confirm('Delete user?')){setUsers(users.filter(u=>u.id!==id));notify('Deleted');}
  };

  const addLoc=()=>{
    if(!newLoc.name){notify('Name required','error');return;}
    const l={...newLoc,id:`loc${Date.now()}`,laborRate:newLoc.laborRate!==''?parseFloat(newLoc.laborRate):null,taxRate:newLoc.taxRate!==''?parseFloat(newLoc.taxRate):null};
    setLocations([...locations,l]);setNewLoc({name:'',address:'',phone:'',email:'',laborRate:'',taxRate:''});setShowAddLoc(false);notify('Location added');
  };
  const saveEditLoc=()=>{
    const upd={...editingLoc,laborRate:editingLoc.laborRate!==''&&editingLoc.laborRate!==null?parseFloat(editingLoc.laborRate):null,taxRate:editingLoc.taxRate!==''&&editingLoc.taxRate!==null?parseFloat(editingLoc.taxRate):null};
    setLocations(locations.map(l=>l.id===upd.id?upd:l));setEditingLoc(null);notify('Location updated');
  };
  const deleteLoc=(id)=>{
    if(locations.length<=1){notify('Cannot delete last location','error');return;}
    if(users.some(u=>u.locationId===id)){notify('Reassign users before deleting','error');return;}
    if(confirm('Delete location?')){setLocations(locations.filter(l=>l.id!==id));notify('Deleted');}
  };

  const handleBackup=()=>window.open(`/api/company/${company?.id}/backup`,'_blank');
  const handleRestore=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    if(!confirm('Restore this backup? Current data will be overwritten.'))return;
    setRestoring(true);
    const fd=new FormData();fd.append('file',file);
    try{const res=await fetch(`/api/company/${company?.id}/restore`,{method:'POST',body:fd});
      if(res.ok){notify('Restore complete! Refresh the page.');} else notify('Restore failed','error');
    }catch{notify('Network error','error');}
    setRestoring(false);e.target.value='';
  };

  const visibleUsers=isMaster?users:users.filter(u=>u.locationId===currentUser.locationId);
  const roleIcon=(role)=>role==='master_admin'?<Shield size={13}/>:role==='admin'?<UserCog size={13}/>:<Wrench size={13}/>;
  const availableRoles=isMaster?ROLES:ROLES.filter(r=>r.id==='technician');

  return (
    <div className="kf-settings">
      <div className="kf-settings-tabs">
        <button className={tab==='general'?'active':''} onClick={()=>setTab('general')}><SlidersHorizontal size={16}/>General</button>
        {isAdmin&&<button className={tab==='locations'?'active':''} onClick={()=>setTab('locations')}><MapPin size={16}/>Locations</button>}
        <button className={tab==='users'?'active':''} onClick={()=>setTab('users')}><Users size={16}/>Users</button>
        {isMaster&&<button className={tab==='backup'?'active':''} onClick={()=>setTab('backup')}><Database size={16}/>Backup</button>}
        {isAdmin&&<button className={tab==='import'?'active':''} onClick={()=>setTab('import')}><Upload size={16}/>Import</button>}
      </div>

      {tab==='general'&&(
        <div className="kf-card wide">
          <h3><Building2 size={20}/> Business Info</h3>
          <div className="kf-settings-grid" style={{marginTop:16}}>
            <div className="kf-form-group"><label>Shop Name</label><input value={localSettings.shopName} onChange={e=>setLocalSettings({...localSettings,shopName:e.target.value})}/></div>
            <div className="kf-form-group"><label>Phone</label><input value={localSettings.phone} onChange={e=>setLocalSettings({...localSettings,phone:e.target.value})}/></div>
            <div className="kf-form-group"><label>Email</label><input value={localSettings.email||''} onChange={e=>setLocalSettings({...localSettings,email:e.target.value})}/></div>
            <div className="kf-form-group"><label>Default Labor Rate ($/hr)</label><input type="number" step="0.5" value={localSettings.laborRate} onChange={e=>setLocalSettings({...localSettings,laborRate:parseFloat(e.target.value)||0})}/></div>
            <div className="kf-form-group"><label>Default Tax Rate (%)</label><input type="number" step="0.1" value={localSettings.taxRate} onChange={e=>setLocalSettings({...localSettings,taxRate:parseFloat(e.target.value)||0})}/></div>
          </div>
          <button className="kf-btn primary" style={{marginTop:8}} onClick={saveSettings}><Save size={16}/>Save</button>
        </div>
      )}

      {tab==='locations'&&isAdmin&&(
        <div className="kf-card wide">
          <div className="kf-section-header"><h3><MapPin size={20}/> Locations</h3><button className="kf-btn primary sm" onClick={()=>setShowAddLoc(true)}><Plus size={14}/>Add</button></div>
          {showAddLoc&&(
            <div className="kf-loc-form">
              <div className="kf-row"><div className="kf-form-group"><label>Name *</label><input value={newLoc.name} onChange={e=>setNewLoc({...newLoc,name:e.target.value})}/></div><div className="kf-form-group"><label>Phone</label><input value={newLoc.phone} onChange={e=>setNewLoc({...newLoc,phone:e.target.value})}/></div></div>
              <div className="kf-row"><div className="kf-form-group"><label>Address</label><input value={newLoc.address} onChange={e=>setNewLoc({...newLoc,address:e.target.value})}/></div><div className="kf-form-group"><label>Email</label><input value={newLoc.email} onChange={e=>setNewLoc({...newLoc,email:e.target.value})}/></div></div>
              <div className="kf-row"><div className="kf-form-group"><label>Labor Rate Override</label><input type="number" placeholder={`Default: $${settings.laborRate}`} value={newLoc.laborRate} onChange={e=>setNewLoc({...newLoc,laborRate:e.target.value})}/></div><div className="kf-form-group"><label>Tax Rate Override</label><input type="number" placeholder={`Default: ${settings.taxRate}%`} value={newLoc.taxRate} onChange={e=>setNewLoc({...newLoc,taxRate:e.target.value})}/></div></div>
              <div className="kf-row"><button className="kf-btn secondary" onClick={()=>setShowAddLoc(false)}>Cancel</button><button className="kf-btn primary" onClick={addLoc}><Save size={16}/>Add</button></div>
            </div>
          )}
          <div className="kf-loc-list">{locations.map(loc=>(
            <div key={loc.id} className="kf-loc-row">
              {editingLoc?.id===loc.id?(
                <div className="kf-loc-edit" style={{width:'100%'}}>
                  <div className="kf-row"><div className="kf-form-group"><label>Name *</label><input value={editingLoc.name} onChange={e=>setEditingLoc({...editingLoc,name:e.target.value})}/></div><div className="kf-form-group"><label>Phone</label><input value={editingLoc.phone||''} onChange={e=>setEditingLoc({...editingLoc,phone:e.target.value})}/></div></div>
                  <div className="kf-row"><div className="kf-form-group"><label>Address</label><input value={editingLoc.address||''} onChange={e=>setEditingLoc({...editingLoc,address:e.target.value})}/></div><div className="kf-form-group"><label>Email</label><input value={editingLoc.email||''} onChange={e=>setEditingLoc({...editingLoc,email:e.target.value})}/></div></div>
                  <div className="kf-row"><div className="kf-form-group"><label>Labor Rate Override</label><input type="number" placeholder={`Global: $${settings.laborRate}`} value={editingLoc.laborRate??''} onChange={e=>setEditingLoc({...editingLoc,laborRate:e.target.value})}/></div><div className="kf-form-group"><label>Tax Rate Override</label><input type="number" placeholder={`Global: ${settings.taxRate}%`} value={editingLoc.taxRate??''} onChange={e=>setEditingLoc({...editingLoc,taxRate:e.target.value})}/></div></div>
                  <div className="kf-row"><button className="kf-btn secondary" onClick={()=>setEditingLoc(null)}>Cancel</button><button className="kf-btn primary" onClick={saveEditLoc}><Save size={16}/>Save</button></div>
                </div>
              ):(
                <><div className="kf-loc-icon"><MapPin size={20}/></div>
                <div className="kf-loc-info"><div className="kf-name">{loc.name}</div>
                  <div className="kf-sub">{loc.address&&<span>{loc.address}</span>}{loc.phone&&<span> · {loc.phone}</span>}{(loc.laborRate!=null||loc.taxRate!=null)?<span className="kf-loc-overrides">{loc.laborRate!=null&&` · Labor: $${loc.laborRate}/hr`}{loc.taxRate!=null&&` · Tax: ${loc.taxRate}%`}</span>:<span className="kf-loc-overrides"> · Using global rates</span>}</div>
                </div>
                <div className="kf-loc-actions"><span className="kf-sub">{users.filter(u=>u.locationId===loc.id).length} users</span><button className="kf-icon-btn" onClick={()=>setEditingLoc({...loc,laborRate:loc.laborRate??'',taxRate:loc.taxRate??''})}><Edit2 size={15}/></button>{locations.length>1&&<button className="kf-icon-btn danger" onClick={()=>deleteLoc(loc.id)}><Trash2 size={15}/></button>}</div></>
              )}
            </div>
          ))}</div>
        </div>
      )}

      {tab==='users'&&(
        <div className="kf-card wide">
          <div className="kf-section-header"><h3><Users size={20}/> Users</h3><button className="kf-btn primary sm" onClick={()=>setShowAddUser(true)}><Plus size={14}/>Add User</button></div>
          {showAddUser&&(
            <div className="kf-add-user-form">
              <div className="kf-row"><div className="kf-form-group"><label>Name *</label><input value={newUser.name} onChange={e=>setNewUser({...newUser,name:e.target.value})}/></div><div className="kf-form-group"><label>Password *</label><input type="password" value={newUser.password} onChange={e=>setNewUser({...newUser,password:e.target.value})}/></div></div>
              <div className="kf-row">
                <div className="kf-form-group"><label>Role</label><select value={newUser.role} onChange={e=>setNewUser({...newUser,role:e.target.value})}>{availableRoles.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
                <div className="kf-form-group"><label>Location</label><select value={newUser.locationId} onChange={e=>setNewUser({...newUser,locationId:e.target.value})}>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
              </div>
              <div className="kf-form-group"><label>Email</label><input value={newUser.email} onChange={e=>setNewUser({...newUser,email:e.target.value})}/></div>
              <div className="kf-row"><button className="kf-btn secondary" onClick={()=>setShowAddUser(false)}>Cancel</button><button className="kf-btn primary" onClick={addUser}><Save size={16}/>Add</button></div>
            </div>
          )}
          <div className="kf-users-list">{visibleUsers.map(u=>{
            const userLoc=locations.find(l=>l.id===u.locationId);
            const canEdit=isMaster||(isAdmin&&u.role==='technician'&&u.locationId===currentUser.locationId);
            return(
              <div key={u.id} className="kf-user-row">
                {editingUser?.id===u.id?(
                  <div className="kf-user-edit" style={{width:'100%'}}>
                    <div className="kf-row"><div className="kf-form-group"><label>Name *</label><input value={editingUser.name} onChange={e=>setEditingUser({...editingUser,name:e.target.value})}/></div><div className="kf-form-group"><label>New Password <span className="kf-sub">(blank = keep)</span></label><input type="password" value={editingUser.newPassword||''} onChange={e=>setEditingUser({...editingUser,newPassword:e.target.value})} placeholder="••••••••"/></div></div>
                    <div className="kf-row"><div className="kf-form-group"><label>Role</label><select value={editingUser.role} onChange={e=>setEditingUser({...editingUser,role:e.target.value})}>{availableRoles.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></div><div className="kf-form-group"><label>Location</label><select value={editingUser.locationId||''} onChange={e=>setEditingUser({...editingUser,locationId:e.target.value})}>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div></div>
                    <div className="kf-row"><button className="kf-btn secondary" onClick={()=>setEditingUser(null)}>Cancel</button><button className="kf-btn primary" onClick={saveEditUser}><Save size={16}/>Save</button></div>
                  </div>
                ):(
                  <><div className="kf-avatar">{u.name.charAt(0)}</div>
                  <div className="kf-user-info"><div className="kf-name">{u.name}{u.id===currentUser.id&&<span className="kf-badge">You</span>}</div>
                    <div className="kf-sub kf-user-meta"><span className={`kf-role-tag ${u.role}`}>{roleIcon(u.role)}{u.role.replace('_',' ')}</span>{userLoc&&<span className="kf-loc-tag"><MapPin size={11}/>{userLoc.name}</span>}</div>
                  </div>
                  <div className="kf-user-actions">{canEdit&&<button className="kf-icon-btn" onClick={()=>setEditingUser({...u})}><Edit2 size={15}/></button>}{canEdit&&u.id!==currentUser.id&&u.role!=='master_admin'&&<button className="kf-icon-btn danger" onClick={()=>deleteUser(u.id)}><Trash2 size={15}/></button>}</div></>
                )}
              </div>
            );
          })}</div>
        </div>
      )}

      {tab==='backup'&&isMaster&&(
        <div className="kf-settings-grid">
          <div className="kf-card">
            <h3><Download size={20}/> Backup</h3>
            <p className="kf-sub" style={{marginBottom:16}}>Download your company's complete database as a <code>.db</code> file. Keep it safe — you can restore from it later.</p>
            <button className="kf-btn primary" onClick={handleBackup}><Download size={16}/>Download Backup</button>
          </div>
          <div className="kf-card">
            <h3><RefreshCw size={20}/> Restore</h3>
            <p className="kf-sub" style={{marginBottom:16}}>Upload a previously downloaded <code>.db</code> file to restore your company data. <strong>This will overwrite all current data.</strong></p>
            <label className="kf-btn secondary" style={{cursor:'pointer',display:'inline-flex',alignItems:'center',gap:8}}>
              {restoring?<Loader2 size={16} className="spin"/>:<RefreshCw size={16}/>}Choose Backup File
              <input ref={restoreRef} type="file" accept=".db" style={{display:'none'}} onChange={handleRestore}/>
            </label>
          </div>
        </div>
      )}

      {tab==='import'&&isAdmin&&(
        <div className="kf-card wide">
          <h3><Upload size={20}/> Import from Shopmonkey</h3>
          <p className="kf-sub" style={{marginBottom:20}}>Upload an export file from Shopmonkey. Duplicates (matched by company name) are automatically skipped.</p>

          {/* ── Cleanup Tool ── */}
          {(()=>{
            const undatedInvoices = invoices.filter(i => !i.archived && !(i.convertedAt||i.createdAt) && i.source==='shopmonkey');
            if (undatedInvoices.length === 0) return null;
            return (
              <div className="kf-cleanup-tool">
                <div className="kf-cleanup-icon"><AlertTriangle size={20}/></div>
                <div className="kf-cleanup-body">
                  <strong>{undatedInvoices.length} undated imported invoice{undatedInvoices.length!==1?'s':''} detected</strong>
                  <p className="kf-sub">These have no invoice date and were likely never completed in Shopmonkey. They should be archived estimates, not paid invoices.</p>
                  <button className="kf-btn primary sm" onClick={()=>{
                    // Convert each to an archived estimate, remove from invoices
                    const newEstimates = undatedInvoices.map(inv => ({
                      id: `est_${inv.id}`,
                      number: `EST-SM-${inv.number.replace(/\D/g,'')}`,
                      status: 'pending',
                      archived: true,
                      source: 'shopmonkey',
                      customerId: inv.customerId||null,
                      vehicleId: inv.vehicleId||null,
                      vehicleStr: inv.vehicleStr||'',
                      title: inv.notes||`Imported from Shopmonkey (${inv.number})`,
                      items: inv.items||[],
                      total: inv.finalTotal||inv.total||0,
                      finalTotal: inv.finalTotal||inv.total||0,
                      createdAt: new Date().toISOString(),
                    }));
                    setEstimates(prev => [...prev, ...newEstimates]);
                    setInvoices(prev => prev.filter(i => !undatedInvoices.find(u=>u.id===i.id)));
                    notify(`Converted ${undatedInvoices.length} undated invoices to archived estimates`);
                  }}>
                    <Archive size={14}/> Convert to Archived Estimates
                  </button>
                </div>
              </div>
            );
          })()}


          <div className="kf-import-formats">
            <div className="kf-import-format-card">
              <div className="kf-import-format-icon"><Users size={20}/></div>
              <div><strong>Fleet Customers</strong><div className="kf-sub" style={{fontSize:'0.78rem'}}>Shopmonkey → Fleet → Export</div></div>
            </div>
            <div className="kf-import-format-card">
              <div className="kf-import-format-icon"><FileText size={20}/></div>
              <div><strong>Order Line Items</strong><div className="kf-sub" style={{fontSize:'0.78rem'}}>Shopmonkey → Reports → Order Line Items → Export</div></div>
            </div>
          </div>

          <div className="kf-import-dropzone" onClick={()=>importRef.current?.click()}>
            <Upload size={28}/>
            <div>{importFile ? <><strong>{importFile}</strong><br/><span className="kf-sub">Click to change</span></> : <><strong>Click to choose file</strong><br/><span className="kf-sub">.xlsx files from Shopmonkey exports</span></>}</div>
            <input ref={importRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportFile}/>
          </div>

          {importPreview && (
            <div className="kf-import-preview">
              {importPreview.type === 'orders' && (
                <div className="kf-import-customer-assign">
                  <label><Users size={14}/> Assign all invoices to customer:</label>
                  <select value={importAssignCustomerId} onChange={e => setImportAssignCustomerId(e.target.value)}>
                    <option value="">— No customer (unlinked) —</option>
                    {[...(customers||[])].sort((a,b)=>(a.companyName||`${a.firstName} ${a.lastName}`).localeCompare(b.companyName||`${b.firstName} ${b.lastName}`)).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.type==='fleet' ? c.companyName : `${c.firstName} ${c.lastName}`}
                      </option>
                    ))}
                  </select>
                  {importAssignCustomerId && <span className="kf-import-assign-note">✓ All {importPreview.rows.length} invoices will be linked to this customer</span>}
                </div>
              )}
              <div className="kf-import-preview-header">
                <div>
                  <strong>{importPreview.rows.length} {importPreview.type === 'orders' ? 'invoices' : 'customers'} ready to import</strong>
                  <span className="kf-sub" style={{marginLeft:12}}>
                    {importPreview.type === 'fleet'
                      ? `${importPreview.rows.filter(r => (customers||[]).some(c=>(c.companyName||'').toLowerCase().trim()===r.companyName.toLowerCase().trim())).length} duplicates will be skipped`
                      : `${importPreview.rows.filter(r => invoices.some(i=>i.number===r.orderNum)).length} duplicates will be skipped`
                    }
                  </span>
                </div>
                <button className="kf-btn primary" onClick={handleDoImport} disabled={importing}>
                  {importing ? <Loader2 size={16} className="spin"/> : <Upload size={16}/>}
                  Import {importPreview.rows.length} Records
                </button>
              </div>
              <div className="kf-import-table-wrap">
                {importPreview.type === 'fleet' ? (
                  <table className="kf-import-table">
                    <thead><tr><th>Company Name</th><th>Phone</th><th>Email</th><th>City/State</th><th>Tax Exempt</th><th>Status</th></tr></thead>
                    <tbody>
                      {importPreview.rows.slice(0,50).map((r,i) => {
                        const isDupe = (customers||[]).some(c => (c.companyName||'').toLowerCase().trim() === r.companyName.toLowerCase().trim());
                        return (
                          <tr key={i} className={isDupe ? 'dupe' : ''}>
                            <td>{r.companyName}</td><td>{r.phone||'—'}</td><td>{r.email||'—'}</td>
                            <td>{[r.city,r.state].filter(Boolean).join(', ')||'—'}</td>
                            <td>{r.taxExempt ? <span className="kf-badge sm green">Exempt</span> : '—'}</td>
                            <td>{isDupe ? <span className="kf-sub">Skip</span> : <span style={{color:'var(--success)'}}>New</span>}</td>
                          </tr>
                        );
                      })}
                      {importPreview.rows.length > 50 && <tr><td colSpan={6} className="kf-sub" style={{textAlign:'center',padding:12}}>...and {importPreview.rows.length - 50} more</td></tr>}
                    </tbody>
                  </table>
                ) : (
                  <table className="kf-import-table">
                    <thead><tr><th>Order #</th><th>Date</th><th>Vehicle</th><th>Line Items</th><th>Total</th><th>Status</th></tr></thead>
                    <tbody>
                      {importPreview.rows.slice(0,50).map((r,i) => {
                        const isDupe = invoices.some(inv => inv.number === r.orderNum);
                        return (
                          <tr key={i} className={isDupe ? 'dupe' : ''}>
                            <td>{r.orderNum}</td>
                            <td>{r.date||'—'}</td>
                            <td>{r.vehicleStr||'—'}</td>
                            <td style={{textAlign:'center'}}>{r.items.length}</td>
                            <td>${r.total.toFixed(2)}</td>
                            <td>{isDupe ? <span className="kf-sub">Skip</span> : <span style={{color:'var(--success)'}}>New</span>}</td>
                          </tr>
                        );
                      })}
                      {importPreview.rows.length > 50 && <tr><td colSpan={6} className="kf-sub" style={{textAlign:'center',padding:12}}>...and {importPreview.rows.length - 50} more</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CannedItemsView({cannedItems, setCannedItems, settings, notify}) {
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newCategory, setNewCategory] = useState('');
  const [expandedCats, setExpandedCats] = useState({});
  const [newItem, setNewItem] = useState({
    name: '', description: '', type: 'labor', categoryId: '',
    hours: 0, rate: settings.laborRate, quantity: 1, cost: 0, price: 0, notes: ''
  });

  const categories = cannedItems.categories || [];
  const items = cannedItems.items || [];

  const addCategory = () => {
    if (!newCategory.trim()) return;
    const cat = { id: `cat${Date.now()}`, name: newCategory.trim() };
    setCannedItems({ ...cannedItems, categories: [...categories, cat] });
    setNewCategory('');
    setShowAddCategory(false);
    notify('Category added');
  };

  const deleteCategory = (catId) => {
    if (!confirm('Delete category and all its items?')) return;
    setCannedItems({
      categories: categories.filter(c => c.id !== catId),
      items: items.filter(i => i.categoryId !== catId)
    });
    notify('Category deleted');
  };

  const addItem = () => {
    if (!newItem.name.trim() || !newItem.categoryId) { notify('Name and category required', 'error'); return; }
    const item = { ...newItem, id: `ci${Date.now()}` };
    setCannedItems({ ...cannedItems, items: [...items, item] });
    setNewItem({ name: '', description: '', type: 'labor', categoryId: newItem.categoryId, hours: 0, rate: settings.laborRate, quantity: 1, cost: 0, price: 0, notes: '' });
    setShowAddItem(false);
    notify('Canned item added');
  };

  const updateItem = () => {
    if (!editingItem.name.trim()) { notify('Name required', 'error'); return; }
    setCannedItems({ ...cannedItems, items: items.map(i => i.id === editingItem.id ? editingItem : i) });
    setEditingItem(null);
    notify('Item updated');
  };

  const deleteItem = (itemId) => {
    if (!confirm('Delete this canned item?')) return;
    setCannedItems({ ...cannedItems, items: items.filter(i => i.id !== itemId) });
    notify('Item deleted');
  };

  const toggleCategory = (catId) => {
    setExpandedCats({ ...expandedCats, [catId]: !expandedCats[catId] });
  };

  const getItemsByCategory = (catId) => items.filter(i => i.categoryId === catId);

  return (
    <div className="kf-canned-view">
      <div className="kf-actions">
        <button className="kf-btn primary" onClick={() => setShowAddCategory(true)}><FolderPlus size={16}/>Add Category</button>
        <button className="kf-btn secondary" onClick={() => { setNewItem({...newItem, categoryId: categories[0]?.id || ''}); setShowAddItem(true); }} disabled={categories.length === 0}><Plus size={16}/>Add Item</button>
      </div>

      {categories.length === 0 ? (
        <div className="kf-empty" style={{marginTop: 40}}><Layers size={60}/><p>No categories yet. Create a category to start adding canned items.</p></div>
      ) : (
        <div className="kf-canned-list">
          {categories.map(cat => (
            <div key={cat.id} className="kf-canned-category">
              <div className="kf-cat-header" onClick={() => toggleCategory(cat.id)}>
                {expandedCats[cat.id] ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                <span className="kf-cat-name">{cat.name}</span>
                <span className="kf-cat-count">{getItemsByCategory(cat.id).length} items</span>
                <button className="kf-icon-btn sm" onClick={(e) => { e.stopPropagation(); setNewItem({...newItem, categoryId: cat.id}); setShowAddItem(true); }}><Plus size={14}/></button>
                <button className="kf-icon-btn sm danger" onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}><Trash2 size={14}/></button>
              </div>
              {expandedCats[cat.id] && (
                <div className="kf-cat-items">
                  {getItemsByCategory(cat.id).length === 0 ? (
                    <div className="kf-cat-empty">No items in this category</div>
                  ) : (
                    getItemsByCategory(cat.id).map(item => (
                      <div key={item.id} className="kf-canned-item">
                        <div className="kf-ci-icon">
                          {item.type === 'labor' ? <Clock size={16}/> : item.type === 'part' ? <Package size={16}/> : <Tag size={16}/>}
                        </div>
                        <div className="kf-ci-info">
                          <div className="kf-ci-name">{item.name}</div>
                          {item.description && <div className="kf-ci-desc">{item.description}</div>}
                          <div className="kf-ci-details">
                            <span className="kf-badge sm">{item.type}</span>
                            {item.type === 'labor' && <span>{item.hours}h × ${item.rate}/hr = ${(item.hours * item.rate).toFixed(2)}</span>}
                            {item.type === 'part' && <span>{item.quantity} × ${item.cost} = ${(item.quantity * item.cost).toFixed(2)}</span>}
                            {item.type === 'fee' && <span>${item.price}</span>}
                          </div>
                          {item.notes && <div className="kf-ci-notes"><StickyNote size={12}/> {item.notes}</div>}
                        </div>
                        <div className="kf-ci-actions">
                          <button className="kf-icon-btn sm" onClick={() => setEditingItem({...item})}><Edit2 size={14}/></button>
                          <button className="kf-icon-btn sm danger" onClick={() => deleteItem(item.id)}><Trash2 size={14}/></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategory && (
        <div className="kf-overlay" onClick={() => setShowAddCategory(false)}>
          <div className="kf-modal sm" onClick={e => e.stopPropagation()}>
            <div className="kf-modal-header"><h2>Add Category</h2><button className="kf-close" onClick={() => setShowAddCategory(false)}><X size={20}/></button></div>
            <div className="kf-modal-body">
              <div className="kf-form-group"><label>Category Name *</label><input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="e.g., ADAS Calibrations, Diagnostics..." autoFocus/></div>
            </div>
            <div className="kf-modal-footer"><button className="kf-btn secondary" onClick={() => setShowAddCategory(false)}>Cancel</button><button className="kf-btn primary" onClick={addCategory}><Save size={16}/>Add</button></div>
          </div>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      {(showAddItem || editingItem) && (
        <div className="kf-overlay" onClick={() => { setShowAddItem(false); setEditingItem(null); }}>
          <div className="kf-modal" onClick={e => e.stopPropagation()}>
            <div className="kf-modal-header"><h2>{editingItem ? 'Edit Canned Item' : 'Add Canned Item'}</h2><button className="kf-close" onClick={() => { setShowAddItem(false); setEditingItem(null); }}><X size={20}/></button></div>
            <div className="kf-modal-body">
              <div className="kf-form-group"><label>Category *</label>
                <select value={editingItem?.categoryId || newItem.categoryId} onChange={e => editingItem ? setEditingItem({...editingItem, categoryId: e.target.value}) : setNewItem({...newItem, categoryId: e.target.value})}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="kf-form-group"><label>Item Name *</label><input value={editingItem?.name || newItem.name} onChange={e => editingItem ? setEditingItem({...editingItem, name: e.target.value}) : setNewItem({...newItem, name: e.target.value})} placeholder="e.g., Front Camera Calibration"/></div>
              <div className="kf-form-group"><label>Description</label><input value={editingItem?.description || newItem.description} onChange={e => editingItem ? setEditingItem({...editingItem, description: e.target.value}) : setNewItem({...newItem, description: e.target.value})} placeholder="Brief description..."/></div>
              <div className="kf-form-group"><label>Type</label>
                <div className="kf-radio">
                  <label><input type="radio" checked={(editingItem?.type || newItem.type) === 'labor'} onChange={() => editingItem ? setEditingItem({...editingItem, type: 'labor'}) : setNewItem({...newItem, type: 'labor'})}/>Labor</label>
                  <label><input type="radio" checked={(editingItem?.type || newItem.type) === 'part'} onChange={() => editingItem ? setEditingItem({...editingItem, type: 'part'}) : setNewItem({...newItem, type: 'part'})}/>Part</label>
                  <label><input type="radio" checked={(editingItem?.type || newItem.type) === 'fee'} onChange={() => editingItem ? setEditingItem({...editingItem, type: 'fee'}) : setNewItem({...newItem, type: 'fee'})}/>Fee</label>
                </div>
              </div>
              {(editingItem?.type || newItem.type) === 'labor' && (() => {
                const item = editingItem || newItem;
                const setItem = editingItem
                  ? v => setEditingItem({...editingItem, ...v})
                  : v => setNewItem({...newItem, ...v});
                const effectiveRate = item.rate || settings.laborRate;
                const subtotal = +(item.hours * effectiveRate).toFixed(2);
                return (
                  <div>
                    <div className="kf-row" style={{marginBottom:8}}>
                      <div className="kf-form-group">
                        <label>Rate ($/hr)</label>
                        <input type="number" step="0.5" value={item.rate}
                          onChange={e => {
                            const rate = +e.target.value || 0;
                            setItem({rate, hours: rate > 0 && item.hours > 0 ? +(item.hours * rate / (item.rate || rate)).toFixed(4) : item.hours});
                          }}/>
                      </div>
                      <div className="kf-form-group">
                        <label>Hours</label>
                        <input type="number" step="0.25" value={item.hours}
                          onChange={e => setItem({hours: +e.target.value || 0})}/>
                      </div>
                    </div>
                    <div className="kf-subtotal-row">
                      <div className="kf-form-group">
                        <label>Subtotal ($) <span className="kf-label-hint">— auto-calculates hours</span></label>
                        <input type="number" step="0.01" placeholder="Enter dollar amount..."
                          value={subtotal > 0 ? subtotal : ''}
                          onChange={e => {
                            const dollars = +e.target.value || 0;
                            const rate = effectiveRate || settings.laborRate || 1;
                            setItem({hours: dollars > 0 ? +(dollars / rate).toFixed(4) : 0});
                          }}/>
                      </div>
                      <div className="kf-subtotal-preview">
                        <span className="kf-sub">= {item.hours > 0 ? item.hours.toFixed(2) : '0'} hrs × ${effectiveRate}/hr</span>
                        <strong>${subtotal.toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {(editingItem?.type || newItem.type) === 'part' && (
                <div className="kf-row">
                  <div className="kf-form-group"><label>Quantity</label><input type="number" min="1" value={editingItem?.quantity || newItem.quantity} onChange={e => editingItem ? setEditingItem({...editingItem, quantity: +e.target.value || 1}) : setNewItem({...newItem, quantity: +e.target.value || 1})}/></div>
                  <div className="kf-form-group"><label>Cost ($)</label><input type="number" step="0.01" value={editingItem?.cost || newItem.cost} onChange={e => editingItem ? setEditingItem({...editingItem, cost: +e.target.value || 0}) : setNewItem({...newItem, cost: +e.target.value || 0})}/></div>
                </div>
              )}
              {(editingItem?.type || newItem.type) === 'fee' && (
                <div className="kf-form-group"><label>Price ($)</label><input type="number" step="0.01" value={editingItem?.price || newItem.price} onChange={e => editingItem ? setEditingItem({...editingItem, price: +e.target.value || 0}) : setNewItem({...newItem, price: +e.target.value || 0})}/></div>
              )}
              <div className="kf-form-group"><label>Notes (internal details)</label><textarea rows={3} value={editingItem?.notes || newItem.notes} onChange={e => editingItem ? setEditingItem({...editingItem, notes: e.target.value}) : setNewItem({...newItem, notes: e.target.value})} placeholder="Detailed notes for this line item..."/></div>
            </div>
            <div className="kf-modal-footer">
              <button className="kf-btn secondary" onClick={() => { setShowAddItem(false); setEditingItem(null); }}>Cancel</button>
              <button className="kf-btn primary" onClick={editingItem ? updateItem : addItem}><Save size={16}/>{editingItem ? 'Save Changes' : 'Add Item'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerForm({onClose, onSave}) {
  const [type,setType]=useState('public');
  const [f,setF]=useState({firstName:'',lastName:'',companyName:'',contactName:'',email:'',phone:'',discount:'',discountAppliesTo:{labor:true,parts:true,fees:true},taxExempt:false});
  return (
    <div className="kf-overlay" onClick={onClose}>
      <div className="kf-modal" onClick={e=>e.stopPropagation()}>
        <div className="kf-modal-header"><h2>Add Customer</h2><button className="kf-close" onClick={onClose}><X size={20}/></button></div>
        <form onSubmit={e=>{e.preventDefault();onSave({...f,type,discount:f.discount!==''?parseFloat(f.discount):undefined});}}>
          <div className="kf-modal-body">
            <div className="kf-radio">
              <label><input type="radio" checked={type==='public'} onChange={()=>setType('public')}/>Public</label>
              <label><input type="radio" checked={type==='fleet'} onChange={()=>setType('fleet')}/>Fleet</label>
            </div>
            {type==='public'
              ? <div className="kf-row"><div className="kf-form-group"><label>First *</label><input required value={f.firstName} onChange={e=>setF({...f,firstName:e.target.value})}/></div><div className="kf-form-group"><label>Last *</label><input required value={f.lastName} onChange={e=>setF({...f,lastName:e.target.value})}/></div></div>
              : <><div className="kf-form-group"><label>Company *</label><input required value={f.companyName} onChange={e=>setF({...f,companyName:e.target.value})}/></div><div className="kf-form-group"><label>Contact *</label><input required value={f.contactName} onChange={e=>setF({...f,contactName:e.target.value})}/></div></>
            }
            <div className="kf-row">
              <div className="kf-form-group"><label>Phone *</label><input required value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></div>
              <div className="kf-form-group"><label>Email</label><input value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div>
            </div>
            <div className="kf-row">
              <div className="kf-form-group">
                <label>Discount (%)</label>
                <input type="number" min="0" max="100" step="0.5" placeholder="e.g. 25" value={f.discount} onChange={e=>setF({...f,discount:e.target.value})}/>
              </div>
              <div className="kf-form-group kf-toggle-group">
                <label>Tax Exempt</label>
                <div className={`kf-toggle ${f.taxExempt?'on':''}`} onClick={()=>setF({...f,taxExempt:!f.taxExempt})}>
                  <span>{f.taxExempt ? 'Yes — No Tax' : 'No'}</span>
                  <div className="kf-toggle-knob"/>
                </div>
              </div>
            </div>
            {f.discount > 0 && (
              <div className="kf-form-group">
                <label>Apply Discount To</label>
                <div className="kf-discount-toggles">
                  {[['labor','Labor'],['parts','Parts'],['fees','Fees']].map(([key,label]) => (
                    <div key={key} className={`kf-disc-toggle ${f.discountAppliesTo[key]?'on':''}`}
                      onClick={()=>setF({...f,discountAppliesTo:{...f.discountAppliesTo,[key]:!f.discountAppliesTo[key]}})}>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="kf-modal-footer">
            <button type="button" className="kf-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="kf-btn primary"><Save size={16}/>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustomerDetail({customer, vehicles, getName, onClose}) {
  return <div className="kf-overlay" onClick={onClose}><div className="kf-modal" onClick={e=>e.stopPropagation()}><div className="kf-modal-header"><h2>{getName(customer)}</h2><button className="kf-close" onClick={onClose}><X size={20}/></button></div><div className="kf-modal-body"><span className={`kf-badge ${customer.type}`}>{customer.type}</span><p style={{marginTop:12}}>{customer.phone} • {customer.email}</p><h4 style={{marginTop:20}}>Vehicles ({vehicles.length})</h4>{vehicles.map(v=><div key={v.id} className="kf-veh-row"><Car size={16}/><span>{v.year} {v.make} {v.model}</span><span className="kf-plate">{v.plate}</span></div>)}</div><div className="kf-modal-footer"><button className="kf-btn secondary" onClick={onClose}>Close</button></div></div></div>;
}

function VehicleForm({customers, getName, onClose, onSave, notify, preselectedCustomer}) {
  const [f,setF]=useState({customerId:preselectedCustomer||'',year:'',make:'',model:'',vin:'',plate:'',plateState:'WA'});
  const [loading,setLoading]=useState(false);
  const handleDecode = async () => {
    if(f.vin.length<17)return; setLoading(true);
    const r = await decodeVIN(f.vin);
    if(r.success){setF({...f,year:r.year,make:r.make,model:r.model});notify('Decoded!');}
    else notify(r.error,'error');
    setLoading(false);
  };
  return <div className="kf-overlay" onClick={onClose}><div className="kf-modal" onClick={e=>e.stopPropagation()}><div className="kf-modal-header"><h2>Add Vehicle</h2><button className="kf-close" onClick={onClose}><X size={20}/></button></div><form onSubmit={e=>{e.preventDefault();onSave(f);}}><div className="kf-modal-body">{!preselectedCustomer&&<div className="kf-form-group"><label>Owner *</label><select required value={f.customerId} onChange={e=>setF({...f,customerId:e.target.value})}><option value="">Select...</option>{customers.map(c=><option key={c.id} value={c.id}>{getName(c)}</option>)}</select></div>}<div className="kf-form-group"><label>VIN *</label><div className="kf-input-btn"><input required maxLength={17} value={f.vin} onChange={e=>setF({...f,vin:e.target.value.toUpperCase()})}/><button type="button" onClick={handleDecode} disabled={loading||f.vin.length<17}>{loading?<Loader2 size={16} className="spin"/>:<Zap size={16}/>}</button></div></div><div className="kf-row"><div className="kf-form-group"><label>Year</label><input value={f.year} onChange={e=>setF({...f,year:e.target.value})}/></div><div className="kf-form-group"><label>Make</label><input value={f.make} onChange={e=>setF({...f,make:e.target.value})}/></div><div className="kf-form-group"><label>Model</label><input value={f.model} onChange={e=>setF({...f,model:e.target.value})}/></div></div><div className="kf-row"><div className="kf-form-group"><label>Plate</label><input value={f.plate} onChange={e=>setF({...f,plate:e.target.value.toUpperCase()})}/></div><div className="kf-form-group"><label>State</label><select value={f.plateState} onChange={e=>setF({...f,plateState:e.target.value})}>{US_STATES.map(s=><option key={s}>{s}</option>)}</select></div></div></div><div className="kf-modal-footer"><button type="button" className="kf-btn secondary" onClick={onClose}>Cancel</button><button type="submit" className="kf-btn primary"><Save size={16}/>Save</button></div></form></div></div>;
}

function InvoiceDetail({invoice, customer, vehicle, settings, users, getName, onClose, onRevert, onPay}) {
  const [showPay,setShowPay]=useState(false);
  const [method,setMethod]=useState('card');
  const [amt,setAmt]=useState(invoice.balance);

  const handlePrintInvoice = () => {
    const printWindow = window.open('', '_blank');
    const subtotal = invoice.subtotal || invoice.total || 0;
    const discount = invoice.discount || 0;
    const discPct = customer?.discount || 0;
    const tax = invoice.tax || 0;
    const finalTotal = invoice.finalTotal || invoice.total || 0;
    
    const itemsHtml = (invoice.items || []).map(item => {
      const itemTotal = item.type === 'labor' ? (item.hours || 0) * (item.rate || settings.laborRate) :
                        item.type === 'part' ? (item.quantity || 1) * (item.cost || 0) :
                        item.price || 0;
      const details = item.type === 'labor' ? `${item.hours}h × $${item.rate || settings.laborRate}/hr` :
                      item.type === 'part' ? `${item.quantity} × $${(item.cost || 0).toFixed(2)}` :
                      'Flat fee';
      const noteRow = item.customerNote ? `<tr class="item-note-row"><td colspan="4" style="padding:2px 8px 8px 8px;color:#888;font-size:11px;font-style:italic">${item.customerNote}</td></tr>` : '';
      return `<tr>
        <td>${item.description || 'Untitled'}</td>
        <td style="text-transform:capitalize">${item.type}</td>
        <td>${details}</td>
        <td style="text-align:right">$${itemTotal.toFixed(2)}</td>
      </tr>${noteRow}`;
    }).join('');

    const paymentsHtml = (invoice.payments || []).map(p => 
      `<tr class="payment"><td colspan="3">${p.date} - Payment (${p.method})</td><td style="text-align:right;color:green">-$${(p.amount||0).toFixed(2)}</td></tr>`
    ).join('');

    // Build itemsHtml grouped by description (no grouping key yet, just render as service blocks)
    const creatorName = users.find(u => u.id === invoice.createdBy)?.name || 'Staff';
    const custAddr = customer ? [customer.address, customer.city && customer.state ? customer.city+', '+customer.state+' '+customer.zip : (customer.city||customer.state||'')].filter(Boolean).join('<br>') : '';
    const payTerm = invoice.paymentTerm || 'Net 30';
    const poNum = invoice.poNumber || '';

    const paymentsTableHtml = (invoice.payments || []).length > 0 ? `
      <div class="payments-section">
        <table class="payments-table">
          <thead><tr><th>Date</th><th>Method</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${(invoice.payments||[]).map(p=>`<tr><td>${p.date}</td><td style="text-transform:capitalize">${p.method}</td><td style="text-align:right">$${(p.amount||0).toFixed(2)}</td></tr>`).join('')}
            <tr class="pay-total"><td colspan="2"><strong>Total Payments</strong></td><td style="text-align:right"><strong>$${(invoice.payments||[]).reduce((s,p)=>s+p.amount,0).toFixed(2)}</strong></td></tr>
          </tbody>
        </table>
      </div>` : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 13px; color: #222; max-width: 820px; margin: 0 auto; padding: 36px; }
          /* Header */
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #e63946; }
          .shop-block .shop-name { font-size: 18px; font-weight: bold; color: #111; }
          .shop-block .shop-detail { font-size: 12px; color: #555; line-height: 1.6; margin-top: 4px; }
          .inv-block { text-align: right; }
          .inv-block .inv-title { font-size: 32px; font-weight: bold; color: #111; }
          .inv-block .inv-meta { font-size: 12px; color: #444; line-height: 1.8; margin-top: 4px; }
          .inv-block .inv-meta strong { color: #111; }
          /* Parties */
          .parties { display: flex; gap: 32px; margin-bottom: 24px; }
          .party { flex: 1; }
          .party-label { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin-bottom: 6px; }
          .party-name { font-size: 15px; font-weight: bold; color: #111; margin-bottom: 3px; }
          .party-detail { font-size: 12px; color: #555; line-height: 1.6; }
          /* Vehicle */
          .vehicle-box { background: #f7f7f7; border: 1px solid #e0e0e0; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
          .vehicle-make { font-size: 15px; font-weight: bold; color: #111; margin-bottom: 4px; }
          .vehicle-fields { display: flex; flex-wrap: wrap; gap: 16px; }
          .vehicle-field { font-size: 12px; color: #555; }
          .vehicle-field span { color: #888; font-size: 11px; display: block; }
          /* Comments */
          .comments-box { border: 1px solid #ddd; border-radius: 4px; padding: 12px 14px; margin-bottom: 24px; font-size: 12px; color: #444; }
          .comments-label { font-weight: bold; font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 6px; }
          /* Service sections */
          .service-section { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
          .service-header { background: #f0f0f0; padding: 10px 14px; font-weight: bold; font-size: 13px; border-bottom: 1px solid #ddd; }
          .service-table { width: 100%; border-collapse: collapse; }
          .service-table th { background: #fafafa; padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; border-bottom: 1px solid #e8e8e8; }
          .service-table td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
          .service-table tr:last-child td { border-bottom: none; }
          .service-note { font-size: 11px; color: #777; font-style: italic; margin-top: 3px; }
          .service-footer { display: flex; justify-content: flex-end; gap: 24px; padding: 10px 14px; border-top: 1px solid #ddd; background: #fafafa; font-size: 12px; color: #555; }
          .service-footer strong { color: #111; }
          /* Totals */
          .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 24px; }
          .totals { width: 280px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
          .total-row { display: flex; justify-content: space-between; padding: 8px 14px; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
          .total-row:last-child { border-bottom: none; }
          .total-row.grand { font-size: 15px; font-weight: bold; background: #f0f0f0; }
          .total-row.balance-row { font-size: 14px; font-weight: bold; color: ${((invoice.balance||0) > 0) ? '#c0392b' : '#27ae60'}; }
          /* Warranty */
          .warranty { border: 1px solid #ddd; border-radius: 4px; padding: 14px 18px; margin-bottom: 24px; font-size: 11px; color: #555; line-height: 1.6; }
          .warranty-title { font-weight: bold; font-size: 12px; color: #333; margin-bottom: 8px; }
          /* Signature */
          .signature-line { margin-bottom: 24px; }
          .sig-label { font-size: 12px; font-weight: bold; margin-bottom: 8px; }
          .sig-box { border-bottom: 1px solid #333; width: 280px; height: 32px; }
          /* Payments */
          .payments-section { margin-bottom: 24px; }
          .payments-section h4 { font-size: 13px; font-weight: bold; margin-bottom: 8px; }
          .payments-table { width: 100%; border-collapse: collapse; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; font-size: 13px; }
          .payments-table th { background: #f0f0f0; padding: 8px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #666; }
          .payments-table td { padding: 10px 14px; border-bottom: 1px solid #f0f0f0; }
          .payments-table tr.pay-total td { background: #fafafa; border-top: 1px solid #ddd; border-bottom: none; }
          /* Footer */
          .footer { text-align: center; font-size: 11px; color: #888; padding-top: 16px; border-top: 1px solid #ddd; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          <div class="shop-block">
            <div class="shop-name">${settings.shopName}</div>
            <div class="shop-detail">
              ${settings.address ? settings.address+'<br>' : ''}
              ${settings.phone}<br>
              ${settings.email}${settings.website ? '<br>'+settings.website : ''}
            </div>
          </div>
          <div class="inv-block">
            <div class="inv-title">Invoice ${invoice.number}</div>
            <div class="inv-meta">
              <div>Created: <strong>${invoice.createdAt || ''}</strong></div>
              <div>Invoiced: <strong>${invoice.convertedAt || ''}</strong></div>
              <div>Payment Term: <strong>${payTerm}</strong></div>
              <div>Payment Due: <strong>${invoice.dueAt || ''}</strong></div>
              <div>Service Writer: <strong>${creatorName}</strong></div>
              ${poNum ? `<div>PO #: <strong>${poNum}</strong></div>` : ''}
            </div>
          </div>
        </div>

        <!-- Parties + Vehicle -->
        <div class="parties">
          <div class="party">
            <div class="party-label">Bill To</div>
            <div class="party-name">${customer ? getName(customer) : 'N/A'}</div>
            <div class="party-detail">
              ${customer ? getName(customer) : ''}<br>
              ${custAddr}<br>
              ${customer?.phone || customer?.phones?.[0] || ''}<br>
              ${customer?.email || customer?.emails?.[0] || ''}
            </div>
          </div>
          <div class="party">
            <div class="party-label">Vehicle</div>
            ${vehicle ? `
              <div class="party-name">${vehicle.year} ${vehicle.make} ${vehicle.model}</div>
              <div class="party-detail">
                VIN: ${vehicle.vin || 'N/A'}<br>
                License Plate: ${vehicle.plate || 'N/A'}
                ${vehicle.mileageIn != null ? '<br>Mileage In: '+vehicle.mileageIn.toLocaleString()+' mi' : ''}
                ${vehicle.mileageOut != null ? '<br>Mileage Out: '+vehicle.mileageOut.toLocaleString()+' mi' : ''}
              </div>
            ` : '<div class="party-detail">No vehicle</div>'}
          </div>
        </div>

        <!-- Customer comments -->
        ${invoice.customerComments ? `
          <div class="comments-box">
            <div class="comments-label">Customer Comments</div>
            ${invoice.customerComments}
          </div>` : ''}

        <!-- Line items as service sections -->
        ${(invoice.items || []).map(item => {
          const itemTotal = item.type==='labor' ? (item.hours||0)*(item.rate||settings.laborRate) :
                            item.type==='part'  ? (item.quantity||1)*(item.cost||0) : (item.price||0);
          const details = item.type==='labor' ? `${(item.hours||0).toFixed(4)}h × $${item.rate||settings.laborRate}/hr` :
                          item.type==='part'  ? `Qty ${item.quantity||1} × $${(item.cost||0).toFixed(2)}` : 'Flat fee';
          const discAmt = discPct > 0 && !customer?.taxExempt ? itemTotal * (discPct/100) : 0;
          const itemNet = itemTotal - discAmt;
          return `
            <div class="service-section">
              <div class="service-header">${item.description || 'Service'}</div>
              <table class="service-table">
                <thead><tr><th>#</th><th>Description</th><th style="text-align:right">Subtotal</th></tr></thead>
                <tbody>
                  <tr>
                    <td>1</td>
                    <td>
                      ${item.description || 'Service'}
                      ${item.customerNote ? `<div class="service-note">${item.customerNote}</div>` : ''}
                      <div class="service-note">${details}</div>
                    </td>
                    <td style="text-align:right">$${itemTotal.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
              <div class="service-footer">
                ${discAmt > 0 ? `<span>Discount (${discPct}%): <strong>$${discAmt.toFixed(2)}</strong></span>` : ''}
                <span>Total: <strong>$${itemNet.toFixed(2)}</strong></span>
              </div>
            </div>`;
        }).join('')}

        <!-- Totals -->
        <div class="totals-wrap">
          <div class="totals">
            <div class="total-row"><span>Labor</span><span>$${subtotal.toFixed(2)}</span></div>
            <div class="total-row"><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>
            ${discount > 0 ? `<div class="total-row"><span>Discount</span><span>$${discount.toFixed(2)}</span></div>` : ''}
            <div class="total-row"><span>Shop Supplies</span><span>$0.00</span></div>
            <div class="total-row"><span>EPA</span><span>$0.00</span></div>
            ${customer?.taxExempt ? `<div class="total-row"><span>Tax</span><span>$0.00</span></div>` : `<div class="total-row"><span>Tax (${invoice.taxRate||settings.taxRate}%)</span><span>$${tax.toFixed(2)}</span></div>`}
            <div class="total-row grand"><span>Grand Total</span><span>$${finalTotal.toFixed(2)}</span></div>
            ${(invoice.payments||[]).length > 0 ? `<div class="total-row"><span>Paid to Date</span><span>($${(invoice.payments||[]).reduce((s,p)=>s+p.amount,0).toFixed(2)})</span></div>` : ''}
            <div class="total-row balance-row"><span>REMAINING BALANCE</span><span>$${(invoice.balance||0).toFixed(2)}</span></div>
          </div>
        </div>

        <!-- Warranty -->
        <div class="warranty">
          <div class="warranty-title">Limited Warranty &amp; Disclaimer</div>
          ${settings.warrantyText || 'Kaizen Automotive confirms that the diagnostic tests and calibration of the vehicle sensors on the vehicle were completed at the repair facility on the date stated above. Kaizen Automotive warrants that the final diagnostic tests confirm that the vehicle sensors were calibrated to perform in accordance with the specifications of the manufacturer. Kaizen Automotive does not offer any warranty or make any representation whatsoever once the vehicle leaves the repair facility.<br><br>Accuracy of replacement modules or components requiring programming, encoding, or configuration to the vehicle must be verified to "match" hardware and/or software numbers where applicable, we are not responsible for "mismatched" hardware or software that will not program to the vehicle by OEM equipment or modules/components replaced which result in similar or unforeseen concerns (additional module processing, software action, or diagnostics may be required).'}
        </div>

        <!-- Substantially all services note -->
        <p style="font-size:11px;color:#666;margin-bottom:20px;">Substantially all services include "pre" and "post" scan reports, vehicle condition and prerequisite checks, and functionality checks (which may include road-testing) for any ADAS calibrations, programming, or diagnostics.</p>

        <!-- Signature -->
        <div class="signature-line">
          <div class="sig-label">Signature</div>
          <div class="sig-box"></div>
        </div>

        <!-- Payments -->
        ${paymentsTableHtml}

        <div class="footer">
          ${settings.shopName} • ${settings.phone} • ${settings.email}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const canRevert = invoice.status === 'unpaid' && (!invoice.payments || invoice.payments.length === 0);

  return <div className="kf-overlay" onClick={onClose}><div className="kf-modal" onClick={e=>e.stopPropagation()}><div className="kf-modal-header"><h2>{invoice.number}</h2><button className="kf-close" onClick={onClose}><X size={20}/></button></div><div className="kf-modal-body"><div className="kf-detail-header"><span className={`kf-badge ${invoice.status}`}>{invoice.status}</span><span className="kf-sub">Due: {invoice.dueAt}</span><button className="kf-btn secondary sm" onClick={handlePrintInvoice}><Printer size={14}/>Print</button>{invoice.status!=='paid'&&<button className="kf-btn success sm" onClick={()=>setShowPay(true)}><CreditCard size={14}/>Pay</button>}</div>{showPay&&<div className="kf-pay-form"><div className="kf-pay-methods">{['card','cash','check'].map(m=><div key={m} className={method===m?'active':''} onClick={()=>setMethod(m)}>{m==='card'?<CreditCard size={20}/>:<DollarSign size={20}/>}<span>{m}</span></div>)}</div><div className="kf-form-group"><label>Amount</label><input type="number" value={amt} onChange={e=>setAmt(+e.target.value||0)}/></div><div className="kf-row"><button className="kf-btn secondary" onClick={()=>setShowPay(false)}>Cancel</button><button className="kf-btn success" onClick={()=>{onPay({amount:amt,method,date:new Date().toISOString().split('T')[0]});setShowPay(false);}}><CheckCircle size={14}/>Confirm</button></div></div>}<p><strong>Customer:</strong> {getName(customer)}</p>{vehicle && <p><strong>Vehicle:</strong> {vehicle.year} {vehicle.make} {vehicle.model}</p>}{invoice.estimateNumber && <p className="kf-sub">From: {invoice.estimateNumber}</p>}<div className="kf-totals" style={{marginTop:16}}><div><span>Total</span><span>${(invoice.finalTotal||invoice.total||0).toFixed(2)}</span></div>{invoice.payments?.map((p,i)=><div key={i} className="green"><span>{p.date} ({p.method})</span><span>-${(p.amount||0).toFixed(2)}</span></div>)}<div className="total"><span>Balance</span><span className={invoice.balance>0?'red':'green'}>${(invoice.balance||0).toFixed(2)}</span></div></div></div><div className="kf-modal-footer">{canRevert && <button className="kf-btn secondary" onClick={() => { if(confirm('Revert to estimate? Invoice will be deleted.')) onRevert(); }}><ArrowLeft size={14}/>Revert to Estimate</button>}<button className="kf-btn secondary" onClick={onClose}>Close</button></div></div></div>;
}

// Customer/Vehicle selector component for estimate page
function CustomerVehicleSelector({customers, vehicles, selectedCustomerId, selectedVehicleId, getName, onSelectCustomer, onSelectVehicle, onAddCustomer, onAddVehicle, onUpdateCustomer, onUpdateVehicle, notify}) {
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [showVehDropdown, setShowVehDropdown] = useState(false);
  const [showAddCust, setShowAddCust] = useState(false);
  const [showEditCust, setShowEditCust] = useState(false);
  const [custSearch, setCustSearch] = useState('');
  const custSearchRef = useRef(null);
  const custDropdownRef = useRef(null);
  const [vehMode, setVehMode] = useState('select');
  const [vin, setVin] = useState('');
  const [plate, setPlate] = useState('');
  const [plateState, setPlateState] = useState('WA');
  const [newVeh, setNewVeh] = useState({year:'',make:'',model:'',vin:'',plate:'',plateState:'WA',engine:'',engineModel:'',transmission:''});
  const [newCust, setNewCust] = useState({type:'public',firstName:'',lastName:'',companyName:'',contactName:'',phones:[''],emails:[''],discount:'',discountAppliesTo:{labor:true,parts:true,fees:true},taxExempt:false});
  const [editCust, setEditCust] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState(0);

  const customer = customers.find(c => c.id === selectedCustomerId);
  const vehicle = vehicles.find(v => v.id === selectedVehicleId);
  const customerVehicles = vehicles.filter(v => v.customerId === selectedCustomerId);
  const filteredCustomers = customers.filter(c => !custSearch || getName(c).toLowerCase().includes(custSearch.toLowerCase()));

  // Get phones/emails as arrays (support legacy single value or new array format)
  const getPhones = (c) => c?.phones || (c?.phone ? [c.phone] : []);
  const getEmails = (c) => c?.emails || (c?.email ? [c.email] : []);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    notify('Copied to clipboard!');
  };

  const openNHTSA = (vinNum) => {
    // Opens NHTSA decoder - user needs to click "Decode VIN" button on their site
    window.open(`https://vpic.nhtsa.dot.gov/decoder/?vin=${vinNum}`, '_blank');
  };

  const handleDecodeVin = async () => {
    if (vin.length < 17) return;
    setLoading(true);
    const r = await decodeVIN(vin.toUpperCase());
    if (r.success) {
      setNewVeh({
        ...newVeh, 
        vin: vin.toUpperCase(), 
        year: r.year, 
        make: r.make, 
        model: r.model,
        engine: r.engine || '',
        engineModel: r.engineModel || '',
        transmission: r.transmission || ''
      });
      notify('VIN decoded!');
    } else {
      notify(r.error, 'error');
    }
    setLoading(false);
  };

  const handleSaveVehicle = () => {
    if (!newVeh.vin || !selectedCustomerId) return;
    const veh = onAddVehicle({...newVeh, customerId: selectedCustomerId});
    onSelectVehicle(veh.id);
    setNewVeh({year:'',make:'',model:'',vin:'',plate:'',plateState:'WA',engine:'',engineModel:'',transmission:''});
    setVin('');
    setShowVehDropdown(false);
    notify('Vehicle added!');
  };

  const handleSaveCustomer = () => {
    if (newCust.type === 'public' && (!newCust.firstName || !newCust.lastName)) return;
    if (newCust.type === 'fleet' && !newCust.companyName) return;
    const phones = newCust.phones.filter(p => p.trim());
    const emails = newCust.emails.filter(e => e.trim());
    const discount = newCust.discount !== '' ? parseFloat(newCust.discount) : undefined;
    const cust = onAddCustomer({...newCust, phones, emails, phone: phones[0] || '', email: emails[0] || '', discount, discountAppliesTo: newCust.discountAppliesTo, taxExempt: newCust.taxExempt || false});
    onSelectCustomer(cust.id);
    setShowAddCust(false);
    setNewCust({type:'public',firstName:'',lastName:'',companyName:'',contactName:'',phones:[''],emails:[''],discount:'',discountAppliesTo:{labor:true,parts:true,fees:true},taxExempt:false});
    notify('Customer added!');
  };

  const handleEditCustomer = () => {
    if (!customer) return;
    setEditCust({
      ...customer,
      phones: getPhones(customer).length > 0 ? getPhones(customer) : [''],
      emails: getEmails(customer).length > 0 ? getEmails(customer) : ['']
    });
    setShowEditCust(true);
  };

  const handleUpdateCustomer = () => {
    if (!editCust) return;
    const phones = editCust.phones.filter(p => p.trim());
    const emails = editCust.emails.filter(e => e.trim());
    const discount = editCust.discount !== '' && editCust.discount != null ? parseFloat(editCust.discount) : undefined;
    onUpdateCustomer({...editCust, phones, emails, phone: phones[0] || '', email: emails[0] || '', discount, discountAppliesTo: editCust.discountAppliesTo || {labor:true,parts:true,fees:true}, taxExempt: editCust.taxExempt || false});
    setShowEditCust(false);
    setEditCust(null);
    notify('Customer updated!');
  };

  return (
    <div className="kf-est-info-bar-new">
      {/* Customer Section */}
      <div className="kf-info-section">
        <div className="kf-info-section-header">
          <div className="kf-info-label"><Users size={16}/> Customer</div>
          <div className="kf-header-btns">
            {customer && <button className="kf-edit-btn" onClick={handleEditCustomer}><Edit2 size={14}/>Edit</button>}
            <button className="kf-change-btn" onClick={() => { const next = !showCustDropdown; setShowCustDropdown(next); if (next) setTimeout(() => custSearchRef.current?.focus(), 0); }}>{customer ? 'Change' : 'Select'}<ChevronDown size={14}/></button>
          </div>
        </div>
        
        {customer ? (
          <div className="kf-info-details">
            <div className="kf-info-name">
              {getName(customer)}
              {customer.discount > 0 && <span className="kf-badge sm green" style={{marginLeft:6}}>{customer.discount}% off</span>}
              {customer.taxExempt && <span className="kf-badge sm" style={{marginLeft:4,background:'rgba(45,147,108,0.2)',color:'#2d936c'}}>Tax Exempt</span>}
            </div>
            <div className="kf-info-row">
              <span className="kf-info-icon">📱</span>
              {getPhones(customer).length > 1 ? (
                <select value={selectedPhone} onChange={e => setSelectedPhone(+e.target.value)}>
                  {getPhones(customer).map((p, i) => <option key={i} value={i}>{p}</option>)}
                </select>
              ) : (
                <span>{getPhones(customer)[0] || 'No phone'}</span>
              )}
            </div>
            <div className="kf-info-row">
              <span className="kf-info-icon">✉️</span>
              {getEmails(customer).length > 1 ? (
                <select value={selectedEmail} onChange={e => setSelectedEmail(+e.target.value)}>
                  {getEmails(customer).map((e, i) => <option key={i} value={i}>{e}</option>)}
                </select>
              ) : (
                <span>{getEmails(customer)[0] || 'No email'}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="kf-info-empty" onClick={() => { setShowCustDropdown(true); setTimeout(() => custSearchRef.current?.focus(), 0); }}>Click to select customer...</div>
        )}

        {showCustDropdown && (
          <div className="kf-dropdown" onMouseDown={e => e.preventDefault()}>
            <div className="kf-dropdown-search"><Search size={14}/><input ref={custSearchRef} placeholder="Search..." value={custSearch} onChange={e => setCustSearch(e.target.value)}/></div>
            <div className="kf-dropdown-list">
              {filteredCustomers.map(c => (
                <div key={c.id} className={`kf-dropdown-item ${c.id === selectedCustomerId ? 'selected' : ''}`} onMouseDown={e => {e.preventDefault();onSelectCustomer(c.id);setShowCustDropdown(false);onSelectVehicle(null);}}>
                  <div className="kf-avatar sm">{getName(c).charAt(0)}</div>
                  <div>
                    <div className="kf-name">{getName(c)}</div>
                    <div className="kf-sub">{getPhones(c)[0]} {getEmails(c)[0] && `• ${getEmails(c)[0]}`}</div>
                  </div>
                </div>
              ))}
              {filteredCustomers.length === 0 && <div className="kf-dropdown-empty">No customers found</div>}
            </div>
            <div className="kf-dropdown-footer"><button onMouseDown={e => {e.preventDefault();setShowCustDropdown(false);setShowAddCust(true);}}><Plus size={14}/>Add New Customer</button></div>
          </div>
        )}

        {/* Add Customer Modal */}
        {showAddCust && (
          <div className="kf-overlay" onClick={() => setShowAddCust(false)}>
            <div className="kf-modal" onClick={e => e.stopPropagation()}>
              <div className="kf-modal-header"><h2>Add Customer</h2><button className="kf-close" onClick={() => setShowAddCust(false)}><X size={20}/></button></div>
              <div className="kf-modal-body">
                <div className="kf-radio"><label><input type="radio" checked={newCust.type==='public'} onChange={()=>setNewCust({...newCust,type:'public'})}/>Public</label><label><input type="radio" checked={newCust.type==='fleet'} onChange={()=>setNewCust({...newCust,type:'fleet'})}/>Fleet</label></div>
                {newCust.type==='public' ? (
                  <div className="kf-row"><div className="kf-form-group"><label>First Name *</label><input value={newCust.firstName} onChange={e=>setNewCust({...newCust,firstName:e.target.value})}/></div><div className="kf-form-group"><label>Last Name *</label><input value={newCust.lastName} onChange={e=>setNewCust({...newCust,lastName:e.target.value})}/></div></div>
                ) : (
                  <><div className="kf-form-group"><label>Company *</label><input value={newCust.companyName} onChange={e=>setNewCust({...newCust,companyName:e.target.value})}/></div><div className="kf-form-group"><label>Contact</label><input value={newCust.contactName} onChange={e=>setNewCust({...newCust,contactName:e.target.value})}/></div></>
                )}
                <div className="kf-form-group">
                  <label>Phone Numbers</label>
                  {newCust.phones.map((p, i) => (
                    <div key={i} className="kf-multi-input">
                      <input value={p} onChange={e => {const phones = [...newCust.phones]; phones[i] = e.target.value; setNewCust({...newCust, phones});}} placeholder="Phone..."/>
                      {newCust.phones.length > 1 && <button type="button" onClick={() => setNewCust({...newCust, phones: newCust.phones.filter((_, j) => j !== i)})}><X size={14}/></button>}
                    </div>
                  ))}
                  <button type="button" className="kf-add-field" onClick={() => setNewCust({...newCust, phones: [...newCust.phones, '']})}><Plus size={14}/>Add Phone</button>
                </div>
                <div className="kf-form-group">
                  <label>Email Addresses</label>
                  {newCust.emails.map((e, i) => (
                    <div key={i} className="kf-multi-input">
                      <input value={e} onChange={ev => {const emails = [...newCust.emails]; emails[i] = ev.target.value; setNewCust({...newCust, emails});}} placeholder="Email..."/>
                      {newCust.emails.length > 1 && <button type="button" onClick={() => setNewCust({...newCust, emails: newCust.emails.filter((_, j) => j !== i)})}><X size={14}/></button>}
                    </div>
                  ))}
                  <button type="button" className="kf-add-field" onClick={() => setNewCust({...newCust, emails: [...newCust.emails, '']})}><Plus size={14}/>Add Email</button>
                </div>
              </div>
              <div className="kf-row">
                <div className="kf-form-group">
                  <label>Discount (%)</label>
                  <input type="number" min="0" max="100" step="0.5" placeholder="e.g. 25" value={newCust.discount} onChange={e => setNewCust({...newCust, discount: e.target.value})}/>
                </div>
                <div className="kf-form-group kf-toggle-group">
                  <label>Tax Exempt</label>
                  <div className={`kf-toggle ${newCust.taxExempt ? 'on' : ''}`} onClick={() => setNewCust({...newCust, taxExempt: !newCust.taxExempt})}>
                    <span>{newCust.taxExempt ? 'Yes — No Tax' : 'No'}</span>
                    <div className="kf-toggle-knob"/>
                  </div>
                </div>
              </div>
              {newCust.discount > 0 && (
                <div className="kf-form-group">
                  <label>Apply Discount To</label>
                  <div className="kf-discount-toggles">
                    {[['labor','Labor'],['parts','Parts'],['fees','Fees']].map(([key, label]) => (
                      <div key={key} className={`kf-disc-toggle ${newCust.discountAppliesTo[key] ? 'on' : ''}`}
                        onClick={() => setNewCust({...newCust, discountAppliesTo: {...newCust.discountAppliesTo, [key]: !newCust.discountAppliesTo[key]}})}>
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="kf-modal-footer"><button className="kf-btn secondary" onClick={() => setShowAddCust(false)}>Cancel</button><button className="kf-btn primary" onClick={handleSaveCustomer}><Save size={16}/>Save</button></div>
            </div>
          </div>
        )}

        {/* Edit Customer Modal */}
        {showEditCust && editCust && (
          <div className="kf-overlay" onClick={() => setShowEditCust(false)}>
            <div className="kf-modal" onClick={e => e.stopPropagation()}>
              <div className="kf-modal-header"><h2>Edit Customer</h2><button className="kf-close" onClick={() => setShowEditCust(false)}><X size={20}/></button></div>
              <div className="kf-modal-body">
                <div className="kf-radio"><label><input type="radio" checked={editCust.type==='public'} onChange={()=>setEditCust({...editCust,type:'public'})}/>Public</label><label><input type="radio" checked={editCust.type==='fleet'} onChange={()=>setEditCust({...editCust,type:'fleet'})}/>Fleet</label></div>
                {editCust.type==='public' ? (
                  <div className="kf-row"><div className="kf-form-group"><label>First Name *</label><input value={editCust.firstName||''} onChange={e=>setEditCust({...editCust,firstName:e.target.value})}/></div><div className="kf-form-group"><label>Last Name *</label><input value={editCust.lastName||''} onChange={e=>setEditCust({...editCust,lastName:e.target.value})}/></div></div>
                ) : (
                  <><div className="kf-form-group"><label>Company *</label><input value={editCust.companyName||''} onChange={e=>setEditCust({...editCust,companyName:e.target.value})}/></div><div className="kf-form-group"><label>Contact</label><input value={editCust.contactName||''} onChange={e=>setEditCust({...editCust,contactName:e.target.value})}/></div></>
                )}
                <div className="kf-form-group">
                  <label>Phone Numbers</label>
                  {editCust.phones.map((p, i) => (
                    <div key={i} className="kf-multi-input">
                      <input value={p} onChange={e => {const phones = [...editCust.phones]; phones[i] = e.target.value; setEditCust({...editCust, phones});}} placeholder="Phone..."/>
                      {editCust.phones.length > 1 && <button type="button" onClick={() => setEditCust({...editCust, phones: editCust.phones.filter((_, j) => j !== i)})}><X size={14}/></button>}
                    </div>
                  ))}
                  <button type="button" className="kf-add-field" onClick={() => setEditCust({...editCust, phones: [...editCust.phones, '']})}><Plus size={14}/>Add Phone</button>
                </div>
                <div className="kf-form-group">
                  <label>Email Addresses</label>
                  {editCust.emails.map((e, i) => (
                    <div key={i} className="kf-multi-input">
                      <input value={e} onChange={ev => {const emails = [...editCust.emails]; emails[i] = ev.target.value; setEditCust({...editCust, emails});}} placeholder="Email..."/>
                      {editCust.emails.length > 1 && <button type="button" onClick={() => setEditCust({...editCust, emails: editCust.emails.filter((_, j) => j !== i)})}><X size={14}/></button>}
                    </div>
                  ))}
                  <button type="button" className="kf-add-field" onClick={() => setEditCust({...editCust, emails: [...editCust.emails, '']})}><Plus size={14}/>Add Email</button>
                </div>
              </div>
              <div className="kf-row">
                <div className="kf-form-group">
                  <label>Discount (%)</label>
                  <input type="number" min="0" max="100" step="0.5" placeholder="e.g. 25" value={editCust.discount ?? ''} onChange={e => setEditCust({...editCust, discount: e.target.value})}/>
                </div>
                <div className="kf-form-group kf-toggle-group">
                  <label>Tax Exempt</label>
                  <div className={`kf-toggle ${editCust.taxExempt ? 'on' : ''}`} onClick={() => setEditCust({...editCust, taxExempt: !editCust.taxExempt})}>
                    <span>{editCust.taxExempt ? 'Yes — No Tax' : 'No'}</span>
                    <div className="kf-toggle-knob"/>
                  </div>
                </div>
              </div>
              {(editCust.discount ?? 0) > 0 && (
                <div className="kf-form-group">
                  <label>Apply Discount To</label>
                  <div className="kf-discount-toggles">
                    {[['labor','Labor'],['parts','Parts'],['fees','Fees']].map(([key, label]) => {
                      const applies = editCust.discountAppliesTo || {labor:true,parts:true,fees:true};
                      return (
                        <div key={key} className={`kf-disc-toggle ${applies[key] ? 'on' : ''}`}
                          onClick={() => setEditCust({...editCust, discountAppliesTo: {...applies, [key]: !applies[key]}})}>
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="kf-modal-footer"><button className="kf-btn secondary" onClick={() => setShowEditCust(false)}>Cancel</button><button className="kf-btn primary" onClick={handleUpdateCustomer}><Save size={16}/>Save Changes</button></div>
            </div>
          </div>
        )}
      </div>

      {/* Vehicle Section */}
      <div className="kf-info-section">
        <div className="kf-info-section-header">
          <div className="kf-info-label"><Car size={16}/> Vehicle</div>
          {selectedCustomerId && <button className="kf-change-btn" onClick={() => setShowVehDropdown(!showVehDropdown)}>{vehicle ? 'Change' : 'Select'}<ChevronDown size={14}/></button>}
        </div>

        {vehicle ? (
          <div className="kf-info-details">
            <div className="kf-info-name">{vehicle.year} {vehicle.make} {vehicle.model}</div>
            <div className="kf-info-row">
              <span className="kf-info-icon">🚗</span>
              <span>Plate: <strong>{vehicle.plate || 'N/A'}</strong></span>
            </div>
            {vehicle.engine && (
              <div className="kf-info-row">
                <span className="kf-info-icon">⚙️</span>
                <span>{vehicle.engine}{vehicle.engineModel ? ` (${vehicle.engineModel})` : ''}</span>
              </div>
            )}
            {vehicle.transmission && (
              <div className="kf-info-row">
                <span className="kf-info-icon">🔄</span>
                <span>{vehicle.transmission}</span>
              </div>
            )}
            <div className="kf-info-row kf-vin-row" onClick={() => copyToClipboard(vehicle.vin)} title="Click to copy VIN">
              <span className="kf-info-icon">🔑</span>
              <code className="kf-vin-full">{vehicle.vin}</code>
              <span className="kf-copy-hint">📋 Copy</span>
            </div>
            <div className="kf-mileage-row">
              <div className="kf-mileage-field">
                <label>Miles In</label>
                <input
                  type="number"
                  min="0"
                  placeholder="—"
                  value={vehicle.mileageIn ?? ''}
                  onChange={e => {
                    const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                    const updated = { ...vehicle, mileageIn: val };
                    onUpdateVehicle(updated);
                  }}
                />
              </div>
              <div className="kf-mileage-field">
                <label>Miles Out</label>
                <input
                  type="number"
                  min="0"
                  placeholder="—"
                  value={vehicle.mileageOut ?? ''}
                  onChange={e => {
                    const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                    const updated = { ...vehicle, mileageOut: val };
                    onUpdateVehicle(updated);
                  }}
                />
              </div>
            </div>
            <div className="kf-external-links">
              <button className="kf-ext-link nhtsa" onClick={() => openNHTSA(vehicle.vin)}>
                🔗 NHTSA
              </button>
              <button className="kf-ext-link repairlink" onClick={() => window.open('https://www.repairlinkshop.com/', '_blank')}>
                🔧 RepairLink
              </button>
              <button className="kf-ext-link alldata" onClick={() => window.open('https://my.alldata.com/migrate/repair/#/select-vehicle', '_blank')}>
                📚 ALLDATA
              </button>
            </div>
          </div>
        ) : (
          <div className="kf-info-empty" onClick={() => selectedCustomerId && setShowVehDropdown(true)}>
            {selectedCustomerId ? 'Click to select vehicle...' : 'Select customer first'}
          </div>
        )}

        {showVehDropdown && selectedCustomerId && (
          <div className="kf-dropdown" onMouseDown={e => e.preventDefault()}>
            <div className="kf-dropdown-tabs">
              <button className={vehMode==='select'?'active':''} onClick={()=>setVehMode('select')}>Existing</button>
              <button className={vehMode==='vin'?'active':''} onClick={()=>setVehMode('vin')}>VIN</button>
              <button className={vehMode==='plate'?'active':''} onClick={()=>setVehMode('plate')}>Plate</button>
            </div>
            {vehMode === 'select' && (
              <>
                <div className="kf-dropdown-list">
                  {customerVehicles.map(v => (
                    <div key={v.id} className={`kf-dropdown-item ${v.id === selectedVehicleId ? 'selected' : ''}`} onMouseDown={e => {e.preventDefault();onSelectVehicle(v.id);setShowVehDropdown(false);}}>
                      <Car size={18}/>
                      <div><div className="kf-name">{v.year} {v.make} {v.model}</div><div className="kf-sub">{v.plate} • {v.vin}</div></div>
                    </div>
                  ))}
                  {customerVehicles.length === 0 && <div className="kf-dropdown-empty">No vehicles for this customer</div>}
                </div>
                <div className="kf-dropdown-footer"><button onMouseDown={e => {e.preventDefault();setVehMode('vin');}}><Plus size={14}/>Add New Vehicle</button></div>
              </>
            )}
            {vehMode === 'vin' && (
              <div className="kf-dropdown-form">
                <div className="kf-form-group">
                  <label>VIN (17 characters)</label>
                  <div className="kf-input-btn"><input value={vin} onChange={e => setVin(e.target.value.toUpperCase())} maxLength={17} placeholder="Enter VIN..."/><button onClick={handleDecodeVin} disabled={loading || vin.length < 17}>{loading ? <Loader2 size={16} className="spin"/> : <Zap size={16}/>}</button></div>
                  <span className="kf-hint">{vin.length}/17</span>
                </div>
                {newVeh.make && (
                  <div className="kf-decoded-info">
                    <CheckCircle size={16}/> 
                    <div>
                      <div>{newVeh.year} {newVeh.make} {newVeh.model}</div>
                      {(newVeh.engine || newVeh.transmission) && <div className="kf-sub">{newVeh.engine}{newVeh.engine && newVeh.transmission && ' • '}{newVeh.transmission}</div>}
                    </div>
                  </div>
                )}
                <div className="kf-row">
                  <div className="kf-form-group"><label>Plate</label><input value={newVeh.plate} onChange={e => setNewVeh({...newVeh, plate: e.target.value.toUpperCase()})}/></div>
                  <div className="kf-form-group"><label>State</label><select value={newVeh.plateState} onChange={e => setNewVeh({...newVeh, plateState: e.target.value})}>{US_STATES.map(s=><option key={s}>{s}</option>)}</select></div>
                </div>
                <button className="kf-btn primary full" onClick={handleSaveVehicle} disabled={!newVeh.vin}><Save size={16}/>Add Vehicle</button>
              </div>
            )}
            {vehMode === 'plate' && (
              <div className="kf-dropdown-form">
                <p className="kf-sub" style={{marginBottom:12}}>Plate lookup searches existing vehicles only.</p>
                <div className="kf-row">
                  <div className="kf-form-group"><label>Plate</label><input value={plate} onChange={e => setPlate(e.target.value.toUpperCase())}/></div>
                  <div className="kf-form-group"><label>State</label><select value={plateState} onChange={e => setPlateState(e.target.value)}>{US_STATES.map(s=><option key={s}>{s}</option>)}</select></div>
                </div>
                <button className="kf-btn primary full" onClick={() => {
                  const found = vehicles.find(v => v.plate?.toUpperCase() === plate.toUpperCase() && v.plateState === plateState);
                  if (found) {
                    if (found.customerId !== selectedCustomerId) { notify('Vehicle belongs to another customer', 'error'); }
                    else { onSelectVehicle(found.id); setShowVehDropdown(false); notify('Vehicle found!'); }
                  } else { notify('Plate not found. Try VIN.', 'error'); }
                }} disabled={!plate}><Search size={16}/>Lookup</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// FULL PAGE DOCUMENT (Estimate or Invoice)
function EstimatePage({document: initialDoc, customers, vehicles, users, settings, cannedItems, currentUser, getName, onSave, onAddCustomer, onAddVehicle, onUpdateCustomer, onUpdateVehicle, onConvert, onRevert, onClose, notify}) {
  const [doc, setDoc] = useState(initialDoc);
  const [tab, setTab] = useState('services');
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'pending' | 'saving'
  const [cannedSearch, setCannedSearch] = useState('');
  const [showCannedDropdown, setShowCannedDropdown] = useState(false);
  const [expandedCannedCats, setExpandedCannedCats] = useState({});
  const [showPayment, setShowPayment] = useState(false);
  const [payMethod, setPayMethod] = useState('card');
  const [payAmount, setPayAmount] = useState(0);
  const fileInputRef = useRef();
  const cannedSearchRef = useRef();
  const autoSaveTimer = useRef(null);
  const docRef = useRef(doc);

  // Keep ref in sync so the auto-save callback always sees latest doc
  useEffect(() => { docRef.current = doc; }, [doc]);

  // Sync local state when the document prop changes (e.g., after convert to invoice)
  useEffect(() => {
    setDoc(initialDoc);
    setHasChanges(false);
    setSaveStatus('saved');
  }, [initialDoc.id, initialDoc.docType, initialDoc.number]);

  const isInvoice = doc.docType === 'invoice';
  const customer = customers.find(c => c.id === doc.customerId);
  const vehicle = vehicles.find(v => v.id === doc.vehicleId);

  // ── Auto-save ────────────────────────────────────────────────────────────
  const computeFinals = useCallback((d) => {
    const sub = (d.items || []).reduce((s, item) => s + calcItemTotal(item, settings.laborRate), 0);
    const customer = customers.find(c => c.id === d.customerId);
    const disc = calcDiscountAmount(d.items || [], settings.laborRate, customer);
    const taxable = Math.max(0, sub - disc);
    const tx = customer?.taxExempt ? 0 : taxable * settings.taxRate / 100;
    const tot = taxable + tx;
    const totalPaid = (d.payments || []).reduce((s, p) => s + p.amount, 0);
    const bal = tot - totalPaid;
    const isInv = d.docType === 'invoice';
    return {
      ...d,
      subtotal: sub,
      discount: disc || undefined,
      taxRate: settings.taxRate,
      tax: tx,
      total: taxable,
      finalTotal: tot,
      ...(isInv && { balance: bal, status: bal <= 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid') }),
    };
  }, [settings, customers]);

  const triggerAutoSave = useCallback(() => {
    setSaveStatus('pending');
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setSaveStatus('saving');
      const finalized = computeFinals(docRef.current);
      onSave(finalized);
      setDoc(finalized);
      setHasChanges(false);
      setSaveStatus('saved');
    }, 1500);
  }, [computeFinals, onSave]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); }, []);

  const update = (changes) => {
    const next = { ...doc, ...changes };
    setDoc(next);
    setHasChanges(true);
    triggerAutoSave();
  };
  // Silent update: sets doc state without triggering auto-save (used for customer/vehicle selection
  // to avoid a mid-interaction re-render that disrupts dropdown state)
  const updateSilent = (changes) => {
    setDoc(prev => ({ ...prev, ...changes }));
    setHasChanges(true);
  };
  const displayTitle = doc.title || (doc.items?.[0]?.description) || (isInvoice ? 'Untitled Invoice' : 'Untitled Estimate');

  const subtotal = (doc.items || []).reduce((s, item) => s + calcItemTotal(item, settings.laborRate), 0);
  const disc = calcDiscountAmount(doc.items || [], settings.laborRate, customer);
  const taxable = Math.max(0, subtotal - disc);
  const tax = customer?.taxExempt ? 0 : taxable * settings.taxRate / 100;
  const total = taxable + tax;

  // Calculate balance for invoices
  const totalPaid = (doc.payments || []).reduce((s, p) => s + p.amount, 0);
  const balance = total - totalPaid;

  // Filter canned items by search
  const allCannedItems = cannedItems?.items || [];
  const cannedCategories = cannedItems?.categories || [];
  const getCategoryName = (catId) => cannedCategories.find(c => c.id === catId)?.name || 'Uncategorized';

  // Build category-grouped search results
  const searchTerm = cannedSearch.trim().toLowerCase();
  const filteredCannedCategories = searchTerm
    ? cannedCategories
        .map(cat => {
          const catMatches = cat.name.toLowerCase().includes(searchTerm);
          const matchingItems = allCannedItems.filter(item =>
            item.categoryId === cat.id && (
              catMatches ||
              item.name.toLowerCase().includes(searchTerm) ||
              item.description?.toLowerCase().includes(searchTerm) ||
              item.notes?.toLowerCase().includes(searchTerm)
            )
          );
          return matchingItems.length > 0 ? { ...cat, items: matchingItems, autoExpand: true } : null;
        })
        .filter(Boolean)
    : [];

  const addCannedItem = (cannedItem) => {
    const newItem = {
      id: `i${Date.now()}`,
      type: cannedItem.type,
      description: cannedItem.name + (cannedItem.description ? ` - ${cannedItem.description}` : ''),
      notes: cannedItem.notes || '',
      technicianId: '',
      ...(cannedItem.type === 'labor' && { hours: cannedItem.hours, rate: cannedItem.rate }),
      ...(cannedItem.type === 'part' && { quantity: cannedItem.quantity, cost: cannedItem.cost }),
      ...(cannedItem.type === 'fee' && { price: cannedItem.price }),
    };
    update({items: [...(doc.items || []), newItem]});
    setCannedSearch('');
    setShowCannedDropdown(false);
    notify(`Added: ${cannedItem.name}`);
  };

  const handleSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const finalized = computeFinals(doc);
    onSave(finalized);
    setDoc(finalized);
    setHasChanges(false);
    setSaveStatus('saved');
  };

  const handlePayment = () => {
    if (payAmount <= 0) return;
    const payment = { amount: payAmount, method: payMethod, date: new Date().toISOString().split('T')[0] };
    const newPayments = [...(doc.payments || []), payment];
    const newTotalPaid = newPayments.reduce((s, p) => s + p.amount, 0);
    const newBalance = total - newTotalPaid;
    const newStatus = newBalance <= 0 ? 'paid' : 'partial';
    update({ payments: newPayments, balance: newBalance, status: newStatus });
    setShowPayment(false);
    setPayAmount(0);
    notify('Payment recorded');
  };

  const addItem = (type) => {
    const newItem = type === 'labor' 
      ? {id: `i${Date.now()}`, type: 'labor', description: '', hours: 1, rate: 0, technicianId: ''}
      : type === 'part'
      ? {id: `i${Date.now()}`, type: 'part', description: '', quantity: 1, cost: 0, technicianId: ''}
      : {id: `i${Date.now()}`, type: 'fee', description: '', price: 0};
    update({items: [...(doc.items || []), newItem]});
  };

  const updateItem = (id, changes) => update({items: (doc.items || []).map(item => item.id === id ? {...item, ...changes} : item)});
  const deleteItem = (id) => update({items: (doc.items || []).filter(item => item.id !== id)});

  const addNote = (text) => {
    if (!text.trim()) return;
    update({internalNotes: [...(doc.internalNotes || []), {
      id: `n${Date.now()}`, text: text.trim(), authorId: currentUser.id, authorName: currentUser.name, createdAt: new Date().toISOString()
    }]});
  };

  const handleUpdateVehicle = (updatedVehicle) => {
    if (typeof onUpdateVehicle === 'function') onUpdateVehicle(updatedVehicle);
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files).map(file => ({
      id: `f${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name, type: file.type, url: URL.createObjectURL(file),
      uploadedAt: new Date().toISOString(), uploadedBy: currentUser.name
    }));
    update({inspections: [...(doc.inspections || []), ...files]});
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const docType = isInvoice ? 'INVOICE' : 'ESTIMATE';
    const docNumber = doc.number;
    
    const itemsHtml = (doc.items || []).map(item => {
      const itemTotal = item.type === 'labor' ? (item.hours || 0) * (item.rate || settings.laborRate) :
                        item.type === 'part' ? (item.quantity || 1) * (item.cost || 0) :
                        item.price || 0;
      const details = item.type === 'labor' ? `${item.hours}h × $${item.rate || settings.laborRate}/hr` :
                      item.type === 'part' ? `${item.quantity} × $${(item.cost || 0).toFixed(2)}` :
                      'Flat fee';
      const noteRow = item.customerNote ? `<tr class="item-note-row"><td colspan="4" style="padding:2px 8px 8px 8px;color:#888;font-size:11px;font-style:italic">${item.customerNote}</td></tr>` : '';
      return `<tr>
        <td>${item.description || 'Untitled'}</td>
        <td style="text-transform:capitalize">${item.type}</td>
        <td>${details}</td>
        <td style="text-align:right">$${itemTotal.toFixed(2)}</td>
      </tr>${noteRow}`;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${docType} ${docNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #E63946; }
          .logo { font-size: 24px; font-weight: bold; color: #E63946; }
          .doc-info { text-align: right; }
          .doc-type { font-size: 28px; font-weight: bold; color: #333; }
          .doc-number { font-size: 14px; color: #666; }
          .parties { display: flex; gap: 40px; margin-bottom: 30px; }

          .prepared-by { font-size: 12px; color: #666; margin-bottom: 20px; margin-top: -18px; }
          .party { flex: 1; }
          .party-label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
          .party-name { font-size: 16px; font-weight: bold; }
          .party-details { font-size: 14px; color: #555; }
          .vehicle-box { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
          .vehicle-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
          .vehicle-details { display: flex; gap: 30px; font-size: 14px; }
          .vehicle-detail span { color: #666; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #333; color: white; padding: 12px; text-align: left; font-size: 14px; }
          td { padding: 12px; border-bottom: 1px solid #ddd; font-size: 14px; }
          .totals { margin-left: auto; width: 300px; }
          .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
          .total-row.final { font-size: 18px; font-weight: bold; border-top: 2px solid #333; margin-top: 10px; padding-top: 15px; }
          .comments { margin-top: 30px; padding: 15px; background: #f9f9f9; border-radius: 8px; }
          .comments-title { font-weight: bold; margin-bottom: 10px; }
          .comments-text { font-size: 14px; color: #555; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #666; padding-top: 20px; border-top: 1px solid #ddd; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">${settings.shopName}</div>
          <div class="doc-info">
            <div class="doc-type">${docType}</div>
            <div class="doc-number">${docNumber}</div>
            <div class="doc-number">Date: ${doc.createdAt}</div>
          </div>
        </div>
        
        <div class="parties">
          <div class="party">
            <div class="party-label">Bill To</div>
            <div class="party-name">${customer ? getName(customer) : 'N/A'}</div>
            <div class="party-details">${customer?.phone || ''}<br>${customer?.email || customer?.emails?.[0] || ''}</div>
          </div>
          <div class="party">
            <div class="party-label">From</div>
            <div class="party-name">${settings.shopName}</div>
            <div class="party-details">${settings.phone}<br>${settings.email}</div>
          </div>
        </div>

        <div class="prepared-by">Prepared by: <strong>${users.find(u => u.id === doc.createdBy)?.name || 'Staff'}</strong></div>

        <div class="vehicle-box">
          <div class="vehicle-title">${vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'No Vehicle'}</div>
          <div class="vehicle-details">
            <div><span>VIN:</span> ${vehicle?.vin || 'N/A'}</div>
            <div><span>Plate:</span> ${vehicle?.plate || 'N/A'}</div>
            ${vehicle?.engine ? `<div><span>Engine:</span> ${vehicle.engine}</div>` : ''}
            ${vehicle?.mileageIn != null ? `<div><span>Miles In:</span> ${vehicle.mileageIn.toLocaleString()}</div>` : ''}
            ${vehicle?.mileageOut != null ? `<div><span>Miles Out:</span> ${vehicle.mileageOut.toLocaleString()}</div>` : ''}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Type</th>
              <th>Details</th>
              <th style="text-align:right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml || '<tr><td colspan="4" style="text-align:center;color:#666;">No items</td></tr>'}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row"><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>
          ${disc > 0 ? `<div class="total-row"><span>Discount (${customer?.discount}%)</span><span>-$${disc.toFixed(2)}</span></div>` : ''}
          ${customer?.taxExempt ? `<div class="total-row" style="color:#2d936c"><span>Tax</span><span>Exempt</span></div>` : `<div class="total-row"><span>Tax (${settings.taxRate}%)</span><span>$${tax.toFixed(2)}</span></div>`}
          <div class="total-row final"><span>Total</span><span>$${total.toFixed(2)}</span></div>
        </div>

        ${doc.customerComments ? `<div class="comments"><div class="comments-title">Customer Comments</div><div class="comments-text">${doc.customerComments}</div></div>` : ''}
        ${doc.recommendations ? `<div class="comments"><div class="comments-title">Recommendations</div><div class="comments-text">${doc.recommendations}</div></div>` : ''}

        <div class="footer">
          Thank you for your business!<br>
          ${settings.shopName} • ${settings.phone} • ${settings.email}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const canEdit = doc.status === 'pending' || doc.status === 'approved';

  return (
    <div className="kf-estimate-page">
      <header className="kf-est-header">
        <div className="kf-est-header-left">
          <button className="kf-back-btn" onClick={() => { if (hasChanges && !confirm('Unsaved changes. Leave?')) return; onClose(); }}><ArrowLeft size={20}/></button>
          <div className="kf-est-title-area">
            <span className={`kf-est-number ${isInvoice ? 'invoice' : ''}`}>{doc.number}</span>
            {canEdit ? (
              <input className="kf-est-title-input" value={doc.title || ''} onChange={e => update({title: e.target.value})} placeholder={doc.items?.[0]?.description || (isInvoice ? 'Enter invoice title...' : 'Enter estimate title...')}/>
            ) : (
              <h1 className="kf-est-title">{displayTitle}</h1>
            )}
          </div>
        </div>
        <div className="kf-est-header-right">
          <button className="kf-btn secondary" onClick={() => handlePrint()}><Printer size={16}/>Print</button>
          <span className={`kf-badge lg ${doc.status}`}>{doc.status}</span>
          {/* Auto-save status */}
          <span className={`kf-autosave-status ${saveStatus}`}>
            {saveStatus === 'saving' && <><Loader2 size={13} className="spin"/>Saving…</>}
            {saveStatus === 'pending' && <><Loader2 size={13} className="spin"/>Unsaved…</>}
            {saveStatus === 'saved' && !hasChanges && <><CheckCircle size={13}/>Saved</>}
          </span>
          {hasChanges && <button className="kf-btn primary" onClick={handleSave}><Save size={16}/>Save Now</button>}
          
          {/* Estimate actions */}
          {!isInvoice && doc.status === 'pending' && doc.customerId && doc.vehicleId && <button className="kf-btn success" onClick={() => {update({status:'approved'});notify('Approved!');}}><CheckCircle size={16}/>Approve</button>}
          {!isInvoice && doc.status === 'approved' && <button className="kf-btn success" onClick={() => onConvert(doc)}><DollarSign size={16}/>Convert to Invoice</button>}
          
          {/* Invoice actions */}
          {isInvoice && doc.status !== 'paid' && <button className="kf-btn success" onClick={() => { setPayAmount(balance); setShowPayment(true); }}><CreditCard size={16}/>Record Payment</button>}
          {isInvoice && doc.status === 'unpaid' && (!doc.payments || doc.payments.length === 0) && <button className="kf-btn secondary" onClick={() => { if(confirm('Revert to estimate?')) onRevert(doc); }}><ArrowLeft size={16}/>Revert</button>}
        </div>
      </header>

      {/* Payment Modal */}
      {showPayment && (
        <div className="kf-overlay" onClick={() => setShowPayment(false)}>
          <div className="kf-modal sm" onClick={e => e.stopPropagation()}>
            <div className="kf-modal-header"><h2>Record Payment</h2><button className="kf-close" onClick={() => setShowPayment(false)}><X size={20}/></button></div>
            <div className="kf-modal-body">
              <div className="kf-pay-methods">{['card','cash','check'].map(m=><div key={m} className={payMethod===m?'active':''} onClick={()=>setPayMethod(m)}>{m==='card'?<CreditCard size={20}/>:<DollarSign size={20}/>}<span>{m}</span></div>)}</div>
              <div className="kf-form-group"><label>Amount (Balance: ${balance.toFixed(2)})</label><input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(+e.target.value || 0)}/></div>
            </div>
            <div className="kf-modal-footer"><button className="kf-btn secondary" onClick={() => setShowPayment(false)}>Cancel</button><button className="kf-btn success" onClick={handlePayment}><CheckCircle size={16}/>Confirm</button></div>
          </div>
        </div>
      )}

      <div className="kf-est-body">
        <div className="kf-est-main">
          {/* Customer & Vehicle Selector */}
          <CustomerVehicleSelector
            customers={customers}
            vehicles={vehicles}
            selectedCustomerId={doc.customerId}
            selectedVehicleId={doc.vehicleId}
            getName={getName}
            onSelectCustomer={(id) => updateSilent({customerId: id, vehicleId: null})}
            onSelectVehicle={(id) => updateSilent({vehicleId: id})}
            onAddCustomer={onAddCustomer}
            onAddVehicle={onAddVehicle}
            onUpdateCustomer={onUpdateCustomer}
            onUpdateVehicle={handleUpdateVehicle}
            notify={notify}
          />

          {/* Comments & Recommendations */}
          <div className="kf-est-comments">
            <div className="kf-est-comment-box">
              <label><MessageSquare size={14}/> Customer Comments</label>
              {canEdit ? <textarea value={doc.customerComments || ''} onChange={e => update({customerComments: e.target.value})} placeholder="Customer concerns..."/> : <p>{doc.customerComments || 'None'}</p>}
            </div>
            <div className="kf-est-comment-box">
              <label><Clipboard size={14}/> Recommendations</label>
              {canEdit ? <textarea value={doc.recommendations || ''} onChange={e => update({recommendations: e.target.value})} placeholder="Technician recommendations..."/> : <p>{doc.recommendations || 'None'}</p>}
            </div>
          </div>

          {/* Tabs */}
          <div className="kf-est-tabs">
            <button className={tab === 'services' ? 'active' : ''} onClick={() => setTab('services')}><Wrench size={16}/>Services</button>
            <button className={tab === 'inspections' ? 'active' : ''} onClick={() => setTab('inspections')}><Camera size={16}/>Inspections {(doc.inspections?.length || 0) > 0 && `(${doc.inspections.length})`}</button>
            <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}><EyeOff size={16}/>Internal Notes {(doc.internalNotes?.length || 0) > 0 && `(${doc.internalNotes.length})`}</button>
          </div>

          <div className="kf-est-tab-content">
            {tab === 'services' && (
              <div className="kf-services-tab">
                {canEdit && (
                  <div className="kf-add-item-section">
                    <div className="kf-canned-search-wrap">
                      <div className="kf-canned-search">
                        <Layers size={16}/>
                        <input 
                          ref={cannedSearchRef}
                          placeholder="Search canned items..." 
                          value={cannedSearch} 
                          onChange={e => { const v = e.target.value; setCannedSearch(v); setShowCannedDropdown(v.trim().length > 0); }}
                          onBlur={() => setTimeout(() => setShowCannedDropdown(false), 150)}
                        />
                        {cannedSearch && <button className="kf-clear-search" onClick={() => { setCannedSearch(''); setShowCannedDropdown(false); }}><X size={14}/></button>}
                      </div>
                      {showCannedDropdown && (
                        <div className="kf-canned-dropdown">
                          <div className="kf-canned-dropdown-list">
                            {filteredCannedCategories.length === 0 ? (
                              <div className="kf-canned-empty">No categories or items match "{cannedSearch}"</div>
                            ) : (
                              filteredCannedCategories.map(cat => {
                                const isExpanded = cat.autoExpand || expandedCannedCats[cat.id];
                                return (
                                  <div key={cat.id} className="kf-canned-cat-group">
                                    <div className="kf-canned-cat-header" onMouseDown={e => { e.preventDefault(); setExpandedCannedCats(prev => ({...prev, [cat.id]: !prev[cat.id]})); }}>
                                      <Layers size={13}/>
                                      <span>{cat.name}</span>
                                      <span className="kf-canned-cat-count">{cat.items.length} item{cat.items.length !== 1 ? 's' : ''}</span>
                                      <ChevronDown size={13} style={{marginLeft:'auto', transform: isExpanded ? 'rotate(180deg)' : 'none', transition:'transform 0.15s'}}/>
                                    </div>
                                    {isExpanded && cat.items.map(item => (
                                      <div key={item.id} className="kf-canned-result" onMouseDown={e => { e.preventDefault(); addCannedItem(item); setCannedSearch(''); setShowCannedDropdown(false); setExpandedCannedCats({}); }}>
                                        <div className={`kf-cr-icon ${item.type}`}>
                                          {item.type === 'labor' ? <Clock size={14}/> : item.type === 'part' ? <Package size={14}/> : <Tag size={14}/>}
                                        </div>
                                        <div className="kf-cr-info">
                                          <div className="kf-cr-name">{item.name}</div>
                                          <div className="kf-cr-meta">
                                            <span className="kf-cr-price">
                                              {item.type === 'labor' && `${item.hours}h × $${item.rate || settings.laborRate}/hr`}
                                              {item.type === 'part' && `qty ${item.quantity} · $${item.cost} ea`}
                                              {item.type === 'fee' && `flat $${item.price}`}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="kf-cr-add"><Plus size={14}/></div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="kf-add-item-bar"><span>Or add:</span><button onClick={() => addItem('labor')}><Clock size={14}/>Labor</button><button onClick={() => addItem('part')}><Package size={14}/>Part</button><button onClick={() => addItem('fee')}><Tag size={14}/>Fee</button></div>
                  </div>
                )}
                <div className="kf-line-items">
                  {(doc.items || []).length === 0 ? <div className="kf-empty-items">No items yet. Search canned items or add labor, parts, or fees above.</div> : (doc.items || []).map(item => (
                    <LineItem key={item.id} item={item} users={users} settings={settings} canEdit={canEdit} onUpdate={updateItem} onDelete={deleteItem}/>
                  ))}
                </div>
              </div>
            )}
            {tab === 'inspections' && (
              <div className="kf-inspections-tab">
                {canEdit && <><input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf" onChange={handleFileUpload} style={{display:'none'}}/><button className="kf-upload-btn" onClick={() => fileInputRef.current?.click()}><Upload size={20}/><span>Upload Photos, Videos, PDFs</span></button></>}
                {(doc.inspections || []).length === 0 ? <div className="kf-empty-items">No files uploaded.</div> : (
                  <div className="kf-inspection-grid">{(doc.inspections || []).map(file => (
                    <div key={file.id} className="kf-inspection-item">
                      {file.type?.startsWith('image/') ? <img src={file.url} alt={file.name}/> : file.type?.startsWith('video/') ? <video src={file.url} controls/> : <div className="kf-file-icon"><File size={32}/><span>{file.name}</span></div>}
                      <div className="kf-inspection-meta"><span>{file.uploadedBy}</span>{canEdit && <button onClick={() => update({inspections: (doc.inspections || []).filter(f => f.id !== file.id)})}><Trash2 size={14}/></button>}</div>
                    </div>
                  ))}</div>
                )}
              </div>
            )}
            {tab === 'notes' && (
              <div className="kf-notes-tab">
                <NoteInput onAdd={addNote}/>
                {(doc.internalNotes || []).length === 0 ? <div className="kf-empty-items">No notes. These are private.</div> : (
                  <div className="kf-notes-list">{(doc.internalNotes || []).slice().reverse().map(note => (
                    <div key={note.id} className="kf-note"><div className="kf-note-header"><strong>{note.authorName}</strong><span>{new Date(note.createdAt).toLocaleString()}</span></div><p>{note.text}</p></div>
                  ))}</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="kf-est-sidebar">
          <div className="kf-est-summary">
            <h3>Summary</h3>
            <div className="kf-summary-row"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            {disc > 0 && <div className="kf-summary-row green"><span>Discount ({customer?.discount}%)</span><span>-${disc.toFixed(2)}</span></div>}
            {customer?.taxExempt
              ? <div className="kf-summary-row green"><span>Tax</span><span>Exempt</span></div>
              : <div className="kf-summary-row"><span>Tax ({settings.taxRate}%)</span><span>${tax.toFixed(2)}</span></div>
            }
            <div className="kf-summary-row total"><span>Total</span><span>${total.toFixed(2)}</span></div>
            
            {/* Invoice payments */}
            {isInvoice && (doc.payments || []).length > 0 && (
              <>
                <div className="kf-summary-divider"/>
                <h4>Payments</h4>
                {(doc.payments || []).map((p, i) => (
                  <div key={i} className="kf-summary-row green"><span>{p.date} ({p.method})</span><span>-${(p.amount||0).toFixed(2)}</span></div>
                ))}
                <div className="kf-summary-row total"><span>Balance</span><span className={balance > 0 ? 'red' : 'green'}>${balance.toFixed(2)}</span></div>
              </>
            )}
            {isInvoice && (!doc.payments || doc.payments.length === 0) && (
              <>
                <div className="kf-summary-divider"/>
                <div className="kf-summary-row total"><span>Balance Due</span><span className="red">${balance.toFixed(2)}</span></div>
              </>
            )}
          </div>
          <div className="kf-est-meta">
            <div><span>Created</span><span>{doc.createdAt}</span></div>
            <div><span>Created By</span><span>{users.find(u => u.id === doc.createdBy)?.name || '-'}</span></div>
            {isInvoice && doc.dueAt && <div><span>Due Date</span><span>{doc.dueAt}</span></div>}
            {isInvoice && doc.convertedAt && <div><span>Invoiced</span><span>{doc.convertedAt}</span></div>}
            {isInvoice && (
              <div className="kf-meta-field"><span>PO #</span><input value={doc.poNumber||''} onChange={e=>updateSilent({poNumber:e.target.value})} placeholder="Optional" className="kf-meta-input"/></div>
            )}
            {isInvoice && (
              <div className="kf-meta-field"><span>Payment Term</span>
                <select value={doc.paymentTerm||'Net 30'} onChange={e=>updateSilent({paymentTerm:e.target.value})} className="kf-meta-input">
                  <option>Due on Receipt</option><option>Net 15</option><option>Net 30</option><option>Net 45</option><option>Net 60</option><option>Net 90</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LineItem({item, users, settings, canEdit, onUpdate, onDelete}) {
  const TypeIcon = item.type === 'labor' ? Clock : item.type === 'part' ? Package : Tag;
  const total = calcItemTotal(item, settings.laborRate);
  const [showNotes, setShowNotes] = useState(!!(item.customerNote || item.internalNote));

  if (!canEdit) {
    return (
      <div className="kf-line-item-wrap">
        <div className="kf-line-item view">
          <div className="kf-li-type"><TypeIcon size={16}/></div>
          <div className="kf-li-desc">
            {item.description || 'Untitled'}
            {item.customerNote && <div className="kf-li-customer-note">{item.customerNote}</div>}
          </div>
          <div className="kf-li-details">{item.type === 'labor' && `${item.hours}h × $${item.rate || settings.laborRate}`}{item.type === 'part' && `${item.quantity} × $${item.cost}`}{item.type === 'fee' && 'Flat'}</div>
          <div className="kf-li-tech">{users.find(u => u.id === item.technicianId)?.name || '-'}</div>
          <div className="kf-li-total">${total.toFixed(2)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="kf-line-item-wrap">
      <div className="kf-line-item edit">
        <div className="kf-li-type"><TypeIcon size={16}/></div>
        <input className="kf-li-desc" value={item.description || ''} onChange={e => onUpdate(item.id, {description: e.target.value})} placeholder="Description..."/>
        {item.type === 'labor' && (
          <div className="kf-li-fields">
            <div className="kf-field"><label>Hrs</label><input type="number" step="0.25" value={item.hours || ''} onChange={e => onUpdate(item.id, {hours: +e.target.value || 0})}/></div>
            <div className="kf-field">
              <label>Rate {item.rate > 0 && item.rate !== settings.laborRate && <button className="kf-rate-reset" title="Reset to location rate" onClick={() => onUpdate(item.id, {rate: 0})}>↺ {settings.laborRate}</button>}</label>
              <input type="number" placeholder={settings.laborRate} value={item.rate || ''} onChange={e => onUpdate(item.id, {rate: +e.target.value || 0})}/>
            </div>
          </div>
        )}
        {item.type === 'part' && <div className="kf-li-fields"><div className="kf-field"><label>Qty</label><input type="number" min="1" value={item.quantity || 1} onChange={e => onUpdate(item.id, {quantity: +e.target.value || 1})}/></div><div className="kf-field"><label>Cost</label><input type="number" step="0.01" value={item.cost || ''} onChange={e => onUpdate(item.id, {cost: +e.target.value || 0})}/></div></div>}
        {item.type === 'fee' && <div className="kf-li-fields"><div className="kf-field"><label>Amt</label><input type="number" step="0.01" value={item.price || ''} onChange={e => onUpdate(item.id, {price: +e.target.value || 0})}/></div></div>}
        <select className="kf-li-tech" value={item.technicianId || ''} onChange={e => onUpdate(item.id, {technicianId: e.target.value})}><option value="">Assign...</option>{users.filter(u => u.role === 'technician' || u.role === 'tech' || u.role === 'admin' || u.role === 'master_admin').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <div className="kf-li-total">${total.toFixed(2)}</div>
        <button className={`kf-li-notes-btn${showNotes ? ' active' : ''}${(item.customerNote || item.internalNote) ? ' has-notes' : ''}`} title="Add notes" onClick={() => setShowNotes(s => !s)}><MessageSquare size={13}/></button>
        <button className="kf-li-delete" onClick={() => onDelete(item.id)}><Trash2 size={14}/></button>
      </div>
      {showNotes && (
        <div className="kf-li-notes-panel">
          <div className="kf-li-note-row">
            <label><Eye size={12}/> Customer Note <span className="kf-note-hint">Visible on estimate/invoice</span></label>
            <textarea rows={2} value={item.customerNote || ''} onChange={e => onUpdate(item.id, {customerNote: e.target.value})} placeholder="e.g. Programming BCM module, VIN: WD... — replaced with OEM unit"/>
          </div>
          <div className="kf-li-note-row internal">
            <label><EyeOff size={12}/> Internal Note <span className="kf-note-hint">Shop only — never printed</span></label>
            <textarea rows={2} value={item.internalNote || ''} onChange={e => onUpdate(item.id, {internalNote: e.target.value})} placeholder="e.g. Labor came out lower than quoted, verify billing..."/>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteInput({onAdd}) {
  const [text, setText] = useState('');
  return <div className="kf-note-input"><textarea value={text} onChange={e => setText(e.target.value)} placeholder="Add internal note..." rows={2}/><button className="kf-btn primary sm" onClick={() => {onAdd(text);setText('');}} disabled={!text.trim()}><Plus size={14}/>Add</button></div>;
}
