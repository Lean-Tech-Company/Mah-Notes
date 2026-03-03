// ============================================================
//  Index Page JS — Main dashboard logic
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, set, get, onValue, push, update, remove } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Current quick entry type
let currentQuickType = 'note';
let currentEditingChecklistId = null;

// Check if user is logged in
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        document.getElementById('user-name').textContent = user.displayName || user.email;
        loadUserData(user.uid);
    } else {
        // User is signed out, redirect to login page
        window.location.href = 'login.html';
    }
});

// Load user data from Firebase
function loadUserData(userId) {
    showLoader();

    const notesRef = ref(database, 'users/' + userId + '/notes');
    onValue(notesRef, (snapshot) => {
        const notes = snapshot.val();
        displayNotes(notes);
        hideLoader();
    }, (error) => {
        console.error('Notes fetch error:', error);
        hideLoader();
        showFirebaseRulesWarning();
    });

    const checklistsRef = ref(database, 'users/' + userId + '/checklists');
    onValue(checklistsRef, (snapshot) => {
        const checklists = snapshot.val();
        checkAndResetReusableChecklists(userId, checklists);
        displayChecklists(checklists);
        hideLoader();
    }, (error) => {
        console.error('Checklists fetch error:', error);
        hideLoader();
    });

    const smartChecklistsRef = ref(database, 'users/' + userId + '/smartChecklists');
    onValue(smartChecklistsRef, (snapshot) => {
        const smartChecklists = snapshot.val();
        autoResetSmartChecklists(userId, smartChecklists);
        displaySmartChecklists(smartChecklists);
        hideLoader();
    }, (error) => {
        console.error('Smart checklists fetch error:', error);
        hideLoader();
    });
}

// Initialize type toggle
function initializeTypeToggle() {
    const typeOptions = document.querySelectorAll('.type-option');

    typeOptions.forEach(option => {
        option.addEventListener('click', () => {
            typeOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            currentQuickType = option.getAttribute('data-type');
            updatePlaceholderText();
        });
    });
}

// Update placeholder text based on current type
function updatePlaceholderText() {
    const textarea = document.getElementById('quick-entry-text');
    const placeholderText = document.getElementById('placeholder-text');

    if (currentQuickType === 'note') {
        textarea.placeholder = 'Type your note content here...';
        placeholderText.textContent = 'Enter your note content...';
    } else {
        textarea.placeholder = 'Type your checklist items here (one per line)...';
        placeholderText.textContent = 'Enter checklist items, one per line. Each line will become a checklist item.';
    }
}

// Display notes in the UI
function displayNotes(notes) {
    const notesList = document.getElementById('notes-list');
    notesList.innerHTML = '';

    if (!notes) {
        notesList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-sticky-note"></i>
                <p>No notes yet. Create your first note!</p>
            </div>
        `;
        return;
    }

    Object.keys(notes).forEach(key => {
        const note = notes[key];
        const noteElement = document.createElement('div');
        noteElement.className = 'note-item';
        noteElement.innerHTML = `
            <div class="note-title">
                <span class="note-title-text">${note.title}</span>
                <div class="note-actions">
                    <button class="action-btn view-btn" data-id="${key}" data-type="note">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="action-btn edit-note" data-id="${key}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="action-btn delete-note" data-id="${key}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                    <button class="action-btn share-btn share-note" data-id="${key}">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                </div>
            </div>
            <div class="note-content">${note.content}</div>
        `;
        notesList.appendChild(noteElement);
    });

    // Add event listeners for edit and delete buttons
    document.querySelectorAll('.edit-note').forEach(button => {
        button.addEventListener('click', (e) => {
            const noteId = e.target.closest('.action-btn').getAttribute('data-id');
            editNote(noteId, notes[noteId]);
        });
    });

    document.querySelectorAll('.delete-note').forEach(button => {
        button.addEventListener('click', (e) => {
            const noteId = e.target.closest('.action-btn').getAttribute('data-id');
            deleteNote(noteId);
        });
    });

    // Add event listeners for view buttons
    document.querySelectorAll('.view-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const itemId = e.target.closest('.action-btn').getAttribute('data-id');
            const itemType = e.target.closest('.action-btn').getAttribute('data-type');
            localStorage.setItem('viewItemId', itemId);
            localStorage.setItem('viewItemType', itemType);
            window.location.href = 'view.html';
        });
    });

    // Add event listeners for share buttons (notes)
    document.querySelectorAll('.share-note').forEach(button => {
        button.addEventListener('click', (e) => {
            const noteId = e.target.closest('.action-btn').getAttribute('data-id');
            shareItem('note', noteId, notes[noteId]);
        });
    });
}

// Display checklists in the UI (only titles)
function displayChecklists(checklists) {
    const checklistsList = document.getElementById('checklists-list');
    checklistsList.innerHTML = '';

    if (!checklists) {
        checklistsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-list-check"></i>
                <p>No checklists yet. Create your first checklist!</p>
            </div>
        `;
        return;
    }

    Object.keys(checklists).forEach(key => {
        const checklist = checklists[key];
        const checklistElement = document.createElement('div');
        checklistElement.className = 'note-item';
        checklistElement.innerHTML = `
            <div class="note-title">
                <span class="note-title-text">${checklist.title}${checklist.isReusable ? ' <span class="reusable-badge"><i class="fas fa-sync-alt"></i> Reusable</span>' : ''}</span>
                <div class="note-actions">
                    <button class="action-btn view-btn" data-id="${key}" data-type="checklist">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="action-btn edit-checklist" data-id="${key}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="action-btn delete-checklist" data-id="${key}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                    <button class="action-btn share-btn share-checklist" data-id="${key}">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                </div>
            </div>
        `;
        checklistsList.appendChild(checklistElement);

        // Add event listeners for view buttons
        const viewButton = checklistElement.querySelector('.view-btn');
        viewButton.addEventListener('click', (e) => {
            const itemId = e.target.closest('.action-btn').getAttribute('data-id');
            const itemType = e.target.closest('.action-btn').getAttribute('data-type');

            // Store which item to view in localStorage
            localStorage.setItem('viewItemId', itemId);
            localStorage.setItem('viewItemType', itemType);

            // Redirect to view page
            window.location.href = 'view.html';
        });
    });

    // Add event listeners for edit and delete buttons
    document.querySelectorAll('.edit-checklist').forEach(button => {
        button.addEventListener('click', (e) => {
            const checklistId = e.target.closest('.action-btn').getAttribute('data-id');
            editChecklist(checklistId, checklists[checklistId]);
        });
    });

    document.querySelectorAll('.delete-checklist').forEach(button => {
        button.addEventListener('click', (e) => {
            const checklistId = e.target.closest('.action-btn').getAttribute('data-id');
            deleteChecklist(checklistId);
        });
    });

    // Add event listeners for share buttons (checklists)
    document.querySelectorAll('.share-checklist').forEach(button => {
        button.addEventListener('click', (e) => {
            const checklistId = e.target.closest('.action-btn').getAttribute('data-id');
            shareItem('checklist', checklistId, checklists[checklistId]);
        });
    });
}

// Create new note
document.getElementById('new-note-btn').addEventListener('click', () => {
    document.getElementById('note-modal').style.display = 'flex';
    // Reset form
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
    const saveButton = document.getElementById('save-note');
    saveButton.textContent = 'Save Note';
    saveButton.innerHTML = '<i class="fas fa-save"></i> Save Note';
    saveButton.onclick = saveNewNote;
});

document.getElementById('close-note-modal').addEventListener('click', () => {
    document.getElementById('note-modal').style.display = 'none';
});

function saveNewNote() {
    const title = document.getElementById('note-title').value;
    const content = document.getElementById('note-content').value;

    if (title && content) {
        saveNote(title, content);
        document.getElementById('note-modal').style.display = 'none';
        document.getElementById('note-title').value = '';
        document.getElementById('note-content').value = '';
        showNotification('Note saved successfully!', 'success');
    } else {
        showNotification('Please fill in both title and content', 'error');
    }
}

function saveNote(title, content) {
    const userId = auth.currentUser.uid;
    const notesRef = ref(database, 'users/' + userId + '/notes');
    const newNoteRef = push(notesRef);
    set(newNoteRef, {
        title,
        content,
        createdAt: new Date().toISOString()
    });
}

// Edit note
function editNote(noteId, note) {
    document.getElementById('note-title').value = note.title;
    document.getElementById('note-content').value = note.content;
    document.getElementById('note-modal').style.display = 'flex';

    // Change save button to update
    const saveButton = document.getElementById('save-note');
    saveButton.textContent = 'Update Note';
    saveButton.innerHTML = '<i class="fas fa-save"></i> Update Note';
    saveButton.onclick = () => {
        const title = document.getElementById('note-title').value;
        const content = document.getElementById('note-content').value;

        if (title && content) {
            updateNote(noteId, title, content);
            document.getElementById('note-modal').style.display = 'none';
            document.getElementById('note-title').value = '';
            document.getElementById('note-content').value = '';
            saveButton.textContent = 'Save Note';
            saveButton.innerHTML = '<i class="fas fa-save"></i> Save Note';
            saveButton.onclick = saveNewNote;
            showNotification('Note updated successfully!', 'success');
        } else {
            showNotification('Please fill in both title and content', 'error');
        }
    };
}

function updateNote(noteId, title, content) {
    const userId = auth.currentUser.uid;
    const noteRef = ref(database, `users/${userId}/notes/${noteId}`);
    update(noteRef, {
        title,
        content,
        updatedAt: new Date().toISOString()
    });
}

// Delete note
function deleteNote(noteId) {
    if (confirm('Are you sure you want to delete this note?')) {
        const userId = auth.currentUser.uid;
        const noteRef = ref(database, `users/${userId}/notes/${noteId}`);
        remove(noteRef);
        cleanupShareTokens(userId, noteId);
        showNotification('Note deleted successfully!', 'success');
    }
}

// Create new checklist
document.getElementById('new-checklist-btn').addEventListener('click', () => {
    document.getElementById('checklist-modal').style.display = 'flex';
    // Reset form and state
    document.getElementById('checklist-title').value = '';
    document.getElementById('checklist-items').value = '';
    document.getElementById('reusable-no').checked = true;
    document.getElementById('reusable-options').style.display = 'none';
    document.getElementById('reuse-frequency').value = 'daily';
    document.getElementById('days-selector-container').style.display = 'none';
    document.querySelectorAll('.day-checkbox').forEach(cb => cb.checked = false);
    currentEditingChecklistId = null;

    const saveButton = document.getElementById('save-checklist');
    saveButton.textContent = 'Save Checklist';
    saveButton.innerHTML = '<i class="fas fa-save"></i> Save Checklist';
    saveButton.onclick = saveNewChecklist;
});

document.getElementById('close-checklist-modal').addEventListener('click', () => {
    document.getElementById('checklist-modal').style.display = 'none';
    currentEditingChecklistId = null;
});

// Toggle reusable options
document.querySelectorAll('input[name="reusable"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const reusableOptions = document.getElementById('reusable-options');
        if (document.getElementById('reusable-yes').checked) {
            reusableOptions.style.display = 'block';
            // Show/hide days based on current frequency
            const freq = document.getElementById('reuse-frequency').value;
            document.getElementById('days-selector-container').style.display = freq === 'weekly' ? 'block' : 'none';
        } else {
            reusableOptions.style.display = 'none';
        }
    });
});

// Toggle days selector based on frequency
document.getElementById('reuse-frequency').addEventListener('change', () => {
    const frequency = document.getElementById('reuse-frequency').value;
    document.getElementById('days-selector-container').style.display = frequency === 'weekly' ? 'block' : 'none';
});

function saveNewChecklist() {
    const title = document.getElementById('checklist-title').value;
    const itemsText = document.getElementById('checklist-items').value;

    if (title && itemsText) {
        const items = itemsText.split('\n')
            .filter(item => item.trim() !== '')
            .map(item => ({ text: item.trim(), checked: false }));

        const isReusable = document.getElementById('reusable-yes').checked;
        let reusableOptions = null;

        if (isReusable) {
            const frequency = document.getElementById('reuse-frequency').value;
            const selectedDays = [];
            document.querySelectorAll('.day-checkbox:checked').forEach(checkbox => {
                selectedDays.push(checkbox.value);
            });

            reusableOptions = {
                frequency,
                days: selectedDays
            };
        }

        saveChecklist(title, items, isReusable, reusableOptions);
        document.getElementById('checklist-modal').style.display = 'none';
        document.getElementById('checklist-title').value = '';
        document.getElementById('checklist-items').value = '';
        showNotification('Checklist saved successfully!', 'success');
    } else {
        showNotification('Please fill in both title and items', 'error');
    }
}

function saveChecklist(title, items, isReusable, reusableOptions) {
    const userId = auth.currentUser.uid;
    const checklistsRef = ref(database, 'users/' + userId + '/checklists');
    const newChecklistRef = push(checklistsRef);
    set(newChecklistRef, {
        title,
        items,
        isReusable,
        reusableOptions,
        createdAt: new Date().toISOString()
    });
}

// Edit checklist - FIXED VERSION
function editChecklist(checklistId, checklist) {
    if (!checklist) return;
    document.getElementById('checklist-title').value = checklist.title;
    document.getElementById('checklist-items').value = checklist.items.map(item => item.text).join('\n');

    if (checklist.isReusable && checklist.reusableOptions) {
        document.getElementById('reusable-yes').checked = true;
        document.getElementById('reusable-options').style.display = 'block';
        document.getElementById('reuse-frequency').value = checklist.reusableOptions.frequency || 'daily';

        // Show/hide days selector based on frequency
        const freq = checklist.reusableOptions.frequency || 'daily';
        document.getElementById('days-selector-container').style.display = freq === 'weekly' ? 'block' : 'none';

        // Reset day checkboxes
        document.querySelectorAll('.day-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });

        // Check the appropriate days
        (checklist.reusableOptions.days || []).forEach(day => {
            const dayEl = document.getElementById(`day-${day}`);
            if (dayEl) dayEl.checked = true;
        });
    } else {
        document.getElementById('reusable-no').checked = true;
        document.getElementById('reusable-options').style.display = 'none';
    }

    document.getElementById('checklist-modal').style.display = 'flex';
    currentEditingChecklistId = checklistId;

    // Change save button to update
    const saveButton = document.getElementById('save-checklist');
    saveButton.textContent = 'Update Checklist';
    saveButton.innerHTML = '<i class="fas fa-save"></i> Update Checklist';
    saveButton.onclick = updateExistingChecklist;
}

function updateExistingChecklist() {
    const title = document.getElementById('checklist-title').value;
    const itemsText = document.getElementById('checklist-items').value;

    if (!title || !itemsText) {
        showNotification('Please fill in both title and items', 'error');
        return;
    }

    const items = itemsText.split('\n')
        .filter(item => item.trim() !== '')
        .map(item => ({ text: item.trim(), checked: false }));

    const isReusable = document.getElementById('reusable-yes').checked;
    let reusableOptions = null;

    if (isReusable) {
        const frequency = document.getElementById('reuse-frequency').value;
        const selectedDays = [];
        document.querySelectorAll('.day-checkbox:checked').forEach(checkbox => {
            selectedDays.push(checkbox.value);
        });

        reusableOptions = {
            frequency,
            days: selectedDays
        };
    }

    updateChecklist(currentEditingChecklistId, title, items, isReusable, reusableOptions);
    document.getElementById('checklist-modal').style.display = 'none';
    document.getElementById('checklist-title').value = '';
    document.getElementById('checklist-items').value = '';

    const saveButton = document.getElementById('save-checklist');
    saveButton.textContent = 'Save Checklist';
    saveButton.innerHTML = '<i class="fas fa-save"></i> Save Checklist';
    saveButton.onclick = saveNewChecklist;

    currentEditingChecklistId = null;
    showNotification('Checklist updated successfully!', 'success');
}

function updateChecklist(checklistId, title, items, isReusable, reusableOptions) {
    const userId = auth.currentUser.uid;
    const checklistRef = ref(database, `users/${userId}/checklists/${checklistId}`);
    update(checklistRef, {
        title,
        items,
        isReusable,
        reusableOptions,
        updatedAt: new Date().toISOString()
    });
}

// Delete checklist
function deleteChecklist(checklistId) {
    if (confirm('Are you sure you want to delete this checklist?')) {
        const userId = auth.currentUser.uid;
        const checklistRef = ref(database, `users/${userId}/checklists/${checklistId}`);
        remove(checklistRef);
        cleanupShareTokens(userId, checklistId);
        showNotification('Checklist deleted successfully!', 'success');
    }
}

// Quick entry functionality
const quickEntryText = document.getElementById('quick-entry-text');
const quickEntryActions = document.getElementById('quick-entry-actions');

quickEntryText.addEventListener('input', () => {
    if (quickEntryText.value.trim() !== '') {
        quickEntryActions.style.display = 'flex';
    } else {
        quickEntryActions.style.display = 'none';
    }
});

document.getElementById('discard-quick-entry').addEventListener('click', () => {
    quickEntryText.value = '';
    quickEntryActions.style.display = 'none';
});

document.getElementById('save-quick-entry').addEventListener('click', () => {
    if (quickEntryText.value.trim() !== '') {
        showSaveQuickModal(currentQuickType, quickEntryText.value);
    }
});

// Initialize type toggle on page load
initializeTypeToggle();
updatePlaceholderText();

// Show modal for saving quick entries
function showSaveQuickModal(type, content) {
    const modal = document.getElementById('save-quick-modal');
    const destinationList = document.getElementById('destination-list');
    destinationList.innerHTML = '';

    // Get existing titles for the selected type
    const userId = auth.currentUser.uid;
    const refPath = `users/${userId}/${type === 'note' ? 'notes' : 'checklists'}`;
    const dataRef = ref(database, refPath);

    onValue(dataRef, (snapshot) => {
        const data = snapshot.val();
        destinationList.innerHTML = '';

        if (data) {
            Object.keys(data).forEach(key => {
                const item = data[key];
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `dest-${key}`;
                checkbox.value = key;

                const label = document.createElement('label');
                label.htmlFor = `dest-${key}`;
                label.textContent = item.title;
                label.style.marginLeft = '8px';

                const div = document.createElement('div');
                div.style.marginBottom = '10px';
                div.appendChild(checkbox);
                div.appendChild(label);

                destinationList.appendChild(div);
            });
        } else {
            destinationList.innerHTML = `<p>No existing ${type === 'note' ? 'notes' : 'checklists'} found. Create one first!</p>`;
        }

        // Show the modal
        modal.style.display = 'flex';

        // Set up the confirm button
        document.getElementById('confirm-save-quick').onclick = () => {
            const selectedDestinations = Array.from(destinationList.querySelectorAll('input:checked'))
                .map(checkbox => checkbox.value);

            if (selectedDestinations.length > 0) {
                saveQuickContent(type, content, selectedDestinations);
                modal.style.display = 'none';

                // Clear the quick input
                quickEntryText.value = '';
                quickEntryActions.style.display = 'none';

                showNotification('Quick entry saved successfully!', 'success');
            } else {
                showNotification('Please select at least one destination', 'error');
            }
        };
    }, { onlyOnce: true });
}

document.getElementById('close-save-quick-modal').addEventListener('click', () => {
    document.getElementById('save-quick-modal').style.display = 'none';
});

function saveQuickContent(type, content, destinationIds) {
    const userId = auth.currentUser.uid;

    destinationIds.forEach(destId => {
        if (type === 'note') {
            // For notes, we'll append the quick note to the existing content
            const noteRef = ref(database, `users/${userId}/notes/${destId}`);
            onValue(noteRef, (snapshot) => {
                const note = snapshot.val();
                if (note) {
                    const updatedContent = note.content + '\n\n' + content;
                    update(noteRef, {
                        content: updatedContent,
                        updatedAt: new Date().toISOString()
                    });
                }
            }, { onlyOnce: true });
        } else {
            // For checklists, we'll add the quick items as new checklist items
            const checklistRef = ref(database, `users/${userId}/checklists/${destId}`);
            onValue(checklistRef, (snapshot) => {
                const checklist = snapshot.val();
                if (checklist) {
                    const newItems = content.split('\n')
                        .filter(item => item.trim() !== '')
                        .map(item => ({ text: item.trim(), checked: false }));

                    const updatedItems = [...checklist.items, ...newItems];
                    update(checklistRef, {
                        items: updatedItems,
                        updatedAt: new Date().toISOString()
                    });
                }
            }, { onlyOnce: true });
        }
    });
}

// View page button
document.getElementById('view-page-btn').addEventListener('click', () => {
    window.location.href = 'view.html';
});

// Logout functionality
document.getElementById('logout-btn').addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error('Logout error:', error);
        showNotification('Error during logout', 'error');
    });
});

// Show loader
function showLoader() {
    document.getElementById('loader').classList.add('active');
}

// Hide loader
function hideLoader() {
    document.getElementById('loader').classList.remove('active');
}

// Notification function
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Firebase auth warning banner (authorized domain missing)
function showFirebaseRulesWarning() {
    if (document.getElementById('firebase-rules-banner')) return; // only show once
    const banner = document.createElement('div');
    banner.id = 'firebase-rules-banner';
    banner.style.cssText = `
        background:#fff3cd;border:1px solid #ffc107;color:#856404;
        padding:12px 16px;border-radius:10px;margin-bottom:12px;
        font-size:13px;line-height:1.6;
    `;
    banner.innerHTML = `
        <strong><i class="fas fa-exclamation-triangle"></i> Data not loading on GitHub Pages?</strong><br>
        Firebase is blocking sign-ins because <code>lean-tech-company.github.io</code> is not an authorized domain.<br>
        Fix: <a href="https://console.firebase.google.com" target="_blank" style="color:#0d6efd;">Firebase Console</a>
        → <b>Authentication → Settings → Authorized domains → Add domain</b> → enter <code>lean-tech-company.github.io</code>
    `;
    const container = document.querySelector('.container');
    if (container) container.prepend(banner);
}

// ── Share Token System ─────────────────────────────────────────

// Generate a short random token
function generateToken(length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    for (let i = 0; i < length; i++) {
        result += chars[arr[i] % chars.length];
    }
    return result;
}

// Get or create a share token for a specific item + viewMode
async function getOrCreateToken(userId, itemId, itemType, viewMode, item) {
    const tokenKey = `${itemId}_${viewMode}`;
    const userTokenRef = ref(database, `users/${userId}/shareTokens/${tokenKey}`);

    const snapshot = await get(userTokenRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        // Verify the public token still exists
        const publicRef = ref(database, `shareTokens/${data.token}`);
        const pubSnap = await get(publicRef);
        if (pubSnap.exists()) {
            return data.token;
        }
    }

    // Create new token
    const token = generateToken(10);
    const tokenData = {
        userId,
        itemId,
        itemType,
        viewMode,
        createdAt: Date.now()
    };

    if (viewMode === 'reference') {
        tokenData.referenceData = {
            title: item.title,
            items: (item.items || []).map(i => ({ text: i.text, checked: false }))
        };
    }

    await set(ref(database, `shareTokens/${token}`), tokenData);
    await set(userTokenRef, {
        token,
        itemType,
        viewMode,
        createdAt: Date.now()
    });

    return token;
}

// Clean up all share tokens when an item is deleted
async function cleanupShareTokens(userId, itemId) {
    const modes = ['current-live', 'reference'];
    for (const mode of modes) {
        const tokenKey = `${itemId}_${mode}`;
        const userTokenRef = ref(database, `users/${userId}/shareTokens/${tokenKey}`);
        const snap = await get(userTokenRef);
        if (snap.exists()) {
            const { token } = snap.val();
            await remove(ref(database, `shareTokens/${token}`));
            await remove(userTokenRef);
        }
    }
}

// Share item — creates tokens and shows the share modal
async function shareItem(itemType, itemId, item) {
    if (!item) {
        showNotification('Item not found', 'error');
        return;
    }

    const baseUrl = window.location.href.split('?')[0].replace(/[^\/]*$/, '') + 'view.html?token=';
    const userId = auth.currentUser.uid;

    const container = document.getElementById('share-links-container');
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;"><i class="fas fa-spinner fa-spin"></i> Loading share links…</div>';
    document.getElementById('share-modal').style.display = 'flex';

    try {
        if (itemType === 'note') {
            const token = await getOrCreateToken(userId, itemId, itemType, 'current-live', item);
            container.innerHTML = buildShareCard(
                'current', baseUrl + token, token,
                '<i class="fas fa-eye"></i> Current View',
                'Viewer sees your note in real-time. Any edits you make appear instantly on their screen.',
                userId, itemId, 'current-live'
            );
        } else {
            const currentToken = await getOrCreateToken(userId, itemId, itemType, 'current-live', item);
            const refToken = await getOrCreateToken(userId, itemId, itemType, 'reference', item);
            container.innerHTML =
                buildShareCard('current', baseUrl + currentToken, currentToken,
                    '<i class="fas fa-circle" style="color:#2ecc71;font-size:10px;"></i> Current View',
                    'Viewer sees your live progress in real-time. Checked items appear crossed out as you check them.',
                    userId, itemId, 'current-live') +
                buildShareCard('reference', baseUrl + refToken, refToken,
                    '<i class="fas fa-list-check"></i> Reference View',
                    'Viewer gets a blank template they can check off themselves. Resets on page refresh — nothing saves.',
                    userId, itemId, 'reference');
        }
    } catch (error) {
        console.error('Share token error:', error);
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);"><i class="fas fa-exclamation-triangle"></i> Failed to generate share links. Try again.</div>';
    }
}

function buildShareCard(mode, url, token, titleHtml, desc, userId, itemId, viewMode) {
    const accent = mode === 'reference' ? 'var(--accent)' : 'var(--primary)';
    return `
        <div class="share-view-card" id="share-card-${token}">
            <div class="share-view-title" style="color: ${accent};">${titleHtml}</div>
            <div class="share-view-desc">${desc}</div>
            <div class="share-copy-row">
                <input type="text" class="share-link-input" value="${url}" readonly>
                <button class="btn btn-success share-copy-btn" onclick="copyShareLink(this)">
                    <i class="fas fa-copy"></i> Copy
                </button>
            </div>
            <div class="share-token-actions">
                <button class="btn btn-sm btn-outline-danger" onclick="revokeShareToken('${token}','${userId}','${itemId}','${viewMode}')">
                    <i class="fas fa-ban"></i> Revoke
                </button>
                <button class="btn btn-sm btn-outline-warning" onclick="regenerateShareToken('${token}','${userId}','${itemId}','${viewMode}')">
                    <i class="fas fa-sync-alt"></i> New Link
                </button>
            </div>
        </div>
    `;
}

// Expose globally so inline onclick works inside module
window.copyShareLink = function (btn) {
    const input = btn.closest('.share-copy-row').querySelector('.share-link-input');
    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(input.value).then(() => {
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 2000);
    }).catch(() => {
        document.execCommand('copy');
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 2000);
    });
};

window.revokeShareToken = async function(token, userId, itemId, viewMode) {
    if (!confirm('Revoke this share link? Anyone with this link will lose access.')) return;
    try {
        const tokenKey = `${itemId}_${viewMode}`;
        await remove(ref(database, `shareTokens/${token}`));
        await remove(ref(database, `users/${userId}/shareTokens/${tokenKey}`));
        const card = document.getElementById(`share-card-${token}`);
        if (card) {
            card.innerHTML = '<div class="share-revoked-notice"><i class="fas fa-ban"></i> Link revoked</div>';
        }
        showNotification('Share link revoked!', 'success');
    } catch (error) {
        console.error('Revoke error:', error);
        showNotification('Failed to revoke link', 'error');
    }
};

window.regenerateShareToken = async function(token, userId, itemId, viewMode) {
    try {
        const tokenKey = `${itemId}_${viewMode}`;
        const oldSnap = await get(ref(database, `shareTokens/${token}`));
        const oldData = oldSnap.exists() ? oldSnap.val() : null;

        // Remove old token
        await remove(ref(database, `shareTokens/${token}`));

        // Generate new
        const newToken = generateToken(10);
        const tokenData = {
            userId,
            itemId,
            itemType: oldData ? oldData.itemType : 'checklist',
            viewMode,
            createdAt: Date.now()
        };
        if (oldData && oldData.referenceData) {
            tokenData.referenceData = oldData.referenceData;
        }

        await set(ref(database, `shareTokens/${newToken}`), tokenData);
        await set(ref(database, `users/${userId}/shareTokens/${tokenKey}`), {
            token: newToken,
            itemType: tokenData.itemType,
            viewMode,
            createdAt: Date.now()
        });

        // Update UI
        const baseUrl = window.location.href.split('?')[0].replace(/[^\/]*$/, '') + 'view.html?token=';
        const card = document.getElementById(`share-card-${token}`);
        if (card) {
            card.id = `share-card-${newToken}`;
            const input = card.querySelector('.share-link-input');
            if (input) input.value = baseUrl + newToken;
            const revokeBtn = card.querySelector('.btn-outline-danger');
            const regenBtn = card.querySelector('.btn-outline-warning');
            if (revokeBtn) revokeBtn.setAttribute('onclick', `revokeShareToken('${newToken}','${userId}','${itemId}','${viewMode}')`);
            if (regenBtn) regenBtn.setAttribute('onclick', `regenerateShareToken('${newToken}','${userId}','${itemId}','${viewMode}')`);
        }
        showNotification('New share link generated!', 'success');
    } catch (error) {
        console.error('Regenerate error:', error);
        showNotification('Failed to generate new link', 'error');
    }
};

// Close share modal
document.getElementById('close-share-modal').addEventListener('click', () => {
    document.getElementById('share-modal').style.display = 'none';
});

// Auto-reset reusable checklists based on time elapsed since completion
function checkAndResetReusableChecklists(userId, checklists) {
    if (!checklists) return;
    const now = Date.now();
    // Duration in ms for each frequency
    const RESET_DURATION = {
        daily: 24 * 60 * 60 * 1000,       // 24 hours
        weekly: 7 * 24 * 60 * 60 * 1000,  // 7 days
        monthly: 30 * 24 * 60 * 60 * 1000   // 30 days
    };

    Object.keys(checklists).forEach(key => {
        const checklist = checklists[key];
        if (!checklist.isReusable || !checklist.reusableOptions) return;

        const freq = checklist.reusableOptions.frequency;
        const duration = RESET_DURATION[freq];
        if (!duration) return; // 'infinite' — never auto-resets

        // Only reset if the checklist was actually completed (completedAt set)
        const completedAt = checklist.completedAt;
        if (!completedAt) return;

        // Check if enough time has passed since completion
        if (now - completedAt >= duration) {
            const resetItems = checklist.items.map(item => ({ text: item.text, checked: false }));
            const checklistRef = ref(database, `users/${userId}/checklists/${key}`);
            update(checklistRef, {
                items: resetItems,
                completedAt: null,
                lastResetDate: new Date().toISOString()
            });
        }
    });
}

// ═══════════════════════════════════════════════════════════════
//  SMART DAY-BASED CHECKLIST FEATURE
// ═══════════════════════════════════════════════════════════════

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getTodayName() {
    return DAYS_OF_WEEK[new Date().getDay()];
}

function getTodayDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// -- Smart Checklist Modal Logic (Day-Tab Interface) --

let currentEditingSmartId = null;
// Stores items per day while the modal is open: { monday: ['item1','item2'], ... }
let smartDayData = {};
let smartActiveDay = null;

const SMART_DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SMART_DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const SMART_DAY_FULL  = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

function resetSmartModal() {
    smartDayData = {};
    smartActiveDay = null;
    document.getElementById('smart-checklist-title').value = '';
    document.getElementById('smart-day-editor').style.display = 'none';
    document.getElementById('smart-day-items').value = '';
    renderSmartTabs();
    renderSmartSetTabs();
}

function renderSmartTabs() {
    document.querySelectorAll('#smart-day-tabs .smart-day-tab').forEach(tab => {
        const day = tab.getAttribute('data-day');
        tab.classList.toggle('active', day === smartActiveDay);
        tab.classList.toggle('has-items', !!(smartDayData[day] && smartDayData[day].length > 0));
    });
}

function renderSmartSetTabs() {
    const container = document.getElementById('smart-set-tabs');
    container.innerHTML = '';
    SMART_DAY_ORDER.forEach(day => {
        if (smartDayData[day] && smartDayData[day].length > 0) {
            const tab = document.createElement('div');
            tab.className = 'smart-set-tab';
            tab.innerHTML = `
                ${SMART_DAY_SHORT[day]}
                <span class="set-tab-count">${smartDayData[day].length}</span>
                <span class="set-tab-close" data-day="${day}" title="Remove ${SMART_DAY_SHORT[day]}">&times;</span>
            `;
            // Clicking the tab opens that day for editing
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('set-tab-close')) return;
                openSmartDayEditor(day);
            });
            // Close button clears that day
            tab.querySelector('.set-tab-close').addEventListener('click', (e) => {
                e.stopPropagation();
                delete smartDayData[day];
                if (smartActiveDay === day) {
                    smartActiveDay = null;
                    document.getElementById('smart-day-editor').style.display = 'none';
                }
                renderSmartTabs();
                renderSmartSetTabs();
            });
            container.appendChild(tab);
        }
    });
}

function openSmartDayEditor(day) {
    // Save current editor content before switching
    saveCurrentDayEditorSilently();
    smartActiveDay = day;
    const editor = document.getElementById('smart-day-editor');
    editor.style.display = 'block';
    document.getElementById('smart-day-editor-label').innerHTML = `<i class="fas fa-calendar-day"></i> ${SMART_DAY_FULL[day]}`;
    document.getElementById('smart-day-items').value = (smartDayData[day] || []).join('\n');
    document.getElementById('smart-day-items').focus();
    renderSmartTabs();
}

function saveCurrentDayEditorSilently() {
    if (!smartActiveDay) return;
    const text = document.getElementById('smart-day-items').value;
    const lines = text.split('\n').filter(l => l.trim() !== '');
    if (lines.length > 0) {
        smartDayData[smartActiveDay] = lines;
    } else {
        delete smartDayData[smartActiveDay];
    }
}

// Click a day tab
document.getElementById('smart-day-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.smart-day-tab');
    if (!tab) return;
    const day = tab.getAttribute('data-day');
    openSmartDayEditor(day);
});

// "Set" button — saves current day and collapses editor
document.getElementById('smart-day-set-btn').addEventListener('click', () => {
    if (!smartActiveDay) return;
    const text = document.getElementById('smart-day-items').value;
    const lines = text.split('\n').filter(l => l.trim() !== '');
    if (lines.length === 0) {
        delete smartDayData[smartActiveDay];
    } else {
        smartDayData[smartActiveDay] = lines;
    }
    smartActiveDay = null;
    document.getElementById('smart-day-editor').style.display = 'none';
    renderSmartTabs();
    renderSmartSetTabs();
    showNotification('Day set!', 'success');
});

// "Clear" button — clears current day
document.getElementById('smart-day-clear').addEventListener('click', () => {
    if (!smartActiveDay) return;
    delete smartDayData[smartActiveDay];
    document.getElementById('smart-day-items').value = '';
    smartActiveDay = null;
    document.getElementById('smart-day-editor').style.display = 'none';
    renderSmartTabs();
    renderSmartSetTabs();
});

// Open modal for new smart checklist
document.getElementById('new-smart-checklist-btn').addEventListener('click', () => {
    resetSmartModal();
    currentEditingSmartId = null;
    document.getElementById('smart-checklist-modal').style.display = 'flex';

    const saveBtn = document.getElementById('save-smart-checklist');
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Smart Checklist';
    saveBtn.onclick = saveNewSmartChecklist;
});

// Close modal
document.getElementById('close-smart-checklist-modal').addEventListener('click', () => {
    document.getElementById('smart-checklist-modal').style.display = 'none';
    currentEditingSmartId = null;
});

// Collect all items from smartDayData into a flat array
function collectSmartItems() {
    const items = [];
    SMART_DAY_ORDER.forEach(day => {
        (smartDayData[day] || []).forEach(text => {
            items.push({ text: text.trim(), day, time: '00:00', checked: false });
        });
    });
    return items;
}

// Save new smart checklist
function saveNewSmartChecklist() {
    // Save any unsaved active editor content
    saveCurrentDayEditorSilently();
    renderSmartSetTabs();

    const title = document.getElementById('smart-checklist-title').value.trim();
    if (!title) {
        showNotification('Please enter a title', 'error');
        return;
    }

    const items = collectSmartItems();
    if (items.length === 0) {
        showNotification('Please set items for at least one day', 'error');
        return;
    }

    const userId = auth.currentUser.uid;
    const smartRef = ref(database, 'users/' + userId + '/smartChecklists');
    const newRef = push(smartRef);
    set(newRef, {
        title,
        items,
        lastResetDate: getTodayDateString(),
        createdAt: new Date().toISOString()
    });

    document.getElementById('smart-checklist-modal').style.display = 'none';
    showNotification('Smart checklist saved!', 'success');
}

// Edit smart checklist — populate day data from existing items
function editSmartChecklist(id, checklist) {
    if (!checklist) return;
    resetSmartModal();
    currentEditingSmartId = id;
    document.getElementById('smart-checklist-title').value = checklist.title;

    // Group items by day
    (checklist.items || []).forEach(item => {
        if (!smartDayData[item.day]) smartDayData[item.day] = [];
        smartDayData[item.day].push(item.text);
    });

    renderSmartTabs();
    renderSmartSetTabs();
    document.getElementById('smart-checklist-modal').style.display = 'flex';

    const saveBtn = document.getElementById('save-smart-checklist');
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Update Smart Checklist';
    saveBtn.onclick = updateExistingSmartChecklist;
}

function updateExistingSmartChecklist() {
    saveCurrentDayEditorSilently();
    renderSmartSetTabs();

    const title = document.getElementById('smart-checklist-title').value.trim();
    if (!title) {
        showNotification('Please enter a title', 'error');
        return;
    }

    const items = collectSmartItems();
    if (items.length === 0) {
        showNotification('Please set items for at least one day', 'error');
        return;
    }

    const userId = auth.currentUser.uid;
    const smartRef = ref(database, `users/${userId}/smartChecklists/${currentEditingSmartId}`);
    update(smartRef, {
        title,
        items,
        updatedAt: new Date().toISOString()
    });

    document.getElementById('smart-checklist-modal').style.display = 'none';
    currentEditingSmartId = null;

    const saveBtn = document.getElementById('save-smart-checklist');
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Smart Checklist';
    saveBtn.onclick = saveNewSmartChecklist;

    showNotification('Smart checklist updated!', 'success');
}

// Delete smart checklist
function deleteSmartChecklist(id) {
    if (confirm('Are you sure you want to delete this smart checklist?')) {
        const userId = auth.currentUser.uid;
        const smartRef = ref(database, `users/${userId}/smartChecklists/${id}`);
        remove(smartRef);
        cleanupShareTokens(userId, id);
        showNotification('Smart checklist deleted!', 'success');
    }
}

// Display smart checklists on the dashboard
function displaySmartChecklists(smartChecklists) {
    const list = document.getElementById('smart-checklists-list');
    const section = document.getElementById('smart-checklists-section');
    list.innerHTML = '';

    if (!smartChecklists || Object.keys(smartChecklists).length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    const today = getTodayName();
    const todayLabel = DAY_LABELS[DAYS_OF_WEEK.indexOf(today)];

    Object.keys(smartChecklists).forEach(key => {
        const sc = smartChecklists[key];
        const todayItems = (sc.items || []).filter(i => i.day === today);
        const todayCount = todayItems.length;
        const checkedCount = todayItems.filter(i => i.checked).length;

        const el = document.createElement('div');
        el.className = 'note-item smart-note-item';
        el.innerHTML = `
            <div class="note-title">
                <span class="note-title-text">
                    ${sc.title}
                    <span class="smart-badge"><i class="fas fa-calendar-week"></i> Smart</span>
                    ${todayCount > 0 ? `<span class="smart-today-badge"><i class="fas fa-clock"></i> ${todayLabel}</span>` : ''}
                </span>
                <div class="note-actions">
                    <button class="action-btn view-btn" data-id="${key}" data-type="smartChecklist">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="action-btn edit-smart" data-id="${key}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="action-btn delete-smart" data-id="${key}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                    <button class="action-btn share-btn share-smart" data-id="${key}">
                        <i class="fas fa-share-alt"></i> Share
                    </button>
                </div>
            </div>
            ${todayCount > 0 ? `<div class="smart-today-count"><i class="fas fa-list-check"></i> ${checkedCount}/${todayCount} items for today</div>` : '<div class="smart-today-count" style="color:#999;"><i class="fas fa-moon"></i> No items scheduled for today</div>'}
        `;
        list.appendChild(el);

        // View button
        el.querySelector('.view-btn').addEventListener('click', () => {
            localStorage.setItem('viewItemId', key);
            localStorage.setItem('viewItemType', 'smartChecklist');
            window.location.href = 'view.html';
        });

        // Edit button
        el.querySelector('.edit-smart').addEventListener('click', () => {
            editSmartChecklist(key, smartChecklists[key]);
        });

        // Delete button
        el.querySelector('.delete-smart').addEventListener('click', () => {
            deleteSmartChecklist(key);
        });

        // Share button
        el.querySelector('.share-smart').addEventListener('click', () => {
            shareItem('smartChecklist', key, smartChecklists[key]);
        });
    });
}

// Auto-reset smart checklists daily
function autoResetSmartChecklists(userId, smartChecklists) {
    if (!smartChecklists) return;
    const todayStr = getTodayDateString();

    Object.keys(smartChecklists).forEach(key => {
        const sc = smartChecklists[key];
        if (sc.lastResetDate !== todayStr) {
            // New day — uncheck all items
            const resetItems = (sc.items || []).map(item => ({
                text: item.text,
                day: item.day,
                time: item.time || '00:00',
                checked: false
            }));
            const scRef = ref(database, `users/${userId}/smartChecklists/${key}`);
            update(scRef, {
                items: resetItems,
                lastResetDate: todayStr
            });
        }
    });
}
