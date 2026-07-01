// app/core/main/modules/modules.js

class CoreMainModules {
    constructor(options = {}) {
        this.onSave = options.onSave || null;
        this.modules = [];
        this.currentEditId = null;
        this.confirmCallback = null;
        this.showDeleted = false;
        this.selectedIds = new Set();
        this.modal = null;
        this.editModal = null;
        this.msgBox = null;
        this.confirmBox = null;
        this.init();
    }
    
    async init() {
        await this.loadHtml();
        this.bindEvents();
        await this.loadList();
    }
    
    async loadHtml() {
        if (!document.querySelector('.core-main-modules')) {
            const response = await fetch('/core/main/modules/modal');
            const html = await response.text();
            document.body.insertAdjacentHTML('beforeend', html);
        }
        this.modal = document.querySelector('.core-main-modules');
        this.editModal = document.querySelector('.core-main-modules-edit');
        this.msgBox = document.querySelector('.core-main-modules-msgbox');
        this.confirmBox = document.querySelector('.core-main-modules-confirm');
    }
    
    bindEvents() {
        if (!this.modal) return;
        
        this.modal.querySelector('[data-action="add"]')?.addEventListener('click', () => this.openEdit());
        this.modal.querySelector('[data-action="edit"]')?.addEventListener('click', () => this.editSelected());
        this.modal.querySelector('[data-action="delete"]')?.addEventListener('click', () => this.deleteSelected());
        this.modal.querySelector('[data-action="restore"]')?.addEventListener('click', () => this.restoreSelected());
        this.modal.querySelector('[data-action="show-deleted"]')?.addEventListener('click', () => this.showDeletedList());
        this.modal.querySelector('[data-action="show-active"]')?.addEventListener('click', () => this.showActiveList());
        this.modal.querySelector('[data-action="select-all"]')?.addEventListener('change', (e) => this.toggleAll(e.target.checked));
        
        if (this.editModal) {
            this.editModal.querySelector('[data-action="close"]')?.addEventListener('click', () => this.hideEdit());
            this.editModal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.hideEdit());
            this.editModal.querySelector('[data-action="save"]')?.addEventListener('click', () => this.save());
        }
        
        document.querySelector('.core-node-index-modules-confirm [data-action="ok"]')?.addEventListener('click', () => {
            if (this.confirmCallback) {
                this.confirmCallback(true);
                this.confirmCallback = null;
            }
            this.hideModal(this.confirmBox);
        });
        
        document.querySelector('.core-node-index-modules-confirm [data-action="cancel"]')?.addEventListener('click', () => {
            if (this.confirmCallback) {
                this.confirmCallback(false);
                this.confirmCallback = null;
            }
            this.hideModal(this.confirmBox);
        });
    }
    
    hideModal(el) { if (el) bootstrap.Modal.getInstance(el)?.hide(); document.activeElement?.blur(); }
    hideEdit() { this.hideModal(this.editModal); }
    
    updateStatus(msg) { this.modal?.querySelector('[data-field="status"]') && (this.modal.querySelector('[data-field="status"]').textContent = msg); }
    updateButtons() {
        const has = this.selectedIds.size > 0;
        const edit = this.modal?.querySelector('[data-action="edit"]');
        const del = this.modal?.querySelector('[data-action="delete"]');
        const rest = this.modal?.querySelector('[data-action="restore"]');
        if (edit) edit.disabled = !has || this.showDeleted;
        if (del) del.disabled = !has;
        if (rest) rest.disabled = !has || !this.showDeleted;
    }
    
    updateAllCheckbox() {
        const all = this.modal?.querySelector('[data-action="select-all"]');
        if (!all) return;
        const cbs = this.modal.querySelectorAll('.module-checkbox');
        const checked = Array.from(cbs).filter(cb => cb.checked).length;
        all.checked = checked === cbs.length;
        all.indeterminate = checked > 0 && checked < cbs.length;
    }
    
    toggleAll(checked) {
        this.modal.querySelectorAll('.module-checkbox').forEach(cb => {
            cb.checked = checked;
            const id = parseInt(cb.dataset.moduleId);
            checked ? this.selectedIds.add(id) : this.selectedIds.delete(id);
        });
        this.updateButtons();
    }
    
    async loadList() {
        if (!this.modal) return;
        this.updateStatus('Загрузка...');
        const url = this.showDeleted ? '/core/main/modules/list?include_deleted=true' : '/core/node/index/modules/list';
        try {
            const res = await fetch(url);
            const data = await res.json();
            this.modules = data.modules || [];
            this.renderList();
            this.updateStatus(`Готово (${this.modules.length})`);
        } catch(e) { this.renderError(); this.updateStatus('Ошибка'); }
    }
    
    renderList() {
        const tbody = this.modal?.querySelector('[data-field="modulesList"]');
        if (!tbody) return;
        if (!this.modules.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4">Нет модулей</td></td>'; return; }
        
        tbody.innerHTML = '';
        this.modules.forEach(m => {
            const row = tbody.insertRow();
            if (m.is_delete) row.classList.add('deleted-row');
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'form-check-input module-checkbox';
            cb.dataset.moduleId = m.id;
            cb.checked = this.selectedIds.has(m.id);
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                this.selectedIds.has(m.id) ? this.selectedIds.delete(m.id) : this.selectedIds.add(m.id);
                this.updateButtons();
                this.updateAllCheckbox();
            });
            row.insertCell(0).appendChild(cb);
            row.insertCell(1).innerHTML = `<div class="fw-bold">${this.escape(m.name)}</div>`;
            row.insertCell(2).innerHTML = m.url ? `<code>${this.escape(m.url)}</code>` : '<span class="text-muted">—</span>';
            row.insertCell(3).innerHTML = m.description ? this.escape(m.description) : '<span class="text-muted">—</span>';
            row.insertCell(4).innerHTML = m.created_at ? new Date(m.created_at).toLocaleDateString('ru-RU') : '—';
            if (!m.is_delete) row.addEventListener('dblclick', () => this.openEdit(m.id));
        });
        this.updateButtons();
        this.updateAllCheckbox();
    }
    
    renderError() { this.modal?.querySelector('[data-field="modulesList"]') && (this.modal.querySelector('[data-field="modulesList"]').innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Ошибка</td></table>'); }
    
    async showDeletedList() { this.showDeleted = true; this.selectedIds.clear(); await this.loadList(); }
    async showActiveList() { this.showDeleted = false; this.selectedIds.clear(); await this.loadList(); }
    
    editSelected() {
        if (this.selectedIds.size !== 1) { this.msg('Выберите один модуль', 'error'); return; }
        this.openEdit(Array.from(this.selectedIds)[0]);
    }
    
    async openEdit(id = null) {
        if (!this.editModal) return;
        this.currentEditId = id;
        const title = this.editModal.querySelector('[data-field="editTitle"]');
        const idF = this.editModal.querySelector('[data-field="moduleId"]');
        const nameF = this.editModal.querySelector('[data-field="name"]');
        const urlF = this.editModal.querySelector('[data-field="url"]');
        const descF = this.editModal.querySelector('[data-field="description"]');
        
        if (id) {
            title.textContent = 'Редактирование';
            try {
                const res = await fetch(`/core/main/modules/module/${id}`);
                const data = await res.json();
                idF.value = data.module.id;
                nameF.value = data.module.name;
                urlF.value = data.module.url || '';
                descF.value = data.module.description || '';
            } catch(e) { this.msg('Ошибка загрузки', 'error'); return; }
        } else {
            title.textContent = 'Добавление';
            idF.value = ''; nameF.value = ''; urlF.value = ''; descF.value = '';
        }
        new bootstrap.Modal(this.editModal).show();
    }
    
    async save() {
        const id = this.editModal.querySelector('[data-field="moduleId"]').value;
        const name = this.editModal.querySelector('[data-field="name"]').value.trim();
        const url = this.editModal.querySelector('[data-field="url"]').value.trim();
        const desc = this.editModal.querySelector('[data-field="description"]').value.trim();
        if (!name) { this.msg('Введите название', 'error'); return; }
        
        const btn = this.editModal.querySelector('[data-action="save"]');
        const orig = btn.textContent;
        btn.textContent = 'Сохранение...'; btn.disabled = true;
        
        try {
            let res;
            if (id) {
                res = await fetch(`/core/main/modules/module/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, url, description: desc }) });
            } else {
                res = await fetch('/core/main/modules/module', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, url, description: desc }) });
            }
            if (!res.ok) throw new Error();
            this.msg(id ? 'Обновлён' : 'Создан', 'success');
            this.hideModal(this.editModal);
            await this.loadList();
        } catch(e) { this.msg('Ошибка сохранения', 'error'); }
        finally { btn.textContent = orig; btn.disabled = false; }
    }
    
    async deleteSelected() {
        if (!this.selectedIds.size) { this.msg('Выберите модули', 'error'); return; }
        this.confirm(`Удалить ${this.selectedIds.size} модуль(ей)?`, async (ok) => {
            if (!ok) return;
            let success = 0;
            for (const id of this.selectedIds) {
                const res = await fetch(`/core/main/modules/module/${id}`, { method: 'DELETE' });
                if (res.ok) success++;
            }
            this.selectedIds.clear();
            await this.loadList();
            this.msg(`Удалено: ${success}`, 'success');
        });
    }
    
    async restoreSelected() {
        if (!this.selectedIds.size) { this.msg('Выберите модули', 'error'); return; }
        this.confirm(`Восстановить ${this.selectedIds.size} модуль(ей)?`, async (ok) => {
            if (!ok) return;
            let success = 0;
            for (const id of this.selectedIds) {
                const res = await fetch(`/core/main/modules/module/${id}/restore`, { method: 'POST' });
                if (res.ok) success++;
            }
            this.selectedIds.clear();
            await this.loadList();
            this.msg(`Восстановлено: ${success}`, 'success');
        });
    }
    
    msg(message, type = 'info') {
        if (!this.msgBox) return;
        const title = this.msgBox.querySelector('[data-field="msgboxTitle"]');
        const body = this.msgBox.querySelector('[data-field="msgboxMessage"]');
        title.textContent = type === 'error' ? 'Ошибка' : (type === 'success' ? 'Успешно' : 'Сообщение');
        body.textContent = message;
        const modal = new bootstrap.Modal(this.msgBox);
        modal.show();
        setTimeout(() => modal.hide(), 3000);
    }
    
    confirm(message, callback) {
        this.confirmCallback = callback;
        const body = this.confirmBox?.querySelector('[data-field="confirmMessage"]');
        if (body) body.textContent = message;
        new bootstrap.Modal(this.confirmBox).show();
    }
    
    show() { this.showDeleted = false; this.selectedIds.clear(); new bootstrap.Modal(this.modal).show(); this.loadList(); }
    hide() { this.hideModal(this.modal); }
    escape(str) { return str?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') || ''; }
}

// Делаем класс доступным глобально
window.CoreMainModules = CoreMainModules;