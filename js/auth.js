import { 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { auth, app, db } from './firebase-config.js';
import { setupRoleBasedMenu } from './index.js';

let isRedirecting = false; // Added declaration

// Login functionality
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Disable form while processing
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        try {
            // Sign in user
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Get user data from Firestore
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                // Store user role and data in localStorage
                localStorage.setItem('userRole', userData.role);
                localStorage.setItem('userData', JSON.stringify({
                    name: userData.name,
                    email: userData.email,
                    role: userData.role
                }));
                
                // Now redirect after setting the role
                window.location.href = 'index.html';
            } else {
                throw new Error('User document not found');
            }
        } catch (error) {
            console.error('Login error:', error);
            let errorMessage = 'Invalid email or password';
            if (error.code === 'auth/network-request-failed') {
                errorMessage = 'Network error. Please check your internet connection.';
            } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                errorMessage = 'Invalid email or password';
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage = 'Access temporarily disabled due to too many failed attempts. Please try again later.';
            }
            alert(errorMessage);
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// Signup functionality
const signupForm = document.getElementById('signupForm'); // Added 'const' declaration
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Disable form while processing
        const submitBtn = signupForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        
        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        try {
            // Create authentication user
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Create user document in Firestore
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, {
                uid: user.uid,
                name: name,
                email: email,
                createdAt: new Date().toISOString(),
                role: 'user',
                isActive: true
            });

            // Verify the document exists
            const docSnap = await getDoc(userRef);
            if (!docSnap.exists()) {
                throw new Error('Failed to create user document');
            }

            window.location.href = 'dashboard.html'; // Consistent path
        } catch (error) {
            console.error('Signup error:', error);
            let errorMessage = 'Failed to create account';
            if (error.code === 'auth/network-request-failed') {
                errorMessage = 'Network error. Please check your internet connection.';
            } else if (error.code === 'auth/email-already-in-use') {
                errorMessage = 'This email is already registered.';
            } else if (error.code === 'auth/weak-password') {
                errorMessage = 'Password should be at least 6 characters.';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Please enter a valid email address.';
            }
            alert(errorMessage);
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// Auth state change handler
onAuthStateChanged(auth, async (user) => {
    if (user && !isRedirecting) {
        isRedirecting = true;
        try {
            // Get user data from Firestore
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                // Store user role and data in localStorage
                localStorage.setItem('userRole', userData.role);
                localStorage.setItem('userData', JSON.stringify({
                    name: userData.name,
                    email: userData.email,
                    role: userData.role
                }));
                
                // Initialize menu visibility if on dashboard or other pages
                if (window.location.pathname.includes('dashboard') ||
                    window.location.pathname.includes('index')) {
                    setupRoleBasedMenu(userData.role);
                }
                
                // Redirect if on login/signup page
                if (window.location.pathname.includes('login') ||
                    window.location.pathname.includes('signup')) {
                    window.location.href = 'dashboard.html';
                }
            } else {
                console.error('User document not found');
                auth.signOut();
                localStorage.clear();
                window.location.href = 'login.html';
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            auth.signOut();
            localStorage.clear();
            window.location.href = 'login.html';
        }
    } else if (!user) {
        // Clear stored data when user is not authenticated
        localStorage.clear();
        
        // Redirect to login if not on login/signup page
        if (!window.location.pathname.includes('login') &&
            !window.location.pathname.includes('signup')) {
            window.location.href = 'login.html';
        }
    }
});


