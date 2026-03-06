"""
Komando Backend - FastAPI with SQLite for persistent storage
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Any
import sqlite3
import json
import os
from pathlib import Path

# Database path - use persistent disk on Render
DATA_DIR = os.environ.get('DATA_DIR', '/data')
DB_PATH = os.path.join(DATA_DIR, 'komando.db')

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

app = FastAPI(title="Komando API")

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database with required tables"""
    conn = get_db()
    cur = conn.cursor()
    
    # Key-value store for all data (simple approach like Katabase)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS store (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Initialize with empty data if not exists
    default_data = {
        'customers': [],
        'vehicles': [],
        'estimates': [],
        'invoices': [],
        'locations': [
            {'id': 'loc1', 'name': 'Main Location', 'address': '', 'phone': '', 'email': '', 'laborRate': None, 'taxRate': None}
        ],
        'users': [
            {'id': 'u1', 'name': 'Admin', 'email': 'admin@kaizen.com', 'pin': '1234', 'role': 'admin', 'locationId': 'loc1'}
        ],
        'settings': {
            'laborRate': 220.50,
            'taxRate': 9,
            'shopName': 'Kaizen Automotive',
            'phone': '(360) 555-1234',
            'email': 'service@kaizenautomotive.com'
        },
        'cannedItems': {
            'categories': [],
            'items': []
        }
    }
    
    for key, value in default_data.items():
        cur.execute(
            'INSERT OR IGNORE INTO store (key, value) VALUES (?, ?)',
            (key, json.dumps(value))
        )
    
    conn.commit()
    conn.close()
    print(f"Database initialized at {DB_PATH}")

# Initialize DB on startup
init_db()

# Pydantic models
class StoreData(BaseModel):
    value: Any

# API Routes
@app.get("/api/data/{key}")
async def get_data(key: str):
    """Get data by key"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT value FROM store WHERE key = ?', (key,))
    row = cur.fetchone()
    conn.close()
    
    if row:
        return {"key": key, "value": json.loads(row['value'])}
    raise HTTPException(status_code=404, detail=f"Key '{key}' not found")

@app.put("/api/data/{key}")
async def set_data(key: str, data: StoreData):
    """Set data by key"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
        INSERT INTO store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    ''', (key, json.dumps(data.value), json.dumps(data.value)))
    conn.commit()
    conn.close()
    return {"key": key, "value": data.value}

@app.get("/api/data")
async def get_all_data():
    """Get all data"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT key, value FROM store')
    rows = cur.fetchall()
    conn.close()
    
    result = {}
    for row in rows:
        result[row['key']] = json.loads(row['value'])
    return result

@app.delete("/api/data/{key}")
async def delete_data(key: str):
    """Delete data by key"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute('DELETE FROM store WHERE key = ?', (key,))
    conn.commit()
    conn.close()
    return {"deleted": key}

@app.post("/api/reset")
async def reset_data():
    """Reset all data to defaults"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute('DELETE FROM store')
    conn.commit()
    conn.close()
    init_db()
    return {"status": "reset complete"}

@app.get("/api/health")
async def health():
    return {"status": "ok", "db_path": DB_PATH}

# Serve static files (React build)
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the React SPA"""
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")
