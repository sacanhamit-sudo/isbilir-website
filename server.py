#!/usr/bin/env python3
"""
İsbilir Tekstil & Promosyon - Web Sunucusu
Sıfır bağımlılık - Python 3.8+ standart kütüphanesi ile çalışır
"""

import http.server
import json
import os
import sqlite3
import hashlib
import uuid
import time

import io
import mimetypes
import re
import secrets
from urllib.parse import urlparse, parse_qs
from functools import wraps
from pathlib import Path

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
UPLOAD_DIR = STATIC_DIR / "uploads"
DB_PATH = BASE_DIR / "database.db"
SECRET_KEY = secrets.token_hex(32)
PORT = int(os.environ.get("PORT", 8080))

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ─── Database Setup ──────────────────────────────────────────────────────────

def init_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name_tr TEXT NOT NULL,
        name_en TEXT,
        name_de TEXT,
        slug TEXT UNIQUE NOT NULL,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER,
        name_tr TEXT NOT NULL,
        name_en TEXT,
        name_de TEXT,
        description_tr TEXT,
        description_en TEXT,
        description_de TEXT,
        price TEXT,
        image_url TEXT,
        gallery TEXT DEFAULT '[]',
        is_featured INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        row_position INTEGER DEFAULT 0,
        col_position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title_tr TEXT NOT NULL,
        title_en TEXT,
        title_de TEXT,
        content_tr TEXT,
        content_en TEXT,
        content_de TEXT,
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )""")

    # Default admin user (admin/admin123)
    pw_hash = hashlib.sha256("admin123".encode()).hexdigest()
    c.execute("INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)",
              ("admin", pw_hash, "admin"))

    # Default categories
    cats = [
        ("Tekstil Ürünleri", "Textile Products", "Textilprodukte", "tekstil", 1),
        ("Promosyon Ürünleri", "Promotional Products", "Werbeartikel", "promosyon", 2),
        ("Kurumsal Hediyeler", "Corporate Gifts", "Firmengeschenke", "kurumsal", 3),
    ]
    for cat in cats:
        c.execute("INSERT OR IGNORE INTO categories (name_tr, name_en, name_de, slug, sort_order) VALUES (?,?,?,?,?)", cat)

    # Default settings
    defaults = {
        "site_name_tr": "İsbilir Tekstil & Promosyon",
        "site_name_en": "Isbilir Textile & Promotion",
        "site_name_de": "Isbilir Textil & Werbung",
        "phone": "+90 (212) 555 0000",
        "email": "info@isbilirtekstil.com",
        "address_tr": "İstanbul, Türkiye",
        "address_en": "Istanbul, Turkey",
        "address_de": "Istanbul, Türkei",
        "hero_title_tr": "Kaliteli Tekstil & Promosyon Çözümleri",
        "hero_title_en": "Quality Textile & Promotional Solutions",
        "hero_title_de": "Qualitative Textil- & Werbelösungen",
        "hero_subtitle_tr": "Kurumsal ihtiyaçlarınız için profesyonel çözümler sunuyoruz",
        "hero_subtitle_en": "We offer professional solutions for your corporate needs",
        "hero_subtitle_de": "Wir bieten professionelle Lösungen für Ihre Unternehmensbedürfnisse",
    }
    for k, v in defaults.items():
        c.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)", (k, v))

    conn.commit()
    conn.close()

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

# ─── Auth Helpers ────────────────────────────────────────────────────────────

active_sessions = {}

def create_token(user_id, username):
    token = secrets.token_hex(32)
    active_sessions[token] = {
        "user_id": user_id,
        "username": username,
        "created": time.time()
    }
    return token

def verify_token(token):
    session = active_sessions.get(token)
    if session and (time.time() - session["created"]) < 86400:
        return session
    return None

# ─── Request Handler ─────────────────────────────────────────────────────────

class AppHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, template_name, status=200):
        path = TEMPLATES_DIR / template_name
        if not path.exists():
            self.send_error(404, "Template not found")
            return
        content = path.read_text(encoding="utf-8")
        body = content.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, filepath):
        if not filepath.exists():
            self.send_error(404)
            return
        mime, _ = mimetypes.guess_type(str(filepath))
        if not mime:
            mime = "application/octet-stream"
        content = filepath.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", len(content))
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        self.wfile.write(content)

    def get_cookie(self, name):
        cookies = self.headers.get("Cookie", "")
        for c in cookies.split(";"):
            c = c.strip()
            if c.startswith(f"{name}="):
                return c[len(name)+1:]
        return None

    def get_auth_user(self):
        token = self.get_cookie("auth_token")
        if not token:
            auth = self.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if token:
            return verify_token(token)
        return None

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return b""
        return self.rfile.read(length)

    def read_json(self):
        return json.loads(self.read_body().decode("utf-8"))

    # ─── Routing ───────────────────────────────────────────────────────────

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # Static files
        if path.startswith("/static/"):
            fpath = BASE_DIR / path.lstrip("/")
            self.send_file(fpath)
            return

        # Pages
        routes = {
            "/": "index.html",
            "/products": "products.html",
            "/about": "about.html",
            "/contact": "contact.html",
            "/login": "login.html",
            "/admin": "admin.html",
        }

        if path in routes:
            self.send_html(routes[path])
            return

        # API endpoints
        if path == "/api/products":
            self.api_get_products(query)
        elif path == "/api/categories":
            self.api_get_categories()
        elif path == "/api/settings":
            self.api_get_settings()
        elif path.startswith("/api/products/"):
            pid = path.split("/")[-1]
            self.api_get_product(pid)
        elif path == "/api/auth/me":
            self.api_auth_me()
        elif path == "/api/pages":
            self.api_get_pages()
        else:
            self.send_error(404)

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/auth/login":
            self.api_login()
        elif path == "/api/auth/logout":
            self.api_logout()
        elif path == "/api/products":
            self.api_create_product()
        elif path == "/api/upload":
            self.api_upload()
        elif path == "/api/categories":
            self.api_create_category()
        elif path == "/api/settings":
            self.api_update_settings()
        elif path == "/api/products/reorder":
            self.api_reorder_products()
        else:
            self.send_error(404)

    def do_PUT(self):
        path = urlparse(self.path).path
        if path.startswith("/api/products/"):
            pid = path.split("/")[-1]
            self.api_update_product(pid)
        elif path.startswith("/api/categories/"):
            cid = path.split("/")[-1]
            self.api_update_category(cid)
        else:
            self.send_error(404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/products/"):
            pid = path.split("/")[-1]
            self.api_delete_product(pid)
        elif path.startswith("/api/categories/"):
            cid = path.split("/")[-1]
            self.api_delete_category(cid)
        else:
            self.send_error(404)

    # ─── Auth API ──────────────────────────────────────────────────────────

    def api_login(self):
        data = self.read_json()
        username = data.get("username", "")
        password = data.get("password", "")
        pw_hash = hashlib.sha256(password.encode()).hexdigest()

        db = get_db()
        user = db.execute("SELECT * FROM users WHERE username=? AND password_hash=?",
                          (username, pw_hash)).fetchone()
        db.close()

        if user:
            token = create_token(user["id"], user["username"])
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Set-Cookie", f"auth_token={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400")
            body = json.dumps({"success": True, "username": user["username"]}).encode()
            self.send_header("Content-Length", len(body))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_json({"success": False, "error": "Geçersiz kullanıcı adı veya şifre"}, 401)

    def api_logout(self):
        token = self.get_cookie("auth_token")
        if token and token in active_sessions:
            del active_sessions[token]
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Set-Cookie", "auth_token=; Path=/; Max-Age=0")
        body = json.dumps({"success": True}).encode()
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def api_auth_me(self):
        user = self.get_auth_user()
        if user:
            self.send_json({"authenticated": True, "username": user["username"]})
        else:
            self.send_json({"authenticated": False}, 401)

    # ─── Products API ──────────────────────────────────────────────────────

    def api_get_products(self, query):
        db = get_db()
        cat = query.get("category", [None])[0]
        featured = query.get("featured", [None])[0]

        sql = """SELECT p.*, c.name_tr as category_name_tr, c.name_en as category_name_en,
                 c.name_de as category_name_de, c.slug as category_slug
                 FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1"""
        params = []

        if cat:
            sql += " AND c.slug = ?"
            params.append(cat)
        if featured == "1":
            sql += " AND p.is_featured = 1"

        sql += " AND p.is_active = 1 ORDER BY p.sort_order, p.row_position, p.col_position"

        products = [dict(r) for r in db.execute(sql, params).fetchall()]
        db.close()
        self.send_json(products)

    def api_get_product(self, pid):
        db = get_db()
        p = db.execute("""SELECT p.*, c.name_tr as category_name_tr, c.name_en as category_name_en,
                       c.name_de as category_name_de FROM products p
                       LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?""", (pid,)).fetchone()
        db.close()
        if p:
            self.send_json(dict(p))
        else:
            self.send_json({"error": "Not found"}, 404)

    def api_create_product(self):
        if not self.get_auth_user():
            self.send_json({"error": "Unauthorized"}, 401)
            return
        data = self.read_json()
        db = get_db()
        c = db.cursor()
        c.execute("""INSERT INTO products (category_id, name_tr, name_en, name_de,
                  description_tr, description_en, description_de, price, image_url, gallery,
                  is_featured, is_active, sort_order, row_position, col_position)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
            data.get("category_id"),
            data.get("name_tr", ""),
            data.get("name_en", ""),
            data.get("name_de", ""),
            data.get("description_tr", ""),
            data.get("description_en", ""),
            data.get("description_de", ""),
            data.get("price", ""),
            data.get("image_url", ""),
            json.dumps(data.get("gallery", [])),
            1 if data.get("is_featured") else 0,
            1 if data.get("is_active", True) else 0,
            data.get("sort_order", 0),
            data.get("row_position", 0),
            data.get("col_position", 0),
        ))
        db.commit()
        pid = c.lastrowid
        db.close()
        self.send_json({"success": True, "id": pid}, 201)

    def api_update_product(self, pid):
        if not self.get_auth_user():
            self.send_json({"error": "Unauthorized"}, 401)
            return
        data = self.read_json()
        db = get_db()
        fields = []
        params = []
        allowed = ["category_id", "name_tr", "name_en", "name_de",
                    "description_tr", "description_en", "description_de",
                    "price", "image_url", "is_featured", "is_active",
                    "sort_order", "row_position", "col_position"]
        for f in allowed:
            if f in data:
                fields.append(f"{f}=?")
                val = data[f]
                if f in ("is_featured", "is_active"):
                    val = 1 if val else 0
                params.append(val)
        if "gallery" in data:
            fields.append("gallery=?")
            params.append(json.dumps(data["gallery"]))
        fields.append("updated_at=CURRENT_TIMESTAMP")
        params.append(pid)
        db.execute(f"UPDATE products SET {', '.join(fields)} WHERE id=?", params)
        db.commit()
        db.close()
        self.send_json({"success": True})

    def api_delete_product(self, pid):
        if not self.get_auth_user():
            self.send_json({"error": "Unauthorized"}, 401)
            return
        db = get_db()
        db.execute("DELETE FROM products WHERE id=?", (pid,))
        db.commit()
        db.close()
        self.send_json({"success": True})

    def api_reorder_products(self):
        if not self.get_auth_user():
            self.send_json({"error": "Unauthorized"}, 401)
            return
        data = self.read_json()
        db = get_db()
        for item in data.get("items", []):
            db.execute("UPDATE products SET sort_order=?, row_position=?, col_position=? WHERE id=?",
                       (item.get("sort_order", 0), item.get("row_position", 0),
                        item.get("col_position", 0), item["id"]))
        db.commit()
        db.close()
        self.send_json({"success": True})

    # ─── Categories API ────────────────────────────────────────────────────

    def api_get_categories(self):
        db = get_db()
        cats = [dict(r) for r in db.execute(
            "SELECT * FROM categories WHERE is_active=1 ORDER BY sort_order").fetchall()]
        db.close()
        self.send_json(cats)

    def api_create_category(self):
        if not self.get_auth_user():
            self.send_json({"error": "Unauthorized"}, 401)
            return
        data = self.read_json()
        slug = re.sub(r'[^a-z0-9]+', '-', data.get("name_tr", "").lower().replace("ı","i")
                       .replace("ş","s").replace("ğ","g").replace("ü","u").replace("ö","o")
                       .replace("ç","c")).strip("-")
        db = get_db()
        c = db.cursor()
        c.execute("INSERT INTO categories (name_tr, name_en, name_de, slug, sort_order) VALUES (?,?,?,?,?)",
                  (data.get("name_tr",""), data.get("name_en",""), data.get("name_de",""),
                   slug, data.get("sort_order", 0)))
        db.commit()
        cid = c.lastrowid
        db.close()
        self.send_json({"success": True, "id": cid}, 201)

    def api_update_category(self, cid):
        if not self.get_auth_user():
            self.send_json({"error": "Unauthorized"}, 401)
            return
        data = self.read_json()
        db = get_db()
        fields, params = [], []
        for f in ["name_tr", "name_en", "name_de", "sort_order", "is_active"]:
            if f in data:
                fields.append(f"{f}=?")
                params.append(data[f])
        params.append(cid)
        db.execute(f"UPDATE categories SET {', '.join(fields)} WHERE id=?", params)
        db.commit()
        db.close()
        self.send_json({"success": True})

    def api_delete_category(self, cid):
        if not self.get_auth_user():
            self.send_json({"error": "Unauthorized"}, 401)
            return
        db = get_db()
        db.execute("DELETE FROM categories WHERE id=?", (cid,))
        db.commit()
        db.close()
        self.send_json({"success": True})

    # ─── Settings API ──────────────────────────────────────────────────────

    def api_get_settings(self):
        db = get_db()
        rows = db.execute("SELECT * FROM site_settings").fetchall()
        db.close()
        self.send_json({r["key"]: r["value"] for r in rows})

    def api_update_settings(self):
        if not self.get_auth_user():
            self.send_json({"error": "Unauthorized"}, 401)
            return
        data = self.read_json()
        db = get_db()
        for k, v in data.items():
            db.execute("INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)", (k, v))
        db.commit()
        db.close()
        self.send_json({"success": True})

    # ─── Pages API ─────────────────────────────────────────────────────────

    def api_get_pages(self):
        db = get_db()
        pages = [dict(r) for r in db.execute("SELECT * FROM pages WHERE is_active=1 ORDER BY sort_order").fetchall()]
        db.close()
        self.send_json(pages)

    # ─── Upload API ────────────────────────────────────────────────────────

    def api_upload(self):
        if not self.get_auth_user():
            self.send_json({"error": "Unauthorized"}, 401)
            return

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self.send_json({"error": "Invalid content type"}, 400)
            return

        # Parse multipart
        boundary = content_type.split("boundary=")[1].strip()
        body = self.read_body()

        # Simple multipart parser
        parts = body.split(f"--{boundary}".encode())
        uploaded = []

        for part in parts:
            if b"Content-Disposition" not in part:
                continue
            header_end = part.find(b"\r\n\r\n")
            if header_end == -1:
                continue
            headers_raw = part[:header_end].decode("utf-8", errors="replace")
            file_data = part[header_end+4:]
            if file_data.endswith(b"\r\n"):
                file_data = file_data[:-2]

            # Extract filename
            fn_match = re.search(r'filename="([^"]+)"', headers_raw)
            if not fn_match:
                continue
            original_name = fn_match.group(1)
            ext = Path(original_name).suffix.lower()
            if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"):
                continue

            new_name = f"{uuid.uuid4().hex}{ext}"
            save_path = UPLOAD_DIR / new_name
            save_path.write_bytes(file_data)
            uploaded.append(f"/static/uploads/{new_name}")

        self.send_json({"success": True, "urls": uploaded})


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    server = http.server.HTTPServer(("0.0.0.0", PORT), AppHandler)
    print(f"""
------------------------------------------------------------
    Isbilir Tekstil & Promosyon - Web Sunucusu             
    http://localhost:{PORT}                                  
                                                           
    Admin Panel: http://localhost:{PORT}/admin                
    Kullanici: admin  |  Sifre: admin123                  
------------------------------------------------------------
""")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\\nSunucu kapatiliyor...")
        server.server_close()
