// ============================================================
//  View Page JS — Authenticated view + shared link handling
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, onValue, update, remove } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// Holds the unsubscribe function for any active live listener
let _liveUnsub = null;

// Check URL parameters for shared view
const urlParams = new URLSearchParams(window.location.search);
const sharedParam = urlParams.get('shared');

if (sharedParam) {
    // Shared view mode - no login required
    try {
        const decoded = new TextDecoder().decode(Uint8Array.from(atob(decodeURIComponent(sharedParam)), c => c.charCodeAt(0)));
        const sharedItem = JSON.parse(decoded);
        displaySharedItem(sharedItem);
        // Update header for shared view: show app logo + auth buttons, hide back
        document.getElementById('header-logo').innerHTML =
            '<i class="fas fa-sticky-note"></i> My Notes <span class="shared-logo-sub">· shared</span>';
        document.getElementById('back-btn').style.display = 'none';
        document.getElementById('login-btn').style.display = 'flex';
        document.getElementById('signup-btn').style.display = 'flex';
    } catch (e) {
        console.error('Share decode error:', e);
        showItemNotFound();
    }
} else {
    // Check if user is logged in
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in
            loadSpecificItem(user.uid);
        } else {
            // User is signed out, redirect to login page
            window.location.href = 'login.html';
        }
    });
}

// Load specific item based on what was clicked in index.html
function loadSpecificItem(userId) {
    const itemId = localStorage.getItem('viewItemId');
    const itemType = localStorage.getItem('viewItemType');

    if (!itemId || !itemType) {
        showNoItemSelected();
        return;
    }

    const itemRef = ref(database, `users/${userId}/${itemType}s/${itemId}`);

    onValue(itemRef, (snapshot) => {
        const item = snapshot.val();
        if (item) {
            displayItem(item, itemType, itemId, userId);
        } else {
            showItemNotFound();
        }
    });
}

// Display the specific item
function displayItem(item, itemType, itemId, userId) {
    const contentArea = document.getElementById('content-area');

    if (itemType === 'note') {
        contentArea.innerHTML = `
            <div class="card">
                <h1 class="card-title">${item.title}</h1>
                <div class="note-content">${item.content}</div>
            </div>
        `;
    } else if (itemType === 'checklist') {
        contentArea.innerHTML = `
            <div class="card">
                <h1 class="card-title">${item.title}</h1>
                <div class="checkbox-list" id="checklist-items">
                    ${item.items.map((item, index) => `
                        <div class="checkbox-item ${item.checked ? 'checked' : ''}" data-index="${index}">
                            <input type="checkbox" ${item.checked ? 'checked' : ''}>
                            <span class="item-text">${item.text}</span>
                            <i class="fas fa-check saving-indicator"></i>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Add event listeners for checklist items in view mode
        const checklistContainer = document.getElementById('checklist-items');
        checklistContainer.querySelectorAll('.checkbox-item').forEach(rowEl => {
            const checkbox = rowEl.querySelector('input[type="checkbox"]');
            const savingIndicator = rowEl.querySelector('.saving-indicator');

            checkbox.addEventListener('change', async () => {
                const itemIndex = parseInt(rowEl.getAttribute('data-index'));
                const isChecked = checkbox.checked;

                // Update UI immediately
                rowEl.classList.toggle('checked', isChecked);

                // Show saving indicator
                savingIndicator.classList.add('show');

                // Show loader
                showLoader();

                try {
                    await toggleChecklistItem(itemId, itemIndex, isChecked, userId);

                    setTimeout(() => {
                        savingIndicator.classList.remove('show');
                    }, 1000);

                    // Check if ALL items are now checked
                    const allCheckboxes = checklistContainer.querySelectorAll('input[type="checkbox"]');
                    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);

                    if (allChecked && !item.isReusable) {
                        // One-time-use: show completion banner then delete
                        const card = document.querySelector('.card');
                        card.innerHTML = `
                            <div class="completion-banner">
                                <i class="fas fa-check-circle"></i>
                                <h2>All Done!</h2>
                                <p>This one-time checklist is complete and will be removed.</p>
                            </div>
                        `;
                        // Delete from Firebase after short delay
                        setTimeout(async () => {
                            const checklistRef = ref(database, `users/${userId}/checklists/${itemId}`);
                            await remove(checklistRef);
                            window.location.href = 'index.html';
                        }, 2200);
                    } else if (allChecked && item.isReusable) {
                        // Reusable: save completedAt, show reset banner, no delete
                        const completedAt = Date.now();
                        const checklistRef = ref(database, `users/${userId}/checklists/${itemId}`);
                        await update(checklistRef, { completedAt });

                        const freq = (item.reusableOptions && item.reusableOptions.frequency) || 'daily';
                        const resetLabel = getResetLabel(freq, completedAt);

                        const card = document.querySelector('.card');
                        card.innerHTML = `
                            <div class="completion-banner reusable">
                                <i class="fas fa-sync-alt"></i>
                                <h2>All Done!</h2>
                                <p>This checklist will automatically reset.</p>
                                <div class="reset-time"><i class="fas fa-clock"></i> Resets ${resetLabel}</div>
                            </div>
                        `;
                    } else {
                        showNotification('Checklist updated!', 'success');
                    }
                } catch (error) {
                    console.error('Save error:', error);
                    checkbox.checked = !isChecked;
                    rowEl.classList.toggle('checked', !isChecked);
                    showNotification('Failed to save changes: ' + error.message, 'error');
                } finally {
                    hideLoader();
                }
            });
        });
    }
}

// Toggle checklist item status in view mode - FIXED VERSION
function toggleChecklistItem(checklistId, itemIndex, isChecked, userId) {
    return new Promise((resolve, reject) => {
        try {
            const itemRef = ref(database, `users/${userId}/checklists/${checklistId}/items/${itemIndex}`);

            // Update the entire item to ensure proper structure
            update(itemRef, {
                checked: isChecked
            }).then(() => {
                resolve();
            }).catch(error => {
                reject(error);
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Show loader
function showLoader() {
    document.getElementById('loader').classList.add('active');
}

// Hide loader
function hideLoader() {
    document.getElementById('loader').classList.remove('active');
}

// Show notification
function showNotification(message, type) {
    // Remove any existing notifications first
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

// Display shared item in read-only mode
function displaySharedItem(item) {
    const contentArea = document.getElementById('content-area');
    const viewMode = item.viewMode || 'current';

    // ── CURRENT-LIVE: real-time Firebase stream ──────────────────────────
    if (viewMode === 'current-live') {
        // Cancel any previous listener
        if (_liveUnsub) { _liveUnsub(); _liveUnsub = null; }

        const { userId, itemId, type } = item;
        const itemRef = ref(database, `users/${userId}/${type}s/${itemId}`);

        // Show loading skeleton while first data arrives
        contentArea.innerHTML = `
            <div class="card" style="text-align:center;padding:40px;color:#aaa;">
                <i class="fas fa-spinner fa-spin" style="font-size:32px;margin-bottom:12px;display:block;"></i>
                Connecting to live data…
            </div>`;

        _liveUnsub = onValue(itemRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) { showItemNotFound(); return; }

            if (type === 'note') {
                contentArea.innerHTML = `
                    <div class="card">
                        <div class="view-mode-badge current live">
                            <div class="live-dot"></div> Live &bull; Current View
                        </div>
                        <h1 class="card-title">${escapeHtml(data.title)}</h1>
                        <div class="note-content">${escapeHtml(data.content || '')}</div>
                    </div>`;
            } else {
                // Checklist live current view
                contentArea.innerHTML = `
                    <div class="card">
                        <div class="view-mode-badge current live">
                            <div class="live-dot"></div> Live &bull; Current View
                        </div>
                        <h1 class="card-title">${escapeHtml(data.title)}</h1>
                        <div class="checkbox-list">
                            ${(data.items || []).map(ci => `
                                <div class="checkbox-item ${ci.checked ? 'checked' : ''}" style="cursor:default;pointer-events:none;">
                                    <input type="checkbox" ${ci.checked ? 'checked' : ''} disabled
                                        style="margin-right:12px;transform:scale(1.2);min-width:18px;">
                                    <span class="item-text">${escapeHtml(ci.text)}</span>
                                </div>`).join('')}
                        </div>
                    </div>`;
            }
        }, (error) => {
            // Firebase permission denied or network error
            contentArea.innerHTML = `
                <div class="permission-error">
                    <i class="fas fa-lock"></i>
                    <h2>Access Blocked by Firebase Rules</h2>
                    <p>To allow public sharing, update your Firebase Realtime Database rules to permit guest reads:</p>
                    <code>{
  &quot;rules&quot;: {
    &quot;users&quot;: {
      &quot;$uid&quot;: {
        &quot;.read&quot;: true,
        &quot;.write&quot;: &quot;auth.uid === $uid&quot;
      }
    }
  }
}</code>
                    <p style="font-size:12px;color:#999;margin-top:10px;">Set these rules in your Firebase Console &rarr; Realtime Database &rarr; Rules</p>
                </div>`;
        });
        return; // exit early — onValue handles all rendering
    }

    // ── STATIC PATHS (reference view / backward-compat static snapshots) ─
    if (item.type === 'note') {
        contentArea.innerHTML = `
            <div class="card">
                <div class="view-mode-badge current"><i class="fas fa-eye"></i> Current View</div>
                <h1 class="card-title">${escapeHtml(item.title)}</h1>
                <div class="note-content">${escapeHtml(item.content || '')}</div>
            </div>
        `;
    } else if (item.type === 'checklist') {
        if (viewMode !== 'reference') {
            // Static current view snapshot (backward compatibility)
            contentArea.innerHTML = `
                <div class="card">
                    <div class="view-mode-badge current"><i class="fas fa-eye"></i> Current View</div>
                    <h1 class="card-title">${escapeHtml(item.title)}</h1>
                    <div class="checkbox-list">
                        ${(item.items || []).map(ci => `
                            <div class="checkbox-item ${ci.checked ? 'checked' : ''}" style="cursor: default; pointer-events: none;">
                                <input type="checkbox" ${ci.checked ? 'checked' : ''} disabled style="margin-right: 12px; transform: scale(1.2); min-width: 18px;">
                                <span class="item-text">${escapeHtml(ci.text)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            // Reference View: interactive checkboxes backed by sessionStorage, nothing saves to DB
            const storageKey = 'ref_' + btoa(item.title).slice(0, 20);
            let saved = {};
            try { saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); } catch (e) { }

            contentArea.innerHTML = `
                <div class="card">
                    <div class="view-mode-badge reference"><i class="fas fa-list-check"></i> Reference View</div>
                    <h1 class="card-title">${escapeHtml(item.title)}</h1>
                    <div class="checkbox-list" id="ref-checklist">
                        ${(item.items || []).map((ci, idx) => {
                const isChecked = saved[idx] === true;
                return `
                                <div class="checkbox-item ${isChecked ? 'checked' : ''}" data-index="${idx}">
                                    <input type="checkbox" ${isChecked ? 'checked' : ''} style="margin-right: 12px; transform: scale(1.2); cursor: pointer; min-width: 18px;">
                                    <span class="item-text">${escapeHtml(ci.text)}</span>
                                </div>
                            `;
            }).join('')}
                    </div>
                    <div class="ref-notice"><i class="fas fa-info-circle"></i> Your progress is only kept while this tab is open. Refreshing resets all checkboxes.</div>
                </div>
            `;

            // Wire up interactive checkboxes with sessionStorage
            document.getElementById('ref-checklist').querySelectorAll('.checkbox-item').forEach(rowEl => {
                const cb = rowEl.querySelector('input[type="checkbox"]');
                cb.addEventListener('change', () => {
                    const idx = parseInt(rowEl.getAttribute('data-index'));
                    rowEl.classList.toggle('checked', cb.checked);
                    let state = {};
                    try { state = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); } catch (e) { }
                    state[idx] = cb.checked;
                    sessionStorage.setItem(storageKey, JSON.stringify(state));
                });
            });
        }
    } else {
        showItemNotFound();
    }
}

// Escape HTML to prevent XSS from shared links
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Show message when no item is selected
function showNoItemSelected() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-circle"></i>
            <h2>No Item Selected</h2>
            <p>Please go back to the main app and click "View" on a note or checklist.</p>
        </div>
    `;
}

// Show message when item is not found
function showItemNotFound() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-search"></i>
            <h2>Item Not Found</h2>
            <p>The requested note or checklist could not be found. It may have been deleted.</p>
        </div>
    `;
}

// Back button functionality
document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'index.html';
});

// Returns a human-readable reset label given frequency and completedAt timestamp
function getResetLabel(freq, completedAt) {
    const MS = { daily: 86400000, weekly: 604800000, monthly: 2592000000 };
    const duration = MS[freq];
    if (!duration) return 'on next use';
    const resetAt = new Date(completedAt + duration);
    return 'in ' + formatCountdown(resetAt - Date.now()) + ' (' + resetAt.toLocaleString() + ')';
}

// Formats milliseconds into a readable countdown string
function formatCountdown(ms) {
    if (ms <= 0) return 'shortly';
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        return days + ' day' + (days !== 1 ? 's' : '');
    }
    if (hours > 0) return hours + 'h ' + mins + 'm';
    return mins + 'm';
}
