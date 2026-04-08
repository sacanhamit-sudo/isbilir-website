/* ═══════════════════════════════════════════════════════════
   İsbilir Tekstil - Ana Uygulama JS
   ═══════════════════════════════════════════════════════════ */

// ─── API Helper ─────────────────────────────────────────────

async function api(url, options = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options
    });
    return res.json();
}

// ─── Toast Notifications ────────────────────────────────────

function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✗', warning: '⚠' };
    toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ─── Navbar Scroll Effect ───────────────────────────────────

window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 50);
});

// ─── Mobile Nav Toggle ──────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('.mobile-toggle');
    const links = document.querySelector('.nav-links');
    if (toggle && links) {
        toggle.addEventListener('click', () => links.classList.toggle('open'));
    }
});

// ─── Intersection Observer for Fade-In ──────────────────────

const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('visible');
            observer.unobserve(e.target);
        }
    });
}, { threshold: 0.1 });

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
});

// ─── Products Page Logic ────────────────────────────────────

async function loadProducts(category = null) {
    let url = '/api/products';
    if (category) url += `?category=${category}`;
    const products = await api(url);
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    if (products.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="icon">📦</div>
                <h3>${t('products_all')}</h3>
                <p>No products found</p>
            </div>`;
        return;
    }

    grid.innerHTML = products.map(p => `
        <div class="product-card fade-in visible" data-id="${p.id}">
            <div class="image-wrapper">
                ${p.image_url
                    ? `<img src="${p.image_url}" alt="${getLangField(p, 'name')}" loading="lazy">`
                    : `<div class="placeholder-img">🧵</div>`
                }
                ${p.is_featured ? `<span class="badge">★</span>` : ''}
            </div>
            <div class="card-body">
                <div class="category-tag">${getLangField(p, 'category_name')}</div>
                <h3>${getLangField(p, 'name')}</h3>
                <p class="description">${getLangField(p, 'description')}</p>
                <div class="card-footer">
                    <span class="price">${p.price || t('products_no_price')}</span>
                    <a href="#" class="btn btn-sm btn-outline" onclick="showProductDetail(${p.id}); return false;">${t('products_detail')}</a>
                </div>
            </div>
        </div>
    `).join('');
}

async function loadCategories() {
    const cats = await api('/api/categories');
    const filter = document.getElementById('categories-filter');
    if (!filter) return;

    filter.innerHTML = `<button class="cat-btn active" onclick="filterCategory(null, this)">${t('products_all')}</button>` +
        cats.map(c => `<button class="cat-btn" onclick="filterCategory('${c.slug}', this)">${getLangField(c, 'name')}</button>`).join('');
}

function filterCategory(slug, btn) {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadProducts(slug);
}

async function loadFeaturedProducts() {
    const products = await api('/api/products?featured=1');
    const grid = document.getElementById('featured-grid');
    if (!grid) return;

    grid.innerHTML = products.slice(0, 6).map(p => `
        <div class="product-card fade-in" data-id="${p.id}">
            <div class="image-wrapper">
                ${p.image_url
                    ? `<img src="${p.image_url}" alt="${getLangField(p, 'name')}" loading="lazy">`
                    : `<div class="placeholder-img">🧵</div>`
                }
                ${p.is_featured ? `<span class="badge">★</span>` : ''}
            </div>
            <div class="card-body">
                <div class="category-tag">${getLangField(p, 'category_name')}</div>
                <h3>${getLangField(p, 'name')}</h3>
                <p class="description">${getLangField(p, 'description')}</p>
                <div class="card-footer">
                    <span class="price">${p.price || t('products_no_price')}</span>
                    <a href="/products" class="btn btn-sm btn-outline">${t('products_detail')}</a>
                </div>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.fade-in:not(.visible)').forEach(el => observer.observe(el));
}

// ─── Product Detail Modal ───────────────────────────────────

async function showProductDetail(id) {
    const p = await api(`/api/products/${id}`);
    const gallery = JSON.parse(p.gallery || '[]');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal" style="max-width: 700px;">
            <div class="modal-header">
                <h3>${getLangField(p, 'name')}</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <div class="modal-body">
                <div style="margin-bottom: 20px;">
                    ${p.image_url
                        ? `<img src="${p.image_url}" style="width:100%; border-radius:12px; max-height:400px; object-fit:cover;">`
                        : `<div class="placeholder-img" style="height:300px; border-radius:12px;">🧵</div>`
                    }
                </div>
                ${gallery.length > 0 ? `
                <div style="display:flex; gap:8px; margin-bottom:20px; overflow-x:auto;">
                    ${gallery.map(img => `<img src="${img}" style="width:80px; height:80px; object-fit:cover; border-radius:8px; cursor:pointer;" onclick="this.parentElement.previousElementSibling.querySelector('img').src=this.src">`).join('')}
                </div>` : ''}
                <div class="category-tag" style="margin-bottom:8px;">${getLangField(p, 'category_name')}</div>
                <p style="color: var(--gray-700); line-height: 1.8;">${getLangField(p, 'description')}</p>
                ${p.price ? `<p style="font-size:1.3rem; font-weight:700; color:var(--navy-800); margin-top:16px;">${p.price}</p>` : ''}
            </div>
        </div>`;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('active'));
    modal.addEventListener('click', e => {
        if (e.target === modal) modal.remove();
    });
}

// ─── Auth Check ─────────────────────────────────────────────

async function checkAuth() {
    try {
        const data = await api('/api/auth/me');
        return data.authenticated;
    } catch {
        return false;
    }
}

async function updateNavAuth() {
    const isAuth = await checkAuth();
    const loginBtn = document.getElementById('nav-login');
    const adminBtn = document.getElementById('nav-admin');
    if (loginBtn) {
        if (isAuth) {
            loginBtn.textContent = t('nav_logout');
            loginBtn.href = '#';
            loginBtn.onclick = async (e) => {
                e.preventDefault();
                await api('/api/auth/logout', { method: 'POST' });
                window.location.href = '/';
            };
        } else {
            loginBtn.textContent = t('nav_login');
            loginBtn.href = '/login';
            loginBtn.onclick = null;
        }
    }
    if (adminBtn) {
        adminBtn.style.display = isAuth ? '' : 'none';
    }
}

// ─── Initialize ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    updateNavAuth();

    // Fetch and apply dynamic settings from database
    try {
        const settings = await api('/api/settings');
        if (settings) {
            // Update Hero Image
            const heroImg = document.getElementById('hero-img');
            if (heroImg && settings.hero_image) {
                heroImg.src = settings.hero_image;
            }

            // Update Site Logo
            if (settings.site_logo) {
                document.querySelectorAll('.site-logo').forEach(img => {
                    img.src = settings.site_logo;
                    img.style.display = 'block'; // in case fallback was triggered
                    if(img.nextElementSibling) img.nextElementSibling.style.display = 'none';
                });
            }
            
            // Override i18n data with database settings
            const lang = localStorage.getItem('lang') || 'tr';
            
            // Simple mapping for hero title and subtitle
            const titleKey = `hero_title_${lang}`;
            const subtitleKey = `hero_subtitle_${lang}`;
            
            const titleEl = document.querySelector('[data-i18n="hero_title_1"]');
            if (titleEl && settings[titleKey]) {
                const parts = settings[titleKey].split('&');
                if (parts.length > 1) {
                    titleEl.innerHTML = parts[0] + '&';
                    const title2El = document.querySelector('[data-i18n="hero_title_2"]');
                    if (title2El) title2El.textContent = parts[1];
                } else {
                    titleEl.textContent = settings[titleKey];
                }
            }
            
            const subtitleEl = document.querySelector('[data-i18n="hero_subtitle"]');
            if (subtitleEl && settings[subtitleKey]) {
                subtitleEl.textContent = settings[subtitleKey];
            }
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }

    // Homepage
    if (document.getElementById('featured-grid')) {
        loadFeaturedProducts();
    }

    // Products page
    if (document.getElementById('products-grid')) {
        loadCategories();
        loadProducts();
    }

    // Reload on language change
    window.addEventListener('langchange', async () => {
        if (document.getElementById('featured-grid')) loadFeaturedProducts();
        if (document.getElementById('products-grid')) {
            loadCategories();
            loadProducts();
        }
        updateNavAuth();
        
        // Re-apply settings
        try {
            const settings = await api('/api/settings');
            const lang = localStorage.getItem('lang') || 'tr';
            const titleKey = `hero_title_${lang}`;
            const subtitleKey = `hero_subtitle_${lang}`;
            
            const titleEl = document.querySelector('[data-i18n="hero_title_1"]');
            if (titleEl && settings[titleKey]) {
                const parts = settings[titleKey].split('&');
                if (parts.length > 1) {
                    titleEl.innerHTML = parts[0] + '&';
                    const title2El = document.querySelector('[data-i18n="hero_title_2"]');
                    if (title2El) title2El.textContent = parts[1];
                } else {
                    titleEl.textContent = settings[titleKey];
                }
            }
            const subtitleEl = document.querySelector('[data-i18n="hero_subtitle"]');
            if (subtitleEl && settings[subtitleKey]) {
                subtitleEl.textContent = settings[subtitleKey];
            }
        } catch (e) {}
    });
});
