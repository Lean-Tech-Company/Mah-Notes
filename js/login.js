// ============================================================
//  Login Page JS — Authentication logic
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ── Loader helpers ─────────────────────────────────────────
function showLoader(text = 'Loading...') {
    const loader = document.getElementById('loader');
    const loaderText = loader.querySelector('.loader-text');
    if (loaderText) loaderText.textContent = text;
    loader.classList.add('active');
}

function hideLoader() {
    document.getElementById('loader').classList.remove('active');
}

// Redirect already-logged-in users straight to the app
onAuthStateChanged(auth, (user) => {
    if (user) {
        showLoader('Signing in...');
        window.location.href = 'index.html';
    }
});

// Toggle between login and signup
document.getElementById('toggle-to-signup').addEventListener('click', (e) => {
    e.preventDefault();
    const form = document.getElementById('login-form');
    const submitButton = form.querySelector('button[type="submit"]');
    const toggleLink = document.getElementById('toggle-to-signup');
    const formTitle = document.querySelector('.logo');

    if (submitButton.textContent === 'Sign In') {
        submitButton.textContent = 'Sign Up';
        toggleLink.textContent = 'Sign in';
        formTitle.textContent = 'Sign Up - My Notes';
    } else {
        submitButton.textContent = 'Sign In';
        toggleLink.textContent = 'Sign up';
        formTitle.textContent = 'My Notes';
    }
});

// Handle form submission
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const isSignUp = document.querySelector('button[type="submit"]').textContent === 'Sign Up';
    const errorElement = document.getElementById('login-error');

    showLoader(isSignUp ? 'Creating account...' : 'Signing in...');

    if (isSignUp) {
        // Sign up
        createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                window.location.href = 'index.html';
            })
            .catch((error) => {
                hideLoader();
                errorElement.textContent = error.message;
            });
    } else {
        // Sign in
        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                window.location.href = 'index.html';
            })
            .catch((error) => {
                hideLoader();
                errorElement.textContent = error.message;
            });
    }
});

// Google sign in
document.getElementById('google-signin').addEventListener('click', () => {
    showLoader('Signing in with Google...');
    signInWithPopup(auth, provider)
        .then((result) => {
            window.location.href = 'index.html';
        })
        .catch((error) => {
            hideLoader();
            document.getElementById('login-error').textContent = error.message;
        });
});
