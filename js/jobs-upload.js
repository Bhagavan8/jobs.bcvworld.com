
import {  collection, addDoc, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db, storage, auth, ref, uploadBytes, getDownloadURL } from './firebase-config.js';

/// Move console.log inside DOMContentLoaded to ensure it runs after imports are resolved
document.addEventListener('DOMContentLoaded', () => {
    // Add download template event listener
    document.getElementById('downloadTemplate').addEventListener('click', (e) => {
        e.preventDefault();

        try {
            // Update the headers object
            const headers = {
                jobTitle: "Job Title",
                jobCategory: "Job Category",
                jobType: "Job Type",
                employmentType: "Employment Type",
                experience: "Experience",
                educationLevel: "Education Level",
                skills: "Skills",
                description: "Job Description",
                qualifications: "Desired Qualifications",
                applicationMethod: "Application Method",
                applicationLink: "Application Link",
                location: "Location",
                noticePeriod: "Notice Period",
                salary: "Salary",
                lastDate: "Last Date to Apply",
                companyName: "Company Name",
                companyWebsite: "Company Website",
                aboutCompany: "About Company",
                companyLogo: "Company Logo URL (Optional)",
                referralCode: "Referral Code"
            };

            const headerRow = {};
            const headerKeys = Object.keys(headers);
            headerKeys.forEach(key => {
                headerRow[key] = headers[key];
            });

            const ws = XLSX.utils.json_to_sheet([headerRow], {
                header: headerKeys,
                skipHeader: true
            });

            ws['!cols'] = headerKeys.map(key => ({
                wch: Math.max(headers[key].length, 20)
            }));

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Jobs Template');
            XLSX.writeFile(wb, 'jobs_upload_template.xlsx');
        } catch (err) {
            console.error("Error during template creation:", err);
            showAlert('Error creating template: ' + err.message, 'danger');
        }
    });

    // Rest of your existing DOMContentLoaded code
    setupFileUpload();
});

// Add this function at the top of your file, before the DOMContentLoaded event
function showAlert(message, type = 'success') {
    const alertContainer = document.querySelector('.alert-container');
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
${message}
<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
`;
    alertContainer.appendChild(alertDiv);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => alertDiv.remove(), 150);
    }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
    setupFileUpload();
});

function getIndianTimestamp() {
    const now = new Date();
    const indiaTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    return indiaTime.toISOString();
}

// Field validation function
function validateField(field) {
    const value = field.value.trim();
    field.classList.remove('is-invalid', 'is-valid');

    if (field.hasAttribute('required')) {
        if (!value) {
            field.classList.add('is-invalid');
            return false;
        }

        // Special validation for specific fields
        if (field.id === 'applicationLink') {
            const method = document.getElementById('applicationMethod').value;
            if (method === 'email' && !value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                field.classList.add('is-invalid');
                return false;
            }
            if (method === 'link' && !value.match(/^https?:\/\/.+/)) {
                field.classList.add('is-invalid');
                return false;
            }
        }

        field.classList.add('is-valid');
        return true;
    }

    return true;
}

// Section validation function
function validateSection(sectionId) {
    const section = document.getElementById(sectionId);
    let isValid = true;

    // Get all required fields in this section
    const requiredFields = section.querySelectorAll('[required]');

    requiredFields.forEach(field => {
        if (!validateField(field)) {
            isValid = false;
            // Focus on first invalid field
            if (isValid === false) {
                field.focus();
                // Add a small delay to ensure scroll happens after field is focused
                setTimeout(() => {
                    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    });

    // Special validation for step 2 (company info)
    if (sectionId === 'step2') {
        const useExisting = document.getElementById('useExistingCompany').checked;
        const companyId = document.getElementById('companyId').value;

        if (useExisting && !companyId) {
            showAlert('Please search and select an existing company', 'warning');
            isValid = false;
        }

        if (!useExisting) {
            const companyName = document.getElementById('companyName');
            if (!companyName.value.trim()) {
                companyName.classList.add('is-invalid');
                companyName.focus();
                showAlert('Company Name is required when creating new company', 'warning');
                isValid = false;
            }
        }
    }

    if (!isValid) {
        showAlert('Please fill in all required fields correctly', 'warning');
    }

    return isValid;
}

// Initialize the form
document.addEventListener('DOMContentLoaded', function () {
    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(tooltipTriggerEl => {
        return new bootstrap.Tooltip(tooltipTriggerEl, {
            html: true,
            delay: { show: 100, hide: 100 }
        });
    });

    // Handle section navigation
    document.querySelectorAll('.next-step').forEach(button => {
        button.addEventListener('click', function (e) {
            e.preventDefault();
            const currentStep = this.closest('.form-step');
            const nextStepId = this.dataset.next;

            // Validate current section before proceeding
            if (validateSection(currentStep.id)) {
                // Hide current step and show next step
                document.querySelectorAll('.form-step').forEach(step => {
                    step.classList.remove('active');
                });
                document.getElementById(nextStepId).classList.add('active');
                window.scrollTo(0, 0);
            }
        });
    });

    // Previous button functionality
    document.querySelectorAll('.prev-step').forEach(button => {
        button.addEventListener('click', function (e) {
            e.preventDefault();
            const prevStepId = this.dataset.prev;

            document.querySelectorAll('.form-step').forEach(step => {
                step.classList.remove('active');
            });
            document.getElementById(prevStepId).classList.add('active');
            window.scrollTo(0, 0);
        });
    });

    // Real-time validation for fields
    document.querySelectorAll('input, select, textarea').forEach(field => {
        field.addEventListener('input', function () {
            validateField(this);
        });

        // Initial validation state
        validateField(field);
    });

    // Handle company search
    document.getElementById('searchCompanyBtn').addEventListener('click', async () => {
        const companyName = document.getElementById('companyName').value.trim();
        if (!companyName) {
            showAlert('Please enter a company name to search', 'warning');
            return;
        }

        try {
            const companiesRef = collection(db, 'companies');
            const companyQuery = query(companiesRef, where('name', '==', companyName));
            const companySnapshot = await getDocs(companyQuery);

            if (companySnapshot.empty) {
                showAlert('No matching company found. You can create a new company.', 'warning');
                document.getElementById('useExistingCompany').checked = false;
                document.getElementById('companyFormFields').style.display = 'block';
                return;
            }

            const companyData = companySnapshot.docs[0].data();
            const companyId = companySnapshot.docs[0].id;

            // Populate form fields
            document.getElementById('companyId').value = companyId;
            document.getElementById('companyName').value = companyData.name;
            document.getElementById('companyWebsite').value = companyData.website || '';
            document.getElementById('aboutCompany').value = companyData.about || '';

            // Show logo preview if exists
            const logoPreview = document.getElementById('logoPreview');
            if (companyData.logoURL) {
                logoPreview.src = companyData.logoURL;
                logoPreview.style.display = 'block';
            }

            // Enable existing company mode
            document.getElementById('useExistingCompany').checked = true;
            document.getElementById('companyFormFields').style.display = 'none';

            showAlert('Company details loaded successfully', 'success');
        } catch (error) {
            console.error('Error searching company:', error);
            showAlert('Error searching company: ' + error.message, 'danger');
        }
    });

    // Toggle company form fields
    document.getElementById('useExistingCompany').addEventListener('change', function () {
        const fields = document.getElementById('companyFormFields');
        fields.style.display = this.checked ? 'none' : 'block';
        if (!this.checked) {
            document.getElementById('companyId').value = '';
        }
    });

    // Preview logo image
    document.getElementById('companyLogo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            const preview = document.getElementById('logoPreview');

            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    // Handle form submission
    document.getElementById('uploadJobForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        e.stopPropagation();

        // Validate all sections before submission
        for (const step of ['step1', 'step2', 'step3', 'step4']) {
            if (!validateSection(step)) {
                document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
                document.getElementById(step).classList.add('active');
                return;
            }
        }

        try {
            const user = auth.currentUser;
            if (!user) {
                throw new Error('User not authenticated');
            }

            // Show loading state
            const submitButton = document.getElementById('submitBtn');
            const loadingSpinner = submitButton.querySelector('.spinner-border');
            submitButton.disabled = true;
            loadingSpinner.classList.remove('d-none');

            let companyId = document.getElementById('companyId').value;
            const useExisting = document.getElementById('useExistingCompany').checked;

            if (!useExisting) {
                // Create new company
                const companyName = document.getElementById('companyName').value;
                const logoFile = document.getElementById('companyLogo').files[0];
                let logoURL = '';

                if (logoFile) {
                    const fileName = `companies/${companyName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${logoFile.name}`;
                    const storageRef = ref(storage, fileName);
                    await uploadBytes(storageRef, logoFile, {
                        contentType: logoFile.type
                    });
                    logoURL = await getDownloadURL(storageRef);
                }

                const companyData = {
                    name: companyName,
                    website: document.getElementById('companyWebsite').value,
                    about: document.getElementById('aboutCompany').value,
                    logoURL: logoURL,
                    createdAt: getIndianTimestamp(),
                    updatedAt: getIndianTimestamp()
                };

                const companiesRef = collection(db, 'companies');
                const newCompanyRef = await addDoc(companiesRef, companyData);
                companyId = newCompanyRef.id;
            }

            // Prepare job data
            const jobData = {
                jobTitle: document.getElementById('jobTitle').value,
                jobCategory: document.getElementById('jobCategory').value,
                jobType: document.getElementById('jobType').value,
                employmentType: document.getElementById('employmentType').value,
                experience: document.getElementById('experience').value,
                location: document.getElementById('location').value.trim() || "India",
                educationLevel: document.getElementById('educationLevel').value,
                noticePeriod: document.getElementById('noticePeriod').value || null,
                skills: document.getElementById('skills').value.split(',').map(skill => skill.trim()),
                description: document.getElementById('description').value,
                qualifications: document.getElementById('qualifications').value.split('\n').filter(qual => qual.trim()),
                salary: document.getElementById('salary').value || null,
                lastDate: document.getElementById('lastDate').value || null,
                companyId: companyId,
                applicationMethod: document.getElementById('applicationMethod').value,
                applicationLink: document.getElementById('applicationLink').value,
                status: document.getElementById('status').value,
                isActive: document.getElementById('isActive').value === 'true',
                referralCode: document.getElementById('referralCode').value,
                postedBy: user.uid,
                createdAt: getIndianTimestamp(),
                updatedAt: getIndianTimestamp(),
                views: 0
            };

            // Add job to Firestore
            const jobsCollection = collection(db, 'jobs');
            await addDoc(jobsCollection, jobData);

            // Show success message and reset form
            showAlert('Job posted successfully!', 'success');
            this.reset();
            location.reload();
            document.getElementById('logoPreview').style.display = 'none';
            document.getElementById('companyId').value = '';
            document.getElementById('useExistingCompany').checked = false;
            document.getElementById('companyFormFields').style.display = 'block';

            // Reset to first step
            document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
            document.getElementById('step1').classList.add('active');

        } catch (error) {
            console.error('Error posting job:', error);
            showAlert(error.message, 'danger');
        } finally {
            // Reset button state
            const submitButton = document.getElementById('submitBtn');
            const loadingSpinner = submitButton.querySelector('.spinner-border');
            submitButton.disabled = false;
            loadingSpinner.classList.add('d-none');
        }
    });

});




// Define mandatory fields for validation
const mandatoryFields = {
    jobTitle: "Job Title",
    jobCategory: "Job Category",
    employmentType: "Employment Type",
    experience: "Experience",
    educationLevel: "Education Level",
    skills: "Skills",
    description: "Job Description",
    qualifications: "Desired Qualifications",
    applicationMethod: "Application Method",
    applicationLink: "Application Link",
    companyName: "Company Name"
};



function setupFileUpload() {
    const excelFileInput = document.getElementById('excelFile');
    const uploadExcelBtn = document.getElementById('uploadExcelBtn');
    const uploadDropzone = document.getElementById('uploadDropzone');

    // Click handler for select file button
    document.getElementById('selectFileBtn').addEventListener('click', () => {
        excelFileInput.click();
    });

    // Handle file selection
    excelFileInput.addEventListener('change', handleFileSelect);

    // Drag and drop functionality
    uploadDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadDropzone.classList.add('active');
    });

    uploadDropzone.addEventListener('dragleave', () => {
        uploadDropzone.classList.remove('active');
    });

    uploadDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadDropzone.classList.remove('active');

        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.match(/\.(xlsx|xls)$/i)) {
                excelFileInput.files = e.dataTransfer.files;
                handleFileSelect({ target: excelFileInput });
            } else {
                showAlert('Please select an Excel file (.xlsx or .xls)', 'warning');
            }
        }
    });

    // Upload button click handler
    uploadExcelBtn.addEventListener('click', handleExcelUpload);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    const fileNameDiv = document.getElementById('fileName');

    if (file) {
        // Check file type
        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            showAlert('Please select an Excel file (.xlsx or .xls)', 'warning');
            return;
        }

        // Check file size (5MB limit)
        if (file.size > 5 * 1024 * 1024) {
            showAlert('File size must be less than 5MB', 'warning');
            return;
        }

        // Update UI
        fileNameDiv.textContent = file.name;
        document.getElementById('uploadExcelBtn').disabled = false;
    } else {
        fileNameDiv.textContent = '';
        document.getElementById('uploadExcelBtn').disabled = true;
    }
}


async function handleExcelUpload() {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput.files[0];

    if (!file) {
        showAlert('Please select an Excel file first', 'warning');
        return;
    }

    try {
        const progressBar = document.getElementById('uploadProgress');
        progressBar.classList.remove('d-none');
        const progressBarInner = progressBar.querySelector('.progress-bar');
        progressBarInner.style.width = '0%';

        const uploadBtn = document.getElementById('uploadExcelBtn');
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';

        const jobs = await readExcelFile(file);
        validateJobs(jobs);

        const results = await uploadJobsToFirebase(jobs, (progress) => {
            progressBarInner.style.width = `${progress}%`;
        });

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        showAlert(`Upload complete: ${successful} jobs uploaded successfully, ${failed} failed.`, failed > 0 ? 'warning' : 'success');

        if (failed > 0) {
            console.error('Failed uploads:', results.filter(r => !r.success));
        }

        // Reset the form
        fileInput.value = '';
        document.getElementById('fileName').textContent = '';
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="bi bi-upload me-1"></i> Upload';
        progressBar.classList.add('d-none');
        progressBarInner.style.width = '0%';

    } catch (error) {
        console.error('Upload error:', error);
        showAlert(error.message, 'danger');
        const uploadBtn = document.getElementById('uploadExcelBtn');
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="bi bi-upload me-1"></i> Upload';
    }
}

async function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Convert to JSON with header transformation
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                    raw: false, // Get formatted strings
                    defval: '', // Default value for empty cells
                    header: Object.keys(mandatoryFields).concat(
                        ['jobType', 'location', 'noticePeriod', 'salary', 'lastDate',
                            'companyWebsite', 'aboutCompany', 'companyLogo', 'referralCode']
                    ),
                    range: 1 // Skip header row
                });

                resolve(jsonData);
            } catch (error) {
                reject(new Error('Invalid Excel format. Please use the provided template.'));
            }
        };

        reader.onerror = () => reject(new Error('Error reading file'));
        reader.readAsArrayBuffer(file);
    });
}

function validateJobs(jobs) {
    if (!Array.isArray(jobs)) {
        throw new Error('Invalid Excel format. No data found.');
    }

    if (jobs.length === 0) {
        throw new Error('Excel file contains no job data.');
    }

    // Validate each job
    jobs.forEach((job, index) => {
        const rowNumber = index + 2; // +1 for header, +1 for 0-based index

        // Check required fields
        const missingFields = Object.keys(mandatoryFields)
            .filter(field => !job[field] || job[field].toString().trim() === '');

        if (missingFields.length > 0) {
            throw new Error(`Missing required fields (${missingFields.join(', ')}) in row ${rowNumber}`);
        }

        // Validate application method
        const validMethods = ['link', 'email', 'form'];
        if (!validMethods.includes(job.applicationMethod.toLowerCase())) {
            throw new Error(`Invalid application method in row ${rowNumber}. Must be one of: ${validMethods.join(', ')}`);
        }

        // Validate email format if application method is email
        if (job.applicationMethod.toLowerCase() === 'email' &&
            !job.applicationLink.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            throw new Error(`Invalid email address in row ${rowNumber}`);
        }

        // Validate URL format if application method is link
        if (job.applicationMethod.toLowerCase() === 'link' &&
            !job.applicationLink.match(/^https?:\/\/.+/)) {
            throw new Error(`Invalid URL in row ${rowNumber}. Must start with http:// or https://`);
        }
    });
}

async function uploadJobsToFirebase(jobs, progressCallback) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error('User not authenticated');
    }

    const results = {
        successCount: 0,
        errorCount: 0,
        errors: []
    };

    const totalJobs = jobs.length;
    const companiesRef = collection(db, 'companies');
    const jobsRef = collection(db, 'jobs');

    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];

        try {
            // Handle company
            let companyId = await handleCompanyFromExcel(job);

            // Prepare and upload job
            await uploadJobFromExcel(job, companyId, user.uid, jobsRef);
            results.successCount++;
        } catch (error) {
            console.error(`Error uploading job ${i + 1}:`, error);
            results.errorCount++;
            results.errors.push({
                row: i + 2,
                error: error.message
            });
        }

        // Update progress
        const progress = Math.round(((i + 1) / totalJobs) * 100);
        progressCallback(progress);
    }

    return results;
}

async function handleCompanyFromExcel(job) {
    if (!job.companyName) return null;

    const companiesRef = collection(db, 'companies');
    const companyQuery = query(companiesRef, where('name', '==', job.companyName));
    const companySnapshot = await getDocs(companyQuery);

    let logoUrl = '';
    if (job.companyLogo) {
        try {
            new URL(job.companyLogo); // Validate URL
            logoUrl = job.companyLogo;
        } catch (e) {
            console.warn(`Invalid logo URL for ${job.companyName}: ${job.companyLogo}`);
        }
    }

    if (!companySnapshot.empty) {
        const companyId = companySnapshot.docs[0].id;
        if (logoUrl) {
            await updateDoc(doc(companiesRef, companyId), {
                logoURL: logoUrl,
                updatedAt: getIndianTimestamp()
            });
        }
        return companyId;
    }

    // Create new company
    const companyData = {
        name: job.companyName,
        website: job.companyWebsite || '',
        about: job.aboutCompany || '',
        logoURL: logoUrl,
        createdAt: getIndianTimestamp(),
        updatedAt: getIndianTimestamp()
    };

    const newCompanyRef = await addDoc(companiesRef, companyData);
    return newCompanyRef.id;
}

async function uploadJobFromExcel(job, companyId, userId, jobsRef) {
    const jobData = {
        jobTitle: job.jobTitle,
        jobCategory: job.jobCategory,
        jobType: job.jobType || 'private',
        employmentType: job.employmentType,
        experience: job.experience,
        location: job.location || 'India',
        educationLevel: job.educationLevel,
        noticePeriod: job.noticePeriod || null,
        skills: job.skills.split(',').map(skill => skill.trim()),
        description: job.description,
        qualifications: job.qualifications.split('\n').filter(qual => qual.trim()),
        salary: job.salary || null,
        lastDate: job.lastDate || null,
        companyId: companyId,
        applicationMethod: job.applicationMethod,
        applicationLink: job.applicationLink,
        status: job.status || 'public',
        isActive: job.isActive !== undefined ? job.isActive : true,
        postedBy: userId,
        referralCode: job.referralCode || '',
        createdAt: getIndianTimestamp(),
        updatedAt: getIndianTimestamp(),
        views: 0
    };

    await addDoc(jobsRef, jobData);
}