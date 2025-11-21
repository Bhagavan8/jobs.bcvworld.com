// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD9XVaB4VMsipGQ4fQ45TX7PxbM3Du5_XE",
    authDomain: "bcvworld-cc40e.firebaseapp.com",
    projectId: "bcvworld-cc40e",
    storageBucket: "bcvworld-cc40e.appspot.com",
    messagingSenderId: "1083295808227",
    appId: "1:1083295808227:web:8070d080beb7e9a819a3d6",
    measurementId: "G-FVTSKKNJBH"
};

firebase.initializeApp(firebaseConfig);

// Get references to Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();