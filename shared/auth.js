// ── SHARED AUTH — Common Print Co. Storefront ─────────────────────────────
// Firebase Auth helpers for storefront pages

import { initializeApp }           from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged,
         signInWithEmailAndPassword,
         createUserWithEmailAndPassword,
         signOut, updatePassword,
         signInWithEmailAndPassword as reauth }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ── INIT ──────────────────────────────────────────────────────────────────
let _app, _auth;

export async function initAuth(workerUrl) {
  // Fetch Firebase config from worker
  const res = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get_config' })
  });
  const config = await res.json();
  _app  = initializeApp(config, 'storefront');
  _auth = getAuth(_app);
  window._sfAuth = _auth;
  return { app: _app, auth: _auth, config };
}

export function getFirebaseAuth() {
  return _auth;
}

// ── SIGN IN ───────────────────────────────────────────────────────────────
export async function signIn(email, password) {
  return signInWithEmailAndPassword(_auth, email, password);
}

// ── REGISTER ─────────────────────────────────────────────────────────────
export async function register(email, password) {
  return createUserWithEmailAndPassword(_auth, email, password);
}

// ── SIGN OUT ──────────────────────────────────────────────────────────────
export async function signOutUser() {
  return signOut(_auth);
}

// ── CHANGE PASSWORD ───────────────────────────────────────────────────────
export async function changePassword(currentPassword, newPassword) {
  const user = _auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  await reauth(_auth, user.email, currentPassword);
  await updatePassword(user, newPassword);
}

// ── AUTH GUARD ────────────────────────────────────────────────────────────
// Call on pages that require authentication
// redirectUrl = where to send unauthenticated users
export function requireAuth(redirectUrl = '../index.html') {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(_auth || getAuth(), (user) => {
      unsubscribe();
      if (!user) {
        window.location.href = redirectUrl;
      } else {
        resolve(user);
      }
    });
  });
}

// Redirect authenticated users away from login page
export function redirectIfAuthed(redirectUrl = 'catalog.html') {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(_auth || getAuth(), (user) => {
      unsubscribe();
      if (user) {
        window.location.href = redirectUrl;
      } else {
        resolve(null);
      }
    });
  });
}

// ── FRIENDLY ERROR MESSAGES ───────────────────────────────────────────────
export function authError(code) {
  const map = {
    'auth/invalid-credential':    'Incorrect email or password.',
    'auth/user-not-found':        'No account found with that email.',
    'auth/wrong-password':        'Incorrect password.',
    'auth/email-already-in-use':  'An account with this email already exists.',
    'auth/weak-password':         'Password must be at least 8 characters.',
    'auth/too-many-requests':     'Too many attempts. Please try again later.',
    'auth/invalid-email':         'Please enter a valid email address.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}
