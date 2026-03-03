// ============================================================
//  View Page JS — Authenticated view + shared link handling
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, get, onValue, update, remove } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";
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
const tokenParam = urlParams.get('token');
const sharedParam = urlParams.get('shared');

function setupSharedHeader() {
    document.getElementById('header-logo').innerHTML =
        '<img src="images/logo.png" alt="My Notes" class="logo-img"> <span class="shared-logo-sub">· shared</span>';
    document.getElementById('back-btn').style.display = 'none';
    document.getElementById('login-btn').style.display = 'flex';
    document.getElementById('signup-btn').style.display = 'flex';
}

if (tokenParam) {
    // Token-based share — look up in Firebase
    const tokenRef = ref(database, `shareTokens/${tokenParam}`);
    get(tokenRef).then(snapshot => {
        if (!snapshot.exists()) {
            showLinkExpired();
            return;
        }
        const tokenData = snapshot.val();
        let sharedItem;

        if (tokenData.viewMode === 'current-live') {
            sharedItem = {
                viewMode: 'current-live',
                type: tokenData.itemType,
                userId: tokenData.userId,
                itemId: tokenData.itemId
            };
        } else if (tokenData.viewMode === 'reference' && tokenData.referenceData) {
            sharedItem = {
                viewMode: 'reference',
                type: tokenData.itemType,
                title: tokenData.referenceData.title,
                items: tokenData.referenceData.items
            };
        } else {
            showLinkExpired();
            return;
        }

        displaySharedItem(sharedItem);
        setupSharedHeader();
    }).catch(error => {
        console.error('Token lookup error:', error);
        showLinkExpired();
    });
} else if (sharedParam) {
    // Legacy base64 share — backward compatibility
    try {
        const decoded = new TextDecoder().decode(Uint8Array.from(atob(decodeURIComponent(sharedParam)), c => c.charCodeAt(0)));
        const sharedItem = JSON.parse(decoded);
        displaySharedItem(sharedItem);
        setupSharedHeader();
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

    // Smart checklists are stored under a different path
    const pathMap = {
        note: 'notes',
        checklist: 'checklists',
        smartChecklist: 'smartChecklists'
    };
    const pathSegment = pathMap[itemType] || (itemType + 's');

    const itemRef = ref(database, `users/${userId}/${pathSegment}/${itemId}`);

    onValue(itemRef, (snapshot) => {
        const item = snapshot.val();
        if (item) {
            if (itemType === 'smartChecklist') {
                displaySmartChecklist(item, itemId, userId);
            } else {
                displayItem(item, itemType, itemId, userId);
            }
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

// Display smart day-based checklist — only today's items
function displaySmartChecklist(item, itemId, userId) {
    const contentArea = document.getElementById('content-area');
    const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = DAYS[new Date().getDay()];
    const todayLabel = DAY_LABELS[new Date().getDay()];

    // Get all items and filter for today
    const allItems = item.items || [];
    const todayItems = [];
    const todayIndices = [];
    allItems.forEach((it, idx) => {
        if (it.day === today) {
            todayItems.push(it);
            todayIndices.push(idx);
        }
    });

    if (todayItems.length === 0) {
        contentArea.innerHTML = `
            <div class="card">
                <div class="smart-view-header">
                    <h1 class="card-title">${item.title}</h1>
                    <div class="smart-day-indicator">
                        <i class="fas fa-calendar-day"></i> ${todayLabel}
                    </div>
                </div>
                <div class="empty-state" style="padding:30px;">
                    <i class="fas fa-moon" style="font-size:48px;color:#ccc;"></i>
                    <h2 style="margin-top:12px;">No items for today</h2>
                    <p>You have no tasks scheduled for ${todayLabel}.</p>
                </div>
                <div class="all-days-summary">
                    <h3 style="margin-bottom:10px;color:var(--primary);"><i class="fas fa-calendar-week"></i> Full Schedule</h3>
                    ${buildFullScheduleHTML(allItems, DAYS, DAY_LABELS, today)}
                </div>
            </div>
        `;
        return;
    }

    const checkedCount = todayItems.filter(i => i.checked).length;

    contentArea.innerHTML = `
        <div class="card">
            <div class="smart-view-header">
                <h1 class="card-title">${item.title}</h1>
                <div class="smart-day-indicator">
                    <i class="fas fa-calendar-day"></i> ${todayLabel}
                    <span class="smart-progress">${checkedCount}/${todayItems.length}</span>
                </div>
            </div>
            <div class="checkbox-list" id="smart-checklist-items">
                ${todayItems.map((ti, localIdx) => `
                    <div class="checkbox-item ${ti.checked ? 'checked' : ''}" data-real-index="${todayIndices[localIdx]}">
                        <input type="checkbox" ${ti.checked ? 'checked' : ''}>
                        <span class="item-text">${ti.text}</span>
                        ${ti.time && ti.time !== '00:00' ? `<span class="smart-item-time-badge"><i class="fas fa-clock"></i> ${formatTime12(ti.time)}</span>` : ''}
                        <i class="fas fa-check saving-indicator"></i>
                    </div>
                `).join('')}
            </div>
            <div class="all-days-summary" style="margin-top:20px;">
                <h3 style="margin-bottom:10px;color:var(--primary);"><i class="fas fa-calendar-week"></i> Full Schedule</h3>
                ${buildFullScheduleHTML(allItems, DAYS, DAY_LABELS, today)}
            </div>
        </div>
    `;

    // Wire up checkboxes
    const checklistContainer = document.getElementById('smart-checklist-items');
    checklistContainer.querySelectorAll('.checkbox-item').forEach(rowEl => {
        const checkbox = rowEl.querySelector('input[type="checkbox"]');
        const savingIndicator = rowEl.querySelector('.saving-indicator');

        checkbox.addEventListener('change', async () => {
            const realIndex = parseInt(rowEl.getAttribute('data-real-index'));
            const isChecked = checkbox.checked;

            rowEl.classList.toggle('checked', isChecked);
            savingIndicator.classList.add('show');
            showLoader();

            try {
                const itemRef = ref(database, `users/${userId}/smartChecklists/${itemId}/items/${realIndex}`);
                await update(itemRef, { checked: isChecked });

                setTimeout(() => {
                    savingIndicator.classList.remove('show');
                }, 1000);

                showNotification('Updated!', 'success');

                // Update progress display
                const allCbs = checklistContainer.querySelectorAll('input[type="checkbox"]');
                const nowChecked = Array.from(allCbs).filter(cb => cb.checked).length;
                document.querySelector('.smart-progress').textContent = `${nowChecked}/${allCbs.length}`;

                if (nowChecked === allCbs.length) {
                    showNotification('All done for today! Great job!', 'success');
                }
            } catch (error) {
                console.error('Save error:', error);
                checkbox.checked = !isChecked;
                rowEl.classList.toggle('checked', !isChecked);
                showNotification('Failed to save: ' + error.message, 'error');
            } finally {
                hideLoader();
            }
        });
    });
}

// Build a summary HTML of all days' items
function buildFullScheduleHTML(allItems, days, dayLabels, today) {
    let html = '<div class="schedule-grid">';
    days.forEach((day, i) => {
        const dayItems = allItems.filter(it => it.day === day);
        if (dayItems.length === 0) return;
        const isToday = day === today;
        html += `
            <div class="schedule-day ${isToday ? 'schedule-day-active' : ''}">
                <div class="schedule-day-name">${dayLabels[i]} ${isToday ? '<span class="schedule-today-tag">TODAY</span>' : ''}</div>
                <ul class="schedule-day-items">
                    ${dayItems.map(it => `<li>${it.text}${it.time && it.time !== '00:00' ? ` <small style="color:#999;">${formatTime12(it.time)}</small>` : ''}</li>`).join('')}
                </ul>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// Format 24h time to 12h
function formatTime12(time) {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
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
        // Map type to Firebase path
        const pathMap = { note: 'notes', checklist: 'checklists', smartChecklist: 'smartChecklists' };
        const pathSegment = pathMap[type] || (type + 's');
        const itemRef = ref(database, `users/${userId}/${pathSegment}/${itemId}`);

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
            } else if (type === 'smartChecklist') {
                // Smart checklist live view — show only today's items
                const DAYS_SC = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const DAY_LABELS_SC = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const todaySC = DAYS_SC[new Date().getDay()];
                const todayLabelSC = DAY_LABELS_SC[new Date().getDay()];
                const todayItemsSC = (data.items || []).filter(i => i.day === todaySC);
                const checkedSC = todayItemsSC.filter(i => i.checked).length;

                contentArea.innerHTML = `
                    <div class="card">
                        <div class="view-mode-badge current live">
                            <div class="live-dot"></div> Live &bull; Smart Checklist
                        </div>
                        <div class="smart-view-header">
                            <h1 class="card-title">${escapeHtml(data.title)}</h1>
                            <div class="smart-day-indicator">
                                <i class="fas fa-calendar-day"></i> ${todayLabelSC}
                                <span class="smart-progress">${checkedSC}/${todayItemsSC.length}</span>
                            </div>
                        </div>
                        <div class="checkbox-list">
                            ${todayItemsSC.length > 0 ? todayItemsSC.map(ci => `
                                <div class="checkbox-item ${ci.checked ? 'checked' : ''}" style="cursor:default;pointer-events:none;">
                                    <input type="checkbox" ${ci.checked ? 'checked' : ''} disabled
                                        style="margin-right:12px;transform:scale(1.2);min-width:18px;">
                                    <span class="item-text">${escapeHtml(ci.text)}</span>
                                    ${ci.time && ci.time !== '00:00' ? `<span class="smart-item-time-badge"><i class="fas fa-clock"></i> ${formatTime12(ci.time)}</span>` : ''}
                                </div>`).join('') : `
                                <div class="empty-state" style="padding:20px;">
                                    <i class="fas fa-moon" style="font-size:36px;color:#ccc;"></i>
                                    <p>No items for ${todayLabelSC}</p>
                                </div>`}
                        </div>
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

// Show message when share link is expired or revoked
function showLinkExpired() {
    setupSharedHeader();
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-link-slash"></i>
            <h2>Link Expired or Revoked</h2>
            <p>This share link is no longer active. The owner may have revoked it or generated a new one.</p>
        </div>
    `;
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
