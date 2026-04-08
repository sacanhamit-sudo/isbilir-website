/* ═══════════════════════════════════════════════════════════
   İsbilir Tekstil - Admin Panel JS
   ═══════════════════════════════════════════════════════════ */

let currentSection = 'dashboard';
let allProducts = [];
let allCategories = [];

// ─── Auth Guard ─────────────────────────────────────────────

async function adminInit() {
    const isAuth = await checkAuth();
    if (!isAuth) {
        window.location.href = '/login';
        return;
    }
    await loadAdminData();
    showSection('dashboard');
    setupAdminNav();
}

function setupAdminNav() {
    document.querySelectorAll('.admin-sidebar .menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            if (section) showSection(section);
        });
    });
}

function showSection(section) {
    currentSection = section;
    document.querySelectorAll('.admin-sidebar .menu-item').forEach(m => {
        m.classList.toggle('active', m.dataset.section === section);
    });
    document.querySelectorAll('.admin-section').forEach(s => {
        s.style.display = s.id === `section-${section}` ? 'block' : 'none';
    });

    if (section === 'dashboard') renderDashboard();
    else if (section === 'products') renderProductsTable();
    else if (section === 'categories') renderCategoriesTable();
    else if (section === 'settings') renderSettings();
}

// ─── Load Data ──────────────────────────────────────────────

async function loadAdminData() {
    allProducts = await api('/api/products');
    allCategories = await api('/api/categories');
}

// ─── Dashboard ──────────────────────────────────────────────

function renderDashboard() {
    const featured = allProducts.filter(p => p.is_featured).length;
    document.getElementById('stat-products').textContent = allProducts.length;
    document.getElementById('stat-categories').textContent = allCategories.length;
    document.getElementById('stat-featured').textContent = featured;
}

// ─── Products Table ─────────────────────────────────────────

function renderProductsTable() {
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;

    tbody.innerHTML = allProducts.map(p => `
        <tr class="sortable-item" data-id="${p.id}" draggable="true">
            <td>
                ${p.image_url
                    ? `<img src="${p.image_url}" class="thumb" alt="">`
                    : `<div class="thumb" style="display:flex;align-items:center;justify-content:center;background:var(--gray-100);">🧵</div>`
                }
            </td>
            <td><strong>${p.name_tr}</strong><br><small style="color:var(--gray-500)">${p.name_en || ''}</small></td>
            <td>${p.category_name_tr || '-'}</td>
            <td>${p.price || '-'}</td>
            <td>
                <label class="toggle">
                    <input type="checkbox" ${p.is_featured ? 'checked' : ''} onchange="toggleFeatured(${p.id}, this.checked)">
                    <span class="slider"></span>
                </label>
            </td>
            <td>
                <label class="toggle">
                    <input type="checkbox" ${p.is_active ? 'checked' : ''} onchange="toggleActive(${p.id}, this.checked)">
                    <span class="slider"></span>
                </label>
            </td>
            <td>${p.sort_order || 0}</td>
            <td class="actions">
                <button class="btn-edit" onclick="editProduct(${p.id})">✎ ${t('admin_edit')}</button>
                <button class="btn-delete" onclick="deleteProduct(${p.id})">✕ ${t('admin_delete')}</button>
            </td>
        </tr>
    `).join('');

    setupDragSort(tbody);
}

async function toggleFeatured(id, val) {
    await api(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_featured: val })
    });
    await loadAdminData();
    showToast(t('admin_saved'));
}

async function toggleActive(id, val) {
    await api(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: val })
    });
    await loadAdminData();
    showToast(t('admin_saved'));
}

// ─── Product Modal ──────────────────────────────────────────

function openProductModal(product = null) {
    const isEdit = !!product;
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');

    document.getElementById('modal-title').textContent = isEdit ? `${t('admin_edit')} - ${product.name_tr}` : t('admin_add_product');

    // Fill form
    form.elements['name_tr'].value = product?.name_tr || '';
    form.elements['name_en'].value = product?.name_en || '';
    form.elements['name_de'].value = product?.name_de || '';
    form.elements['description_tr'].value = product?.description_tr || '';
    form.elements['description_en'].value = product?.description_en || '';
    form.elements['description_de'].value = product?.description_de || '';
    form.elements['price'].value = product?.price || '';
    form.elements['category_id'].value = product?.category_id || '';
    form.elements['sort_order'].value = product?.sort_order || 0;
    form.elements['row_position'].value = product?.row_position || 0;
    form.elements['col_position'].value = product?.col_position || 0;
    form.elements['is_featured'].checked = product?.is_featured || false;
    form.elements['is_active'].checked = product?.is_active ?? true;

    // Image preview
    const preview = document.getElementById('image-preview');
    if (product?.image_url) {
        preview.innerHTML = `<div class="preview-item"><img src="${product.image_url}"><button class="remove" onclick="clearImagePreview()">×</button></div>`;
    } else {
        preview.innerHTML = '';
    }

    // Gallery preview
    const galleryPreview = document.getElementById('gallery-preview');
    const gallery = product ? JSON.parse(product.gallery || '[]') : [];
    renderGalleryPreview(gallery);

    form.dataset.productId = product?.id || '';

    // Populate category dropdown
    const catSelect = form.elements['category_id'];
    catSelect.innerHTML = '<option value="">-- Kategori Seçin --</option>' +
        allCategories.map(c => `<option value="${c.id}" ${c.id == product?.category_id ? 'selected' : ''}>${c.name_tr}</option>`).join('');

    modal.classList.add('active');
}

function closeProductModal() {
    document.getElementById('product-modal').classList.remove('active');
}

function clearImagePreview() {
    document.getElementById('image-preview').innerHTML = '';
    document.getElementById('product-form').dataset.imageUrl = '';
}

let currentGallery = [];

function renderGalleryPreview(gallery) {
    currentGallery = gallery;
    const el = document.getElementById('gallery-preview');
    if (!el) return;
    el.innerHTML = gallery.map((url, i) => `
        <div class="preview-item">
            <img src="${url}">
            <button class="remove" onclick="removeGalleryImage(${i})">×</button>
        </div>
    `).join('');
}

function removeGalleryImage(index) {
    currentGallery.splice(index, 1);
    renderGalleryPreview(currentGallery);
}

// ─── Image Upload ───────────────────────────────────────────

function setupUpload(inputId, previewId, isGallery = false, hiddenInputId = null) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files.length) return;

        const formData = new FormData();
        for (const f of files) formData.append('file', f);

        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success && data.urls.length > 0) {
            if (isGallery) {
                currentGallery.push(...data.urls);
                renderGalleryPreview(currentGallery);
            } else {
                const preview = document.getElementById(previewId);
                const url = data.urls[0];
                preview.innerHTML = `<div class="preview-item"><img src="${url}"><button class="remove" onclick="if('${hiddenInputId}' && document.getElementById('${hiddenInputId}')) document.getElementById('${hiddenInputId}').value=''; else if(document.getElementById('product-form')) document.getElementById('product-form').dataset.imageUrl=''; this.parentElement.remove();">×</button></div>`;
                if (hiddenInputId && document.getElementById(hiddenInputId)) {
                    document.getElementById(hiddenInputId).value = url;
                } else if (document.getElementById('product-form')) {
                    document.getElementById('product-form').dataset.imageUrl = url;
                }
            }
            showToast(t('admin_saved'), 'success');
        }
    });
}

// ─── Save Product ───────────────────────────────────────────

async function saveProduct() {
    const form = document.getElementById('product-form');
    const id = form.dataset.productId;
    const imagePreview = document.getElementById('image-preview');
    const imgEl = imagePreview.querySelector('img');

    const data = {
        name_tr: form.elements['name_tr'].value,
        name_en: form.elements['name_en'].value,
        name_de: form.elements['name_de'].value,
        description_tr: form.elements['description_tr'].value,
        description_en: form.elements['description_en'].value,
        description_de: form.elements['description_de'].value,
        price: form.elements['price'].value,
        category_id: form.elements['category_id'].value || null,
        sort_order: parseInt(form.elements['sort_order'].value) || 0,
        row_position: parseInt(form.elements['row_position'].value) || 0,
        col_position: parseInt(form.elements['col_position'].value) || 0,
        is_featured: form.elements['is_featured'].checked,
        is_active: form.elements['is_active'].checked,
        image_url: form.dataset.imageUrl || (imgEl ? imgEl.src : ''),
        gallery: currentGallery
    };

    if (id) {
        await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
        await api('/api/products', { method: 'POST', body: JSON.stringify(data) });
    }

    closeProductModal();
    await loadAdminData();
    renderProductsTable();
    renderDashboard();
    showToast(t('admin_saved'));
}

function editProduct(id) {
    const product = allProducts.find(p => p.id === id);
    if (product) openProductModal(product);
}

async function deleteProduct(id) {
    if (!confirm(t('admin_confirm_delete'))) return;
    await api(`/api/products/${id}`, { method: 'DELETE' });
    await loadAdminData();
    renderProductsTable();
    renderDashboard();
    showToast(t('admin_deleted'), 'warning');
}

// ─── Categories Table ───────────────────────────────────────

function renderCategoriesTable() {
    const tbody = document.getElementById('categories-tbody');
    if (!tbody) return;

    tbody.innerHTML = allCategories.map(c => `
        <tr data-id="${c.id}">
            <td>${c.id}</td>
            <td><strong>${c.name_tr}</strong></td>
            <td>${c.name_en || '-'}</td>
            <td>${c.name_de || '-'}</td>
            <td>${c.slug}</td>
            <td>${c.sort_order}</td>
            <td class="actions">
                <button class="btn-edit" onclick="editCategory(${c.id})">✎ ${t('admin_edit')}</button>
                <button class="btn-delete" onclick="deleteCategory(${c.id})">✕ ${t('admin_delete')}</button>
            </td>
        </tr>
    `).join('');
}

function openCategoryModal(category = null) {
    const isEdit = !!category;
    const modal = document.getElementById('category-modal');
    const form = document.getElementById('category-form');

    document.getElementById('cat-modal-title').textContent = isEdit ? `${t('admin_edit')} - ${category.name_tr}` : t('admin_add_category');

    form.elements['cat_name_tr'].value = category?.name_tr || '';
    form.elements['cat_name_en'].value = category?.name_en || '';
    form.elements['cat_name_de'].value = category?.name_de || '';
    form.elements['cat_sort_order'].value = category?.sort_order || 0;
    form.dataset.categoryId = category?.id || '';

    modal.classList.add('active');
}

function closeCategoryModal() {
    document.getElementById('category-modal').classList.remove('active');
}

async function saveCategory() {
    const form = document.getElementById('category-form');
    const id = form.dataset.categoryId;

    const data = {
        name_tr: form.elements['cat_name_tr'].value,
        name_en: form.elements['cat_name_en'].value,
        name_de: form.elements['cat_name_de'].value,
        sort_order: parseInt(form.elements['cat_sort_order'].value) || 0
    };

    if (id) {
        await api(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
        await api('/api/categories', { method: 'POST', body: JSON.stringify(data) });
    }

    closeCategoryModal();
    await loadAdminData();
    renderCategoriesTable();
    renderDashboard();
    showToast(t('admin_saved'));
}

function editCategory(id) {
    const cat = allCategories.find(c => c.id === id);
    if (cat) openCategoryModal(cat);
}

async function deleteCategory(id) {
    if (!confirm(t('admin_confirm_delete'))) return;
    await api(`/api/categories/${id}`, { method: 'DELETE' });
    await loadAdminData();
    renderCategoriesTable();
    renderDashboard();
    showToast(t('admin_deleted'), 'warning');
}

// ─── Settings ───────────────────────────────────────────────

async function renderSettings() {
    const settings = await api('/api/settings');
    const form = document.getElementById('settings-form');
    if (!form) return;

    Object.keys(settings).forEach(key => {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) input.value = settings[key];
    });

    const heroPreview = document.getElementById('hero-preview');
    if (heroPreview && settings['hero_image']) {
        heroPreview.innerHTML = `<div class="preview-item"><img src="${settings['hero_image']}"><button class="remove" onclick="document.getElementById('hero_image_input').value=''; this.parentElement.remove();">×</button></div>`;
    }

    const logoPreview = document.getElementById('logo-preview');
    if (logoPreview && settings['site_logo']) {
        logoPreview.innerHTML = `<div class="preview-item"><img src="${settings['site_logo']}"><button class="remove" onclick="document.getElementById('site_logo_input').value=''; this.parentElement.remove();">×</button></div>`;
    }
}

async function saveSettings() {
    const form = document.getElementById('settings-form');
    const data = {};
    new FormData(form).forEach((v, k) => data[k] = v);
    await api('/api/settings', { method: 'POST', body: JSON.stringify(data) });
    showToast(t('admin_saved'));
}

// ─── Drag & Drop Sort ──────────────────────────────────────

function setupDragSort(tbody) {
    let dragRow = null;

    tbody.querySelectorAll('.sortable-item').forEach(row => {
        row.addEventListener('dragstart', (e) => {
            dragRow = row;
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            tbody.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over'));
            saveReorder(tbody);
        });

        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (row !== dragRow) {
                row.classList.add('drag-over');
            }
        });

        row.addEventListener('dragleave', () => {
            row.classList.remove('drag-over');
        });

        row.addEventListener('drop', (e) => {
            e.preventDefault();
            if (row !== dragRow) {
                const allRows = [...tbody.querySelectorAll('.sortable-item')];
                const fromIdx = allRows.indexOf(dragRow);
                const toIdx = allRows.indexOf(row);
                if (fromIdx < toIdx) {
                    row.after(dragRow);
                } else {
                    row.before(dragRow);
                }
            }
            row.classList.remove('drag-over');
        });
    });
}

async function saveReorder(tbody) {
    const rows = [...tbody.querySelectorAll('.sortable-item')];
    const items = rows.map((row, idx) => ({
        id: parseInt(row.dataset.id),
        sort_order: idx,
        row_position: Math.floor(idx / 3),
        col_position: idx % 3
    }));

    await api('/api/products/reorder', {
        method: 'POST',
        body: JSON.stringify({ items })
    });

    await loadAdminData();
    showToast(t('admin_saved'));
}

// ─── Init ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.admin-layout')) {
        adminInit();
        setupUpload('image-upload', 'image-preview', false);
        setupUpload('gallery-upload', 'gallery-preview', true);
        setupUpload('hero-upload', 'hero-preview', false, 'hero_image_input');
        setupUpload('logo-upload', 'logo-preview', false, 'site_logo_input');
    }
});
