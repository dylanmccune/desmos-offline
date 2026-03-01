import { CalculatorManager } from './CalculatorManager.js';
import { saveGraph, getGraph, getAllGraphs, deleteGraph } from './db.js';
import { copyToDesmos } from './clipboard.js';

let manager;
let currentGraphId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('calculator-container');
    if (!container) return;

    manager = new CalculatorManager(container);

    // Initial state setup
    setupEvents();
    registerServiceWorker();

    // Start Routing
    handleRoute();
});

// ===== Router Logic =====
async function handleRoute() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(p => p);

    // Normalize paths
    if (parts.length === 0) {
        navigate('/calculator', true);
        return;
    }

    const mode = parts[0];
    const type = mode === 'geometry' ? 'geometry' : '2d';
    const id = parts[1] || null;

    // Update product switcher UI visually
    const productSwitcher = document.getElementById('btn-product-switcher');
    if (productSwitcher) {
        productSwitcher.setAttribute('data-mode', type);
    }

    if (id) {
        const g = await getGraph(id);
        if (g) {
            currentGraphId = g.id;
            manager.loadCalculator(g.type, g.state);
            document.getElementById('graph-name-input').value = g.name || '';
            console.log(`Loaded graph: ${g.name} (${g.id})`);
        } else {
            // Graph not found - clear and load fresh of that type
            console.warn(`Graph ${id} not found. Loading fresh ${type} instead.`);
            currentGraphId = null;
            document.getElementById('graph-name-input').value = '';
            manager.loadCalculator(type);
            navigate(`/${mode}`, true);
        }
    } else {
        // No ID, fresh start
        currentGraphId = null;
        document.getElementById('graph-name-input').value = '';
        manager.loadCalculator(type);
    }

    // Update metadata/title if needed
    document.title = (id ? 'Desmos Offline - ' + (document.getElementById('graph-name-input').value || 'Graph') : 'Desmos Offline');
}

function navigate(path, replace = false) {
    if (replace) {
        history.replaceState(null, '', path);
    } else {
        history.pushState(null, '', path);
    }
    handleRoute();
}

window.addEventListener('popstate', handleRoute);

function setupEvents() {
    // Product Switcher (Mode Toggle)
    const productSwitcher = document.getElementById('btn-product-switcher');
    if (productSwitcher) {
        productSwitcher.addEventListener('click', () => {
            const currentMode = productSwitcher.getAttribute('data-mode');
            const target = currentMode === '2d' ? '/geometry' : '/calculator';
            navigate(target);
        });
    }

    // Help & Language placeholders
    document.getElementById('btn-help')?.addEventListener('click', () => {
        showToast('Help coming soon!');
    });

    document.getElementById('btn-language')?.addEventListener('click', () => {
        showToast('Language settings coming soon!');
    });

    // Export Dropdown Toggle
    const exportDropdown = document.querySelector('.dropdown');
    document.getElementById('btn-export-dropdown')?.addEventListener('click', (e) => {
        e.stopPropagation();
        exportDropdown?.classList.toggle('open');
    });

    window.addEventListener('click', () => {
        exportDropdown?.classList.remove('open');
        document.querySelectorAll('.graph-card-dropdown.open').forEach(d => d.classList.remove('open'));
    });

    // Console Command Export
    document.getElementById('btn-copy-console')?.addEventListener('click', async () => {
        const state = manager.getState();
        if (state) {
            const success = await copyToDesmos(state, 'console');
            showToast(success ? 'Copied console command to clipboard!' : 'Failed to copy.');
        }
    });

    // DesModder Export
    document.getElementById('btn-copy-desmodder')?.addEventListener('click', async () => {
        const state = manager.getState();
        if (state) {
            const success = await copyToDesmos(state, 'desmodder');
            showToast(success ? 'Copied DesModder Text to clipboard!' : 'Failed to copy.');
        }
    });

    // Graph Menu Overlay (Folder Icon)
    const btnMenu = document.getElementById('btn-menu');
    const overlay = document.getElementById('graph-menu-overlay');
    const searchInput = document.getElementById('graph-search');

    btnMenu?.addEventListener('click', () => {
        overlay?.showModal();
        if (searchInput) searchInput.value = '';
        renderGraphList();
    });

    document.getElementById('btn-close-menu')?.addEventListener('click', () => {
        overlay?.close();
    });

    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.close();
    });

    searchInput?.addEventListener('input', () => {
        renderGraphList(searchInput.value.trim());
    });

    // New Graph Dropdown Logic
    const newGraphToggle = document.getElementById('btn-new-graph-toggle');
    const newGraphDropdown = document.getElementById('new-graph-dropdown');
    const newGraphMain = document.getElementById('btn-new-graph-main');

    newGraphToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        newGraphDropdown?.classList.toggle('show');
    });

    newGraphMain?.addEventListener('click', () => {
        navigate('/calculator');
        overlay?.close();
    });

    document.querySelectorAll('.new-graph-dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            const mode = item.getAttribute('data-mode');
            navigate(mode === 'geometry' ? '/geometry' : '/calculator');
            newGraphDropdown?.classList.remove('show');
            overlay?.close();
        });
    });

    window.addEventListener('click', (e) => {
        if (!e.target.closest('.new-graph-dropdown-container')) {
            newGraphDropdown?.classList.remove('show');
        }
    });

    // Save Graph
    const saveBtn = document.getElementById('btn-save');
    const nameInput = document.getElementById('graph-name-input');

    const markDirty = () => saveBtn?.classList.add('has-changes');
    const markClean = () => saveBtn?.classList.remove('has-changes');

    nameInput?.addEventListener('input', markDirty);
    manager.onChange(markDirty);

    saveBtn?.addEventListener('click', async () => {
        const state = manager.getState();
        if (!state) return;

        let isNew = false;
        if (!currentGraphId) {
            currentGraphId = generateShortId();
            isNew = true;
        }

        let name = nameInput.value.trim();
        if (!name) {
            const typeMap = { '2d': 'Graph', 'geometry': 'Geometry' };
            name = `${typeMap[manager.currentType]} - ${new Date().toLocaleTimeString()}`;
        }
        nameInput.value = name;

        const thumbnail = await manager.screenshot();

        const graphObj = {
            id: currentGraphId,
            type: manager.currentType,
            name: name,
            state: state,
            thumbnail: thumbnail
        };

        await saveGraph(graphObj);

        if (isNew) {
            const modePath = manager.currentType === 'geometry' ? 'geometry' : 'calculator';
            navigate(`/${modePath}/${currentGraphId}`, true);
        }
        markClean();
        showToast('Graph saved locally.');
        renderGraphList(searchInput?.value.trim());
    });

    // Export/Import
    document.getElementById('btn-export-all')?.addEventListener('click', async () => {
        const allGraphs = await getAllGraphs();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allGraphs));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "desmos_offline_backup.json");
        dlAnchorElem.click();
    });

    const fileImport = document.getElementById('file-import');
    document.getElementById('btn-import')?.addEventListener('click', () => fileImport?.click());
    fileImport?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const graphs = JSON.parse(event.target.result);
                if (Array.isArray(graphs)) {
                    for (const g of graphs) await saveGraph(g);
                    showToast(`Imported ${graphs.length} graphs.`);
                    renderGraphList();
                }
            } catch (err) {
                showToast('Invalid JSON file.');
            }
        };
        reader.readAsText(file);
    });

    // Intercept internal links
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.origin === window.location.origin && !link.hasAttribute('download')) {
            e.preventDefault();
            navigate(link.pathname + link.search + link.hash);
        }
    });
}

function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
    const years = Math.floor(days / 365);
    return `${years} year${years !== 1 ? 's' : ''} ago`;
}

async function renderGraphList(searchQuery = '') {
    const listEl = document.getElementById('saved-graphs-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    let graphs = await getAllGraphs();
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        graphs = graphs.filter(g => (g.name || '').toLowerCase().includes(q));
    }

    if (graphs.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${searchQuery ? 'No matching graphs' : 'No saved graphs yet'}</div>`;
        return;
    }

    graphs.sort((a, b) => b.lastModified - a.lastModified);

    graphs.forEach(g => {
        const card = document.createElement('div');
        card.className = 'graph-card';
        card.setAttribute('data-id', g.id);
        card.setAttribute('data-type', g.type);

        const ago = timeAgo(g.lastModified);
        const typeAttr = g.type === 'geometry' ? 'geometry' : '2d';
        const previewContent = g.thumbnail
            ? `<img src="${g.thumbnail}" alt="${g.name}" class="graph-card-img">`
            : `<div class="graph-card-img-placeholder">📊</div>`;

        card.innerHTML = `
            <div class="graph-card-header">
                <div class="graph-card-title">${g.name || 'Untitled'}</div>
                <div class="graph-card-menu-container">
                    <button class="graph-card-menu-btn" title="More options">⋯</button>
                    <div class="graph-card-dropdown">
                        <button class="graph-card-dropdown-item duplicate-item">Duplicate</button>
                        <button class="graph-card-dropdown-item delete-item">Delete</button>
                    </div>
                </div>
            </div>
            <div class="graph-card-image-wrap">
                ${previewContent}
                <div class="graph-card-overlay">
                    <span>${ago}</span>
                    <span class="graph-card-type-icon" data-type="${typeAttr}"></span>
                </div>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.graph-card-menu-container')) return;
            const id = card.getAttribute('data-id');
            const type = card.getAttribute('data-type');
            const modePath = type === 'geometry' ? 'geometry' : 'calculator';
            navigate(`/${modePath}/${id}`);
            document.getElementById('graph-menu-overlay')?.close();
        });

        const menuBtn = card.querySelector('.graph-card-menu-btn');
        const dropdown = card.querySelector('.graph-card-dropdown');

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('open');
            document.querySelectorAll('.graph-card-dropdown.open').forEach(d => d.classList.remove('open'));
            if (!isOpen) dropdown.classList.add('open');
        });

        card.querySelector('.duplicate-item').addEventListener('click', async (e) => {
            e.stopPropagation();
            const src = await getGraph(g.id);
            if (!src) return;
            await saveGraph({ ...src, id: generateShortId(), name: `${src.name || 'Untitled'} (copy)`, lastModified: Date.now() });
            dropdown.classList.remove('open');
            renderGraphList(searchQuery);
        });

        card.querySelector('.delete-item').addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteGraph(g.id);
            if (currentGraphId === g.id) navigate(`/${manager.currentType === 'geometry' ? 'geometry' : 'calculator'}`, true);
            dropdown.classList.remove('open');
            renderGraphList(searchQuery);
        });

        listEl.appendChild(card);
    });
}

function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then((registration) => {
                console.log('SW registered: ', registration);
            }).catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
        });
    }
}

function generateShortId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
