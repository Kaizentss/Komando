"""
Komando Backend - Multi-company FastAPI with per-company SQLite databases
"""
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, Any
import sqlite3, json, os, io, zipfile, shutil
from pathlib import Path
from datetime import datetime

# ── Directory layout ──────────────────────────────────────────────────────────
DATA_DIR      = os.environ.get('DATA_DIR', '/data')
COMPANIES_DIR = os.path.join(DATA_DIR, 'companies')
REGISTRY_PATH = os.path.join(DATA_DIR, 'registry.json')

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(COMPANIES_DIR, exist_ok=True)

# ── Super-admin credentials ───────────────────────────────────────────────────
# Stored in registry under "superadmins" key. Falls back to env vars for first boot.
SUPERADMIN_USERNAME = os.environ.get('SUPERADMIN_USERNAME', 'superadmin')
SUPERADMIN_PASSWORD = os.environ.get('SUPERADMIN_PASSWORD', 'Komando@SA2025!')

def get_superadmins() -> list:
    reg = load_registry()
    if "superadmins" not in reg:
        # First boot: seed from env vars
        reg["superadmins"] = [{"id": "sa1", "username": SUPERADMIN_USERNAME, "password": SUPERADMIN_PASSWORD}]
        save_registry(reg)
    return reg["superadmins"]

def save_superadmins(admins: list):
    reg = load_registry()
    reg["superadmins"] = admins
    save_registry(reg)

app = FastAPI(title="Komando API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

# ── Registry helpers ──────────────────────────────────────────────────────────
def load_registry() -> dict:
    if os.path.exists(REGISTRY_PATH):
        with open(REGISTRY_PATH) as f:
            return json.load(f)
    return {"companies": []}

def save_registry(reg: dict):
    with open(REGISTRY_PATH, 'w') as f:
        json.dump(reg, f, indent=2)

def get_company(cid: str):
    return next((c for c in load_registry()["companies"] if c["id"] == cid), None)

# ── Per-company DB helpers ────────────────────────────────────────────────────
def company_db_path(cid: str) -> str:
    return os.path.join(COMPANIES_DIR, f"{cid}.db")

def get_company_db(cid: str):
    conn = sqlite3.connect(company_db_path(cid))
    conn.row_factory = sqlite3.Row
    return conn

def init_company_db(cid: str, company_name: str, master_admin: dict):
    conn = get_company_db(cid)
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS store (
        key TEXT PRIMARY KEY, value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    defaults = {
        'customers':  [],
        'vehicles':   [],
        'estimates':  [],
        'invoices':   [],
        'locations':  [{'id':'loc1','name':'Main Location','address':'','phone':'','email':'','laborRate':None,'taxRate':None}],
        'users':      [master_admin],
        'settings':   {'laborRate':125.00,'taxRate':9,'shopName':company_name,'phone':'','email':''},
        'cannedItems':{'categories':[],'items':[]}
    }
    for key, val in defaults.items():
        cur.execute('INSERT OR IGNORE INTO store (key,value) VALUES (?,?)', (key, json.dumps(val)))
    conn.commit()
    conn.close()

def require_company(cid: str):
    c = get_company(cid)
    if not c:
        raise HTTPException(404, "Company not found")
    if c.get("suspended"):
        raise HTTPException(403, "Company is suspended")
    return c

# ── Pydantic models ───────────────────────────────────────────────────────────
class StoreData(BaseModel):
    value: Any

class SuperAdminLogin(BaseModel):
    username: str
    password: str

class CreateCompanyRequest(BaseModel):
    companyName: str
    companyId: str
    masterAdminName: str
    masterAdminPin: str
    masterAdminEmail: Optional[str] = ''

class UpdateCompanyRequest(BaseModel):
    name: Optional[str] = None
    suspended: Optional[bool] = None

# ═════════════════════════════════════════════════════════════════════════════
#  SUPER-ADMIN ROUTES
# ═════════════════════════════════════════════════════════════════════════════
@app.post("/api/superadmin/login")
async def superadmin_login(body: SuperAdminLogin):
    admins = get_superadmins()
    match = next((a for a in admins if a["username"] == body.username and a["password"] == body.password), None)
    if not match:
        raise HTTPException(401, "Invalid credentials")
    return {"ok": True, "role": "superadmin", "id": match["id"], "username": match["username"]}

@app.get("/api/superadmin/accounts")
async def list_superadmin_accounts():
    admins = get_superadmins()
    return [{"id": a["id"], "username": a["username"]} for a in admins]  # never return passwords

class SuperAdminAccountRequest(BaseModel):
    username: str
    password: str

class UpdateSuperAdminRequest(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None

@app.post("/api/superadmin/accounts")
async def create_superadmin_account(body: SuperAdminAccountRequest):
    admins = get_superadmins()
    if any(a["username"] == body.username for a in admins):
        raise HTTPException(409, "Username already exists")
    new_admin = {"id": f"sa{len(admins)+1}_{int(datetime.utcnow().timestamp())}", "username": body.username, "password": body.password}
    admins.append(new_admin)
    save_superadmins(admins)
    return {"ok": True, "id": new_admin["id"], "username": new_admin["username"]}

@app.patch("/api/superadmin/accounts/{admin_id}")
async def update_superadmin_account(admin_id: str, body: UpdateSuperAdminRequest):
    admins = get_superadmins()
    admin = next((a for a in admins if a["id"] == admin_id), None)
    if not admin:
        raise HTTPException(404, "Account not found")
    if body.username:
        if any(a["username"] == body.username and a["id"] != admin_id for a in admins):
            raise HTTPException(409, "Username already taken")
        admin["username"] = body.username
    if body.password:
        admin["password"] = body.password
    save_superadmins(admins)
    return {"ok": True, "id": admin["id"], "username": admin["username"]}

@app.delete("/api/superadmin/accounts/{admin_id}")
async def delete_superadmin_account(admin_id: str):
    admins = get_superadmins()
    if len(admins) <= 1:
        raise HTTPException(400, "Cannot delete the last super admin account")
    admins = [a for a in admins if a["id"] != admin_id]
    save_superadmins(admins)
    return {"ok": True}


@app.get("/api/superadmin/companies")
async def list_companies():
    return load_registry().get("companies", [])

@app.get("/api/debug/registry")
async def debug_registry():
    """Temporary debug: show raw registry contents"""
    if os.path.exists(REGISTRY_PATH):
        with open(REGISTRY_PATH) as f:
            raw = f.read()
        return {"exists": True, "path": REGISTRY_PATH, "raw": raw}
    return {"exists": False, "path": REGISTRY_PATH}

@app.post("/api/superadmin/companies")
async def create_company(body: CreateCompanyRequest):
    reg = load_registry()
    cid = body.companyId.lower().strip()
    if not cid or not cid.replace('-','').replace('_','').isalnum():
        raise HTTPException(400, "Invalid company ID")
    if any(c["id"] == cid for c in reg["companies"]):
        raise HTTPException(409, "Company ID already exists")
    master = {
        "id": f"u_{cid}_master", "name": body.masterAdminName,
        "email": body.masterAdminEmail, "password": body.masterAdminPin,
        "role": "master_admin", "locationId": "loc1", "companyId": cid
    }
    record = {"id": cid, "name": body.companyName, "suspended": False,
              "createdAt": datetime.utcnow().isoformat(), "masterAdmin": body.masterAdminName}
    init_company_db(cid, body.companyName, master)
    reg["companies"].append(record)
    save_registry(reg)
    return {"ok": True, "company": record}

@app.patch("/api/superadmin/companies/{cid}")
async def update_company(cid: str, body: UpdateCompanyRequest):
    reg = load_registry()
    c = next((x for x in reg["companies"] if x["id"] == cid), None)
    if not c:
        raise HTTPException(404, "Company not found")
    if body.name is not None: c["name"] = body.name
    if body.suspended is not None: c["suspended"] = body.suspended
    save_registry(reg)
    return {"ok": True, "company": c}

@app.delete("/api/superadmin/companies/{cid}")
async def delete_company(cid: str):
    reg = load_registry()
    if not any(c["id"] == cid for c in reg["companies"]):
        raise HTTPException(404, "Company not found")
    db = company_db_path(cid)
    if os.path.exists(db): os.remove(db)
    reg["companies"] = [c for c in reg["companies"] if c["id"] != cid]
    save_registry(reg)
    return {"ok": True}

@app.get("/api/superadmin/backup")
async def superadmin_backup():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        if os.path.exists(REGISTRY_PATH):
            zf.write(REGISTRY_PATH, 'registry.json')
        for db_file in Path(COMPANIES_DIR).glob("*.db"):
            zf.write(str(db_file), f"companies/{db_file.name}")
    buf.seek(0)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=komando_backup_{ts}.zip"})

@app.post("/api/superadmin/restore")
async def superadmin_restore(file: UploadFile = File(...)):
    content = await file.read()
    buf = io.BytesIO(content)
    with zipfile.ZipFile(buf, 'r') as zf:
        names = zf.namelist()
        if 'registry.json' in names:
            with zf.open('registry.json') as rf:
                save_registry(json.load(rf))
        for name in names:
            if name.startswith('companies/') and name.endswith('.db'):
                dest = os.path.join(COMPANIES_DIR, name.split('/')[-1])
                with zf.open(name) as src, open(dest, 'wb') as dst:
                    dst.write(src.read())
    return {"ok": True}

@app.get("/api/superadmin/companies/{cid}/data")
async def superadmin_view_company(cid: str):
    if not get_company(cid):
        raise HTTPException(404, "Company not found")
    conn = get_company_db(cid)
    cur = conn.cursor()
    cur.execute('SELECT key,value FROM store')
    rows = cur.fetchall()
    conn.close()
    return {r['key']: json.loads(r['value']) for r in rows}

# ═════════════════════════════════════════════════════════════════════════════
#  COMPANY USER AUTH  /api/auth/login
# ═════════════════════════════════════════════════════════════════════════════
class UserLoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/auth/login")
async def user_login(body: UserLoginRequest):
    """Find a user by email+password across all active companies."""
    reg = load_registry()
    for company in reg.get("companies", []):
        if company.get("suspended"):
            continue
        cid = company["id"]
        db_path = company_db_path(cid)
        if not os.path.exists(db_path):
            continue
        conn = get_company_db(cid)
        cur = conn.cursor()
        cur.execute("SELECT value FROM store WHERE key='users'")
        row = cur.fetchone()
        conn.close()
        if not row:
            continue
        users = json.loads(row["value"])
        for u in users:
            if u.get("email", "").lower() == body.email.lower() and u.get("password") == body.password:
                return {"ok": True, "user": u, "company": {"id": company["id"], "name": company["name"]}}
    raise HTTPException(status_code=401, detail="Invalid email or password")


@app.get("/api/companies")
async def public_companies():
    reg = load_registry()
    return [{"id": c["id"], "name": c["name"]} for c in reg["companies"] if not c.get("suspended")]

# ═════════════════════════════════════════════════════════════════════════════
#  COMPANY DATA ROUTES
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/company/{cid}/data/{key}")
async def get_data(cid: str, key: str):
    require_company(cid)
    conn = get_company_db(cid)
    cur = conn.cursor()
    cur.execute('SELECT value FROM store WHERE key=?', (key,))
    row = cur.fetchone()
    conn.close()
    if row: return {"key": key, "value": json.loads(row['value'])}
    raise HTTPException(404, f"Key '{key}' not found")

@app.put("/api/company/{cid}/data/{key}")
async def set_data(cid: str, key: str, data: StoreData):
    require_company(cid)
    conn = get_company_db(cid)
    cur = conn.cursor()
    cur.execute('''INSERT INTO store (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP''',
        (key, json.dumps(data.value)))
    conn.commit()
    conn.close()
    return {"key": key, "value": data.value}

@app.get("/api/company/{cid}/data")
async def get_all_data(cid: str):
    require_company(cid)
    conn = get_company_db(cid)
    cur = conn.cursor()
    cur.execute('SELECT key,value FROM store')
    rows = cur.fetchall()
    conn.close()
    return {r['key']: json.loads(r['value']) for r in rows}

@app.get("/api/company/{cid}/backup")
async def company_backup(cid: str):
    require_company(cid)
    db = company_db_path(cid)
    if not os.path.exists(db):
        raise HTTPException(404, "Database not found")
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return FileResponse(db, media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={cid}_{ts}.db"})

@app.post("/api/company/{cid}/restore")
async def company_restore(cid: str, file: UploadFile = File(...)):
    require_company(cid)
    content = await file.read()
    if not content.startswith(b'SQLite format 3'):
        raise HTTPException(400, "Invalid SQLite database file")
    db = company_db_path(cid)
    if os.path.exists(db): shutil.copy(db, db + ".prev")
    with open(db, 'wb') as f: f.write(content)
    return {"ok": True}

@app.get("/api/health")
async def health():
    reg = load_registry()
    return {"status": "ok", "companies": len(reg["companies"]), "data_dir": DATA_DIR}

# ── Serve React SPA ───────────────────────────────────────────────────────────
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        fp = static_dir / full_path
        if fp.exists() and fp.is_file(): return FileResponse(fp)
        return FileResponse(static_dir / "index.html")
