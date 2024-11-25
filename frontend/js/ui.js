import { state, updateCompletedSections } from './state.js';
import { getTooltipContent } from './utils.js';

export function initializeUI() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');
    const photoBtn = document.getElementById('photoBtn');
    const generateBtn = document.getElementById('generateBtn');
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    updateProgressItems();
    
    // Add this line at the end:
addMessageToChat('bot', 'Welcome to intake! 🩺 Go ahead and describe your condition and we will walk you through the rest of the information collection. 📋');
}

export function updateProgressItems() {
    const progressList = document.getElementById('progressList');
    progressList.innerHTML = ''; // Clear existing items
    
    const progressItems = [
        { id: 'symptoms-current', text: 'Past week symptoms' },
        { id: 'symptoms-blood-sugar', text: 'Blood sugar levels' },
        { id: 'symptoms-medications', text: 'Medications' },
        { id: 'symptoms-problems', text: 'Medication issues' },
        { id: 'lifestyle-diet', text: 'Diet' },
        { id: 'lifestyle-activity', text: 'Physical activity' },
        { id: 'lifestyle-mental', text: 'Mental health' },
        { id: 'lifestyle-cognitive', text: 'Cognitive function' },
        { id: 'additional-conditions', text: 'Other conditions' },
        { id: 'additional-healthcare', text: 'Healthcare providers' },
        { id: 'additional-concerns', text: 'Additional concerns' }
    ];
    
    progressItems.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.id = `${item.id}-item`;
        itemElement.className = 'progress-item';
        const isCompleted = state.completedSections.has(item.id);
        if (isCompleted) {
            itemElement.classList.add('completed');
        }
        itemElement.innerHTML = `
            <div class="icon">${isCompleted ? '✓' : '○'}</div>
            <div class="text">${item.text}</div>
        `;
        itemElement.setAttribute('data-tooltip', getTooltipContent(item.id.split('-')[0], item.id.split('-')[1]));
        progressList.appendChild(itemElement);
    });
}


export function updateCompletionStatus(completedSections) {
    console.log("Updating completion status with:", completedSections);

    if (!Array.isArray(completedSections) || completedSections.length === 0) {
        console.log('No sections completed or invalid data');
        return;
    }

    completedSections.forEach(section => {
        console.log(`Checking section: ${section}`);
        const itemElement = document.getElementById(`${section}-item`);
        if (itemElement) {
            console.log(`Updating element: ${section}-item`);
            itemElement.classList.add('completed');
            itemElement.querySelector('.icon').textContent = '✓';
            updateTooltip(section);
        } else {
            console.warn(`Element not found: ${section}-item`);
        }
    });

    // Update the state
    updateCompletedSections(completedSections);

    // Refresh the progress items
    updateProgressItems();
}

export function updateTooltips() {
    const progressItems = document.querySelectorAll('.progress-item');
    progressItems.forEach(item => {
        const [category, subcategory] = item.id.replace('-item', '').split('-');
        const content = getTooltipContent(category, subcategory);
        item.setAttribute('data-tooltip', content);
    });
}

export function updateTooltip(section) {
    const itemElement = document.getElementById(`${section}-item`);
    if (!itemElement) return;

    const [category, subcategory] = section.split('-');
    const content = getTooltipContent(category, subcategory);
    itemElement.setAttribute('data-tooltip', content);
}

export function addMessageToChat(type, content) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}-message`;
    messageDiv.innerHTML = content;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function toggleLoadingSpinner(show) {
    document.getElementById('loadingSpinner').classList.toggle('hidden', !show);
}

export async function handleTabChange(tabName) {
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

export function initializeSummaryTab() {
    const qaSubmitBtn = document.getElementById('qaSubmit');
    const qaInput = document.getElementById('qaInput');

    qaSubmitBtn.addEventListener('click', handleQASubmit);
    qaInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleQASubmit();
        }
    });
}

async function loadDoctorSummary() {
    toggleLoadingSpinner(true);
    
    try {
        const response = await callCloudFunction('doctorSummaryAndQA', { 
            action: 'summary',
            currentRecord: state.currentRecord 
        });
        document.getElementById('doctorSummaryContent').innerHTML = response.summary;
    } catch (error) {
        console.error('Error loading doctor summary:', error);
        document.getElementById('doctorSummaryContent').innerHTML = 'Error loading summary. Please try again.';
    }
    toggleLoadingSpinner(false);
}

// This function would need to be implemented based on your specific requirements
function setupSummaryTabListeners() {
    // Add event listeners for any interactive elements in the summary tab
}

// You might need to import this function from api.js
import { callCloudFunction } from './api.js';