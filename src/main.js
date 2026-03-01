import { CalculatorManager } from './CalculatorManager.js';
import { saveGraph, getGraph, getAllGraphs, deleteGraph } from './db.js';
import { copyToDesmos } from './clipboard.js';

let manager;
let currentGraphId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('calculator-container');
    manager = new CalculatorManager(container);

    // Default to 2D Graphing
    manager.loadCalculator('2d');

    // For debugging
    window.manager = manager;
    console.log('Manager initialized and 2D calculator loaded');

    setupEvents();
    registerServiceWorker();
});

function setupEvents() {
    // Product Switcher (Mode Toggle)
    const productSwitcher = document.getElementById('btn-product-switcher');
    productSwitcher.setAttribute('data-mode', '2d'); // Initial state

    productSwitcher.addEventListener('click', () => {
        const currentMode = productSwitcher.getAttribute('data-mode');
        const nextMode = currentMode === '2d' ? 'geometry' : '2d';

        productSwitcher.setAttribute('data-mode', nextMode);

        currentGraphId = null;
        document.getElementById('graph-name-input').value = '';
        manager.loadCalculator(nextMode);
    });

    // Help & Language placeholders
    document.getElementById('btn-help').addEventListener('click', () => {
        showToast('Help coming soon!');
    });

    document.getElementById('btn-language').addEventListener('click', () => {
        showToast('Language settings coming soon!');
    });

    // Export Dropdown Toggle
    const exportDropdown = document.querySelector('.dropdown');
    document.getElementById('btn-export-dropdown').addEventListener('click', (e) => {
        e.stopPropagation();
        exportDropdown.classList.toggle('open');
    });

    // Close dropdown on outside click
    window.addEventListener('click', () => {
        exportDropdown.classList.remove('open');
    });

    // Console Command Export
    document.getElementById('btn-copy-console').addEventListener('click', async () => {
        const state = manager.getState();
        if (state) {
            const success = await copyToDesmos(state, 'console');
            showToast(success ? 'Copied console command to clipboard!' : 'Failed to copy.');
        }
    });

    // DesModder Export
    document.getElementById('btn-copy-desmodder').addEventListener('click', async () => {
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

    btnMenu.addEventListener('click', () => {
        overlay.showModal();
        searchInput.value = '';
        renderGraphList();
    });

    // Close overlay
    document.getElementById('btn-close-menu').addEventListener('click', () => {
        overlay.close();
    });

    // Close on click outside (backdrop)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.close();
        }
    });

    // Search filtering
    searchInput.addEventListener('input', () => {
        renderGraphList(searchInput.value.trim());
    });

    // New Graph Dropdown Logic
    const newGraphToggle = document.getElementById('btn-new-graph-toggle');
    const newGraphDropdown = document.getElementById('new-graph-dropdown');
    const newGraphMain = document.getElementById('btn-new-graph-main');

    newGraphToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        newGraphDropdown.classList.toggle('show');
    });

    newGraphMain.addEventListener('click', () => {
        currentGraphId = null;
        document.getElementById('graph-name-input').value = '';
        manager.loadCalculator('2d');
        overlay.close();
    });

    document.querySelectorAll('.new-graph-dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            const mode = item.getAttribute('data-mode');
            currentGraphId = null;
            document.getElementById('graph-name-input').value = '';
            manager.loadCalculator(mode);
            newGraphDropdown.classList.remove('show');
            overlay.close();
        });
    });

    // Close dropdown on click outside
    window.addEventListener('click', (e) => {
        if (!e.target.closest('.new-graph-dropdown-container')) {
            newGraphDropdown.classList.remove('show');
        }
    });

    // Save Graph
    const saveBtn = document.getElementById('btn-save');

    const markDirty = () => saveBtn.classList.add('has-changes');
    const markClean = () => saveBtn.classList.remove('has-changes');

    // Listen for typing in graph name
    document.getElementById('graph-name-input').addEventListener('input', markDirty);

    // Use the Desmos API's native change event for instant detection
    manager.onChange(markDirty);

    saveBtn.addEventListener('click', async () => {
        const state = manager.getState();
        if (!state) return;

        if (!currentGraphId) {
            currentGraphId = crypto.randomUUID();
        }

        // Get custom name from input field, fallback to generic type+time if empty or default
        const nameInput = document.getElementById('graph-name-input');
        let name = nameInput.value.trim();

        if (!name) {
            const typeMap = { '2d': 'Graph', 'geometry': 'Geometry' };
            name = `${typeMap[manager.currentType]} - ${new Date().toLocaleTimeString()}`;
        }

        nameInput.value = name; // Auto-fill the UI to show the generated/cleaned name

        const thumbnail = await manager.screenshot();

        const graphObj = {
            id: currentGraphId,
            type: manager.currentType,
            name: name,
            state: state,
            thumbnail: thumbnail
        };

        await saveGraph(graphObj);
        markClean();
        showToast('Graph saved locally.');

        // Re-render the graph list if the overlay is open
        if (document.getElementById('graph-menu-overlay').classList.contains('open')) {
            renderGraphList();
        }
    });

    // Export All
    document.getElementById('btn-export-all').addEventListener('click', async () => {
        const allGraphs = await getAllGraphs();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allGraphs));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "desmos_offline_backup.json");
        dlAnchorElem.click();
    });

    // Import
    const fileImport = document.getElementById('file-import');
    document.getElementById('btn-import').addEventListener('click', () => fileImport.click());
    fileImport.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const graphs = JSON.parse(event.target.result);
                if (Array.isArray(graphs)) {
                    for (const g of graphs) {
                        await saveGraph(g);
                    }
                    showToast(`Imported ${graphs.length} graphs.`);
                    if (document.getElementById('graph-menu-overlay').classList.contains('open')) renderGraphList();
                }
            } catch (err) {
                showToast('Invalid JSON file.');
            }
        };
        reader.readAsText(file);
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
    listEl.innerHTML = '';

    let graphs = await getAllGraphs();

    // Filter by search query
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        graphs = graphs.filter(g => (g.name || '').toLowerCase().includes(q));
    }

    if (graphs.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${searchQuery ? 'No matching graphs' : 'No saved graphs yet'}</div>`;
        return;
    }

    // Sort descending by lastModified
    graphs.sort((a, b) => b.lastModified - a.lastModified);

    graphs.forEach(g => {
        const card = document.createElement('div');
        card.className = 'graph-card';
        card.setAttribute('data-id', g.id);

        const ago = timeAgo(g.lastModified);
        const previewContent = g.thumbnail
            ? `<img src="${g.thumbnail}" alt="${g.name}" class="graph-card-thumbnail" style="width: 100%; height: 100%; object-fit: contain;">`
            : `<span class="graph-card-preview-placeholder">📊</span>`;

        card.innerHTML = `
            <div class="graph-card-preview">
                ${previewContent}
                <div class="graph-card-actions">
                    <button class="graph-card-action-btn delete-btn" data-id="${g.id}" title="Delete">🗑</button>
                </div>
            </div>
            <div class="graph-card-info">
                <div class="graph-card-title">${g.name || 'Untitled'}</div>
                <div class="graph-card-meta">
                    <span>${ago}</span>
                    <span class="graph-card-type">${g.type}</span>
                </div>
            </div>
        `;
        listEl.appendChild(card);
    });

    // Bind card click to load
    listEl.querySelectorAll('.graph-card').forEach(card => {
        card.addEventListener('click', async (e) => {
            // Don't load if clicking delete
            if (e.target.closest('.delete-btn')) return;

            const id = card.getAttribute('data-id');
            const g = await getGraph(id);
            if (g) {
                currentGraphId = g.id;
                const productSwitcher = document.getElementById('btn-product-switcher');
                productSwitcher.setAttribute('data-mode', g.type);
                manager.loadCalculator(g.type, g.state);
                document.getElementById('graph-name-input').value = g.name || '';
                document.getElementById('graph-menu-overlay').classList.remove('open');
            }
        });
    });

    // Bind delete buttons
    listEl.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = e.target.getAttribute('data-id');
            await deleteGraph(id);
            if (currentGraphId === id) currentGraphId = null;
            const searchInput = document.getElementById('graph-search');
            renderGraphList(searchInput ? searchInput.value.trim() : '');
        });
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

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
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

