// ============================================================
//  Login Page JS — Authentication logic
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

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

    if (isSignUp) {
        // Sign up
        createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                window.location.href = 'index.html';
            })
            .catch((error) => {
                errorElement.textContent = error.message;
            });
    } else {
        // Sign in
        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                window.location.href = 'index.html';
            })
            .catch((error) => {
                errorElement.textContent = error.message;
            });
    }
});

// Google sign in
document.getElementById('google-signin').addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then((result) => {
            window.location.href = 'index.html';
        })
        .catch((error) => {
            document.getElementById('login-error').textContent = error.message;
        });
});
