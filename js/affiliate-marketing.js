import { auth, db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    }
});

const affiliateForm = document.getElementById('affiliateForm');
const addAffiliateLinkBtn = document.getElementById('addAffiliateLink');
const addProductImageBtn = document.getElementById('addProductImage');
const affiliateLinksContainer = document.getElementById('affiliateLinksContainer');
const productImagesContainer = document.getElementById('productImagesContainer');

// Add affiliate link
addAffiliateLinkBtn.addEventListener('click', () => {
    const linkDiv = document.createElement('div');
    linkDiv.className = 'affiliate-link mb-3';
    linkDiv.innerHTML = `
        <div class="row">
            <div class="col-md-5">
                <input type="text" class="form-control platform-name" placeholder="Platform Name" required>
            </div>
            <div class="col-md-6">
                <input type="url" class="form-control affiliate-url" placeholder="Affiliate Link" required>
            </div>
            <div class="col-md-1">
                <button type="button" class="btn btn-danger btn-sm remove-link">×</button>
            </div>
        </div>
    `;
    affiliateLinksContainer.appendChild(linkDiv);

    linkDiv.querySelector('.remove-link').addEventListener('click', () => linkDiv.remove());
});

// Add product image
addProductImageBtn.addEventListener('click', () => {
    const imageDiv = document.createElement('div');
    imageDiv.className = 'product-image mb-3';
    imageDiv.innerHTML = `
        <div class="row">
            <div class="col-md-11">
                <input type="url" class="form-control image-url" placeholder="Image URL" required>
            </div>
            <div class="col-md-1">
                <button type="button" class="btn btn-danger btn-sm remove-image">×</button>
            </div>
        </div>
    `;
    productImagesContainer.appendChild(imageDiv);

    imageDiv.querySelector('.remove-image').addEventListener('click', () => imageDiv.remove());
});

affiliateForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const user = auth.currentUser;

        // Collect affiliate links
        const affiliateLinks = [];
        document.querySelectorAll('.affiliate-link').forEach(link => {
            affiliateLinks.push({
                platform: link.querySelector('.platform-name').value,
                url: link.querySelector('.affiliate-url').value
            });
        });

        // Collect product images
        const productImages = Array.from(
            document.querySelectorAll('.image-url')
        ).map(input => input.value);

        const affiliateData = {
            productTitle: document.getElementById('productTitle').value,
            category: document.getElementById('productCategory').value,
            description: document.getElementById('productDescription').value,
            originalPrice: parseFloat(document.getElementById('originalPrice').value),
            discountPrice: parseFloat(document.getElementById('discountPrice').value),
            affiliateLinks: affiliateLinks,
            productImages: productImages,
            highlights: document.getElementById('highlights').value.split('\n').filter(h => h.trim()),
            couponCode: document.getElementById('couponCode').value || null,
            expiryDate: document.getElementById('expiryDate').value || null,
            postedBy: user.uid,
            postedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            status: 'active',
            clicks: 0
        };

        await addDoc(collection(db, 'affiliateProducts'), affiliateData);
        alert('Affiliate product posted successfully!');
        affiliateForm.reset();
        
        // Reset containers to initial state
        affiliateLinksContainer.innerHTML = `
            <div class="affiliate-link mb-3">
                <div class="row">
                    <div class="col-md-5">
                        <input type="text" class="form-control platform-name" placeholder="Platform Name" required>
                    </div>
                    <div class="col-md-7">
                        <input type="url" class="form-control affiliate-url" placeholder="Affiliate Link" required>
                    </div>
                </div>
            </div>
        `;
        
        productImagesContainer.innerHTML = `
            <div class="product-image mb-3">
                <input type="url" class="form-control image-url" placeholder="Image URL" required>
            </div>
        `;

    } catch (error) {
        console.error('Error posting affiliate product:', error);
        alert('Error: ' + error.message);
    }
});