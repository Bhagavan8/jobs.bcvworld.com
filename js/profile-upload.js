import { auth, db, storage } from './firebase-config.js';
import { 
    doc, 
    getDoc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// DOM Elements
const profileForm = document.getElementById('profileForm');
const imagePreview = document.getElementById('imagePreview');
const profileImageInput = document.getElementById('profileImage');

// Auth Check & Load Data
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    // Update User Name in Navbar
    const userNameEl = document.getElementById('userName');
    if (userNameEl) {
        userNameEl.textContent = user.displayName || user.email.split('@')[0];
    }

    // Load User Data
    try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            populateForm(data);
        } else {
            // New profile, maybe pre-fill email or name from auth
             const fullNameInput = document.getElementById('fullName');
             if(fullNameInput) fullNameInput.value = user.displayName || '';
        }
    } catch (error) {
        console.error("Error loading profile:", error);
        alert("Error loading profile data");
    }
});

function populateForm(data) {
    const fullName = data.fullName || (data.firstName ? (data.firstName + (data.lastName ? ' ' + data.lastName : '')) : '');
    if(document.getElementById('fullName')) document.getElementById('fullName').value = fullName;
    
    if(document.getElementById('briefIntro')) document.getElementById('briefIntro').value = data.briefIntro || '';
    if(document.getElementById('fullBio')) document.getElementById('fullBio').value = data.fullBio || '';
    if(document.getElementById('notableWorks')) document.getElementById('notableWorks').value = data.notableWorks || '';
    if(document.getElementById('skills')) document.getElementById('skills').value = data.skills || '';
    
    // Socials
    if (data.socialLinks) {
        if(document.getElementById('youtube')) document.getElementById('youtube').value = data.socialLinks.youtube || '';
        if(document.getElementById('instagram')) document.getElementById('instagram').value = data.socialLinks.instagram || '';
        if(document.getElementById('twitter')) document.getElementById('twitter').value = data.socialLinks.twitter || '';
    }
    
    if(document.getElementById('tags')) document.getElementById('tags').value = data.tags || '';
    if(document.getElementById('funFacts')) document.getElementById('funFacts').value = data.funFacts || '';

    // Image
    if (data.profileImageUrl && imagePreview) {
        imagePreview.src = data.profileImageUrl;
        imagePreview.style.display = 'block';
        
        // Add onerror handler
        imagePreview.onerror = function() {
            this.onerror = null;
            this.src = '/images/default.webp';
        };
    }
}

// Image Preview on Selection
if(profileImageInput) {
    profileImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && imagePreview) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });
}

// Form Submit
if(profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const user = auth.currentUser;
        if (!user) return;

        const submitBtn = profileForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.textContent;
        submitBtn.textContent = 'Saving...';
        submitBtn.disabled = true;

        try {
            let profileImageUrl = null;

            // Upload Image if selected
            const file = profileImageInput.files[0];
            if (file) {
                const storageRef = ref(storage, `profile_images/${user.uid}_${Date.now()}`);
                await uploadBytes(storageRef, file);
                profileImageUrl = await getDownloadURL(storageRef);
            }

            const fullName = document.getElementById('fullName').value.trim();
            const nameParts = fullName.split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ');

            const profileData = {
                firstName: firstName,
                lastName: lastName,
                fullName: fullName,
                briefIntro: document.getElementById('briefIntro').value,
                fullBio: document.getElementById('fullBio').value,
                notableWorks: document.getElementById('notableWorks').value,
                skills: document.getElementById('skills').value,
                socialLinks: {
                    youtube: document.getElementById('youtube').value,
                    instagram: document.getElementById('instagram').value,
                    twitter: document.getElementById('twitter').value
                },
                tags: document.getElementById('tags').value,
                funFacts: document.getElementById('funFacts').value,
                updatedAt: serverTimestamp()
            };

            if (profileImageUrl) {
                profileData.profileImageUrl = profileImageUrl;
            }

            await setDoc(doc(db, 'users', user.uid), profileData, { merge: true });
            
            alert('Profile updated successfully!');
            
        } catch (error) {
            console.error("Error saving profile:", error);
            alert("Failed to save profile: " + error.message);
        } finally {
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
        }
    });
}

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if(logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            window.location.href = 'login.html';
        });
    });
}
