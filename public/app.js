// Global state management
const state = {
    currentTab: 'intake',
    completedSections: {
        symptoms: new Set(),
        lifestyle: new Set(),
        additional: new Set()
    },
    chatHistory: [],
    currentRecord: {},
    isRecording: false,
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeUI();
    setupEventListeners();
    updateProgressBars();
});

// UI Initialization
function initializeUI() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');
    const photoBtn = document.getElementById('photoBtn');
    const generateBtn = document.getElementById('generateBtn');
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    // Initialize tooltips for completion boxes
    // Note: Tooltips are now handled via CSS :hover using data-tooltip attribute
    // Initial tooltip values
    initializeTooltips();
}

// Event Listeners Setup
function setupEventListeners() {
    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', (e) => handleTabChange(e.target.dataset.tab));
    });

    // Chat Input Auto-resize
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('input', () => {
        autoResizeTextArea(chatInput);
    });

    // Send Message
    document.getElementById('sendBtn').addEventListener('click', handleMessageSend);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleMessageSend();
        }
    });

    // Voice Input
    document.getElementById('micBtn').addEventListener('click', toggleVoiceInput);

    // Photo Upload
    document.getElementById('photoBtn').addEventListener('click', () => {
        document.getElementById('imageInput').click();
    });
    document.getElementById('imageInput').addEventListener('change', handleImageUpload);

    // Generate Demo Answers
    document.getElementById('generateBtn').addEventListener('click', generateDemoAnswers);

    // Download PDF
    document.getElementById('downloadPdfBtn').addEventListener('click', downloadPatientRecord);
}

// Message Handling
async function handleMessageSend() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    if (!message) return;

    // Add user message to chat
    addMessageToChat('user', message);
    chatInput.value = '';
    autoResizeTextArea(chatInput);

    // Show loading state
    toggleLoadingSpinner(true);

    try {
        // Here's the fix - make sure we're sending the correct data structure
        const response = await callCloudFunction('processMessage', {
            userMessage: message,  // Must match what backend expects
            currentRecord: state.currentRecord || RECORD_SCHEMA,
            currentPrompt: state.currentPrompt
        });
        
        // Update completion status
        if (response.completedSections) {
            updateCompletionStatus(response.completedSections);
        }
        
        // Add bot response to chat
        if (response.message) {
            addMessageToChat('bot', response.message);
        }
    } catch (error) {
        console.error('Error processing message:', error);
        addMessageToChat('bot', 'Sorry, there was an error processing your message. Please try again.');
    }

    toggleLoadingSpinner(false);
}

// Voice Input Handling
function toggleVoiceInput() {
    const micBtn = document.getElementById('micBtn');
    
    if (!state.isRecording) {
        // Start recording
        if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
            alert('Speech recognition is not supported in your browser.');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.continuous = true;
        recognition.interimResults = true;
        
        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            
            document.getElementById('chatInput').value = transcript;
            autoResizeTextArea(document.getElementById('chatInput'));
        };

        recognition.start();
        state.recognition = recognition;
        state.isRecording = true;
        micBtn.classList.add('active');
    } else {
        // Stop recording
        state.recognition.stop();
        state.isRecording = false;
        micBtn.classList.remove('active');
    }
}

// Image Upload Handling
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    toggleLoadingSpinner(true);

    try {
        // Upload image and process medication info
        const response = await callCloudFunction('processMedicationImage', formData);
        
        // Add image preview to chat
        const imageMessage = `<img src="${URL.createObjectURL(file)}" alt="Medication Image">`;
        addMessageToChat('user', imageMessage);
        
        // Add extracted information
        addMessageToChat('bot', response.medicationInfo);
        
        // Update completion status
        updateCompletionStatus(response.completedSections);
    } catch (error) {
        console.error('Error processing image:', error);
        addMessageToChat('bot', 'Sorry, there was an error processing your image. Please try again.');
    }

    toggleLoadingSpinner(false);
}

// Demo Answer Generation
async function generateDemoAnswers() {
    toggleLoadingSpinner(true);

    try {
        const response = await callCloudFunction('generateDemoAnswers');
        
        // Process each demo answer
        for (const answer of response.answers) {
            addMessageToChat('user', answer.question);
            addMessageToChat('bot', answer.response);
            await new Promise(resolve => setTimeout(resolve, 500)); // Add delay between messages
        }
        
        updateCompletionStatus(response.completedSections);
    } catch (error) {
        console.error('Error generating demo answers:', error);
        addMessageToChat('bot', 'Sorry, there was an error generating demo answers. Please try again.');
    }

    toggleLoadingSpinner(false);
}

// Tab Management
async function handleTabChange(tabName) {
    state.currentTab = tabName;
    
    // Update UI
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `${tabName}Tab`);
    });

    // Handle tab-specific content loading
    switch (tabName) {
        case 'summary':
            await loadDoctorSummary();
            break;
        case 'followup':
            await loadFollowUpContent();
            break;
    }
}

// Doctor Summary Tab
async function loadDoctorSummary() {
    toggleLoadingSpinner(true);

    try {
        const summary = await callCloudFunction('generateDoctorSummary');
        const summaryTab = document.getElementById('summaryTab');
        summaryTab.innerHTML = summary.html;
        
        // Setup event listeners for summary tab interactions
        setupSummaryTabListeners();
    } catch (error) {
        console.error('Error loading doctor summary:', error);
    }

    toggleLoadingSpinner(false);
}

// Follow-up Tab
async function loadFollowUpContent() {
    toggleLoadingSpinner(true);

    try {
        const followup = await callCloudFunction('generateFollowUp');
        const followupTab = document.getElementById('followupTab');
        followupTab.innerHTML = followup.html;
    } catch (error) {
        console.error('Error loading follow-up content:', error);
    }

    toggleLoadingSpinner(false);
}

// Progress Tracking
function updateProgressBars() {
    const sections = ['symptoms', 'lifestyle', 'additional'];
    
    sections.forEach(section => {
        const completed = state.completedSections[section].size;
        const total = document.querySelectorAll(`#${section}-progress`).length;
        const percentage = (completed / total) * 100;
        
        document.getElementById(`${section}-progress`).style.width = `${percentage}%`;
    });
}

// Tooltip Management
function initializeTooltips() {
    // Set initial tooltip text for each section
    const tooltipData = {
        'symptoms-current-box': 'Current symptoms and health status',
        'symptoms-blood-sugar-box': 'Blood sugar readings and patterns',
        'symptoms-medications-box': 'Current medications and dosage',
        'symptoms-problems-box': 'Medication-related issues or side effects',
        'lifestyle-diet-box': 'Diet and nutrition information',
        'lifestyle-activity-box': 'Physical activity and exercise habits',
        'lifestyle-mental-box': 'Mental health and stress management',
        'lifestyle-cognitive-box': 'Cognitive function and memory',
        'additional-conditions-box': 'Other medical conditions',
        'additional-healthcare-box': 'Healthcare provider information',
        'additional-concerns-box': 'Additional concerns or questions'
    };

    // Set initial tooltips
    Object.entries(tooltipData).forEach(([id, text]) => {
        const element = document.getElementById(id);
        if (element) {
            element.setAttribute('data-tooltip', text);
        }
    });
}

// Utility Functions
function autoResizeTextArea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

function toggleLoadingSpinner(show) {
    document.getElementById('loadingSpinner').classList.toggle('hidden', !show);
}

function addMessageToChat(type, content) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}-message`;
    messageDiv.innerHTML = content;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateTooltips(updates) {
    for (const [id, content] of Object.entries(updates)) {
        const box = document.getElementById(id);
        if (box) {
            box.dataset.tooltip = content;
        }
    }
}

function updateCompletionStatus(completedSections) {
    for (const section of completedSections) {
        const [category, item] = section.split('.');
        state.completedSections[category].add(item);
        
        // Update UI
        const box = document.getElementById(`${category}-${item}-box`);
        if (box) {
            box.classList.add('completed');
        }
    }
    
    updateProgressBars();
}

// Cloud Function Caller
async function callCloudFunction(functionName, data = {}) {
    const endpoints = {
        'processMessage': 'https://us-central1-gemini-med-lit-review.cloudfunctions.net/dha-processMessage',
        'generateDemoAnswers': 'https://us-central1-gemini-med-lit-review.cloudfunctions.net/dha-generateDemo',
        'generateDoctorSummary': 'https://us-central1-gemini-med-lit-review.cloudfunctions.net/dha-doctorSummary',
        'askQuestions': 'https://us-central1-gemini-med-lit-review.cloudfunctions.net/dha-askQuestions',
        'generateRecommendations': 'https://us-central1-gemini-med-lit-review.cloudfunctions.net/dha-generateRecommendations',
        'generateFollowUp': 'https://us-central1-gemini-med-lit-review.cloudfunctions.net/dha-generateFollowUp',
        'downloadPdf': 'https://us-central1-gemini-med-lit-review.cloudfunctions.net/dha-downloadPdf'
    };

    const endpoint = endpoints[functionName];
    if (!endpoint) {
        throw new Error(`Unknown function: ${functionName}`);
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error calling ${functionName}:`, error);
        throw error;
    }
}

// Export necessary functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        state,
        handleMessageSend,
        handleTabChange,
        updateCompletionStatus
    };
}